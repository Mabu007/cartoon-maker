import { anchors } from './presets.ts';
import { actions, type Action, type Clip, type Prop, type Scene } from './schema.ts';

export type DependentAction = Extract<Clip, { track: 'body' }>;
export type ObjectDependencyDecision = Record<string, string>;
export type ObjectDependency = { clip: DependentAction; actorName: string; targetName: string; alternatives: Prop[] };

const fallbackFor = (clip: DependentAction): Action => clip.action === 'sit' ? 'stand' : 'idle';

export function compatibleObjects(scene: Scene, action: Action, excludeId?: string): Prop[] {
  return scene.objects.filter(object =>
    object.id !== excludeId && (action === 'sit'
      ? anchors[object.kind]?.action === 'sit'
      : anchors[object.kind]?.action === 'hold'));
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
    const kind = anchors[object.kind]?.action;
    const alternatives = scene.objects.filter(item => item.id !== objectId && anchors[item.kind]?.action === kind);
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
  const previousKind = anchors[removed.kind]?.action;
  const surviving = scene.objects.filter(item => item.id !== objectId);
  const clips = scene.clips.map(clip => {
    if (clip.track !== 'body' || clip.target !== objectId) return clip;
    const decision = decisions[clip.id];
    if (decision?.startsWith('object:')) {
      const alternative = surviving.find(item => item.id === decision.slice(7) && anchors[item.kind]?.action === previousKind);
      if (alternative) return { ...clip, target: alternative.id };
    }
    return resolvedAction(clip, decision);
  });
  return { ...scene, objects: surviving, clips };
}

/** Used for world changes and imported/legacy projects. */
export function repairOrphanedObjectActions(scene: Scene): Scene {
  let changed = false;
  const clips = scene.clips.map(clip => {
    if (clip.track !== 'body') return clip;
    const target = clip.target ? scene.objects.find(item => item.id === clip.target) : undefined;
    if (clip.action === 'sit' && (!target || anchors[target.kind]?.action !== 'sit')) {
      changed = true;
      return resolvedAction(clip, 'action:stand');
    }
    if (clip.target && !target) {
      changed = true;
      return resolvedAction(clip, 'action:' + (clip.action === 'sit' ? 'stand' : clip.action));
    }
    return clip;
  });
  return changed ? { ...scene, clips } : scene;
}
export function replaceWorldObjects(scene: Scene, replacements: Prop[]): Scene {
  // Prop IDs are local to scenes: an old seating/holding reference must be
  // resolved when the whole furnished world is replaced, too.
  return repairOrphanedObjectActions({ ...scene, objects: replacements });
}
