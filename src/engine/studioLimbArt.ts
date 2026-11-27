import { anatomicalSegments, type LimbRegion } from './anatomicalVectorArt.ts';
import type {Graphics} from 'pixi.js';
import type {Point} from './animation.ts';
import {at,vector} from './wardrobeArt.ts';
import {shade} from './illustration.ts';

/** Pose-independent silhouette. X runs along the solved bone; Y is its
 * perpendicular. Width and length are independent so editing proportions
 * or bending a joint never stretches the skeleton or changes IK. */
export function studioBoneFrame(a:Point,b:Point,width:number){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(!Number.isFinite(length)||length<.01||!Number.isFinite(width)||width<=0)return undefined;
  return {x:a.x,y:a.y,length,width,angle:Math.atan2(dy,dx)*180/Math.PI};
}
const silhouette='M-.12 0 Q-.12 -.43 .02 -.51 C.28 -.56 .64 -.37 .88 -.35 Q1.12 -.34 1.12 0 Q1.12 .34 .88 .35 C.64 .37 .28 .56 .02 .51 Q-.12 .43 -.12 0Z';
const shadePanel='M.02 .12 C.31 .25 .65 .2 .88 .13 Q1.08 .11 1.1 .04 Q1.1 .3 .88 .34 C.55 .42 .27 .55 .02 .49 Q-.1 .39 .02 .12Z';
const highlight='M.07 -.38 C.3 -.44 .62 -.3 .81 -.28 C.54 -.24 .24 -.29 .07 -.23Z';
export function drawStudioLimb(g:Graphics,joints:Point[],width:number,color:string){
  // Paint each bone with overlap at joints, then the same native hands/shoes
  // continue to use the original joint anchors. Three reusable paths per bone.
  for(let i=1;i<joints.length;i++){
    const frame=studioBoneFrame(joints[i-1],joints[i],width*(i===1?1:.83));
    if(!frame)continue;
    const transform=at(frame.x,frame.y,frame.length,frame.width,frame.angle);
    vector(g,silhouette,color,shade(color,-.48),1.25,transform);
    vector(g,shadePanel,shade(color,-.19),'none',0,transform);
    vector(g,highlight,shade(color,.14),'none',0,transform);
  }
}

/** Opt-in anatomy artwork. Existing illustrated and classic projects retain
 * their original renderer. Geometry strings are fixed and use the shared path cache. */
export function drawAnatomicalLimb(g:Graphics,joints:Point[],width:number,color:string,region:LimbRegion){
  for(const {frame,art} of anatomicalSegments(joints,width,region)){
    const transform=at(frame.x,frame.y,frame.length,frame.width,frame.angle);
    vector(g,art.outline,color,shade(color,-.34),.65,transform);
    vector(g,art.shadow,shade(color,-.16),'none',0,transform);
    vector(g,art.highlight,shade(color,.12),'none',0,transform);
  }
}
