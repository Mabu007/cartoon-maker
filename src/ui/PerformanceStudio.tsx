import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, ShieldAlert, VideoOff, WandSparkles, ArrowLeft, ArrowRight, UserRound, Play, RotateCcw, Check, Square, Mic } from 'lucide-react';
import { defaultTrackingSelection, trackingModelPlan, maskPerformance, type TrackingSelection } from '../engine/trackingSelection.ts';
import { actingDNA, retargetCaptureFrame, samplePerformance,
  type MotionDNA, type PerformanceKey } from '../engine/performanceCapture.ts';
import { refinePerformance, combineCaptureEvidence } from '../engine/performanceRefinement.ts';
import { compileResolvedPerformance, type ResolvedObservation } from '../engine/resolvedPerformance.ts';
import { startAsyncPerformanceTracker, type AsyncPerformanceTracker } from '../services/asyncPerformanceTracker.ts';
import { putAudio } from '../services/audio.ts';
import { analyzeLocalLipSync } from '../services/localLipSync.ts';
import { clamp } from '../engine/animation.ts';
import { createPerformanceStabilizer } from '../engine/performanceStabilizer.ts';
import { constrainCapturedHead } from '../engine/performanceHeadEye.ts';
import { createPerformancePreview, type PerformancePreview } from '../services/performancePreview.ts';
import { finishOptionalAudio } from '../services/performanceRecording.ts';
import { drawPerformanceLandmarks } from '../services/performanceOverlay.ts';
import { uid, type Character, type Clip, type Scene, type PerformanceFacing } from '../engine/schema.ts';
import { initialPerformanceFacing } from '../engine/performanceFacing.ts';
import { Modal } from './shared.tsx';

type Result = {keys:PerformanceKey[];duration:number;framesAccepted:number;framesDropped:number};
type Props={
  scene:Scene; characters:Character[]; selectedActor?:string; start:number;
  close:()=>void; commit:(clips:Clip[])=>Promise<void>;
  saveActingDNA:(actorId:string,style:MotionDNA)=>void;previewOnly?:boolean;
};
type Status='idle'|'loading'|'ready'|'recording'|'processing'|'review';
const recordingLimits=[60,120,150,180] as const;
const recordingLimitKey='sirvibe.performance.maxDuration';
function loadRecordingLimit(){try{const value=Number(localStorage.getItem(recordingLimitKey));return recordingLimits.find(limit=>limit===value)??120;}catch{return 120;}}
export function PerformanceStudio({scene,characters,selectedActor,start,close,commit,saveActingDNA,previewOnly=false}:Props) {
  const [actor,setActor]=useState(selectedActor??scene.actors[0]?.id??'');
  const [facing,setFacing]=useState<PerformanceFacing>(()=>initialPerformanceFacing(
    scene.actors.find(item=>item.id===(selectedActor??scene.actors[0]?.id))));
  const [status,setStatus]=useState<Status>('idle');
  const [recordingLimit,setRecordingLimit]=useState(loadRecordingLimit);
  const maxDuration=Math.min(recordingLimit,Math.max(0,180-start));
  const maxDurationRef=useRef(maxDuration);maxDurationRef.current=maxDuration;
  useEffect(()=>{try{if(!previewOnly)localStorage.setItem(recordingLimitKey,String(recordingLimit));}catch{/* private storage */}},[recordingLimit]);
  const [message,setMessage]=useState('Nothing leaves your device during tracking. With installed local models, MediaPipe works without internet.');
  const [intensity,setIntensity]=useState(100);
  const [smoothing,setSmoothing]=useState(50);
  const [autoFacing,setAutoFacing]=useState(true);
  const autoFacingRef=useRef(autoFacing);autoFacingRef.current=autoFacing;
  const [diagnostics,setDiagnostics]=useState({mode:'—',inference:0,latency:0,fps:0,observations:0});
  const inferenceBusy=useRef(false),captureGeneration=useRef(0),lastVideoTime=useRef(-1),observationCount=useRef(0),renderCount=useRef(0),diagnosticAt=useRef(0);
  // A typical 4 GB laptop struggles with three synchronous vision models.
  // Start with body + hands on modest devices; facial capture stays one click away.
  const [channels,setChannels]=useState<TrackingSelection>(()=>{try{const saved=JSON.parse(localStorage.getItem('sirvibe.tracking.channels')??'null');return Object.fromEntries(Object.entries(defaultTrackingSelection).map(([k,v])=>[k,typeof saved?.[k]==='boolean'?saved[k]:v])) as TrackingSelection;}catch{return {...defaultTrackingSelection};}});
  const channelsRef=useRef(channels);channelsRef.current=channels;
  const {hands}=channels;const face=channels.face||channels.eyes;
  useEffect(()=>{try{if(!previewOnly)localStorage.setItem('sirvibe.tracking.channels',JSON.stringify(channels));}catch{/* optional storage */}},[channels]);
  const channelLabels:Record<keyof TrackingSelection,string>={head:'Head turns & tilt',face:'Facial expressions',eyes:'Eyes, gaze & blinking',torso:'Torso & body turning',hips:'Pelvis / hips',legs:'Legs & knees',arms:'Arms & elbows',hands:'Hands & fingers'};
  function changeChannels(next:TrackingSelection){if(statusRef.current!=='idle')return;setChannels(next);motionStabilizer.current.reset();lastPreview.current=undefined;presentation.current=undefined;drawPose();}
  const [recordVoice,setRecordVoice]=useState(false);
  const [recordSeconds,setRecordSeconds]=useState(0);
  const [trackingOverlay,setTrackingOverlay]=useState(true);
  const [transcript,setTranscript]=useState('');
  const [takeName,setTakeName]=useState('Webcam take');
  const [result,setResult]=useState<Result>();
  const [recordedAudio,setRecordedAudio]=useState<Blob>();
  const [tracking,setTracking]=useState<'off'|'searching'|'live'|'lost'>('off');
  const [trackedFrames,setTrackedFrames]=useState(0);
  const [previewError,setPreviewError]=useState('');
  const [replaying,setReplaying]=useState(false);
  const [observedGesture,setObservedGesture]=useState('');
  const [handReadout,setHandReadout]=useState<{left:string;right:string}>({left:'Not visible',right:'Not visible'});
  const [liveHeadFacing,setLiveHeadFacing]=useState<'front'|'left'|'right'>('front');
  const camera=useRef<HTMLVideoElement>(null),characterHost=useRef<HTMLDivElement>(null);
  const overlay=useRef<HTMLCanvasElement>(null);
  const preview=useRef<PerformancePreview|undefined>(undefined);
  const actorRef=useRef(actor);actorRef.current=actor;
  const facingRef=useRef(facing);facingRef.current=facing;
  const lastDrawn=useRef<PerformanceKey|undefined>(undefined);
  // Render clock is independent of the camera inference clock. Transitions
  // start at the actual presented pose, never an undisplayed previous target.
  const presentation=useRef<{from:PerformanceKey;to:PerformanceKey;start:number;duration:number}|undefined>(undefined);
  const lastRender=useRef(-Infinity),lastRecordFrame=useRef(-Infinity);
  function presented(at:number):PerformanceKey|undefined{
    const transition=presentation.current;
    if(!transition)return lastPreview.current;
    const progress=clamp((at-transition.start)/transition.duration);
    const sample=samplePerformance([transition.from,transition.to],progress);
    return sample.presence===0?undefined:sample;
  }
  function presentTarget(key:PerformanceKey|undefined,at:number){
    const from=presented(at)??{time:0,pose:{},presence:0};
    const to=key??{time:1,pose:{},presence:0};
    presentation.current={from:{...from,time:0},to:{...to,time:1},start:at,
      duration:Math.max(35,Math.min(85,interval.current*.55))};
  }
  const motionStabilizer=useRef(createPerformanceStabilizer());
  const statusRef=useRef<Status>(status);statusRef.current=status;
  const smoothingRef=useRef(smoothing);smoothingRef.current=smoothing;
  const intensityRef=useRef(intensity);intensityRef.current=intensity;
  const trackingOverlayRef=useRef(trackingOverlay);trackingOverlayRef.current=trackingOverlay;
  const stream=useRef<MediaStream|undefined>(undefined);
  const tracker=useRef<AsyncPerformanceTracker|undefined>(undefined);
  const raf=useRef(0),last=useRef(0),started=useRef(0),alive=useRef(true);
  const frames=useRef<ResolvedObservation[]>([]);
  const rawFrames=useRef<ResolvedObservation[]>([]);
  const timedFrames=useRef<ResolvedObservation[]>([]);
  const recorder=useRef<MediaRecorder|undefined>(undefined),chunks=useRef<Blob[]>([]);
  const stopping=useRef(false),recording=useRef(false);
  const lastSeen=useRef(0),lastUi=useRef(0),lastPreview=useRef<PerformanceKey|undefined>(undefined);
  const playback=useRef<{keys:PerformanceKey[];duration:number;start:number}|undefined>(undefined);
  const interval=useRef(70),lastClock=useRef(0);
  const updateStatus=(next:Status)=>{statusRef.current=next;setStatus(next);};
  function drawPose(key?:PerformanceKey){
    lastDrawn.current=key;
    if(!preview.current||!actorRef.current)return;
    try{preview.current.draw(actorRef.current,key,facingRef.current);}
    catch(error){setPreviewError('Character preview error: '+String(error));}
  }
  function takeDown(){
    captureGeneration.current++;inferenceBusy.current=false;
    motionStabilizer.current.reset();presentation.current=undefined;
    recording.current=false;playback.current=undefined;rawFrames.current=[];timedFrames.current=[];
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
  useEffect(()=>{drawPose(lastDrawn.current);},[actor,facing]);
  const dismiss=()=>{takeDown();close();};
  function loop(at:number){
    if(!alive.current||!tracker.current)return;
    if(statusRef.current==='recording'&&at-started.current>=maxDurationRef.current*1000)void stop();
    if(statusRef.current==='recording'&&at-lastClock.current>=110){
      setRecordSeconds(Math.min(maxDurationRef.current,(at-started.current)/1000));
      lastClock.current=at;
    }
    const state=statusRef.current;
    if(state==='review'&&playback.current){
      const playing=playback.current;
      if(at-last.current>=33){
        last.current=at;
        const progress=clamp((at-playing.start)/Math.max(.1,playing.duration*1000));
        drawPose(samplePerformance(playing.keys,progress));
        if(progress>=1){playback.current=undefined;setReplaying(false);}
      }
    }else if((state==='ready'||state==='recording')&&!inferenceBusy.current&&camera.current&&camera.current.currentTime!==lastVideoTime.current&&at-last.current>=interval.current){
      last.current=at;
      const before=performance.now(),source=tracker.current,video=camera.current;
      const generation=captureGeneration.current;
      lastVideoTime.current=video.currentTime;inferenceBusy.current=true;
      void (async()=>{try{
        const capture=await source.detect(video,at);
        if(generation!==captureGeneration.current||!alive.current||!['ready','recording'].includes(statusRef.current))return;
        const observed=capture.frame;
        observationCount.current++;
        const now=performance.now();
        if(now-diagnosticAt.current>=1000){
          const seconds=Math.max(.001,(now-diagnosticAt.current)/1000);
          setDiagnostics({mode:source.mode,inference:Math.round(capture.inferenceMs),latency:Math.round(now-at),fps:Math.round(renderCount.current/seconds),observations:Math.round(observationCount.current/seconds)});
          diagnosticAt.current=now;renderCount.current=0;observationCount.current=0;
        }
        if(overlay.current)drawPerformanceLandmarks(overlay.current,trackingOverlayRef.current?observed:undefined);
        const key=observed&&maskPerformance(retargetCaptureFrame(observed),channelsRef.current);
        if(key&&!autoFacingRef.current){delete key.bodyYaw;delete key.bodyFacing;}
        if(recording.current&&at>=started.current)rawFrames.current.push({elapsed:(at-started.current)/1000,sample:key||undefined});
        if(key){
          lastSeen.current=at;
          const factor=intensityRef.current/100;
          const pose={...key.pose};
          for(const joint of Object.keys(pose) as Array<keyof typeof pose>){
            const value=pose[joint];
            if(value!==undefined)pose[joint]=clamp(value*factor,-165,165);
          }
          const stabilized=motionStabilizer.current.update({...key,pose:constrainCapturedHead(pose)},smoothingRef.current/100);
          const target:PerformanceKey=maskPerformance(stabilized,channelsRef.current)??{time:key.time,pose:{},presence:0,tracking:channelsRef.current};
          if(!autoFacingRef.current){delete target.bodyFacing;delete target.bodyYaw;}
          if(recording.current&&at>=started.current)timedFrames.current.push({elapsed:(at-started.current)/1000,sample:maskPerformance(combineCaptureEvidence({...key,pose:constrainCapturedHead(pose)},target),channelsRef.current)});
          presentTarget(target,performance.now());
          lastPreview.current=target;
          if(at-lastUi.current>350){
            setTracking('live');setTrackedFrames(frames.current.length);
            const handLabel=(side:'left'|'right')=>{const value=target.fingerCurls?.[side];return value?`${target.hands?.[side]??'Custom'} · ${value.slice(1).filter(v=>v<.46).length} fingers extended`:'Not visible';};
            setHandReadout({left:handLabel('left'),right:handLabel('right')});
            setLiveHeadFacing(lastPreview.current?.headFacing??'front');
            setObservedGesture(lastPreview.current?.contact?
              ({'prayer':'Hands together','hands-on-head':'Hands on head','guard':'Guard stance',
                'punch-left':'Left punch','punch-right':'Right punch','chin-left':'Chin touch','chin-right':'Chin touch','forehead-left':'Forehead touch','forehead-right':'Forehead touch','hip-left':'Hand on hip','hip-right':'Hand on hip'}[lastPreview.current.contact]??''):
              lastPreview.current?.hands?.right==='thumbs-up'||lastPreview.current?.hands?.left==='thumbs-up'?'Thumbs up':
              lastPreview.current?.hands?.right==='count-two'||lastPreview.current?.hands?.left==='count-two'?'Two fingers':
              lastPreview.current?.hands?.right==='count-three'||lastPreview.current?.hands?.left==='count-three'?'Three fingers':
              lastPreview.current?.hands?.right==='fist'||lastPreview.current?.hands?.left==='fist'?'Fist':
              lastPreview.current?.hands?.right==='point'||lastPreview.current?.hands?.left==='point'?'Pointing':'');
            lastUi.current=at;
          }
        }else{
          // Brief occlusion is not a new neutral pose. The same predicted,
          // confidence-faded sample is shown and recorded, so replay matches
          // the live puppeteering instead of flickering to default animation.
          const recovered=maskPerformance(motionStabilizer.current.recover(at/1000),channelsRef.current);
          if(recording.current&&at>=started.current)timedFrames.current.push({elapsed:(at-started.current)/1000});
          presentTarget(recovered,performance.now());
          lastPreview.current=recovered;
          if(at-lastUi.current>700){
            setTracking(lastSeen.current&&at-lastSeen.current>2200?'lost':'searching');
            setObservedGesture('');setHandReadout({left:'Not visible',right:'Not visible'});
            lastUi.current=at;
          }
        }
      }catch(error){
        if(generation!==captureGeneration.current||!alive.current||!['ready','recording'].includes(statusRef.current))return;
        if(recording.current&&at>=started.current)timedFrames.current.push({elapsed:(at-started.current)/1000});
        const recovered=motionStabilizer.current.recover(at/1000);
        presentTarget(recovered,performance.now());lastPreview.current=recovered;
        if(at-lastUi.current>1400){
          setMessage('Tracking interrupted: '+String(error));
          lastUi.current=at;
        }
      }finally{
        if(generation===captureGeneration.current){
          inferenceBusy.current=false;
          const elapsed=performance.now()-before;
          interval.current=source.mode==='worker'?45:clamp(Math.ceil(elapsed+24),70,180);
        }
      }})();
    }
    if(state==='ready'||state==='recording'){
      const now=performance.now();
      if(now-lastRender.current>=32){
        lastRender.current=now;renderCount.current++;
        const sample=presented(now);
        drawPose(sample);
        // Save the displayed pose at a bounded cadence. Rendering itself
        // is never coupled to the recorder or detection FPS.
        if(recording.current&&now-lastRecordFrame.current>=65){
          lastRecordFrame.current=now;
          frames.current.push({elapsed:Math.max(0,(now-started.current)/1000),sample});
        }
      }
    }
    raf.current=requestAnimationFrame(loop);
  }
  async function prepare(){
    if(!navigator.mediaDevices?.getUserMedia){
      setMessage('Use HTTPS and a browser with camera permissions to capture a performance.');return;
    }
    if(!Object.values(channelsRef.current).some(Boolean)){setMessage('Select at least one body part to track.');return;}
    updateStatus('loading');setResult(undefined);setPreviewError('');setObservedGesture('');
    setTracking('searching');setMessage('Requesting camera permission and loading on-device MediaPipe models…');
    let media:MediaStream|undefined;let vision:AsyncPerformanceTracker|undefined;
    try{
      try{media=await navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:hands?640:320},height:{ideal:hands?480:240},frameRate:{ideal:20,max:24}},
        audio:!previewOnly&&recordVoice?{echoCancellation:true,noiseSuppression:true}:false});}
      catch{media=await navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:320},height:{ideal:240},frameRate:{ideal:20,max:24}},audio:false});
        if(recordVoice)setMessage('Microphone unavailable. Motion recording will still work.');}
      vision=await startAsyncPerformanceTracker(trackingModelPlan(channelsRef.current));
      if(!vision.features.pose&&!vision.features.hands&&!vision.features.face)throw Error(vision.warnings.join(' ')||'No selected tracking model is available.');
      if(!alive.current){vision.close();media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;tracker.current=vision;
      if(camera.current){camera.current.srcObject=media;await camera.current.play();}
      last.current=0;lastSeen.current=0;lastUi.current=0;interval.current=45;
      lastVideoTime.current=-1;diagnosticAt.current=performance.now();renderCount.current=0;observationCount.current=0;
      lastPreview.current=undefined;presentation.current=undefined;lastRender.current=-Infinity;motionStabilizer.current.reset();
      updateStatus('ready');
      setMessage(vision.warnings.length?vision.warnings.join(' ') :
        'Live puppeteering is active. Move your head, shoulders and hands; the character responds alongside you. Record up to '+Math.floor(maxDurationRef.current)+' seconds.');
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
    takeDown();setTracking('off');setTrackedFrames(0);setHandReadout({left:'Not visible',right:'Not visible'});
    updateStatus('idle');setObservedGesture('');setMessage('Choose which body parts to track, then enable the camera again.');
  }
  function begin(){
    if(statusRef.current!=='ready'||!tracker.current)return;
    if(maxDurationRef.current<.15){setMessage('Move the playhead earlier or start another scene before recording.');return;}
    if(!lastSeen.current||!lastPreview.current){
      setTracking('searching');
      setMessage('No selected body part is tracked yet. Keep the selected hands, face or body in the camera view, then press Record movement.');
      return;
    }
    frames.current=[];rawFrames.current=[];timedFrames.current=[];chunks.current=[];stopping.current=false;recording.current=true;
    setRecordSeconds(0);lastClock.current=0;
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
    // Preserve a leading tracking gap or the currently displayed pose at
    // time zero. Audio starts against this same clock, not first detection.
    lastRecordFrame.current=started.current;
    frames.current.push({elapsed:0,sample:presented(started.current)});
    timedFrames.current.push({elapsed:0,sample:lastPreview.current});
    updateStatus('recording');
    setMessage('Recording motion now. Perform naturally, then press Stop & review.');
  }
  async function stop(){
    if(stopping.current||statusRef.current!=='recording')return;
    stopping.current=true;recording.current=false;
    // Stop time is captured before MediaRecorder's asynchronous stop event.
    const duration=Math.min(maxDurationRef.current,(performance.now()-started.current)/1000);
    const last=frames.current[frames.current.length-1];
    if(last && duration>last.elapsed+.0001)frames.current.push({
      elapsed:duration,
      sample:presented(started.current+duration*1000)
    });
    updateStatus('processing');
    setMessage('Cleaning and compressing stabilized motion, preserving tracking gaps and voice timing…');
    const writer=recorder.current;recorder.current=undefined;
    // A broken microphone must not prevent motion capture from compiling.
    const audio=await finishOptionalAudio(writer,chunks.current);
    if(audio)setRecordedAudio(audio);
    try{
      // Source timestamps avoid baking live presentation lag into the final take.
      const timed=timedFrames.current.filter(event=>event.elapsed<=duration);
      const usable=timed.filter(event=>event.sample).length;
      const tail=timed.at(-1);
      if(tail?.sample&&duration-tail.elapsed<=.2&&duration-tail.elapsed>.001)timed.push({elapsed:duration,sample:tail.sample});
      const compiled=compileResolvedPerformance(usable>=2?refinePerformance(timed):frames.current,duration,{cleanMotion:true});
      setResult(compiled);updateStatus('review');
      drawPose(samplePerformance(compiled.keys,1));
      setMessage('Captured '+compiled.framesAccepted+' frames ('+compiled.framesDropped+
        ' discarded) and compiled '+compiled.keys.length+' editable poses. Replay before saving.');
    }catch(error){
      stopping.current=false;updateStatus('ready');
      setMessage('Recording could not compile: '+String(error)+' Try a longer take with shoulders and arms visible.');
    }
  }
  function replay(raw=false){
    if(!result||!preview.current)return;
    let take=result;
    if(raw){
      try{take=compileResolvedPerformance(rawFrames.current,result.duration);}
      catch{setMessage('Not enough reliable raw observations to compare this take. Your stabilized take is safe.');return;}
    }
    playback.current={keys:take.keys,duration:take.duration,start:performance.now()};
    last.current=0;setReplaying(true);
    setMessage(raw?'Comparing unfiltered retargeted observations. Add to timeline still saves the stabilized take.':'Replaying stabilized and cleaned motion.');
  }
  async function save(){
    if(!result||!actor)return;
    playback.current=undefined;setReplaying(false);
    updateStatus('processing');
    try{
      const startAt=clamp(start,0,180);
      const length=clamp(result.duration,.1,180-startAt);
      const motion:Extract<Clip,{track:'performance'}>={
        id:uid(),track:'performance',actor,name:takeName.trim().slice(0,72)||'Webcam take',
        start:startAt,length,performance:result.keys,performanceOrigin:'mocap',facing
      };
      const clips:Clip[]=[motion];
      if(recordedAudio&&!previewOnly){
        const assetId=uid();
        await putAudio(assetId,recordedAudio);
        const spoken:Extract<Clip,{track:'dialogue'}>={
          id:uid(),track:'dialogue',actor,start:startAt,length,
          asset:'asset:'+assetId,text:transcript.slice(0,1000),
          volume:1,muted:false,offset:0
        };
        try{
          const analyzed=await analyzeLocalLipSync(recordedAudio);
          // Audio and motion share the Record origin but may have different
          // true durations. Never crop a spoken ending when tracking stops.
          if(Number.isFinite(analyzed.analyzedDuration)&&analyzed.analyzedDuration>.1)
            spoken.length=clamp(analyzed.analyzedDuration,.1,180-startAt);
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
  const retake=()=>{
    playback.current=undefined;setReplaying(false);setResult(undefined);
    setRecordedAudio(undefined);stopping.current=false;frames.current=[];rawFrames.current=[];timedFrames.current=[];presentation.current=undefined;
    setRecordSeconds(0);updateStatus('ready');
    setMessage('Ready for another take. Your previous take was not added.');
  };
  return <Modal title="Performance Studio" description="Record natural talking, expressive gestures and personality-driven micro movements." close={dismiss} wide>
    <div className="performance-studio">
      <div className="performance-commandbar" role="region" aria-label="Recording controls">
        <label className="performance-actor-picker">Perform as
          <select aria-label="Perform as" value={actor} onChange={e=>{
            const next=e.target.value;
            setActor(next);setFacing(initialPerformanceFacing(scene.actors.find(item=>item.id===next)));
          }} disabled={status==='recording'||status==='processing'}>
            {scene.actors.map(a=><option key={a.id} value={a.id}>{characters.find(c=>c.id===a.characterId)?.name??'Character'}</option>)}
          </select>
        </label>
        <div className="performance-command-copy">
          <strong>{status==='review'?'3 · Review your take':status==='recording'?'2 · Recording movement':status==='ready'?'2 · Perform and record':'1 · Connect your webcam'}</strong>
          <span>{status==='review'?result?.duration.toFixed(1)+'s captured · replay or add to timeline':
            status==='recording'?recordSeconds.toFixed(1)+' / '+maxDuration+' seconds':
            status==='ready'?(tracking==='live'?'Your character is live. Record when ready.':'Move your face and shoulders into the webcam view.'):
            'Record movement locally. Microphone is optional.'}</span>
        </div>
        <div className="performance-command-actions">
          {status==='idle'&&<button type="button" className="primary" disabled={!actor} onClick={()=>void prepare()}><Camera size={16}/> Enable camera</button>}
          {status==='ready'&&<button type="button" className="primary" onClick={begin}><Circle size={15}/> Record movement</button>}
          {status==='ready'&&<button type="button" className="quiet" onClick={resetCamera}>Camera settings</button>}
          {status==='recording'&&<button type="button" className="primary performance-stop" onClick={()=>void stop()}><Square size={14} fill="currentColor"/> Stop &amp; review</button>}
          {status==='review'&&<button type="button" className="quiet" disabled={replaying||!!previewError} onClick={()=>replay()}><Play size={15}/> Replay stabilized</button>}
          {status==='review'&&<button type="button" className="quiet" onClick={retake}><RotateCcw size={15}/> Retake</button>}
          {status==='review'&&<button type="button" className="primary" onClick={()=>void save()}><Check size={16}/> {previewOnly?'Audition this take':'Add to timeline'}</button>}
          {(status==='loading'||status==='processing')&&<span className="performance-busy" role="status">{status==='loading'?'Starting webcam…':'Finishing take…'}</span>}
        </div>
      </div>
      <div className="performance-views">
        <section className="performance-view" aria-label="Your webcam">
          <div className="performance-view-heading"><span>YOU · CAMERA</span><span className="performance-view-badge">{status==='recording'?'Recording':status==='review'?'Take finished':status==='ready'?'Camera active':'Camera off'}</span></div>
          <div className="performance-camera">
            <video ref={camera} autoPlay playsInline muted aria-label="Live mirrored webcam video for performance capture"/>
            <canvas ref={overlay} width={320} height={240} className="performance-landmark-overlay" aria-hidden="true"/>
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
        <strong>{observedGesture&&tracking==='live'?'✦ '+observedGesture:
          status==='recording'?trackedFrames+' frames captured':tracking==='live'?'Live motion connected':'Local tracking'}</strong>
      </div>
      <details className="performance-gesture-guide"><summary>Performance diagnostics</summary><p>Capture: {diagnostics.mode} · inference {diagnostics.inference} ms · observation age {diagnostics.latency} ms · render {diagnostics.fps} FPS · tracking {diagnostics.observations} FPS. Observation age excludes display and camera sensor latency.</p>{(['left','right'] as const).map(side=>{const arm=motionStabilizer.current.armDiagnostics()[side];return arm?<p key={side}>{side} arm: pole {arm.chosen} · scores {arm.negative.toFixed(1)} / {arm.positive.toFixed(1)} · reach {(arm.extension*100).toFixed(0)}% · elbow confidence {(arm.quality*100).toFixed(0)}%{arm.straight?' · straight-arm protection':''}{arm.blocked?' · pole flip blocked':''}</p>:null;})}</details>
      <div className="performance-controls">
        <details className="performance-gesture-guide"><summary>Recording settings</summary><label>Maximum take length <select aria-label="Maximum take length" value={recordingLimit} disabled={status==='recording'||status==='processing'||status==='review'} onChange={e=>setRecordingLimit(recordingLimits.find(v=>v===Number(e.target.value))??120)}>{recordingLimits.map(v=><option key={v} value={v}>{v/60===Math.floor(v/60)?v/60+' min':v+' sec'}</option>)}</select></label><p>Default: 2 minutes. Maximum: 3 minutes per scene. Available at this playhead: {Math.floor(maxDuration)} seconds.</p></details>

        <div className="performance-facing-section">
          <span className="performance-facing-title">Character facing direction</span><label><input type="checkbox" checked={autoFacing} disabled={status==='recording'||status==='processing'||status==='review'} onChange={e=>{setAutoFacing(e.target.checked);motionStabilizer.current.reset();}}/> Automatically mirror body turns</label>
          <div className="performance-facing-picker" role="group" aria-label="Character facing direction">
            <button type="button" className={facing==='front'?'active':''} aria-pressed={facing==='front'}
              disabled={autoFacing||status==='recording'||status==='processing'}
              onClick={()=>setFacing('front')}><UserRound size={15}/> Front</button>
            <button type="button" className={facing==='left'?'active':''} aria-pressed={facing==='left'}
              disabled={status==='recording'||status==='processing'}
              onClick={()=>setFacing('left')}><ArrowLeft size={15}/> ¾ Front Left</button>
            <button type="button" className={facing==='right'?'active':''} aria-pressed={facing==='right'}
              disabled={status==='recording'||status==='processing'}
              onClick={()=>setFacing('right')}><ArrowRight size={15}/> ¾ Front Right</button>
          </div>
          <small>Automatic mode uses measured shoulder orientation. Switch it off to lock the body to your chosen direction. The head can turn independently.</small>
        </div>
        <div className="performance-values">
          <label>Exaggeration {intensity}%<input type="range" min="50" max="180" step="10" value={intensity} disabled={status==='recording'} onChange={e=>setIntensity(Number(e.target.value))}/></label>
          <label>Movement sensitivity: {smoothing>=85?'Cinematic':smoothing>=50?'Natural':smoothing>0?'Expressive':'Raw'}<input aria-label="Movement sensitivity" type="range" min="0" max="95" step="5" value={95-smoothing} disabled={status==='recording'||status==='processing'} onChange={e=>setSmoothing(95-Number(e.target.value))}/></label>
          <small>Stable ← movement sensitivity → Responsive. Natural ignores small tracking noise and keeps deliberate holds. Raw minimizes the intent gate.</small>
          <div role="group" aria-label="Movement presets">
            {([['Cinematic',95],['Natural',50],['Expressive',25],['Raw',0]] as const).map(([name,value])=><button key={name} type="button" aria-pressed={smoothing===value} disabled={status==='recording'||status==='processing'} onClick={()=>setSmoothing(value)}>{name}</button>)}
          </div>
        </div>
        <div className="performance-toggles">
          <fieldset className="performance-tracking-parts" disabled={status!=='idle'}><legend>Track body parts</legend>
            <div className="performance-tracking-presets">
              <button type="button" onClick={()=>changeChannels({...defaultTrackingSelection})}>Upper body</button>
              <button type="button" onClick={()=>changeChannels({...defaultTrackingSelection,head:false,torso:false,arms:false,hands:true})}>Fingers only</button>
              <button type="button" onClick={()=>changeChannels({...defaultTrackingSelection,head:true,face:true,eyes:true,torso:false,arms:false,hands:false})}>Face only</button>
              <button type="button" onClick={()=>changeChannels({head:true,face:true,eyes:true,torso:true,hips:true,legs:true,arms:true,hands:true})}>Full body</button>
            </div>
            {Object.entries(channelLabels).map(([name,label])=><label key={name}><input type="checkbox" checked={channels[name as keyof TrackingSelection]} onChange={e=>changeChannels({...channels,[name]:e.target.checked})}/>{label}</label>)}
            <small>Disabled parts keep their authored animation. Use Camera settings to change models while live. Face and eyes share one detector; body joints share the Pose detector.</small>
          </fieldset>
          <label><input type="checkbox" checked={trackingOverlay} onChange={e=>setTrackingOverlay(e.target.checked)}/> Show tracking points</label>
          {!previewOnly&&<label><input type="checkbox" checked={recordVoice} disabled={status!=='idle'} onChange={e=>setRecordVoice(e.target.checked)}/> <Mic size={14}/> Also record voice (optional)</label>}
        </div>
        <details className="performance-gesture-guide">
          <summary>Gesture guide · fists, pointing, prayer and more</summary>
          <p>Close your fingers for a <b>fist</b>, extend just the index finger to <b>point</b>, extend index and middle for <b>two</b>, extend index, middle and ring for <b>three</b>, or close four fingers and extend your thumb for <b>thumbs up</b>. Each of the five fingers is tracked independently. Keep your hands within the frame. Bring both open hands together at chest height for <b>prayer</b>; move them to your head for <b>hands on head</b>. Keep two fists near your face for a <b>guard stance</b>, or extend one clenched arm for a <b>punch pose</b>.</p>
          <p>Keep hands and wrists visible and well lit. Two-hand interactions require both wrists and usable body tracking; the system does not invent gestures from hidden hands.</p>
        </details>
        {channels.hands&&<p className="performance-help" aria-live="polite">Left hand: <strong>{handReadout.left}</strong> · Right hand: <strong>{handReadout.right}</strong></p>}
        <p className="performance-help">Head: <strong>{channels.head?liveHeadFacing:'Off'}</strong> · Face and eyes can be tracked independently. Keep fingers visible and well lit.</p>
        <p className="performance-help" role="status">{message}</p>
        <p className="performance-help">Use the recording toolbar above the camera preview to start, stop, replay, retake or save. No microphone is needed for movement.</p>
        {status==='review'&&result&&<>
          <button type="button" className="quiet" disabled={replaying||!!previewError} onClick={()=>replay(true)}>Compare unfiltered motion</button>
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
            {!previewOnly&&<button type="button" className="quiet" onClick={()=>saveActingDNA(actor,style)}><WandSparkles size={14}/> Apply motion style to character</button>}
          </div>}
          <p className="performance-help">{previewOnly?'Audition this take returns the recorded motion to the temporary character preview. Nothing is added to the project timeline.':'Name your performance here, then use Add to timeline in the toolbar above. Your movement will appear on the Performance track.'}</p>
        </>}
        <div className="performance-privacy"><ShieldAlert size={15}/> Raw camera video is not stored. The character is controlled locally; only compact pose keys and an optional voice recording are saved. Face tracking can be disabled for slower computers.</div>
      </div>
    </div>
  </Modal>;
}
