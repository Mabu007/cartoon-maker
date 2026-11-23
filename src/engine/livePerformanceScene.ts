/**
 * Tiny, pure bridge between live MediaPipe observations and SIRVIBE's
 * existing timeline renderer. No second skeleton, art style or animation
 * implementation: the exact Performance clip path used in exported movies
 * also drives the live actor beside the webcam.
 */
import { clamp, mix } from './animation.ts';
import { blendFacialControls } from './facialIntelligence.ts';
import type { PerformanceKey } from './performanceCapture.ts';
import type { Scene, Clip } from './schema.ts';

export const LIVE_PREVIEW_TIME = 2;
export const LIVE_PREVIEW_DURATION = 4;

/** Dampen landmark jitter without accumulating positional drift or
 * mixing angles over a complete revolution. Only observed joints are used. */
export function smoothLivePerformance(
  previous:PerformanceKey|undefined, current:PerformanceKey, smoothing=0.55
):PerformanceKey {
  if(!previous)return current;
  const alpha=clamp(1-clamp(smoothing)*.82,.18,1);
  const pose={...current.pose};
  for(const key of Object.keys(current.pose) as Array<keyof typeof pose>){
    const a=previous.pose[key],b=current.pose[key];
    if(a!==undefined && b!==undefined){
      // Joint rotations are clamped by the retargeter to < 180 degrees.
      // Use shortest angular displacement when crossing the signed boundary.
      const delta=((b-a+540)%360)-180;
      pose[key]=clamp(a+delta*alpha,-180,180);
    }
  }
  return {
    ...current,pose,
    facial:current.facial&&previous.facial
      ?blendFacialControls(previous.facial,current.facial,alpha)
      :current.facial,
    // Discrete hand poses switch immediately so gestures read on the preview.
    hands:current.hands??previous.hands
  };
}

/** Isolated one-actor scene. Evaluate this at LIVE_PREVIEW_TIME, with a
 * two-key constant performance, to reuse the same facial/hand/body engine.
 * The existing project and its timeline remain unchanged. */
export function livePerformanceScene(scene:Scene,actorId:string,key?:PerformanceKey):Scene {
  const source=scene.actors.find(actor=>actor.id===actorId);
  if(!source)throw Error('Select an actor in the current scene to perform as.');
  const actor={...source,x:480,y:468,scale:clamp(source.scale,1,1.25),
    rotation:0,depth:0,gazeTarget:'camera'};
  const performance:Clip[] = key ? [{
    id:'__live-performance-preview',track:'performance',actor:actorId,
    start:0,length:LIVE_PREVIEW_DURATION, name:'Live',
    performance:[{...key,time:0},{...key,time:1}],
    performanceOrigin:'mocap'
  }] : [];
  return {...scene,id:'__live-performance-scene',name:'Live performance preview',
    backgroundImage:undefined,actors:[actor],objects:[],clips:performance,
    trackSettings:undefined,duration:LIVE_PREVIEW_DURATION};
}
