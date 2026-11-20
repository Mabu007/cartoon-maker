import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Captions, Check, ChevronDown, CircleHelp, Clapperboard, Cloud, Download, Expand, FolderOpen, Maximize, MousePointer2, Pause, Play, Redo2, Repeat2, Save, Sparkles, Square, Undo2, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { clamp } from './engine/animation.ts';
import { evaluate, locate, projectDuration } from './engine/evaluate.ts';
import { makeProject, makeProp, makeScene, soundNames } from './engine/presets.ts';
import { compatibleObjects, nearestObject, objectDependencies, removeObjectWithDecisions, replaceWorldObjects, type ObjectDependencyDecision } from './engine/interactions.ts';
import { label, shotLabel, SceneDefinition, uid, type Action, type ActorData, type Character, type Clip, type Project, type Prop, type Scene, type Track } from './engine/schema.ts';
import type { Format } from './engine/renderer.ts';
import { cloudAudio, cloudEnabled, cloudProjects, deleteCloud, listenAccount, login, logout, uploadProject, type Account } from './services/cloud.ts';
import { createAudioMixer, setRemoteAudio, type Mixer } from './services/audio.ts';
import { duplicateProject, duplicateScene, listLocal, removeLocal, saveLocal, writeLocal, type SavedProject } from './services/projects.ts';
import { exampleDirector, hostedDirector } from './services/director.ts';
import { speechProvider } from './services/speech.ts';
import { changeClipTiming, copyClip, currentScene, initial, removeEntity, useStudio, type Selection } from './studio.ts';
import { AssetLibrary } from './ui/AssetLibrary.tsx';
import { CharacterFactory } from './ui/CharacterFactory.tsx';
import { AccountDialog, AddClipDialog, AudioDialog, DirectorDialog, ExportDialog, HelpDialog, ProjectsDialog, ScenesDialog, type AudioRequest, type ClipRequest } from './ui/Dialogs.tsx';
import { ObjectDependenciesDialog } from './ui/ObjectDependenciesDialog.tsx';
import { Inspector } from './ui/Inspector.tsx';
import { Stage, type PreviewTime } from './ui/Stage.tsx';
import { clock, formats, IconButton, Modal, Select } from './ui/shared.tsx';
import { Timeline } from './ui/Timeline.tsx';

const studioName = import.meta.env.VITE_STUDIO_NAME?.trim() || 'Toonroom';
type Dialog = 'projects' | 'scenes' | 'character' | 'clip' | 'audio' | 'export' | 'account' | 'help' | 'director' | 'confirm' | 'dependencies' | null;
type WorldPreset = { name: string; environment: Scene['environment']; objects: Prop[] };
const worldKey = (scope: string) => `toonroom.worlds.v1.${scope}`;
function worldPresets(scope: string): WorldPreset[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(worldKey(scope)) ?? '[]');
    if (!Array.isArray(items)) return [];
    return items.flatMap(item => {
      const parsed = SceneDefinition.safeParse({ id: 'world', name: item?.name, environment: item?.environment, objects: item?.objects, actors: [], clips: [], duration: 30 });
      return parsed.success ? [{ name: parsed.data.name, environment: parsed.data.environment, objects: parsed.data.objects }] : [];
    });
  } catch { return []; }
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong.';

export default function App() {
  const project = useStudio(state => state.project), scene = useStudio(currentScene), selection = useStudio(state => state.selection), library = useStudio(state => state.library);
  const hasUndo = useStudio(state => state.past.length > 0), hasRedo = useStudio(state => state.future.length > 0);
  const dirty = useStudio(state => state.dirty);
  const sceneIndex = project.scenes.findIndex(item => item.id === scene.id);
  const [dialog, setDialog] = useState<Dialog>(null), [account, setAccount] = useState<Account | null>(null), [items, setItems] = useState<SavedProject[]>([]);
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
  const livePlaying = useRef(false), livePreparing = useRef(false), settings = useRef({ loop, muted }), originalScope = useRef(scope), lastSave = useRef<{ id: string; updated: number } | undefined>(undefined);
  const cloudQueue = useRef<Promise<unknown>>(Promise.resolve());
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
    pause(); setArrange(false);
    useStudio.getState().open(next, edited);
    updateCursor(next.scenes[0], 0, false);
  }
  useEffect(() => {
    let alive = true;
    try {
      const local = listLocal(scope);
      setItems(local); setWorlds(worldPresets(scope));
      if (originalScope.current !== scope || local.length) loadProject(local[0]?.project ?? initial);
      originalScope.current = scope;
    } catch (error) { tell(errorMessage(error), true); }
    setRemoteAudio(account ? id => cloudAudio(account, id) : undefined);
    if (account) void cloudProjects(account).then(result => {
      if (!alive) return;
      const local = listLocal(scope), byId = new Map(local.map(entry => [entry.project.id, entry]));
      for (const entry of result.documents) if ((byId.get(entry.project.id)?.updated ?? 0) < entry.updated) byId.set(entry.project.id, entry);
      const merged = [...byId.values()].sort((a, b) => b.updated - a.updated);
      writeLocal(scope, merged); setItems(merged);
      if (merged.length && !useStudio.getState().dirty && useStudio.getState().project.id === initial.id && merged[0].project.id !== initial.id) loadProject(merged[0].project);
      if (result.skipped) tell(`${result.skipped} invalid cloud project(s) were skipped.`, true);
    }).catch(error => { if (alive) tell(`Cloud projects unavailable. ${errorMessage(error)}`, true); });
    return () => { alive = false; };
  }, [scope, account]);

  function persist(document = useStudio.getState().project, manual = false) {
    try {
      const updated = saveLocal(scope, document, Math.max(Date.now(), (lastSave.current?.updated ?? 0) + 1));
      lastSave.current = { id: document.id, updated };
      setItems(listLocal(scope)); setSaveStatus(account ? 'Syncing…' : 'Saved on device');
      if (manual) tell('Project saved on this device.');
      if (!account) return;
      const token = ++saveToken.current;
      cloudQueue.current = cloudQueue.current.catch(() => {}).then(() => uploadProject(account, document, updated)).then(() => { if (saveToken.current === token) setSaveStatus('Saved to cloud'); }).catch(error => {
        if (saveToken.current === token) { setSaveStatus('Cloud sync failed'); tell(`Saved on this device. ${errorMessage(error)}`, true); }
      });
    } catch (error) { setSaveStatus('Save failed'); showError(error); }
  }
  useEffect(() => {
    if (!dirty) return;
    setSaveStatus('Saving…');
    const timer = window.setTimeout(() => persist(project), 520);
    const flush = () => {
      try { saveLocal(scope, project); } catch { /* the editor shows the last save attempt */ }
    };
    window.addEventListener('pagehide', flush);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', flush); };
  }, [project, dirty, scope]);
  useEffect(() => {
    const local = time.current.scene.id === scene.id ? clamp(time.current.local, 0, scene.duration) : 0;
    updateCursor(scene, local, false);
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
      let origin = startTime - at, lastFrame = -1;
      const duration = projectDuration(sequence);
      const tick = () => {
        if (token !== animationToken.current) return;
        let elapsed = Math.max(0, audio.context.currentTime - origin);
        if (elapsed >= duration) {
          if (settings.current.loop && sequence.length === 1) { origin = audio.context.currentTime; elapsed = 0; audio.schedule(sequence, 0, origin); }
          else { const last = sequence.at(-1)!; updateCursor(last, last.duration, true); pause(); return; }
        }
        const next = locate(sequence, elapsed);
        if (time.current.scene.id !== next.scene.id) {
          time.current = { scene: next.scene, local: next.local };
          useStudio.getState().setScene(next.scene.id);
        }
        const position = Math.floor(elapsed * 30);
        if (position !== lastFrame) { updateCursor(next.scene, next.local, false); lastFrame = position; }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (error) { if (token === animationToken.current) { pause(); showError(error); } }
  }
  function seek(value: number) { pause(); setArrange(false); const current = currentScene(useStudio.getState()); updateCursor(current, clamp(value, 0, current.duration), true); }
  function switchScene(value: Scene) { pause(); updateCursor(value, 0, false); useStudio.getState().setScene(value.id); close(); }
  function openProject(value: Project, isNew = false) {
    if (useStudio.getState().dirty) persist();
    loadProject(value, isNew); close();
    setSaveStatus(isNew ? 'Saving…' : 'Saved on device');
  }
  const run = (command: () => void) => { try { if (livePlaying.current || livePreparing.current) pause(); command(); } catch (error) { showError(error); } };
  const edit = (command: (document: Project) => Project) => run(() => useStudio.getState().edit(command));
  const editScene = (command: (value: Scene) => Scene) => run(() => useStudio.getState().editScene(command));
  const select = (value: Selection) => useStudio.getState().select(value);
  function patchActor(value: ActorData) { editScene(current => ({ ...current, actors: current.actors.map(actor => actor.id === value.id ? value : actor) })); }
  function patchObject(value: Prop) { editScene(current => ({ ...current, objects: current.objects.map(object => object.id === value.id ? value : object) })); }
  function patchClip(value: Clip) {
    if (value.track === 'body') {
      const current = currentScene(useStudio.getState());
      if (value.action === 'sit') {
        const compatible = compatibleObjects(current, 'sit');
        const target = compatible.find(item => item.id === value.target) ?? nearestObject(current, value.actor, 'sit');
        if (!target) { tell('Add a chair or sofa before using Sit. Characters cannot sit on air.', true); return; }
        value = { ...value, layer: 'body', target: target.id };
      } else if (value.target && !compatibleObjects(current, value.action).some(item => item.id === value.target)) {
        const { target: _, ...rest } = value;
        value = rest;
      }
    }
    editScene(current => ({ ...current, clips: current.clips.map(clip => clip.id === value.id ? value : clip) }));
  }
  function addClip(value: Clip) {
    try {
      pause();
      const current = currentScene(useStudio.getState());
      if (current.clips.length >= 600) { tell('This scene already has the maximum 600 clips.', true); return; }
      useStudio.getState().editScene(scene => ({ ...scene, clips: [...scene.clips, changeClipTiming(value, value.start, value.length, scene.duration)] }));
      setArrange(false); select({ kind: 'clip', id: value.id }); close();
    } catch (error) { showError(error); }
  }
  function showClip(track?: Track, action?: Action) {
    pause();
    if (track === 'dialogue') { showAudio('dialogue'); return; }
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
  function applyWorld(environment: Scene['environment'], furnished?: Prop[]) {
    const preset = furnished ?? makeScene(environment).objects;
    editScene(current => replaceWorldObjects({ ...current, environment }, preset.map(object => ({ ...object, id: uid() }))));
    select(null); setMobilePanel('stage');
  }
  function setWorld(environment: Scene['environment'], furnished?: Prop[]) {
    if (scene.environment === environment && !furnished) return;
    if (scene.objects.length) {
      const used = scene.clips.filter(clip => clip.track === 'body' && clip.target && scene.objects.some(object => object.id === clip.target)).length;
      ask('Change the furnished world?', 'This replaces the current props.' + (used ? ' ' + used + ' dependent timeline action(s) will safely change to standing/empty-handed actions.' : '') + ' Use Undo to restore the original world.', () => applyWorld(environment, furnished));
    }
    else applyWorld(environment, furnished);
  }
  function saveWorld(value: Scene) {
    try {
      const next = [...worlds.filter(item => item.name !== value.name), { name: value.name, environment: value.environment, objects: value.objects }].slice(-24);
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
  function duplicateSelection() {
    const selected = useStudio.getState().selection;
    const current = currentScene(useStudio.getState());
    if (!selected) return;
    const clip = current.clips.find(item => item.id === selected.id);
    const actor = current.actors.find(item => item.id === selected.id);
    const object = current.objects.find(item => item.id === selected.id);
    if (clip) addClip(copyClip(clip, current.duration));
    else if (actor) {
      const id = uid(); editScene(item => ({ ...item, actors: [...item.actors, { ...actor, id, x: clamp(actor.x + 40, -2000, 3000) }] })); select({ kind: 'actor', id });
    } else if (object) {
      const id = uid(); editScene(item => ({ ...item, objects: [...item.objects, { ...object, id, x: clamp(object.x + 36, -2000, 3000) }] })); select({ kind: 'object', id });
    }
  }
  function removeSelection() {
    const state = useStudio.getState(), item = state.selection;
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
      useStudio.getState().editScene(scene => removeObjectWithDecisions(scene, targetId, decisions));
      select(null);
      setDependentObjectId(null);
      close();
      tell('Object removed. Dependent actions were updated.');
    } catch (error) { showError(error); }
  }
  function rename(value: string) { const name = value.trim(); if (name && name !== project.name) edit(current => ({ ...current, name })); }
  function addSound(name: typeof soundNames[number]) { const start = clamp(time.current.local, 0, scene.duration - .1); addClip({ id: uid(), track: 'audio', name: label(name), asset: `builtin:${name}`, length: Math.min(.8, scene.duration - start), start, muted: false, volume: .8, offset: 0 }); }
  function deleteProject(item: Project) {
    ask(`Delete “${item.name}”?`, 'This permanently removes the saved project.', () => {
      void (async () => {
        try {
          if (account) { await cloudQueue.current; await deleteCloud(account, item.id); }
          removeLocal(scope, item.id);
          const entries = listLocal(scope); setItems(entries);
          if (useStudio.getState().project.id === item.id) loadProject(entries[0]?.project ?? makeProject());
          tell('Project deleted.');
        } catch (error) { showError(error); }
      })();
    });
  }
  function showDialog(value: Dialog) { pause(); setDialog(value); }
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (dialog || (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,button,[role=button],[contenteditable=true]'))) return;
      if (event.code === 'Space') { event.preventDefault(); void play(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); persist(undefined, true); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); run(() => event.shiftKey ? useStudio.getState().redo() : useStudio.getState().undo()); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); }
      if (event.key === 'Delete' || event.key === 'Backspace') { if (selection) { event.preventDefault(); removeSelection(); } }
      if (event.key === 'Escape') { select(null); setFocus(false); }
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
  if (dialog === 'clip') content = <AddClipDialog scene={scene} actors={actorNames} time={time.current.local} request={requestedClip} close={close} add={addClip} audio={showAudio}/>;
  if (dialog === 'audio') content = <AudioDialog scene={scene} actors={actorNames} request={requestedAudio} account={account} add={addClip} close={close}/>;
  if (dialog === 'export') content = <ExportDialog project={project} initialFormat={format} initialSubtitles={subtitles} close={close}/>;
  if (dialog === 'projects') content = <ProjectsDialog items={items} current={project.id} close={close} create={() => openProject(makeProject(), true)} open={openProject} duplicate={value => openProject(duplicateProject(value), true)} remove={deleteProject} demo={() => openProject(exampleDirector.example(), true)}/>;
  if (dialog === 'scenes') content = <ScenesDialog scenes={project.scenes} active={scene.id} close={close} open={switchScene} savePreset={saveWorld}
    add={() => { if (project.scenes.length >= 30) { tell('A project can contain up to 30 scenes.', true); return; } const value = makeScene(); edit(current => ({ ...current, scenes: [...current.scenes, { ...value, name: `Scene ${String(current.scenes.length + 1).padStart(2, '0')} · ${value.name}` }] })); switchScene(value); }}
    copy={value => edit(current => ({ ...current, scenes: current.scenes.flatMap(item => item.id === value.id ? [item, duplicateScene(item)] : [item]) }))}
    reorder={(id, direction) => edit(current => { const scenes = [...current.scenes], index = scenes.findIndex(item => item.id === id); [scenes[index], scenes[index + direction]] = [scenes[index + direction], scenes[index]]; return { ...current, scenes }; })}
    drop={value => ask(`Delete “${value.name}”?`, 'This removes the scene and its timeline. Undo can restore it.', () => edit(current => ({ ...current, scenes: current.scenes.filter(item => item.id !== value.id) })))}/>;
  if (dialog === 'account') content = <AccountDialog available={cloudEnabled} account={account} login={login} logout={logout} close={close}/>;
  if (dialog === 'help') content = <HelpDialog close={close} demo={() => openProject(exampleDirector.example(), true)}/>;
  if (dialog === 'director') content = <DirectorDialog close={close} example={() => openProject(exampleDirector.example(), true)} generate={account && import.meta.env.VITE_HOSTED_DIRECTOR === 'true' ? async story => openProject(await hostedDirector(account, speechProvider(account)).generate!(story), true) : undefined}/>;
  if (dialog === 'dependencies' && dependentObjectId) content = <ObjectDependenciesDialog scene={scene} objectId={dependentObjectId} actorNames={actorNames} close={close} confirm={confirmObjectDeletion}/>;
  if (dialog === 'confirm' && confirm) content = <Modal title={confirm.title} description={confirm.text} close={close}><footer className="modal-footer"><span className="spacer"/><button className="quiet" onClick={close}>Cancel</button><button className="danger" onClick={() => { close(); confirm.run(); }}>Confirm</button></footer></Modal>;

  return <div className={`studio-shell ${focus ? 'focus-mode' : ''}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Clapperboard size={21} strokeWidth={2.4}/></span><strong>{studioName}<span>.</span></strong><span className="brand-edition">STUDIO</span></div>
      <div className="project-controls"><button className="quiet project-button" onClick={() => showDialog('projects')}><FolderOpen size={17}/><span>Projects</span></button><span className="divider"/><label className="project-name"><input aria-label="Project name" key={project.name} defaultValue={project.name} maxLength={100} onBlur={e => { rename(e.target.value); e.target.value = e.target.value.trim() || project.name; }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/><ChevronDown size={11}/></label><span className="save-state" role="status">{account ? <Cloud size={14}/> : <Check size={14}/>} {headerStatus}</span></div>
      <div className="top-actions"><div className="history"><IconButton title="Undo" onClick={() => run(() => useStudio.getState().undo())} disabled={!hasUndo}><Undo2 size={17}/></IconButton><IconButton title="Redo" onClick={() => run(() => useStudio.getState().redo())} disabled={!hasRedo}><Redo2 size={17}/></IconButton></div><span className="divider"/><IconButton title="Save project" onClick={() => persist(undefined, true)}><Save size={17}/></IconButton><IconButton title="Story director" onClick={() => showDialog('director')}><Sparkles size={17}/></IconButton><IconButton title="Quick start" onClick={() => showDialog('help')}><CircleHelp size={18}/></IconButton><button className="primary export-button" onClick={() => showDialog('export')}><Download size={17}/> <span>Export video</span></button><IconButton title={account ? 'Your account' : 'Sign in'} onClick={() => showDialog('account')} className="account-button">{account?.email?.slice(0, 1).toUpperCase() ?? <UserRound size={17}/>}</IconButton></div>
    </header>
    <nav className="mobile-nav" aria-label="Workspace panels"><button className={mobilePanel === 'library' ? 'active' : ''} onClick={() => setMobilePanel('library')}>Assets</button><button className={mobilePanel === 'stage' ? 'active' : ''} onClick={() => setMobilePanel('stage')}>Stage</button><button className={mobilePanel === 'inspector' ? 'active' : ''} onClick={() => setMobilePanel('inspector')}>Inspector</button></nav>
    <main className={`workspace mobile-${mobilePanel}`}>
      <div className="library-shell"><AssetLibrary active={library} change={useStudio.getState().setLibrary} characters={project.characters} scene={scene} newCharacter={() => editCharacter()} editCharacter={editCharacter} addActor={addActor} setWorld={setWorld} addProp={addObject} addAction={action => showClip('body', action)} addSound={addSound} dialogue={() => showAudio('dialogue')} audio={() => showAudio('audio')}/>{library === 'Worlds' && !!worlds.length && <div className="saved-worlds"><h3>Saved worlds</h3>{worlds.map(item => <button className="quiet full" key={item.name} onClick={() => setWorld(item.environment, item.objects)}>{item.name}</button>)}</div>}</div>
      <section className="stage-panel" aria-label="Studio stage">
        <header className="stage-heading"><div><span className="stage-kicker"><i/> SCENE PREVIEW</span><button className="scene-title" onClick={() => showDialog('scenes')}>{scene.name}<ChevronDown size={14}/></button></div><div className="stage-options"><button className={`quiet arrange-button ${arrange ? 'is-active' : ''}`} onClick={() => { pause(); setArrange(value => !value); }}><MousePointer2 size={15}/><span>Arrange</span></button><Select aria="Preview aspect ratio" value={format} onChange={setFormat} options={formats}/><IconButton title={focus ? 'Exit focus mode' : 'Focus stage'} onClick={() => setFocus(value => !value)}>{focus ? <X size={18}/> : <Maximize size={16}/>}</IconButton></div></header>
        <div className="viewer"><Stage project={project} scene={scene} time={time} playing={playing} edit={arrange} format={format} selection={selection} selected={select} subtitles={subtitles} snap={snap} mixer={mixer} quality={quality} onFrame={setShot} move={(id, coords) => {
          const actor = scene.actors.find(item => item.id === id), object = scene.objects.find(item => item.id === id);
          if (actor) {
            const dx = coords.x - actor.x, dy = coords.y - actor.y;
            editScene(current => ({ ...current, actors: current.actors.map(item => item.id === id ? { ...item, ...coords } : item), clips: current.clips.map(clip => clip.track === 'movement' && clip.actor === id ? { ...clip, fromX: clamp(clip.fromX + dx, -2000, 3000), toX: clamp(clip.toX + dx, -2000, 3000), fromY: clamp(clip.fromY + dy, -2000, 3000), toY: clamp(clip.toY + dy, -2000, 3000) } : clip) }));
          } else if (object) patchObject({ ...object, ...coords });
        }}/></div>
        <div className="transport"><div className="transport-buttons"><button className="play-button" title={playing || preparing ? 'Pause scene' : 'Play scene'} aria-label={playing || preparing ? 'Pause scene' : 'Play scene'} onClick={() => void play()}>{playing || preparing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</button><IconButton title="Stop scene" onClick={() => seek(0)}><Square size={14}/></IconButton><IconButton title="Loop scene" active={loop} onClick={() => { if (livePlaying.current) pause(); setLoop(value => !value); }}><Repeat2 size={17}/></IconButton></div><span className="timecode"><span ref={counter}>00:00.00</span><i>/</i><span>{clock(scene.duration)}</span></span><input className="preview-range" aria-label="Seek scene" ref={range} type="range" min={0} max={scene.duration} step={.01} defaultValue={0} onChange={e => seek(Number(e.target.value))}/><div className="transport-end"><span className="shot-pill">{arrange ? 'Arrange mode' : shotLabel(shot)}</span><IconButton title={muted ? 'Unmute preview' : 'Mute preview'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</IconButton><IconButton title="Toggle subtitles" active={subtitles} onClick={() => setSubtitles(value => !value)}><Captions size={18}/></IconButton></div></div>
      </section>
      <Inspector scene={scene} actors={actorNames} characters={project.characters} selection={selection} select={select} patchActor={patchActor} patchObject={patchObject} patchClip={patchClip} patchScene={patch => editScene(value => ({ ...value, ...patch }))} editCharacter={editCharacter} addDialogue={() => showAudio('dialogue')} addAction={() => showClip('body')} scenes={project.scenes.length} sceneIndex={sceneIndex} openScenes={() => showDialog('scenes')} remove={removeSelection} duplicate={duplicateSelection} snap={snap} setSnap={setSnap} subtitles={subtitles} setSubtitles={setSubtitles} quality={quality} setQuality={setQuality}/>
    </main>
    <Timeline scene={scene} names={actorNames} selection={selection} select={select} seek={seek} change={patchClip} add={showClip} remove={removeSelection} duplicate={duplicateSelection} compact={compact} onCompact={() => setCompact(value => !value)}/>
    {notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>{!notice.error && <Check size={16}/>}<span>{notice.message}</span><IconButton title="Dismiss notice" onClick={() => setNotice(null)}><X size={14}/></IconButton></div>}
    {content}
  </div>;
}
