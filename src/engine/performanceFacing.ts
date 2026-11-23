/** Fixed camera-facing direction for an entire captured acting take.
 * This is a directorial choice, not an inferred webcam head rotation.
 * Uses the existing front and front-three-quarter artwork, mirrored for
 * opposing dialogue angles. Never substitute full side-profile artwork. */
import type { ActorData, PerformanceFacing, View } from './schema.ts';

export const performanceFacingOptions=['front','left','right'] as const satisfies readonly PerformanceFacing[];

export function performanceFacingView(facing:PerformanceFacing):{view:View;flip:boolean}{
  switch(facing){
    case 'left':return {view:'three-quarter',flip:true};
    case 'right':return {view:'three-quarter',flip:false};
    default:return {view:'front',flip:false};
  }
}
export function initialPerformanceFacing(actor?:Pick<ActorData,'view'|'flip'>):PerformanceFacing{
  if(actor?.view==='three-quarter'||actor?.view==='side')return actor.flip?'left':'right';
  return 'front';
}
export const performanceFacesCamera=(facing:PerformanceFacing)=>facing==='front';
