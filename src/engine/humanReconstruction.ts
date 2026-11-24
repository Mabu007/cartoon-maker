/** Confidence-aware camera-space reconstruction, independent of cartoon proportions.
 * A single camera cannot recover hidden depth; preserve observed evidence rather
 * than inventing joints. Fresh hand landmarks can rescue a low-confidence wrist.
 */
import type { JointName } from './schema.ts';
import type { CaptureFrame,Landmark,PerformanceKey } from './performanceCapture.ts';
const valid=(p?:Landmark):p is Landmark=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=.55;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const distance=(a:Landmark,b:Landmark,aspect:number)=>Math.hypot(a.x-b.x,(a.y-b.y)/aspect);
export function reconstructHumanFrame(frame:CaptureFrame):CaptureFrame{
  const pose=frame.pose.slice();
  const aspect=clamp(frame.aspect??4/3,.75,2.4);
  if(!valid(pose[11])||!valid(pose[12]))return frame;
  const span=distance(pose[11],pose[12],aspect);
  if(span<.065)return frame;
  for(const side of ['left','right'] as const){
    const s=side==='left'?11:12,e=side==='left'?13:14,w=side==='left'?15:16;
    const hand=side==='left'?frame.leftHand:frame.rightHand;
    const palm=hand?.[0],wrist=pose[w],shoulder=pose[s],elbow=pose[e];
    // Stale hand detections must not pull the new pose backward.
    if((frame.handAgeMs?.[side]??0)>95||!valid(palm))continue;
    if(distance(palm,shoulder,aspect)>span*2.1)continue;
    if(valid(elbow)&&distance(palm,elbow,aspect)>span*1.45)continue;
    if(valid(wrist)){
      if(distance(wrist,palm,aspect)>span*.38)continue;
      const weight=.2+.35*(1-(wrist.visibility??1));
      pose[w]={...wrist,x:wrist.x+(palm.x-wrist.x)*weight,y:wrist.y+(palm.y-wrist.y)*weight};
    }else if(valid(elbow)){
      pose[w]={x:palm.x,y:palm.y,visibility:.65}; // no fabricated metric Z
    }
  }
  return {...frame,pose,aspect};
}
/** Signed yaw from the metric shoulder axis, not nose movement. */
export function observedBodyYaw(world?:readonly Landmark[]):number|undefined{
  const left=world?.[11],right=world?.[12];
  if(!valid(left)||!valid(right)||!Number.isFinite(left.z)||!Number.isFinite(right.z))return undefined;
  const dx=left.x-right.x,dz=left.z!-right.z!;
  const width=Math.hypot(dx,dz);
  if(width<.11||width>.9||Math.abs(dx)<.045)return undefined;
  return clamp(Math.atan2(dz,Math.abs(dx))/(Math.PI/2),-1,1);
}
export type BodyFacing='front'|'left'|'right';
export function facingForBodyYaw(yaw:number,previous:BodyFacing):BodyFacing{
  if(yaw>.32)return 'left';
  if(yaw<-.32)return 'right';
  if(previous==='left'&&yaw>.17)return previous;
  if(previous==='right'&&yaw<-.17)return previous;
  return 'front';
}

/** The existing left three-quarter artwork mirrors the whole local rig.
 * Re-express captured SCREEN-relative limbs in that local frame first,
 * so changing facing cannot swap the performer's two hands on screen.
 * The recorded key is immutable and retains original tracking coordinates.
 */
export function mirrorCapturedRig(key:PerformanceKey):PerformanceKey{
  const swap=(side:'left'|'right')=>side==='left'?'right':'left';
  const mirrorPairs=<T,>(pair:{left?:T;right?:T}|undefined,convert:(v:T)=>T=(v=>v))=>pair?{
    ...(pair.right!==undefined?{left:convert(pair.right)}:{}),
    ...(pair.left!==undefined?{right:convert(pair.left)}:{})
  }:undefined;
  const pose:PerformanceKey['pose']={};
  for(const [name,value] of Object.entries(key.pose)){
    if(value===undefined)continue;
    const swapped=name.startsWith('left')?'right'+name.slice(4):name.startsWith('right')?'left'+name.slice(5):name;
    pose[swapped as JointName]=-value;
  }
  const contact=key.contact;
  const contactMirrored=contact?.endsWith('-left')?contact.slice(0,-5)+'-right':
    contact?.endsWith('-right')?contact.slice(0,-6)+'-left':contact;
  return {...key,pose,
    armTargets:mirrorPairs(key.armTargets,p=>({x:-p.x,y:p.y})),
    armBend:mirrorPairs(key.armBend,v=>-v),
    armDepth:mirrorPairs(key.armDepth),
    armConfidence:mirrorPairs(key.armConfidence),
    handConfidence:mirrorPairs(key.handConfidence),
    fingerCurls:mirrorPairs(key.fingerCurls),
    hands:key.hands?{left:key.hands.right,right:key.hands.left}:undefined,
    nearArm:key.nearArm?swap(key.nearArm):undefined,
    contact:contactMirrored as PerformanceKey['contact'],
    headFacing:key.headFacing&&key.headFacing!=='front'?swap(key.headFacing):key.headFacing,
    headYaw:key.headYaw===undefined?undefined:-key.headYaw,
    focus:key.focus?{x:-key.focus.x,y:key.focus.y}:undefined
  };
}
