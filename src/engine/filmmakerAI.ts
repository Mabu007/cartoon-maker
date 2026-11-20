import { z } from 'zod';
import { TimelineClip, ScriptElement, StoryBibleSchema, type DirectionData, type Production, type ScriptLine, type ScriptSceneData } from './schema.ts';

export const aiTasks = ['brainstorm', 'screenplay', 'direct', 'timeline'] as const;
export type AiTask = typeof aiTasks[number];
const id = z.string().min(1).max(100);
const content = ScriptElement.omit({ id: true });
export const sceneDraft = z.strictObject({ elements: z.array(content).min(1).max(120) });
export const directionEdits = z.strictObject({
  message: z.string().min(1).max(1500),
  edits: z.array(z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('replace'), lineId: id, element: content }),
    z.strictObject({ op: z.literal('insert'), lineId: id, element: content }),
    z.strictObject({ op: z.literal('remove'), lineId: id })
  ])).max(20)
});
/** AI Director commands are a narrowly typed and reviewable edit language.
 * No generated JavaScript, asset URLs, arbitrary file writes or remote tools. */
const actorPlacement = z.strictObject({
  x:z.number().finite().min(-2000).max(3000).optional(),
  y:z.number().finite().min(-2000).max(3000).optional(),
  rotation:z.number().finite().min(-360).max(360).optional(),
  scale:z.number().finite().min(.2).max(4).optional(),
  flip:z.boolean().optional(),
  view:z.enum(['front','three-quarter','side','back-quarter','back']).optional(),
  expression:z.enum(['neutral','happy','excited','smug','confused','sleepy','angry','surprised','sad','thinking','nervous']).optional(),
  gazeTarget:id.optional()
});
const propPlacement=z.strictObject({
  x:z.number().finite().min(-2000).max(3000).optional(),
  y:z.number().finite().min(-2000).max(3000).optional(),
  rotation:z.number().finite().min(-360).max(360).optional(),
  scale:z.number().finite().min(.2).max(4).optional(),
  depth:z.number().finite().min(-1000).max(1000).optional(),
  name:z.string().trim().min(1).max(60).optional(),
  color:z.string().regex(/^#[0-9a-f]{6}$/i).optional()
});
const scenePlacement=z.strictObject({
  name:z.string().trim().min(1).max(70).optional(),
  duration:z.number().finite().min(1).max(180).optional(),
  environment:z.enum(['Living room','Classroom','Township street','Podcast studio']).optional()
});
const transcript=z.string().trim().min(1).max(400);
export const timelineEdits = z.strictObject({
  message: z.string().min(1).max(1500),
  edits: z.array(z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('insert'), clip: TimelineClip }),
    z.strictObject({ op: z.literal('replace'), clipId: id, clip: TimelineClip }),
    z.strictObject({ op: z.literal('remove'), clipId: id }),
    z.strictObject({ op: z.literal('update_clip'), clipId:id, changes:z.record(z.string().min(1).max(60),z.json()) }),
    z.strictObject({ op: z.literal('place_actor'), actorId:id, changes:actorPlacement }),
    z.strictObject({ op: z.literal('place_prop'), propId:id, changes:propPlacement }),
    z.strictObject({ op: z.literal('add_prop'), prop:z.strictObject({
      id,name:z.string().trim().min(1).max(60),
      kind:z.enum(['sofa','chair','table','desk','door','window','television','lamp','cup','book','phone','plant','microphone','streetlight','counter']),
      color:z.string().regex(/^#[0-9a-f]{6}$/i),
      x:z.number().finite().min(-2000).max(3000),y:z.number().finite().min(-2000).max(3000),
      scale:z.number().finite().min(.2).max(4),rotation:z.number().finite().min(-360).max(360),
      depth:z.number().finite().min(-1000).max(1000)
    }) }),
    z.strictObject({ op: z.literal('remove_prop'), propId:id }),
    z.strictObject({ op: z.literal('place_scene'), changes:scenePlacement }),
    /** Synthesize only after the user presses Apply. Never invent an audio asset. */
    z.strictObject({ op: z.literal('speak'), actor:id, text:transcript,
      start:z.number().finite().min(0).max(179.9),
      clipId:id.optional(), voice:z.enum(['warm','bright','deep']).optional() })
  ])).max(24)
});
export const aiSchemas = {
  brainstorm: z.strictObject({ message: z.string().min(1).max(3500), proposal: StoryBibleSchema.optional() }),
  screenplay: sceneDraft,
  direct: directionEdits,
  timeline: timelineEdits
};
export type DirectorEdit = z.infer<typeof directionEdits>;

export function identifyCues(next: DirectionData[], original: DirectionData[], makeId: () => string) {
  const used = new Set<DirectionData>();
  return next.map(cue => {
    const same = original.find(item => item.id === cue.id && cue.id && !used.has(item))
      ?? original.find(item => !used.has(item) && item.kind === cue.kind &&
        ('actor' in item ? item.actor : undefined) === ('actor' in cue ? cue.actor : undefined));
    if (same) used.add(same);
    return { ...cue, id: same?.id ?? makeId() };
  });
}
export function applyDirectorEdits(scene: ScriptSceneData, result: DirectorEdit, makeId: () => string): ScriptSceneData {
  const originals = new Set(scene.elements.map(line => line.id));
  let elements = [...scene.elements];
  for (const edit of result.edits) {
    if (!originals.has(edit.lineId)) throw new Error('The proposed change references a line outside the selected scene.');
    const at = elements.findIndex(line => line.id === edit.lineId);
    if (at === -1) throw new Error('The proposed change refers to a line already removed.');
    if (edit.op === 'remove') {
      if (elements[at].type === 'scene-heading') throw new Error('A scene needs its heading.');
      elements = elements.filter(line => line.id !== edit.lineId);
    } else {
      const line: ScriptLine = { ...edit.element, id: edit.op === 'insert' ? makeId() : edit.lineId,
        directions: identifyCues(edit.element.directions, edit.op === 'replace' ? elements[at].directions : [], makeId) };
      if (edit.op === 'insert') elements.splice(at + 1, 0, line);
      else elements[at] = line;
    }
  }
  if (!elements.length || elements.length > 150) throw new Error('The proposed edit exceeds the screenplay scene limits.');
  return { ...scene, elements };
}

export function acceptBibleProposal(current: Production['bible'], proposed: Production['bible']): Production['bible'] {
  function merge<T extends { status: string }>(old: T[], next: T[], key: (item: T) => string) {
    const merged = new Map(old.map(item => [key(item), item]));
    for (const item of next) {
      const existing = merged.get(key(item));
      if (!existing || !['approved', 'locked', 'superseded'].includes(existing.status))
        merged.set(key(item), { ...item, status: 'proposed' });
    }
    return [...merged.values()];
  }
  return {
    profile: current.status === 'approved' || current.status === 'locked' ? current.profile : proposed.profile,
    status: current.status === 'approved' || current.status === 'locked' ? current.status : 'proposed',
    characters: merge(current.characters, proposed.characters, item => item.characterId),
    worlds: merge(current.worlds, proposed.worlds, item => item.id),
    scenes: merge(current.scenes, proposed.scenes, item => item.id)
  };
}
