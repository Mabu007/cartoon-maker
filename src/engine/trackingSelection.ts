import type {PerformanceKey} from './performanceCapture.ts';
import type {FacialControls} from './facialIntelligence.ts';

export type TrackingSelection={head:boolean;face:boolean;eyes:boolean;torso:boolean;hips:boolean;legs:boolean;arms:boolean;hands:boolean};
export const defaultTrackingSelection:TrackingSelection={head:true,face:false,eyes:false,torso:true,hips:false,legs:false,arms:true,hands:true};
export function trackingModelPlan(s:TrackingSelection){
  return {pose:(s.head&&!s.face&&!s.eyes)||s.torso||s.hips||s.legs||s.arms,hands:s.hands,face:s.face||s.eyes};
}
export function isEyeChannel(channel:keyof FacialControls){return /^(blink|eyeNarrow|eyeWide)/.test(channel);}
export function maskPerformance(key:PerformanceKey|undefined,s:TrackingSelection):PerformanceKey|undefined{
  if(!key)return undefined;
  const result:PerformanceKey={...key,pose:{...key.pose},tracking:{...s}};
  if(s.head&&result.pose.head!==undefined){
    result.pose.head=Math.max(-22,Math.min(22,result.pose.head+(!s.torso?(result.pose.torso??0):0)+(!s.hips?(result.pose.hips??0):0)));
  }
  if(!s.head){delete result.pose.head;delete result.pose.neck;delete result.headYaw;delete result.headFacing;}
  if(!s.torso){delete result.pose.torso;delete result.bodyYaw;delete result.bodyFacing;}
  if(!s.hips)delete result.pose.hips;
  if(!s.legs)for(const joint of ['leftHip','rightHip','leftKnee','rightKnee'] as const)delete result.pose[joint];
  if(!s.arms){
    for(const joint of ['leftShoulder','rightShoulder','leftElbow','rightElbow'] as const)delete result.pose[joint];
    delete result.armTargets;delete result.armBend;delete result.armDepth;delete result.armExtension;
    delete result.armEvidence;delete result.armConfidence;delete result.nearArm;delete result.contact;
  }
  if(!s.hands){delete result.hands;delete result.fingerCurls;delete result.handConfidence;delete result.contact;delete result.pose.leftWrist;delete result.pose.rightWrist;}
  // With hand-only capture, the finger geometry owns the hand but cannot
  // rotate an unrelated authored arm using a missing elbow observation.
  if(!s.arms){delete result.pose.leftWrist;delete result.pose.rightWrist;}
  if(!s.eyes)delete result.focus;
  if(!s.face||!s.eyes)delete result.expression;
  if(!s.face&&!s.eyes)delete result.facial;
  if(!Object.keys(result.pose).length&&!result.facial&&!result.focus&&!result.headFacing&&!result.bodyFacing&&!result.armTargets&&!result.fingerCurls&&!result.hands&&!result.expression)return undefined;
  return result;
}
export function blendSelectedFace(base:FacialControls,observed:FacialControls,weight:number,s?:TrackingSelection):FacialControls{
  const result={...base};
  const w=Math.max(0,Math.min(1,weight));
  for(const channel of Object.keys(base) as (keyof FacialControls)[]){
    if(!s||(isEyeChannel(channel)?s.eyes:s.face))result[channel]=base[channel]+(observed[channel]-base[channel])*w;
  }
  return result;
}
