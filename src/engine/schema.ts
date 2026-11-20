import { z } from 'zod';

export const WIDTH = 960;
export const HEIGHT = 540;
export const views = ['front', 'three-quarter', 'side', 'back-quarter', 'back'] as const;
export const expressions = ['neutral', 'happy', 'angry', 'surprised', 'sad', 'thinking'] as const;
export const actions = ['idle', 'walk', 'run', 'stop', 'turn', 'jump', 'sit', 'stand', 'wave', 'point', 'nod', 'shake', 'shrug', 'laugh', 'cry', 'angry', 'surprise', 'celebrate', 'talk', 'listen', 'think'] as const;
export const shots = ['wide', 'medium', 'close-up', 'two-shot', 'front', 'side', 'back', 'follow'] as const;
export const environments = ['Living room', 'Classroom', 'Township street', 'Podcast studio'] as const;
export const props = ['sofa', 'chair', 'table', 'desk', 'door', 'window', 'television', 'lamp', 'cup', 'book', 'phone', 'plant', 'microphone', 'streetlight', 'counter'] as const;
export const tracks = ['actors', 'movement', 'body', 'face', 'dialogue', 'audio', 'camera', 'transition'] as const;
export const trackNames = { actors: 'Actors', movement: 'Movement', body: 'Actions', face: 'Expressions', dialogue: 'Dialogue', audio: 'Sound', camera: 'Camera', transition: 'Transitions' };
const id = z.string().min(1).max(100);
const color = z.string().regex(/^#[\da-f]{6}$/i);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const position = { x: num(-2000, 3000), y: num(-2000, 3000), scale: num(.2, 4), rotation: num(-360, 360), depth: num(-1000, 1000) };
export const CharacterView = z.enum(views);
export const CharacterDefinition = z.strictObject({
  id, name: z.string().trim().min(1).max(60), skin: color, shirt: color, pants: color, hairColor: color, shoes: color,
  height: num(.75, 1.3), head: num(.75, 1.35), torso: num(.75, 1.3), arms: num(.75, 1.3), legs: num(.75, 1.3), thickness: num(.65, 1.45), eyeSpacing: num(.65, 1.4),
  shape: z.enum(['round', 'oval', 'square']), eyes: z.enum(['round', 'relaxed', 'wide']), brows: z.enum(['arched', 'straight', 'bold']),
  nose: z.enum(['button', 'long', 'flat']), mouth: z.enum(['smile', 'line', 'full']), ears: z.enum(['round', 'small', 'wide']),
  hair: z.enum(['fade', 'puff', 'locs', 'buzz', 'bald']), beard: z.enum(['none', 'goatee', 'full']), hat: z.enum(['none', 'cap', 'beanie']),
  glasses: z.boolean(), earrings: z.boolean(), outfit: z.enum(['tee', 'hoodie', 'jacket']), accessory: z.enum(['none', 'chain', 'scarf'])
});
export const SceneObject = z.strictObject({ id, kind: z.enum(props), name: z.string().min(1).max(60), color, ...position });
export const Actor = z.strictObject({ id, characterId: id, ...position, view: CharacterView, flip: z.boolean(), expression: z.enum(expressions) });
export const InteractionAnchor = z.strictObject({ x: num(-1000, 1000), y: num(-1000, 1000), action: z.enum(['sit', 'hold', 'open']), facing: CharacterView.optional() });
export const joints = ['root', 'hips', 'torso', 'neck', 'head', 'leftShoulder', 'leftElbow', 'leftWrist', 'leftHand', 'rightShoulder', 'rightElbow', 'rightWrist', 'rightHand', 'leftHip', 'leftKnee', 'leftAnkle', 'leftFoot', 'rightHip', 'rightKnee', 'rightAnkle', 'rightFoot'] as const;
export const Joint = z.enum(joints);
export const SkeletonDefinition = z.record(Joint, Joint.nullable());
export const AnimationClip = z.strictObject({ id: z.enum(actions), duration: num(.1, 60), loop: z.boolean(), keys: z.array(z.strictObject({ time: num(0, 1), pose: z.partialRecord(Joint, z.number().finite()), lift: z.number().finite().optional() })).min(2), expression: z.enum(expressions).optional(), views: z.array(CharacterView).optional() });
const time = { id, start: num(0, 180), length: num(.1, 180) };
const ActorClip = z.strictObject({ ...time, track: z.literal('actors'), actor: id });
const MoveClip = z.strictObject({ ...time, track: z.literal('movement'), actor: id, fromX: position.x, fromY: position.y, toX: position.x, toY: position.y });
const BodyClip = z.strictObject({ ...time, track: z.literal('body'), actor: id, action: z.enum(actions), layer: z.enum(['body', 'gesture']), target: id.optional() });
const FaceClip = z.strictObject({ ...time, track: z.literal('face'), actor: id, expression: z.enum(expressions) });
export const audioAsset = z.string().regex(/^(?:builtin:[a-z0-9-]+|asset:[a-zA-Z0-9-]+)$/);
const sound = { asset: audioAsset, volume: num(0, 2), muted: z.boolean(), offset: num(0, 180).default(0) };
export const DialogueClip = z.strictObject({ ...time, ...sound, track: z.literal('dialogue'), actor: id, text: z.string().max(1000) });
const AudioClip = z.strictObject({ ...time, ...sound, track: z.literal('audio'), name: z.string().min(1).max(80) });
export const CameraShot = z.strictObject({ ...time, track: z.literal('camera'), shot: z.enum(shots), focus: id.optional(), transition: z.enum(['cut', 'glide']) });
const Transition = z.strictObject({ ...time, track: z.literal('transition'), effect: z.enum(['fade-in', 'fade-out']) });
export const TimelineClip = z.discriminatedUnion('track', [ActorClip, MoveClip, BodyClip, FaceClip, DialogueClip, AudioClip, CameraShot, Transition]);
export const TimelineTrack = z.enum(tracks);
export const SceneDefinition = z.strictObject({ id, name: z.string().trim().min(1).max(70), environment: z.enum(environments), duration: num(1, 180), actors: z.array(Actor).max(24), objects: z.array(SceneObject).max(100), clips: z.array(TimelineClip).max(600) });

function verifyIds(items: { id: string }[], ctx: z.RefinementCtx, path: (string | number)[]) {
  if (new Set(items.map(item => item.id)).size !== items.length) ctx.addIssue({ code: 'custom', path, message: 'Duplicate IDs' });
}
export const ProjectDocument = z.strictObject({ version: z.literal(1), id, name: z.string().trim().min(1).max(100), characters: z.array(CharacterDefinition).max(80), scenes: z.array(SceneDefinition).min(1).max(30) }).superRefine((project, ctx) => {
  verifyIds(project.characters, ctx, ['characters']);
  verifyIds(project.scenes, ctx, ['scenes']);
  const characters = new Set(project.characters.map(character => character.id));
  project.scenes.forEach((scene, index) => {
    const path = ['scenes', index];
    verifyIds([...scene.actors, ...scene.objects, ...scene.clips], ctx, path);
    const actors = new Set(scene.actors.map(actor => actor.id));
    const objects = new Set(scene.objects.map(object => object.id));
    if (scene.actors.some(actor => !characters.has(actor.characterId))) ctx.addIssue({ code: 'custom', path, message: 'Actor refers to a missing character' });
    for (const clip of scene.clips) {
      if (clip.start + clip.length > scene.duration + .0001 || ('actor' in clip && !actors.has(clip.actor)) || ('target' in clip && clip.target && !objects.has(clip.target)) || ('focus' in clip && clip.focus && !actors.has(clip.focus))) {
        ctx.addIssue({ code: 'custom', path: [...path, 'clips', clip.id], message: 'Clip is outside the scene or has a missing target' });
      }
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
export type SoundClip = Extract<Clip, { track: 'audio' | 'dialogue' }>;
export const uid = () => crypto.randomUUID();
export const label = (value: string) => value.replaceAll('-', ' ').replace(/^./, first => first.toUpperCase());
