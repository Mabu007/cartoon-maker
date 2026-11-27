/**
 * Convert MediaPipe's hip-relative, metre-scale 3D pose into the existing
 * 2D cartoon joint coordinate system. Camera data is never persisted.
 *
 * Local X follows the shoulder-to-shoulder axis in the X/Z plane. This
 * makes gestures remain meaningful as the performer turns a little, rather
 * than using a camera-dependent projection for every limb.
 */
import type { Landmark } from './performanceCapture.ts';

export type BodyProjector = {
  /** Fraction of projected shoulder width: ~1 face-on, ~0 side-on. */
  frontness: number;
  /** World-space angle in the rig coordinate convention: 0 down, 180 up. */
  angle: (start: number, end: number) => number | undefined;
  depth: (start: number, end: number) => number | undefined;
};
const isPoint = (p?:Landmark) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && Number.isFinite(p.z ?? 0) && (p.visibility ?? 1) >= .45;
export const wrapDegrees = (angle:number) => ((angle + 180) % 360 + 360) % 360 - 180;
/** Circular interpolation avoids flipping from 179° to -179° mid-sentence. */
export const mixDegrees = (a:number,b:number,t:number) => a + wrapDegrees(b-a)*Math.max(0,Math.min(1,t));

export function worldBodyProjector(points?: readonly Landmark[]): BodyProjector | undefined {
  if(!points || points.length<29 || ![11,12].every(i=>isPoint(points[i])))return undefined;
  const left=points[11],right=points[12];
  const axisX=right.x-left.x,axisZ=(right.z??0)-(left.z??0);
  const width=Math.hypot(axisX,axisZ);
  // Reject collapsed/invalid metric skeletons; use 2D rather than noise.
  if(!Number.isFinite(width) || width<.11 || width>.9)return undefined;
  const horizontalX=axisX/width,horizontalZ=axisZ/width;
  const frontness=Math.abs(horizontalX);
  return {
    frontness,
    angle(a,b){
      const start=points[a],end=points[b];
      if(!isPoint(start)||!isPoint(end))return undefined;
      const lateral=(end.x-start.x)*horizontalX+((end.z??0)-(start.z??0))*horizontalZ;
      const vertical=end.y-start.y;
      if(Math.hypot(lateral,vertical)<.012)return undefined;
      return Math.atan2(lateral,vertical)*180/Math.PI;
    },
    depth(a,b){
      const start=points[a],end=points[b];
      if(!isPoint(start)||!isPoint(end))return undefined;
      // Perpendicular to the shoulder axis: depth of a reach relative to torso.
      return -((end.x-start.x)*(-horizontalZ)+((end.z??0)-(start.z??0))*horizontalX);
    }
  };
}
/** 3D has more stable joint orientation when a wrist is partially foreshortened.
 * 2D remains an anchor, preventing changes of view from flipping the cartoon.
 */
export function fuseWorldAngle(imageAngle:number, worldAngle:number|undefined,frontal:number) {
  if(worldAngle===undefined)return imageAngle;
  const mix=Math.min(.56,Math.max(.3,.32+(1-frontal)*.24));
  const disagreement=wrapDegrees(worldAngle-imageAngle);
  // Strongly conflicting solutions likely indicate an occluded or mirrored
  // landmark. Prefer the visible image projection over a spurious 3D turn.
  return imageAngle + disagreement*(Math.abs(disagreement)>110?mix*.25:mix);
}
