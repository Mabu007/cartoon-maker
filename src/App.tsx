import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Captions, Check, ChevronDown, CircleHelp, Clapperboard, Cloud, Download, Expand, FolderOpen, Maximize, MousePointer2, Pause, Play, Redo2, Repeat2, Save, Sparkles, Square, Moon, Sun, Undo2, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { approveScript, compileMovie, missingRentMovie, reviseScript, startProduction } from './engine/production.ts';
import { clamp } from './engine/animation.ts';
import { evaluate, locate, MOVIE_FRAME_RATE, projectDuration } from './engine/evaluate.ts';
import { makeProject, makeProp, makeScene, soundNames } from './engine/presets.ts';
import { compatibleObjects, nearestObject, objectDependencies, removeObjectWithDecisions, repairOrphanedObjectActions, replaceWorldObjects, type ObjectDependencyDecision } from './engine/interactions.ts';
import { label, shotLabel, SceneDefinition, uid, type Action, type ActorData, type Character, type Clip, type Production, type Project, type Prop, type Scene, type ScriptSceneData, type Track } from './engine/schema.ts';
import type { Format } from './engine/renderer.ts';
import { cloudAudio, cloudEnabled, cloudProjects, deleteCloud, listenAccount, login, logout, uploadProject, type Account } from './services/cloud.ts';
import { audioLength, putAudio, createAudioMixer, setRemoteAudio, type Mixer } from './services/audio.ts';
import { analyzeLipSync } from './services/lipSync.ts';
import { duplicateProject, duplicateScene, listLocal, mergeLocal, removeLocal, saveLocal, type SavedProject } from './services/projects.ts';
import { exampleDirector, hostedDirector } from './services/director.ts';
import { speechProvider } from './services/speech.ts';
import { renderSpeech, type AiAccess } from './services/filmmaker.ts';
import { backupMovie, restoreMovie } from './services/projectExchange.ts';
import { DirectorPanel } from './ui/DirectorPanel.tsx';
import { prepareArtwork } from './services/artwork.ts';
import { changeClipTiming, copyClip, currentScene, initial, removeEntity, useStudio, type Selection } from './studio.ts';
import { AssetLibrary } from './ui/AssetLibrary.tsx';
import { CharacterFactory } from './ui/CharacterFactory.tsx';
import { AccountDialog, AddClipDialog, AudioDialog, DirectorDialog, ExportDialog, HelpDialog, ProjectsDialog, ScenesDialog, type AudioRequest, type ClipRequest } from './ui/Dialogs.tsx';
import { ObjectDependenciesDialog } from './ui/ObjectDependenciesDialog.tsx';
import { Inspector } from './ui/Inspector.tsx';
import { Stage, type PreviewTime } from './ui/Stage.tsx';
import { clock, formats, IconButton, Modal, Select } from './ui/shared.tsx';
import { Timeline } from './ui/Timeline.tsx';
import { TimelineCodeDialog } from './ui/TimelineCodeDialog.tsx';
import { Welcome } from './ui/Welcome.tsx';
import { insertCameraShot, sceneToCode, validateSceneReplacement } from './engine/timelineCode.ts';
import { movieToCode, sceneBuildingContext, validateMovieReplacement } from './engine/movieTimeline.ts';
import { deleteMovementKeyframe, deleteTimelineClips, duplicateTimelineClips, pasteTimelineClips, resizeSceneTimeline, selectableClips, splitTimelineClips } from './engine/timelineEditing.ts';

const StoryStudio = lazy(() => import('./ui/StoryStudio.tsx').then(module => ({ default: module.StoryStudio })));
const ScreenplayStudio = lazy(() => import('./ui/ScreenplayStudio.tsx').then(module => ({ default: module.ScreenplayStudio })));

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

const studioName = import.meta.env.VITE_STUDIO_NAME?.trim() || 'Toonroom';
type Dialog = 'projects' | 'scenes' | 'character' | 'clip' | 'audio' | 'export' | 'account' | 'help' | 'director' | 'confirm' | 'dependencies' | 'ai' | 'code' | null;
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
  const [workspace, setWorkspace] = useState<'create' | 'write' | 'direct'>('direct');
  const [home, setHome] = useState<'landing' | 'projects' | 'studio'>(() => localStorage.getItem('toonroom.started') ? 'projects' : 'landing');
  const [seedIdea, setSeedIdea] = useState('');
  const [directorOpen, setDirectorOpen] = useState(false);
  const [assetWidth, setAssetWidth] = useState(263), [inspectorWidth, setInspectorWidth] = useState(254);
  const [scriptTarget, setScriptTarget] = useState<{ sceneId?: string; lineId?: string; autoDraft?: boolean }>({});
  const [theme, setTheme] = useState(() => localStorage.getItem('toonroom.theme') === 'light' ? 'light' : 'dark');
  const [compiling, setCompiling] = useState(false);
  const compileInFlight = useRef(false);
  const importFile = useRef<HTMLInputElement>(null);
  const session = useStudio(state => state.session);
  const sceneTarget = { session, sceneId: scene.id };
  const dirty = useStudio(state => state.dirty);
  const sceneIndex = project.scenes.findIndex(item => item.id === scene.id);
  const [dialog, setDialog] = useState<Dialog>(null), [account, setAccount] = useState<Account | null>(null), [items, setItems] = useState<SavedProject[]>([]);
  const [personalModel, setPersonalModel] = useState<AiAccess['personal']>(null);
  const ai = { account, personal: personalModel };
  const scope = account?.uid ?? 'guest';
  const [worlds, setWorlds] = useState<WorldPreset[]>([]);
  const [saveStatus, setSaveStatus] = useState('Saved on device'), [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [factory, setFactory] = useState<Character>(), [requestedClip, setRequestedClip] = useState<ClipRequest>({});
  const [requestedAudio, setRequestedAudio] = useState<AudioRequest>({ track: 'dialogue', start: 0 });
  const [confirm, setConfirm] = useState<{ title: string; text: string; run: () => void }>();
  const [dependentObjectId, setDependentObjectId] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('16:9'), [arrange, setArrange] = useState(false), [subtitles, setSubtitles] = useState(true), [quality, setQuality] = useState(true);
  const [snap, setSnap] = useState(true), [compact, setCompact] = useState(false), [focus, setFocus] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'stage' | 'library' | 'inspector'>('stage');
  const [playing, setPlaying] = useState(false), [preparing, setPreparing] = useState(false), [loop, setLoop] = useState(false), [muted, setMuted] = useState(false), [shot, setShot] = useState('wide');
  const mixer = useRef<Mixer | null>(null), time = useRef<PreviewTime>({ scene, local: 0 });
  const range = useRef<HTMLInputElement>(null), counter = useRef<HTMLSpanElement>(null), frame = useRef(0), animationToken = useRef(0);
  const livePlaying = useRef(false), livePreparing = useRef(false), settings = useRef({ loop, muted }), originalScope = useRef(scope);
  const cloudDeletes = useRef(new Set<string>());
  const cloudQueue = useRef<Promise<unknown>>(Promise.resolve());
  const timelineClipboard = useRef<{ projectId: string; sceneId: string; clips: Clip[] } | null>(null);
  const saveToken = useRef(0);
  settings.current = { loop, muted };
  const actorNames = Object.fromEntries(scene.actors.map(actor => [actor.id, project.characters.find(character => character.id === actor.characterId)?.name ?? 'Actor']));
  const tell = useCallback((message: string, error = false) => setNotice({ message, error }), []);
  const close = () => setDialog(null);
  const showError = (error: unknown) => tell(errorMessage(error), true);
  useEffect(() => { if (notice) { const timer = window.setTimeout(() => setNotice(null), notice.error ? 7200 : 3200); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { document.title = `${project.name} · ${studioName}`; }, [project.name]);
  useEffect(() => {
    if (window.matchMedia('(max-width: 790px)').matches) setQuality(false);
  }, []);
  useEffect(() => {
    if (!cloudEnabled) return;
    let dispose: (() => void) | undefined, alive = true;
    listenAccount(user => { if (alive) setAccount(user); }).then(unsubscribe => { if (alive) dispose = unsubscribe; else unsubscribe(); }).catch(err => tell(errorMessage(err), true));
    return () => { alive = false; dispose?.(); };
  }, [tell]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); mixer.current?.close(); }, []);

  function updateCursor(scene: Scene, pos: number, redraw: boolean) {
    time.current = { scene, local: pos };
    if (range.current) range.current.value = String(pos);
    if (counter.current) counter.current.textContent = clock(pos);
    window.dispatchEvent(new CustomEvent('toonroom-time', { detail: pos }));
    if (redraw) window.dispatchEvent(new Event('toonroom-seek'));
  }
  function pause() {
    animationToken.current++;
    cancelAnimationFrame(frame.current);
    mixer.current?.stop();
    livePlaying.current = false; livePreparing.current = false;
    setPlaying(false); setPreparing(false);
  }
  function loadProject(next: Project, edited = false) {
    pause(); setArrange(false); close();
    useStudio.getState().open(next, edited);
    updateCursor(currentScene(useStudio.getState()), 0, false);
    saveToken.current++;
    setSaveStatus(edited ? 'Saving…' : 'Saved on device');
  }
  useEffect(() => {
    let alive = true;
    const active = useStudio.getState();
    let local: SavedProject[];
    try {
      if (originalScope.current !== scope && active.dirty) {
        saveLocal(originalScope.current, active.project);
        active.markSaved(active.project);
      }
      local = listLocal(scope);
      if (originalScope.current !== scope || local.length) loadProject(local[0]?.project ?? initial);
      originalScope.current = scope;
      setItems(local); setWorlds(worldPresets(scope));
    } catch (error) {
      setSaveStatus('Save failed');
      tell(errorMessage(error), true);
      return;
    }
    setRemoteAudio(account ? id => cloudAudio(account, id) : undefined);
    const opened = useStudio.getState();
    if (account) void cloudProjects(account).then(result => {
      if (!alive) return;
      const merged = mergeLocal(scope, result.documents.filter(entry => !cloudDeletes.current.has(scope + '/' + entry.project.id)));
      setItems(merged);
      const current = useStudio.getState();
      if (current.session === opened.session && current.project === opened.project && !current.dirty) {
        const cached = local.find(entry => entry.project.id === current.project.id);
        const latest = merged.find(entry => entry.project.id === current.project.id);
        if (latest && (!cached || latest.updated > cached.updated)) loadProject(latest.project);
        else if (current.project.id === initial.id && merged[0] && merged[0].project.id !== initial.id) loadProject(merged[0].project);
      }
      if (result.skipped) tell(`${result.skipped} invalid cloud project(s) were skipped.`, true);
    }).catch(error => { if (alive) tell(`Cloud projects unavailable. ${errorMessage(error)}`, true); });
    return () => { alive = false; };
  }, [scope]);

  function persist(document = useStudio.getState().project, manual = false) {
    const saveScope = originalScope.current;
    const syncAccount = saveScope === scope ? account : null;
    const token = ++saveToken.current;
    try {
      if (cloudDeletes.current.has(saveScope + '/' + document.id)) throw new Error('This project is being deleted.');
      const updated = saveLocal(saveScope, document);
      useStudio.getState().markSaved(document);
      if (saveScope === scope) setItems(listLocal(saveScope));
      setSaveStatus(syncAccount ? 'Syncing…' : 'Saved on device');
      if (manual) tell('Project saved on this device.');
      if (syncAccount) {
        cloudQueue.current = cloudQueue.current.catch(() => {}).then(() => uploadProject(syncAccount, document, updated)).then(() => {
          if (saveToken.current === token && useStudio.getState().project === document) setSaveStatus('Saved to cloud');
        }).catch(error => {
          if (saveToken.current === token && useStudio.getState().project === document) {
            setSaveStatus('Cloud sync failed'); tell(`Saved on this device. ${errorMessage(error)}`, true);
          }
        });
      }
      return true;
    } catch (error) { setSaveStatus('Save failed'); showError(error); return false; }
  }
  useEffect(() => {
    if (!dirty) return;
    setSaveStatus('Saving…');
    const timer = window.setTimeout(() => {
      const current = useStudio.getState();
      if (current.dirty && current.project === project) persist(project);
    }, 520);
    return () => clearTimeout(timer);
  }, [project, dirty, scope]);
  useEffect(() => {
    const flush = () => {
      const current = useStudio.getState();
      if (!current.dirty || cloudDeletes.current.has(originalScope.current + '/' + current.project.id)) return;
      try { saveLocal(originalScope.current, current.project); } catch { /* keep pending edits in memory */ }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
  useEffect(() => {
    const local = time.current.scene.id === scene.id ? clamp(time.current.local, 0, scene.duration) : 0;
    updateCursor(scene, local, true);
  }, [scene]);
  useEffect(() => { if (mixer.current) mixer.current.master.gain.value = muted ? 0 : 1; }, [muted]);

  async function play() {
    if (livePlaying.current || livePreparing.current) { pause(); return; }
    const token = ++animationToken.current;
    livePreparing.current = true; setPreparing(true); setArrange(false);
    const state = useStudio.getState(), current = currentScene(state);
    const at = time.current.local >= current.duration - .01 ? 0 : time.current.local;
    try {
      const audio = mixer.current ??= createAudioMixer();
      await audio.context.resume();
      audio.monitor();
      audio.master.gain.value = settings.current.muted ? 0 : 1;
      const startIndex = state.project.scenes.findIndex(item => item.id === current.id);
      const sequence = settings.current.loop ? [current] : state.project.scenes.slice(startIndex);
      await audio.prepare(sequence);
      if (token !== animationToken.current) return;
      const startTime = audio.context.currentTime + .03;
      audio.schedule(sequence, at, startTime);
      livePlaying.current = true; setPlaying(true);
      livePreparing.current = false; setPreparing(false);
      let origin = startTime - at, earliest = at, lastFrame = -1;
      const duration = projectDuration(sequence);
      const tick = () => {
        if (token !== animationToken.current) return;
        let elapsed = Math.max(earliest, audio.context.currentTime - origin);
        if (elapsed >= duration) {
          if (settings.current.loop && sequence.length === 1) { origin = audio.context.currentTime; earliest = 0; elapsed = 0; audio.schedule(sequence, 0, origin); }
          else { const last = sequence.at(-1)!; updateCursor(last, last.duration, true); pause(); return; }
        }
        const next = locate(sequence, elapsed);
        if (time.current.scene.id !== next.scene.id) {
          time.current = { scene: next.scene, local: next.local };
          useStudio.getState().setScene(next.scene.id);
        }
        const position = Math.floor(elapsed * MOVIE_FRAME_RATE);
        if (position !== lastFrame) { updateCursor(next.scene, next.local, false); lastFrame = position; }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (error) { if (token === animationToken.current) { pause(); showError(error); } }
  }
  function seek(value: number) { pause(); setArrange(false); const current = currentScene(useStudio.getState()); updateCursor(current, clamp(value, 0, current.duration), true); }
  function switchScene(value: Scene) {
    const state = useStudio.getState();
    if (state.session !== session) return;
    const target = state.project.scenes.find(item => item.id === value.id);
    if (!target) return;
    pause(); updateCursor(target, 0, true); state.setScene(target.id); close();
  }
  function openProject(value: Project, isNew = false) {
    if (useStudio.getState().dirty && !persist()) return false;
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
  function replaceScene(next: Scene, base: string) {
    commitScene(current => {
      if (sceneToCode(current) !== base) throw new Error('The scene changed while this edit was open. Reopen it and try again.');
      return validateSceneReplacement(useStudio.getState().project, current.id, next);
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
    if (value.track === 'dialogue') {
      const before = scene.clips.find(clip => clip.id === value.id);
      const script = project.production?.screenplay.scenes.find(item => item.id === scene.id);
      const from = project.production?.graph.find(item => item.sceneId === scene.id)?.events[value.id]?.line;
      if (before?.track === 'dialogue' && before.text !== value.text && script && from) {
        if (value.text.length > 400 || !value.text.trim()) { tell('Enter a spoken line between 1 and 400 characters.', true); return; }
        if (project.production?.graph.find(item => item.sceneId === scene.id)?.locked.includes(value.id)) { tell('Unlock the dialogue clip before changing its line.', true); return; }
        const next = { ...script, elements: script.elements.map(line => line.id === from ? { ...line, text: value.text } : line) };
        void commitDirection(next, script);
        return;
      }
    }
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
      if (body.action === 'sit') {
        const target = compatibleObjects(current, 'sit').find(item => item.id === body.target) ?? nearestObject(current, body.actor, 'sit');
        if (!target) { tell('Add a chair or sofa before using Sit. Characters cannot sit on air.', true); return; }
        updated = { ...body, layer: 'body', target: target.id };
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
  function addClip(value: Clip) {
    commitScene(current => {
      if (current.clips.some(clip => clip.id === value.id)) throw new Error('This clip already exists.');
      const clip = value.track === 'camera' ? value : changeClipTiming(value, value.start, value.length, current.duration);
      return { ...current, clips: clip.track === 'camera' ? insertCameraShot(current.clips, clip, [...current.actors, ...current.objects].map(item => item.id)) : [...current.clips, clip] };
    });
    setArrange(false); select({ kind: 'clip', id: value.id }); close();
  }
  function showClip(track?: Track, action?: Action) {
    pause();
    if (track === 'dialogue' || track === 'music') { showAudio(track); return; }
    setRequestedClip({ track, action, actor: selection?.kind === 'actor' ? selection.id : undefined }); setDialog('clip');
  }
  function showAudio(track: AudioRequest['track'], actor?: string, start = time.current.local) { pause(); setRequestedAudio({ track, actor: actor ?? (selection?.kind === 'actor' ? selection.id : undefined), start }); setDialog('audio'); }
  function addActor(character: Character) {
    if (scene.actors.length >= 24) { tell('A scene can have up to 24 actors.', true); return; }
    const id = uid();
    editScene(current => ({ ...current, actors: [...current.actors, { id, characterId: character.id, x: 320 + (current.actors.length % 5) * 115, y: 441, scale: 1, rotation: 0, depth: 0, view: 'three-quarter', expression: 'neutral', flip: false }] }));
    select({ id, kind: 'actor' });
    setMobilePanel('stage'); setArrange(true);
  }
  function addObject(kind: Prop['kind']) {
    if (scene.objects.length >= 100) { tell('A scene can have up to 100 props.', true); return; }
    const value = makeProp(kind, 475 + (scene.objects.length % 5) * 25, 430);
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
  async function uploadWorld(file: File) {
    try {
      const imported = await prepareArtwork(file, 'world');
      pause();
      commitScene(current => ({ ...current, backgroundImage: imported.data }));
      setMobilePanel('stage');
      tell('World image added. Your cast and props are still in place.');
    } catch (error) { showError(error); }
  }
  async function uploadProp(file: File) {
    try {
      const imported = await prepareArtwork(file, 'prop');
      const maxDimension = Math.max(imported.width, imported.height);
      const sizing = Math.min(1, 165 / maxDimension);
      const prop = makeProp('image', 480, 435, {
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Picture prop',
        imageData: imported.data, imageWidth: Math.max(10, Math.round(imported.width * sizing)),
        imageHeight: Math.max(10, Math.round(imported.height * sizing)), interaction: 'none'
      });
      pause();
      commitScene(current => ({ ...current, objects: [...current.objects, prop] }));
      select({ kind: 'object', id: prop.id });
      setMobilePanel('inspector');
      tell('Picture prop added. Set its interaction type in the inspector.');
    } catch (error) { showError(error); }
  }
  function saveWorld(value: Scene) {
    try {
      const next = [...worlds.filter(item => item.name !== value.name), { name: value.name, environment: value.environment, objects: value.objects, backgroundImage: value.backgroundImage }].slice(-24);
      localStorage.setItem(worldKey(scope), JSON.stringify(next)); setWorlds(next); tell('Furnished world saved.');
    } catch (error) { showError(error); }
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
    ask('Delete this character?', 'This removes their actors and attached clips from every scene.', () => {
      edit(current => ({ ...current, characters: current.characters.filter(item => item.id !== id), scenes: current.scenes.map(item => item.actors.filter(actor => actor.characterId === id).reduce((value, actor) => removeEntity(value, actor.id), item)) })); select(null);
    });
  }
  function editTimeline(next: Scene, ids?: string[]) {
    run(() => {
      const state = useStudio.getState();
      if (state.session !== session || state.sceneId !== next.id) throw new Error('Scene changed during timeline edit.');
      const previous = currentScene(state);
      if (previous === next) return;
      commitScene(() => next);
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
  async function regenerateVoice(clip: Extract<Clip, { track: 'dialogue' }>, text: string, voice: string): Promise<string> {
    if (!text.trim() || text.length > 400) throw new Error('Enter a line with 1 to 400 characters.');
    const output = await speechProvider(account).synthesize(text, voice);
    const seconds = await audioLength(output);
    if (seconds < .1 || clip.start + seconds > 180) throw new Error('The generated line does not fit this scene. Shorten it or split the scene.');
    const analysis = await analyzeLipSync(output, text, seconds);
    const audioId = uid();
    await putAudio(audioId, output);
    commitScene(current => {
      const before = current.clips.find(item => item.id === clip.id);
      if (before?.track !== 'dialogue' || JSON.stringify(before) !== JSON.stringify(clip)) {
        throw new Error('The dialogue changed while voice generation was running. Generate the line again.');
      }
      return { ...current, duration: Math.max(current.duration, Math.ceil((clip.start + seconds) * 100) / 100),
        clips: current.clips.map(item => item.id === clip.id ? { ...before, text, length: Math.round(seconds * 100) / 100,
          asset: `asset:${audioId}`, offset: 0, visemes: analysis.cues } : item) };
    });
    return analysis.source === 'rhubarb' ? 'Voice regenerated and aligned to the recording.' : 'Voice regenerated; estimated mouth cues are active until Rhubarb analysis is configured.';
  }
  function addSound(name: typeof soundNames[number]) { const start = clamp(time.current.local, 0, scene.duration - .1); run(() => addClip({ id: uid(), track: 'audio', name: label(name), asset: `builtin:${name}`, length: Math.min(.8, scene.duration - start), start, muted: false, volume: .8, offset: 0 })); }
  async function deleteSavedProject(item: Project) {
    const key = scope + '/' + item.id;
    if (originalScope.current !== scope || cloudDeletes.current.has(key)) return;
    cloudDeletes.current.add(key);
    try {
      if (account) { await cloudQueue.current; await deleteCloud(account, item.id); }
      removeLocal(scope, item.id);
      if (originalScope.current !== scope) return;
      const entries = listLocal(scope);
      setItems(entries);
      if (useStudio.getState().project.id === item.id) loadProject(entries[0]?.project ?? makeProject());
      tell('Project deleted.');
    } catch (error) {
      cloudDeletes.current.delete(key);
      showError(error);
    }
  }
  function deleteProject(item: Project) {
    ask(`Delete “${item.name}”?`, 'This permanently removes the saved project.', () => void deleteSavedProject(item));
  }
  function updateProduction(change: (current: Production) => Production) {
    edit(current => ({ ...current, production: change(current.production ?? startProduction(current)) }));
  }
  function switchWorkspace(next: typeof workspace) {
    pause(); setFocus(false); setArrange(false);
    if (next !== 'direct' && !useStudio.getState().project.production) updateProduction(value => value);
    setWorkspace(next);
  }
  function openScript(sceneId?: string, lineId?: string, autoDraft = false) {
    setScriptTarget({ sceneId, lineId, autoDraft }); switchWorkspace('write');
  }
  function newMovie() {
    setSeedIdea('');
    const next = makeProject();
    if (!openProject({ ...next, production: startProduction(next) }, true)) return;
    setWorkspace('create');
  }
  function startManualMovie() {
    setSeedIdea('');
    const next = makeProject();
    if (!openProject({ ...next, production: startProduction(next) }, true)) return;
    setWorkspace('write');
  }
  function startAIMovie(prompt: string) {
    const next = makeProject();
    const production = startProduction(next);
    production.bible.profile.synopsis = prompt;
    production.bible.profile.logline = prompt.slice(0, 500);
    setSeedIdea(prompt);
    if (!openProject({ ...next, production }, true)) return;
    setWorkspace('create');
  }
  function deleteHomeProject(item: Project) {
    if (window.confirm(`Delete "${item.name}" permanently? This cannot be undone.`)) void deleteSavedProject(item);
  }
  function openRentExample() {
    if (!openProject(missingRentMovie(), true)) return;
    setWorkspace('create'); setScriptTarget({});
  }
  async function compile(next: Project, original: Project, target?: string, playAfter = false) {
    if (compileInFlight.current) return false;
    compileInFlight.current = true;
    pause(); setCompiling(true);
    try {
      const output = await compileMovie(next, renderSpeech(speechProvider(account)));
      if (useStudio.getState().project !== original) throw new Error('The project changed during compilation. Generate it again to use your latest edits.');
      useStudio.getState().edit(() => output);
      const chosen = output.scenes.find(item => item.id === target) ?? output.scenes[0];
      setWorkspace('direct'); setArrange(false); setMobilePanel('stage');
      if (!target) setDirectorOpen(false);
      const position = target && time.current.scene.id === chosen.id ? Math.min(time.current.local, chosen.duration - .01) : 0;
      useStudio.getState().setScene(chosen.id);
      updateCursor(chosen, position, false);
      const notes = output.production?.graph.flatMap(item => item.diagnostics) ?? [];
      tell(notes.length ? `Timeline ready with ${notes.length} production notes. Open Director to review.` : 'Timeline ready.');
      if (playAfter) window.requestAnimationFrame(() => void play());
      return true;
    } catch (error) { showError(error); return false; }
    finally { compileInFlight.current = false; setCompiling(false); }
  }
  async function commitDirection(next: ScriptSceneData, expected: ScriptSceneData, note?: string, request?: string) {
    const state = useStudio.getState();
    if (state.session !== session) { tell('The project changed. Review a fresh direction proposal.', true); return false; }
    const current = state.project;
    const production = current.production;
    if (!production || production.scriptStatus !== 'approved') {
      tell('Approve the current screenplay revision before making a timeline direction change.', true); return false;
    }
    const base = production.screenplay.scenes.find(item => item.id === next.id);
    if (JSON.stringify(base) !== JSON.stringify(expected)) { tell('This scene changed. Review a fresh direction proposal.', true); return false; }
    const revised = approveScript(reviseScript(production, production.screenplay.scenes.map(item => item.id === next.id ? next : item)));
    if (note && request) revised.conversation = [...revised.conversation, { role: 'user' as const, text: request }, { role: 'assistant' as const, text: note }].slice(-24);
    return compile({ ...current, production: revised }, current, next.id, true);
  }
  function toggleClipLock(id: string) {
    updateProduction(value => ({ ...value, graph: value.graph.map(record =>
      record.sceneId !== scene.id ? record : { ...record, locked: record.locked.includes(id) ? record.locked.filter(item => item !== id) : [...record.locked, id] }
    ) }));
  }
  async function exchange(file: File) {
    try {
      const value = await restoreMovie(file);
      if (useStudio.getState().session !== session) throw new Error('The project changed while the backup was loading. Import it again.');
      if (!openProject(value, true)) return;
      setWorkspace(value.production ? 'write' : 'direct'); setScriptTarget({}); close(); tell('Project restored as a new copy.');
    } catch (error) { showError(error); }
  }
  function reorderDirectScene(id: string, step: number) {
    edit(current => {
      const scenes = [...current.scenes];
      const index = scenes.findIndex(item => item.id === id);
      if (!scenes[index] || !scenes[index + step]) return current;
      [scenes[index], scenes[index + step]] = [scenes[index + step], scenes[index]];
      const production = current.production;
      if (!production) return { ...current, scenes };
      const existing = new Set(scenes.map(item => item.id));
      const compiled = scenes.flatMap(item => production.screenplay.scenes.filter(source => source.id === item.id));
      const linked = production.screenplay.scenes.map(source => existing.has(source.id) ? compiled.shift()! : source);
      const changed = linked.some((item, at) => item.id !== production.screenplay.scenes[at].id);
      return { ...current, scenes, production: changed ? reviseScript(production, linked) : production };
    });
  }
  function dropDirectScene(value: Scene) {
    const linked = project.production?.screenplay.scenes.some(item => item.id === value.id);
    ask(`Delete “${value.name}”?`, linked ? 'This removes the scene from the screenplay and timeline. Undo can restore it.' :
      'This removes the scene and its timeline. Undo can restore it.', () => edit(current => {
      const scenes = current.scenes.filter(item => item.id !== value.id);
      const production = current.production;
      if (!production) return { ...current, scenes };
      const script = production.screenplay.scenes.filter(item => item.id !== value.id);
      const updated = script.length !== production.screenplay.scenes.length ? reviseScript(production, script) : production;
      return { ...current, scenes, production: { ...updated, graph: updated.graph.filter(item => item.sceneId !== value.id) } };
    }));
  }
  function showDialog(value: Dialog) { pause(); setDialog(value); }
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (dialog) return;
      const target = event.target;
      const el = target instanceof HTMLElement ? target : null;
      // Never steal Backspace, clipboard, Space or shortcuts from text editors.
      if (el?.isContentEditable || el?.closest('input,textarea,select,[role="textbox"],.monaco-editor,.cm-editor,[contenteditable]')) return;
      const inClip = !!el?.closest('.clip,.timeline-keyframe');
      if (el?.closest('button,[role="button"],[role="separator"]') && !inClip) return;
      const state = useStudio.getState(), hasTimelineSelection = state.clipIds.length > 0 || !!state.selectedKeyframe;
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && key === 's') { event.preventDefault(); persist(undefined,true); return; }
      if (command && (key === 'z' || key === 'y')) {
        event.preventDefault();
        run(() => (key === 'y' || event.shiftKey) ? useStudio.getState().redo() : useStudio.getState().undo());
        return;
      }
      if (workspace !== 'direct') return;
      if (event.code === 'Space' && !command && !event.altKey) { event.preventDefault(); void play(); return; }
      if (command && key === 'a' && (inClip || hasTimelineSelection)) { event.preventDefault(); state.selectClips(currentScene(state).clips.map(clip=>clip.id)); return; }
      if (command && key === 'c' && hasTimelineSelection) { event.preventDefault(); copyTimelineSelection(); return; }
      if (command && key === 'x' && hasTimelineSelection) { event.preventDefault(); cutTimelineSelection(); return; }
      if (command && key === 'v') { event.preventDefault(); pasteTimelineSelection(); return; }
      if (command && key === 'd') { event.preventDefault(); duplicateSelection(); return; }
      if ((event.key === 'Delete' || event.key === 'Backspace') && (state.selection || hasTimelineSelection)) {
        event.preventDefault(); removeSelection(); return;
      }
      if (!command && !event.altKey && key === 's' && hasTimelineSelection) { event.preventDefault(); splitTimelineSelection(); return; }
      if (inClip && (key === '+' || key === '=' || key === '-' || key === '_')) {
        event.preventDefault(); window.dispatchEvent(new CustomEvent('toonroom-zoom', {detail:key==='+'||key==='='?'in':'out'})); return;
      }
      if (event.key === 'Escape') { state.select(null); setFocus(false); return; }
      if (arrange && selection && selection.kind !== 'clip' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0, dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
        const actor = scene.actors.find(item => item.id === selection.id), object = scene.objects.find(item => item.id === selection.id);
        if (actor) patchActor({ ...actor, x: clamp(actor.x + dx, -2000, 3000), y: clamp(actor.y + dy, -2000, 3000) });
        if (object) patchObject({ ...object, x: clamp(object.x + dx, -2000, 3000), y: clamp(object.y + dy, -2000, 3000) });
      }
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  });
  useEffect(() => { const timer = setTimeout(() => { if (compact === false) window.dispatchEvent(new CustomEvent('toonroom-time', { detail: time.current.local })); }, 0); return () => clearTimeout(timer); }, [compact, scene.id]);
  const headerStatus = saveStatus === 'Saving…' || saveStatus === 'Syncing…' ? saveStatus : saveStatus === 'Save failed' || saveStatus === 'Cloud sync failed' ? saveStatus : account && saveStatus === 'Saved to cloud' ? 'Saved to cloud' : 'Saved locally';
  let content: ReactNode;
  if (dialog === 'character') content = <CharacterFactory source={factory} save={saveCharacter} close={close} remove={deleteCharacter}/>;
  if (dialog === 'clip') content = <AddClipDialog scene={scene} actors={actorNames} time={time.current.local} request={requestedClip} close={close} add={clip => run(() => addClip(clip))} audio={showAudio}/>;
  if (dialog === 'code') content = <TimelineCodeDialog key={session + scene.id} project={project} scene={scene} close={close} apply={replaceScene} applyMovie={replaceMovie}/>;
  if (dialog === 'audio') content = <AudioDialog key={session + scene.id} scene={scene} actors={actorNames} request={requestedAudio} account={account} add={addClip} close={close}/>;
  if (dialog === 'export') content = <ExportDialog project={project} initialFormat={format} initialSubtitles={subtitles} close={close}/>;
  if (dialog === 'projects') content = <ProjectsDialog items={items} current={project.id} close={close} create={newMovie} open={value => { if (openProject(value)) { setWorkspace(value.production && !value.production.graph.length ? 'write' : 'direct'); setScriptTarget({}); } }} duplicate={value => openProject(duplicateProject(value), true)} remove={deleteProject} demo={openRentExample} backup={() => { void backupMovie(project).then(() => tell('Project backup downloaded.'), showError); }} restore={() => importFile.current?.click()}/>;
  if (dialog === 'scenes') content = <ScenesDialog scenes={project.scenes} active={scene.id} close={close} open={switchScene} savePreset={saveWorld}
    add={() => { if (project.scenes.length >= 30) { tell('A project can contain up to 30 scenes.', true); return; } const value = makeScene(); edit(current => ({ ...current, scenes: [...current.scenes, { ...value, name: `Scene ${String(current.scenes.length + 1).padStart(2, '0')} · ${value.name}` }] })); if (useStudio.getState().project.scenes.some(item => item.id === value.id)) switchScene(value); }}
    copy={value => edit(current => ({ ...current, scenes: current.scenes.flatMap(item => item.id === value.id ? [item, duplicateScene(item)] : [item]) }))}
    reorder={reorderDirectScene} drop={dropDirectScene}/>;
  if (dialog === 'ai') content = <Modal title="AI settings" description="Connect an OpenRouter key for brainstorming, screenwriting and directing. Your key stays in this tab and requests go directly to OpenRouter." close={close}>
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const key = String(data.get('key') ?? '').trim() || personalModel?.key;
      if (!key) { tell('Enter an OpenRouter API key.', true); return; }
      setPersonalModel({ key, model: String(data.get('model') ?? '').trim() || 'openrouter/free' });
      close();
    }}>
      <div className="dialog-fields">
        <label className="field">OpenRouter API key<input name="key" type="password" autoComplete="off" spellCheck={false} maxLength={250} placeholder={personalModel ? 'Session key connected' : 'sk-or-…'}/></label>
        <label className="field">Model<input name="model" defaultValue={personalModel?.model ?? 'openrouter/free'} maxLength={150}/></label>
      </div>
      <footer className="modal-footer">{personalModel && <button type="button" className="quiet" onClick={() => { setPersonalModel(null); close(); }}>Disconnect</button>}
        <span className="spacer"/><button className="primary" type="submit">Use for this session</button></footer>
    </form>
  </Modal>;
  if (dialog === 'account') content = <AccountDialog available={cloudEnabled} account={account} login={login} logout={async () => {
    if (useStudio.getState().dirty && !persist()) throw new Error('Save your current project before signing out.');
    await logout();
  }} close={close}/>;
  if (dialog === 'help') content = <HelpDialog close={close} demo={() => openProject(exampleDirector.example(), true)}/>;
  if (dialog === 'director') content = <DirectorDialog close={close} example={() => openProject(exampleDirector.example(), true)} generate={account && import.meta.env.VITE_HOSTED_DIRECTOR === 'true' ? async story => {
    const next = await hostedDirector(account, speechProvider(account)).generate!(story);
    if (useStudio.getState().session !== session) throw new Error('The project changed while directing this story.');
    if (!openProject(next, true)) throw new Error('Save the active project before opening the generated story.');
  } : undefined}/>;
  if (dialog === 'dependencies' && dependentObjectId) content = <ObjectDependenciesDialog scene={scene} objectId={dependentObjectId} actorNames={actorNames} close={close} confirm={confirmObjectDeletion}/>;
  if (dialog === 'confirm' && confirm) content = <Modal title={confirm.title} description={confirm.text} close={close}><footer className="modal-footer"><span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="danger" onClick={() => { close(); confirm.run(); }}>Confirm</button></footer></Modal>;

  if (home !== 'studio') return <div data-theme={theme} className="studio-shell filmmaking-shell home-wrapper">
    <Welcome screen={home} items={items} openProjects={() => { localStorage.setItem('toonroom.started', '1'); setHome('projects'); }}
      openProject={value => { if (openProject(value)) { setSeedIdea(''); setWorkspace(value.production && !value.production.graph.length ? 'write' : 'direct'); } }}
      createManual={startManualMovie} createAI={startAIMovie}
      duplicate={value => { setSeedIdea(''); openProject(duplicateProject(value), true); }}
      remove={value => { void deleteHomeProject(value); }}
      openExample={openRentExample}/>
  </div>;
  return <div data-theme={theme} className={`studio-shell filmmaking-shell mode-${workspace} ${focus ? 'focus-mode' : ''}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Clapperboard size={21} strokeWidth={2.4}/></span><strong>{studioName}<span>.</span></strong><span className="brand-edition">STUDIO</span></div>
      <div className="project-controls"><button className="quiet project-button" onClick={() => { pause(); if (useStudio.getState().dirty && !persist()) return; close(); setHome('projects'); }}><FolderOpen size={17}/><span>Projects</span></button><span className="divider"/><label className="project-name"><input aria-label="Project name" key={project.name} defaultValue={project.name} maxLength={100} onBlur={e => { rename(e.target.value); e.target.value = e.target.value.trim() || project.name; }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/><ChevronDown size={11}/></label><span className="save-state" role="status">{account ? <Cloud size={14}/> : <Check size={14}/>} {headerStatus}</span></div>
      <div className="top-actions"><div className="history"><IconButton title="Undo" onClick={() => run(() => useStudio.getState().undo())} disabled={!hasUndo}><Undo2 size={17}/></IconButton><IconButton title="Redo" onClick={() => run(() => useStudio.getState().redo())} disabled={!hasRedo}><Redo2 size={17}/></IconButton></div><span className="divider"/><IconButton title="Save project" onClick={() => persist(undefined, true)}><Save size={17}/></IconButton><IconButton title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => {
        const value = theme === 'dark' ? 'light' : 'dark'; setTheme(value); localStorage.setItem('toonroom.theme', value);
      }}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</IconButton><IconButton title="Quick start" onClick={() => showDialog('help')}><CircleHelp size={18}/></IconButton><button className="primary export-button" onClick={() => showDialog('export')}><Download size={17}/> <span>Export video</span></button><IconButton title={account ? 'Your account' : 'Sign in'} onClick={() => showDialog('account')} className="account-button">{account?.email?.slice(0, 1).toUpperCase() ?? <UserRound size={17}/>}</IconButton></div>
    </header>
    <nav className="filmmaking-nav" aria-label="Filmmaking workspaces">
      <button className={workspace === 'create' ? 'active' : ''} aria-current={workspace === 'create' ? 'page' : undefined} onClick={() => switchWorkspace('create')}>Create</button>
      <button className={workspace === 'write' ? 'active' : ''} aria-current={workspace === 'write' ? 'page' : undefined} onClick={() => openScript(scene.id)}>Write</button>
      <button className={workspace === 'direct' ? 'active' : ''} aria-current={workspace === 'direct' ? 'page' : undefined} onClick={() => switchWorkspace('direct')}>Direct</button>
      <span className="spacer"/>
      <button onClick={() => showDialog('ai')}><Sparkles size={15}/>AI settings</button>
      {workspace === 'direct' && <button className={directorOpen ? 'active' : ''} aria-pressed={directorOpen} onClick={() => { setMobilePanel('inspector'); setDirectorOpen(value => !value); }}><Sparkles size={15}/>Director</button>}
    </nav>
    <Suspense fallback={<main className="film-empty" role="status">Opening workspace…</main>}>
    {workspace === 'create' && project.production && <StoryStudio key={project.id} project={project} production={project.production} update={updateProduction}
      ai={ai} write={draft => openScript(undefined, undefined, draft)} initialIdea={seedIdea} loadExample={openRentExample}/>}
    {workspace === 'write' && project.production && <ScreenplayStudio key={project.id + (scriptTarget.sceneId ?? '') + (scriptTarget.lineId ?? '')}
      project={project} production={project.production} update={updateProduction} ai={ai} busy={compiling}
      initialScene={scriptTarget.sceneId} initialLine={scriptTarget.lineId} autoDraft={scriptTarget.autoDraft}
      approve={() => updateProduction(approveScript)} generate={() => { const current = useStudio.getState().project; void compile(current, current); }}/> }
    </Suspense>
    {workspace === 'direct' && <><nav className="mobile-nav" aria-label="Workspace panels"><button className={mobilePanel === 'library' ? 'active' : ''} onClick={() => setMobilePanel('library')}>Assets</button><button className={mobilePanel === 'stage' ? 'active' : ''} onClick={() => setMobilePanel('stage')}>Stage</button><button className={mobilePanel === 'inspector' ? 'active' : ''} onClick={() => setMobilePanel('inspector')}>Inspector</button></nav>
    <main className={`workspace mobile-${mobilePanel}`} style={{ '--asset-width': `${assetWidth}px`, '--inspector-width': `${inspectorWidth}px` } as CSSProperties}>
      <div className="library-shell"><AssetLibrary active={library} change={useStudio.getState().setLibrary} characters={project.characters} scene={scene} newCharacter={() => editCharacter()} editCharacter={editCharacter} addActor={addActor} setWorld={setWorld} uploadWorld={uploadWorld} addProp={addObject} uploadProp={uploadProp} addAction={action => showClip(action === 'walk' || action === 'run' ? 'movement' : 'body', action)} addSound={addSound} dialogue={() => showAudio('dialogue')} audio={() => showAudio('audio')} music={() => showAudio('music')}/>{library === 'Worlds' && !!worlds.length && <div className="saved-worlds"><h3>Saved worlds</h3>{worlds.map(item => <button className="quiet full" key={item.name} onClick={() => setWorld(item.environment, item.objects, item.backgroundImage)}>{item.name}</button>)}</div>}</div>
      <section className="stage-panel" aria-label="Studio stage">
        <header className="stage-heading"><div><span className="stage-kicker"><i/> SCENE PREVIEW</span><button className="scene-title" onClick={() => showDialog('scenes')}>{scene.name}<ChevronDown size={14}/></button></div><div className="stage-options"><button className={`quiet arrange-button ${arrange ? 'is-active' : ''}`} onClick={() => { pause(); setArrange(value => !value); }}><MousePointer2 size={15}/><span>Arrange</span></button><Select aria="Preview aspect ratio" value={format} onChange={setFormat} options={formats}/><IconButton title={focus ? 'Exit focus mode' : 'Focus stage'} onClick={() => setFocus(value => !value)}>{focus ? <X size={18}/> : <Maximize size={16}/>}</IconButton></div></header>
        <div className="viewer"><Stage key={session} project={project} scene={scene} time={time} playing={playing} edit={arrange} format={format} selection={selection} selected={select} subtitles={subtitles} snap={snap} mixer={mixer} quality={quality} onFrame={setShot} move={(id, coords) => {
          const actor = scene.actors.find(item => item.id === id), object = scene.objects.find(item => item.id === id);
          if (actor) {
            const dx = coords.x - actor.x, dy = coords.y - actor.y;
            editScene(current => ({ ...current, actors: current.actors.map(item => item.id === id ? { ...item, ...coords } : item), clips: current.clips.map(clip => clip.track === 'movement' && clip.actor === id ? { ...clip, fromX: clamp(clip.fromX + dx, -2000, 3000), toX: clamp(clip.toX + dx, -2000, 3000), fromY: clamp(clip.fromY + dy, -2000, 3000), toY: clamp(clip.toY + dy, -2000, 3000) } : clip) }));
          } else if (object) patchObject({ ...object, ...coords });
        }}/></div>
        <div className="transport"><div className="transport-buttons"><button className="play-button" title={playing || preparing ? 'Pause scene' : 'Play scene'} aria-label={playing || preparing ? 'Pause scene' : 'Play scene'} onClick={() => void play()}>{playing || preparing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><IconButton title="Stop scene" onClick={() => seek(0)}><Square size={14}/></IconButton><IconButton title="Loop scene" active={loop} onClick={() => { if (livePlaying.current || livePreparing.current) pause(); setLoop(value => !value); }}><Repeat2 size={17}/></IconButton></div><span className="timecode"><span ref={counter}>00:00.00</span><i>/</i><span>{clock(scene.duration)}</span></span><input className="preview-range" aria-label="Seek scene" ref={range} type="range" min={0} max={scene.duration} step={.01} defaultValue={0} onChange={e => seek(Number(e.target.value))}/><div className="transport-end"><span className="shot-pill">{arrange ? 'Arrange mode' : shotLabel(shot)}</span><IconButton title={muted ? 'Unmute preview' : 'Mute preview'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</IconButton><IconButton title="Toggle subtitles" active={subtitles} onClick={() => setSubtitles(value => !value)}><Captions size={18}/></IconButton></div></div>
      </section>
      {directorOpen ? <DirectorPanel key={session + scene.id} project={project} scene={scene} selection={selection} getTime={() => time.current.local}
        ai={ai} busy={compiling} openCode={() => showDialog('code')} apply={(next, original) => {
          replaceScene(next, original);
          tell('AI direction applied to the timeline. You can undo this change.');
        }}/> : <Inspector scene={scene} actors={actorNames} characters={project.characters} selection={selection} select={select} patchActor={patchActor} patchObject={patchObject} patchClip={patchClip} patchScene={patch => editScene(value => ({ ...value, ...patch }))} editCharacter={editCharacter} addDialogue={() => showAudio('dialogue')} addAction={() => showClip('body')} scenes={project.scenes.length} sceneIndex={sceneIndex} openScenes={() => showDialog('scenes')} remove={removeSelection} duplicate={duplicateSelection} snap={snap} setSnap={setSnap} subtitles={subtitles} setSubtitles={setSubtitles} quality={quality} setQuality={setQuality} regenerateVoice={regenerateVoice}/>}
      <PanelResize side="left" value={assetWidth} change={setAssetWidth}/>
      <PanelResize side="right" value={inspectorWidth} change={setInspectorWidth}/>
    </main>
    <Timeline key={session} scene={scene} names={actorNames} selection={selection} selectedClipIds={selectedClipIds} selectedKeyframe={selectedKeyframe}
      select={select} selectClips={useStudio.getState().selectClips} selectKeyframe={useStudio.getState().selectKeyframe}
      seek={seek} change={patchClip} add={showClip} remove={()=>run(deleteTimelineSelection)} duplicate={duplicateTimelineSelection}
      copy={copyTimelineSelection} cut={()=>run(cutTimelineSelection)} paste={pasteTimelineSelection} split={splitTimelineSelection}
      selectAll={()=>useStudio.getState().selectClips(scene.clips.map(c=>c.id))}
      apply={editTimeline} compact={compact} onCode={() => showDialog('code')} onContext={() => { void navigator.clipboard.writeText(sceneBuildingContext(project, scene)).then(() => tell('AI scene-building context copied.'), showError); }} onCopyScene={() => { void navigator.clipboard.writeText(sceneToCode(scene)).then(() => tell('Current scene JSON copied.'), showError); }} onCopyProject={() => { void navigator.clipboard.writeText(movieToCode(project)).then(() => tell('Entire movie timeline JSON copied.'), showError); }} onResizeScene={duration => { editScene(current => resizeSceneTimeline(current,duration)); const updated=currentScene(useStudio.getState()); if(time.current.local>updated.duration)seek(updated.duration); }} playhead={time.current.local} onCompact={() => setCompact(value => !value)}/></>}
    <input type="file" ref={importFile} accept=".json,application/json" hidden aria-label="Import Toonroom backup" onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void exchange(file);
    }}/>
    {notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{!notice.error && <Check size={16}/>}<span>{notice.message}</span><IconButton title="Dismiss notice" onClick={() => setNotice(null)}><X size={14}/></IconButton></div>}
    {content}
  </div>;
}
