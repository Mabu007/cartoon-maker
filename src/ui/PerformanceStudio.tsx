import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, Hand, PersonStanding, ShieldAlert, VideoOff, WandSparkles } from 'lucide-react';
import { compilePerformance, actingDNA, findStrike, makeRecoilKeys,
  type CaptureFrame, type MotionDNA, type PerformanceKey } from '../engine/performanceCapture.ts';
import { startPerformanceTracker, type PerformanceTracker } from '../services/performanceTracker.ts';
import { putAudio } from '../services/audio.ts';
import { analyzeLocalLipSync } from '../services/localLipSync.ts';
import { clamp } from '../engine/animation.ts';
import { uid, type Clip, type Scene } from '../engine/schema.ts';
import { Modal } from './shared.tsx';

type Result = {keys:PerformanceKey[];duration:number;framesAccepted:number;framesDropped:number};
type Props={
  scene:Scene; selectedActor?:string; start:number;
  close:()=>void; commit:(clips:Clip[])=>Promise<void>;
  saveActingDNA:(actorId:string,style:MotionDNA)=>void;
};
type Status='idle'|'loading'|'ready'|'recording'|'processing'|'review';
const maxDuration=18;
export function PerformanceStudio({scene,selectedActor,start,close,commit,saveActingDNA}:Props) {
  const [actor,setActor]=useState(selectedActor??scene.actors[0]?.id??'');
  const [opponent,setOpponent]=useState('');
  const [status,setStatus]=useState<Status>('idle');
  const [message,setMessage]=useState('Nothing leaves your device during tracking. Models may be downloaded on the first use.');
  const [intensity,setIntensity]=useState(100);
  const [smoothing,setSmoothing]=useState(55);
  const [face,setFace]=useState(false);
  const [hands,setHands]=useState(true);
  const [transcript,setTranscript]=useState('');
  const [result,setResult]=useState<Result>();
  const [recordedAudio,setRecordedAudio]=useState<Blob>();
  const camera=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream>();
  const tracker=useRef<PerformanceTracker>();
  const raf=useRef(0),last=useRef(0),started=useRef(0),alive=useRef(true);
  const frames=useRef<CaptureFrame[]>([]);
  const recorder=useRef<MediaRecorder>(),chunks=useRef<Blob[]>([]);
  const takeDown=()=>{
    cancelAnimationFrame(raf.current);
    try{if(recorder.current?.state==='recording')recorder.current.stop();}catch{/* cleanup */}
    recorder.current=undefined;
    tracker.current?.close();tracker.current=undefined;
    stream.current?.getTracks().forEach(track=>track.stop());stream.current=undefined;
    if(camera.current)camera.current.srcObject=null;
  };
  useEffect(()=>()=>{alive.current=false;takeDown();},[]);
  const dismiss=()=>{takeDown();close();};
  async function prepare() {
    if(!navigator.mediaDevices?.getUserMedia){setMessage('Camera capture requires HTTPS and browser camera support.');return;}
    setStatus('loading');setResult(undefined);setMessage('Requesting camera permission and loading on-device trackers…');
    let media:MediaStream|undefined;let vision:PerformanceTracker|undefined;
    try {
      try{media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:480},height:{ideal:360},frameRate:{ideal:15,max:20}},audio:{echoCancellation:true,noiseSuppression:true}});}
      catch{media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:480},height:{ideal:360},frameRate:{ideal:15,max:20}},audio:false});}
      vision=await startPerformanceTracker({hands,face});
      if(!alive.current){vision.close();media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;tracker.current=vision;
      if(camera.current){camera.current.srcObject=media;await camera.current.play();}
      setStatus('ready');
      setMessage(vision.warnings.length?vision.warnings.join(' ') : 'Ready. Keep your shoulders, arms and hands in view. Record up to 18 seconds.');
    }catch(error){
      vision?.close();media?.getTracks().forEach(track=>track.stop());setStatus('idle');
      setMessage('Camera or tracker could not start: '+String(error));
    }
  }
  function begin() {
    if(status!=='ready'||!tracker.current)return;
    frames.current=[];chunks.current=[];setRecordedAudio(undefined);setResult(undefined);
    let writer:MediaRecorder|undefined;
    const audio=stream.current?.getAudioTracks();
    if(audio?.length&&typeof MediaRecorder!=='undefined'){
      try{
        writer=new MediaRecorder(new MediaStream(audio));
        writer.ondataavailable=event=>{if(event.data.size)chunks.current.push(event.data);};
        writer.start(250);
      }catch{setMessage('Motion will record without audio on this browser.');}
    }
    recorder.current=writer;started.current=performance.now();last.current=0;
    setStatus('recording');
    let interval=100;
    const step=(at:number)=>{
      if(!alive.current)return;
      if(at-started.current>=maxDuration*1000){void stop();return;}
      if(at-last.current>=interval&&camera.current&&tracker.current){
        last.current=at;
        const before=performance.now();
        try {
          const found=tracker.current.detect(camera.current,at);
          if(found)frames.current.push(found);
        }catch(error){setMessage('Some tracking frames were skipped: '+String(error));}
        const cost=performance.now()-before;
        interval=cost>95?Math.min(210,Math.ceil(cost*1.25)):100;
      }
      raf.current=requestAnimationFrame(step);
    };
    raf.current=requestAnimationFrame(step);
  }
  async function stop() {
    cancelAnimationFrame(raf.current);
    setStatus('processing');setMessage('Compiling tracked movement into editable cartoon poses…');
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
      const compiled=compilePerformance(frames.current,{exaggeration:intensity/100,smoothing:smoothing/100});
      setResult(compiled);setStatus('review');
      setMessage(`Captured ${compiled.framesAccepted} tracked frames (${compiled.framesDropped} discarded). The result uses ${compiled.keys.length} editable key poses.`);
    }catch(error){setStatus('ready');setMessage(String(error));}
  }
  async function save(){
    if(!result||!actor)return;
    setStatus('processing');
    try{
      const startAt=clamp(start,0,180-result.duration);
      const length=clamp(result.duration,.1,180-startAt);
      const motion:Extract<Clip,{track:'body'}>={
        id:uid(),track:'body',actor,action:'talk',layer:'gesture',
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
      const strike=findStrike(result.keys);
      if(opponent&&opponent!==actor&&strike!==undefined){
        const recoilStart=Math.min(179.2,startAt+strike*length);
        clips.push({id:uid(),track:'body',actor:opponent,action:'surprise',layer:'body',
          start:recoilStart,length:Math.min(.8,180-recoilStart),
          performance:makeRecoilKeys(),performanceOrigin:'choreography'});
      }
      await commit(clips);
      dismiss();
    }catch(error){setStatus('review');setMessage('Could not save performance: '+String(error));}
  }
  const style=result?actingDNA(result.keys):undefined;
  const strike=result?findStrike(result.keys):undefined;
  const opponents=scene.actors.filter(a=>a.id!==actor);
  return <Modal title="Performance Studio" description="Act out a scene. SIRVIBE transforms it into editable 2D pose animation." close={dismiss} wide>
    <div className="performance-studio">
      <div className="performance-camera">
        <video ref={camera} autoPlay playsInline muted aria-label="Live camera preview for performance capture"/>
        {status==='idle'&&<div className="performance-standby"><Camera size={32}/><span>Camera is off</span></div>}
        {status==='recording'&&<div className="performance-live"><Circle size={11} fill="currentColor"/> Recording · 18s maximum</div>}
      </div>
      <div className="performance-controls">
        <label>Perform as <select aria-label="Perform as" value={actor} onChange={e=>setActor(e.target.value)} disabled={status==='recording'||status==='processing'}>
          {scene.actors.map(a=><option key={a.id} value={a.id}>{a.id}</option>)}
        </select></label>
        <div className="performance-values">
          <label>Exaggeration {intensity}%<input type="range" min="50" max="180" step="10" value={intensity} disabled={status==='recording'} onChange={e=>setIntensity(Number(e.target.value))}/></label>
          <label>Smoothing {smoothing}%<input type="range" min="0" max="95" step="5" value={smoothing} disabled={status==='recording'} onChange={e=>setSmoothing(Number(e.target.value))}/></label>
        </div>
        <div className="performance-toggles">
          <label><input type="checkbox" checked={hands} disabled={status!=='idle'} onChange={e=>setHands(e.target.checked)}/> <Hand size={14}/> Track hands</label>
          <label><input type="checkbox" checked={face} disabled={status!=='idle'} onChange={e=>setFace(e.target.checked)}/> <PersonStanding size={14}/> Track face (slower)</label>
        </div>
        <p className="performance-help" role="status">{message}</p>
        <div className="performance-actions">
          {status==='idle'&&<button type="button" className="primary" disabled={!actor} onClick={()=>void prepare()}><Camera size={16}/> Enable camera</button>}
          {status==='ready'&&<button type="button" className="primary" onClick={begin}><Circle size={15}/> Record acting</button>}
          {status==='recording'&&<button type="button" className="primary" onClick={()=>void stop()}><VideoOff size={15}/> Stop & compile</button>}
          {(status==='loading'||status==='processing')&&<span>Processing on your device…</span>}
        </div>
        {status==='review'&&result&&<>
          <div className="performance-summary">
            <strong>{result.duration.toFixed(1)}s performance · {result.keys.length} poses</strong>
            <span>{strike===undefined?'Conversational movement':'Possible strike gesture near '+Math.round(strike*result.duration*10)/10+'s'}</span>
          </div>
          <label>Spoken dialogue (optional transcript)
            <input type="text" maxLength={1000} value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Type the words you spoke for dialogue editing"/>
          </label>
          {opponents.length>0&&<label>Fight choreography (optional)
            <select value={opponent} onChange={e=>setOpponent(e.target.value)}>
              <option value="">No staged reaction</option>
              {opponents.map(a=><option key={a.id} value={a.id}>Add a recoil to {a.id}</option>)}
            </select>
            {opponent&&strike===undefined&&<small>No confident strike found. Record a clear fist extension to generate the paired reaction.</small>}
          </label>}
          {style&&<div className="performance-dna">
            <strong>Observed Acting DNA</strong>
            <span>Energy {style.energy}% · Gesture size {style.gestureAmplitude}% · Dominant {style.dominantHand} hand</span>
            <button type="button" className="quiet" onClick={()=>saveActingDNA(actor,style)}><WandSparkles size={14}/> Apply motion style to character</button>
          </div>}
          <button className="primary" type="button" onClick={()=>void save()}>Add performance to timeline{recordedAudio?' + recorded voice':''}</button>
          <button className="quiet" type="button" onClick={()=>{setResult(undefined);setStatus('ready');}}>Retake</button>
        </>}
        <div className="performance-privacy"><ShieldAlert size={15}/> Raw camera video is not stored. Only pose keys and an optional voice recording are saved to this project.</div>
      </div>
    </div>
  </Modal>;
}
