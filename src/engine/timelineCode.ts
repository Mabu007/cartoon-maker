import { ProjectDocument, builtinVoiceNames, soundNames, tracks, actions, shots, expressions, environments, type Scene, type Project } from './schema.ts';
import { repairOrphanedObjectActions } from './interactions.ts';

/** Canonical scene interchange: editable code is the same scene the renderer executes. */
export const SCENE_CODE_VERSION = 1;
export { cameraConflicts, insertCameraShot } from './cameraTimeline.ts';
import { cameraConflicts } from './cameraTimeline.ts';

/** Every edit is held to the one-camera invariant; legacy data is normalized on load. */
export function validateTimelineChange(scene: Scene, _previous?: Scene) {
  const conflicts = cameraConflicts(scene.clips);
  if (conflicts.length) throw new Error(conflicts[0]);
  if (repairOrphanedObjectActions(scene) !== scene) throw new Error('Timeline actions require compatible props and valid targets.');
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
  return validateSceneReplacement(project, activeSceneId, obj.scene ?? parsed);
}
export function validateSceneReplacement(project: Project, sceneId: string, candidate: unknown, extraAvailableAssets: readonly string[] = []): Scene {
  const index = project.scenes.findIndex(scene => scene.id === sceneId);
  if (index < 0) throw new Error('This scene no longer exists.');
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('Expected a scene object.');
  const result = ProjectDocument.safeParse({ ...project, scenes: project.scenes.map((scene, at) =>
    at === index ? { ...candidate, id: sceneId } : scene
  ) });
  if (!result.success) {
    const details = result.error.issues.slice(0, 6).map(issue => `${issue.path.join('.') || 'scene'}: ${issue.message}`).join('; ');
    throw new Error(`Scene code did not validate: ${details}`);
  }
  const scene = result.data.scenes[index];
  validateTimelineChange(scene, project.scenes[index]);
  const assets = new Set<string>([...soundNames, ...builtinVoiceNames].map(name => `builtin:${name}`));
  for (const asset of extraAvailableAssets) assets.add(asset);
  for (const current of project.scenes) for (const clip of current.clips) if ('asset' in clip) assets.add(clip.asset);
  for (const clip of scene.clips) if ('asset' in clip && !assets.has(clip.asset)) {
    throw new Error(`Clip "${clip.id}" references unknown audio "${clip.asset}". Attach its file in the studio first.`);
  }
  return scene;
}
export function sceneContext(project: Project, scene: Scene): string {
  const audioAssets = [...new Set(project.scenes.flatMap(item => item.clips.flatMap(clip => 'asset' in clip ? [clip.asset] : [])))];
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
    'Available audio assets: ' + JSON.stringify([...soundNames.map(name => `builtin:${name}`), ...audioAssets]),
    'Current canonical scene JSON:',
    sceneToCode(scene)
  ].join('\n\n');
}
