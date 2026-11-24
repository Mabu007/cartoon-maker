/**
 * Physically bounded head acting and independent pupil gaze for SIRVIBE.
 * These pure functions are shared by live capture, timeline evaluation and
 * export; no webcam pixels, neural inference or frame history is stored.
 */
import type { JointPose } from './schema.ts';
import type { Landmark } from './performanceCapture.ts';
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const finite=(p?:Landmark)=>Boolean(p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
/** Never exceed a believable cartoon head/neck roll even if MediaPipe
 * briefly mistakes a tilted or partially occluded face for a full turn.
 * The complete torso+neck+head rotation drives the actual face container. */
export function constrainCapturedHead(pose:JointPose):JointPose {
  const hasHead=pose.head!==undefined||pose.neck!==undefined;
  if(!hasHead&&pose.torso===undefined)return pose;
  let torso=clamp(pose.torso??0,-18,18);
  // With the face out of frame, constrain the measured torso without
  // inventing a previously unobserved head or neck direction.
  if(!hasHead)return {...pose,torso};
  let neck=clamp(pose.neck??0,-8,8);
  let head=clamp(pose.head??0,-18,18);
  // Preserve the direction and proportional acting intention of all three
  // joints. Correcting only the head caused it to *reverse direction*
  // when the torso and neck were both heavily tilted.
  const total=torso+neck+head;
  if(Math.abs(total)>23){
    const proportion=23/Math.abs(total);
    torso*=proportion;
    neck*=proportion;
    head*=proportion;
  }
  return {...pose,torso,neck,head};
}
/** Face Landmarker produces 478 points when iris refinement is available.
 * Iris centers 468/473 are observed eye positions, unlike the Pose model's
 * two exterior eye landmarks, which only support head orientation.
 *
 * Coordinates are normalized by the subject's own eye aperture and corrected
 * to SIRVIBE's mirrored front-facing cartoon convention. */
export function observedIrisFocus(
  mesh:readonly Landmark[]|undefined
):{x:number;y:number}|undefined{
  if(!mesh||mesh.length<474)return undefined;
  const eyes=[
    {iris:468,outer:33,inner:133,top:159,bottom:145},
    {iris:473,outer:362,inner:263,top:386,bottom:374}
  ];
  let x=0,y=0,count=0;
  for(const e of eyes){
    const iris=mesh[e.iris],a=mesh[e.outer],b=mesh[e.inner],
      top=mesh[e.top],bottom=mesh[e.bottom];
    if(!finite(iris)||!finite(a)||!finite(b)||!finite(top)||!finite(bottom))continue;
    // Resolve the pupil in the eye's own coordinate frame. Using raw
    // horizontal/vertical deltas made iris movement appear to change as
    // the person tilted their head, even with both pupils stationary.
    const dx=b.x-a.x,dy=b.y-a.y;
    const width=Math.hypot(dx,dy);
    if(width<.014)continue;
    const tx=dx/width,ty=dy/width;
    const nx=-ty,ny=tx;
    const lidX=(top.x+bottom.x)/2,lidY=(top.y+bottom.y)/2;
    const opening=Math.abs((bottom.x-top.x)*nx+(bottom.y-top.y)*ny);
    if(opening<.002)continue;
    const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
    const horizontal=(iris.x-midX)*tx+(iris.y-midY)*ty;
    const vertical=(iris.x-lidX)*nx+(iris.y-lidY)*ny;
    if(Math.abs(horizontal)>width*.75||Math.abs(vertical)>opening*1.5)continue;
    x+=clamp(-horizontal/(width*.28),-1,1);
    y+=clamp(vertical/Math.max(.004,opening*.65),-1,1);
    count++;
  }
  if(!count)return undefined;
  const focus={x:clamp(x/count,-1,1),y:clamp(y/count,-1,1)};
  // Eye micro-measurements below this threshold are mostly model jitter.
  if(Math.abs(focus.x)<.08)focus.x=0;
  if(Math.abs(focus.y)<.10)focus.y=0;
  return focus;
}
/** A small, dimensionless left/right yaw cue from visible facial geometry.
 * The eyes establish head width; nose displacement suggests a *subtle*
 * three-quarter turn. It does not estimate true 3D head rotation. */
export function estimateHeadYaw(
  nose:Landmark|undefined,eyeA:Landmark|undefined,eyeB:Landmark|undefined
):number|undefined{
  if(!nose||!eyeA||!eyeB||!finite(nose)||!finite(eyeA)||!finite(eyeB))return undefined;
  const width=Math.hypot(eyeA.x-eyeB.x,eyeA.y-eyeB.y);
  if(width<.018)return undefined;
  const center=(eyeA.x+eyeB.x)/2;
  // The camera is unmirrored; positive raw X is left in the selfie view.
  // Positive yaw selects the left-facing artwork, not the right-facing one.
  return clamp((nose.x-center)/(width*.35),-1,1);
}
/** Two thresholds separate entering/leaving a turn, preventing rapid
 * front/left/right oscillation from uncertain nose detections. */
export function headFacingForYaw(yaw:number,previous:'front'|'left'|'right'='front'){
  if(previous==='left'&&yaw>.09)return 'left';
  if(previous==='right'&&yaw<-.09)return 'right';
  if(yaw>.30)return 'left';
  if(yaw<-.30)return 'right';
  return 'front';
}

/** An extreme tracking spike should never swing the face 50 degrees in one
 * pose. Applied only to captured movements, not manually directed animation. */
export function headRoll(pose:JointPose){
  return (pose.torso??0)+(pose.neck??0)+(pose.head??0);
}
