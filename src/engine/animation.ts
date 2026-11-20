import type { Action, Animation, Character, JointName, JointPose } from './schema.ts';

export const skeleton: Record<JointName, JointName | null> = {
  root: null, hips: 'root', torso: 'hips', neck: 'torso', head: 'neck',
  leftShoulder: 'torso', leftElbow: 'leftShoulder', leftWrist: 'leftElbow', leftHand: 'leftWrist',
  rightShoulder: 'torso', rightElbow: 'rightShoulder', rightWrist: 'rightElbow', rightHand: 'rightWrist',
  leftHip: 'hips', leftKnee: 'leftHip', leftAnkle: 'leftKnee', leftFoot: 'leftAnkle',
  rightHip: 'hips', rightKnee: 'rightHip', rightAnkle: 'rightKnee', rightFoot: 'rightAnkle'
};
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const mix = (from: number, to: number, t: number) => from + (to - from) * t;
export const ease = (t: number) => t * t * (3 - 2 * t);
const radians = Math.PI / 180;
const key = (time: number, pose: JointPose = {}, lift = 0) => ({ time, pose, lift });
export const gaitSpeeds = { walk: 82, run: 225 } as const;
export type Gait = keyof typeof gaitSpeeds;
/** Integrates a short trapezoidal velocity profile so feet and pelvis
 * accelerate/decelerate together instead of snapping to full speed.
 */
export function travelProgress(progress:number,ramp=.14) {
  const t=clamp(progress),r=clamp(ramp,.01,.35),total=1-r;
  if(t<r)return t*t/(2*r*total);
  if(t>1-r)return 1-(1-t)*(1-t)/(2*r*total);
  return (t-r*.5)/total;
}
export function travelSpeed(progress:number,ramp=.14) {
  const t=clamp(progress),r=clamp(ramp,.01,.35),total=1-r;
  if(t<r)return t/(r*total);
  if(t>1-r)return (1-t)/(r*total);
  return 1/total;
}
/** Compresses a turning head just as a new 2D view appears, hiding view
 * discontinuities without stretching lip or eye geometry.
 */
export function turnHeadScale(progress:number){
  const t=clamp(progress);
  const at=.3333333333333333,b=.6666666666666666;
  const distance=Math.min(Math.abs(t-at),Math.abs(t-b));
  return .24+.76*ease(clamp(distance/.105));
}
export function motionBlend(time:number,start:number,length:number,fadeIn=.2,fadeOut=.24) {
  if(time<=start||time>=start+length)return 0;
  return Math.min(ease(clamp((time-start)/Math.min(fadeIn,length*.4))),
    ease(clamp((start+length-time)/Math.min(fadeOut,length*.4))));
}
export const viewForward = (view: string) => view === 'back-quarter' ? -1 : 1;

const gait = (running: boolean) => {
  // Eight-phase walk cycle with opposite arm swing, knee recovery, toe-off
  // and torso/head counter-rotation. Feet are planted by the actor renderer.
  const stride = running ? 43 : 28, lean = running ? 12 : 3;
  const swing = (step: number, leadKnee: number, backKnee: number): JointPose => ({
    leftHip: step, rightHip: -step,
    leftKnee: leadKnee, rightKnee: backKnee,
    leftShoulder: -step * (running ? .94 : .82), rightShoulder: step * (running ? .94 : .82),
    leftElbow: running ? 68 : 16, rightElbow: running ? 65 : 14,
    leftWrist: running ? -12 : 8, rightWrist: running ? 12 : -8,
    torso: lean + Math.sin(step / stride * Math.PI) * (running ? 4 : 2),
    head: -lean * .28 - Math.sin(step / stride * Math.PI) * 2
  });
  return [
    key(0, swing(stride, -5, -38), 0),
    key(.125, swing(stride*.75, -10, -61), 0),
    key(.25, swing(0, -15, -67), running ? 7 : 0),
    key(.375, swing(-stride*.75, -43, -38), 0),
    key(.5, swing(-stride, -40, -5), 0),
    key(.625, swing(-stride*.75, -61, -10), 0),
    key(.75, swing(0, -67, -15), running ? 7 : 0),
    key(.875, swing(stride*.75, -38, -43), 0),
    key(1, swing(stride, -5, -38), 0)
  ];
};
const seated: JointPose = { leftHip: 84, rightHip: 79, leftKnee: -83, rightKnee: -81, torso: -5, rightShoulder: 22, rightElbow: 24, leftShoulder: -18, leftElbow: 23 };
const make = (id: Action, duration: number, loop: boolean, keys: Animation['keys'], expression?: Animation['expression']): Animation => ({ id, duration, loop, keys, expression });
export const animations: Record<Action, Animation> = {
  idle: make('idle', 3, true, [key(0), key(.5, { torso: 2, head: -2, leftShoulder: 3 }, 2), key(1)]),
  walk: make('walk', .88, true, gait(false)), run: make('run', .54, true, gait(true)),
  stop: make('stop', .5, false, [key(0, { torso: 17, leftHip: 25, rightHip: -15 }), key(.45, { torso: -9, leftHip: 9, leftKnee: -10 }), key(1)]),
  turn: make('turn', .8, false, [key(0), key(.35, { head: 13, torso: 8, rightHip: 10 }), key(.65, { head: -8, torso: -9, leftHip: 12 }), key(1)]),
  jump: make('jump', .85, false, [key(0), key(.18, { leftHip: 23, rightHip: 22, leftKnee: -43, rightKnee: -43 }, -16), key(.53, { leftHip: 36, rightHip: -5, leftKnee: -40, rightKnee: -57, leftShoulder: 130, rightShoulder: -128 }, 69), key(.83, { leftKnee: -33, rightKnee: -32 }, -9), key(1)]),
  sit: make('sit', .85, false, [key(0), key(.52, { ...seated, torso: 18 }, -42), key(1, seated, -49)]),
  stand: make('stand', .8, false, [key(0, seated, -49), key(.48, { leftHip: 30, rightHip: 30, leftKnee: -55, rightKnee: -55, torso: 24 }, -26), key(1)]),
  wave: make('wave', 1.2, true, [key(0, { rightShoulder: 115, rightElbow: 24 }), key(.28, { rightShoulder: 126, rightElbow: 56 }), key(.68, { rightShoulder: 109, rightElbow: 12 }), key(1, { rightShoulder: 115, rightElbow: 24 })], 'happy'),
  point: make('point', .62, false, [key(0), key(.26, { rightShoulder: 42, rightElbow: 45, torso: -7 }), key(1, { rightShoulder: 95, rightElbow: 2, torso: 6 })]),
  nod: make('nod', .7, true, [key(0, { head: -7 }), key(.47, { head: 13, neck: 5 }), key(1, { head: -7 })]),
  shake: make('shake', .63, true, [key(0, { head: -12 }), key(.5, { head: 12, neck: -6 }), key(1, { head: -12 })]),
  shrug: make('shrug', .84, false, [key(0), key(.42, { leftShoulder: -56, leftElbow: -45, rightShoulder: 55, rightElbow: 52, head: -8 }, 4), key(1, { leftShoulder: -43, leftElbow: -31, rightShoulder: 40, rightElbow: 42 })], 'thinking'),
  laugh: make('laugh', .58, true, [key(0, { head: -12, torso: -6, leftElbow: -44, rightElbow: 48 }), key(.48, { head: 4, torso: 8, leftElbow: -50, rightElbow: 61 }, 5), key(1, { head: -12, torso: -6, leftElbow: -44, rightElbow: 48 })], 'happy'),
  cry: make('cry', .75, true, [key(0, { head: 15, leftShoulder: 46, leftElbow: 116, rightShoulder: -44, rightElbow: -118 }), key(.5, { head: 19, torso: 5 }, -3), key(1, { head: 15, leftShoulder: 46, leftElbow: 116, rightShoulder: -44, rightElbow: -118 })], 'sad'),
  angry: make('angry', .6, false, [key(0), key(.38, { head: -9, torso: -11, rightElbow: 48, leftElbow: -48 }, -2), key(1, { head: 10, torso: 10, rightShoulder: 24, leftShoulder: -23, rightElbow: 57, leftElbow: -58 })], 'angry'),
  surprise: make('surprise', .55, false, [key(0), key(.3, { head: -14, torso: -13, leftShoulder: -58, rightShoulder: 56 }, 9), key(1, { head: -5, torso: -5, leftShoulder: -21, rightShoulder: 21 })], 'surprised'),
  celebrate: make('celebrate', .7, true, [key(0, { leftShoulder: -113, rightShoulder: 112, leftKnee: -20, rightKnee: -20 }), key(.5, { leftShoulder: -152, rightShoulder: 153, leftHip: 21, rightHip: -20 }, 22), key(1, { leftShoulder: -113, rightShoulder: 112, leftKnee: -20, rightKnee: -20 })], 'happy'),
  talk: make('talk', 1.5, true, [key(0, { head: -3, rightElbow: 15 }), key(.43, { head: 5, rightShoulder: 28, rightElbow: 42 }), key(1, { head: -3, rightElbow: 15 })]),
  listen: make('listen', 2.4, true, [key(0, { head: -8 }), key(.6, { head: -3, torso: 3 }), key(1, { head: -8 })]),
  think: make('think', 1.2, false, [key(0), key(.45, { head: -12, rightShoulder: 40, rightElbow: 115 }), key(1, { head: -10, rightShoulder: 35, rightElbow: 111 })], 'thinking'),
  lean: make('lean', .7, false, [key(0), key(1, { torso: 16, neck: -6, rightHip: -6 })]),
  'hand-on-hip': make('hand-on-hip', .5, false, [key(0), key(1, { rightShoulder: 28, rightElbow: -105 })]),
  'hand-to-face': make('hand-to-face', .6, false, [key(0), key(1, { head: -7, rightShoulder: 30, rightElbow: 125 })]),
  'hand-to-pocket': make('hand-to-pocket', .55, false, [key(0), key(1, { rightShoulder: 1, rightElbow: -46 })]),
  fist: make('fist', .35, false, [key(0), key(1, { rightShoulder: 40, rightElbow: 55 })]),
  'open-hand': make('open-hand', .45, false, [key(0), key(1, { rightShoulder: 40, rightElbow: 22 })]),
  blink: make('blink', .22, false, [key(0), key(1)]),
  'look-away': make('look-away', .5, false, [key(0), key(1, { head: -9, neck: -4 })])
};

export function sample(animation: Animation, seconds: number) {
  const time = animation.loop ? ((seconds % animation.duration) + animation.duration) % animation.duration / animation.duration : clamp(seconds / animation.duration);
  const index = animation.keys.findIndex(frame => frame.time >= time && frame.time > 0);
  const next = animation.keys[index < 1 ? animation.keys.length - 1 : index];
  const previous = animation.keys[index < 1 ? animation.keys.length - 2 : index - 1];
  const t = ease(clamp((time - previous.time) / (next.time - previous.time)));
  const pose: JointPose = {};
  for (const joint of new Set([...Object.keys(previous.pose), ...Object.keys(next.pose)]) as Set<JointName>) pose[joint] = mix(previous.pose[joint] ?? 0, next.pose[joint] ?? 0, t);
  return { pose, lift: mix(previous.lift ?? 0, next.lift ?? 0, t) };
}
export function blend(base: JointPose, overlay: JointPose, weight: number, gesture = false) {
  const pose = { ...base };
  for (const [joint, value] of Object.entries(overlay) as [JointName, number][]) {
    if (!gesture || /head|neck|Shoulder|Elbow|Wrist|Hand/.test(joint)) pose[joint] = mix(base[joint] ?? 0, value, weight);
  }
  return pose;
}
export type Point = { x: number; y: number };
export const along = (origin: Point, angle: number, length: number): Point => ({ x: origin.x + Math.sin(angle * radians) * length, y: origin.y + Math.cos(angle * radians) * length });
export function armIK(shoulder: Point, target: Point, upper: number, lower: number, bend: number): [Point, Point] {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y;
  const angle = Math.atan2(dy, dx);
  const distance = clamp(Math.hypot(dx, dy), Math.abs(upper - lower) + .01, upper + lower - .01);
  const flex = Math.acos(clamp((upper ** 2 + distance ** 2 - lower ** 2) / (2 * upper * distance), -1, 1));
  return [{ x: shoulder.x + Math.cos(angle + flex * bend) * upper, y: shoulder.y + Math.sin(angle + flex * bend) * upper }, { x: shoulder.x + Math.cos(angle) * distance, y: shoulder.y + Math.sin(angle) * distance }];
}
/** Predictable, foot-planted gait trajectory. Each leg has a stance phase
 * locked to the floor and a short raised recovery arc, never skating in air.
 */
export function footContactAt(time: number, action: Gait, side: 'left' | 'right', velocity?: number) {
  const duration = animations[action].duration;
  const phase = (((time / duration) + (side === 'right' ? .5 : 0)) % 1) + 1;
  const progress = phase % 1;
  const stance = action === 'run' ? .43 : .57;
  const stride = velocity === undefined ? (action === 'run' ? 42 : 25) : clamp(velocity * duration * stance, 8, 60);
  if (progress <= stance) return { x: stride * (.5 - progress / stance), y: 0, planted: true };
  const recovery = (progress - stance) / (1 - stance);
  return { x: stride * (-.5 + recovery), y: -Math.sin(recovery * Math.PI) * (action === 'run' ? 19 : 10), planted: false };
}
export function gaitLeg(upper: Point, legScale: number, time: number, action: Gait,
  side: 'left' | 'right', forward: number, lift: number, velocity?: number) {
  const step = footContactAt(time, action, side, velocity);
  const length = 38 * legScale;
  const goal = { x: upper.x + step.x * forward * legScale, y: step.y * legScale + (step.planted ? lift : lift * .35) };
  return armIK(upper, goal, length, length * 1.09, -forward);
}
export function rig(c: Character, pose: JointPose, width: number) {
  const p = (joint: JointName) => pose[joint] ?? 0;
  const hip = { x: 0, y: -76 * c.legs * c.height };
  const torso = p('torso') + p('hips');
  const neck = along(hip, 180 - torso, 54 * c.torso * c.height);
  const head = along(neck, 180 - torso - p('neck'), 36 * c.head);
  const limb = (side: 'left' | 'right', sign: number) => {
    const shoulder = { x: neck.x + sign * 24 * width, y: neck.y + 10 };
    const armAngle = sign * 13 + p(`${side}Shoulder`) + torso;
    const elbow = along(shoulder, armAngle, 28 * c.arms);
    const hand = along(elbow, armAngle + p(`${side}Elbow`), 28 * c.arms);
    const upper = { x: hip.x + sign * 12 * width, y: hip.y };
    const legAngle = p(`${side}Hip`) + sign * 5;
    const knee = along(upper, legAngle, 38 * c.legs * c.height);
    const foot = along(knee, legAngle + p(`${side}Knee`), 38 * c.legs * c.height);
    return { shoulder, elbow, hand, upper, knee, foot };
  };
  return { hip, neck, head, angle: torso + p('neck') + p('head'), left: limb('left', -1), right: limb('right', 1) };
}
