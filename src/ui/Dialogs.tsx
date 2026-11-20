import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, AudioLines, Captions, CircleHelp, Clapperboard, Cloud, Copy, Download, FileAudio, FolderOpen, Mic, Plus, Save, Sparkles, Square, Trash2, WandSparkles, Pencil, Check, X } from 'lucide-react';
import { animations, clamp, gaitSpeeds } from '../engine/animation.ts';
import { soundNames } from '../engine/presets.ts';
import { anchorFor, compatibleObjects, nearestObject } from '../engine/interactions.ts';
import { actions, expressions, label, shots, trackNames, tracks, uid, type Action, type Clip, type Project, type Scene, type Track, type Character } from '../engine/schema.ts';
import { type Format } from '../engine/renderer.ts';
import { evaluate, projectDuration } from '../engine/evaluate.ts';
import type { Account } from '../services/cloud.ts';
import { audioLength, putAudio } from '../services/audio.ts';
import { analyzeLipSync } from '../services/lipSync.ts';
import { speechProvider, voices, synthesizeCached } from '../services/speech.ts';
import { browserExporter, exportCodec } from '../services/export.ts';
import type { SavedProject } from '../services/projects.ts';
import { clipLabel, clock, formats, IconButton, Modal, Select, trackIcon } from './shared.tsx';

export type ClipRequest = { track?: Track; action?: Action; actor?: string };
export function AddClipDialog({ close, request, scene, actors, time, add, audio }: { close: () => void; request: ClipRequest; scene: Scene; actors: Record<string, string>; time: number; add: (clip: Clip) => void; audio: (track: 'dialogue' | 'audio' | 'music', actor: string, start: number) => void }) {
  const [track, setTrack] = useState<Track>(request.track ?? 'body');
  const [actor, setActor] = useState(request.actor ?? Object.keys(actors)[0] ?? '');
  const [action, setAction] = useState<Action>(request.action ?? 'walk');
  const [layer, setLayer] = useState<'body' | 'gesture'>(request.action && ['wave', 'point', 'nod', 'shake', 'talk'].includes(request.action) ? 'gesture' : 'body');
  const [target, setTarget] = useState(''), [expression, setExpression] = useState<typeof expressions[number]>('happy');
  const [shot, setShot] = useState<typeof shots[number]>('medium'), [transition, setTransition] = useState<'cut' | 'glide'>('cut');
  const [effect, setEffect] = useState<'fade-in' | 'fade-out'>('fade-in'), [sound, setSound] = useState<typeof soundNames[number]>('pop');
  const [gait, setGait] = useState<'walk' | 'run'>(request.action === 'run' ? 'run' : 'walk');
  const [interaction, setInteraction] = useState<'equip' | 'release'>('equip');
  const [start, setStart] = useState(clamp(time, 0, scene.duration - .1));
  const [length, setLength] = useState(request.action ? Math.max(1, animations[request.action].duration) : 2);
  const needsActor = ['actors', 'movement', 'body', 'face', 'gaze', 'props', 'dialogue'].includes(track);
  const place = scene.actors.find(item => item.id === actor);
  const [toX, setToX] = useState((place?.x ?? 480) + 145);
  const [toY, setToY] = useState(place?.y ?? 420);
  const evaluated = evaluate(scene, start).actors.find(item => item.id === actor);
  const travel = Math.hypot(toX - (evaluated?.x ?? 0), toY - (evaluated?.y ?? 0));
  const travelLength = Math.max(.1, travel / (gaitSpeeds[gait] * (place?.scale ?? 1)));
  const holdables = scene.objects.filter(item => anchorFor(item)?.action === 'hold');
  const cueTargets = track === 'gaze' ? ['camera', ...Object.keys(actors).filter(id => id !== actor), ...scene.objects.map(item => item.id)] : holdables.map(item => item.id);
  const cueTarget = cueTargets.includes(target) ? target : cueTargets[0];
  const choices = compatibleObjects(scene, action);
  const seat = action === 'sit' ? nearestObject(scene, actor, 'sit') : undefined;
  const selectedTarget = action === 'sit'
    ? choices.find(item => item.id === target)?.id ?? seat?.id ?? ''
    : choices.some(item => item.id === target) ? target : '';
  function submit() {
    const at = clamp(start, 0, scene.duration - .1);
    const base = { id: uid(), start: at, length: clamp(length, .1, scene.duration - at) };
    if (track === 'dialogue' || track === 'music') { audio(track, actor, at); return; }
    if (track === 'camera') return add({ ...base, track, shot, transition, ...(actor ? { focus: actor } : {}) });
    if (track === 'transition') return add({ ...base, track, effect });
    if (track === 'audio') return add({ ...base, track, name: label(sound), asset: `builtin:${sound}`, volume: .75, muted: false, offset: 0 });
    if (!place) return;
    if (track === 'actors') return add({ ...base, track, actor });
    if (track === 'movement' && evaluated && travelLength <= scene.duration - at + .0001)
      return add({ ...base, length: travelLength, track, actor, gait, fromX: evaluated.x, fromY: evaluated.y, toX: clamp(toX, -2000, 3000), toY: clamp(toY, -2000, 3000) });
    if (track === 'movement') return;
    if (track === 'gaze') return cueTarget ? add({ ...base, track, actor, target: cueTarget }) : undefined;
    if (track === 'props') return cueTarget ? add({ ...base, track, actor, target: cueTarget, interaction }) : undefined;
    if (track === 'face') return add({ ...base, track, actor, expression });
    if (action === 'sit' && !selectedTarget) return;
    return add({ ...base, track, actor, action, layer: action === 'sit' ? 'body' : layer,
      ...(selectedTarget ? { target: selectedTarget } : {}) });
  }
  return <Modal title="Add timeline clip" description="Choose what happens at the playhead." close={close}><form onSubmit={e => { e.preventDefault(); submit(); }}>
    <div className="dialog-fields"><label className="field">Track<Select aria="Track" value={track} options={tracks} onChange={setTrack} render={id => trackNames[id]}/></label>
    {(needsActor || track === 'camera') && <label className="field">{track === 'camera' ? 'Focus' : 'Actor'}<Select aria="Actor" value={actor} onChange={value => { setActor(value); setTarget(''); const item = scene.actors.find(entry => entry.id === value); if (item) { setToX(item.x + 145); setToY(item.y); } }} options={track === 'camera' ? ['', ...Object.keys(actors)] : Object.keys(actors)} render={id => actors[id] ?? 'Automatic'}/></label>}
    {needsActor && !actor && <p className="form-error">Add an actor to the scene first.</p>}
    {track === 'body' && <><div className="field-row"><label className="field">Action<Select aria="Action" value={action} onChange={value => { setAction(value); setTarget(''); if (value === 'sit') setLayer('body'); }} options={actions}/></label><label className="field">Layer<Select aria="Layer" value={action === 'sit' ? 'body' : layer} onChange={setLayer} options={action === 'sit' ? ['body'] as const : ['body', 'gesture'] as const}/></label></div>{action === 'sit' && !choices.length && <p className="form-error" role="alert">Add a chair or sofa to this scene before making a character sit.</p>}
      {!!choices.length && <label className="field">{action === 'sit' ? 'Sit on' : 'Interact with'}<Select aria={action === 'sit' ? 'Seat' : 'Interact with'} value={selectedTarget} onChange={setTarget}
        options={action === 'sit' ? choices.map(item => item.id) : ['', ...choices.map(item => item.id)]}
        render={id => choices.find(item => item.id === id)?.name ?? 'Empty hands'}/></label>}</>}
    {(track === 'gaze' || track === 'props') && <label className="field">Target<Select aria="Cue target" value={cueTarget ?? ''} options={cueTargets} onChange={setTarget} render={id => actors[id] ?? scene.objects.find(item => item.id === id)?.name ?? label(id)}/></label>}
    {track === 'props' && <label className="field">Interaction<Select aria="Prop interaction" value={interaction} options={['equip', 'release']} onChange={setInteraction}/></label>}
    {track === 'movement' && <><label className="field">Travel pace<Select aria="Travel pace" value={gait} options={['walk', 'run']} onChange={setGait}/></label><div className="field-row"><label className="field">End X<input type="number" value={toX} onChange={e => setToX(Number(e.target.value))}/></label><label className="field">End Y<input type="number" value={toY} onChange={e => setToY(Number(e.target.value))}/></label></div><small>{travelLength.toFixed(2)} seconds at {gait} pace</small>{travelLength > scene.duration - start && <p className="form-error">Move the start earlier or choose a closer destination.</p>}</>}
    {track === 'face' && <label className="field">Expression<Select aria="Expression" value={expression} onChange={setExpression} options={expressions}/></label>}
    {track === 'camera' && <div className="field-row"><label className="field">Shot<Select aria="Shot" value={shot} onChange={setShot} options={shots}/></label><label className="field">Transition<Select aria="Transition" value={transition} onChange={setTransition} options={['cut', 'glide']}/></label></div>}
    {track === 'transition' && <label className="field">Effect<Select aria="Effect" value={effect} onChange={setEffect} options={['fade-in', 'fade-out']}/></label>}
    {(track === 'audio') && <label className="field">Sound effect<Select aria="Sound effect" value={sound} onChange={setSound} options={soundNames}/></label>}
    <div className="field-row"><label className="field">Start (seconds)<input aria-label="Clip start" type="number" value={Math.round(start * 100) / 100} min={0} max={scene.duration - .1} step="any" onChange={e => setStart(Number(e.target.value))}/></label>{track !== 'dialogue' && track !== 'movement' && <label className="field">Length (seconds)<input aria-label="Clip length" type="number" value={length} min={.1} max={180} step="any" onChange={e => setLength(Number(e.target.value))}/></label>}</div></div>
    <footer className="modal-footer">{(track === 'audio' || track === 'music') && <button type="button" className="quiet" onClick={() => audio(track, '', start)}><FileAudio size={16}/> Upload audio</button>}<span className="spacer"/><button type="button" className="quiet" onClick={close}>Cancel</button><button className="primary" disabled={(needsActor && !actor) || (track === 'movement' && travelLength > scene.duration - start) || (['gaze', 'props'].includes(track) && !cueTarget) || (track === 'body' && action === 'sit' && !selectedTarget)}><Plus size={16}/>{track === 'dialogue' ? 'Continue to dialogue' : 'Add clip'}</button></footer>
  </form></Modal>;
}

export type AudioRequest = { track: 'dialogue' | 'audio' | 'music'; actor?: string; start: number };
export function AudioDialog({ request, actors, characters, scene, account, add, close }: { request: AudioRequest; actors: Record<string, string>; characters: Character[]; scene: Scene; account: Account | null; add: (clip: Clip) => void; close: () => void }) {
  const isDialogue = request.track === 'dialogue';
  const getVoice = (actorId:string) => characters.find(c=>c.id===scene.actors.find(a=>a.id===actorId)?.characterId);
  const initialActor=request.actor || Object.keys(actors)[0] || '';
  const [actor, setActor] = useState(initialActor), [text, setText] = useState(''),
    [voice, setVoice] = useState<string>(getVoice(initialActor)?.voicePreset ?? 'warm');
  const [start, setStart] = useState(clamp(request.start, 0, scene.duration - .1)), [name, setName] = useState('');
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [asset, setAsset] = useState<{ blob: Blob; url: string; length: number; generationText?: string }>();
  const [lipStatus, setLipStatus] = useState('');
  const recorder = useRef<MediaRecorder | undefined>(undefined), inputStream = useRef<MediaStream | undefined>(undefined), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; inputStream.current?.getTracks().forEach(track => track.stop()); if (recorder.current?.state === 'recording') recorder.current.stop(); }; }, []);
  useEffect(() => () => { if (asset) URL.revokeObjectURL(asset.url); }, [asset]);
  async function load(blob: Blob, label: string, generationText?:string) {
    if (blob.size >= 20 * 1024 * 1024) throw new Error('Choose an audio file smaller than 20 MB.');
    const length = await audioLength(blob);
    if (length < .1) throw new Error('The recording is too short.');
    if (alive.current) { setAsset({ blob, url: URL.createObjectURL(blob), length, generationText }); setName(label); }
  }
  async function work(command: () => Promise<void>) {
    setBusy(true); setError('');
    try { await command(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not load audio.'); } finally { if (alive.current) setBusy(false); }
  }
  async function record() {
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return; }
    await work(async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Microphone recording is unavailable. Upload audio instead.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { stream.getTracks().forEach(track => track.stop()); return; }
      inputStream.current = stream;
      try {
        const mic = new MediaRecorder(stream); recorder.current = mic;
        const chunks: Blob[] = [];
        mic.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        mic.onstop = () => { stream.getTracks().forEach(track => track.stop()); if (!alive.current) return; setRecording(false); void work(() => load(new Blob(chunks, { type: mic.mimeType.split(';')[0] || 'audio/webm' }), 'Microphone recording')); };
        mic.onerror = () => { stream.getTracks().forEach(track => track.stop()); setRecording(false); setError('The microphone recording failed.'); };
        mic.start(); setRecording(true);
      } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
    });
  }
  const save = () => work(async () => {
    if (!asset) return;
    if (isDialogue && asset.generationText && asset.generationText!==text.trim())
      throw new Error('The dialogue text changed since speech generation. Generate the updated line before adding it.');
    const at = clamp(start, 0, scene.duration - .1);
    const id = uid(); await putAudio(id, asset.blob);
    const common = { id: uid(), start: at, length: clamp(asset.length, .1, scene.duration - at), asset: `asset:${id}`, volume: 1, muted: false, offset: 0 };
    if (isDialogue) {
      const analysis = await analyzeLipSync(asset.blob, text.trim(), asset.length,{
        token:await account?.getIdToken().catch(()=>undefined)
      });
      if (!alive.current) return;
      setLipStatus(analysis.source === 'rhubarb' ? 'Rhubarb audio-derived mouth cues ready and cached.'
        : 'Estimated lip-sync (NOT Rhubarb). '+(analysis.reason??'Analyzer unavailable.'));
      add({ ...common, track: 'dialogue', text: text.trim(), actor, voicePreset:voice as 'warm'|'bright'|'deep', visemes: analysis.cues,
        lipSync:{source:analysis.source,engine:analysis.engine,analyzedDuration:analysis.analyzedDuration,
          ...(analysis.cacheKey?{cacheKey:analysis.cacheKey}:{})} });
    } else {
      if (!alive.current) return;
      const title = name.trim().slice(0, 80);
      if (request.track === 'music') add({ ...common, track: 'music', name: title || 'Music' });
      else add({ ...common, track: 'audio', name: title || 'SFX' });
    }
  });
  return <Modal title={isDialogue ? 'Add dialogue' : request.track === 'music' ? 'Add music' : 'Add sound effect'} description={isDialogue ? 'Generate a voice, record your own, or attach an audio file.' : request.track === 'music' ? 'Import a soundtrack or music loop.' : 'Import a sound effect or recording.'} close={close}>
    <div className="dialog-fields">{isDialogue && <><label className="field">Actor<Select aria="Dialogue actor" value={actor} onChange={value=>{setActor(value);setVoice(getVoice(value)?.voicePreset??'warm');}} options={Object.keys(actors)} render={id => actors[id]}/></label>{!actor && <p className="form-error">Add an actor to the scene first.</p>}<label className="field">Dialogue<textarea value={text} maxLength={400} onChange={e => setText(e.target.value)} placeholder="What does your character say?"/></label><div className="field-row"><label className="field">Voice<Select aria="Voice" value={voice} onChange={setVoice} options={voices.map(item => item.id)} render={id => voices.find(item => item.id === id)!.name}/></label><button disabled={!text.trim() || busy || recording} className="quiet generate-voice" onClick={() => work(async () => load(await synthesizeCached(speechProvider(account),text,voice,getVoice(actor)?.hostedVoiceId), 'Generated voice',text.trim()))}><Sparkles size={16}/> Generate voice</button></div>{(!account || import.meta.env.VITE_HOSTED_SPEECH !== 'true') && <p className="small-text">Voice generation runs on this device. The first use downloads the voice engine.</p>}</>}
    <div className="field-row"><label className={`quiet file-button ${busy || recording ? 'disabled' : ''}`}><FileAudio size={16}/> Upload audio<input type="file" accept="audio/*,.webm" disabled={busy || recording} onChange={e => { const file = e.target.files?.[0]; if (file) void work(() => load(file, file.name.replace(/\.[^.]+$/, ''))); e.currentTarget.value = ''; }}/></label><button className={`quiet ${recording ? 'recording' : ''}`} disabled={busy} onClick={() => void record()}>{recording ? <Square size={15}/> : <Mic size={16}/>} {recording ? 'Stop recording' : 'Record voice'}</button></div>
    {asset && <><audio controls src={asset.url} aria-label="Preview audio"/>{!isDialogue && <label className="field">Name<input value={name} maxLength={80} onChange={e => setName(e.target.value)}/></label>}</>}
    <label className="field">Start (seconds)<input type="number" step=".01" min={0} max={scene.duration - .1} value={Math.round(start * 100) / 100} onChange={e => setStart(Number(e.target.value))}/></label>
    {asset && start + asset.length > scene.duration && <p className="small-text">Audio will trim at the end of this scene.</p>}
    {lipStatus && <p className="small-text" role="status">{lipStatus}</p>}{busy && <p className="small-text" role="status">Preparing audio / syncing mouth cues…</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>
    <footer className="modal-footer"><span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="primary" disabled={!asset || busy || recording || (isDialogue && !actor)} onClick={() => void save()}><Plus size={16}/> Add to timeline</button></footer>
  </Modal>;
}

export function ExportDialog({ project, initialFormat, initialSubtitles, close }: { project: Project; initialFormat: Format; initialSubtitles: boolean; close: () => void }) {
  const [format, setFormat] = useState(initialFormat), [subtitles, setSubtitles] = useState(initialSubtitles), [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState(''), [download, setDownload] = useState<{ url: string; extension: string }>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  const codec = exportCodec();
  const start = async () => {
    const controller = new AbortController(); request.current = controller; setError(''); setProgress(0); setDownload(undefined);
    try {
      const movie = await browserExporter.run(project, format, subtitles, controller.signal, setProgress);
      if (!controller.signal.aborted) setDownload({ url: URL.createObjectURL(movie.blob), extension: movie.extension });
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Export failed.'); }
    finally { if (request.current === controller) { request.current = null; setProgress(null); } }
  };
  const filename = project.name.replace(/[^\w -]/g, '').trim().replaceAll(' ', '-') || 'cartoon';
  return <Modal title="Export video" description="Render every scene in project order, with voices and sound mixed in." close={close}>
    <div className="dialog-fields"><div className="export-summary"><Clapperboard size={25}/><div><strong>{project.name}</strong><small>{project.scenes.length} {project.scenes.length === 1 ? 'scene' : 'scenes'} · {clock(projectDuration(project.scenes))}</small></div></div>
    <label className="field">Frame size<Select aria="Export frame size" value={format} onChange={setFormat} options={formats} render={id => id === '16:9' ? '16:9 · 1280 × 720' : id === '9:16' ? '9:16 · 720 × 1280' : '1:1 · 720 × 720'}/></label>
    <label className="check"><input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)}/><Captions size={16}/> Include subtitles</label>
    <p className="small-text">{codec ? `Format: ${codec.includes('mp4') ? 'MP4' : 'WebM'} · 30 fps target. Keep this tab visible while the cartoon renders.` : 'This browser cannot export a canvas video with audio.'}</p>
    {progress !== null && <div className="export-progress"><span role="status">Rendering video… {Math.round(progress * 100)}%</span><progress value={progress} max={1}/></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{download && <video className="export-preview" controls src={download.url} aria-label="Exported video preview"/>}</div>
    <footer className="modal-footer"><span className="spacer"/>{progress !== null ? <button className="quiet" onClick={() => request.current?.abort()}>Cancel export</button> : <><button className="quiet" onClick={close}>Close</button>{download ? <a className="primary" href={download.url} download={`${filename}.${download.extension}`}><Download size={17}/> Download {download.extension.toUpperCase()}</a> : <button className="primary" disabled={!codec} onClick={() => void start()}><Download size={17}/> Render video</button>}</>}</footer>
  </Modal>;
}

export function ProjectsDialog({ items, current, close, create, open, duplicate, remove, demo, backup, restore }: { items: SavedProject[]; current: string; close: () => void; create: () => void; open: (project: Project) => void; duplicate: (project: Project) => void; remove: (project: Project) => void; demo: () => void; backup: () => void; restore: () => void }) {
  return <Modal title="Projects" description="Open a saved cartoon or start something new." close={close}>
    <div className="dialog-fields"><div className="project-list">{items.map(({ project, updated }) => <div className="project-row" key={project.id}><button className="project-title" onClick={() => open(project)}><Clapperboard size={19}/><span><strong>{project.name}</strong><small>{project.id === current ? 'Currently open' : new Date(updated).toLocaleDateString()} · {project.scenes.length} scene{project.scenes.length > 1 ? 's' : ''}</small></span></button><IconButton title={`Duplicate ${project.name}`} onClick={() => duplicate(project)}><Copy size={15}/></IconButton><IconButton title={`Delete ${project.name}`} onClick={() => remove(project)}><Trash2 size={15}/></IconButton></div>)}
      {!items.length && <p className="empty-small">Save your first project and it will appear here.</p>}</div><button className="quiet full" onClick={demo}><Clapperboard size={16}/> Open “The Missing Rent Money” example</button></div>
    <footer className="modal-footer"><button className="quiet" onClick={backup}>Download backup</button><button className="quiet" onClick={restore}>Restore backup</button><span className="spacer"/><button className="primary" onClick={create}><Plus size={16}/> New project</button></footer>
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
          <IconButton title="Delete scene" disabled={scenes.length===1} onClick={()=>drop(scene)}><Trash2 size={15}/></IconButton>
        </div>
      </article>)}
    </div>{!!error&&<p className="form-error" role="alert">{error}</p>}
      <p className="small-text">Each scene keeps its own world, actors, camera and clips. The film plays them in this order. Undo restores a deleted or rearranged scene.</p>
    </div>
    <footer className="modal-footer"><span className="spacer"/>
      <button className="quiet" onClick={close}>Close</button>
      <button className="primary" disabled={scenes.length>=30} onClick={add}><Plus size={16}/> Add scene</button>
    </footer>
  </Modal>;
}
export function AccountDialog({ available, account, login, logout, close }: { available: boolean; account: Account | null; login: (email: string, password: string, register: boolean) => Promise<void>; logout: () => Promise<void>; close: () => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit() { setBusy(true); setError(''); try { if (account) await logout(); else await login(email.trim(), password, register); close(); } catch (error) { setError(error instanceof Error ? error.message : 'Authentication failed.'); } finally { setBusy(false); } }
  return <Modal title={account ? 'Your account' : register ? 'Create an account' : 'Sign in'} description={available ? 'Keep your private projects available across devices.' : 'This studio currently saves projects on this device.'} close={close}><form onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className="dialog-fields">{available && !account && <><label className="field">Email<input type="email" autoComplete="email" value={email} required onChange={e => setEmail(e.target.value)}/></label><label className="field">Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={e => setPassword(e.target.value)}/></label><button type="button" className="quiet" onClick={() => setRegister(value => !value)}>{register ? 'I already have an account' : 'Create an account'}</button></>}{account && <div className="export-summary"><Cloud size={23}/><strong>{account.email}</strong></div>}{!available && <p className="small-text">Cloud sign-in is available when a Firebase project is connected. You can create, reopen, and export cartoons here in the meantime.</p>}{error && <p className="form-error">{error}</p>}</div>
    <footer className="modal-footer"><span className="spacer"/><button type="button" className="quiet" onClick={close}>{available ? 'Cancel' : 'Continue in this browser'}</button>{available && <button className="primary" disabled={busy}>{busy ? 'Working…' : account ? 'Sign out' : register ? 'Create account' : 'Sign in'}</button>}</footer>
  </form></Modal>;
}
export function HelpDialog({ close, demo }: { close: () => void; demo: () => void }) {
  return <Modal title="Make your first cartoon" description="Start with the editable example and make it your own." close={close}><div className="dialog-fields"><ol className="quick-start"><li><strong>Build your cast.</strong> Pick a character to change their look, or press + to add them to the scene.</li><li><strong>Set the scene.</strong> Pick a world, add props and use Arrange to place them.</li><li><strong>Direct the performance.</strong> Add action, dialogue and camera clips. Drag or trim clips to change their timing.</li><li><strong>Watch and share.</strong> Play with Space, save your project and export the finished video.</li></ol><div className="keyboard-help"><kbd>Space</kbd> Play / pause <kbd>Ctrl + Z</kbd> Undo <kbd>Delete</kbd> Remove</div></div><footer className="modal-footer"><span className="spacer"/><button className="quiet" onClick={close}>Back to studio</button><button className="primary" onClick={demo}><Clapperboard size={16}/> Open example</button></footer></Modal>;
}
export function DirectorDialog({ generate, example, close }: { generate?: (story: string) => Promise<void>; example: () => void; close: () => void }) {
  const [story, setStory] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal title="Story director" description={generate ? 'Describe a short story to turn it into an editable project.' : 'Explore a scripted example built with the same tools you can use in the studio.'} close={close}><div className="dialog-fields">{generate ? <label className="field">Story<textarea value={story} maxLength={2500} onChange={e => setStory(e.target.value)} placeholder="Zee is trying to stay quiet while Bra Sbu records a podcast…"/></label> : <div className="export-summary"><WandSparkles size={24}/><div><strong>Who Ate My Food?</strong><small>30 seconds · 2 actors · editable timeline</small></div></div>}{error && <p className="form-error">{error}</p>}</div><footer className="modal-footer"><span className="spacer"/><button className={generate ? 'quiet' : 'primary'} onClick={example}><Clapperboard size={16}/> Open example</button>{generate && <button className="primary" disabled={busy || story.trim().length < 5} onClick={async () => { setBusy(true); setError(''); try { await generate(story); } catch (error) { setError(error instanceof Error ? error.message : 'Could not direct the story.'); setBusy(false); } }}><Sparkles size={16}/>{busy ? 'Directing…' : 'Generate project'}</button>}</footer></Modal>;
}
