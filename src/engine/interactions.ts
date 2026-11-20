import { anchors } from './presets.ts';
import { actions, type Action, type Anchor, type Clip, type Prop, type Scene } from './schema.ts';

export type DependentAction = Extract<Clip, { track: 'body' }>;
export type ObjectDependencyDecision = Record<string, string>;
export type ObjectDependency = { clip: DependentAction; actorName: string; targetName: string; alternatives: Prop[] };

export function anchorFor(object: Prop): Anchor | undefined {
  if (object.kind === 'image') {
    if (object.interaction === 'sit')
      return { action: 'sit', x: 0, y: -(object.imageHeight ?? 100) * .46, facing: 'side' };
    if (object.interaction === 'hold')
      return { action: 'hold', x: 0, y: -(object.imageHeight ?? 70) * .5 };
    return undefined;
  }
  return anchors[object.kind];
}
const fallbackFor = (clip: DependentAction): Action => clip.action === 'sit' ? 'stand' : 'idle';

export function compatibleObjects(scene: Scene, action: Action, excludeId?: string): Prop[] {
  return scene.objects.filter(object =>
    object.id !== excludeId && (action === 'sit'
      ? anchorFor(object)?.action === 'sit'
      : anchorFor(object)?.action === 'hold'));
}
export function nearestObject(scene: Scene, actorId: string, action: Action, excludeId?: string): Prop | undefined {
  const actor = scene.actors.find(item => item.id === actorId);
  return compatibleObjects(scene, action, excludeId).sort((a, b) =>
    (actor ? (a.x - actor.x) ** 2 + (a.y - actor.y) ** 2 - (b.x - actor.x) ** 2 - (b.y - actor.y) ** 2 : 0))[0];
}
export function objectDependencies(scene: Scene, objectId: string, actorNames: Record<string, string> = {}): ObjectDependency[] {
  const object = scene.objects.find(item => item.id === objectId);
  if (!object) return [];
  return scene.clips.flatMap(clip => {
    if (clip.track !== 'body' || clip.target !== objectId) return [];
    const kind = anchorFor(object)?.action;
    const alternatives = scene.objects.filter(item => item.id !== objectId && anchorFor(item)?.action === kind);
    return [{ clip, actorName: actorNames[clip.actor] ?? scene.actors.find(item => item.id === clip.actor)?.id ?? 'Actor',
      targetName: object.name, alternatives }];
  });
}
export const defaultObjectDecision = (clip: DependentAction): string => 'action:' + fallbackFor(clip);

function resolvedAction(clip: DependentAction, decision: string | undefined): DependentAction {
  const actionName = decision?.startsWith('action:') ? decision.slice(7) : fallbackFor(clip);
  const action: Action = (actions as readonly string[]).includes(actionName) && actionName !== 'sit' ? actionName as Action : fallbackFor(clip);
  const { target: _target, ...rest } = clip;
  return { ...rest, action, layer: action === 'stand' ? 'body' : clip.layer };
}

/** Strong deletion invariant: a removed prop can never leave a dangling target
 * or an unsupported seated pose, regardless of which UI route caused deletion.
 */
export function removeObjectWithDecisions(scene: Scene, objectId: string, decisions: ObjectDependencyDecision = {}): Scene {
  const removed = scene.objects.find(item => item.id === objectId);
  if (!removed) return scene;
  const previousKind = anchorFor(removed)?.action;
  const surviving = scene.objects.filter(item => item.id !== objectId);
  const clips = scene.clips.filter(clip => !((clip.track === 'gaze' || clip.track === 'props') && clip.target === objectId)).map(clip => {
    if (clip.track !== 'body' || clip.target !== objectId) return clip;
    const decision = decisions[clip.id];
    if (decision?.startsWith('object:')) {
      const alternative = surviving.find(item => item.id === decision.slice(7) && anchorFor(item)?.action === previousKind);
      if (alternative) return { ...clip, target: alternative.id };
    }
    return resolvedAction(clip, decision);
  });
  return repairGazeTargets({ ...scene, objects: surviving, clips });
}

/** Used for world changes and imported/legacy projects. */
export function repairOrphanedObjectActions(scene: Scene): Scene {
  let changed = false;
  const targets = new Set([...scene.actors.map(actor => actor.id), ...scene.objects.map(object => object.id), 'camera']);
  const valid = scene.clips.filter(clip => clip.track === 'gaze' ? targets.has(clip.target) :
    clip.track === 'props' ? scene.objects.some(object => object.id === clip.target && anchorFor(object)?.action === 'hold') : true);
  changed = valid.length !== scene.clips.length;
  const clips = valid.map(clip => {
    if (clip.track !== 'body') return clip;
    const target = clip.target ? scene.objects.find(item => item.id === clip.target) : undefined;
    if (clip.action === 'sit' && (!target || anchorFor(target)?.action !== 'sit')) {
      changed = true;
      return resolvedAction(clip, 'action:stand');
    }
    if (clip.target && (!target || (clip.action !== 'sit' && anchorFor(target)?.action === 'sit'))) {
      changed = true;
      return resolvedAction(clip, 'action:' + (clip.action === 'sit' ? 'stand' : clip.action));
    }
    return clip;
  });
  return repairGazeTargets(changed ? { ...scene, clips } : scene);
}
export function repairGazeTargets(scene: Scene): Scene {
  const possible = new Set([...scene.actors.map(item => item.id), ...scene.objects.map(item => item.id), 'camera']);
  if (scene.actors.every(actor => !actor.gazeTarget || possible.has(actor.gazeTarget))) return scene;
  return { ...scene, actors: scene.actors.map(actor => {
    if (!actor.gazeTarget || possible.has(actor.gazeTarget)) return actor;
    const { gazeTarget: _, ...rest } = actor; return rest;
  }) };
}
export function replaceWorldObjects(scene: Scene, replacements: Prop[]): Scene {
  // Prop IDs are local to scenes: an old seating/holding reference must be
  // resolved when the whole furnished world is replaced, too.
  return repairOrphanedObjectActions({ ...scene, objects: replacements });
}
