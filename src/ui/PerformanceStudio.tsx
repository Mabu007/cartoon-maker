import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, Hand, PersonStanding, ShieldAlert, VideoOff, WandSparkles } from 'lucide-react';
import { compilePerformance, actingDNA, retargetCaptureFrame, samplePerformance,
  type CaptureFrame, type MotionDNA, type PerformanceKey } from '../engine/performanceCapture.ts';
import { startPerformanceTracker, type PerformanceTracker } from '../services/performanceTracker.ts';
import { putAudio } from '../services/audio.ts';
import { analyzeLocalLipSync } from '../services/localLipSync.ts';
import { clamp } from '../engine/animation.ts';
import { smoothLivePerformance } from '../engine/livePerformanceScene.ts';
import { createPerformancePreview, type PerformancePreview } from '../services/performancePreview.ts';
import { uid, type Character, type Clip, type Scene } from '../engine/schema.ts';
import { Modal } from './shared.tsx';

type Result = {keys:PerformanceKey[];duration:number;framesAccepted:number;framesDropped:number};
type Props={
  scene:Scene; characters:Character[]; selectedActor?:string; start:number;
  close:()=>void; commit:(clips:Clip[])=>Promise<void>;
  saveActingDNA:(actorId:string,style:MotionDNA)=>void;
};
type Status='idle'|'loading'|'ready'|'recording'|'processing'|'review';
const maxDuration=18;
export function PerformanceStudio({scene,characters,selectedActor,start,close,commit,saveActingDNA}:Props) {
  const [actor,setActor]=useState(selectedActor??scene.actors[0]?.id??'');
  const [status,setStatus]=useState<Status>('idle');
  const [message,setMessage]=useState('Nothing leaves your device during tracking. With installed local models, MediaPipe works without internet.');
  const [intensity,setIntensity]=useState(100);
  const [smoothing,setSmoothing]=useState(25);
  // A typical 4 GB laptop struggles with three synchronous vision models.
  // Start with body + hands on modest devices; facial capture stays one click away.
  const [face,setFace]=useState(()=>((navigator as Navigator & {deviceMemory?:number}).deviceMemory??8)>4);
  const [hands,setHands]=useState(true);
  const [transcript,setTranscript]=useState('');
  const [takeName,setTakeName]=useState('Webcam take');
  const [result,setResult]=useState<Result>();
  const [recordedAudio,setRecordedAudio]=useState<Blob>();
  const [tracking,setTracking]=useState<'off'|'searching'|'live'|'lost'>('off');
  const [trackedFrames,setTrackedFrames]=useState(0);
  const [previewError,setPreviewError]=useState('');
  const [replaying,setReplaying]=useState(false);
  const camera=useRef<HTMLVideoElement>(null),characterHost=useRef<HTMLDivElement>(null);
  const preview=useRef<PerformancePreview|undefined>(undefined);
  const actorRef=useRef(actor);actorRef.current=actor;
  const statusRef=useRef<Status>(status);statusRef.current=status;
  const smoothingRef=useRef(smoothing);smoothingRef.current=smoothing;
  const intensityRef=useRef(intensity);intensityRef.current=intensity;
  const stream=useRef<MediaStream|undefined>(undefined);
  const tracker=useRef<PerformanceTracker|undefined>(undefined);
  const raf=useRef(0),last=useRef(0),started=useRef(0),alive=useRef(true);
  const frames=useRef<CaptureFrame[]>([]);
  const recorder=useRef<MediaRecorder|undefined>(undefined),chunks=useRef<Blob[]>([]);
  const stopping=useRef(false),recording=useRef(false);
  const lastSeen=useRef(0),lastUi=useRef(0),lastPreview=useRef<PerformanceKey|undefined>(undefined);
  const playback=useRef<{keys:PerformanceKey[];duration:number;start:number}|undefined>(undefined);
  const interval=useRef(70);
  const updateStatus=(next:Status)=>{statusRef.current=next;setStatus(next);};
  function drawPose(key?:PerformanceKey){
    if(!preview.current||!actorRef.current)return;
    try{preview.current.draw(actorRef.current,key);}
    catch(error){setPreviewError('Character preview error: '+String(error));}
  }
  function takeDown(){
    recording.current=false;playback.current=undefined;
    cancelAnimationFrame(raf.current);raf.current=0;
    try{if(recorder.current?.state==='recording')recorder.current.stop();}catch{/* cleanup */}
    recorder.current=undefined;
    tracker.current?.close();tracker.current=undefined;
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=undefined;
    if(camera.current)camera.current.srcObject=null;
  }
  useEffect(()=>{
    alive.current=true;
    let disposed=false;
    const host=characterHost.current;
    if(host){
      void createPerformancePreview(host,scene,characters).then(renderer=>{
        if(disposed){renderer.destroy();return;}
        preview.current=renderer;
        drawPose(lastPreview.current);
      }).catch(error=>{if(!disposed)setPreviewError('Cartoon renderer unavailable: '+String(error));});
    }
    return ()=>{
      disposed=true;alive.current=false;takeDown();
      preview.current?.destroy();preview.current=undefined;
    };
  },[]);
  useEffect(()=>{drawPose(lastPreview.current);},[actor]);
  const dismiss=()=>{takeDown();close();};
  function loop(at:number){
    if(!alive.current||!tracker.current)return;
    if(statusRef.current==='recording'&&at-started.current>=maxDuration*1000)void stop();
    const state=statusRef.current;
    if(state==='review'&&playback.current){
      const playing=playback.current;
      if(at-last.current>=75){
        last.current=at;
        const progress=clamp((at-playing.start)/Math.max(.1,playing.duration*1000));
        drawPose(samplePerformance(playing.keys,progress));
        if(progress>=1){playback.current=undefined;setReplaying(false);}
      }
    }else if((state==='ready'||state==='recording')&&at-last.current>=interval.current){
      last.current=at;
      const before=performance.now();
      try{
        const observed=tracker.current.detect(camera.current!,at);
        const key=observed&&retargetCaptureFrame(observed);
        if(key){
          lastSeen.current=at;
          if(recording.current&&observed){
            frames.current.push(observed);
          }
          const factor=intensityRef.current/100;
          const pose={...key.pose};
          for(const joint of Object.keys(pose) as Array<keyof typeof pose>){
            const value=pose[joint];
            if(value!==undefined)pose[joint]=clamp(value*factor,-165,165);
          }
          lastPreview.current=smoothLivePerformance(lastPreview.current,{...key,pose},smoothingRef.current/100);
          drawPose(lastPreview.current);
          if(at-lastUi.current>350){
            setTracking('live');setTrackedFrames(frames.current.length);lastUi.current=at;
          }
        }else if(at-lastUi.current>700){
          setTracking(lastSeen.current&&at-lastSeen.current>2200?'lost':'searching');
          lastUi.current=at;
        }
      }catch(error){
        if(at-lastUi.current>1400){
          setMessage('Tracking interrupted: '+String(error));
          lastUi.current=at;
        }
      }
      const elapsed=performance.now()-before;
      // Prevent the former 280ms stall after expensive inference.
      interval.current=clamp(Math.ceil(elapsed*1.05),58,155);
    }
    raf.current=requestAnimationFrame(loop);
  }
  async function prepare(){
    if(!navigator.mediaDevices?.getUserMedia){
      setMessage('Use HTTPS and a browser with camera permissions to capture a performance.');return;
    }
    updateStatus('loading');setResult(undefined);setPreviewError('');
    setTracking('searching');setMessage('Requesting camera permission and loading on-device MediaPipe models…');
    let media:MediaStream|undefined;let vision:PerformanceTracker|undefined;
    try{
      try{media=await navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:20,max:24}},
        audio:{echoCancellation:true,noiseSuppression:true}});}
      catch{media=await navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:20,max:24}},audio:false});}
      vision=await startPerformanceTracker({hands,face});
      if(!alive.current){vision.close();media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;tracker.current=vision;
      if(camera.current){camera.current.srcObject=media;await camera.current.play();}
      last.current=0;lastSeen.current=0;lastUi.current=0;interval.current=70;
      updateStatus('ready');
      setMessage(vision.warnings.length?vision.warnings.join(' ') :
        'Live puppeteering is active. Move your head, shoulders and hands; the character responds alongside you. Record up to 18 seconds.');
      cancelAnimationFrame(raf.current);
      raf.current=requestAnimationFrame(loop);
    }catch(error){
      vision?.close();media?.getTracks().forEach(track=>track.stop());
      tracker.current=undefined;stream.current=undefined;
      updateStatus('idle');setTracking('off');
      setMessage('Could not start camera or body tracker: '+String(error));
    }
  }
  function resetCamera(){
    if(statusRef.current!=='ready')return;
    takeDown();setTracking('off');setTrackedFrames(0);
    updateStatus('idle');setMessage('Choose hand and face tracking options, then enable the camera again.');
  }
  function begin(){
    if(statusRef.current!=='ready'||!tracker.current||!lastSeen.current)return;
    frames.current=[];chunks.current=[];stopping.current=false;recording.current=true;
    playback.current=undefined;setRecordedAudio(undefined);setResult(undefined);setTrackedFrames(0);
    let writer:MediaRecorder|undefined;
    const audio=stream.current?.getAudioTracks();
    if(audio?.length&&typeof MediaRecorder!=='undefined'){
      try{
        writer=new MediaRecorder(new MediaStream(audio));
        writer.ondataavailable=event=>{if(event.data.size)chunks.current.push(event.data);};
        writer.start(250);
      }catch{setMessage('Video motion will record without voice on this browser.');}
    }
    recorder.current=writer;started.current=performance.now();
    updateStatus('recording');
  }
  async function stop(){
    if(stopping.current||statusRef.current!=='recording')return;
    stopping.current=true;recording.current=false;updateStatus('processing');
    setMessage('Compiling captured movements and facial acting into editable cartoon keyframes…');
    const writer=recorder.current;recorder.current=undefined;
    let audio:Blob|undefined;
    if(writer?.state==='recording')audio=await new Promise<Blob|undefined>(resolve=>{
      writer.addEventListener('stop',()=>{
        const blob=new Blob(chunks.current,{type:writer.mimeType||'audio/webm'});
        resolve(blob.size>0?blob:undefined);
      },{once:true});
      try{writer.stop();}catch{resolve(undefined);}
    });
    if(audio)setRecordedAudio(audio);
    try{
      const compiled=compilePerformance(frames.current,{
        exaggeration:intensityRef.current/100,smoothing:smoothingRef.current/100
      });
      setResult(compiled);updateStatus('review');
      drawPose(samplePerformance(compiled.keys,1));
      setMessage('Captured '+compiled.framesAccepted+' frames ('+compiled.framesDropped+
        ' discarded) and compiled '+compiled.keys.length+' editable poses. Replay before saving.');
    }catch(error){
      stopping.current=false;updateStatus('ready');
      setMessage('Recording could not compile: '+String(error)+' Try a longer take with shoulders and arms visible.');
    }
  }
  function replay(){
    if(!result||!preview.current)return;
    playback.current={keys:result.keys,duration:result.duration,start:performance.now()};
    last.current=0;setReplaying(true);
  }
  async function save(){
    if(!result||!actor)return;
    playback.current=undefined;setReplaying(false);
    updateStatus('processing');
    try{
      const startAt=clamp(start,0,180-result.duration);
      const length=clamp(result.duration,.1,180-startAt);
      const motion:Extract<Clip,{track:'performance'}>={
        id:uid(),track:'performance',actor,name:takeName.trim().slice(0,72)||'Webcam take',
        start:startAt,length,performance:result.keys,performanceOrigin:'mocap'
      };
      const clips:Clip[]=[motion];
      if(recordedAudio){
        const assetId=uid();
        await putAudio(assetId,recordedAudio);
        const spoken:Extract<Clip,{track:'dialogue'}>={
          id:uid(),track:'dialogue',actor,start:startAt,length,
          asset:'asset:'+assetId,text:transcript.slice(0,1000),
          volume:1,muted:false,offset:0
        };
        try{
          const analyzed=await analyzeLocalLipSync(recordedAudio);
          spoken.visemes=analyzed.cues;
          spoken.lipSync={source:'dsp',engine:analyzed.engine,cacheKey:analyzed.cacheKey,analyzedDuration:analyzed.analyzedDuration};
        }catch{setMessage('Audio saved; precise audio analysis was unavailable. You can refine lip sync later.');}
        clips.push(spoken);
      }

      await commit(clips);
      dismiss();
    }catch(error){updateStatus('review');setMessage('Could not save performance: '+String(error));}
  }
  const style=result?actingDNA(result.keys):undefined;
  return <Modal title="Performance Studio" description="Record natural talking, expressive gestures and personality-driven micro movements." close={dismiss} wide>
    <div className="performance-studio">
      <div className="performance-views">
        <section className="performance-view" aria-label="Your webcam">
          <div className="performance-view-heading"><span>YOU · CAMERA</span><span className="performance-view-badge">{status==='recording'?'Recording':status==='review'?'Take finished':status==='ready'?'Camera active':'Camera off'}</span></div>
          <div className="performance-camera">
            <video ref={camera} autoPlay playsInline muted aria-label="Live mirrored webcam video for performance capture"/>
            {(status==='idle'||status==='loading')&&<div className="performance-standby"><Camera size={32}/><span>{status==='loading'?'Starting camera…':'Enable your camera below'}</span></div>}
            {status==='recording'&&<div className="performance-live"><Circle size={11} fill="currentColor"/> Recording · 18s maximum</div>}
          </div>
        </section>
        <section className="performance-view" aria-label="Live cartoon character">
          <div className="performance-view-heading"><span>SIRVIBE · LIVE CHARACTER</span>
            <span className={'performance-view-badge performance-status-'+tracking}>{tracking==='live'?'Tracking body':tracking==='lost'?'Tracking lost':tracking==='searching'?'Looking for actor':'Ready'}</span>
          </div>
          <div className="performance-character" ref={characterHost}>
            {previewError&&<p className="performance-preview-error" role="alert">{previewError}</p>}
          </div>
        </section>
      </div>
      <div className="performance-live-description" role="status">
        <span>{status==='recording'?'Recording your acting while the cartoon mirrors your movement.':
          status==='review'?'Replay your take on the cartoon before adding it to the timeline.':
          status==='ready'?'Move in front of your camera. The cartoon responds live — recording is optional.':
          'A live side-by-side view of you and the character you control.'}</span>
        <strong>{status==='recording'?trackedFrames+' frames captured':tracking==='live'?'Live motion connected':'Local tracking'}</strong>
      </div>
      <div className="performance-controls">
        <label>Perform as <select aria-label="Perform as" value={actor} onChange={e=>setActor(e.target.value)} disabled={status==='recording'||status==='processing'}>
          {scene.actors.map(a=><option key={a.id} value={a.id}>{characters.find(c=>c.id===a.characterId)?.name??'Character'}</option>)}
        </select></label>
        <div className="performance-values">
          <label>Exaggeration {intensity}%<input type="range" min="50" max="180" step="10" value={intensity} disabled={status==='recording'} onChange={e=>setIntensity(Number(e.target.value))}/></label>
          <label>Smoothing {smoothing}%<input type="range" min="0" max="95" step="5" value={smoothing} disabled={status==='recording'} onChange={e=>setSmoothing(Number(e.target.value))}/></label>
        </div>
        <div className="performance-toggles">
          <label><input type="checkbox" checked={hands} disabled={status!=='idle'} onChange={e=>setHands(e.target.checked)}/> <Hand size={14}/> Track finger poses (extra CPU)</label>
          <label><input type="checkbox" checked={face} disabled={status!=='idle'} onChange={e=>setFace(e.target.checked)}/> <PersonStanding size={14}/> Track eyebrows + mouth (extra CPU)</label>
        </div>
        <p className="performance-help">Fast eye direction, head tilt and visible arm movement use the lightweight pose model. Detailed eyebrows, mouth corners and finger shapes use additional optional models.</p>
        <p className="performance-help" role="status">{message}</p>
        <div className="performance-actions">
          {status==='idle'&&<button type="button" className="primary" disabled={!actor} onClick={()=>void prepare()}><Camera size={16}/> Enable camera</button>}
          {status==='ready'&&<button type="button" className="primary" disabled={tracking!=='live'} onClick={begin}><Circle size={15}/> Record acting</button>}
          {status==='ready'&&<button type="button" className="quiet" onClick={resetCamera}>Change tracking options</button>}
          {status==='recording'&&<button type="button" className="primary" onClick={()=>void stop()}><VideoOff size={15}/> Stop & compile</button>}
          {(status==='loading'||status==='processing')&&<span>Processing on your device…</span>}
        </div>
        {status==='review'&&result&&<>
          <div className="performance-summary">
            <strong>{result.duration.toFixed(1)}s performance · {result.keys.length} editable poses</strong>
            <span>Captured body, hand{face?' and facial':''} acting · ready for the Performance track</span>
          </div>
          <label>Performance name
            <input type="text" maxLength={72} value={takeName} onChange={e=>setTakeName(e.target.value)} placeholder="Webcam take"/>
          </label>
          <label>Spoken dialogue (optional transcript)
            <input type="text" maxLength={1000} value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Type the words you spoke for dialogue editing"/>
          </label>
          {style&&<div className="performance-dna">
            <strong>Observed Acting DNA</strong>
            <span>Energy {style.energy}% · Gesture size {style.gestureAmplitude}% · Dominant {style.dominantHand} hand</span>
            <button type="button" className="quiet" onClick={()=>saveActingDNA(actor,style)}><WandSparkles size={14}/> Apply motion style to character</button>
          </div>}
          <button type="button" className="quiet" disabled={replaying||!!previewError} onClick={replay}>Replay on character</button>
          <button className="primary" type="button" onClick={()=>void save()}>Add performance to timeline{recordedAudio?' + recorded voice':''}</button>
          <button className="quiet" type="button" onClick={()=>{playback.current=undefined;setReplaying(false);setResult(undefined);stopping.current=false;frames.current=[];updateStatus('ready');}}>Retake</button>
        </>}
        <div className="performance-privacy"><ShieldAlert size={15}/> Raw camera video is not stored. The character is controlled locally; only compact pose keys and an optional voice recording are saved. Face tracking can be disabled for slower computers.</div>
      </div>
    </div>
  </Modal>;
}
