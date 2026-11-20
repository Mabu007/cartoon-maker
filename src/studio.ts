import { create } from 'zustand';
import { ProjectDocument, uid, type Clip, type Project, type Scene } from './engine/schema.ts';
import { makeProject } from './engine/presets.ts';
import { clamp } from './engine/animation.ts';
import { removeObjectWithDecisions, repairOrphanedObjectActions } from './engine/interactions.ts';

export const initial = makeProject(true);
export type Selection = { kind: 'actor' | 'object' | 'clip'; id: string } | null;
export type Library = 'Cast' | 'Worlds' | 'Props' | 'Actions' | 'Audio';
export interface StudioState {
  project: Project; sceneId: string; selection: Selection; library: Library; past: Project[]; future: Project[]; dirty: boolean;
  open: (document: Project, dirty?: boolean) => void; select: (selection: Selection) => void; setLibrary: (panel: Library) => void; setScene: (id: string) => void;
  edit: (command: (project: Project) => Project) => void; editScene: (command: (scene: Scene) => Scene) => void; undo: () => void; redo: () => void;
}
export function runEdit(project: Project, command: (project: Project) => Project) {
  const next = command(project);
  return ProjectDocument.parse({ ...next, scenes: next.scenes.map(repairOrphanedObjectActions) });
}
export const currentScene = (state: Pick<StudioState, 'project' | 'sceneId'>) => state.project.scenes.find(scene => scene.id === state.sceneId) ?? state.project.scenes[0];
export const useStudio = create<StudioState>((set, get) => ({
  project: initial, sceneId: initial.scenes[0].id, selection: null, library: 'Cast', past: [], future: [], dirty: false,
  open: (project, dirty = false) => {
    const normalized = ProjectDocument.parse({ ...project, scenes: project.scenes.map(repairOrphanedObjectActions) });
    set({ project: normalized, sceneId: normalized.scenes[0].id, selection: null, past: [], future: [], dirty });
  },
  select: selection => set({ selection }), setLibrary: library => set({ library }), setScene: sceneId => set({ sceneId, selection: null }),
  edit: command => set(state => ({ project: runEdit(state.project, command), past: [...state.past.slice(-39), state.project], future: [], dirty: true })),
  editScene: command => {
    const scene = currentScene(get());
    get().edit(project => ({ ...project, scenes: project.scenes.map(item => item.id === scene.id ? command(item) : item) }));
  },
  undo: () => set(state => state.past.length ? { project: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.project, ...state.future], dirty: true } : state),
  redo: () => set(state => state.future.length ? { project: state.future[0], past: [...state.past, state.project], future: state.future.slice(1), dirty: true } : state)
}));
export function changeClipTiming(clip: Clip, start: number, length: number, duration: number, leftTrim = false): Clip {
  const at = clamp(Math.round(start * 100) / 100, 0, duration - .1);
  const span = clamp(Math.max(.1, Math.round(length * 100) / 100), .1, duration - at);
  if (leftTrim && (clip.track === 'dialogue' || clip.track === 'audio')) return { ...clip, start: at, length: span, offset: clamp(clip.offset + at - clip.start, 0, 180) };
  return { ...clip, start: at, length: span };
}
export function removeEntity(scene: Scene, id: string): Scene {
  const current = scene.objects.some(item => item.id === id) ? removeObjectWithDecisions(scene, id) : scene;
  return { ...current, actors: current.actors.filter(item => item.id !== id), objects: current.objects.filter(item => item.id !== id), clips: current.clips.filter(clip => clip.id !== id && (!('actor' in clip) || clip.actor !== id)).map(clip => {
    if (clip.track === 'camera' && clip.focus === id) { const { focus, ...rest } = clip; return rest; }
    if (clip.track === 'body' && clip.target === id) { const { target, ...rest } = clip; return rest; }
    return clip;
  }) };
}
export function copyClip(clip: Clip, duration: number) {
  return changeClipTiming({ ...clip, id: uid() }, Math.min(clip.start + clip.length, duration - clip.length), clip.length, duration);
}
