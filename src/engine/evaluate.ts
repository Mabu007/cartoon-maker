import { animations, blend, clamp, ease, mix, sample, viewForward, travelProgress, motionBlend, turnHeadScale } from './animation.ts';
import { anchorFor } from './interactions.ts';
import { audibleAudioTrack } from './audioMix.ts';
import { effectiveCues } from './dspLipSync.ts';
import { sampleViseme, sampleTimedViseme, type Viseme } from './visemes.ts';
import { HEIGHT, WIDTH, views, type Action, type ActorData, type Clip, type Expression, type JointPose, type Prop, type Scene, type SoundClip, type View } from './schema.ts';

export type CharacterState = ActorData & { pose: JointPose; lift: number; visible: boolean; expression: Expression; action: Action;
  speaking: boolean; actionTime: number; locomotion: Action; gaitTime: number; gaitVelocity?: number;
  gaitWeight:number; turnScale:number; listening?:boolean; viseme?: { shape: Viseme; weight: number; from?:Viseme; blend?:number };
  focus?: { x: number; y: number }; held?: Prop };
export type CameraState = { x: number; y: number; zoom: number; view?: View };
const active = (clip: Clip, time: number) => clip.start <= time && time < clip.start + clip.length;
const latest = <T extends Clip>(clips: T[]) => clips.reduce<T | undefined>((found, clip) => !found || found.start <= clip.start ? clip : found, undefined);
const frameWeight = (clip: Clip, t: number) => ease(clamp(Math.min((t - clip.start) / .16, (clip.start + clip.length - t) / .15)));
/** Pure deterministic sampler shared by preview, props and imported JSON playback. */
export function movementPosition(clip: Extract<Clip, { track: 'movement' }>, progress: number): { x: number; y: number } {
  const t = clamp(progress);
  const keys = clip.keyframes;
  if (!keys) {
    const weight = clip.gait ? travelProgress(t) : ease(t);
    return { x: mix(clip.fromX, clip.toX, weight), y: mix(clip.fromY, clip.toY, weight) };
  }
  const rightIndex = keys.findIndex(key => key.time >= t);
  const right = keys[Math.max(1, rightIndex < 0 ? keys.length - 1 : rightIndex)];
  const left = keys[Math.max(0, (rightIndex < 0 ? keys.length - 1 : rightIndex) - 1)];
  const weight = clamp((t - left.time) / Math.max(1e-9, right.time - left.time));
  return { x: mix(left.x, right.x, weight), y: mix(left.y, right.y, weight) };
}
export function evaluate(scene: Scene, time: number) {
  const t = clamp(time, 0, Math.max(0, scene.duration - .000001));
  const timelineClips = scene.clips.filter(clip => !scene.trackSettings?.[clip.track]?.muted);
  const sounds = timelineClips.filter((clip): clip is SoundClip => (clip.track === 'audio' || clip.track === 'music' || clip.track === 'dialogue') && audibleAudioTrack(scene,clip.track) && active(clip, t));
  // Index timeline clips once rather than repeatedly scanning all 600 clips
  // for each actor on every animation frame. Preserve clip iteration order.
  const byActor=new Map<string,Clip[]>();
  for(const clip of timelineClips){
    if(!('actor' in clip))continue;
    const group=byActor.get(clip.actor);
    if(group)group.push(clip);else byActor.set(clip.actor,[clip]);
  }
  const objectsById=new Map(scene.objects.map(object=>[object.id,object]));
  const actors = scene.actors.map((actor): CharacterState => {
    const clips = byActor.get(actor.id)??[];
    const presence = clips.filter(clip => clip.track === 'actors' && clip.visible === undefined);
    const entrance = latest(clips.filter(clip => clip.track === 'actors' && clip.visible !== undefined && clip.start <= t));
    const propCue = latest(clips.filter(clip => clip.track === 'props' && clip.start <= t));
    const gaze = latest(clips.filter(clip => clip.track === 'gaze' && active(clip, t)));
    const movement = latest(clips.filter((clip): clip is Extract<Clip, { track: 'movement' }> => clip.track === 'movement' && clip.start <= t));
    const progress = movement ? clamp((t - movement.start) / movement.length) : 0;
    const position = movement ? movementPosition(movement, progress) : actor;
    let x = position.x;
    let y = position.y;
    const travelling = movement && active(movement, t) ? movement : undefined;
    const direction = movement && movement.fromX !== movement.toX ? Math.sign(movement.toX - movement.fromX) : undefined;
    let flip = direction ? direction !== viewForward(actor.view) : actor.flip;
    let view = actor.view;
    const body = latest(clips.filter((clip): clip is Extract<Clip, { track: 'body' }> => clip.track === 'body' && clip.layer === 'body' && active(clip, t)));
    const gesture = latest(clips.filter((clip): clip is Extract<Clip, { track: 'body' }> => clip.track === 'body' && clip.layer === 'gesture' && active(clip, t)));
    const idle = sample(animations.idle, t);
    let { pose, lift } = idle;
    let expression = actor.expression;
    let held: Prop | undefined;
    const locomotion: Action = body?.action ?? travelling?.gait ?? (travelling ? 'walk' : 'idle');
    let action: Action = locomotion;
    const gaitTime = t - (travelling?.start ?? body?.start ?? t);
    const gaitVelocity = travelling ? (() => {
      // Finite difference samples the actual authored path, including user
      // keyframes and the same ease ramp used by visual position.
      const sampleWindow=.001;
      const p1=movementPosition(travelling,clamp(progress+sampleWindow));
      const p0=movementPosition(travelling,clamp(progress-sampleWindow));
      const delta=Math.max(.00001,(clamp(progress+sampleWindow)-clamp(progress-sampleWindow))*travelling.length);
      return Math.hypot(p1.x-p0.x,p1.y-p0.y)/delta/actor.scale;
    })() : undefined;
    const gaitWeight = travelling ? motionBlend(t,travelling.start,travelling.length) : 1;
    const turnScale = body?.action==='turn' ? turnHeadScale((t-body.start)/body.length) : 1;
    if (travelling && (view === 'front' || view === 'back') && direction && (locomotion === 'walk' || locomotion === 'run')) {
      view = view === 'front' ? 'side' : 'back-quarter';
      flip = direction !== viewForward(view);
    }
    if (!body && (locomotion === 'walk' || locomotion === 'run')) {
      const step=sample(animations[locomotion],gaitTime);
      pose=blend(idle.pose,step.pose,gaitWeight);
      lift=mix(idle.lift,step.lift,gaitWeight);
    }
    for (const clip of [body, gesture]) {
      if (!clip) continue;
      const isGesture = clip.layer === 'gesture';
      const target = clip.target ? objectsById.get(clip.target) : undefined;
      const supported = clip.action !== 'sit' || (target && anchorFor(target)?.action === 'sit');
      const activeAction: Action = supported ? clip.action : 'stand';
      const definition = animations[activeAction];
      if (!isGesture) action = activeAction;
      else if (['talk', 'laugh', 'cry', 'point', 'wave', 'celebrate', 'hand-on-hip', 'hand-to-face', 'hand-to-pocket', 'fist', 'open-hand', 'blink', 'look-away'].includes(activeAction)) action = activeAction;
      const supportedSitBefore = clips.some(previous =>
        previous.track === 'body' && previous.action === 'sit' && previous.layer === 'body' &&
        previous.start + previous.length <= clip.start + .05 &&
        previous.target && objectsById.has(previous.target) &&
        anchorFor(objectsById.get(previous.target)!)?.action==='sit');
      // A replacement Stand action must immediately put the feet on the floor,
      // not replay the seated opening pose for the first 0.8 seconds.
      const offsets = (activeAction === 'sit' && clip.start === 0) ||
        (activeAction === 'stand' && !supportedSitBefore) ? definition.duration : 0;
      const next = sample(definition, !isGesture && (activeAction === 'walk' || activeAction === 'run') ? gaitTime : t - clip.start + offsets);
      const weight = activeAction === 'sit' || activeAction === 'stand' ? 1 : frameWeight(clip, t);
      pose = blend(pose, next.pose, weight, isGesture);
      if (!isGesture) lift = mix(lift, next.lift, weight);
      if (definition.expression) expression = definition.expression;
      if (clip.action === 'turn') {
        const progression = (t - clip.start) / clip.length;
        view = progression > .66 ? actor.view : progression > .33 ? 'side' : views[Math.max(0, views.indexOf(actor.view) - 1)];
        flip = progression > .66 ? !flip : flip;
      }
      const object = target;
      const anchor = object && anchorFor(object);
      if (object && anchor?.action === 'sit' && activeAction === 'sit') {
        const amount = clip.start === 0 ? 1 : ease(clamp((t - clip.start) / .65));
        const angle = object.rotation * Math.PI / 180;
        x = mix(x, object.x + (anchor.x * Math.cos(angle) - anchor.y * Math.sin(angle)) * object.scale, amount);
        y = mix(y, object.y + (anchor.x * Math.sin(angle) + anchor.y * Math.cos(angle)) * object.scale + 47 - 47 * actor.scale, amount);
        view = anchor.facing ?? view;
      }
      if (object && anchor?.action === 'hold') held = object;
    }
    const face = latest(clips.filter((clip): clip is Extract<Clip, { track: 'face' }> => clip.track === 'face' && active(clip, t)));
    if (face) expression = face.expression;
    const spoken = latest(sounds.filter((clip):clip is Extract<Clip,{track:'dialogue'}> =>
      clip.track==='dialogue' && clip.actor===actor.id && !clip.muted));
    // sceneTime is derived from Web Audio's currentTime in preview or the frame
    // timestamp in export. A dialogue offset shifts source *audio* time only.
    const audioTime = spoken ? t - spoken.start + spoken.offset : -1;
    const viseme = spoken?.visemes?.length
      ? sampleTimedViseme(spoken.manualVisemes?.length ? effectiveCues(spoken.visemes, spoken.manualVisemes) : spoken.visemes,audioTime)
      : spoken ? sampleViseme(spoken.text,spoken.length,t-spoken.start) : undefined;
    if (propCue?.track === 'props') held = propCue.interaction === 'equip' ? objectsById.get(propCue.target) : undefined;
    return { ...actor, x, y, view, flip, pose, lift, expression, action,
      gazeTarget: gaze?.track === 'gaze' ? gaze.target : actor.gazeTarget,
      speaking: Boolean(spoken), actionTime: action === gesture?.action ? t - gesture.start : t - (body?.start ?? t), locomotion, gaitTime, gaitVelocity, gaitWeight, turnScale, viseme, visible: (entrance?.track === 'actors' ? entrance.visible : undefined) ?? (!presence.length || presence.some(clip => active(clip, t))), held };
  });
  // Directors can explicitly select a gaze target. Without one, the person
  // listening follows the current speaker, and the speaker picks a listener.
  // This evaluation is pure, so exporting frame 240 matches preview frame 240.
  const activeSpeakers = actors.filter(actor => (actor.speaking || actor.action === 'talk') && actor.visible);
  for (const actor of actors) {
    actor.listening = !actor.speaking && activeSpeakers.some(other=>other.id!==actor.id&&other.visible);
    const targetId = actor.gazeTarget;
    if (actor.action === 'look-away') {
      actor.focus = { x: -viewForward(actor.view), y: -.2 };
      continue;
    }
    let focusX: number | undefined, focusY: number | undefined;
    if (targetId === 'camera') {
      actor.focus = { x: 0, y: -.08 };
      continue;
    }
    const targetActor = targetId ? actors.find(item => item.id === targetId && item.visible) : undefined;
    const targetProp = targetId ? objectsById.get(targetId) : undefined;
    const implicit = !targetId && activeSpeakers.length
      ? (activeSpeakers.some(item => item.id === actor.id)
        ? actors.find(item => item.id !== actor.id && item.visible)
        : activeSpeakers.find(item => item.id !== actor.id))
      : undefined;
    const other = targetActor ?? implicit;
    if (other) {
      focusX = other.x;
      focusY = other.y - 150 * other.scale;
    } else if (targetProp) {
      focusX = targetProp.x;
      focusY = targetProp.y - (targetProp.imageHeight ?? 50) * targetProp.scale * .55;
    } else if (actor.held && !targetId && !actor.speaking) {
      focusX = actor.held.x; focusY = actor.held.y;
    }
    if (focusX !== undefined && focusY !== undefined) {
      const deltaX = (focusX - actor.x) * (actor.flip ? -1 : 1);
      const eyeHeight = actor.y - 153 * actor.scale - actor.lift;
      actor.focus = { x: clamp(deltaX / 190, -1, 1), y: clamp((focusY - eyeHeight) / 140, -1, 1) };
    }
  }
  const cameraClips = timelineClips.filter(clip => clip.track === 'camera');
  const cameraClip = latest(cameraClips.filter(clip => active(clip, t)));
  function frame(clip?: typeof cameraClip): CameraState {
    const target = actors.find(actor => actor.id === clip?.focus && actor.visible) ?? actors.find(actor => actor.visible);
    if (!clip || clip.shot === 'wide' || clip.shot === 'establishing' || !target) return { x: WIDTH / 2, y: HEIGHT / 2, zoom: 1 };
    if (clip.shot === 'two-shot') {
      // Frame the focused character and their nearest visible scene partner,
      // not the average of every actor (which could leave both off-camera).
      const partner = actors.filter(actor => actor.visible && actor.id !== target.id)
        .sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x))[0];
      const pair = partner ? [target, partner] : [target];
      const spread = partner ? Math.abs(target.x - partner.x) : 0;
      const zoom = clamp((WIDTH - 180) / (spread + 200), 1, 1.55);
      const mid = pair.reduce((sum, actor) => sum + actor.x, 0) / pair.length;
      const midY = pair.reduce((sum, actor) => sum + actor.y - 120 * actor.scale - actor.lift, 0) / pair.length;
      return { x: clamp(mid, WIDTH / (2 * zoom), WIDTH - WIDTH / (2 * zoom)),
        y: clamp(midY, HEIGHT / (2 * zoom), HEIGHT - HEIGHT / (2 * zoom)), zoom };
    }
    const close = ['close-up', 'reaction', 'extreme-close-up'].includes(clip.shot);
    const zoom = clip.shot === 'extreme-close-up' ? 3.35 : close ? 2.26 : clip.shot === 'over-shoulder' ? 1.95 : clip.shot === 'medium' || clip.shot === 'zoom' ? 1.64 : 1.28;
    const desiredY = target.y - (close ? 157 : 113) * target.scale - target.lift;
    const shoulder = clip.shot === 'over-shoulder' ? actors.find(actor => actor.id !== target.id && actor.visible) : undefined;
    const desiredX = shoulder ? target.x + (shoulder.x - target.x) * .24 : target.x;
    const view = clip.shot === 'front' || clip.shot === 'side' || clip.shot === 'back' ? clip.shot : undefined;
    return { x: clamp(desiredX, WIDTH / (2 * zoom), WIDTH - WIDTH / (2 * zoom)), y: clamp(desiredY, HEIGHT / (2 * zoom), HEIGHT - HEIGHT / (2 * zoom)), zoom, view };
  }
  const previous = frame(cameraClip && latest(cameraClips.filter(clip => clip.start < cameraClip.start)));
  const camera = cameraClip?.shot === 'hold' ? previous : frame(cameraClip);
  if (cameraClip && (cameraClip.transition === 'glide' || ['pan', 'tilt', 'zoom'].includes(cameraClip.shot))) {
    const animating = ['pan', 'tilt', 'zoom'].includes(cameraClip.shot);
    const weight = ease(clamp((t - cameraClip.start) / (animating ? cameraClip.length : .7)));
    camera.x = cameraClip.shot === 'tilt' ? previous.x : mix(previous.x, camera.x, weight);
    camera.y = cameraClip.shot === 'pan' ? previous.y : mix(previous.y, camera.y, weight);
    camera.zoom = cameraClip.shot === 'pan' || cameraClip.shot === 'tilt' ? Math.max(1.28, previous.zoom) : mix(previous.zoom, camera.zoom, weight);
  }
  const transition = latest(timelineClips.filter((clip): clip is Extract<Clip, { track: 'transition' }> => clip.track === 'transition' && active(clip, t)));
  const fade = transition ? clamp((t - transition.start) / transition.length) : 0;
  const objects = scene.objects.map(object => {
    const cue = latest(timelineClips.filter(clip => clip.track === 'props' && clip.target === object.id && clip.start <= t));
    if(cue?.track==='props' && (cue.interaction==='open'||cue.interaction==='close')) {const progress=ease(clamp((t-cue.start)/Math.min(.7,cue.length)));return {...object,doorOpen:cue.interaction==='open'?progress:1-progress};}
    if (cue?.track !== 'props' || cue.interaction !== 'release') return object;
    const owner = scene.actors.find(actor => actor.id === cue.actor);
    const move = latest(timelineClips.filter(clip => clip.track === 'movement' && clip.actor === cue.actor && clip.start <= cue.start));
    if (move?.track !== 'movement') return owner ? { ...object, x: owner.x + 42, y: owner.y - 35 } : object;
    const at = clamp((cue.start - move.start) / move.length);
    const position = movementPosition(move, at);
    return { ...object, x: position.x + 42, y: position.y - 35 };
  });
  return { actors, objects, sounds, camera, shot: cameraClip?.shot ?? 'wide', fade: transition?.effect === 'fade-in' ? 1 - fade : fade };
}
export type SceneState = ReturnType<typeof evaluate>;
export const MOVIE_FRAME_RATE = 30;
export const projectDuration = (scenes: Scene[]) => scenes.reduce((sum, scene) => sum + scene.duration, 0);
export function locate(scenes: Scene[], time: number) {
  let start = 0;
  for (const scene of scenes) {
    if (time < start + scene.duration || scene === scenes.at(-1)) return { scene, local: clamp(time - start, 0, scene.duration), start };
    start += scene.duration;
  }
  throw new Error('A project needs a scene');
}
