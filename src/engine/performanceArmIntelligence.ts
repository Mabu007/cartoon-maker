/**
 * Webcam arm evidence -> SIRVIBE's small 2D rig. Only measured joints are
 * converted; there is no 3D reconstruction, model inference or camera image
 * persistence. Artist-facing target coordinates are relative to the shoulder.
 */
import type { Landmark } from './performanceCapture.ts';
import type { Point } from './animation.ts';

export type ArmSide='left'|'right';
export type ArmTargets={left?:Point;right?:Point};
export type ArmBends={left?:number;right?:number};
export type ArmDepths={left?:number;right?:number};
const finite=(v:number|undefined)=>v!==undefined&&Number.isFinite(v);
const visible=(point?:Landmark):point is Landmark=>Boolean(point&&finite(point.x)&&finite(point.y)&&
  (point.visibility??1)>=.55);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Image normalized X and Y must not be treated as equally scaled axes:
 * on 4:3 webcam frames, normalized Y spans fewer horizontal pixel units. */
export function observedArmGuidance(
  pose:readonly Landmark[],world?:readonly Landmark[],aspect=4/3
):{targets:ArmTargets;bends:ArmBends;depths:ArmDepths}{
  const targets:ArmTargets={},bends:ArmBends={},depths:ArmDepths={};
  const shoulderSpan=visible(pose[11])&&visible(pose[12])
    ?Math.abs(pose[11].x-pose[12].x):undefined;
  if(!shoulderSpan||shoulderSpan<.085)return {targets,bends,depths};
  const scale=48/shoulderSpan;
  const torsoX=(pose[11].x+pose[12].x)/2;
  for(const side of ['left','right'] as const){
    const s=side==='left'?11:12,e=side==='left'?13:14,w=side==='left'?15:16;
    if(!visible(pose[s])||!visible(pose[w])||!visible(pose[e]))continue;
    const shoulder=pose[s],elbow=pose[e],wrist=pose[w];
    const raw={x:-(wrist.x-shoulder.x)*scale,
      y:(wrist.y-shoulder.y)*scale/Math.max(.75,aspect)};
    const reach=Math.hypot(raw.x,raw.y);
    // The rig has two 28-unit bones. A measured wrist near the shoulder
    // remains intentionally bent but cannot collapse the elbow into a knot.
    const length=clamp(reach,12,55);
    targets[side]={x:raw.x/Math.max(.001,reach)*length,
      y:raw.y/Math.max(.001,reach)*length};
    const elbowLocal={x:-(elbow.x-shoulder.x)*scale,
      y:(elbow.y-shoulder.y)*scale/Math.max(.75,aspect)};
    const cross=raw.x*elbowLocal.y-raw.y*elbowLocal.x;
    if(Math.abs(cross)>28)bends[side]=cross>0?1:-1;
    const metricShoulder=world?.[s],metricWrist=world?.[w];
    const metricDepth=visible(metricShoulder)&&visible(metricWrist)&&
      finite(metricShoulder.z)&&finite(metricWrist.z)
      ?(metricShoulder.z!-metricWrist.z!)*1.8:undefined;
    const screenDepth=finite(shoulder.z)&&finite(wrist.z)
      ?(shoulder.z!-wrist.z!)*1.4:undefined;
    const visibleHeight=(shoulder.y-wrist.y)*.4;
    const crossed=side==='left'?wrist.x<torsoX:wrist.x>torsoX;
    const lateral=crossed?.08:0;
    depths[side]=clamp((metricDepth??screenDepth??0)+visibleHeight+lateral,-1,1);
  }
  return {targets,bends,depths};
}
/** Solve the actual shoulder-to-wrist reach using two fixed 28-unit arm
 * bones. Pole preference is continuous through noisy near-straight angles,
 * and the output cannot hyperextend or collapse onto the shoulder. */
export function solveCapturedArm(
  shoulder:Point,relativeTarget:Point,armScale:number,
  pole:number,previousElbow?:Point
):{elbow:Point;hand:Point;reach:number}{
  const bone=Math.max(8,28*armScale);
  const dx=relativeTarget.x*armScale,dy=relativeTarget.y*armScale;
  const rawLength=Math.hypot(dx,dy);
  const reach=clamp(rawLength,Math.max(5,bone*.32),2*bone-.35);
  const a=Math.atan2(dy,dx);
  const hand={x:shoulder.x+Math.cos(a)*reach,
    y:shoulder.y+Math.sin(a)*reach};
  const bendAngle=Math.acos(clamp(reach/(2*bone),-1,1));
  const make=(side:number):Point=>({
    x:shoulder.x+Math.cos(a+side*bendAngle)*bone,
    y:shoulder.y+Math.sin(a+side*bendAngle)*bone
  });
  let preference=pole<0?-1:1;
  // If a measured elbow exists, resolve ambiguous bend sides by which
  // candidate is *closest*; never randomly invert the elbow near extension.
  if(previousElbow&&Math.abs(pole)<.1){
    const positive=make(1),negative=make(-1);
    preference=distance(negative,previousElbow)<distance(positive,previousElbow)?-1:1;
  }
  return {elbow:make(preference),hand,reach};
}
/** This score is strictly a 2D occlusion suggestion, not ground-truth depth.
 * If score difference is ambiguous, preserve the previous drawing order. */
export function decideFrontArm(
  depths:ArmDepths,previous:ArmSide|undefined,
  base:ArmSide='right',margin=.16
):ArmSide{
  const a=depths.left,b=depths.right;
  if(a===undefined&&b===undefined)return previous??base;
  if(a===undefined)return 'right';
  if(b===undefined)return 'left';
  if(Math.abs(a-b)<=margin)return previous??base;
  return a>b?'left':'right';
}
/** Stable two-hand contact is a first-class relationship. Only the caller
 * may activate it after both wrists have been observed. */
export function contactHysteresis(
  previous:string|undefined,observed:string|undefined,
  candidate:string|undefined,consecutive:number
):{contact:string|undefined;candidate:string|undefined;count:number}{
  if(observed===previous)return {contact:previous,candidate:undefined,count:0};
  if(!observed)return {contact:undefined,candidate:undefined,count:0};
  const count=observed===candidate?consecutive+1:1;
  return {contact:count>=2?observed:previous,candidate:count>=2?undefined:observed,
    count:count>=2?0:count};
}

export type ArmPaintPass={side:ArmSide;part:'upper'|'lower'|'hand'};
/** A renderer-independent painter order that keeps nearer forearms and hands
 * together. Upper arms tuck behind the shirt; far lower arm then hand are
 * painted before the near lower arm then hand. */
export function observedArmPaintOrder(
  observed:{left:boolean;right:boolean},nearest:ArmSide
):ArmPaintPass[]{
  const available=(['left','right'] as const).filter(side=>observed[side]);
  const ordered=available.sort((a,b)=>a===nearest?1:b===nearest?-1:0);
  return [
    ...ordered.map(side=>({side,part:'upper' as const})),
    ...ordered.flatMap(side=>[
      {side,part:'lower' as const},{side,part:'hand' as const}
    ])
  ];
}
