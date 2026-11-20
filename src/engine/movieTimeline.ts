import { z } from 'zod';
import { actions, builtinVoiceNames, environments, expressions, ProjectDocument, SceneDefinition, TimelineClip, tracks, shots, soundNames, WIDTH, HEIGHT, type Project, type Scene } from './schema.ts';
import { sceneContext, sceneToCode, validateTimelineChange } from './timelineCode.ts';

/**
 * The ProjectDocument is the ONLY persisted/executed document. This versioned
 * envelope is a lossless code/AI interchange view, not a second state store.
 */
export const MOVIE_CODE_VERSION = 1;
export const MovieTimelineDocument = z.strictObject({
  format: z.literal('toonroom-timeline'),
  schemaVersion: z.literal(MOVIE_CODE_VERSION),
  project: ProjectDocument
});
export const movieToCode = (project: Project) => JSON.stringify({
  format: 'toonroom-timeline', schemaVersion: MOVIE_CODE_VERSION, project
}, null, 2);

function issueText(error: z.ZodError): string {
  return error.issues.slice(0, 8).map(issue =>
    (issue.path.length ? issue.path.join('.') : 'project') + ': ' + issue.message
  ).join('; ');
}

export function validateMovieReplacement(previous: Project, raw: unknown): Project {
  let next: Project;
  try {
    // Old bare JSON can omit the version. Interactive edits must still reject overlapping shots.
    const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined;
    next = ProjectDocument.parse(data && (data.version === undefined || data.version === 0)
      ? {...data, version: 1} : raw);
  }
  catch (error) {
    if (error instanceof z.ZodError) throw new Error('Movie timeline did not validate: ' + issueText(error));
    throw error;
  }
  if (next.id !== previous.id) throw new Error('Movie ID cannot change in Timeline Code Mode. Use Duplicate Project to make a copy.');
  for (const scene of next.scenes)
    validateTimelineChange(scene, previous.scenes.find(old => old.id === scene.id));

  // Audio binary lives in separate storage. JSON must only refer to assets
  // already available to this project, otherwise the movie would not play.
  const available = new Set([
    ...soundNames.map(id => 'builtin:' + id),
    ...builtinVoiceNames.map(id => 'builtin:' + id),
    ...previous.scenes.flatMap(scene => scene.clips.flatMap(clip => 'asset' in clip ? [clip.asset] : []))
  ]);
  for (const scene of next.scenes)
    for (const clip of scene.clips)
      if ('asset' in clip && !available.has(clip.asset))
        throw new Error('Scene "' + scene.name + '", clip "' + clip.id + '": unknown audio asset ' + clip.asset + '. Import it in the studio first.');
  return next;
}

export function parseMovieCode(source: string, current: Project): Project {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) { throw new Error('Invalid JSON: ' + (error instanceof Error ? error.message : 'syntax error')); }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a Toonroom movie timeline object.');
  const data = value as Record<string, unknown>;
  if ('format' in data || 'schemaVersion' in data || 'project' in data) {
    if (data.format !== 'toonroom-timeline') throw new Error('Unknown timeline format.');
    if (data.schemaVersion !== MOVIE_CODE_VERSION) throw new Error('Unsupported movie timeline schema version ' + String(data.schemaVersion) + '.');
    const unknown = Object.keys(data).find(key => !['format', 'schemaVersion', 'project'].includes(key));
    if (unknown) throw new Error('Unknown movie timeline field: ' + unknown + '.');
    return validateMovieReplacement(current, data.project);
  }
  // Legacy exported project files were bare version-1 ProjectDocument JSON.
  return validateMovieReplacement(current, data);
}

export function sceneBuildingContext(project: Project, scene: Scene): string {
  const example = scene.clips[0] ?? null;
  return [
    sceneContext(project, scene),
    'Actual Toonroom scene schema (JSON Schema generated from the runtime validator):',
    JSON.stringify(z.toJSONSchema(SceneDefinition), null, 2),
    'Actual Toonroom clip schema (JSON Schema generated from the runtime validator):',
    JSON.stringify(z.toJSONSchema(TimelineClip), null, 2),
    'Supported normalized movement keyframes: movement clips may have keyframes [{time:0,x,y}, ..., {time:1,x,y}], strictly increasing. They override linear from/to interpolation. Other custom pose keyframes are not supported in scene JSON.',
    'All actor and prop coordinates use the same ' + WIDTH + '×' + HEIGHT + ' stage, origin top-left, +X right and +Y down. Keyframe times are fractions (0 through 1) of the clip length; clip start/length are seconds.',
    'Example of a REAL clip currently in this scene (null means no clips have been made yet):',
    JSON.stringify(example, null, 2),
    'Project ID: ' + project.id + '; scene order: ' + JSON.stringify(project.scenes.map(s => ({ id: s.id, name: s.name, seconds: s.duration }))),
    'Preserve all existing character, actor, world, prop and audio references. You may create new clip IDs but never invent asset IDs.'
  ].join('\n\n');
}

export function movieBuildingContext(project: Project): string {
  return [
    '# Toonroom movie timeline — actual project context',
    'The movie is a ProjectDocument, with scenes ordered by project.scenes. No separate unpersisted timeline exists.',
    'Movie timeline interchange envelope: {format: "toonroom-timeline", schemaVersion: 1, project: ProjectDocument}.',
    'Stage: ' + WIDTH + '×' + HEIGHT + '. Time units: seconds. Clip start + length must fit scene.duration.',
    'Supported tracks: ' + tracks.join(', '),
    'Actions: ' + actions.join(', '),
    'Expressions: ' + expressions.join(', '),
    'Camera shots: ' + shots.join(', '),
    'Environments: ' + environments.join(', '),
    'Real characters: ' + JSON.stringify(project.characters.map(c => ({id:c.id,name:c.name}))),
    'Scenes/actors/props: ' + JSON.stringify(project.scenes.map(s => ({
      id:s.id,name:s.name,duration:s.duration,environment:s.environment,
      actors:s.actors.map(a=>({id:a.id,characterId:a.characterId})),
      objects:s.objects.map(p=>({id:p.id,name:p.name,kind:p.kind}))
    }))),
    'Known audio asset IDs: ' + JSON.stringify([...new Set([
      ...soundNames.map(s => 'builtin:' + s), ...builtinVoiceNames.map(s => 'builtin:' + s),
      ...project.scenes.flatMap(s => s.clips.flatMap(c => 'asset' in c ? [c.asset] : []))
    ])]),
    'JSON Schema generated from the actual executable project validator:',
    JSON.stringify(z.toJSONSchema(ProjectDocument), null, 2),
    'Live project timeline JSON (edit this same document, not a separate representation):',
    movieToCode(project)
  ].join('\n\n');
}
