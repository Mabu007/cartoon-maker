/**
 * SIRVIBE Cinematic Camera Director.
 *
 * One deterministic 2D camera model for editor preview, export and timeline.
 * Framing, composition, angle and movement are independent and can be edited
 * per clip. This is intentionally NOT a fake 3D scene reconstruction: high,
 * low, aerial, worm's-eye, POV and dolly-zoom are compositional 2D treatments.
 * No new image assets, filters, ML, or WebGL render passes are required.
 */
import { HEIGHT, WIDTH, type Clip, type View } from './schema.ts';

export type DirectedCameraClip=Extract<Clip,{track:'camera'}>;
export type CameraActor={id:string;x:number;y:number;scale:number;visible:boolean;lift:number};
export type CameraProp={id:string;x:number;y:number;scale:number};
export type DirectedCamera={x:number;y:number;zoom:number;roll?:number;view?:View};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const ease=(t:number)=>{const p=clamp(t,0,1);return p*p*(3-2*p);};
const baseCamera=():DirectedCamera=>({x:WIDTH/2,y:HEIGHT/2,zoom:1});
const zooms:Record<string,number>={
  'extreme-wide':1,'wide':1,'full':1.2,'medium-long':1.42,
  'cowboy':1.6,'medium':1.64,'medium-close-up':2.05,
  'close-up':2.26,'big-close-up':2.95,'extreme-close-up':3.35,
  'over-shoulder':1.95,'reaction':2.26,'insert':3.2,'cutaway':2.3,
  'point-of-view':2.0,'shot-reverse-shot':2.05,
  'pan':1.28,'tilt':1.28,'zoom':1.64,'follow':1.28,
  'front':1.28,'side':1.28,'back':1.28
};
type Subject={id:string;x:number;y:number;scale:number;lift:number;kind:'actor'|'prop'};
const asSubject=(actor:CameraActor):Subject=>({...actor,kind:'actor'});
const asProp=(prop:CameraProp):Subject=>({...prop,lift:0,kind:'prop'});
const heightAt=(subject:Subject,close=false)=>subject.kind==='prop'
  ? subject.y-30*subject.scale
  : subject.y-(close?157:113)*subject.scale-subject.lift;
function clampCamera(camera:DirectedCamera,viewportWidth:number):DirectedCamera{
  const halfX=viewportWidth/(2*camera.zoom),halfY=HEIGHT/(2*camera.zoom);
  const clampAxis=(value:number,half:number,size:number)=>half>size/2?size/2:clamp(value,half,size-half);
  return {...camera,
    x:clampAxis(camera.x,halfX,WIDTH),
    y:clampAxis(camera.y,halfY,HEIGHT)};
}
function angleFrame(camera:DirectedCamera,clip:DirectedCameraClip,width:number):DirectedCamera{
  const result={...camera};
  switch(clip.angle){
    case 'high-angle':result.zoom=Math.max(1.16,result.zoom);result.y+=50;break;
    case 'low-angle':result.zoom=Math.max(1.16,result.zoom);result.y-=48;break;
    case 'birds-eye':result.zoom=Math.max(1.2,result.zoom*.85);result.y+=100;break;
    case 'worms-eye':result.zoom=Math.max(1.45,result.zoom);result.y-=85;break;
    case 'aerial':result.zoom=1;result.y=HEIGHT/2;result.x=WIDTH/2;break;
  }
  const roll=clip.roll??(clip.angle==='dutch-angle'?12:0);
  if(roll){
    result.roll=roll;
    // The inverse-rotated viewport corners must remain inside the authored
    // 960×540 world. This analytic overscan prevents blank Dutch corners
    // without extra background geometry, filters or 3D processing.
    const radians=Math.abs(roll)*Math.PI/180;
    const coverage=Math.cos(radians)+Math.sin(radians)*WIDTH/HEIGHT;
    result.zoom=Math.max(result.zoom,coverage);
  }
  return clampCamera(result,width);
}
function nearest(subject:Subject,candidates:CameraActor[]) {
  return candidates.filter(a=>a.id!==subject.id).sort((a,b)=>
    Math.abs(a.x-subject.x)-Math.abs(b.x-subject.x))[0];
}
/** Static compositional end state at this moment. Subject movement remains
 * live, even while the shot is held, and is evaluated independently of UI. */
export function cameraFraming(
  clip:DirectedCameraClip|undefined,actors:readonly CameraActor[],
  props:readonly CameraProp[],t:number,viewportWidth=WIDTH
):DirectedCamera {
  if(!clip)return baseCamera();
  const visible=actors.filter(actor=>actor.visible);
  const focusedActor=visible.find(actor=>actor.id===clip.focus);
  const focusedProp=props.find(prop=>prop.id===clip.focus);
  const defaultActor=focusedActor??visible[0];
  const defaultSubject=focusedProp?asProp(focusedProp):defaultActor?asSubject(defaultActor):undefined;
  if(!defaultSubject)return angleFrame(baseCamera(),clip,viewportWidth);
  const shot=clip.shot;
  const composition=clip.composition??shot;
  const partner=defaultActor?nearest(asSubject(defaultActor),visible):undefined;
  if((!clip.composition&&(shot==='wide'||shot==='establishing'||shot==='extreme-wide'||shot==='master'))||
    composition==='establishing'||composition==='master'){
    const center=clip.focus?defaultSubject.x:WIDTH/2;
    return angleFrame({x:center,y:HEIGHT/2,zoom:1},clip,viewportWidth);
  }
  if(['two-shot','three-shot','group-shot'].includes(composition)){
    const count=composition==='two-shot'?2:composition==='three-shot'?3:visible.length;
    const selected=defaultActor
      ?[defaultActor,...visible.filter(a=>a.id!==defaultActor.id)
        .sort((a,b)=>Math.abs(a.x-defaultActor.x)-Math.abs(b.x-defaultActor.x))].slice(0,count)
      :visible.slice(0,count);
    if(selected.length){
      const left=Math.min(...selected.map(a=>a.x-72*a.scale));
      const right=Math.max(...selected.map(a=>a.x+72*a.scale));
      const spread=right-left;
      const limit=composition==='two-shot'?1.55:composition==='three-shot'?1.42:1.3;
      const zoom=clamp((viewportWidth-160)/(spread+78),1,limit);
      const y=selected.reduce((sum,a)=>sum+a.y-120*a.scale-a.lift,0)/selected.length;
      return angleFrame({x:(left+right)/2,y,zoom},clip,viewportWidth);
    }
  }
  let subject=defaultSubject;
  if(composition==='point-of-view'&&defaultActor&&partner)subject=asSubject(partner);
  if(composition==='shot-reverse-shot'&&defaultActor&&partner &&
    (t-clip.start)/clip.length>=.5)subject=asSubject(partner);
  const close=['close-up','big-close-up','extreme-close-up','medium-close-up'].includes(shot)||
    ['reaction','insert','point-of-view','shot-reverse-shot'].includes(composition);
  let zoom=zooms[shot]??1.28;
  let x=subject.x,y=heightAt(subject,close);
  if(composition==='over-shoulder'&&partner)x+=.24*(partner.x-subject.x);
  if(composition==='shot-reverse-shot'&&defaultActor&&partner){
    const other=subject.id===defaultActor.id?partner:defaultActor;
    x+=(other.x-subject.x)*.12;
  }
  if(shot==='full')y=subject.kind==='actor'?subject.y-145*subject.scale-subject.lift:y;
  if(shot==='cowboy'||shot==='medium-long')y=subject.kind==='actor'
    ?subject.y-128*subject.scale-subject.lift:y;
  const view=shot==='front'||shot==='side'||shot==='back'?shot:undefined;
  return angleFrame({x,y,zoom,...(view?{view}:{})},clip,viewportWidth);
}
const inheritedMotion=(shot:string)=>{
  if(shot==='pan')return 'pan-right';
  if(shot==='tilt')return 'tilt-down';
  if(shot==='zoom')return 'zoom-in';
  if(shot==='follow')return 'follow';
  return 'none';
};
function interpolate(from:DirectedCamera,to:DirectedCamera,t:number):DirectedCamera{
  return {
    x:mix(from.x,to.x,t),y:mix(from.y,to.y,t),
    zoom:mix(from.zoom,to.zoom,t),
    ...((from.roll||to.roll)?{roll:mix(from.roll??0,to.roll??0,t)}:{}),
    ...(to.view?{view:to.view}:from.view?{view:from.view}:{})
  };
}
/** Motion is deterministic at any timestamp: no mutable spring, RAF count,
 * accumulated drift or random shake. This makes exported frames identical
 * to the preview at the same scene time. */
export function directCamera(
  clip:DirectedCameraClip|undefined,previous:DirectedCameraClip|undefined,
  actors:readonly CameraActor[],props:readonly CameraProp[],
  time:number,viewportWidth=WIDTH
):DirectedCamera {
  const before=cameraFraming(previous,actors,props,time,viewportWidth);
  if(!clip)return baseCamera();
  if(clip.shot==='hold')return before;
  const destination=cameraFraming(clip,actors,props,time,viewportWidth);
  const movement=clip.movement??inheritedMotion(clip.shot);
  const strength=clip.strength??1;
  if(movement==='none'){
    if(clip.transition!=='glide')return destination;
    return interpolate(before,destination,ease((time-clip.start)/Math.min(.7,clip.length)));
  }
  const end={...destination};
  const shift=150*strength;
  let speed=(time-clip.start)/clip.length;
  switch(movement){
    case 'pan-left':case 'truck-left':end.x-=shift;end.zoom=Math.max(end.zoom,1.28);break;
    case 'pan-right':case 'truck-right':end.x+=shift;end.zoom=Math.max(end.zoom,1.28);break;
    case 'tilt-up':case 'pedestal-up':end.y-=94*strength;end.zoom=Math.max(end.zoom,1.28);break;
    case 'tilt-down':case 'pedestal-down':end.y+=94*strength;end.zoom=Math.max(end.zoom,1.28);break;
    case 'zoom-in':case 'dolly-in':end.zoom*=1+.3*strength;break;
    case 'zoom-out':case 'dolly-out':end.zoom=Math.max(1,end.zoom/(1+.3*strength));break;
    case 'dolly-zoom':
      // A 2D approximation only: no focal-length change or depth parallax.
      end.zoom*=1+.37*strength;end.y-=34*strength;break;
    case 'whip-pan-left':end.x-=260*strength;end.zoom=Math.max(end.zoom,1.4);speed*=3.7;break;
    case 'whip-pan-right':end.x+=260*strength;end.zoom=Math.max(end.zoom,1.4);speed*=3.7;break;
    case 'crane-up':end.x+=65*strength;end.y-=120*strength;end.zoom*=1.1;break;
    case 'crane-down':end.x-=65*strength;end.y+=120*strength;end.zoom*=1.1;break;
    case 'handheld':case 'steadicam':case 'gimbal':case 'follow':break;
  }
  const target=clampCamera(end,viewportWidth);
  const result=interpolate(before,target,ease(speed));
  if(movement==='handheld'){
    const beat=time-clip.start;
    result.x+=Math.sin(beat*10.7)*5*strength;
    result.y+=Math.cos(beat*8.3)*3.5*strength;
    result.roll=(result.roll??0)+Math.sin(beat*7.2)*1.2*strength;
  }
  return result;
}

/** UI language must distinguish visual framing from physical 3D optics. */
export function cameraDirectionHint(shot:DirectedCameraClip['shot'],angle:string,movement:string){
  if(['birds-eye','worms-eye','aerial'].includes(angle))
    return 'Stylized 2D framing only: a true overhead or upward camera requires perspective-specific background and character artwork.';
  if(angle==='high-angle'||angle==='low-angle')
    return 'Simulated high/low angle uses 2D reframing, not a newly rendered 3D viewpoint.';
  if(movement==='dolly-zoom')
    return '2D dolly-zoom approximation: reframing and zoom only, without optical perspective or background parallax.';
  if(['point-of-view','over-shoulder'].includes(shot))
    return '2D perspective approximation. Use actor or prop focus and arrange foreground characters on stage for a convincing result.';
  if(['truck-left','truck-right','crane-up','crane-down'].includes(movement))
    return '2D camera translation. True depth parallax is not available in the flat scene.';
  if(movement==='handheld')
    return 'Subtle deterministic handheld motion, previewed and exported identically.';
  if(movement.startsWith('whip-pan'))
    return 'A fast horizontal camera sweep without computationally expensive motion blur.';
  return 'Camera framing is non-destructive. One camera clip is active at a time and is export-ready.';
}
