import {clamp,ease,mix,travelProgress} from './animation.ts';
import {smoothPath} from './stagePath.ts';
import {perspectiveScale,type PerspectiveData} from './environmentVisuals.ts';
import type {Clip} from './schema.ts';

/** Pure deterministic sampler shared by preview, props and imported JSON playback. */
function flatMovementPosition(clip: Extract<Clip, { track: 'movement' }>, progress: number): { x: number; y: number } {
  const t = clamp(progress);
  const keys = clip.keyframes;
  if (!keys?.length) {
    const weight = clip.gait ? travelProgress(t) : ease(t);
    return { x: mix(clip.fromX, clip.toX, weight), y: mix(clip.fromY, clip.toY, weight) };
  }
  if(keys.length===1)return {x:keys[0].x,y:keys[0].y};
  if(clip.style)return smoothPath(keys,t);
  const rightIndex = keys.findIndex(key => key.time >= t);
  const right = keys[Math.max(1, rightIndex < 0 ? keys.length - 1 : rightIndex)];
  const left = keys[Math.max(0, (rightIndex < 0 ? keys.length - 1 : rightIndex) - 1)];
  const weight = clamp((t - left.time) / Math.max(1e-9, right.time - left.time));
  return { x: mix(left.x, right.x, weight), y: mix(left.y, right.y, weight) };
}
const perspectiveMotionCache=new WeakMap<object,WeakMap<object,Float64Array>>();
/** Retiming is explicitly enabled by the director. Cached image-space timing weights
 * slow movement at smaller ground scales; no new animation clock or solver is used. */
export function movementPosition(clip:Extract<Clip,{track:'movement'}>,progress:number,perspective?:PerspectiveData){
  if(!perspective?.enabled||!perspective.retimeMovement)return flatMovementPosition(clip,progress);
  let cache=perspectiveMotionCache.get(clip);if(!cache){cache=new WeakMap();perspectiveMotionCache.set(clip,cache);}
  let curve=cache.get(perspective);
  if(!curve){curve=new Float64Array(65);for(let i=1;i<=64;i++){const point=flatMovementPosition(clip,(i-.5)/64);curve[i]=curve[i-1]+1/perspectiveScale(point.y,perspective);}cache.set(perspective,curve);}
  const target=clamp(progress)*curve[64];let low=0,high=64;
  while(high-low>1){const middle=(low+high)>>1;if(curve[middle]<=target)low=middle;else high=middle;}
  const weight=clamp((target-curve[low])/Math.max(1e-9,curve[high]-curve[low]));
  return flatMovementPosition(clip,(low+weight)/64);
}
