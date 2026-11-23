/** Fixed camera-facing direction for an entire captured acting take.
 * This is a directorial choice, not an inferred webcam head rotation.
 * The current rig already has front and side artwork; mirror its side
 * artwork for left-facing dialogue instead of introducing another rig. */
import type { ActorData, PerformanceFacing, View } from './schema.ts';

export const performanceFacingOptions=['front','left','right'] as const satisfies readonly PerformanceFacing[];

export function performanceFacingView(facing:PerformanceFacing):{view:View;flip:boolean}{
  switch(facing){
    case 'left':return {view:'side',flip:true};
    case 'right':return {view:'side',flip:false};
    default:return {view:'front',flip:false};
  }
}
export function initialPerformanceFacing(actor?:Pick<ActorData,'view'|'flip'>):PerformanceFacing{
  if(actor?.view==='side')return actor.flip?'left':'right';
  return 'front';
}
export const performanceFacesCamera=(facing:PerformanceFacing)=>facing==='front';
