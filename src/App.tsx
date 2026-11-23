import { OfflineStatus } from './ui/OfflineStatus.tsx';
import { requestDurableStorage, storageError } from './services/localMedia.ts';
import { projectAssets } from './services/audio.ts';
import { actionLayer, actionUsesProp, propActions, usesSeat, gaitStyleNames, gaitStyles, soundDurations, type GaitStyle } from './engine/performanceCatalog.ts';
import { insertWaypoint, stagePath, type MoveClip, type PathMode, type TravelGait } from './engine/stagePath.ts';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Captions, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Download, House, Maximize, MousePointer2, Pause, Play, Redo2, Repeat2, Save, Square, Moon, Sun, Undo2, UserRound, Volume2, VolumeX, Trash2, X, Camera } from 'lucide-react';
import { missingRentMovie } from './engine/production.ts';
import { animations, clamp, type Point } from './engine/animation.ts';
import { moveLayer, nextLayerDepth, type LayerMove } from './engine/sceneLayers.ts';
import { movieTiming, nextClipEdge, type MovieCursor } from './engine/movieTime.ts';
import { evaluate, locate, MOVIE_FRAME_RATE, projectDuration } from './engine/evaluate.ts';
import { makeProject, makeProp, makeScene, soundNames } from './engine/presets.ts';
import { makeActingDemoProject } from './engine/actingDemo.ts';
import { compatibleObject, compatibleObjects, objectDependencies, removeObjectWithDecisions, repairOrphanedObjectActions, replaceWorldObjects, type ObjectDependencyDecision } from './engine/interactions.ts';
import { label, shotLabel, SceneDefinition, props as propKinds, uid, type Action, type ActorData, type Character, type Clip, type Project, type Prop, type Scene, type Track } from './engine/schema.ts';
import { formatLabel, type Format } from './engine/videoFormats.ts';
import { cloudAudio, cloudEnabled, cloudProjects, uploadProject, listenAccount, login, logout, type Account } from './services/cloud.ts';
import { localStudioMode, LOCAL_PROJECT_SCOPE } from './services/localStudio.ts';
import { audioLength, getOrFetchAudio, createAudioMixer, stopSoundPreview, setRemoteAudio, type Mixer } from './services/audio.ts';
import { type Recognizer } from './services/lipSync.ts';
import { duplicateProject, readPreference, lastEditorSession, editorSessionFor, rememberEditorSession, type SavedProject, type ProjectCollection } from './services/projects.ts';
import { listDeviceProjects, mergeDeviceProjects, organizeDeviceProject, removeDeviceProject, renameDeviceProject, saveDeviceProject, migrateDeviceLibrary, previousDeviceProject, getDeviceProject, observeDeviceProject, takeDeviceWarnings } from './services/deviceProjects.ts';
import { characterUsage, removeCharacterFromProject, propUsage } from './engine/assetSafety.ts';
import { addMovieScene, duplicateMovieScene, renameMovieScene, reorderMovieScene, removeMovieScene } from './engine/sceneWorkflow.ts';


import { backupMovie, restoreMovie, portableProject } from './services/projectExchange.ts';
import { PrecisionLipSyncEditor } from './ui/PrecisionLipSyncEditor.tsx';
import { PerformanceStudio } from './ui/PerformanceStudio.tsx';
import type { MotionDNA } from './engine/performanceCapture.ts';
import './performance.css';
import { analyzeLocalLipSync } from './services/localLipSync.ts';
import { prepareArtwork } from './services/artwork.ts';
import { setMediaUser } from './services/media.ts';
import { addSceneActor, setActorVisibleAt, type ActorEntrance } from './engine/actorPresence.ts';
import { changeClipTiming, copyClip, currentScene, initial, removeEntity, useStudio, type Selection } from './studio.ts';
import { AssetLibrary } from './ui/AssetLibrary.tsx';
import { CharacterFactory } from './ui/CharacterFactory.tsx';
import { AccountDialog, AddClipDialog, AudioDialog, ExportDialog, HelpDialog, ProjectsDialog, ScenesDialog, type AudioRequest, type ClipRequest } from './ui/Dialogs.tsx';
import { ObjectDependenciesDialog } from './ui/ObjectDependenciesDialog.tsx';
import { Inspector } from './ui/Inspector.tsx';
import { Stage, type PreviewTime } from './ui/Stage.tsx';
import { clock, formats, IconButton, Modal, Select } from './ui/shared.tsx';
import { Timeline } from './ui/Timeline.tsx';
import { TimelineCodeDialog } from './ui/TimelineCodeDialog.tsx';
import { Welcome } from './ui/Welcome.tsx';
import { insertCameraShot, sceneToCode, validateSceneReplacement } from './engine/timelineCode.ts';
import { movieToCode, validateMovieReplacement } from './engine/movieTimeline.ts';
import { deleteMovementKeyframe, deleteTimelineClips, duplicateTimelineClips, pasteTimelineClips, resizeSceneTimeline, selectableClips, splitTimelineClips, translateSceneActor } from './engine/timelineEditing.ts';


function PanelResize({ side, value, change }: { side: 'left' | 'right'; value: number; change: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const set = (width: number) => change(clamp(width, 160, 370));
  const direction = side === 'left' ? 1 : -1;
  return <div role="separator" aria-label={side === 'left' ? 'Resize assets' : 'Resize inspector'}
    aria-orientation="vertical" aria-valuemin={160} aria-valuemax={370} aria-valuenow={value} tabIndex={0}
    className={`panel-resize panel-resize-${side}`}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      set(value + (event.key === 'ArrowRight' ? 12 : -12) * direction);
    }}
    onPointerDown={event => {
      drag.current = { x: event.clientX, width: value };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (drag.current) set(drag.current.width + (event.clientX - drag.current.x) * direction);
    }}
    onLostPointerCapture={() => { drag.current = null; }}
    onDoubleClick={() => change(side === 'left' ? 263 : 254)}/>;
}

const studioName = 'SIRVIBE';
type Placement =
  | {kind:'path';sceneId:string; start:number; points:Point[]; waypoint?:boolean; gait:TravelGait; style:GaitStyle;
      mode:PathMode; actor?:string; character?:string; editing?:string}
  | {kind:'point'|'recover'|'overlay';sceneId:string; start:number; id:string; action?:'point'|'reach'}
  | {kind:'prop-landing';sceneId:string;start:number;clip:Extract<Clip,{track:'body'}>;createProp?:Prop['kind'];editing?:boolean};
type Dialog = 'projects' | 'scenes' | 'character' | 'clip' | 'audio' | 'export' | 'account' | 'help' | 'director' | 'confirm' | 'dependencies' | 'ai' | 'code' | 'lipsync' | 'performance' | null;
type WorldPreset = { name: string; environment: Scene['environment']; objects: Prop[]; backgroundImage?: string };
const worldKey = (scope: string) => `toonroom.worlds.v1.${scope}`;
function worldPresets(scope: string): WorldPreset[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(worldKey(scope)) ?? '[]');
    if (!Array.isArray(items)) return [];
    return items.flatMap(item => {
      const parsed = SceneDefinition.safeParse({ id: 'world', name: item?.name, environment: item?.environment, objects: item?.objects, backgroundImage: item?.backgroundImage, actors: [], clips: [], duration: 30 });
      return parsed.success ? [{ name: parsed.data.name, environment: parsed.data.environment, objects: parsed.data.objects, backgroundImage: parsed.data.backgroundImage }] : [];
    });
  } catch { return []; }
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

export default function App() {
  const project = useStudio(state => state.project), scene = useStudio(currentScene), selection = useStudio(state => state.selection), library = useStudio(state => state.library);
  const selectedClipIds = useStudio(state => state.clipIds), selectedKeyframe = useStudio(state => state.selectedKeyframe);
  const hasUndo = useStudio(state => state.past.length > 0), hasRedo = useStudio(state => state.future.length > 0);
  const workspace='direct';
  const [home, setHome] = useState<'landing' | 'projects' | 'studio'>(()=>localStudioMode||new URLSearchParams(location.search).has('studio')?'projects':'landing');
  const [placement,setPlacement]=useState<Placement>();
  const [timelineTall,setTimelineTall]=useState(false);
  const arrowHold=useRef<{key:string;since:number}|undefined>(undefined);
  const [assetWidth, setAssetWidth] = useState(326), [inspectorWidth, setInspectorWidth] = useState(288);
  const [theme, setTheme] = useState(() => readPreference('toonroom.theme') === 'dark' ? 'dark' : 'light');
  const importFile = useRef<HTMLInputElement>(null);
  const session = useStudio(state => state.session);
  const sceneTarget = { session, sceneId: scene.id };
  const dirty = useStudio(state => state.dirty);
  const movie = useMemo(() => movieTiming(project.scenes), [project.scenes]);
  const sceneIndex = movie.byId.get(scene.id)?.index ?? 0;
  const [dialog, setDialog] = useState<Dialog>(null), [account, setAccount] = useState<Account | null>(null), [items, setItems] = useState<SavedProject[]>([]);
  const [cloudRequested,setCloudRequested]=useState(false);
  const scope = LOCAL_PROJECT_SCOPE;
  const [loadedScope,setLoadedScope]=useState<string>();
  const [worlds, setWorlds] = useState<WorldPreset[]>([]);
  const [saveStatus, setSaveStatus] = useState('Saved on device'), [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [factory, setFactory] = useState<Character>(), [requestedClip, setRequestedClip] = useState<ClipRequest>({});
  const [requestedAudio, setRequestedAudio] = useState<AudioRequest>({ track: 'dialogue', start: 0 });
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => void }>();
  const [dependentObjectId, setDependentObjectId] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('16:9'), [arrange, setArrange] = useState(true), [subtitles, setSubtitles] = useState(false), [quality, setQuality] = useState(true);
  const [playbackRange,setPlaybackRange]=useState<{start:number;end:number}|undefined>();
  const [snap, setSnap] = useState(true), [compact, setCompact] = useState(false), [focus, setFocus] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'stage' | 'library' | 'inspector'>('stage');
  const [playing, setPlaying] = useState(false), [preparing, setPreparing] = useState(false), [loop, setLoop] = useState(false), [muted, setMuted] = useState(false), [shot, setShot] = useState('wide');
  const mixer = useRef<Mixer | null>(null), time = useRef<PreviewTime>({ scene, local: 0, movie: 0 });
  const movieRef = useRef(movie);
  movieRef.current = movie;
  const range = useRef<HTMLInputElement>(null), counter = useRef<HTMLSpanElement>(null), frame = useRef(0), animationToken = useRef(0);
  const livePlaying = useRef(false), livePreparing = useRef(false), settings = useRef({ loop, muted, playbackRange }), originalScope = useRef(scope);
  const localDeletes = useRef(new Set<string>());
  const timelineClipboard = useRef<{ projectId: string; sceneId: string; clips: Clip[] } | null>(null);
  settings.current = { loop, muted, playbackRange };
  const actorNames = Object.fromEntries(scene.actors.map(actor => [actor.id, project.characters.find(character => character.id === actor.characterId)?.name ?? 'Actor']));
  const getPlayhead=useCallback(()=>time.current.local,[]);
  const tell = useCallback((message: string, error = false) => setNotice({ message, error }), []);
  const toggleTheme = () => setTheme(current => {
    const value = current === 'dark' ? 'light' : 'dark';
    try {localStorage.setItem('toonroom.theme', value);} catch {tell('Theme changed for this session. Browser preferences could not be saved.');}
    return value;
  });
  const close = () => setDialog(null);
  const showError = (error: unknown) => tell(errorMessage(error), true);
  useEffect(() => { if (notice) { const timer = window.setTimeout(() => setNotice(null), notice.error ? 7200 : 3200); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { document.title = home==='landing' ? 'SIRVIBE — Make the stories only you can tell' : `${project.name} · ${studioName}`; }, [project.name,home]);
  useEffect(() => {
    if (window.matchMedia('(max-width: 790px)').matches || ((navigator as Navigator & {deviceMemory?:number}).deviceMemory??4)<=4) setQuality(false);
  }, []);
  useEffect(() => {
    if (localStudioMode || !cloudEnabled || !cloudRequested) return;
    let dispose: (() => void) | undefined, alive = true;
    listenAccount(user => { if (alive) { setAccount(user); } }).then(unsubscribe => { if (alive) dispose = unsubscribe; else unsubscribe(); }).catch(err => { if(alive){tell(errorMessage(err),true);} });
    return () => { alive = false; dispose?.(); };
  }, [tell,cloudRequested]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); mixer.current?.close(); }, []);
  useEffect(() => {
    if(home!=='studio')return;
    const remember=()=>{
      const current=useStudio.getState();
      try{rememberEditorSession(scope,{
        projectId:current.project.id,sceneId:current.sceneId,workspace,
        playhead:time.current.scene.id === current.sceneId ? time.current.local : 0
      });}catch(error){console.warn('Could not save editor position',error);}
    };
    remember();
    const timer=window.setInterval(remember,2500);
    window.addEventListener('pagehide',remember);
    return ()=>{remember();window.clearInterval(timer);window.removeEventListener('pagehide',remember);};
  },[home,scope,workspace,project.id,scene.id]);

  function updateCursor(scene: Scene, pos: number, redraw: boolean, movieTime?: number, reveal = false) {
    const timing = movieRef.current;
    const start = timing.byId.get(scene.id)?.start ??
      movieTiming(useStudio.getState().project.scenes).byId.get(scene.id)?.start ?? 0;
    const at = movieTime ?? start + pos;
    time.current = { scene, local: pos, movie: at };
    if (range.current) range.current.value = String(at);
    if (counter.current) counter.current.textContent = clock(at);
    window.dispatchEvent(new CustomEvent('toonroom-time', { detail: pos }));
    window.dispatchEvent(new CustomEvent<MovieCursor>('sirvibe-movie-time', { detail: { at, reveal } }));
    if (redraw) window.dispatchEvent(new Event('toonroom-seek'));
  }
  function pause() {
    animationToken.current++;
    cancelAnimationFrame(frame.current);
    mixer.current?.stop();
    livePlaying.current = false; livePreparing.current = false;
    setPlaying(false); setPreparing(false); setArrange(true);
  }
  function loadProject(next: Project, edited = false) {
    pause();setPlaybackRange(undefined);setPlacement(undefined); setArrange(true);  close();
    useStudio.getState().open(next, edited);
    updateCursor(currentScene(useStudio.getState()), 0, false);
    setSaveStatus(edited ? 'Saving…' : 'Saved on device');
  }
  useEffect(()=>{
    setMediaUser(account);
    setRemoteAudio(account ? id=>cloudAudio(account,id) : undefined);
  },[account]);
  useEffect(() => {
    let alive=true;
    void (async()=>{
      try {
        await migrateDeviceLibrary(scope);
        const local=await listDeviceProjects(scope);
        if(!alive)return;
        if(local.length)loadProject(local[0].project);
        setLoadedScope(scope);setItems(local);setWorlds(worldPresets(scope));
        const warnings=takeDeviceWarnings();if(warnings.length)tell(warnings.join(' '),true);
      } catch(error){if(alive){setLoadedScope(scope);setSaveStatus('Save failed');tell(storageError(error),true);}}
    })();
    return()=>{alive=false;};
  },[]);
  async function loginCreator(email:string,password:string,register:boolean,name?:string){
    if(localStudioMode)throw Error('This local SIRVIBE studio requires no Firebase login. Open My cartoons to begin.');
    if(!navigator.onLine)throw Error('Reconnect to use optional cloud sign-in. You can keep creating offline.');
    await login(email,password,register,name??email.split('@')[0]);
    setCloudRequested(true);
  }
  async function backUpOnline(){
    if(localStudioMode)throw Error('Cloud backup is disabled in local studio. Download a project backup instead.');
    if(!account||!navigator.onLine)throw Error('Connect and sign in to back up online.');
    const current=useStudio.getState().project;
    if(!await persist(current))throw Error('Save on this device before backing up.');
    const saved=(await listDeviceProjects(scope)).find(row=>row.project.id===current.id);
    if(!saved)throw Error('Local save is missing.');
    await uploadProject(account,current,saved.updated);
    if(useStudio.getState().project===current)setSaveStatus('Saved on device · Backed up online');
    tell('Cloud backup complete. Your local copy stays on this device.');
  }
  async function downloadCloudCopies(){
    if(localStudioMode)throw Error('Cloud project sync is disabled in local studio. Import a project backup instead.');
    if(!account||!navigator.onLine)throw Error('Connect and sign in to download cloud projects.');
    const remote=await cloudProjects(account);
    // Download media before committing a local project. A failed download leaves
    // both cloud originals and all existing local movies untouched.
    const ready:SavedProject[]=[];
    for(const row of remote.documents){
      const project=await portableProject(row.project);
      for(const id of projectAssets(project))if(!await getOrFetchAudio(id))throw Error('Cloud audio is missing. Local cartoons have not been changed.');
      ready.push({...row,project});
    }
    setItems(await mergeDeviceProjects(scope,ready));
    tell(`${ready.length} cloud cartoon(s) downloaded as separate local copies.${remote.skipped?' '+remote.skipped+' unreadable cloud projects were left untouched.':''}`);
  }
  async function recoverPrevious(){
    const prior=await previousDeviceProject(scope,useStudio.getState().project.id);
    if(!prior){tell('No earlier saved version is available yet.');return;}
    if(!await openProject({...prior,id:uid(),name:prior.name.slice(0,80)+' · recovered'},true))return;
    tell('Earlier saved version opened as a separate cartoon.');
  }

  async function persist(document = useStudio.getState().project, manual = false) {
    const saveScope=originalScope.current;
    try {
      if(localDeletes.current.has(saveScope+'/'+document.id))throw new Error('This project is being deleted.');
      const saved=await saveDeviceProject(saveScope,document);
      if(originalScope.current===saveScope)useStudio.getState().markSaved(document);
      if(originalScope.current===saveScope) {
        setItems(current=>[saved,...current.filter(row=>row.project.id!==saved.project.id)].sort((a,b)=>b.updated-a.updated));
        if(useStudio.getState().project===document)setSaveStatus('Saved on device');
      }
      if(manual)tell('Project saved on this device.');
      return true;
    } catch(error) {setSaveStatus('Save failed');tell(storageError(error),true);return false;}
  }
  useEffect(() => {
    if (!dirty || loadedScope!==scope) return;
    setSaveStatus('Saving…');
    const timer = window.setTimeout(() => {
      const current = useStudio.getState();
      if (current.dirty && current.project === project) persist(project);
    }, 520);
    return () => clearTimeout(timer);
  }, [project, dirty, scope, loadedScope]);
  useEffect(() => {
    const flush = () => {
      const current = useStudio.getState();
      if (!current.dirty || localDeletes.current.has(originalScope.current + '/' + current.project.id)) return;
      void persist(current.project);
    };
    const background=()=>{if(document.visibilityState==='hidden')flush();};
    document.addEventListener('visibilitychange',background);
    const leaving=(event:BeforeUnloadEvent)=>{if(useStudio.getState().dirty){flush();event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',leaving);
    window.addEventListener('pagehide',flush);
    return ()=>{
      document.removeEventListener('visibilitychange',background);
      window.removeEventListener('pagehide',flush);
      window.removeEventListener('beforeunload',leaving);
    };
  }, []);
  useEffect(() => {
    const local = time.current.scene.id === scene.id ? clamp(time.current.local, 0, scene.duration) : 0;
    updateCursor(scene, local, true);
  }, [scene]);
  useEffect(() => { if (mixer.current) mixer.current.master.gain.value = muted ? 0 : 1; }, [muted]);

  async function play(rangeOverride?:{start:number;end:number}) {
    if (livePlaying.current || livePreparing.current) { pause(); return; }
    stopSoundPreview();
    const token = ++animationToken.current;
    livePreparing.current = true; setPreparing(true); setArrange(false);
    const state = useStudio.getState(), current = currentScene(state);
    const playback=rangeOverride??settings.current.playbackRange;
    const looping = settings.current.loop;
    const timing = movieRef.current;
    const activeIndex = timing.byId.get(current.id)?.index ?? 0;
    const atEnd = time.current.local >= current.duration - .001;
    const startIndex = !looping && !playback && atEnd ? (activeIndex + 1) % state.project.scenes.length : activeIndex;
    const at = playback
      ? clamp(time.current.local >= playback.end - .01 ? playback.start : time.current.local, playback.start, playback.end)
      : atEnd ? 0 : time.current.local;
    const sequence = looping || playback ? [current] : state.project.scenes.slice(startIndex);
    const sequenceStart = timing.spans[startIndex]?.start ?? 0;
    try {
      const audio = mixer.current ??= createAudioMixer();
      await audio.context.resume();
      audio.monitor();
      audio.master.gain.value = settings.current.muted ? 0 : 1;
      await audio.prepare(sequence);
      if (token !== animationToken.current) return;
      const startTime = audio.context.currentTime + .03;
      audio.schedule(sequence, at, startTime);
      livePlaying.current = true; setPlaying(true);
      livePreparing.current = false; setPreparing(false);
      let origin = startTime - at, earliest = at, lastFrame = -1;
      const duration = playback?.end ?? projectDuration(sequence);
      const tick = () => {
        if (token !== animationToken.current) return;
        let elapsed = Math.max(earliest, audio.context.currentTime - origin);
        if (elapsed >= duration) {
          if (!rangeOverride && settings.current.loop && sequence.length === 1) { const start=playback?.start??0;origin = audio.context.currentTime-start; earliest = start; elapsed = start; audio.schedule(sequence, start, audio.context.currentTime); }
          else {
            const last = sequence.at(-1)!;
            useStudio.getState().setScene(last.id);
            updateCursor(last, playback?.end ?? last.duration, true, sequenceStart + duration);
            pause();
            return;
          }
        }
        const next = locate(sequence, elapsed);
        const changedScene = time.current.scene.id !== next.scene.id;
        if (changedScene) useStudio.getState().setScene(next.scene.id);
        const position = Math.floor(elapsed * MOVIE_FRAME_RATE);
        if (position !== lastFrame || changedScene) {
          updateCursor(next.scene, next.local, false, sequenceStart + elapsed);
          lastFrame = position;
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (error) { if (token === animationToken.current) { pause(); showError(error); } }
  }
  function seek(value: number) {
    pause();setArrange(true);
    const current=currentScene(useStudio.getState());
    updateCursor(current,clamp(value,0,current.duration),true);
  }
  function seekScene(id: string, local: number) {
    const state = useStudio.getState();
    if (state.session !== session) return;
    const target = state.project.scenes.find(item => item.id === id);
    if (!target) return;
    if (livePlaying.current || livePreparing.current) pause();
    if (state.sceneId !== id) {
      setPlaybackRange(undefined);
      setPlacement(undefined);
      setArrange(true);
      state.setScene(id);
    }
    updateCursor(target, clamp(local, 0, target.duration), true, undefined, true);
  }
  function seekMovie(value: number) {
    const state = useStudio.getState();
    const next = locate(state.project.scenes, value);
    seekScene(next.scene.id, next.local);
  }
  function switchScene(value: Scene) {
    seekScene(value.id, 0);
    close();
  }
  async function openProject(value: Project, isNew = false) {
    if(loadedScope!==scope)return false;
    const previous=useStudio.getState();
    if(previous.dirty&&!await persist(previous.project))return false;
    if(originalScope.current!==scope||useStudio.getState().project!==previous.project)return false;
    loadProject(value, isNew); setHome('studio');
    return true;
  }
  const run = (command: () => void) => { try { if (livePlaying.current || livePreparing.current) pause(); command(); } catch (error) { showError(error); } };
  const edit = (command: (document: Project) => Project) => run(() => {
    const state = useStudio.getState();
    if (state.session !== session) throw new Error('The project changed. Start the edit again.');
    state.edit(command);
  });
  function commitScene(command: (value: Scene) => Scene) {
    if (livePlaying.current || livePreparing.current) pause();
    useStudio.getState().editScene(command, sceneTarget);
  }
  const editScene = (command: (value: Scene) => Scene) => run(() => commitScene(command));
  function replaceScene(next: Scene, base: string, generatedAssets:readonly string[] = []) {
    commitScene(current => {
      if (sceneToCode(current) !== base) throw new Error('The scene changed while this edit was open. Reopen it and try again.');
      return validateSceneReplacement(useStudio.getState().project, current.id, next, generatedAssets);
    });
    const current = currentScene(useStudio.getState());
    updateCursor(current, Math.min(time.current.local, Math.max(0, current.duration - .01)), false);
  }
  function replaceMovie(next: Project, base: string) {
    if (livePlaying.current || livePreparing.current) pause();
    const state = useStudio.getState();
    if (state.session !== session) throw new Error('The project changed. Reopen Code Mode before applying.');
    state.edit(current => {
      if (movieToCode(current) !== base) throw new Error('The movie changed while Code Mode was open. Copy your edits and reopen Code Mode.');
      return validateMovieReplacement(current, next);
    });
    updateCursor(currentScene(useStudio.getState()), 0, false);
  }
  const select = (value: Selection) => useStudio.getState().select(value);
  function patchActor(value: ActorData) { editScene(current => ({ ...current, actors: current.actors.map(actor => actor.id === value.id ? value : actor) })); }
  function patchObject(value: Prop) { editScene(current => repairOrphanedObjectActions({ ...current, objects: current.objects.map(object => object.id === value.id ? value : object) })); }
  function patchClip(value: Clip, original?: Clip) {
    if (scene.trackSettings?.[value.track]?.locked) { tell('Unlock the track before editing this clip.',true); return; }
    if('offset' in value&&(livePlaying.current||livePreparing.current))pause();
    let updated: Clip = value;
    // Moving or repositioning a keyed clip in the visual inspector should not
    // leave invisible keyframes overriding the coordinates the user just set.
    const prior = scene.clips.find(item => item.id === value.id);
    if (value.track === 'movement' && prior?.track === 'movement' && prior.keyframes &&
      (prior.fromX !== value.fromX || prior.toX !== value.toX || prior.fromY !== value.fromY || prior.toY !== value.toY)) {
      const { keyframes: _, ...plain } = value;
      updated = plain;
      tell('Movement converted to simple from/to animation. Advanced keyframes can be edited in Code Mode.');
    }
    if (value.track === 'body') {
      const body = value;
      const current = currentScene(useStudio.getState());
      if (usesSeat(body.action)) {
        // Sitting is a self-contained body pose. Objects remain optional;
        // never force a nearby chair, which caused characters to slide/float.
        const target = body.target ? compatibleObjects(current, body.action).find(item => item.id === body.target) : undefined;
        const { target: _old, ...freeSit } = body;
        updated = { ...freeSit, layer: 'body', ...(target ? { target: target.id } : {}) };
      } else if (body.target && !compatibleObjects(current, body.action).some(item => item.id === body.target)) {
        const { target: _, ...rest } = body;
        updated = rest;
      }
    }
    editScene(current => {
      const before = current.clips.find(clip => clip.id === updated.id);
      if (!before) throw new Error('This clip was removed.');
      if (original && JSON.stringify(before) !== JSON.stringify(original)) throw new Error('This clip changed during the drag. Try again.');
      return { ...current, clips: updated.track === 'camera' ? insertCameraShot(current.clips, updated, [...current.actors, ...current.objects].map(item => item.id)) :
        current.clips.map(clip => clip.id === updated.id ? updated : clip) };
    });
  }
  function addClip(value: Clip, newProp?: Prop['kind']) {
    commitScene(current => {
      if (current.trackSettings?.[value.track]?.locked) throw new Error('Unlock the track before adding clips.');
      if (current.clips.some(clip => clip.id === value.id)) throw new Error('This clip already exists.');
      let objects=current.objects;
      if(value.track==='body'&&newProp){
        if(objects.length>=100)throw Error('This scene can have up to 100 props.');
        const actorId=value.actor;
        const actor=evaluate(current,value.start).actors.find(item=>item.id===actorId);
        if(!actor)throw Error('Choose a character in this scene.');
        const side=actor.flip?-1:1;
        const reach=value.action==='pick-up'?27:63;
        const prop=makeProp(newProp,clamp(actor.x+side*reach*actor.scale,-2000,3000),
          clamp(actor.y,-2000,3000),{depth:nextLayerDepth(current)});
        objects=[...objects,prop];
        value={...value,target:prop.id};
      }
      const clip = value.track === 'camera' ? value : changeClipTiming(value, value.start, value.length, current.duration);
      return { ...current, objects, clips: clip.track === 'camera' ? insertCameraShot(current.clips, clip, [...current.actors, ...current.objects].map(item => item.id)) : [...current.clips, clip] };
    });
    setArrange(true); select({ kind: 'clip', id: value.id }); close();
  }
  function showClip(track?: Track, action?: Action, target?:string, actor?:string, start?:number) {
    pause();
    if (track === 'dialogue' || track === 'music') { showAudio(track); return; }
    setRequestedClip({ track, action, target, start, actor:actor??(selection?.kind === 'actor' ? selection.id : undefined) }); setDialog('clip');
  }
  function showAudio(track: AudioRequest['track'], actor?: string, start = time.current.local) { pause(); setRequestedAudio({ track, actor: actor ?? (selection?.kind === 'actor' ? selection.id : undefined), start }); setDialog('audio'); }
  function choosePropAction(id:string) {
    const current=currentScene(useStudio.getState()), prop=current.objects.find(item=>item.id===id);
    if(!prop)return;
    const action=(Object.keys(propActions) as Array<keyof typeof propActions>)
      .find(action=>propActions[action].length>0&&compatibleObject(prop,action))??'pick-up';
    showClip('body',action,prop.id);
  }
  function reorderSceneLayer(id:string,direction:LayerMove){
    editScene(current=>{
      const state=evaluate(current,time.current.local);
      return moveLayer(current,id,direction,new Map([...state.objects,...state.actors].map(item=>[item.id,item.y])));
    });
  }
  function pickPropLanding(clip:Extract<Clip,{track:'body'}>,createProp?:Prop['kind'],editing=false){
    const current=currentScene(useStudio.getState());
    seek(clip.start);
    beginPlacement({kind:'prop-landing',sceneId:current.id,start:clip.start,clip,createProp,editing});
  }
  function beginPlacement(next: Placement) {
    pause();
    close();
    setFocus(false);
    setTimelineTall(false);
    setMobilePanel('stage');
    setPlacement(next);
  }
  function beginPath(gait:TravelGait, actor?:string, mode:PathMode='move', character?:string, start=time.current.local, editing?:MoveClip) {
    const current=currentScene(useStudio.getState());
    if(!actor&&!character){tell('Add a character to this scene first.',true);return;}
    if(editing&&current.trackSettings?.movement?.locked){tell('Unlock Movement to edit the path.',true);return;}
    if(editing)seek(editing.start);
    const points=editing?(editing.keyframes??[{x:editing.fromX,y:editing.fromY},{x:editing.toX,y:editing.toY}]).map(({x,y})=>({x,y})):[];
    beginPlacement({kind:'path',sceneId:current.id,start,points,gait,style:editing?.style??'natural',mode,actor,character,editing:editing?.id});
  }
  function commitPath(draft:Extract<Placement,{kind:'path'}>, current:Scene) {
    const at=clamp(draft.start,0,current.duration-(draft.character ? .12 : .1));
    const created=draft.character?addSceneActor(current,draft.character,at,'place'):undefined;
    const base=created?.scene??current, actor=created?.actorId??draft.actor!;
    const existing=base.clips.find((clip):clip is MoveClip=>clip.id===draft.editing&&clip.track==='movement');
    if(draft.editing&&!existing)throw Error('This path was removed.');
    let mode=draft.mode;
    if(!existing&&mode==='move'&&!evaluate(base,at).actors.find(item=>item.id===actor)?.visible)mode='enter';
    const result=stagePath(base,actor,at,draft.points,draft.gait,draft.style,mode,existing);
    commitScene(()=>result.scene);
    select({kind:'clip',id:result.clip.id});
    const cursor=mode==='enter'?result.clip.start+result.clip.length:result.clip.start;
    seek(Math.min(current.duration-.001,cursor));
    setPlacement(undefined);
    tell(draft.editing?'Path updated.':'Path added. Use Preview path in the inspector to watch it.');
  }
  function stagePlacement(point:Point, waypoint=false) {
    if(!placement)return;
    const current=currentScene(useStudio.getState());
    if(current.id!==placement.sceneId){setPlacement(undefined);return;}
    try {
      const needsVisibility=placement.kind==='recover';
      const at=clamp(placement.start,0,current.duration-(needsVisibility?.12:.1));
      if(placement.kind==='path') {
        if(placement.editing){
          if(!waypoint&&!placement.waypoint)return;
          if(placement.points.length>=32)throw Error('You can add up to 30 waypoints.');
          setPlacement({...placement,waypoint:false,points:insertWaypoint(placement.points,point)});
          return;
        }
        if(!placement.points.length||waypoint||placement.waypoint){
          if(placement.points.length>=31)throw Error('You can add up to 30 waypoints.');
          setPlacement({...placement,waypoint:false,points:[...placement.points,point]});
          return;
        }
        commitPath({...placement,points:[...placement.points,point]},current);
      } else if(placement.kind==='prop-landing'){
        const pointAt={x:clamp(point.x,-2000,3000),y:clamp(point.y,-2000,3000)};
        const clip={...placement.clip,pointAt};
        if(placement.editing){
          if(current.trackSettings?.body?.locked)throw Error('Unlock Actions before moving the landing point.');
          const existing=current.clips.find(item=>item.id===clip.id);
          if(existing?.track!=='body'||existing.action!=='throw-prop')throw Error('This throw was removed.');
          patchClip({...existing,pointAt});
        }else addClip(clip,placement.createProp);
        seek(Math.min(current.duration-.001,clip.start+clip.length*.63));
      } else if(placement.kind==='point') {
        const action=placement.action??'point';
        addClip({id:uid(),track:'body',actor:placement.id,action,layer:'gesture',pointAt:point,start:at,length:Math.min(1.2,current.duration-at)});
        seek(Math.min(current.duration-.001,at+.32));
      } else if(placement.kind==='overlay') {
        const clip=current.clips.find(item=>item.id===placement.id);
        if(!clip||(clip.track!=='text'&&clip.track!=='vfx'))throw Error('This clip was removed.');
        if(current.trackSettings?.[clip.track]?.locked)throw Error('Unlock this track before placing the clip.');
        commitScene(value=>({...value,clips:value.clips.map(item=>item.id===clip.id?{...clip,...point}:item)}));
        seek(Math.min(clip.start+clip.length*.35,current.duration-.001));
      } else {
        if(current.trackSettings?.actors?.locked||current.trackSettings?.movement?.locked)throw Error('Unlock Actors and Movement first.');
        const visible=setActorVisibleAt(current,placement.id,at,true);
        commitScene(()=>({...visible,clips:[...visible.clips,{id:uid(),track:'movement',actor:placement.id,start:at,length:.1,
          fromX:point.x,fromY:point.y,toX:point.x,toY:point.y}]}));
        select({kind:'actor',id:placement.id});
        seek(at);
      }
      setPlacement(undefined);
    } catch(error){showError(error);}
  }
  function addActor(character: Character, mode: ActorEntrance='place') {
    if(mode!=='place'){beginPath(mode,undefined,'enter',character.id);return;}
    run(() => {
      const current=currentScene(useStudio.getState());
      const result=addSceneActor(current,character.id,time.current.local,'place');
      commitScene(()=>result.scene);
      select({id:result.actorId,kind:'actor'});
      setMobilePanel('stage');setArrange(true);
    });
  }
  function actorPresence(id:string, action:'walk-in'|'run-in'|'walk-out'|'run-out'|'show'|'hide') {
    if(action!=='show'&&action!=='hide') {
      beginPath(action.startsWith('run')?'run':'walk',id,action.endsWith('-in')?'enter':'exit');
      return;
    }
    run(()=>{
      const current=currentScene(useStudio.getState());
      if(current.trackSettings?.actors?.locked)throw Error('Unlock Actors to edit visibility.');
      const at=clamp(time.current.local,0,current.duration-.12);
      commitScene(()=>setActorVisibleAt(current,id,at,action==='show'));
      select({kind:'actor',id});seek(at);
    });
  }
  function addPerformance(action: Action) {
    const state=useStudio.getState(), current=currentScene(state);
    const clip=current.clips.find(item=>item.id===state.selection?.id);
    const id=clip&&'actor' in clip?clip.actor:state.selection?.id;
    const actor=current.actors.find(item=>item.id===id)??(current.actors.length===1?current.actors[0]:undefined);
    if(actionUsesProp(action)||action==='sleep-seated'){showClip('body',action,undefined,actor?.id);return;}
    if(!actor){showClip(action==='walk'||action==='run'?'movement':'body',action);return;}
    if(action==='walk'||action==='run'){beginPath(action,actor.id);return;}
    if(action==='point'||action==='reach'){beginPlacement({kind:'point',sceneId:current.id,start:time.current.local,id:actor.id,action});return;}

    const start=clamp(time.current.local,0,current.duration-.1), animation=animations[action];
    run(()=>addClip({id:uid(),track:'body',actor:actor.id,action,layer:actionLayer(action),start,
      length:Math.min(animation.loop?Math.max(1.5,animation.duration):animation.duration,current.duration-start)}));
  }
  function toggleTimelineHeight() {
    if(focus)setFocus(false);
    setCompact(false);
    setTimelineTall(value=>!value);
  }
  function addObject(kind: Prop['kind']) {
    if (scene.objects.length >= 100) { tell('A scene can have up to 100 props.', true); return; }
    const value = makeProp(kind, 475 + (scene.objects.length % 5) * 25, 430, {depth:nextLayerDepth(scene)});
    editScene(current => ({ ...current, objects: [...current.objects, value] }));
    select({ id: value.id, kind: 'object' }); setMobilePanel('stage'); setArrange(true);
  }
  function applyWorld(environment: Scene['environment'], furnished?: Prop[], backgroundImage?: string) {
    const preset = furnished ?? makeScene(environment).objects;
    editScene(current => replaceWorldObjects({ ...current, environment, backgroundImage }, preset.map(object => ({ ...object, id: uid() }))));
    select(null); setMobilePanel('stage');
  }
  function setWorld(environment: Scene['environment'], furnished?: Prop[], backgroundImage?: string) {
    if (scene.environment === environment && !furnished && !scene.backgroundImage) return;
    if (scene.objects.length) {
      const used = scene.clips.filter(clip => clip.track === 'body' && clip.target && scene.objects.some(object => object.id === clip.target)).length;
      ask('Change the furnished world?', 'This replaces the current props.' + (used ? ' ' + used + ' dependent timeline action(s) will safely change to standing/empty-handed actions.' : '') + ' Use Undo to restore the original world.', () => applyWorld(environment, furnished, backgroundImage));
    } else applyWorld(environment, furnished, backgroundImage);
  }
  function commitArtwork(command: (value: Scene) => Scene) {
    const state = useStudio.getState();
    if (state.session !== sceneTarget.session || !state.project.scenes.some(item => item.id === sceneTarget.sceneId))
      throw new Error('The original scene is no longer available.');
    pause();
    if (state.sceneId === sceneTarget.sceneId) {
      state.editScene(command, sceneTarget);
      return true;
    }
    state.edit(project => ({
      ...project, scenes: project.scenes.map(item => item.id === sceneTarget.sceneId ? command(item) : item)
    }));
    return false;
  }
  async function uploadWorld(file: File) {
    try {
      const imported = await prepareArtwork(file, 'world');
      if (commitArtwork(current => ({ ...current, backgroundImage: imported.data }))) setMobilePanel('stage');
      tell('World image added to ' + scene.name + '.');
    } catch (error) { showError(error); }
  }
  async function uploadProp(file: File) {
    try {
      const imported = await prepareArtwork(file, 'prop');
      const maxDimension = Math.max(imported.width, imported.height);
      const sizing = Math.min(1, 165 / maxDimension);
      const prop = makeProp('image', 480, 435, {
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Picture prop',
        imageData: imported.data,
        imageWidth: Math.max(10, Math.round(imported.width * sizing)),
        imageHeight: Math.max(10, Math.round(imported.height * sizing)), interaction: 'none'
      });
      if (commitArtwork(current => ({ ...current, objects: [...current.objects, prop] }))) {
        select({ kind: 'object', id: prop.id });
        setMobilePanel('inspector');
      }
      tell('Picture prop added. Set its interaction type in the inspector.');
    } catch (error) { showError(error); }
  }
  function storeWorlds(next:WorldPreset[]){
    if(next.length>24)throw new Error('Saved world limit reached (24). Delete an old preset first.');
    localStorage.setItem(worldKey(scope),JSON.stringify(next));
    setWorlds(next);
  }
  function saveWorld(value: Scene) {
    try {
      const original=value.name.trim().slice(0,64)||'My world';
      let name=original,n=2;
      while(worlds.some(item=>item.name===name)){name=original.slice(0,58)+' '+n;n++;}
      storeWorlds([...worlds,{
        name,environment:value.environment,objects:structuredClone(value.objects),
        backgroundImage:value.backgroundImage
      }]);
      tell('World "'+name+'" saved to your reusable sets.');
    } catch (error) { showError(error); }
  }
  function renameWorldPreset(oldName:string,newName:string){
    const name=newName.trim();
    if(!name||name.length>70)throw new Error('World name must be 1–70 characters.');
    if(oldName!==name && worlds.some(item=>item.name===name))throw new Error('A saved world already has this name.');
    if(!worlds.some(item=>item.name===oldName))throw new Error('The saved world is missing.');
    storeWorlds(worlds.map(item=>item.name===oldName?{...item,name}:item));
  }
  function duplicateWorldPreset(name:string){
    try{
      const existing=worlds.find(item=>item.name===name);
      if(!existing)throw new Error('World preset is missing.');
      const base=existing.name.slice(0,59)+' copy';
      let copy=base,n=2;
      while(worlds.some(item=>item.name===copy)){copy=base.slice(0,65)+' '+n;n++;}
      storeWorlds([...worlds,{...structuredClone(existing),name:copy}]);
    }catch(error){showError(error);}
  }
  function deleteWorldPreset(name:string){
    ask('Delete saved world?',`Remove "${name}" from reusable worlds? This does not delete backgrounds or props already placed in movies.`,()=>{
      try{storeWorlds(worlds.filter(item=>item.name!==name));tell('Saved world removed.');}
      catch(error){showError(error);}
    });
  }
  function clearWorldImage(){
    editScene(current=>({...current,backgroundImage:undefined}));
    tell('Custom background removed from this scene.');
  }
  function duplicateCastCharacter(character:Character){
    if(project.characters.length>=80){tell('Your cast is full (80 characters).',true);return;}
    const copy:Character={...structuredClone(character),id:uid(),name:(character.name.slice(0,54)+' copy')};
    edit(current=>({...current,characters:[...current.characters,copy]}));
    tell(copy.name+' created. Choose it to customize its look and voice.');
  }
  function inspectAssetObject(id:string){
    if(!scene.objects.some(item=>item.id===id))return;
    pause();select({kind:'object',id});setMobilePanel('inspector');
  }
  function duplicateAssetObject(id:string){
    run(()=>{
      const current=currentScene(useStudio.getState()),object=current.objects.find(item=>item.id===id);
      if(!object)throw new Error('Prop no longer exists.');
      if(current.objects.length>=100)throw new Error('Scene has reached its 100-prop limit.');
      const copy={...structuredClone(object),id:uid(),x:clamp(object.x+36,-2000,3000),
        name:(object.name.slice(0,54)+' copy')};
      commitScene(value=>({...value,objects:[...value.objects,copy]}));
      select({kind:'object',id:copy.id});setMobilePanel('inspector');
    });
  }
  function deleteAssetObject(id:string){
    const current=currentScene(useStudio.getState()),object=current.objects.find(item=>item.id===id);
    if(!object)return;
    if(objectDependencies(current,id).length){
      pause();setDependentObjectId(id);setDialog('dependencies');return;
    }
    const usage=propUsage(current,id);
    ask(`Delete ${object.name}?`,
      `Delete this prop from the current scene? ${usage.total} gaze or timeline reference(s) will be repaired. Undo can restore it.`,()=>{
      editScene(item=>removeEntity(item,id));select(null);
    });
  }
  function inspectAssetAudio(id:string){
    if(!scene.clips.some(item=>item.id===id&&['dialogue','audio','music'].includes(item.track)))return;
    pause();select({kind:'clip',id});setMobilePanel('inspector');
  }
  function duplicateAssetAudio(id:string){
    run(()=>{
      const current=currentScene(useStudio.getState()),clip=current.clips.find(item=>item.id===id);
      if(!clip||!['dialogue','audio','music'].includes(clip.track))throw new Error('Audio clip no longer exists.');
      if(current.trackSettings?.[clip.track]?.locked)throw new Error('Unlock this track before duplicating audio.');
      if(current.clips.length>=600)throw new Error('Scene has reached its clip limit.');
      const copy=copyClip(clip,current.duration,current.clips);
      commitScene(value=>({...value,clips:[...value.clips,copy]}));
      select({kind:'clip',id:copy.id});setMobilePanel('inspector');
    });
  }
  function deleteAssetAudio(id:string){
    const clip=scene.clips.find(item=>item.id===id);
    if(!clip||!['dialogue','audio','music'].includes(clip.track))return;
    const linked=project.production?.graph.some(record=>Boolean(record.events[id]));
    ask('Remove audio from scene?',
      `Remove the selected ${clip.track} clip from this scene? ${linked?'This clip is screenplay-linked and may be recreated if you deliberately recompile the script. ':''}The recording remains available to other scenes or voice versions. Undo can restore it.`,()=>{
      run(()=>{
        const current=currentScene(useStudio.getState());
        if(current.trackSettings?.[clip.track]?.locked)throw new Error('Unlock the audio track first.');
        commitScene(item=>({...item,clips:item.clips.filter(value=>value.id!==id)}));
        select(null);
      });
    });
  }
  function editCharacter(value?: Character) { pause(); setFactory(value); setDialog('character'); }
  function saveCharacter(value: Character) {
    try {
      pause();
      const current = useStudio.getState().project;
      if (!current.characters.some(item => item.id === value.id) && current.characters.length >= 80) {
        tell('Your cast is full (80 characters). Delete or reuse a character before adding another.', true);
        return;
      }
      useStudio.getState().edit(document => ({ ...document, characters: document.characters.some(item => item.id === value.id) ? document.characters.map(item => item.id === value.id ? value : item) : [...document.characters, value] }));
      close(); tell(`${value.name} saved to your cast.`);
    } catch (error) { showError(error); }
  }
  function ask(title: string, text: string, command: () => void) { setConfirm({ title, text, run: command }); setDialog('confirm'); }
  function deleteCharacter(id: string) {
    const character=project.characters.find(item=>item.id===id);
    if(!character)return;
    const usage=characterUsage(project,id);
    ask(`Delete ${character.name}?`,
      `This affects ${usage.sceneActors} scene appearance(s), ${usage.actorClips} animation clip(s), ${usage.screenplay} screenplay reference(s), ${usage.history} saved-script reference(s) and ${usage.outline} story outline(s). Related clips are removed and speaker IDs detached; the original dialogue text remains for reassignment. Undo can restore the movie.`,
      ()=>{edit(current=>removeCharacterFromProject(current,id));select(null);});
  }
  function editTimeline(next: Scene, ids?: string[]) {
    run(() => {
      const state = useStudio.getState();
      if (state.session !== session || state.sceneId !== next.id) throw new Error('Scene changed during timeline edit.');
      const previous = currentScene(state);
      if (previous === next) return;
      if(livePlaying.current||livePreparing.current)pause();
      state.editScene(() => next, { session, sceneId: next.id });
      if (ids) useStudio.getState().selectClips(ids);
      const updated = currentScene(useStudio.getState());
      if (time.current.local > updated.duration) updateCursor(updated, updated.duration, false);
    });
  }
  function copyTimelineSelection() {
    const state = useStudio.getState();
    const clips = selectableClips(currentScene(state), state.clipIds);
    if (!clips.length) return;
    timelineClipboard.current = { projectId: state.project.id, sceneId: state.sceneId, clips: structuredClone(clips) };
    tell(clips.length + ' clip' + (clips.length===1?'':'s') + ' copied.');
  }
  function deleteTimelineSelection() {
    const state = useStudio.getState();
    if (state.selectedKeyframe) {
      const key = state.selectedKeyframe;
      editScene(scene => deleteMovementKeyframe(scene, key));
      useStudio.getState().selectClips([key.clipId]);
    } else if (state.clipIds.length) {
      const ids = state.clipIds;
      editScene(scene => deleteTimelineClips(scene, ids));
      useStudio.getState().selectClips([]);
    }
  }
  function cutTimelineSelection() {
    if (!useStudio.getState().clipIds.length) return;
    copyTimelineSelection();
    deleteTimelineSelection();
  }
  function pasteTimelineSelection() {
    const state = useStudio.getState(), clipboard = timelineClipboard.current;
    if (!clipboard?.clips.length) { tell('Copy timeline clips first.', true); return; }
    if (clipboard.projectId !== state.project.id) { tell('Clipboard belongs to another movie. Copy clips from this movie first.', true); return; }
    run(() => {
      const result = pasteTimelineClips(currentScene(useStudio.getState()),clipboard.clips,time.current.local);
      commitScene(() => result.scene);
      useStudio.getState().selectClips(result.ids);
    });
  }
  function duplicateTimelineSelection() {
    const state=useStudio.getState();
    if(!state.clipIds.length)return;
    run(()=>{
      const result=duplicateTimelineClips(currentScene(useStudio.getState()),state.clipIds);
      commitScene(()=>result.scene);
      useStudio.getState().selectClips(result.ids);
    });
  }
  function splitTimelineSelection() {
    const state=useStudio.getState();
    if(!state.clipIds.length)return;
    run(()=>{
      const result=splitTimelineClips(currentScene(useStudio.getState()),state.clipIds,time.current.local);
      commitScene(()=>result.scene);
      if(result.added.length)useStudio.getState().selectClips(result.added);
      else tell('Place the playhead inside a selected clip to split it.',true);
    });
  }
  function duplicateSelection() {
    if (useStudio.getState().clipIds.length) { duplicateTimelineSelection(); return; }
    const selected = useStudio.getState().selection;
    const current = currentScene(useStudio.getState());
    if (!selected) return;
    const clip = current.clips.find(item => item.id === selected.id);
    const actor = current.actors.find(item => item.id === selected.id);
    const object = current.objects.find(item => item.id === selected.id);
    if (clip) run(() => addClip(copyClip(clip, current.duration, current.clips)));
    else if (actor) {
      const id = uid(); editScene(item => ({ ...item, actors: [...item.actors, { ...actor, id, x: clamp(actor.x + 40, -2000, 3000) }] })); select({ kind: 'actor', id });
    } else if (object) {
      const id = uid(); editScene(item => ({ ...item, objects: [...item.objects, { ...object, id, x: clamp(object.x + 36, -2000, 3000) }] })); select({ kind: 'object', id });
    }
  }
  function removeSelection() {
    const state = useStudio.getState(), item = state.selection;
    if (state.clipIds.length || state.selectedKeyframe) { deleteTimelineSelection(); return; }
    if (!item) return;
    const current = currentScene(state);
    if (item.kind === 'object' && objectDependencies(current, item.id).length) {
      pause(); setDependentObjectId(item.id); setDialog('dependencies');
      return;
    }
    editScene(scene => removeEntity(scene, item.id));
    select(null);
  }
  function confirmObjectDeletion(decisions: ObjectDependencyDecision) {
    if (!dependentObjectId) return;
    try {
      const targetId = dependentObjectId;
      pause();
      commitScene(scene => removeObjectWithDecisions(scene, targetId, decisions));
      select(null);
      setDependentObjectId(null);
      close();
      tell('Object removed. Dependent actions were updated.');
    } catch (error) { showError(error); }
  }
  function rename(value: string) {
    const name = value.trim();
    if (!name || name === project.name) return;
    edit(current => ({
      ...current, name,
      ...(current.production && current.production.bible.status !== 'locked' ? {
        production: { ...current.production, bible: { ...current.production.bible, profile: { ...current.production.bible.profile, title: name } } }
      } : {})
    }));
  }
  async function alignVoiceClip(clip:Extract<Clip,{track:'dialogue'}>,recognizer:Recognizer):Promise<string> {
    const state=useStudio.getState(),scene=currentScene(state);
    if(JSON.stringify(scene.clips.find(c=>c.id===clip.id))!==JSON.stringify(clip))
      throw new Error('Dialogue changed before analysis. Reopen it.');
    const blob=clip.asset.startsWith('asset:')?
      await getOrFetchAudio(clip.asset.slice(6)):
      clip.asset.startsWith('builtin:')?await fetch('/audio/'+clip.asset.slice(8)+'.mp3').then(async res=>{
        if(!res.ok)throw new Error('Built-in recording is unavailable.');
        return res.blob();
      }):undefined;
    if(!blob)throw new Error('Recording is missing. Restore a backup or reconnect cloud storage.');
    const duration=await audioLength(blob);
    const analysis=await analyzeLocalLipSync(blob);
    const live=useStudio.getState();
    if(live.session!==state.session||live.sceneId!==state.sceneId||live.project.id!==state.project.id)
      throw new Error('Project changed while analyzing. Original cues remain untouched.');
    editScene(current=>{
      if(JSON.stringify(current.clips.find(c=>c.id===clip.id))!==JSON.stringify(clip))
        throw new Error('Dialogue changed during analysis. Retry on the updated clip.');
      if(current.trackSettings?.dialogue?.locked)throw new Error('Unlock the Dialogue track before analysis.');
      return {...current,clips:current.clips.map(c=>c.id===clip.id?{
        ...clip,visemes:analysis.cues,
        lipSync:{source:analysis.source,engine:analysis.engine,analyzedDuration:analysis.analyzedDuration,
          ...(analysis.cacheKey?{cacheKey:analysis.cacheKey}:{})}
      }:c)};
    });
    return 'Automatic lip sync updated on this device. Your precision corrections are preserved.';
  }
  function addSound(name: typeof soundNames[number]) { const start = clamp(time.current.local, 0, scene.duration - .1); run(() => addClip({ id: uid(), track: 'audio', name: label(name), asset: `builtin:${name}`, length: Math.min(soundDurations[name], scene.duration - start), start, muted: false, volume: .8, offset: 0 })); }
  async function deleteSavedProject(item: Project) {
    const key = scope + '/' + item.id;
    if (originalScope.current !== scope || localDeletes.current.has(key)) return;
    localDeletes.current.add(key);
    try {
      await removeDeviceProject(scope,item.id);
      if (originalScope.current !== scope) return;
      const entries=await listDeviceProjects(scope);
      setItems(entries);
      if (useStudio.getState().project.id === item.id) loadProject(entries[0]?.project ?? makeProject());
      tell('Project deleted.');
    } catch (error) {
      localDeletes.current.delete(key);
      showError(error);
    }
  }
  function deleteProject(item: Project) {
    ask(`Delete “${item.name}”?`, 'This permanently removes the saved project.', () => void deleteSavedProject(item));
  }
  function newMovie() { startManualMovie(); }
  async function startManualMovie() {
    const next = makeProject();
    next.name = 'Untitled cartoon';
    next.scenes[0] = { ...next.scenes[0], name: 'Scene 1', duration: 30, actors: [], clips: [], objects: [] };
    if(!await openProject(next,true))return;
    try {localStorage.setItem('toonroom.started', '1');} catch { /* Optional onboarding preference. */ }
     setArrange(true); setMobilePanel('stage');
    useStudio.getState().setLibrary('Worlds');
  }
  function deleteHomeProject(item: Project) { deleteProject(item); }
  async function organizeHomeProject(id:string,changes:{favorite?:boolean;collection?:ProjectCollection}){
    try{await organizeDeviceProject(scope,id,changes);setItems(await listDeviceProjects(scope));}
    catch(error){showError(error);}
  }
  async function renameHomeProject(value:Project,name:string) {
    const next=await renameDeviceProject(scope,value.id,name);
    const current=useStudio.getState();
    if(current.project.id===value.id){
      current.edit(existing=>({...existing,name:next.name,...(existing.production?.bible.status!=='locked'&&existing.production?
        {production:{...existing.production,bible:{...existing.production.bible,
          profile:{...existing.production.bible.profile,title:next.name}}}}:{})}));
    }
    setItems(await listDeviceProjects(scope));
  }
  async function duplicateHomeProject(value:Project) {
    try{
      const copy=duplicateProject(value);
      await saveDeviceProject(scope,copy);
      setItems(await listDeviceProjects(scope));
    }catch(error){showError(error);}
  }
  async function openLibraryProject(value:Project){
    try {
      if(useStudio.getState().dirty&&!await persist())return;
      const before=useStudio.getState();
      const latest=await getDeviceProject(scope,value.id);
      if(useStudio.getState().session!==before.session||useStudio.getState().project!==before.project){tell('The cartoon changed while opening. Try again.');return;}
      value=latest.project;
      if(!await openProject(value))return;
      observeDeviceProject(scope,latest);
    } catch(error){showError(error);return;}
    const previous=editorSessionFor(scope,value.id)??(
      lastEditorSession(scope)?.projectId===value.id?lastEditorSession(scope):undefined);

    if(previous?.projectId===value.id){
      const target=value.scenes.find(item=>item.id===previous.sceneId);
      if(target){
        useStudio.getState().setScene(target.id);
        updateCursor(target,clamp(previous.playhead,0,target.duration),true);
      }
    }
  }
  function openRentExample() {
    void openProject(missingRentMovie(),true);
  }
  async function exchange(file: File) {
    try {
      const value = await restoreMovie(file);
      if (useStudio.getState().session !== session) throw new Error('The project changed while the backup was loading. Import it again.');
      if(!await openProject(value,true))return;
        close(); tell('Project restored as a new copy.');
    } catch (error) { showError(error); }
  }
  function reorderDirectScene(id:string,step:number){
    edit(current=>reorderMovieScene(current,id,step));
  }
  function renameDirectScene(id:string,name:string){
    edit(current=>renameMovieScene(current,id,name));
  }
  function createDirectScene(){
    run(()=>{
      const current=useStudio.getState().project;
      const result=addMovieScene(current);
      useStudio.getState().edit(()=>result.project);
      switchScene(result.scene);
    });
  }
  function duplicateDirectScene(value:Scene){
    run(()=>{
      const current=useStudio.getState().project;
      const result=duplicateMovieScene(current,value.id);
      useStudio.getState().edit(()=>result.project);
      switchScene(result.scene);
    });
  }
  function dropDirectScene(value:Scene){
    const state=useStudio.getState();
    const linked=state.project.production?.screenplay.scenes.some(item=>item.id===value.id);
    const isLast=state.project.scenes.length===1;
    ask(`Delete "${value.name}"?`,
      isLast
        ? 'This is the only scene. Its contents will be deleted and a new blank scene will replace it. Undo can restore your work.'
        : linked
          ? 'This also removes the corresponding screenplay and story outline scene. Undo will restore everything.'
          : 'This removes the scene and its animation timeline. Undo can restore it.',
      ()=>{
        const before=useStudio.getState();
        const index=before.project.scenes.findIndex(item=>item.id===value.id);
        if(index<0){showError(new Error('The scene no longer exists.'));return;}
        edit(current=>removeMovieScene(current,value.id));
        const after=useStudio.getState();
        if(after.project===before.project)return;
        // Keep the playhead and selection on a real scene even when the active
        // scene or an earlier scene was removed from the movie.
        const target=after.project.scenes.find(item=>item.id===before.sceneId)
          ??after.project.scenes[Math.min(index,after.project.scenes.length-1)];
        if(after.sceneId!==target.id)after.setScene(target.id);
        const local=target.id===before.sceneId?clamp(time.current.local,0,target.duration):0;
        const timing=movieTiming(after.project.scenes);
        setPlaybackRange(undefined);
        setPlacement(undefined);
        updateCursor(target,local,true,(timing.byId.get(target.id)?.start??0)+local,true);
        tell(isLast?'Scene cleared. Undo to restore it.':`"${value.name}" deleted. Undo to restore it.`);
      });
  }
  function showDialog(value: Dialog) { pause(); setDialog(value); }
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (dialog || home!=='studio') return;
      const target = event.target;
      const el = target instanceof HTMLElement ? target : null;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const isHeightShortcut = !command && !event.altKey && key === 't';
      const isArrowShortcut = !command && !event.altKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key);
      const transportFocused = el === range.current;
      // Text fields keep their native keyboard behavior. The preview range
      // is a timeline control and shares the same playhead shortcuts.
      if (!transportFocused && (el?.isContentEditable || el?.closest('input,textarea,select,[role="textbox"],.monaco-editor,.cm-editor,[contenteditable]'))) return;
      if (transportFocused && !isArrowShortcut && !isHeightShortcut) return;
      if (el?.closest('[role="separator"]') && !isHeightShortcut) return;
      const inClip = !!el?.closest('.clip,.timeline-keyframe');
      const inTimeline = !!el?.closest('.professional-timeline');
      const state = useStudio.getState(), hasTimelineSelection = state.clipIds.length > 0 || !!state.selectedKeyframe;
      if (command && key === 's') { event.preventDefault(); persist(undefined,true); return; }
      if (command && (key === 'z' || key === 'y')) {
        event.preventDefault();
        run(() => (key === 'y' || event.shiftKey) ? useStudio.getState().redo() : useStudio.getState().undo());
        return;
      }
      if (workspace !== 'direct') return;
      if(isHeightShortcut) {event.preventDefault();if(!event.repeat)toggleTimelineHeight();return;}
      if (isArrowShortcut) {
        event.preventDefault();
        if(event.key==='ArrowUp'||event.key==='ArrowDown'){
          seekMovie(nextClipEdge(movieRef.current,time.current.movie,event.key==='ArrowUp'?-1:1));
        }else{
          const now=performance.now();
          if(!event.repeat||arrowHold.current?.key!==event.key)arrowHold.current={key:event.key,since:now};
          const hold=now-arrowHold.current.since;
          const frames=event.shiftKey?15:!event.repeat?1:hold>1400?12:hold>650?5:2;
          seekMovie(time.current.movie+(event.key==='ArrowRight'?1:-1)*frames/MOVIE_FRAME_RATE);
        }
        return;
      }
      if(el?.closest('button,[role="button"]')&&!inClip&&event.code==='Space')return;
      if (event.code === 'Space' && !command && !event.altKey) { event.preventDefault(); void play(); return; }
      if (command && key === 'a' && (inTimeline || hasTimelineSelection)) { event.preventDefault(); state.selectClips(currentScene(state).clips.map(clip=>clip.id)); return; }
      if (command && key === 'c' && hasTimelineSelection) { event.preventDefault(); copyTimelineSelection(); return; }
      if (command && key === 'x' && hasTimelineSelection) { event.preventDefault(); cutTimelineSelection(); return; }
      if (command && key === 'v') { event.preventDefault(); pasteTimelineSelection(); return; }
      if (command && key === 'd') { event.preventDefault(); duplicateSelection(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && (state.selection || hasTimelineSelection)) {
        event.preventDefault(); removeSelection(); return;
      }
      if (!command && !event.altKey && key === 's' && hasTimelineSelection) { event.preventDefault(); splitTimelineSelection(); return; }
      if (!command && !event.altKey && (key === '+' || key === '=' || key === '-' || key === '_')) {
        event.preventDefault(); window.dispatchEvent(new CustomEvent('toonroom-zoom', {detail:key==='+'||key==='='?'in':'out'})); return;
      }
      if (event.key === 'Escape') { if(placement){setPlacement(undefined);return;} if(timelineTall){setTimelineTall(false);return;} state.select(null); setFocus(false); return; }
      if (event.altKey && arrange && selection && selection.kind !== 'clip' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0, dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
        const actor = scene.actors.find(item => item.id === selection.id), object = scene.objects.find(item => item.id === selection.id);
        if (actor) patchActor({ ...actor, x: clamp(actor.x + dx, -2000, 3000), y: clamp(actor.y + dy, -2000, 3000) });
        if (object) patchObject({ ...object, x: clamp(object.x + dx, -2000, 3000), y: clamp(object.y + dy, -2000, 3000) });
      }
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  });
  const headerStatus = saveStatus;
  const pathClip=scene.clips.find((clip):clip is MoveClip=>clip.id===selection?.id&&clip.track==='movement');
  const selectedPath=pathClip?(pathClip.keyframes??[{x:pathClip.fromX,y:pathClip.fromY},{x:pathClip.toX,y:pathClip.toY}]):undefined;
  let content: ReactNode;
  if (dialog === 'character') content = <CharacterFactory source={factory} save={saveCharacter} close={close} remove={deleteCharacter}/>;
  if (dialog === 'clip') content = <AddClipDialog scene={scene} actors={actorNames} time={time.current.local} request={requestedClip} close={close} path={(actor,gait,start)=>beginPath(gait,actor,'move',undefined,start)} point={(actor,action,start)=>beginPlacement({kind:'point',sceneId:scene.id,start,id:actor,action})} add={(clip,newProp) => run(() => addClip(clip,newProp))} throwTo={(clip,newProp)=>pickPropLanding(clip,newProp)} audio={showAudio}/>;
  if (dialog === 'code') content = <TimelineCodeDialog key={session + scene.id} project={project} scene={scene} close={close} apply={replaceScene} applyMovie={replaceMovie}/>;
  if (dialog === 'audio') content = <AudioDialog key={session + scene.id} scene={scene} actors={actorNames} characters={project.characters} request={requestedAudio} account={account} add={clip => {
    const prior = scene.clips.find(c=>c.id===requestedAudio.replaceId);
    if(prior?.track==='dialogue' && clip.track==='dialogue') {
      const version={asset:prior.asset,text:prior.text,length:prior.length,offset:prior.offset,visemes:prior.visemes,manualVisemes:prior.manualVisemes,lipSync:prior.lipSync};
      patchClip({...clip,id:prior.id,volume:prior.volume,fadeIn:prior.fadeIn,fadeOut:prior.fadeOut,voiceEffect:prior.voiceEffect,versions:[version,...(prior.versions??[])].slice(0,5)});close();
    } else addClip(clip);
  }} close={close}/>;
  if (dialog === 'lipsync') {
    const clip = scene.clips.find(item => item.id === selection?.id);
    const actor = clip?.track === 'dialogue' && scene.actors.find(item => item.id === clip.actor);
    const character = actor && project.characters.find(item => item.id === actor.characterId);
    if (clip?.track === 'dialogue' && character) content = <PrecisionLipSyncEditor key={clip.id} clip={clip} character={character} change={patchClip} close={close} regenerate={() => alignVoiceClip(clip,'phonetic')} undo={() => useStudio.getState().undo()} redo={() => useStudio.getState().redo()} canUndo={hasUndo} canRedo={hasRedo}/>;
  }
  if (dialog === 'performance') content = <PerformanceStudio key={session + scene.id} scene={scene} characters={project.characters}
    selectedActor={selection?.kind==='actor'?selection.id:scene.actors[0]?.id}
    start={time.current.local} close={close}
    commit={async clips=>{
      const expected=sceneTarget;
      const state=useStudio.getState();
      if(state.session!==expected.session||state.sceneId!==expected.sceneId)
        throw Error('Scene changed while recording. Reopen Performance Studio.');
      const locked=clips.find(clip=>scene.trackSettings?.[clip.track]?.locked);
      if(locked)throw Error('Unlock the '+locked.track+' track before adding this performance.');
      const latest=Math.max(...clips.map(clip=>clip.start+clip.length));
      if(latest>180)throw Error('This performance exceeds the 180-second scene limit.');
      state.editScene(current=>({...current,duration:Math.max(current.duration,Math.ceil(latest*100)/100),
        clips:[...current.clips,...clips]}),expected);
      state.selectClips(clips.map(clip=>clip.id));
      tell('Performance added to the timeline. Drag or split the clips to edit.');
    }}
    saveActingDNA={(actorId,style:MotionDNA)=>{
      const candidate=scene.actors.find(item=>item.id===actorId);
      if(!candidate)return;
      edit(project=>({...project,characters:project.characters.map(character=>character.id===candidate.characterId
        ?{...character,personality:{...character.personality,autoActing:'subtle',
          energy:style.energy,gestureAmplitude:style.gestureAmplitude,movementSmoothness:style.movementSmoothness,
          movementSpeed:clamp(25+style.energy*.7,0,100)}}
        :character)}));
      tell('Observed motion style applied to the character. You can adjust it in Character Studio.');
    }}/>;
  if (dialog === 'export') content = <ExportDialog project={project} initialFormat={format} initialSubtitles={subtitles} close={close}/>;
  if (dialog === 'projects') content = <ProjectsDialog recover={()=>void recoverPrevious().catch(showError)} items={items} current={project.id} close={close} create={newMovie} open={value=>void openLibraryProject(value)} duplicate={value => openProject(duplicateProject(value), true)} remove={deleteProject} demo={openRentExample} backup={() => { void backupMovie(project).then(() => tell('Project backup downloaded.'), showError); }} restore={() => importFile.current?.click()}/>;
  if (dialog === 'scenes') content = <ScenesDialog scenes={project.scenes} active={scene.id}
    close={close} open={switchScene} rename={renameDirectScene} savePreset={saveWorld}
    add={createDirectScene} copy={duplicateDirectScene}
    reorder={reorderDirectScene} drop={dropDirectScene}/>;
  if (dialog === 'account' && !localStudioMode) content = <AccountDialog backup={backUpOnline} downloadCloud={downloadCloudCopies} available={cloudEnabled} account={account} login={loginCreator} logout={async () => {
    if (useStudio.getState().dirty && !await persist()) throw new Error('Save your current project before signing out.');
    await logout();
  }} close={close}/>;
  if (dialog === 'help') content = <HelpDialog close={close} demo={() => { openProject(makeProject(true), true);  }}/>;
  if (dialog === 'dependencies' && dependentObjectId) content = <ObjectDependenciesDialog scene={scene} objectId={dependentObjectId} actorNames={actorNames} close={close} confirm={confirmObjectDeletion}/>;
  if (dialog === 'confirm' && confirm) content = <Modal title={confirm.title} description={confirm.text} close={close}><footer className="modal-footer"><span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="danger" onClick={() => { close(); confirm.run(); }}>Confirm</button></footer></Modal>;

  const backupInput = <input type="file" ref={importFile} accept=".sirvibe,.json,application/json,application/octet-stream" hidden aria-label="Import SIRVIBE project backup" onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void exchange(file);
    }}/>;
  const noticeToast = notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{!notice.error && <Check size={16}/>}<span>{notice.message}</span><IconButton title="Dismiss notice" onClick={() => setNotice(null)}><X size={14}/></IconButton></div>;
  if (home !== 'studio') return <div data-theme={theme} className="studio-shell filmmaking-shell home-wrapper">
    <Welcome screen={home==='projects'?'projects':'landing'} items={items} lastSession={lastEditorSession(scope)}
      account={account} localStudio={localStudioMode} authAvailable={cloudEnabled&&!localStudioMode} login={loginCreator}
      logout={async()=>{if(localStudioMode)return;await logout();setHome('landing');}}
      enter={()=>{void requestDurableStorage();setHome('projects');}}
      openProjects={()=>showDialog('projects')}
      openLanding={()=>setHome('landing')} openProject={openLibraryProject}
      createManual={startManualMovie}
      duplicate={duplicateHomeProject} rename={(value,name)=>renameHomeProject(value,name).catch(showError)}
      backup={value=>void backupMovie(value).catch(showError)} restore={()=>importFile.current?.click()}
      organize={organizeHomeProject} remove={deleteHomeProject} openExample={openRentExample}
      openActingDemo={()=>{void openProject(makeActingDemoProject(),true);}}
      theme={theme==='dark'?'dark':'light'} toggleTheme={toggleTheme}/>
    {backupInput}
    <OfflineStatus status={saveStatus} save={()=>useStudio.getState().dirty?persist():Promise.resolve(true)}/>
    {noticeToast}
    {content}
  </div>;
  return <div data-theme={theme} className={`studio-shell filmmaking-shell mode-${workspace} ${focus ? 'focus-mode' : ''} ${timelineTall?'timeline-tall':''}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Clapperboard size={21} strokeWidth={2.4}/></span><strong>{studioName}<span>.</span></strong><span className="brand-edition">STUDIO</span></div>
      <div className="project-controls"><button className="quiet project-button" onClick={async()=>{pause();if(useStudio.getState().dirty&&!await persist())return;close();setHome('projects');}}><House size={17}/><span>Home</span></button><span className="divider"/><label className="project-name"><input aria-label="Project name" key={project.name} defaultValue={project.name} maxLength={100} onBlur={e => { rename(e.target.value); e.target.value = e.target.value.trim() || project.name; }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label><IconButton title="Project options" onClick={()=>showDialog('projects')}><ChevronDown size={15}/></IconButton>{saveStatus==='Save failed'&&<button className="quiet" onClick={()=>void backupMovie(project).catch(showError)}>Download recovery backup</button>}<span className="save-state" role="status"><Check size={14}/> {headerStatus}</span></div>
      <div className="top-actions"><div className="history"><IconButton title="Undo" onClick={() => run(() => useStudio.getState().undo())} disabled={!hasUndo}><Undo2 size={17}/></IconButton><IconButton title="Redo" onClick={() => run(() => useStudio.getState().redo())} disabled={!hasRedo}><Redo2 size={17}/></IconButton></div><span className="divider"/><button className="quiet performance-launch" title="Record actor performance using camera" onClick={()=>{pause();showDialog('performance');}}><Camera size={16}/><span>Perform</span></button><IconButton title={playing?'Pause preview':'Play preview'} onClick={() => void play()}>{playing?<Pause size={17}/>:<Play size={17}/>}</IconButton><IconButton title="Save project" onClick={() => persist(undefined, true)}><Save size={17}/></IconButton><IconButton title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</IconButton><IconButton title="Quick start" onClick={() => showDialog('help')}><CircleHelp size={18}/></IconButton><button className="primary export-button" onClick={() => showDialog('export')}><Download size={17}/> <span>Export video</span></button>{localStudioMode
        ? <span className="local-studio-pill" title="Local creator session · No Firebase login · Projects saved in this browser">Local Studio</span>
        : <IconButton title={account ? 'Your account' : 'Sign in'} onClick={() => showDialog('account')} className="account-button">{account?.email?.slice(0, 1).toUpperCase() ?? <UserRound size={17}/>}</IconButton>}</div>
    </header>
    {workspace === 'direct' && <><nav className="mobile-nav" aria-label="Workspace panels"><button className={mobilePanel === 'library' ? 'active' : ''} onClick={() => setMobilePanel('library')}>Assets</button><button className={mobilePanel === 'stage' ? 'active' : ''} onClick={() => setMobilePanel('stage')}>Stage</button><button className={mobilePanel === 'inspector' ? 'active' : ''} onClick={() => setMobilePanel('inspector')}>Inspector</button><IconButton title="Undo" disabled={!hasUndo} onClick={() => run(() => useStudio.getState().undo())}><Undo2 size={17}/></IconButton><IconButton title="Redo" disabled={!hasRedo} onClick={() => run(() => useStudio.getState().redo())}><Redo2 size={17}/></IconButton></nav>
    <main className={`workspace mobile-${mobilePanel}`} style={{ '--asset-width': `${assetWidth}px`, '--inspector-width': `${inspectorWidth}px` } as CSSProperties}>
      <div className="library-shell"><AssetLibrary active={library} change={useStudio.getState().setLibrary}
          project={project} characters={project.characters} scene={scene}
          newCharacter={()=>editCharacter()} editCharacter={editCharacter}
          duplicateCharacter={duplicateCastCharacter} removeCharacter={character=>deleteCharacter(character.id)}
          addActor={addActor} setWorld={setWorld} uploadWorld={uploadWorld}
          savedWorlds={worlds} applySavedWorld={world=>setWorld(world.environment,world.objects,world.backgroundImage)}
          saveCurrentWorld={()=>saveWorld(scene)} renameSavedWorld={renameWorldPreset}
          duplicateSavedWorld={duplicateWorldPreset} deleteSavedWorld={deleteWorldPreset}
          clearWorldImage={clearWorldImage} addProp={addObject} uploadProp={uploadProp}
          inspectProp={inspectAssetObject} duplicateProp={duplicateAssetObject} deleteProp={deleteAssetObject}
          addAction={addPerformance} selectActor={id=>{select({kind:'actor',id});setMobilePanel('inspector');}}
          addVfx={effect=>run(()=>{const start=clamp(time.current.local,0,scene.duration-.1); const actor=evaluate(scene,start).actors.find(item=>item.id===selection?.id);addClip({id:uid(),track:'vfx',effect,start,length:Math.min(.75,scene.duration-start),x:actor?.x??480,y:actor?actor.y-120:252,strength:1});seek(Math.min(scene.duration-.001,start+.2));})}
          addTransition={effect=>run(()=>{const start=clamp(time.current.local,0,scene.duration-.1);addClip({id:uid(),track:'transition',effect,start,length:Math.min(.5,scene.duration-start)});})}
          addText={()=>showClip('text')}
          holdObject={() => showClip('props')} addSound={addSound} dialogue={()=>showAudio('dialogue')}
          audio={()=>showAudio('audio')} music={()=>showAudio('music')}
          inspectAudio={inspectAssetAudio} duplicateAudio={duplicateAssetAudio} deleteAudio={deleteAssetAudio}/></div>
      <section className="stage-panel" aria-label="Studio stage" onDragOver={event=>{if(event.dataTransfer.types.some(type=>type.startsWith('application/x-toonroom-')))event.preventDefault();}} onDrop={event=>{
        event.preventDefault();const character=project.characters.find(c=>c.id===event.dataTransfer.getData('application/x-toonroom-character'));
        if(character){addActor(character);return;}
        const kind=event.dataTransfer.getData('application/x-toonroom-prop');if(kind&&(propKinds as readonly string[]).includes(kind)&&kind!=='image')addObject(kind as Prop['kind']);
      }}>
        <header className="stage-heading"><div className="stage-scene-heading">
          <span className="stage-kicker"><i/> SCENE PREVIEW</span>
          <div className="stage-scene-switcher">
            <button className="scene-title" onClick={()=>showDialog('scenes')}
              title="Manage all scenes">{scene.name}<ChevronDown size={14}/></button>
            <div className="stage-scene-pager" role="group" aria-label="Navigate scenes">
              <button className="quiet" title="Previous scene" aria-label="Previous scene"
                disabled={sceneIndex<=0} onClick={()=>switchScene(project.scenes[sceneIndex-1])}><ChevronLeft size={16}/></button>
              <span>{sceneIndex+1} / {project.scenes.length}</span>
              <button className="quiet" title="Next scene" aria-label="Next scene"
                disabled={sceneIndex>=project.scenes.length-1}
                onClick={()=>switchScene(project.scenes[sceneIndex+1])}><ChevronRight size={16}/></button>
            </div>
            <IconButton title={project.scenes.length===1?'Clear current scene':'Delete current scene'} onClick={()=>dropDirectScene(scene)}><Trash2 size={15}/></IconButton>
          </div>
        </div><div className="stage-options"><button className={`quiet arrange-button ${arrange ? 'is-active' : ''}`} onClick={() => { pause(); setArrange(value => !value); }}><MousePointer2 size={15}/><span>Arrange</span></button><Select aria="Preview aspect ratio" value={format} onChange={setFormat} options={formats} render={formatLabel}/><IconButton title={focus ? 'Exit focus mode' : 'Focus stage'} onClick={() => setFocus(value => !value)}>{focus ? <X size={18}/> : <Maximize size={16}/>}</IconButton></div></header>
        {placement&&<div className="stage-placement-tools" role="group" aria-label="Stage placement">
          <strong>{placement.kind==='path' ? placement.editing
            ? placement.waypoint?'Click to place a waypoint':'Drag the path handles · Double-click to add a waypoint'
            : placement.points.length ? placement.waypoint?'Click the waypoint':'Click the finish · Shift-click to add a waypoint' : 'Click the starting point'
            : placement.kind==='point' ? 'Click where the character should '+(placement.action??'point')
            : placement.kind==='prop-landing' ? 'Click where the prop should land'
            : placement.kind==='recover' ? 'Click where to bring the character on stage' : 'Click where to place this clip'}</strong>
          {placement.kind==='path'&&<><Select aria="Movement pace" value={placement.gait} options={['walk','run']} onChange={gait=>setPlacement({...placement,gait})}/>
            <Select aria="Walking style" value={placement.style} options={gaitStyles} render={style=>gaitStyleNames[style]} onChange={style=>setPlacement({...placement,style})}/>
            {placement.points.length===0&&placement.actor&&placement.mode==='move'&&!placement.editing&&
              <button type="button" className="quiet" onClick={()=>{
                const actor=evaluate(scene,placement.start).actors.find(item=>item.id===placement.actor);
                if(actor)stagePlacement({x:actor.x,y:actor.y});
              }}>Use current position</button>}
            {placement.points.length>0&&<>
              <button type="button" className="quiet" aria-pressed={!!placement.waypoint} onClick={()=>setPlacement({...placement,waypoint:!placement.waypoint})}>Add waypoint</button>
              {!placement.editing&&<button type="button" className="quiet" onClick={()=>setPlacement({...placement,waypoint:false,points:placement.points.slice(0,-1)})}>Back</button>}
              {placement.editing&&<button type="button" className="primary" onClick={()=>run(()=>commitPath(placement,currentScene(useStudio.getState())))}>Save path</button>}
            </>}
          </>}
          <button type="button" className="quiet" onClick={()=>setPlacement(undefined)}>Cancel</button>
        </div>}
        <div className="viewer">

          <Stage key={session} project={project} scene={scene} time={time}
          playing={playing} onDestination={placement ? stagePlacement:undefined}
          editPath={placement?.kind==='path'&&!!placement.editing}
          smoothGuide={placement?.kind==='path'||!!pathClip?.style}
          movePathPoint={(index,point)=>setPlacement(draft=>draft?.kind==='path'&&draft.editing?{...draft,
            points:draft.points.map((item,at)=>at===index?point:item)}:draft)}
          removePathPoint={index=>setPlacement(draft=>draft?.kind==='path'&&draft.editing&&index>0&&index<draft.points.length-1
            ?{...draft,points:draft.points.filter((_,at)=>at!==index)}:draft)}
          pathPoints={placement ? placement.kind==='path'?placement.points:undefined : selectedPath}
          edgePlacement={placement?.kind==='path'&&((placement.mode==='enter'&&!placement.points.length)||(placement.mode==='exit'&&placement.points.length>0))} edit={true} format={format} selection={selection} selected={select} subtitles={subtitles} snap={snap} mixer={mixer} quality={quality} onFrame={setShot}
         reorderEntity={reorderSceneLayer}
         flipEntity={id=>{const actor=scene.actors.find(item=>item.id===id);if(actor)patchActor({...actor,flip:!actor.flip});else{const object=scene.objects.find(item=>item.id===id);if(object)patchObject({...object,flip:!object.flip});}}}
         duplicateEntity={()=>duplicateSelection()} removeEntity={()=>removeSelection()} move={(id, coords) => {
          const actor = scene.actors.find(item => item.id === id), object = scene.objects.find(item => item.id === id);
          if (actor) {
            editScene(current => translateSceneActor(current,id,coords));
          } else if (object) patchObject({ ...object, ...coords });
        }}/></div>
        <div className="transport"><div className="transport-buttons"><button className="play-button" title={playing || preparing ? 'Pause movie' : 'Play movie'} aria-label={playing || preparing ? 'Pause movie' : 'Play movie'} onClick={() => void play()}>{playing || preparing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><IconButton title="Stop movie" onClick={() => seekMovie(0)}><Square size={14}/></IconButton><IconButton title="Loop scene" active={loop} onClick={() => { if (livePlaying.current || livePreparing.current) pause(); setLoop(value => !value); }}><Repeat2 size={17}/></IconButton></div><span className="timecode"><span ref={counter}>00:00.00</span><i>/</i><span>{clock(movie.duration)}</span></span><input className="preview-range" aria-label="Seek movie" ref={range} type="range" min={0} max={movie.duration} step={.01} defaultValue={0} onChange={e => seekMovie(Number(e.target.value))}/><div className="transport-end"><details className="playback-range-controls"><summary title="Play a selected time range in this scene">Scene range</summary><div><label>From<input aria-label="Playback range start" type="number" step=".1" min={0} max={scene.duration-.1} value={playbackRange?.start??0} onChange={e=>{pause();setPlaybackRange({start:clamp(Number(e.target.value),0,(playbackRange?.end??scene.duration)-.1),end:playbackRange?.end??scene.duration});}}/></label><label>To<input aria-label="Playback range end" type="number" step=".1" min={(playbackRange?.start??0)+.1} max={scene.duration} value={playbackRange?.end??scene.duration} onChange={e=>{pause();setPlaybackRange({start:playbackRange?.start??0,end:clamp(Number(e.target.value),(playbackRange?.start??0)+.1,scene.duration)});}}/></label><button className="quiet" onClick={()=>{pause();setPlaybackRange(undefined);}}>Whole film</button></div></details><span className="shot-pill">{arrange ? 'Arrange mode' : shotLabel(shot)}</span><IconButton title={muted ? 'Unmute preview' : 'Mute preview'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</IconButton><IconButton title="Toggle subtitles" active={subtitles} onClick={() => setSubtitles(value => !value)}><Captions size={18}/></IconButton></div></div>
      </section>
      {<Inspector onLayer={reorderSceneLayer} onUseProp={choosePropAction} onLanding={clip=>pickPropLanding(clip,undefined,true)} onPresence={actorPresence} scene={scene} actors={actorNames} characters={project.characters} selection={selection} select={select} patchActor={patchActor} patchObject={patchObject} patchClip={patchClip} patchScene={patch => editScene(value => ({ ...value, ...patch }))} editCharacter={editCharacter} addDialogue={() => showAudio('dialogue')} addAction={() => showClip('body')} scenes={project.scenes.length} sceneIndex={sceneIndex} openScenes={() => showDialog('scenes')} remove={removeSelection} duplicate={duplicateSelection} snap={snap} setSnap={setSnap} subtitles={subtitles} setSubtitles={setSubtitles} quality={quality} setQuality={setQuality} setDestination={()=>{if(pathClip)beginPath(pathClip.gait??'walk',pathClip.actor,'move',undefined,pathClip.start,pathClip);}}
        previewPath={()=>{if(pathClip){seek(pathClip.start);void play({start:pathClip.start,end:pathClip.start+pathClip.length});}}}
        onWalk={id=>beginPath('walk',id)} onRecover={id=>beginPlacement({kind:'recover',sceneId:scene.id,start:time.current.local,id})}
        onOverlay={id=>beginPlacement({kind:'overlay',sceneId:scene.id,start:time.current.local,id})} getPlayhead={getPlayhead} alignVoiceClip={alignVoiceClip} precision={() => showDialog('lipsync')} rerecord={() => { const clip=scene.clips.find(c=>c.id===selection?.id); if(clip?.track==='dialogue'){pause();setRequestedAudio({track:'dialogue',actor:clip.actor,start:clip.start,replaceId:clip.id});setDialog('audio');} }}/>}
      <PanelResize side="left" value={assetWidth} change={setAssetWidth}/>
      <PanelResize side="right" value={inspectorWidth} change={setInspectorWidth}/>
    </main>
    <Timeline key={session} scene={scene} movie={movie} characters={project.characters} selection={selection} selectedClipIds={selectedClipIds} selectedKeyframe={selectedKeyframe}
      selectClips={useStudio.getState().selectClips} selectKeyframe={useStudio.getState().selectKeyframe}
      seek={seek} seekMovie={seekMovie} seekScene={seekScene} addScene={createDirectScene} deleteScene={dropDirectScene} tall={timelineTall} onTall={toggleTimelineHeight} onPropAction={(actor,action,start)=>showClip('body',action,undefined,actor,start)} onPath={(actor,gait,start)=>beginPath(gait,actor,'move',undefined,start)} onPoint={(actor,action,start)=>beginPlacement({kind:'point',sceneId:currentScene(useStudio.getState()).id,start,id:actor,action})} manageScenes={()=>showDialog('scenes')} add={showClip} onPerformance={()=>{pause();showDialog('performance');}} remove={()=>run(deleteTimelineSelection)} duplicate={duplicateTimelineSelection}
      copy={copyTimelineSelection} cut={()=>run(cutTimelineSelection)} paste={pasteTimelineSelection} split={splitTimelineSelection}
      apply={editTimeline} compact={compact} playing={playing} onResizeScene={duration => { editScene(current => resizeSceneTimeline(current,duration)); const updated=currentScene(useStudio.getState()); if(time.current.local>updated.duration)seek(updated.duration); }} playhead={time.current.movie} onCompact={() => {setTimelineTall(false);setCompact(value => !value);}}/></>}
    {backupInput}
    <OfflineStatus status={saveStatus} save={()=>useStudio.getState().dirty?persist():Promise.resolve(true)}/>
    {noticeToast}
    {content}
  </div>;
}
