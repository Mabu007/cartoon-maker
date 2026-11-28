import { clamp } from './animation.ts';

export type ScalePoint = { x:number; y:number };

/** Convert a pointer drag into a uniform entity scale, keeping the entity origin fixed. */
export function resizeScaleFromPointer(
  initialScale:number,
  startPointer:ScalePoint,
  pointer:ScalePoint,
  center:ScalePoint,
  snapping=true
):number {
  const startRadius=Math.hypot(startPointer.x-center.x,startPointer.y-center.y);
  if(!Number.isFinite(startRadius)||startRadius<1e-4)return clamp(initialScale,.2,4);
  const radius=Math.hypot(pointer.x-center.x,pointer.y-center.y);
  const step=snapping?.05:.01;
  const raw=clamp(initialScale*radius/startRadius,.2,4);
  return Math.round(clamp(Math.round(raw/step)*step,.2,4)*100)/100;
}
