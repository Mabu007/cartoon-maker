/** Deterministic 2D reach and custody rules for hand-held props.
 * No object teleports into a hand: the actor must walk near the prop and
 * the grasp only engages at the scheduled contact moment. */
import { movementPosition } from './movementPosition.ts';
import { sampleVisual } from './environmentVisuals.ts';
import type { ActorData, Prop, Scene } from './schema.ts';
import { anchorFor } from './interactions.ts';

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
    clip.track==='movement'&&!scene.trackSettings?.movement?.muted&&clip.actor===actorId&&clip.start<=time)
    .reduce<Extract<Scene['clips'][number],{track:'movement'}>|undefined>(
      (latest,clip)=>!latest||clip.start>=latest.start?clip:latest,undefined);
  if(!motion)return actor;
  return movementPosition(motion,(time-motion.start)/motion.length,actor.visual?.perspective===false?undefined:scene.visual?.perspective);
}
/** Resolve every hand transfer in timestamp order. The object location
 * changes only after a legitimate owner releases it; another character
 * can then walk over to the new position to pick it up. All calculations
 * are pure and deterministic, so export and preview agree. */
function resolveHandState(scene:Scene,time:number){
  type Event={id:string;actor:string;prop:string;at:number;kind:'take'|'drop';
    action:'equip'|'release'|'pick-up'|'put-down'|'throw-prop';hand:HandSide;
    pointAt?:Point;inherited?:boolean};
  const events:Event[]=[];
  const fractions:{[k:string]:number}={'pick-up':.50,'put-down':.69,'throw-prop':.46};
  for(const clip of scene.clips){
    if(scene.trackSettings?.[clip.track]?.muted)continue;
    if(clip.track==='props'&&(clip.interaction==='equip'||clip.interaction==='release')){
      if(clip.start<=time)events.push({id:clip.id,actor:clip.actor,prop:clip.target,at:clip.start,
        kind:clip.interaction==='equip'?'take':'drop',action:clip.interaction,
        hand:clip.hand??'right',inherited:clip.inherited});
    }else if(clip.track==='body'&&clip.target&&clip.action in fractions){
      const at=clip.start+clip.length*fractions[clip.action];
      if(at<=time)events.push({id:clip.id,actor:clip.actor,prop:clip.target,at,
        kind:clip.action==='pick-up'?'take':'drop',
        action:clip.action as 'pick-up'|'put-down'|'throw-prop',
        hand:clip.hand??'right',pointAt:clip.pointAt});
    }
  }
  events.sort((a,b)=>a.at-b.at||(a.kind==='drop'?-1:1));
  const owned=new Map<string,{actor:string;hand:HandSide;at:number}>();
  const successfulReleases=new Set<string>();
  const locations=new Map(scene.objects.map(item=>[item.id,{x:item.x,y:item.y}]));
  const actors=new Map(scene.actors.map(actor=>[actor.id,actor]));
  const props=new Map(scene.objects.map(prop=>[prop.id,prop]));
  const movementByActor=new Map<string,Extract<Scene['clips'][number],{track:'movement'}>[]>();
  for(const clip of scene.clips)if(clip.track==='movement'&&!scene.trackSettings?.movement?.muted){
    const group=movementByActor.get(clip.actor)??[];
    group.push(clip);movementByActor.set(clip.actor,group);
  }
  const atPosition=(actorId:string,time:number)=>{
    const actor=actors.get(actorId);
    if(!actor)return undefined;
    const list=movementByActor.get(actorId)??[];
    return actorPositionAt({...scene,clips:list},actorId,time);
  };
  for(const event of events){
    const actor=actors.get(event.actor);
    const prop=props.get(event.prop);
    const at=atPosition(event.actor,event.at);
    if(!actor||!prop||!at)continue;
    const visualActor=sampleVisual({...actor,...at},event.at,at.y,scene.visual?.perspective);
    if(event.kind==='drop'){
      const current=owned.get(event.prop);
      if(current?.actor!==event.actor)continue;
      owned.delete(event.prop);
      successfulReleases.add(event.id);
      const sign=actor.flip?-1:1;
      const next=event.action==='throw-prop'
        ?event.pointAt??{x:at.x+sign*210*visualActor.scale,y:at.y}
        :event.action==='put-down'
          ?{x:at.x+sign*28*visualActor.scale,y:at.y}
          :{x:at.x+sign*42*visualActor.scale,y:at.y-35*visualActor.scale};
      locations.set(event.prop,next);
      continue;
    }
    if(owned.has(event.prop)||anchorFor(prop)?.action!=='hold')continue;
    const place=locations.get(event.prop)??prop;
    if(!event.inherited&&!assessHandReach(visualActor,place).canReach)continue;
    // One prop per hand; custody persists until a matching release.
    if([...owned.values()].some(item=>item.actor===event.actor&&item.hand===event.hand))continue;
    owned.set(event.prop,{actor:event.actor,hand:event.hand,at:event.at});
  }
  return {owned,locations,successfulReleases};
}
/** Same rules for authored action validation and evaluated scene frames. */
export function mayAttachProp(scene:Scene,actorId:string,propId:string,time:number){
  const actor=scene.actors.find(a=>a.id===actorId);
  const prop=scene.objects.find(o=>o.id===propId);
  if(!actor||!prop||anchorFor(prop)?.action!=='hold')return false;
  const at=actorPositionAt(scene,actorId,time);
  const previous=resolveHandState(scene,Math.max(0,time-.0001));
  const current=previous.owned.get(propId);
  return Boolean(at&&(!current||current.actor===actorId)&&
    assessHandReach(sampleVisual({...actor,...at},time,at.y,scene.visual?.perspective),previous.locations.get(propId)??prop).canReach);
}
export function propLocationAt(scene:Scene,propId:string,time:number):Point|undefined{
  return resolveHandState(scene,time).locations.get(propId);
}
export function pickupFeedback(scene:Scene,actorId:string,propId:string,time:number):string|undefined{
  const actor=scene.actors.find(a=>a.id===actorId),prop=scene.objects.find(o=>o.id===propId);
  if(!actor||!prop)return 'Choose an actor and a holdable prop.';
  if(anchorFor(prop)?.action!=='hold')return prop.name+' is scenery, not an object a character can pick up.';
  const at=actorPositionAt(scene,actorId,time);
  if(!at)return 'Place your actor in this scene.';
  const state=resolveHandState(scene,Math.max(0,time-.0001));
  const current=state.owned.get(propId);
  if(current&&current.actor!==actorId)return prop.name+' is already being held by another character.';
  const reach=assessHandReach(sampleVisual({...actor,...at},time,at.y,scene.visual?.perspective),state.locations.get(propId)??prop);
  return reach.canReach?undefined:
    `Walk closer to ${prop.name} before picking it up (${Math.round(reach.distance)} units away; hand reach ${Math.round(reach.limit)}).`;
}
/** At most one owner per object and one object per anatomical hand.
 * Export the complete state to avoid repeated frame scans in the renderer. */
export function resolveHandInteractions(scene:Scene,time:number){
  return resolveHandState(scene,time);
}
export function resolveHandCustody(scene:Scene,time:number){
  return resolveHandInteractions(scene,time).owned;
}
