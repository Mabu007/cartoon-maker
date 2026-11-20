import { SceneDefinition, tracks, actions, shots, expressions, environments, type Scene, type Project, type Clip } from './schema.ts';

/** Canonical scene interchange: editable code is the same scene the renderer executes. */
export const SCENE_CODE_VERSION = 1;
type Camera = Extract<Clip, { track: 'camera' }>;
const round = (n: number) => Math.round(n * 100) / 100;
const minClip = .1;

export function cameraConflicts(clips: Clip[]): string[] {
  const shots = clips.filter((item): item is Camera => item.track === 'camera').sort((a, b) => a.start - b.start);
  const conflicts: string[] = [];
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].start < shots[i - 1].start + shots[i - 1].length - .0001) {
      conflicts.push(`Camera shots "${shots[i - 1].id}" and "${shots[i].id}" overlap. Trim, move or replace a shot.`);
    }
  }
  return conflicts;
}

/** Insert/resize a single full-frame camera shot without overlapping another.
 * A covered shot is removed; a partially covered shot is trimmed; a completely
 * surrounding shot is split to preserve the visible portions. */
export function insertCameraShot(clips: Clip[], incoming: Camera): Clip[] {
  const start = incoming.start, end = round(incoming.start + incoming.length);
  const result: Clip[] = [];
  for (const clip of clips) {
    if (clip.track !== 'camera' || clip.id === incoming.id) {
      if (clip.id !== incoming.id) result.push(clip);
      continue;
    }
    const otherEnd = clip.start + clip.length;
    if (otherEnd <= start + 1e-5 || clip.start >= end - 1e-5) { result.push(clip); continue; }
    const before = round(start - clip.start), after = round(otherEnd - end);
    if (before >= minClip) result.push({ ...clip, length: before });
    if (after >= minClip) {
      // The new right-hand segment needs an independent ID when both survive.
      result.push({ ...clip, id: before >= minClip ? `${clip.id}-after-${round(end).toString().replace('.', '_')}` : clip.id,
        start: end, length: after });
    }
  }
  return [...result, incoming].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export function sceneToCode(scene: Scene): string {
  return JSON.stringify({ schemaVersion: SCENE_CODE_VERSION, scene }, null, 2);
}
export function parseSceneCode(text: string, project: Project, activeSceneId: string): Scene {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'syntax error'}`);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Paste a Toonroom scene JSON object.');
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== undefined && obj.schemaVersion !== SCENE_CODE_VERSION)
    throw new Error(`Unsupported scene schema version ${String(obj.schemaVersion)}. Expected ${SCENE_CODE_VERSION}.`);
  const candidate = (obj.scene ?? parsed) as unknown;
  const result = SceneDefinition.safeParse(candidate);
  if (!result.success) {
    const details = result.error.issues.slice(0, 6).map(issue =>
      `${issue.path.join('.') || 'scene'}: ${issue.message}`).join('; ');
    throw new Error(`Scene code did not validate: ${details}`);
  }
  const scene = { ...result.data, id: activeSceneId };
  const cameraErrors = cameraConflicts(scene.clips);
  if (cameraErrors.length) throw new Error(cameraErrors.join(' '));
  const characters = new Set(project.characters.map(item => item.id));
  const actors = new Set(scene.actors.map(item => item.id));
  const props = new Set(scene.objects.map(item => item.id));
  for (const actor of scene.actors) if (!characters.has(actor.characterId))
    throw new Error(`Unknown cast ID "${actor.characterId}". Add this character in Cast first.`);
  for (const clip of scene.clips) {
    if ('actor' in clip && !actors.has(clip.actor)) throw new Error(`Clip "${clip.id}" references missing actor "${clip.actor}".`);
    if (clip.track === 'camera' && clip.focus && !actors.has(clip.focus)) throw new Error(`Camera shot "${clip.id}" has unknown focus "${clip.focus}".`);
    if (clip.track === 'props' && !props.has(clip.target)) throw new Error(`Prop clip "${clip.id}" references missing prop "${clip.target}".`);
    if (clip.track === 'gaze' && clip.target !== 'camera' && !props.has(clip.target) && !actors.has(clip.target))
      throw new Error(`Eye gaze clip "${clip.id}" has missing target "${clip.target}".`);
  }
  return scene;
}
export function sceneContext(project: Project, scene: Scene): string {
  const characterNames = project.characters.map(c => ({ id: c.id, name: c.name }));
  const actors = scene.actors.map(a => ({ id: a.id, characterId: a.characterId }));
  const props = scene.objects.map(o => ({ id: o.id, kind: o.kind, name: o.name }));
  return [
    '# Toonroom — AI Scene Builder Context',
    'Write executable timeline JSON, NOT JavaScript. The complete scene JSON is authoritative for the animation preview.',
    'Return a JSON object containing schemaVersion: 1 and scene. No Markdown fences.',
    'Preserve the scene ID, actor IDs, character IDs and asset IDs below.',
    'Scene coordinates use world units (960×540 canvas, positive X right, Y down).',
    'start and length are measured in seconds; each clip must fit within scene.duration.',
    'Camera shots are mutually exclusive; at most one camera clip may be active at any time.',
    'Valid tracks: ' + tracks.join(', '),
    'Available character actions: ' + actions.join(', '),
    'Available expressions: ' + expressions.join(', '),
    'Available camera shots: ' + shots.join(', '),
    'Available environments: ' + environments.join(', '),
    'Track clip shapes: actors {actor,visible}; movement {actor,fromX,fromY,toX,toY,gait?}; body {actor,action,layer,target?}; face {actor,expression}; gaze {actor,target}; props {actor,target,interaction}; dialogue {actor,text,asset,volume,muted,offset}; audio/music {asset,name,volume,muted,offset}; camera {shot,focus?,transition}; transition {effect}.',
    'Every clip requires id, track, start, length. Dialogue and audio assets must be existing asset IDs; do not invent sound files.',
    'Cast: ' + JSON.stringify(characterNames),
    'Scene actors: ' + JSON.stringify(actors),
    'Props: ' + JSON.stringify(props),
    'Current canonical scene JSON:',
    sceneToCode(scene)
  ].join('\n\n');
}
