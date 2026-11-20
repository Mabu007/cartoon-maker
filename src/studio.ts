import { create } from 'zustand';
import { ProjectDocument, parseStoredProject, type Clip, type Project, type Scene } from './engine/schema.ts';
import { makeProject } from './engine/presets.ts';
import { validateTimelineChange } from './engine/timelineCode.ts';
import { duplicateClips } from './engine/timelineEditing.ts';
import { clamp } from './engine/animation.ts';
import { removeObjectWithDecisions, repairOrphanedObjectActions, repairGazeTargets } from './engine/interactions.ts';

export const initial = ProjectDocument.parse(makeProject(true));
export type Selection = { kind: 'actor' | 'object' | 'clip'; id: string } | null;
export type Library = 'Cast' | 'Worlds' | 'Props' | 'Actions' | 'Audio';
type Snapshot = { project: Project; sceneId: string; selection: Selection; clipIds: string[]; selectedKeyframe: { clipId: string; index: number } | null };
export type SceneTarget = { session: number; sceneId: string };
export interface StudioState extends Snapshot {
  session: number; library: Library; past: Snapshot[]; future: Snapshot[]; dirty: boolean;
  open: (document: Project, dirty?: boolean) => void; select: (selection: Selection) => void; selectClips: (ids: string[]) => void; selectKeyframe: (clipId: string, index: number) => void; setLibrary: (panel: Library) => void; setScene: (id: string) => void;
  edit: (command: (project: Project) => Project) => void; editScene: (command: (scene: Scene) => Scene, target?: SceneTarget) => void;
  markSaved: (document: Project) => void; undo: () => void; redo: () => void;
}

export function runEdit(project: Project, command: (project: Project) => Project) {
  // Isolate commands from the live document and every undo/redo snapshot.
  const next = ProjectDocument.parse(command(structuredClone(project)));
  if (next.id !== project.id) throw new Error('A project edit must keep its original ID.');
  for (const scene of next.scenes) validateTimelineChange(scene, project.scenes.find(item => item.id === scene.id));
  return JSON.stringify(next) === JSON.stringify(project) ? project : next;
}
export const currentScene = (state: Pick<Snapshot, 'project' | 'sceneId'>) => state.project.scenes.find(scene => scene.id === state.sceneId) ?? state.project.scenes[0];
const snapshot = ({ project, sceneId, selection, clipIds, selectedKeyframe }: Snapshot): Snapshot => ({ project, sceneId, selection, clipIds, selectedKeyframe });
function validSelection(scene: Scene, selection: Selection): Selection {
  if (!selection) return null;
  const items = selection.kind === 'actor' ? scene.actors : selection.kind === 'object' ? scene.objects : scene.clips;
  return items.some(item => item.id === selection.id) ? selection : null;
}
export const useStudio = create<StudioState>((set, get) => ({
  project: initial, sceneId: initial.scenes[0].id, selection: null, clipIds: [], selectedKeyframe: null, session: 0, library: 'Cast', past: [], future: [], dirty: false,
  open: (project, dirty = false) => {
    const normalized = parseStoredProject({ ...project, scenes: project.scenes.map(repairOrphanedObjectActions) });
    set(state => ({ project: normalized, sceneId: normalized.scenes[0].id, selection: null, clipIds: [], selectedKeyframe: null, session: state.session + 1, past: [], future: [], dirty }));
  },
  select: selection => set(state => {
    const valid = validSelection(currentScene(state), selection);
    return { selection: valid, clipIds: valid?.kind === 'clip' ? [valid.id] : [], selectedKeyframe: null };
  }),
  selectClips: ids => set(state => {
    const existing = new Set(currentScene(state).clips.map(clip => clip.id));
    const selected = [...new Set(ids)].filter(id => existing.has(id));
    return { clipIds: selected, selection: selected.length ? { kind: 'clip' as const, id: selected.at(-1)! } : null, selectedKeyframe: null };
  }),
  selectKeyframe: (clipId, index) => set(state => {
    const clip = currentScene(state).clips.find(item => item.id === clipId);
    if (clip?.track !== 'movement' || !clip.keyframes?.[index]) return state;
    return { clipIds: [clipId], selection: { kind: 'clip' as const, id: clipId }, selectedKeyframe: { clipId, index } };
  }),
  setLibrary: library => set({ library }),
  setScene: sceneId => set(state => state.project.scenes.some(scene => scene.id === sceneId) && state.sceneId !== sceneId ? { sceneId, selection: null, clipIds: [], selectedKeyframe: null } : state),
  edit: command => set(state => {
    const project = runEdit(state.project, command);
    if (project === state.project) return state;
    const scene = currentScene({ project, sceneId: state.sceneId });
    const previous = scene.id === state.sceneId;
    const existing = new Map(scene.clips.map(clip => [clip.id, clip]));
    const clipIds = previous ? state.clipIds.filter(id => existing.has(id)) : [];
    const keyframe = previous ? state.selectedKeyframe : null;
    const selectedKeyframe = keyframe && existing.get(keyframe.clipId)?.track === 'movement' &&
      (existing.get(keyframe.clipId) as Extract<Clip, { track: 'movement' }>).keyframes?.[keyframe.index] ? keyframe : null;
    return { project, sceneId: scene.id, selection: previous ? validSelection(scene, state.selection) : null, clipIds, selectedKeyframe,
      past: [...state.past.slice(-39), snapshot(state)], future: [], dirty: true };
  }),
  editScene: (command, target) => {
    const state = get();
    const scene = currentScene(state);
    if (target && (target.session !== state.session || target.sceneId !== scene.id)) throw new Error('The active scene changed. Start this edit again in the intended scene.');
    state.edit(project => ({ ...project, scenes: project.scenes.map(item => {
      if (item.id !== scene.id) return item;
      const next = command(item);
      if (next.id !== scene.id) throw new Error('A scene edit must keep its original ID.');
      return next;
    }) }));
  },
  markSaved: project => set(state => state.project === project && state.dirty ? { dirty: false } : state),
  undo: () => set(state => state.past.length ? { ...state.past.at(-1)!, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future], dirty: true } : state),
  redo: () => set(state => state.future.length ? { ...state.future[0], past: [...state.past, snapshot(state)], future: state.future.slice(1), dirty: true } : state)
}));
export function changeClipTiming(clip: Clip, start: number, length: number, duration: number, leftTrim = false): Clip {
  const at = clamp(Math.round(start * 100) / 100, 0, duration - .1);
  const span = clamp(Math.max(.1, Math.round(length * 100) / 100), .1, duration - at);
  if (leftTrim && (clip.track === 'dialogue' || clip.track === 'audio' || clip.track === 'music')) return { ...clip, start: at, length: span, offset: clamp(clip.offset + at - clip.start, 0, 180) };
  return { ...clip, start: at, length: span };
}
export function removeEntity(scene: Scene, id: string): Scene {
  const current = scene.objects.some(item => item.id === id) ? removeObjectWithDecisions(scene, id) : scene;
  return repairGazeTargets({ ...current, actors: current.actors.filter(item => item.id !== id), objects: current.objects.filter(item => item.id !== id), clips: current.clips.filter(clip => clip.id !== id && (!('actor' in clip) || clip.actor !== id) && (!('target' in clip) || (clip.track !== 'gaze' && clip.track !== 'props') || clip.target !== id)).map(clip => {
    if (clip.track === 'camera' && clip.focus === id) { const { focus, ...rest } = clip; return rest; }
    if (clip.track === 'body' && clip.target === id) { const { target, ...rest } = clip; return rest; }
    return clip;
  }) });
}
export function copyClip(clip: Clip, duration: number, clips: Clip[] = []): Clip {
  return duplicateClips([clip], clips, duration)[0];
}
