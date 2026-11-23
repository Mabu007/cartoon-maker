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
  if(!hasHead)return pose;
  const torso=clamp(pose.torso??0,-18,18);
  let neck=clamp(pose.neck??0,-8,8);
  let head=clamp(pose.head??0,-18,18);
  // Avoid mechanical overrotation when torso, neck and head all lean in
  // the same direction. The head always retains the opposing correction.
  const target=clamp(torso+neck+head,-23,23);
  head=target-torso-neck;
  // The corrections above can put too much roll into the neck/head if
  // the torso is near its own limits: redistribute without drift.
  if(head>18){
    neck=clamp(neck+(head-18),-8,8);
    head=target-torso-neck;
  }else if(head< -18){
    neck=clamp(neck+(head+18),-8,8);
    head=target-torso-neck;
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
    const width=Math.abs(a.x-b.x);
    const opening=Math.abs(top.y-bottom.y);
    if(width<.014||opening<.002)continue;
    const midX=(a.x+b.x)/2,midY=(top.y+bottom.y)/2;
    if(iris.x<Math.min(a.x,b.x)-width*.25 ||
      iris.x>Math.max(a.x,b.x)+width*.25)continue;
    x+=clamp(-(iris.x-midX)/(width*.28),-1,1);
    y+=clamp((iris.y-midY)/Math.max(.004,opening*.65),-1,1);
    count++;
  }
  if(!count)return undefined;
  const focus={x:clamp(x/count,-1,1),y:clamp(y/count,-1,1)};
  // Eye micro-measurements below this threshold are mostly model jitter.
  if(Math.abs(focus.x)<.08)focus.x=0;
  if(Math.abs(focus.y)<.10)focus.y=0;
  return focus;
}
/** An extreme tracking spike should never swing the face 50 degrees in one
 * pose. Applied only to captured movements, not manually directed animation. */
export function headRoll(pose:JointPose){
  return (pose.torso??0)+(pose.neck??0)+(pose.head??0);
}
