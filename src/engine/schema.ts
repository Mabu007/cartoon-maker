import { bodyFrames,armBuilds,legBuilds } from './bodyBuild.ts';
import { dailyProps, extraActions, gaitStyles, transitionNames, vfxNames, soundDurations, type SoundName } from './performanceCatalog.ts';
import { z } from 'zod';
import { characterStyles, seatingStyles, wardrobeStyles } from './characterCatalog.ts';
import { cameraConflicts, normalizeCameraTimeline } from './cameraTimeline.ts';

export const WIDTH = 960;
export const HEIGHT = 540;
export const views = ['front', 'three-quarter', 'side', 'back-quarter', 'back'] as const;
export const expressions = ['neutral', 'happy', 'excited', 'smug', 'confused', 'sleepy', 'angry', 'surprised', 'sad', 'thinking', 'nervous'] as const;
/** High-level performance intentions overlay emotions while keeping the base expression editable. */
export const actingIntents = ['none','suspicious','skeptical','forced-smile','suppress-laugh','hide-anger',
  'holding-back-tears','awkward-silence','silent-judgment','dramatic-realization','sarcastic',
  'embarrassed','intimidate','reassure','lying-nervously','disbelieving','curious',
  'excited-announcement','quiet-disappointment','confident-explanation','uncomfortable'] as const;
export type ActingIntent = typeof actingIntents[number];
export const actions = ['idle', 'walk', 'run', 'stop', 'turn', 'jump', 'sit', 'stand', 'wave', 'point', 'nod', 'shake', 'shrug', 'laugh', 'cry', 'angry', 'surprise', 'celebrate', 'talk', 'listen', 'think', 'lean', 'hand-on-hip', 'hand-to-face', 'hand-to-pocket', 'fist', 'open-hand', 'blink', 'look-away', ...extraActions] as const;
export const shots = ['wide', 'medium', 'close-up', 'two-shot', 'front', 'side', 'back', 'follow', 'extreme-close-up', 'over-shoulder', 'establishing', 'reaction', 'pan', 'tilt', 'zoom', 'hold'] as const;
export const environments = ['Living room', 'Classroom', 'Township street', 'Podcast studio'] as const;
export const props = ['sofa', 'chair', 'table', 'desk', 'door', 'window', 'television', 'lamp', 'cup', 'book', 'phone', 'plant', 'microphone', 'streetlight', 'counter', 'image', ...dailyProps, ...seatingStyles] as const;
export const tracks = ['actors', 'movement', 'body', 'face', 'gaze', 'props', 'dialogue', 'audio', 'music', 'camera', 'transition', 'vfx', 'text'] as const;
export const trackNames = { actors: 'Actors', movement: 'Movement', body: 'Actions', face: 'Expressions', gaze: 'Eye gaze', props: 'Prop cues', dialogue: 'Dialogue', audio: 'SFX', music: 'Music', camera: 'Camera', transition: 'Transitions', vfx: 'VFX', text: 'Text' };
const id = z.string().min(1).max(100);
const color = z.string().regex(/^#[\da-f]{6}$/i);
// Portable WebP thumbnails are embedded in project JSON. A strict budget keeps
// the project within typical browser storage and Firestore document limits.
const r2Image = z.string().regex(/^r2:image:[a-f0-9-]{12,64}$/i);
const imageData = z.union([z.string().regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/).max(320_000),r2Image]);
const propImageData = z.union([z.string().regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/).max(105_000),r2Image]);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const position = { x: num(-2000, 3000), y: num(-2000, 3000), scale: num(.2, 4), rotation: num(-360, 360), depth: num(-1000, 1000) };
export const CharacterView = z.enum(views);
export const VoicePreset = z.enum(['warm','bright','deep']);
export const HostedVoiceId = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.:-]+$/);
export const personalityPresets = ['balanced','confident','shy','nervous','relaxed','hyperactive','funny','serious','arrogant','mysterious','dramatic','grumpy','playful'] as const;
export const signatureMannerisms = ['none','point','touch-chin','rub-hands','shrug','tilt-head','hand-on-hip'] as const;
export const PersonalityDefinition = z.strictObject({
  preset:z.enum(personalityPresets), autoActing:z.enum(['full','subtle','off']), signature:z.enum(signatureMannerisms),
  confidence:num(0,100),expressiveness:num(0,100),energy:num(0,100),sociability:num(0,100),
  nervousness:num(0,100),aggressiveness:num(0,100),playfulness:num(0,100),patience:num(0,100),
  restlessness:num(0,100),emotionalReactivity:num(0,100),gestureFrequency:num(0,100),
  gestureAmplitude:num(0,100),movementSpeed:num(0,100),postureOpenness:num(0,100),
  eyeContact:num(0,100),personalSpace:num(0,100),reactionIntensity:num(0,100),
  movementSmoothness:num(0,100)
}).partial();
export const CharacterDefinition = z.strictObject({
  id, name: z.string().trim().min(1).max(60), skin: color, shirt: color, pants: color, hairColor: color, shoes: color,
  height: num(.75, 1.3), head: num(.75, 1.35), torso: num(.75, 1.3), arms: num(.75, 1.3), legs: num(.75, 1.3), thickness: num(.65, 1.45), eyeSpacing: num(.65, 1.4),
  shape: z.enum(characterStyles.shape), eyes: z.enum(characterStyles.eyes), brows: z.enum(characterStyles.brows),
  nose: z.enum(characterStyles.nose), mouth: z.enum(characterStyles.mouth), ears: z.enum(characterStyles.ears),
  hair: z.enum(characterStyles.hair), beard: z.enum(characterStyles.beard), hat: z.enum(characterStyles.hat),
  glasses: z.boolean(), earrings: z.boolean(), outfit: z.enum(characterStyles.outfit), accessory: z.enum(characterStyles.accessory),
  bodyBuild:z.strictObject({
    frame:z.enum(bodyFrames), arms:z.enum(armBuilds),
    legs:z.enum(legBuilds), chest:num(0,1), hips:num(0,1), abs:z.boolean()
  }).partial().optional(),
  goldTeeth: z.array(z.number().int().min(0).max(5)).max(6).optional(),
  wardrobe: z.strictObject({
    bottoms:z.enum(wardrobeStyles.bottoms), footwear:z.enum(wardrobeStyles.footwear), watch:z.enum(wardrobeStyles.watch),
    bag:z.enum(wardrobeStyles.bag), eyewear:z.enum(wardrobeStyles.eyewear), piercing:z.enum(wardrobeStyles.piercing),
    extra:z.enum(wardrobeStyles.extra), handheld:z.enum(wardrobeStyles.handheld), pattern:z.enum(wardrobeStyles.pattern),
    pupil:z.enum(wardrobeStyles.pupil), piercingSide:z.enum(wardrobeStyles.side), hand:z.enum(['left','right']),
    toothStyle:z.enum(wardrobeStyles.toothStyle), sleeve:z.enum(wardrobeStyles.sleeve),
    neckline:z.enum(wardrobeStyles.neckline), closure:z.enum(wardrobeStyles.closure), hatWear:z.enum(wardrobeStyles.hatWear),
    watchSide:z.enum(wardrobeStyles.side),
    mustache:z.enum(wardrobeStyles.mustache), chinHair:z.enum(wardrobeStyles.chinHair), jawHair:z.enum(wardrobeStyles.jawHair),
    trim:color, sole:color, laces:color, metal:color, accessoryColor:color, iris:color, sclera:color, lens:color, frame:color, lipColor:color,
    patternImage:propImageData, logoImage:propImageData, bagLogo:propImageData, shoeLogo:propImageData,
    patternScale:num(.25,4), patternRotation:num(-180,180), patternOpacity:num(0,1), logoScale:num(.4,2),
    waist:num(.65,1.5), hem:num(-1,1), lensOpacity:num(0,1), rim:num(.5,4), glint:z.boolean(),
    pupilSize:num(.4,1.8), ring:num(0,1), veins:num(0,1), eyelid:num(0,.8), undereye:num(0,1),
    crownWidth:num(.72,1.28), cheekWidth:num(.72,1.28), jawWidth:num(.72,1.28), chinWidth:num(.6,1.4), headStretch:num(.8,1.25),
    browInner:num(-45,45), browOuter:num(-45,45), browBend:num(-1,1), browThickness:num(.5,2), browSpacing:num(-4,4),
    browOffset:num(-6,6), unibrow:z.boolean(), earScale:num(.6,1.5), earTilt:num(0,60), earTip:num(0,1), earlobe:num(.5,1.5),
    noseLength:num(.6,1.6), noseWidth:num(.65,1.5), noseTilt:num(-30,30), noseFlare:num(0,1), noseBlush:num(0,1),
    mouthCurve:num(-1,1), restJaw:num(0,1), lipThickness:num(.5,2), teethIntensity:num(0,1), facialOffset:num(-4,4),
    beardLength:num(.7,1.55), beardWidth:num(.7,1.25), beardFullness:num(.5,1.5), piercingSize:num(.5,1.8), heelHeight:num(.4,1.8),
    hatTilt:num(-45,45), propTilt:num(-90,90), tucked:z.boolean(), socks:z.boolean(), hood:z.boolean(),
  }).partial().optional(),
  personality: PersonalityDefinition.optional(),
  voicePreset: VoicePreset.optional(), hostedVoiceId: HostedVoiceId.optional(),
  mouthRig: z.strictObject({ width: num(.65,1.5), jawScale: num(.6,1.5),
    roundness: num(0,1), asymmetry: num(-1,1) }).optional(),
  missingTeeth: z.array(z.number().int().min(0).max(5)).max(6).optional(),
  toothColors: z.array(color).length(6).optional()
});
export const SceneObject = z.strictObject({ id, kind: z.enum(props), name: z.string().min(1).max(60), color, ...position,
  imageData: propImageData.optional(), imageWidth: num(10, 800).optional(), imageHeight: num(10, 800).optional(),
  interaction: z.enum(['none','sit','hold']).optional(), flip: z.boolean().optional()
});
export const Actor = z.strictObject({ id, characterId: id, ...position, view: CharacterView, flip: z.boolean(), expression: z.enum(expressions), gazeTarget: id.optional() });
export const InteractionAnchor = z.strictObject({ x: num(-1000, 1000), y: num(-1000, 1000), action: z.enum(['sit', 'hold', 'open']), facing: CharacterView.optional() });
export const joints = ['root', 'hips', 'torso', 'neck', 'head', 'leftShoulder', 'leftElbow', 'leftWrist', 'leftHand', 'rightShoulder', 'rightElbow', 'rightWrist', 'rightHand', 'leftHip', 'leftKnee', 'leftAnkle', 'leftFoot', 'rightHip', 'rightKnee', 'rightAnkle', 'rightFoot'] as const;
export const Joint = z.enum(joints);
export const SkeletonDefinition = z.record(Joint, Joint.nullable());
export const AnimationClip = z.strictObject({ id: z.enum(actions), duration: num(.1, 60), loop: z.boolean(), keys: z.array(z.strictObject({ time: num(0, 1), pose: z.partialRecord(Joint, z.number().finite()), lift: z.number().finite().optional() })).min(2), expression: z.enum(expressions).optional(), views: z.array(CharacterView).optional() });
const time = { id, start: num(0, 180), length: num(.1, 180) };
const ActorClip = z.strictObject({ ...time, track: z.literal('actors'), actor: id, visible: z.boolean().optional() });
const MoveClip = z.strictObject({ ...time, track: z.literal('movement'), actor: id, fromX: position.x, fromY: position.y, toX: position.x, toY: position.y, gait: z.enum(['walk', 'run']).optional(), style: z.enum(gaitStyles).optional(),
  /** Optional normalized spatial keys. When present they drive the evaluated path. */
  keyframes: z.array(z.strictObject({ time: num(0, 1), x: position.x, y: position.y })).min(2).max(32).optional() });
/** Sparse sampled performance data shares the existing body timeline lane and actor IDs. */
const CapturedHand = z.enum(['relaxed','loose-open','open','point','count-one','count-two','count-three','pinch','fist','grip','palm-up','palm-out','shrug','self-reference','thumbs-up','count']);
/** Compact validated 2D facial coefficients: expressive data, never camera imagery. */
const CapturedFacialControls = z.strictObject({
  browLeft:num(-1,1),browRight:num(-1,1),browTiltLeft:num(-1,1),browTiltRight:num(-1,1),
  eyeNarrowLeft:num(0,1),eyeNarrowRight:num(0,1),
  blinkLeft:num(0,1),blinkRight:num(0,1),
  eyeWideLeft:num(0,1),eyeWideRight:num(0,1),
  cheekLeft:num(0,1),cheekRight:num(0,1),
  smileLeft:num(0,1),smileRight:num(0,1),
  frownLeft:num(0,1),frownRight:num(0,1),
  lipPress:num(0,1),lipRound:num(0,1),jawTension:num(0,1),noseWrinkle:num(0,1)
});
export const CapturedPoseKey = z.strictObject({
  time:num(0,1),pose:z.partialRecord(Joint,num(-180,180)),
  lift:num(-100,100).optional(),
  hands:z.strictObject({left:CapturedHand,right:CapturedHand}).optional(),
  expression:z.enum(expressions).optional(),
  facial:CapturedFacialControls.optional()
});
const BodyClip = z.strictObject({ ...time, track: z.literal('body'), actor: id, action: z.enum(actions), layer: z.enum(['body', 'gesture']), target: id.optional(), pointAt: z.strictObject({ x: position.x, y: position.y }).optional(),
  performance:z.array(CapturedPoseKey).min(2).max(240).optional(),
  performanceOrigin:z.enum(['mocap','choreography']).optional()
});
const GazeClip = z.strictObject({ ...time, track: z.literal('gaze'), actor: id, target: id });
const PropClip = z.strictObject({ ...time, track: z.literal('props'), actor: id, target: id, interaction: z.enum(['equip', 'release', 'open', 'close']) });
/** Four editable emotion axes; independent from expression and character personality. */
export const EmotionSpaceSchema=z.strictObject({
  valence:num(-1,1).optional(),arousal:num(0,1).optional(),
  dominance:num(0,1).optional(),tension:num(0,1).optional()
});
export type EmotionSpace = z.infer<typeof EmotionSpaceSchema>;
const FaceClip = z.strictObject({ ...time, track: z.literal('face'), actor: id, expression: z.enum(expressions),
  /** Relative facial acting intensity. Optional to preserve legacy projects. */
  intensity: num(0,1.5).optional(),
  /** Optional direction: keeps legacy expression-only clips unchanged. */
  intent:z.enum(actingIntents).optional(),
  emotion:EmotionSpaceSchema.optional() });
export const audioAsset = z.string().regex(/^(?:builtin:[a-z0-9-]+|asset:[a-zA-Z0-9-]+)$/);
const sound = { asset: audioAsset, volume: num(0, 2), muted: z.boolean(), offset: num(0, 180).default(0),
  fadeIn: num(0, 180).optional(), fadeOut: num(0, 180).optional(), loop: z.boolean().optional() };
const mouthCues = z.array(z.strictObject({ start: num(0, 180), end: num(0, 180), shape: z.enum(['rest', 'closed', 'bite', 'wide', 'open', 'round', 'pucker', 'tongue']), strength: num(0, 1).optional() })).max(3000);
export const LipSyncMetadata = z.strictObject({
  source: z.enum(['rhubarb', 'estimated', 'dsp']), engine: z.string().min(1).max(72),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/).optional(), analyzedDuration: num(.1,180)
});
export const DialogueVersion = z.strictObject({ asset: audioAsset, text: z.string().max(1000),
  length: num(.1,180), offset: num(0,180), voicePreset: VoicePreset.optional(), visemes: mouthCues.optional(), manualVisemes: mouthCues.optional(), lipSync: LipSyncMetadata.optional() });
export const DialogueClip = z.strictObject({ ...time, ...sound, track: z.literal('dialogue'), actor: id, text: z.string().max(1000),
  voiceEffect:z.strictObject({pitch:num(-9,9),bass:num(-9,9),clarity:num(-9,9)}).optional(),
  voicePreset: VoicePreset.optional(), versions: z.array(DialogueVersion).max(5).optional(), visemes: mouthCues.optional(), manualVisemes: mouthCues.optional(), lipSync: LipSyncMetadata.optional() });
const AudioClip = z.strictObject({ ...time, ...sound, track: z.literal('audio'), name: z.string().min(1).max(80) });
const MusicClip = z.strictObject({ ...time, ...sound, track: z.literal('music'), name: z.string().min(1).max(80) });
export const CameraShot = z.strictObject({ ...time, track: z.literal('camera'), shot: z.enum(shots), focus: id.optional(), transition: z.enum(['cut', 'glide']) });
const Transition = z.strictObject({ ...time, track: z.literal('transition'), effect: z.enum(transitionNames) });
const VfxClip = z.strictObject({ ...time, track:z.literal('vfx'), effect:z.enum(vfxNames), x:position.x, y:position.y, strength:num(.1,2) });
const TextClip = z.strictObject({ ...time, track:z.literal('text'), text:z.string().trim().min(1).max(180), x:position.x, y:position.y,
  size:num(12,120), color, style:z.enum(['caption','title','comic']) });
export const TimelineClip = z.discriminatedUnion('track', [ActorClip, MoveClip, BodyClip, FaceClip, GazeClip, PropClip, DialogueClip, AudioClip, MusicClip, CameraShot, Transition, VfxClip, TextClip]);
export const TimelineTrack = z.enum(tracks);
export const TimelineMarker = z.strictObject({ id, name: z.string().trim().min(1).max(60), time: num(0, 180) });
export const TimelineTrackSettings = z.strictObject({ muted: z.boolean().optional(), solo: z.boolean().optional(), locked: z.boolean().optional(), collapsed: z.boolean().optional() });
export const SceneDefinition = z.strictObject({ id, name: z.string().trim().min(1).max(70), environment: z.enum(environments),
  layersManual:z.boolean().optional(),
  markers: z.array(TimelineMarker).max(60).optional(), trackSettings: z.partialRecord(TimelineTrack, TimelineTrackSettings).optional(),
  backgroundImage: imageData.optional(), backgroundTransform: z.strictObject({x:num(-2000,3000),y:num(-2000,3000),scale:num(.2,4)}).optional(), duration: num(1, 180),
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
export const soundNames = Object.keys(soundDurations) as SoundName[];
export const Direction = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('move'), ...cueTime, actor: id, x: position.x, y: position.y.optional(), gait: z.enum(['walk', 'run']) }),
  z.strictObject({ kind: z.literal('action'), ...cueTime, actor: id, action: z.enum(actions), layer: z.enum(['body', 'gesture']), target: id.optional() }),
  z.strictObject({ kind: z.literal('expression'), ...cueTime, actor: id, expression: z.enum(expressions) }),
  z.strictObject({ kind: z.literal('gaze'), ...cueTime, actor: id, target: id }),
  z.strictObject({ kind: z.literal('prop'), ...cueTime, actor: id, target: id, interaction: z.enum(['equip', 'release']) }),
  z.strictObject({ kind: z.literal('presence'), ...cueTime, actor: id, visible: z.boolean() }),
  z.strictObject({ kind: z.literal('camera'), ...cueTime, shot: z.enum(shots), actor: id.optional(), transition: z.enum(['cut', 'glide']) }),
  z.strictObject({ kind: z.literal('sound'), ...cueTime, sound: z.enum(soundNames) }),
  z.strictObject({ kind: z.literal('transition'), ...cueTime, effect: z.enum(transitionNames) }),
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

const imageBudget = 32_000_000;
const imageBudgetMessage = 'Movie artwork exceeds the storage budget. Use smaller images or remove unused images.';
const sceneImageSize = (scene: Scene) => (scene.backgroundImage?.length ?? 0) +
  scene.objects.reduce((size, object) => size + (object.imageData?.length ?? 0), 0);

function verifySceneRelationships(scene: Scene, characters: ReadonlySet<string>, ctx: z.RefinementCtx, path: (string | number)[]) {
  for (const message of cameraConflicts(scene.clips))
    ctx.addIssue({ code: 'custom', path: [...path, 'clips'], message });
  verifyIds([...scene.actors, ...scene.objects, ...scene.clips, ...(scene.markers ?? [])], ctx, path);
  for (const [markerIndex, marker] of (scene.markers ?? []).entries())
    if (marker.time > scene.duration) ctx.addIssue({ code: 'custom', path: [...path, 'markers', markerIndex, 'time'], message: 'Marker exceeds scene duration' });
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
    if(clip.track==='body' && clip.performance?.length) {
      const keys=clip.performance;
      if(keys[0].time!==0||keys[keys.length-1].time!==1||
         keys.some((key,i)=>i>0&&key.time<=keys[i-1].time))
        ctx.addIssue({code:'custom',path:[...clipPath,'performance'],message:'Captured pose keys must begin at 0, end at 1 and have strictly increasing times'});
    }
    if(clip.track==='dialogue') for(const cues of [clip.visemes,clip.manualVisemes,...(clip.versions??[]).flatMap(version=>[version.visemes,version.manualVisemes])]) {
      if(cues?.some((cue,index)=>cue.end<=cue.start || index>0&&cue.start<cues[index-1].end-.00001))
        ctx.addIssue({code:'custom',path:clipPath,message:'Mouth cues must have positive duration and be ordered without overlaps'});
    }
    if ('actor' in clip && !actors.has(clip.actor)) ctx.addIssue({ code: 'custom', path: clipPath, message: 'Clip refers to a missing actor' });
    if (!targetValid) ctx.addIssue({ code: 'custom', path: clipPath, message: 'Clip refers to a missing target' });
    if ('focus' in clip && clip.focus && !actors.has(clip.focus)) ctx.addIssue({ code: 'custom', path: clipPath, message: 'Camera shot has unknown focus' });
  }
}

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
  if (project.scenes.reduce((size, scene) => size + sceneImageSize(scene), 0) > imageBudget)
    ctx.addIssue({ code: 'custom', path: ['scenes'], message: imageBudgetMessage });
  project.scenes.forEach((scene, index) => verifySceneRelationships(scene, characters, ctx, ['scenes', index]));
});

export function parseEditedScene(project: Project, previous: Scene, next: Scene) {
  const characters = new Set(project.characters.map(character => character.id));
  return SceneDefinition.superRefine((scene, ctx) => {
    verifySceneRelationships(scene, characters, ctx, []);
    const combined = project.scenes.reduce((size, item) => size + sceneImageSize(item.id === previous.id ? scene : item), 0);
    if (combined > imageBudget) ctx.addIssue({ code: 'custom', message: imageBudgetMessage });
  }).parse(next);
}


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
export const label = (value: string) => ({ 'close-up': 'Close-up', 'two-shot': 'Two-shot', 'three-quarter': 'Front three-quarter', 'back-quarter': 'Back three-quarter', stand: 'Stand up', shake: 'Shake head', talk: 'Talking idle', listen: 'Listening', think: 'Thinking', angry: 'Angry', surprise: 'Surprised', 'sleep-seated':'Sleep seated', sleep:'Sleep lying down', 'throw-prop':'Throw prop', 'phone-call':'Phone call', 'cartoon-stab':'Cartoon stab', 'foam-dagger':'Foam dagger' })[value] ?? value.replaceAll('-', ' ').replace(/^./, first => first.toUpperCase());
export const shotLabel = (shot: string) => shot === 'close-up' || shot === 'two-shot' ? label(shot) : `${label(shot)} shot`;

/** Accept historical unversioned/v0 project data without modifying the stored original. */
export function parseStoredProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return ProjectDocument.parse(raw);
  const document = raw as Record<string, unknown>;
  const versioned = document.version === undefined || document.version === 0
    ? { ...document, version: 1 } : document;
  // Migration applies only on persistent file/device/cloud reads; normal
  // edits and pasted JSON use strict ProjectDocument validation.
  const scenes = Array.isArray(versioned.scenes) ? versioned.scenes.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const scene = value as Scene;
    if (!Array.isArray(scene.clips)) return value;
    return normalizeCameraTimeline(scene);
  }) : versioned.scenes;
  return ProjectDocument.parse({ ...versioned, scenes });
}
