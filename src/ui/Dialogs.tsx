import { storageError } from '../services/localMedia.ts';
import { outputSize, type ExportQuality } from '../engine/exportQuality.ts';
import { formatLabel } from '../engine/videoFormats.ts';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, AudioLines, Captions, CircleHelp, Clapperboard, Cloud, Copy, Download, FileAudio, FolderOpen, Mic, Plus, Save, Sparkles, Square, Trash2, WandSparkles, Pencil, Check, X } from 'lucide-react';
import { animations, clamp } from '../engine/animation.ts';
import { soundNames } from '../engine/presets.ts';
import { actionLayer, actionUsesProp, propActions, usesSeat, soundDurations, transitionNames, vfxNames } from '../engine/performanceCatalog.ts';
import { anchorFor, compatibleObject, compatibleObjects } from '../engine/interactions.ts';
import { actions, expressions, label, shots, shotCompositions, shotLabel, cameraAngles, cameraMovements, trackNames, tracks, uid, type Action, type Clip, type Project, type Prop, type Scene, type Track, type Character } from '../engine/schema.ts';
import { exportFormatLabel, type Format } from '../engine/videoFormats.ts';
import { projectDuration } from '../engine/evaluate.ts';
import type { Account } from '../services/cloud.ts';
import { audioLength, putAudio } from '../services/audio.ts';
import { analyzeLocalLipSync } from '../services/localLipSync.ts';
import { RecordingWaveform } from './RecordingWaveform.tsx';

import { browserExporter, canExportVideo } from '../services/export.ts';
import type { SavedProject } from '../services/projects.ts';
import { clipLabel, clock, formats, IconButton, Modal, Select, trackIcon } from './shared.tsx';
import { CameraShotSelect, cameraDirectionHint } from './CameraShotSelect.tsx';

export type ClipRequest = { track?: Track; action?: Action; actor?: string; target?:string; start?:number };
type BodyClip=Extract<Clip,{track:'body'}>;
export function AddClipDialog({ close, request, scene, actors, time, add, audio, path, point, throwTo }: { close: () => void; request: ClipRequest; scene: Scene; actors: Record<string, string>; time: number; path:(actor:string,gait:'walk'|'run',start:number)=>void; point:(actor:string,action:'point'|'reach',start:number)=>void; add: (clip: Clip, newProp?:Prop['kind']) => void;
  throwTo:(clip:BodyClip,newProp:Prop['kind']|undefined)=>void; audio: (track: 'dialogue' | 'audio' | 'music', actor: string, start: number) => void }) {
  const [track, setTrack] = useState<Exclude<Track,'performance'>>(request.track==='performance'?'body':request.track??'body');
  const addableTracks=tracks.filter((item):item is Exclude<Track,'performance'>=>item!=='performance');
  const [presence, setPresence] = useState<'show'|'hide'|'span'>('show');
  const [actor, setActor] = useState(request.actor ?? Object.keys(actors)[0] ?? '');
  const [action, setAction] = useState<Action>(request.action ?? 'idle');
  const [layer, setLayer] = useState<'body' | 'gesture'>(actionLayer(request.action??'idle'));
  const [target, setTarget] = useState(request.target??''), [expression, setExpression] = useState<typeof expressions[number]>('happy');
  const [shot, setShot] = useState<typeof shots[number]>('medium'), [transition, setTransition] = useState<'cut' | 'glide'>('cut');
  const [composition,setComposition]=useState<'none'|typeof shotCompositions[number]>('none');
  const [cameraAngle,setCameraAngle]=useState<typeof cameraAngles[number]>('eye-level');
  const [cameraMovement,setCameraMovement]=useState<typeof cameraMovements[number]>('none');
  const [cameraStrength,setCameraStrength]=useState(1);
  const [effect, setEffect] = useState<typeof transitionNames[number]>('fade-in'), [sound, setSound] = useState<typeof soundNames[number]>('pop');
  const [vfx,setVfx]=useState<typeof vfxNames[number]>('impact-boom');
  const [text,setText]=useState('');
  const [gait, setGait] = useState<'walk' | 'run'>(request.action === 'run' ? 'run' : 'walk');
  const [interaction, setInteraction] = useState<'equip' | 'release' | 'open' | 'close'>('equip');
  const [start, setStart] = useState(clamp(request.start??time, 0, scene.duration - .1));
  const [length, setLength] = useState(request.action ? Math.max(1, animations[request.action].duration) : request.track==='audio'?soundDurations.pop:request.track==='transition'?.5:request.track==='vfx'?.75:2);
  const needsActor = ['actors', 'movement', 'body', 'face', 'gaze', 'props', 'dialogue'].includes(track);
  const place = scene.actors.find(item => item.id === actor);
  const holdables = scene.objects.filter(item => ['hold','open'].includes(anchorFor(item)?.action??''));
  const cueTargets = track === 'gaze' ? ['camera', ...Object.keys(actors).filter(id => id !== actor), ...scene.objects.map(item => item.id)] : holdables.map(item => item.id);
  const cueTarget = cueTargets.includes(target) ? target : cueTargets[0];
  const door = scene.objects.find(item=>item.id===cueTarget)?.kind==='door';
  const resolvedInteraction = door ? (interaction==='close'?'close':'open') : (interaction==='release'?'release':'equip');
  const choices = compatibleObjects(scene, action);
  const needsProp=track==='body'&&actionUsesProp(action);
  const defaultProp=needsProp?(propActions[action][0]??(action==='put-down'?undefined:'ball')):undefined;
  const createOption=defaultProp?'new:'+defaultProp:'';
  const selectedTarget=choices.some(item=>item.id===target)||target===createOption&&!!createOption
    ?target:needsProp?(choices[0]?.id??createOption):'';
  const focusProp=request.target?scene.objects.find(item=>item.id===request.target):undefined;
  const actionOptions=focusProp?actions.filter(item=>actionUsesProp(item)&&compatibleObject(focusProp,item)):actions;
  function submit() {
    const at = clamp(start, 0, scene.duration - .1);
    const base = { id: uid(), start: at, length: clamp(length, .1, scene.duration - at) };
    if (track === 'dialogue' || track === 'music') { audio(track, actor, at); return; }
    if (track === 'camera') return add({
      ...base, track, shot, transition,
      ...(composition!=='none'?{composition}:{}),
      ...(actor?{focus:actor}:{}),
      ...(cameraAngle!=='eye-level'?{angle:cameraAngle}:{}),
      ...(cameraMovement!=='none'?{movement:cameraMovement,strength:cameraStrength}:{})
    });
    if (track === 'text') return add({ ...base, track, text:text.trim(), x:480,y:190,color:'#ffffff',size:44,style:'title' });
    if (track === 'vfx') return add({ ...base, track, effect:vfx,x:480,y:252,strength:1 });
    if (track === 'transition') return add({ ...base, track, effect });
    if (track === 'audio') return add({ ...base, track, name: label(sound), asset: `builtin:${sound}`, volume: .75, muted: false, offset: 0 });
    if (!place) return;
    if (track === 'actors') return add({ ...base, track, actor,
      ...(presence==='span'?{}:{length:.1,visible:presence==='show'}) });
    if (track === 'movement') return path(actor,gait,at);
    if (track === 'body' && (action==='walk'||action==='run')) return path(actor,action,at);
    if (track === 'body' && (action==='point'||action==='reach')) return point(actor,action,at);
    if (track === 'gaze') return cueTarget ? add({ ...base, track, actor, target: cueTarget }) : undefined;
    if (track === 'props') return cueTarget ? add({ ...base, track, actor, target: cueTarget, interaction:resolvedInteraction }) : undefined;
    if (track === 'face') return add({ ...base, track, actor, expression });
    const create=defaultProp&&createOption===selectedTarget?defaultProp:undefined;
    const body:BodyClip={...base,track,actor,action,layer:usesSeat(action)?'body':layer,
      ...(selectedTarget&&!create?{target:selectedTarget}:{})};
    if(action==='throw-prop')return throwTo(body,create);
    return add(body,create);
  }
  const drawsPath=track==='movement'||(track==='body'&&(action==='walk'||action==='run'));
  const placesPoint=track==='body'&&(action==='point'||action==='reach');
  return <Modal title="Add timeline clip" description="Choose what happens at the playhead." close={close}><form onSubmit={e => { e.preventDefault(); submit(); }}>
    <div className="dialog-fields"><label className="field">Track<Select aria="Track" value={track} options={addableTracks} onChange={value=>{setTrack(value);if(value==='audio')setLength(soundDurations[sound]);if(value==='transition')setLength(.5);if(value==='vfx')setLength(.75);}} render={id => trackNames[id]}/></label>
    {(needsActor || track === 'camera') && <label className="field">{track === 'camera' ? 'Focus' : 'Actor'}<Select aria="Actor" value={actor} onChange={value => { setActor(value); setTarget(request.target??''); }} options={track === 'camera' ? ['', ...Object.keys(actors),...scene.objects.map(prop=>prop.id)] : Object.keys(actors)} render={id => actors[id] ?? scene.objects.find(prop=>prop.id===id)?.name ?? 'Automatic'}/></label>}
    {needsActor && !actor && <p className="form-error">Add an actor to the scene first.</p>}
    {track==='actors'&&<><label className="field">On-screen event<Select aria="Actor visibility event"
      value={presence} onChange={setPresence} options={['show','hide','span'] as const}
      render={value=>value==='show'?'Show from this time':value==='hide'?'Hide from this time':'Visible only during clip'}/></label>
      <p className="small-text">Use Show/Hide to let characters enter and leave. Visible-only clips use their own duration.</p></>}
    {track === 'body' && <><div className="field-row">
      <label className="field">Action<Select aria="Action" value={action} onChange={value=>{
        setAction(value);setLength(Math.max(1,animations[value].duration));setTarget(request.target??'');setLayer(actionLayer(value));
      }} options={actionOptions}/></label>
      <label className="field">Layer<Select aria="Layer" value={usesSeat(action)?'body':layer} onChange={setLayer}
        options={usesSeat(action)?['body'] as const:['body','gesture'] as const}/></label>
    </div>
      {usesSeat(action)&&<p className="small-text">Place the character where you want them to sit. A chair or sofa is optional.</p>}
      {(choices.length>0||needsProp)&&<label className="field">{usesSeat(action)?'Seat':'Prop'}
        <Select aria={usesSeat(action)?'Seat':'Interact with'} value={selectedTarget} onChange={setTarget}
          options={[...(needsProp?[]:['']),...choices.map(item=>item.id),...(createOption?[createOption]:[])]}
          render={id=>id===createOption&&defaultProp?'Add a '+label(defaultProp).toLowerCase():id===''?'No prop':choices.find(item=>item.id===id)?.name??'No prop'}/>
      </label>}
      {needsProp&&!selectedTarget&&<p className="small-text">Place a holdable prop in the scene first.</p>}
    </>}
    {(track === 'gaze' || track === 'props') && <label className="field">Target<Select aria="Cue target" value={cueTarget ?? ''} options={cueTargets} onChange={setTarget} render={id => actors[id] ?? scene.objects.find(item => item.id === id)?.name ?? label(id)}/></label>}
    {track === 'props' && <label className="field">Interaction<Select aria="Prop interaction" value={interaction} options={['equip', 'release']} onChange={setInteraction}/></label>}
    {track === 'movement' && <label className="field">Travel pace<Select aria="Travel pace" value={gait} options={['walk', 'run']} onChange={setGait}/></label>}
    {drawsPath&&<p className="small-text">Click the start and finish on the stage. Shift-click adds waypoints between them.</p>}
    {placesPoint&&<p className="small-text">Click the target on the stage.</p>}
    {track==='text'&&<label className="field">On-screen text<textarea aria-label="On-screen text" value={text} maxLength={180} rows={3} onChange={event=>setText(event.target.value)} required/></label>}
    {track==='vfx'&&<label className="field">Visual effect<Select aria="Visual effect" value={vfx} onChange={setVfx} options={vfxNames}/></label>}
    {track === 'face' && <label className="field">Expression<Select aria="Expression" value={expression} onChange={setExpression} options={expressions}/></label>}
    {track==='camera'&&<div className="camera-direction-fields">
      <label className="field">Shot size / classic preset
        <CameraShotSelect aria="Shot size or classic preset" value={shot} onChange={setShot}/>
      </label>
      <label className="field">Subject framing / perspective
        <Select aria="Camera subject composition" value={composition}
          onChange={setComposition} options={['none',...shotCompositions] as const}
          render={value=>value==='none'?'None · use shot size':shotLabel(value)}/>
      </label>
      <div className="field-row">
        <label className="field">Camera angle
          <Select aria="Camera angle" value={cameraAngle} onChange={setCameraAngle} options={cameraAngles}/>
        </label>
        <label className="field">Camera movement
          <Select aria="Camera movement" value={cameraMovement} onChange={setCameraMovement} options={cameraMovements}/>
        </label>
      </div>
      <div className="field-row">
        <label className="field">Transition
          <Select aria="Camera transition" value={transition} onChange={setTransition} options={['cut','glide']}/>
        </label>
        {cameraMovement!=='none'&&<label className="field">Movement intensity
          <input aria-label="Camera movement intensity" type="number" min=".25" max="2.5" step=".25"
            value={cameraStrength} onChange={event=>setCameraStrength(clamp(Number(event.target.value)||1,.25,2.5))}/>
        </label>}
      </div>
      <p className="camera-direction-hint">{cameraDirectionHint(shot,cameraAngle,cameraMovement,composition==='none'?undefined:composition)}</p>
    </div>}
    {track === 'transition' && <label className="field">Effect<Select aria="Effect" value={effect} onChange={setEffect} options={transitionNames}/></label>}
    {(track === 'audio') && <label className="field">Sound effect<Select aria="Sound effect" value={sound} onChange={value=>{setSound(value);setLength(soundDurations[value]);}} options={soundNames}/></label>}
    <div className="field-row"><label className="field">Start (seconds)<input aria-label="Clip start" type="number" value={Math.round(start * 100) / 100} min={0} max={scene.duration - .1} step="any" onChange={e => setStart(Number(e.target.value))}/></label>{track !== 'dialogue' && !drawsPath && !placesPoint && <label className="field">Length (seconds)<input aria-label="Clip length" type="number" value={length} min={.1} max={180} step="any" onChange={e => setLength(Number(e.target.value))}/></label>}</div></div>
    <footer className="modal-footer">{(track === 'audio' || track === 'music') && <button type="button" className="quiet" onClick={() => audio(track, '', start)}><FileAudio size={16}/> Upload audio</button>}<span className="spacer"/><button type="button" className="quiet" onClick={close}>Cancel</button><button className="primary" disabled={(needsActor && !actor) || (needsProp&&!selectedTarget) || (track === 'text' && !text.trim()) || (['gaze', 'props'].includes(track) && !cueTarget) }><Plus size={16}/>{track === 'dialogue' ? 'Continue to dialogue' : drawsPath?'Draw path on stage':placesPoint?'Pick target on stage':track==='body'&&action==='throw-prop'?'Pick landing on stage':'Add clip'}</button></footer>
  </form></Modal>;
}

export type AudioRequest = { track: 'dialogue' | 'audio' | 'music'; actor?: string; start: number; replaceId?: string };
export function AudioDialog({ request, actors, scene, account, add, close }: { request: AudioRequest; actors: Record<string, string>; characters: Character[]; scene: Scene; account: Account | null; add: (clip: Clip) => void; close: () => void }) {
  const isDialogue=request.track==='dialogue';
  const [actor,setActor]=useState(request.actor??Object.keys(actors)[0]??''),[start,setStart]=useState(clamp(request.start,0,scene.duration-.1));
  const [asset,setAsset]=useState<{blob:Blob;url:string;length:number;name:string}>();
  const [busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),stream=useRef<MediaStream | undefined>(undefined),recorder=useRef<MediaRecorder | undefined>(undefined),limit=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(limit.current);stream.current?.getTracks().forEach(t=>t.stop());if(recorder.current?.state==='recording')recorder.current.stop();};},[]);
  useEffect(()=>()=>{if(asset)URL.revokeObjectURL(asset.url);},[asset]);
  async function work(task:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await task();}catch(e){if(alive.current)setError(storageError(e));}finally{if(alive.current)setBusy(false);}}
  async function load(blob:Blob,name:string){
    if(!blob.size||blob.size>20*1024*1024)throw Error('Choose an audio file smaller than 20 MB.');
    let length:number;try{length=await audioLength(blob);}catch{throw Error('This audio could not be decoded. Try WAV, MP3, M4A or WebM.');}
    if(length<.1 || length>(isDialogue?180:1200))
      throw Error(isDialogue?'Record dialogue between 0.1 and 180 seconds.':'Use a song or sound effect shorter than 20 minutes.');
    if(alive.current)setAsset({blob,name,url:URL.createObjectURL(blob),length});
  }
  async function record(){
    if(recorder.current?.state==='recording'){clearTimeout(limit.current);recorder.current.stop();return;}
    await work(async()=>{
      setAsset(undefined);
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Recording is unavailable in this browser. Upload audio instead.');
      let input:MediaStream;try{input=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}catch(e){throw Error(e instanceof DOMException&&e.name==='NotAllowedError'?'Microphone permission was denied. Allow the microphone in your browser or upload audio.':'No working microphone was found. Connect one or upload audio.');}
      if(!alive.current){input.getTracks().forEach(t=>t.stop());return;}
      stream.current=input;
      try{
        const mic=new MediaRecorder(input);recorder.current=mic;const chunks:Blob[]=[];
        mic.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        mic.onstop=()=>{clearTimeout(limit.current);input.getTracks().forEach(t=>t.stop());if(alive.current){setRecording(false);void work(()=>load(new Blob(chunks,{type:mic.mimeType.split(';')[0]||'audio/webm'}),'Voice recording'));}};
        mic.onerror=()=>{clearTimeout(limit.current);input.getTracks().forEach(t=>t.stop());if(alive.current){setRecording(false);setError('The recording stopped unexpectedly. Try again or upload audio.');}};
        mic.start();setRecording(true);limit.current=setTimeout(()=>{if(mic.state==='recording')mic.stop();},179000);
      }catch(e){input.getTracks().forEach(t=>t.stop());throw e;}
    });
  }
  async function save(){await work(async()=>{
    if(!asset)return;
    const analysis=isDialogue?await analyzeLocalLipSync(asset.blob):undefined;
    if(!alive.current)return;
    const id=uid();
    // Commit the recording locally before a timeline can reference it.
    // Cloud uploads happen only when the creator requests a backup.
    await putAudio(id,asset.blob);if(!alive.current)return;
    const common={id:uid(),start,length:Math.min(asset.length,scene.duration-start),asset:'asset:'+id,offset:0,volume:1,muted:false};
    if(isDialogue&&analysis)add({...common,track:'dialogue',actor,text:'',visemes:analysis.cues,lipSync:{source:'dsp',engine:analysis.engine,cacheKey:analysis.cacheKey,analyzedDuration:analysis.duration}});
    else if(request.track==='music')add({...common,track:'music',name:asset.name.slice(0,80)});
    else add({...common,track:'audio',name:asset.name.slice(0,80)});
  });}
  return <Modal title={isDialogue?(request.replaceId?'Replace voice':'Give your character a voice'):request.track==='music'?'Add music':'Add sound'} description={isDialogue?'Record yourself or upload audio. Mouth animation is created automatically on this device.':request.track==='music'?'Choose a soundtrack to place on the Music track. MP3, WAV, M4A and WebM supported.':'Choose a sound effect to place on the SFX track. MP3, WAV, M4A and WebM supported.'} close={close}>
    <div className="dialog-fields">{isDialogue&&<label className="field">Character<Select aria="Dialogue actor" value={actor} options={Object.keys(actors)} onChange={setActor} render={id=>actors[id]}/></label>}
    <div className="voice-source-buttons"><button className={recording?'danger':'primary'} disabled={busy} onClick={()=>void record()}>{recording?<Square size={19}/>:<Mic size={19}/>} {recording?'Stop recording':isDialogue?'Record voice':request.track==='music'?'Record music':'Record sound'}</button><label className="quiet file-button"><FileAudio size={18}/>{isDialogue?'Upload voice':request.track==='music'?'Upload music':'Upload SFX'}<input type="file" aria-label={isDialogue?'Upload voice recording':request.track==='music'?'Upload background music':'Upload sound effect'} accept="audio/*,.mp3,.wav,.ogg,.webm,.m4a" disabled={busy||recording} onChange={e=>{const file=e.target.files?.[0];if(file)void work(()=>load(file,file.name.replace(/\.[^.]+$/,'')));e.target.value='';}}/></label></div>
    <RecordingWaveform stream={recording?stream.current:null} recording={recording} preview={asset?.blob}/>
    {asset&&<><audio controls src={asset.url} aria-label="Preview audio"/><p className="small-text">{asset.name} · {asset.length.toFixed(2)} seconds</p></>}
    <p className="small-text">Projects, recordings and imported media are saved in this browser.</p>
    <label className="field">Start on timeline (seconds)<input aria-label="Recording start" type="number" min={0} max={scene.duration-.1} step={.01} value={start} onChange={e=>setStart(clamp(Number(e.target.value),0,scene.duration-.1))}/></label>
    {asset&&asset.length+start>scene.duration&&<p className="small-text">This recording will trim at the scene end. Extend the scene to hear the rest.</p>}
    {busy&&<p role="status">Preparing audio and automatic lip sync…</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div><footer className="modal-footer"><button className="quiet" onClick={close}>Cancel</button><span className="spacer"/><button className="primary" disabled={!asset||busy||recording||(isDialogue&&!actor)} onClick={()=>void save()}>{request.replaceId?'Replace recording':'Add to timeline'}</button></footer>
  </Modal>;
}

export function ExportDialog({ project, initialFormat, initialSubtitles, close }: { project: Project; initialFormat: Format; initialSubtitles: boolean; close: () => void }) {
  const [format, setFormat] = useState(initialFormat), [subtitles, setSubtitles] = useState(initialSubtitles), [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(''), [download, setDownload] = useState<{ url: string; extension: string }>();
  const [quality,setQuality]=useState<ExportQuality>('balanced');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  const exportAvailable = canExportVideo();
  const start = async () => {
    const controller = new AbortController(); request.current = controller; setError(''); setProgress(0); setDownload(undefined);
    try {
      const movie = await browserExporter.run(project, format, subtitles, controller.signal, setProgress, quality);
      if (!controller.signal.aborted) setDownload({ url: URL.createObjectURL(movie.blob), extension: movie.extension });
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Export failed.'); }
    finally { if (request.current === controller) { request.current = null; setProgress(null); } }
  };
  const filename = project.name.replace(/[^\w -]/g, '').trim().replaceAll(' ', '-') || 'cartoon';
  return <Modal title="Export video" description="Render every scene in project order, with voices and sound mixed in." close={close}>
    <div className="dialog-fields"><div className="export-summary"><Clapperboard size={25}/><div><strong>{project.name}</strong><small>{project.scenes.length} {project.scenes.length === 1 ? 'scene' : 'scenes'} · {clock(projectDuration(project.scenes))}</small></div></div>
    <label className="field">Frame size<Select aria="Export frame size" value={format} onChange={value=>{setFormat(value);setDownload(undefined);}} options={formats} render={formatLabel} disabled={progress!==null}/></label>
    <label className="field">Export quality<Select aria="Export quality" value={quality} onChange={value=>{setQuality(value);setDownload(undefined);}} options={['balanced','full'] as const} render={value=>(value==='balanced'?'720p · Lower memory':'Full resolution')+' · '+outputSize(format,value).join(' × ')} disabled={progress!==null}/></label>
    <label className="check"><input type="checkbox" checked={subtitles} disabled={progress!==null} onChange={e => {setSubtitles(e.target.checked);setDownload(undefined);}}/><Captions size={16}/> Include subtitles</label>
    <p className="small-text">{exportAvailable ? '30 fps. MP4 when supported by your browser, with WebM as the fallback. Keep this tab visible during export.' : 'This browser cannot export video with audio.'}</p>
    {progress !== null && <div className="export-progress"><span role="status">Rendering video… {Math.round(progress * 100)}%</span><progress value={progress} max={1}/></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{download && <video className="export-preview" controls src={download.url} aria-label="Exported video preview"/>}
    {format==='9:16'&&download?.extension==='webm'&&<p className="small-text">This browser produced a WebM. TikTok uploads use MP4 or another supported video format.</p>}</div>
    <footer className="modal-footer"><span className="spacer"/>{progress !== null ? <button className="quiet" onClick={() => request.current?.abort()}>Cancel export</button> : <><button className="quiet" onClick={close}>Close</button>{download ? <a className="primary" href={download.url} download={`${filename}.${download.extension}`}><Download size={17}/> Download {download.extension.toUpperCase()}</a> : <button className="primary" disabled={!exportAvailable} onClick={() => void start()}><Download size={17}/> Render video</button>}</>}</footer>
  </Modal>;
}

export function ProjectsDialog({ items, current, close, create, open, duplicate, remove, demo, backup, restore, recover }: { items: SavedProject[]; current: string; close: () => void; create: () => void; open: (project: Project) => void; duplicate: (project: Project) => void; remove: (project: Project) => void; demo: () => void; backup: () => void; restore: () => void; recover?:()=>void }) {
  return <Modal title="Projects" description="Open a saved cartoon or start something new." close={close}>
    <div className="dialog-fields"><div className="project-list">{items.map(({ project, updated }) => <div className="project-row" key={project.id}><button className="project-title" onClick={() => open(project)}><Clapperboard size={19}/><span><strong>{project.name}</strong><small>{project.id === current ? 'Currently open' : new Date(updated).toLocaleDateString()} · {project.scenes.length} scene{project.scenes.length > 1 ? 's' : ''}</small></span></button><IconButton title={`Duplicate ${project.name}`} onClick={() => duplicate(project)}><Copy size={15}/></IconButton><IconButton title={`Delete ${project.name}`} onClick={() => remove(project)}><Trash2 size={15}/></IconButton></div>)}
      {!items.length && <p className="empty-small">Save your first project and it will appear here.</p>}</div><button className="quiet full" onClick={demo}><Clapperboard size={16}/> Open “The Missing Rent Money” example</button></div>
    <footer className="modal-footer"><button className="quiet" onClick={backup}>Download backup</button><button className="quiet" onClick={restore}>Restore backup</button>{recover&&<button className="quiet" onClick={recover}>Recover previous save</button>}<span className="spacer"/><button className="primary" onClick={create}><Plus size={16}/> New project</button></footer>
  </Modal>;
}
export function ScenesDialog({ scenes, active, close, add, open, rename, reorder, copy, drop, savePreset }: {
  scenes: Scene[];active:string;close:()=>void;add:()=>void;open:(scene:Scene)=>void;
  rename:(id:string,name:string)=>void;reorder:(id:string,direction:number)=>void;
  copy:(scene:Scene)=>void;drop:(scene:Scene)=>void;savePreset:(scene:Scene)=>void;
}) {
  const [renaming,setRenaming]=useState<string>();
  const [name,setName]=useState(''),[error,setError]=useState('');
  const total=scenes.reduce((sum,scene)=>sum+scene.duration,0);
  function begin(scene:Scene){setRenaming(scene.id);setName(scene.name);setError('');}
  function commit(){
    if(!renaming)return;
    const title=name.trim();
    if(!title||title.length>70){setError('Enter a scene name (1–70 characters).');return;}
    try{rename(renaming,title);setRenaming(undefined);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Could not rename scene.');}
  }
  return <Modal wide title="Your movie scenes"
    description={`${scenes.length} scenes · ${Math.round(total)} seconds of storytelling. Reorder scenes to change playback and export order.`}
    close={close}>
    <div className="dialog-fields"><div className="scene-manage-list">
      {scenes.map((scene,index)=><article className={scene.id===active?'scene-manage-card is-current':'scene-manage-card'} key={scene.id}>
        <button className="scene-manage-number" onClick={()=>open(scene)} title={`Open scene ${index+1}`}>
          {String(index+1).padStart(2,'0')}</button>
        <div className="scene-manage-details">
          {renaming===scene.id?<form className="scene-manage-rename" onSubmit={event=>{event.preventDefault();commit();}}>
            <input autoFocus value={name} maxLength={70} aria-label="Scene name"
              onChange={event=>setName(event.target.value)}
              onKeyDown={event=>{if(event.key==='Escape')setRenaming(undefined);}}/>
            <button className="quiet" type="submit" aria-label="Save scene name"><Check size={15}/></button>
            <button className="quiet" type="button" aria-label="Cancel rename" onClick={()=>setRenaming(undefined)}><X size={15}/></button>
          </form>:<button className="scene-manage-title" onClick={()=>open(scene)}>
            <strong>{scene.name}</strong>
            <small>{scene.environment} · {scene.duration}s · {scene.clips.length} clips
              {scene.id===active?' · Currently open':''}</small></button>}
        </div>
        <div className="scene-manage-actions">
          <IconButton title="Rename scene" onClick={()=>begin(scene)}><Pencil size={15}/></IconButton>
          <IconButton title="Move scene earlier" disabled={index===0} onClick={()=>reorder(scene.id,-1)}><ArrowUp size={15}/></IconButton>
          <IconButton title="Move scene later" disabled={index===scenes.length-1} onClick={()=>reorder(scene.id,1)}><ArrowDown size={15}/></IconButton>
          <IconButton title="Save this furnished world" onClick={()=>savePreset(scene)}><Save size={15}/></IconButton>
          <IconButton title="Duplicate scene" disabled={scenes.length>=30} onClick={()=>copy(scene)}><Copy size={15}/></IconButton>
          <IconButton title={scenes.length===1?'Clear only scene':'Delete scene'} onClick={()=>drop(scene)}><Trash2 size={15}/></IconButton>
        </div>
      </article>)}
    </div>{!!error&&<p className="form-error" role="alert">{error}</p>}
      <p className="small-text">Each scene keeps its own world, actors, camera and clips. Deleting the last scene replaces it with a blank one. Undo restores your scene.</p>
    </div>
    <footer className="modal-footer"><span className="spacer"/>
      <button className="quiet" onClick={close}>Close</button>
      <button className="primary" disabled={scenes.length>=30} onClick={add}><Plus size={16}/> Add scene</button>
    </footer>
  </Modal>;
}
export function AccountDialog({ available, account, login, logout, close, backup, downloadCloud }: { available: boolean; account: Account | null; login: (email: string, password: string, register: boolean) => Promise<void>; logout: () => Promise<void>; close: () => void; backup?:()=>Promise<void>; downloadCloud?:()=>Promise<void> }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function cloudAction(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(error){setError(error instanceof Error?error.message:'Cloud operation failed.');}finally{setBusy(false);}}
  async function submit() { setBusy(true); setError(''); try { if (account) await logout(); else await login(email.trim(), password, register); close(); } catch (error) { setError(error instanceof Error ? error.message : 'Authentication failed.'); } finally { setBusy(false); } }
  return <Modal title={account ? 'Your account' : register ? 'Create an account' : 'Sign in'} description={available ? 'Projects save on this device. Cloud backup and downloads happen only when you choose.' : 'This studio currently saves projects on this device.'} close={close}><form onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="dialog-fields">{available && !account && <><label className="field">Email<input type="email" autoComplete="email" value={email} required onChange={e => setEmail(e.target.value)}/></label><label className="field">Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)}/></label><button type="button" className="quiet" onClick={() => setRegister(value => !value)}>{register ? 'I already have an account' : 'Create an account'}</button></>}{account && <div className="export-summary"><Cloud size={23}/><strong>{account.email}</strong></div>}{account&&<div className="field-row">{backup&&<button type="button" className="quiet" disabled={busy} onClick={()=>void cloudAction(backup)}>Back up current cartoon online</button>}{downloadCloud&&<button type="button" className="quiet" disabled={busy} onClick={()=>void cloudAction(downloadCloud)}>Download cloud cartoons as copies</button>}</div>}{!available && <p className="small-text">Cloud sign-in is available when a Firebase project is connected. You can create, reopen, and export cartoons here in the meantime.</p>}{error && <p className="form-error">{error}</p>}</div>
    <footer className="modal-footer"><span className="spacer"/><button type="button" className="quiet" onClick={close}>{available ? 'Cancel' : 'Continue in this browser'}</button>{available && <button className="primary" disabled={busy}>{busy ? 'Working…' : account ? 'Sign out' : register ? 'Create account' : 'Sign in'}</button>}</footer>
  </form></Modal>;
}
export function HelpDialog({ close, demo }: { close: () => void; demo: () => void }) {
  return <Modal title="Make your first cartoon" description="Start with the editable example and make it your own." close={close}><div className="dialog-fields"><ol className="quick-start"><li><strong>Build your cast.</strong> Pick a character to change their look, or press + to add them to the scene.</li><li><strong>Set the scene.</strong> Pick a world, add props and use Arrange to place them.</li><li><strong>Direct the performance.</strong> Add action, dialogue and camera clips. Drag or trim clips to change their timing.</li><li><strong>Watch and share.</strong> Play with Space, save your project and export the finished video.</li></ol><p className="small-text">Install SIRVIBE from your browser menu, or use Share → Add to Home Screen in Safari. Wait for “Ready offline” before disconnecting. Keep a downloaded backup of work you want to keep if browser data is cleared.</p><div className="keyboard-help"><kbd>Space</kbd> Play / pause <kbd>Ctrl + Z</kbd> Undo <kbd>Delete</kbd> Remove</div></div><footer className="modal-footer"><span className="spacer"/><button className="quiet" onClick={close}>Back to studio</button><button className="primary" onClick={demo}><Clapperboard size={16}/> Open example</button></footer></Modal>;
}
export function DirectorDialog({ generate, example, close }: { generate?: (story: string) => Promise<void>; example: () => void; close: () => void }) {
  const [story, setStory] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal title="Story director" description={generate ? 'Describe a short story to turn it into an editable project.' : 'Explore a scripted example built with the same tools you can use in the studio.'} close={close}><div className="dialog-fields">{generate ? <label className="field">Story<textarea value={story} maxLength={2500} onChange={e => setStory(e.target.value)} placeholder="Zee is trying to stay quiet while Bra Sbu records a podcast…"/></label> : <div className="export-summary"><WandSparkles size={24}/><div><strong>Who Ate My Food?</strong><small>30 seconds · 2 actors · editable timeline</small></div></div>}{error && <p className="form-error">{error}</p>}</div><footer className="modal-footer"><span className="spacer"/><button className={generate ? 'quiet' : 'primary'} onClick={example}><Clapperboard size={16}/> Open example</button>{generate && <button className="primary" disabled={busy || story.trim().length < 5} onClick={async () => { setBusy(true); setError(''); try { await generate(story); } catch (error) { setError(error instanceof Error ? error.message : 'Could not direct the story.'); setBusy(false); } }}><Sparkles size={16}/>{busy ? 'Directing…' : 'Generate project'}</button>}</footer></Modal>;
}
