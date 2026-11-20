import { animations, blend, clamp, ease, mix, sample } from './animation.ts';
import { anchors } from './presets.ts';
import { HEIGHT, WIDTH, views, type Action, type ActorData, type Clip, type Expression, type JointPose, type Prop, type Scene, type SoundClip, type View } from './schema.ts';

type State = ActorData & { pose: JointPose; lift: number; visible: boolean; expression: Expression; action: Action; speaking: boolean; held?: Prop };
type Camera = { x: number; y: number; zoom: number; view?: View };
const active = (clip: Clip, time: number) => clip.start <= time && time < clip.start + clip.length;
const latest = <T extends Clip>(clips: T[]) => clips.reduce<T | undefined>((found, clip) => !found || found.start <= clip.start ? clip : found, undefined);
const frameWeight = (clip: Clip, t: number) => ease(clamp(Math.min((t - clip.start) / .16, (clip.start + clip.length - t) / .15)));
export function evaluate(scene: Scene, time: number) {
  const t = clamp(time, 0, Math.max(0, scene.duration - .000001));
  const sounds = scene.clips.filter((clip): clip is SoundClip => (clip.track === 'audio' || clip.track === 'dialogue') && active(clip, t));
  const actors = scene.actors.map((actor): State => {
    const clips = scene.clips.filter(clip => 'actor' in clip && clip.actor === actor.id);
    const presence = clips.filter(clip => clip.track === 'actors');
    const movement = latest(clips.filter((clip): clip is Extract<Clip, { track: 'movement' }> => clip.track === 'movement' && clip.start <= t));
    const motion = movement ? ease(clamp((t - movement.start) / movement.length)) : 0;
    let x = movement ? mix(movement.fromX, movement.toX, motion) : actor.x;
    let y = movement ? mix(movement.fromY, movement.toY, motion) : actor.y;
    let flip = movement && active(movement, t) && movement.fromX !== movement.toX ? movement.fromX > movement.toX : actor.flip;
    let view = actor.view;
    const body = latest(clips.filter((clip): clip is Extract<Clip, { track: 'body' }> => clip.track === 'body' && clip.layer === 'body' && active(clip, t)));
    const gesture = latest(clips.filter((clip): clip is Extract<Clip, { track: 'body' }> => clip.track === 'body' && clip.layer === 'gesture' && active(clip, t)));
    const idle = sample(animations.idle, t);
    let { pose, lift } = idle;
    let expression = actor.expression;
    let held: Prop | undefined;
    let action: Action = body?.action ?? 'idle';
    for (const clip of [body, gesture]) {
      if (!clip) continue;
      const isGesture = clip.layer === 'gesture';
      const target = clip.target ? scene.objects.find(item => item.id === clip.target) : undefined;
      const supported = clip.action !== 'sit' || (target && anchors[target.kind]?.action === 'sit');
      const activeAction: Action = supported ? clip.action : 'stand';
      const definition = animations[activeAction];
      if (!isGesture) action = activeAction;
      else if (activeAction === 'talk' || activeAction === 'laugh' || activeAction === 'cry') action = activeAction;
      const offsets = activeAction === 'sit' && clip.start === 0 ? definition.duration : 0;
      const next = sample(definition, t - clip.start + offsets);
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
      const anchor = object && anchors[object.kind];
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
    return { ...actor, x, y, view, flip, pose, lift, expression, action, speaking: sounds.some(clip => clip.track === 'dialogue' && clip.actor === actor.id && !clip.muted), visible: !presence.length || presence.some(clip => active(clip, t)), held };
  });
  const cameraClips = scene.clips.filter(clip => clip.track === 'camera');
  const cameraClip = latest(cameraClips.filter(clip => active(clip, t)));
  function frame(clip?: typeof cameraClip): Camera {
    const target = actors.find(actor => actor.id === clip?.focus && actor.visible) ?? actors.find(actor => actor.visible);
    if (!clip || clip.shot === 'wide' || !target) return { x: WIDTH / 2, y: HEIGHT / 2, zoom: 1 };
    if (clip.shot === 'two-shot') {
      const visible = actors.filter(actor => actor.visible);
      const mid = visible.reduce((sum, actor) => sum + actor.x, 0) / Math.max(1, visible.length);
      return { x: clamp(mid, 380, 580), y: 297, zoom: 1.17 };
    }
    const zoom = clip.shot === 'close-up' ? 2.26 : clip.shot === 'medium' ? 1.64 : 1.28;
    const desiredY = target.y - (clip.shot === 'close-up' ? 157 : 113) * target.scale - target.lift;
    const view = clip.shot === 'front' || clip.shot === 'side' || clip.shot === 'back' ? clip.shot : undefined;
    return { x: clamp(target.x, WIDTH / (2 * zoom), WIDTH - WIDTH / (2 * zoom)), y: clamp(desiredY, HEIGHT / (2 * zoom), HEIGHT - HEIGHT / (2 * zoom)), zoom, view };
  }
  const camera = frame(cameraClip);
  if (cameraClip?.transition === 'glide') {
    const previous = frame(latest(cameraClips.filter(clip => clip.start < cameraClip.start)));
    const weight = ease(clamp((t - cameraClip.start) / .7));
    camera.x = mix(previous.x, camera.x, weight);
    camera.y = mix(previous.y, camera.y, weight);
    camera.zoom = mix(previous.zoom, camera.zoom, weight);
  }
  const transition = latest(scene.clips.filter((clip): clip is Extract<Clip, { track: 'transition' }> => clip.track === 'transition' && active(clip, t)));
  const fade = transition ? clamp((t - transition.start) / transition.length) : 0;
  return { actors, sounds, camera, shot: cameraClip?.shot ?? 'wide', fade: transition?.effect === 'fade-in' ? 1 - fade : fade };
}
export const projectDuration = (scenes: Scene[]) => scenes.reduce((sum, scene) => sum + scene.duration, 0);
export function locate(scenes: Scene[], time: number) {
  let start = 0;
  for (const scene of scenes) {
    if (time < start + scene.duration || scene === scenes.at(-1)) return { scene, local: clamp(time - start, 0, scene.duration), start };
    start += scene.duration;
  }
  throw new Error('A project needs a scene');
}
