/** Deterministic 2D reach and custody rules for hand-held props.
 * No object teleports into a hand: the actor must walk near the prop and
 * the grasp only engages at the scheduled contact moment. */
import { clamp, ease, mix, travelProgress } from './animation.ts';
import { smoothPath } from './stagePath.ts';
import type { ActorData, Prop, Scene } from './schema.ts';

export type Point={x:number;y:number};
export type HandSide='left'|'right';
export type ReachAssessment={canReach:boolean;distance:number;limit:number;vertical:number};
export function assessHandReach(actor:Pick<ActorData,'x'|'y'|'scale'>,prop:Pick<Prop,'x'|'y'>):ReachAssessment{
  const horizontal=Math.abs(actor.x-prop.x);
  const vertical=Math.abs(actor.y-prop.y);
  const limit=95*actor.scale,verticalLimit=100*actor.scale;
  // The handle is in the performer's forearm zone, not at its feet:
  // the vertical tolerance allows objects lying at floor height.
  return {canReach:horizontal<=limit&&vertical<=verticalLimit,
    distance:horizontal,limit,vertical};
}
export function actorPositionAt(scene:Scene,actorId:string,time:number):Point|undefined{
  const actor=scene.actors.find(item=>item.id===actorId);
  if(!actor)return undefined;
  const motion=scene.clips.filter((clip):clip is Extract<Scene['clips'][number],{track:'movement'}>=>
    clip.track==='movement'&&clip.actor===actorId&&clip.start<=time)
    .reduce<Extract<Scene['clips'][number],{track:'movement'}>|undefined>(
      (latest,clip)=>!latest||clip.start>=latest.start?clip:latest,undefined);
  if(!motion)return actor;
  const t=clamp((time-motion.start)/motion.length);
  if(motion.keyframes?.length){
    if(motion.style)return smoothPath(motion.keyframes,t);
    const after=motion.keyframes.findIndex(key=>key.time>=t);
    const i=Math.max(1,after<0?motion.keyframes.length-1:after);
    const a=motion.keyframes[i-1],b=motion.keyframes[i];
    const ratio=clamp((t-a.time)/Math.max(1e-9,b.time-a.time));
    return {x:mix(a.x,b.x,ratio),y:mix(a.y,b.y,ratio)};
  }
  const weight=motion.gait?travelProgress(t):ease(t);
  return {x:mix(motion.fromX,motion.toX,weight),
    y:mix(motion.fromY,motion.toY,weight)};
}
/** Used by both clip creation and frame evaluation; no hidden proximity
 * exceptions for body actions or object equip cues. */
export function mayAttachProp(scene:Scene,actorId:string,propId:string,time:number){
  const actor=scene.actors.find(a=>a.id===actorId);
  const prop=scene.objects.find(o=>o.id===propId);
  if(!actor||!prop)return false;
  const position=actorPositionAt(scene,actorId,time);
  return Boolean(position&&assessHandReach({...actor,...position},prop).canReach);
}
export function pickupFeedback(scene:Scene,actorId:string,propId:string,time:number):string|undefined{
  const actor=scene.actors.find(a=>a.id===actorId),prop=scene.objects.find(o=>o.id===propId);
  if(!actor||!prop)return 'Choose an actor and a holdable prop.';
  const at=actorPositionAt(scene,actorId,time);
  if(!at)return 'Place your actor in this scene.';
  const reach=assessHandReach({...actor,...at},prop);
  return reach.canReach?undefined:
    `Walk closer to ${prop.name} before picking it up (${Math.round(reach.distance)} units away; hand reach ${Math.round(reach.limit)}).`;
}
/** Resolve prop ownership at a timestamp with one owner per object. For
 * overlapping scheduled grabs the first valid contact retains custody. */
export function resolveHandCustody(scene:Scene,time:number){
  type Event={actor:string;prop:string;at:number;kind:'take'|'drop';hand:HandSide};
  const events:Event[]=[];
  for(const clip of scene.clips){
    if(clip.track==='props'&&(clip.interaction==='equip'||clip.interaction==='release')){
      if(clip.start<=time)events.push({actor:clip.actor,prop:clip.target,at:clip.start,
        kind:clip.interaction==='equip'?'take':'drop',hand:clip.hand??'right'});
    }else if(clip.track==='body'&&clip.target&&
      ['pick-up','put-down','throw-prop'].includes(clip.action)){
      const fractions:{[k:string]:number}={'pick-up':.48,'put-down':.48,'throw-prop':.58};
      const at=clip.start+clip.length*fractions[clip.action];
      if(at<=time)events.push({actor:clip.actor,prop:clip.target,at,
        kind:clip.action==='pick-up'?'take':'drop',hand:clip.hand??'right'});
    }
  }
  events.sort((a,b)=>a.at-b.at || (a.kind==='drop'?-1:1));
  const owned=new Map<string,{actor:string;hand:HandSide;at:number}>();
  for(const event of events){
    if(event.kind==='drop'){
      if(owned.get(event.prop)?.actor===event.actor)owned.delete(event.prop);
      continue;
    }
    if(owned.has(event.prop)||!mayAttachProp(scene,event.actor,event.prop,event.at))continue;
    // A hand can hold only one object. Replacing a held prop requires
    // a release, not attaching multiple objects to one invisible wrist.
    if([...owned.values()].some(item=>item.actor===event.actor&&item.hand===event.hand))continue;
    owned.set(event.prop,{actor:event.actor,hand:event.hand,at:event.at});
  }
  return owned;
}
