import type { View } from './schema.ts';
import type { FingerCurls } from './performanceHandIntelligence.ts';

export type HandPose = 'relaxed' | 'loose-open' | 'open' | 'point' |
  'count-one' | 'count-two' | 'count-three' | 'pinch' | 'fist' | 'grip' |
  'palm-up' | 'palm-out' | 'shrug' | 'self-reference' | 'thumbs-up' | 'count';
export type HandSide = 'left' | 'right';
export type HandPoint = [number, number];
export type FingerPath = [HandPoint, HandPoint, HandPoint];
export type HandPoseParams = {
  /** Thumb, index, middle, ring and pinky, in that order. */
  curl: [number, number, number, number, number];
  spread: number;
  thumbOpposition: number;
  wristBend: number;
  wristTwist: number;
};

function pose(curl: HandPoseParams['curl'], spread: number, thumbOpposition: number, wristBend = 0, wristTwist = 0): HandPoseParams {
  return { curl, spread, thumbOpposition, wristBend, wristTwist };
}

const countTwo = pose([.79, 0, 0, .94, .97], .30, .66);
const poses: Record<HandPose, HandPoseParams> = {
  relaxed: pose([.45, .35, .42, .52, .62], .08, .45),
  'loose-open': pose([.28, .17, .23, .31, .43], .15, .28, 5),
  open: pose([.06, 0, .04, .09, .16], .30, .03),
  point: pose([.78, 0, .96, .97, .98], 0, .65),
  'count-one': pose([.80, 0, .95, .97, 1], .02, .68),
  'count-two': countTwo,
  'count-three': pose([.82, 0, .02, .06, .97], .19, .72),
  count: countTwo,
  pinch: pose([.52, .56, .86, .91, .95], .04, .93, -5, .18),
  fist: pose([.94, 1, 1, 1, 1], 0, .88),
  grip: pose([.76, .84, .89, .91, .93], .02, .74),
  'palm-up': pose([.24, .12, .17, .24, .33], .18, .19, 8, .12),
  'palm-out': pose([.08, .01, .03, .09, .14], .26, .08, -7),
  shrug: pose([.33, .20, .27, .34, .42], .15, .30, 8, .19),
  'self-reference': pose([.49, .37, .47, .58, .68], .07, .59, -8, .22),
  'thumbs-up': pose([.02, .96, .98, .98, 1], 0, -.75)
};

const unit = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, weight: number) => from + (to - from) * weight;
const wrist: HandPoint = [0, 0];
const palm = 'M -5.3 3.5 Q -8.1 0.3 -8.1 -5.6 Q -7.8 -8.6 -4.6 -8.1 L 5.7 -7.8 Q 8.4 -7.5 8.2 -4.4 Q 7.9 1.1 4.7 3.6 Q -0.4 4.8 -5.3 3.5 Z';
const digitWidths = [3.05, 3.2, 3.05, 2.7, 3.75] as const;
const lengths = [12, 14.7, 13.4, 10.7] as const;

export function handPoseParams(name: HandPose = 'relaxed', blend = 1): HandPoseParams {
  const rest = poses.relaxed, target = poses[name], weight = unit(blend);
  return {
    curl: [
      lerp(rest.curl[0], target.curl[0], weight), lerp(rest.curl[1], target.curl[1], weight),
      lerp(rest.curl[2], target.curl[2], weight), lerp(rest.curl[3], target.curl[3], weight),
      lerp(rest.curl[4], target.curl[4], weight)
    ],
    spread: lerp(rest.spread, target.spread, weight),
    thumbOpposition: lerp(rest.thumbOpposition, target.thumbOpposition, weight),
    wristBend: lerp(rest.wristBend, target.wristBend, weight),
    wristTwist: lerp(rest.wristTwist, target.wristTwist, weight)
  };
}

/** Flexion folds into the palm plane in projection. Splay is an independent
 * control, and increasing curl can never turn a fingertip back toward the cuff. */
function buildHand(params: HandPoseParams) {
  const fingers: FingerPath[] = lengths.map((length, index) => {
    const curl = params.curl[index + 1];
    const root: HandPoint = [(index - 1.5) * 3.7, -7 + Math.abs(index - 1.5) * .4];
    const splay = (index - 1.5) * params.spread;
    const mid: HandPoint = [root[0] + splay * 4, root[1] - length * (.55 - .47 * curl)];
    const tip: HandPoint = [root[0] * (1 - .17 * curl) + splay * 9, mid[1] - length * (.45 - .44 * curl)];
    return [root, mid, tip];
  });
  const thumbCurl = params.curl[0], opposition = params.thumbOpposition;
  const raised = Math.max(0, -opposition);
  const thumb: FingerPath = [
    [-5.7, .5],
    [-10.6 + opposition * 2.5, -4.5 + thumbCurl * 1.5],
    [-13.2 + opposition * 5.6 + raised * 8, -10.2 + thumbCurl * 5 - raised * 14]
  ];
  return { wrist, palm, fingers, thumb, digitWidths, params };
}

const staticHands = new Map<HandPose, ReturnType<typeof buildHand>>();

export function sampleHandRig(name: HandPose = 'relaxed', blend = 1) {
  const pose = blend <= 0 ? 'relaxed' : name;
  if (pose !== 'relaxed' && blend < 1) return buildHand(handPoseParams(pose, blend));
  const cached = staticHands.get(pose);
  if (cached) return cached;
  const geometry = buildHand(poses[pose]);
  staticHands.set(pose, geometry);
  return geometry;
}

/** Blend the actual five-finger geometry between captured hand poses and
 * the existing hand-performance pose. Prevents the hand from popping to a
 * totally different silhouette at each tracked keyframe or clip boundary. */
export function sampleLayeredHandRig(base:HandPose,baseWeight:number,
  from:HandPose,to:HandPose,progress:number,influence:number) {
  const start=handPoseParams(base,baseWeight);
  const first=poses[from],second=poses[to],t=unit(progress),strength=unit(influence);
  const interpolate=(a:number,b:number)=>lerp(a,b,t);
  const target:HandPoseParams={
    curl:first.curl.map((v,i)=>interpolate(v,second.curl[i])) as HandPoseParams['curl'],
    spread:interpolate(first.spread,second.spread),
    thumbOpposition:interpolate(first.thumbOpposition,second.thumbOpposition),
    wristBend:interpolate(first.wristBend,second.wristBend),
    wristTwist:interpolate(first.wristTwist,second.wristTwist)
  };
  return buildHand({
    curl:start.curl.map((v,i)=>lerp(v,target.curl[i],strength)) as HandPoseParams['curl'],
    spread:lerp(start.spread,target.spread,strength),
    thumbOpposition:lerp(start.thumbOpposition,target.thumbOpposition,strength),
    wristBend:lerp(start.wristBend,target.wristBend,strength),
    wristTwist:lerp(start.wristTwist,target.wristTwist,strength)
  });
}
/** Apply five independently observed finger bends on top of the existing
 * illustrated hand silhouette. Hands stay fully editable using the regular
 * pose presets when landmarks are absent; no extra renderer or ML model. */
export function applyCapturedFingerCurls(
  geometry:ReturnType<typeof sampleHandRig>,fingers:FingerCurls|undefined,influence:number
){
  if(!fingers||influence<=0)return geometry;
  const weight=unit(influence),base=geometry.params;
  const target:HandPoseParams={
    ...base,
    curl:base.curl.map((curl,index)=>lerp(curl,unit(fingers[index]),weight)) as FingerCurls,
    spread:lerp(base.spread,Math.max(.02,.32-(fingers[1]+fingers[2]+fingers[3]+fingers[4])*.065),weight),
    thumbOpposition:lerp(base.thumbOpposition,fingers[0]<.36&&fingers.slice(1).every(curl=>curl>.65)?-.75:fingers[0]>.6?.7:.10,weight)
  };
  return buildHand(target);
}
export function handRotationParams(forearmRadians:number,wristDegrees:number,
  bend:number,side:HandSide) {
  const wrist=Math.max(-65,Math.min(65,wristDegrees))*.46;
  return forearmRadians+Math.PI/2+(wrist+bend*(side==='left'?-1:1))*Math.PI/180;
}

export function fingerPath(points: FingerPath) {
  return `M ${points[0].join(' ')} L ${points[1].join(' ')} L ${points[2].join(' ')}`;
}

/** Local -Y points away from the wrist. Apply the blended wrist bend before
 * reflecting the complete hand for the opposite side or a rear view. */
export function handRotation(forearmRadians: number, wristDegrees = 0, name: HandPose = 'relaxed', blend = 1, side: HandSide = 'right') {
  const bend = poses[name].wristBend * unit(blend) * (side === 'left' ? -1 : 1);
  const wrist = Math.max(-65, Math.min(65, wristDegrees)) * .46;
  return forearmRadians + Math.PI / 2 + (wrist + bend) * Math.PI / 180;
}

export function handWidthScale(view: View, side: HandSide, twist: number) {
  const rear = view === 'back' || view === 'back-quarter';
  const mirror = (side === 'left' ? -1 : 1) * (rear ? -1 : 1);
  const projection = view === 'side' ? .77 : 1;
  return mirror * projection * (1 - .30 * twist);
}

export const handSize = (thickness: number) => Math.max(.35, .91 * thickness);
