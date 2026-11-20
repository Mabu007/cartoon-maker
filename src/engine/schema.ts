import { z } from 'zod';

export const WIDTH = 960;
export const HEIGHT = 540;
export const views = ['front', 'three-quarter', 'side', 'back-quarter', 'back'] as const;
export const expressions = ['neutral', 'happy', 'excited', 'smug', 'confused', 'sleepy', 'angry', 'surprised', 'sad', 'thinking'] as const;
export const actions = ['idle', 'walk', 'run', 'stop', 'turn', 'jump', 'sit', 'stand', 'wave', 'point', 'nod', 'shake', 'shrug', 'laugh', 'cry', 'angry', 'surprise', 'celebrate', 'talk', 'listen', 'think', 'lean', 'hand-on-hip', 'hand-to-face', 'hand-to-pocket', 'fist', 'open-hand', 'blink', 'look-away'] as const;
export const shots = ['wide', 'medium', 'close-up', 'two-shot', 'front', 'side', 'back', 'follow', 'extreme-close-up', 'over-shoulder', 'establishing', 'reaction', 'pan', 'tilt', 'zoom', 'hold'] as const;
export const environments = ['Living room', 'Classroom', 'Township street', 'Podcast studio'] as const;
export const props = ['sofa', 'chair', 'table', 'desk', 'door', 'window', 'television', 'lamp', 'cup', 'book', 'phone', 'plant', 'microphone', 'streetlight', 'counter', 'image'] as const;
export const tracks = ['actors', 'movement', 'body', 'face', 'gaze', 'props', 'dialogue', 'audio', 'music', 'camera', 'transition'] as const;
export const trackNames = { actors: 'Actors', movement: 'Movement', body: 'Actions', face: 'Expressions', gaze: 'Eye gaze', props: 'Prop cues', dialogue: 'Dialogue', audio: 'SFX', music: 'Music', camera: 'Camera', transition: 'Transitions' };
const id = z.string().min(1).max(100);
const color = z.string().regex(/^#[\da-f]{6}$/i);
// Portable WebP thumbnails are embedded in project JSON. A strict budget keeps
// the project within typical browser storage and Firestore document limits.
const imageData = z.string().regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/).max(320_000);
const propImageData = z.string().regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/).max(105_000);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const position = { x: num(-2000, 3000), y: num(-2000, 3000), scale: num(.2, 4), rotation: num(-360, 360), depth: num(-1000, 1000) };
export const CharacterView = z.enum(views);
export const CharacterDefinition = z.strictObject({
  id, name: z.string().trim().min(1).max(60), skin: color, shirt: color, pants: color, hairColor: color, shoes: color,
  height: num(.75, 1.3), head: num(.75, 1.35), torso: num(.75, 1.3), arms: num(.75, 1.3), legs: num(.75, 1.3), thickness: num(.65, 1.45), eyeSpacing: num(.65, 1.4),
  shape: z.enum(['round', 'oval', 'square']), eyes: z.enum(['round', 'relaxed', 'wide']), brows: z.enum(['arched', 'straight', 'bold']),
  nose: z.enum(['button', 'long', 'flat']), mouth: z.enum(['smile', 'line', 'full']), ears: z.enum(['round', 'small', 'wide']),
  hair: z.enum(['fade', 'puff', 'locs', 'buzz', 'bald', 'afro', 'braids', 'curls']), beard: z.enum(['none', 'goatee', 'full']), hat: z.enum(['none', 'cap', 'beanie']),
  glasses: z.boolean(), earrings: z.boolean(), outfit: z.enum(['tee', 'hoodie', 'jacket', 'sweater', 'uniform']), accessory: z.enum(['none', 'chain', 'scarf']), goldTeeth: z.array(z.number().int().min(0).max(5)).max(6).optional()
});
export const SceneObject = z.strictObject({ id, kind: z.enum(props), name: z.string().min(1).max(60), color, ...position,
  imageData: propImageData.optional(), imageWidth: num(10, 800).optional(), imageHeight: num(10, 800).optional(),
  interaction: z.enum(['none','sit','hold']).optional()
});
export const Actor = z.strictObject({ id, characterId: id, ...position, view: CharacterView, flip: z.boolean(), expression: z.enum(expressions), gazeTarget: id.optional() });
export const InteractionAnchor = z.strictObject({ x: num(-1000, 1000), y: num(-1000, 1000), action: z.enum(['sit', 'hold', 'open']), facing: CharacterView.optional() });
export const joints = ['root', 'hips', 'torso', 'neck', 'head', 'leftShoulder', 'leftElbow', 'leftWrist', 'leftHand', 'rightShoulder', 'rightElbow', 'rightWrist', 'rightHand', 'leftHip', 'leftKnee', 'leftAnkle', 'leftFoot', 'rightHip', 'rightKnee', 'rightAnkle', 'rightFoot'] as const;
export const Joint = z.enum(joints);
export const SkeletonDefinition = z.record(Joint, Joint.nullable());
export const AnimationClip = z.strictObject({ id: z.enum(actions), duration: num(.1, 60), loop: z.boolean(), keys: z.array(z.strictObject({ time: num(0, 1), pose: z.partialRecord(Joint, z.number().finite()), lift: z.number().finite().optional() })).min(2), expression: z.enum(expressions).optional(), views: z.array(CharacterView).optional() });
const time = { id, start: num(0, 180), length: num(.1, 180) };
const ActorClip = z.strictObject({ ...time, track: z.literal('actors'), actor: id, visible: z.boolean().optional() });
const MoveClip = z.strictObject({ ...time, track: z.literal('movement'), actor: id, fromX: position.x, fromY: position.y, toX: position.x, toY: position.y, gait: z.enum(['walk', 'run']).optional(),
  /** Optional normalized spatial keys. When present they drive the evaluated path. */
  keyframes: z.array(z.strictObject({ time: num(0, 1), x: position.x, y: position.y })).min(2).max(32).optional() });
const BodyClip = z.strictObject({ ...time, track: z.literal('body'), actor: id, action: z.enum(actions), layer: z.enum(['body', 'gesture']), target: id.optional() });
const GazeClip = z.strictObject({ ...time, track: z.literal('gaze'), actor: id, target: id });
const PropClip = z.strictObject({ ...time, track: z.literal('props'), actor: id, target: id, interaction: z.enum(['equip', 'release']) });
const FaceClip = z.strictObject({ ...time, track: z.literal('face'), actor: id, expression: z.enum(expressions) });
export const audioAsset = z.string().regex(/^(?:builtin:[a-z0-9-]+|asset:[a-zA-Z0-9-]+)$/);
const sound = { asset: audioAsset, volume: num(0, 2), muted: z.boolean(), offset: num(0, 180).default(0) };
export const DialogueClip = z.strictObject({ ...time, ...sound, track: z.literal('dialogue'), actor: id, text: z.string().max(1000), visemes: z.array(z.strictObject({ start: num(0, 180), end: num(0, 180), shape: z.enum(['rest', 'closed', 'bite', 'wide', 'open', 'round', 'pucker', 'tongue']) })).max(3000).optional() });
const AudioClip = z.strictObject({ ...time, ...sound, track: z.literal('audio'), name: z.string().min(1).max(80) });
const MusicClip = z.strictObject({ ...time, ...sound, track: z.literal('music'), name: z.string().min(1).max(80) });
export const CameraShot = z.strictObject({ ...time, track: z.literal('camera'), shot: z.enum(shots), focus: id.optional(), transition: z.enum(['cut', 'glide']) });
const Transition = z.strictObject({ ...time, track: z.literal('transition'), effect: z.enum(['fade-in', 'fade-out', 'dissolve']) });
export const TimelineClip = z.discriminatedUnion('track', [ActorClip, MoveClip, BodyClip, FaceClip, GazeClip, PropClip, DialogueClip, AudioClip, MusicClip, CameraShot, Transition]);
export const TimelineTrack = z.enum(tracks);
export const SceneDefinition = z.strictObject({ id, name: z.string().trim().min(1).max(70), environment: z.enum(environments),
  backgroundImage: imageData.optional(), duration: num(1, 180),
  actors: z.array(Actor).max(24), objects: z.array(SceneObject).max(100), clips: z.array(TimelineClip).max(600) });

function verifyIds(items: { id: string }[], ctx: z.RefinementCtx, path: (string | number)[]) {
  if (new Set(items.map(item => item.id)).size !== items.length) ctx.addIssue({ code: 'custom', path, message: 'Duplicate IDs' });
}
export const scriptTypes = ['scene-heading', 'action', 'character', 'dialogue', 'parenthetical', 'transition', 'shot', 'note', 'section', 'production'] as const;
export const creativeStatuses = ['proposed', 'approved', 'locked', 'superseded'] as const;
const brief = z.string().max(500);
const title = z.string().trim().min(1).max(100);
const decision = z.enum(creativeStatuses);
export const storyProfile = z.strictObject({
  title, logline: brief, synopsis: z.string().max(4000), genre: brief, tone: brief, theme: brief,
  audience: brief, visualStyle: brief, targetMinutes: num(1, 90)
});
export const storyCharacter = z.strictObject({
  characterId: id, description: brief, personality: brief, motivation: brief, relationships: brief,
  speakingStyle: brief, voice: z.enum(['warm', 'bright', 'deep']), mannerisms: brief, status: decision
});
export const storyScene = z.strictObject({
  id, title, location: brief, environment: z.enum(environments), cast: z.array(id).max(24),
  summary: brief, purpose: brief, seconds: num(1, 180), continuity: brief, requirements: brief,
  act: brief, sequence: brief, status: decision
});
export const storyWorld = z.strictObject({ id, name: title, environment: z.enum(environments), description: brief,
  atmosphere: brief, layout: brief, status: decision });
export const StoryBibleSchema = z.strictObject({
  profile: storyProfile, status: decision, characters: z.array(storyCharacter).max(80),
  worlds: z.array(storyWorld).max(30), scenes: z.array(storyScene).max(30)
});
const cueTime = { id: id.optional(), seconds: num(.1, 60).default(1), delay: num(0, 60).default(0), parallel: z.boolean().default(false) };
export const builtinVoiceNames = ['zee-spicy', 'sbu-food', 'zee-safe', 'sbu-lunch', 'sbu-receipt'] as const;
export const soundNames = ['ding', 'pop', 'sting', 'whoosh', 'rimshot'] as const;
export const Direction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('move'), ...cueTime, actor: id, x: position.x, y: position.y.optional(), gait: z.enum(['walk', 'run']) }),
  z.strictObject({ kind: z.literal('action'), ...cueTime, actor: id, action: z.enum(actions), layer: z.enum(['body', 'gesture']), target: id.optional() }),
  z.strictObject({ kind: z.literal('expression'), ...cueTime, actor: id, expression: z.enum(expressions) }),
  z.strictObject({ kind: z.literal('gaze'), ...cueTime, actor: id, target: id }),
  z.strictObject({ kind: z.literal('prop'), ...cueTime, actor: id, target: id, interaction: z.enum(['equip', 'release']) }),
  z.strictObject({ kind: z.literal('presence'), ...cueTime, actor: id, visible: z.boolean() }),
  z.strictObject({ kind: z.literal('camera'), ...cueTime, shot: z.enum(shots), actor: id.optional(), transition: z.enum(['cut', 'glide']) }),
  z.strictObject({ kind: z.literal('sound'), ...cueTime, sound: z.enum(soundNames) }),
  z.strictObject({ kind: z.literal('transition'), ...cueTime, effect: z.enum(['fade-in', 'fade-out', 'dissolve']) }),
  z.strictObject({ kind: z.literal('pause'), ...cueTime })
]);
export const ScriptElement = z.strictObject({ id, type: z.enum(scriptTypes), text: z.string().max(400),
  characterId: id.optional(), directions: z.array(Direction).max(12) });
export const ScriptScene = z.strictObject({ id, title, environment: z.enum(environments), cast: z.array(id).max(24),
  setsFrom: id.optional(), continues: z.boolean().default(false), elements: z.array(ScriptElement).min(1).max(150) });
export const ScreenplaySchema = z.strictObject({ scenes: z.array(ScriptScene).max(30) });
const clipSnapshot = z.string().max(2500).refine(value => {
  try { return TimelineClip.safeParse(JSON.parse(value)).success; } catch { return false; }
}, 'Invalid timeline snapshot');
const eventSource = z.strictObject({ line: id, beat: id, shot: id.optional(), signature: clipSnapshot, voice: z.enum(['warm', 'bright', 'deep']).optional() });
export const ProductionSchema = z.strictObject({
  bible: StoryBibleSchema, screenplay: ScreenplaySchema,
  scriptStatus: z.enum(['draft', 'approved']),
  versions: z.array(z.strictObject({ id, date: z.number(), screenplay: ScreenplaySchema })).max(3),
  conversation: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), text: z.string().max(6000) })).max(24),
  graph: z.array(z.strictObject({ sceneId: id, signature: z.string().max(120), entry: z.string().max(120), exit: z.string().max(48000),
    events: z.record(id, eventSource), locked: z.array(id).max(600), diagnostics: z.array(brief).max(150) })).max(30)
});
export type DirectionData = z.infer<typeof Direction>;
export type ScriptLine = z.infer<typeof ScriptElement>;
export type ScriptSceneData = z.infer<typeof ScriptScene>;
export type Production = z.infer<typeof ProductionSchema>;
export type StoryBible = z.infer<typeof StoryBibleSchema>;
export type StoryScene = z.infer<typeof storyScene>;

export const ProjectDocument = z.strictObject({ version: z.literal(1), id, name: z.string().trim().min(1).max(100), characters: z.array(CharacterDefinition).max(80), production: ProductionSchema.optional(), scenes: z.array(SceneDefinition).min(1).max(30) }).superRefine((project, ctx) => {
  verifyIds(project.characters, ctx, ['characters']);
  verifyIds(project.scenes, ctx, ['scenes']);
  const characters = new Set(project.characters.map(character => character.id));
  if (project.production) {
    const { bible, screenplay, graph } = project.production;
    verifyIds(bible.scenes, ctx, ['production', 'bible', 'scenes']);
    verifyIds(bible.worlds, ctx, ['production', 'bible', 'worlds']);
    verifyIds(screenplay.scenes, ctx, ['production', 'screenplay', 'scenes']);
    verifyIds(screenplay.scenes.flatMap(scene => scene.elements), ctx, ['production', 'screenplay', 'elements']);
    verifyIds(graph.map(scene => ({ id: scene.sceneId })), ctx, ['production', 'graph']);
  }
  const embeddedImageBytes = project.scenes.reduce((sum, scene) =>
    sum + (scene.backgroundImage?.length ?? 0) + scene.objects.reduce((n, obj) => n + (obj.imageData?.length ?? 0), 0), 0);
  if (embeddedImageBytes > 780_000) ctx.addIssue({ code: 'custom', path: ['scenes'], message: 'Image budget exceeded. Use smaller or fewer images in this project.' });
  project.scenes.forEach((scene, index) => {
    const path = ['scenes', index];
    verifyIds([...scene.actors, ...scene.objects, ...scene.clips], ctx, path);
    const actors = new Set(scene.actors.map(actor => actor.id));
    const objects = new Set(scene.objects.map(object => object.id));
    if (scene.actors.some(actor => !characters.has(actor.characterId))) ctx.addIssue({ code: 'custom', path, message: 'Actor refers to a missing character' });
    for (const actor of scene.actors) if (actor.gazeTarget && actor.gazeTarget !== 'camera' && !actors.has(actor.gazeTarget) && !objects.has(actor.gazeTarget))
      ctx.addIssue({ code: 'custom', path: [...path, 'actors', actor.id, 'gazeTarget'], message: 'Gaze target was removed' });
    for (const clip of scene.clips) {
      const targetValid = !('target' in clip) || !clip.target ||
        (clip.track === 'gaze' ? clip.target === 'camera' || actors.has(clip.target) || objects.has(clip.target) : objects.has(clip.target));
      const clipPath = [...path, 'clips', clip.id];
      if (clip.start + clip.length > scene.duration + .0001) ctx.addIssue({ code: 'custom', path: clipPath, message: 'Clip is outside the scene' });
      if (clip.track === 'movement' && clip.keyframes) {
        const keys = clip.keyframes;
        if (keys[0].time !== 0 || keys[keys.length - 1].time !== 1 || keys.some((key, i) => i > 0 && key.time <= keys[i - 1].time))
          ctx.addIssue({ code: 'custom', path: [...clipPath, 'keyframes'], message: 'Movement keyframes must begin at 0, end at 1 and have strictly increasing times' });
      }
      if ('actor' in clip && !actors.has(clip.actor)) ctx.addIssue({ code: 'custom', path: clipPath, message: 'Clip refers to a missing actor' });
      if (!targetValid) ctx.addIssue({ code: 'custom', path: clipPath, message: 'Clip refers to a missing target' });
      if ('focus' in clip && clip.focus && !actors.has(clip.focus)) ctx.addIssue({ code: 'custom', path: clipPath, message: 'Camera shot has unknown focus' });
    }
  });
});

export type View = z.infer<typeof CharacterView>;
export type Character = z.infer<typeof CharacterDefinition>;
export type ActorData = z.infer<typeof Actor>;
export type Prop = z.infer<typeof SceneObject>;
export type Anchor = z.infer<typeof InteractionAnchor>;
export type Clip = z.infer<typeof TimelineClip>;
export type Track = z.infer<typeof TimelineTrack>;
export type Scene = z.infer<typeof SceneDefinition>;
export type Project = z.infer<typeof ProjectDocument>;
export type Action = typeof actions[number];
export type Expression = typeof expressions[number];
export type JointName = typeof joints[number];
export type JointPose = Partial<Record<JointName, number>>;
export type Animation = z.infer<typeof AnimationClip>;
export type SoundClip = Extract<Clip, { track: 'audio' | 'music' | 'dialogue' }>;
export const uid = () => crypto.randomUUID();
export const label = (value: string) => ({ 'close-up': 'Close-up', 'two-shot': 'Two-shot', 'three-quarter': 'Front three-quarter', 'back-quarter': 'Back three-quarter', stand: 'Stand up', shake: 'Shake head', talk: 'Talking idle', listen: 'Listening', think: 'Thinking', angry: 'Angry', surprise: 'Surprised' })[value] ?? value.replaceAll('-', ' ').replace(/^./, first => first.toUpperCase());
export const shotLabel = (shot: string) => shot === 'close-up' || shot === 'two-shot' ? label(shot) : `${label(shot)} shot`;

/** Accept historical unversioned/v0 project data without modifying the stored original. */
export function parseStoredProject(raw: unknown): Project {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const document = raw as Record<string, unknown>;
    if (document.version === undefined || document.version === 0)
      return ProjectDocument.parse({ ...document, version: 1 });
  }
  return ProjectDocument.parse(raw);
}
