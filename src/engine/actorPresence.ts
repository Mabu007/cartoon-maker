import { gaitSpeeds } from './animation.ts';
import { nextLayerDepth } from './sceneLayers.ts';
import { evaluate } from './evaluate.ts';
import { uid, type ActorData, type Clip, type Scene } from './schema.ts';

export type ActorEntrance='place'|'walk'|'run';
type Gait='walk'|'run';
const cueLength=.1;
const timed=(scene:Scene,time:number)=>Math.max(0,Math.min(scene.duration-cueLength,time));
function visibility(id:string,start:number,visible:boolean):Clip{
  return {id:uid(),track:'actors',actor:id,start,length:cueLength,visible};
}
function path(id:string,fromX:number,fromY:number,toX:number,toY:number,start:number,length:number,gait:Gait):Clip {
  return {id:uid(),track:'movement',actor:id,start,length,fromX,fromY,toX,toY,gait};
}
function travelDuration(distance:number,gait:Gait,remaining:number) {
  return Math.max(.1,Math.min(distance/gaitSpeeds[gait],remaining));
}
function offscreen(x:number) {return x<480?-130:1090;}
function validateStart(scene:Scene,time:number) {
  if(!Number.isFinite(time)||time<0||time>scene.duration-.12)
    throw Error('Move the playhead earlier; an entrance or exit needs at least 0.1 seconds.');
}
function blocked(scene:Scene,id:string,start:number,end:number) {
  return scene.clips.some(clip=>clip.track==='movement'&&clip.actor===id &&
    start<clip.start+clip.length-.001 && end>clip.start+.001);
}
export function addSceneActor(scene:Scene,characterId:string,time:number,entrance:ActorEntrance='place'){
  if(scene.actors.length>=24)throw Error('A scene can have at most 24 characters.');
  if(!characterId)throw Error('Choose a character.');
  validateStart(scene,time);
  const start=timed(scene,time),id=uid();
  const x=Math.min(790,330+(scene.actors.length%5)*95),y=441;
  const actor:ActorData={id,characterId,x,y,scale:1,rotation:0,depth:nextLayerDepth(scene),view:'three-quarter',expression:'neutral',flip:false};
  const entry:Clip[]=[];
  if(start>.01)entry.push(visibility(id,0,false));
  if(entrance==='place') {
    if(start>.01)entry.push(visibility(id,start,true));
  } else {
    if(scene.duration-start<.28)throw Error('Allow at least 0.3 seconds for a character entrance.');
    const fromX=offscreen(x),length=travelDuration(Math.abs(x-fromX),entrance,scene.duration-start-.1);
    entry.push(visibility(id,start,true));
    entry.push(path(id,fromX,y,x,y,start,length,entrance));
  }
  return {scene:{...scene,actors:[...scene.actors,actor],clips:[...scene.clips,...entry]},actorId:id};
}
/** Selected actor is already part of the scene. Add a visible return from outside. */
export function enterSceneActor(scene:Scene,id:string,time:number,gait:Gait) {
  validateStart(scene,time);
  const actor=scene.actors.find(item=>item.id===id);
  if(!actor)throw Error('Select a character in this scene.');
  const start=timed(scene,time);
  if(start>.11 && evaluate(scene,start-.11).actors.find(item=>item.id===id)?.visible)
    throw Error('This character is already on screen. Hide or walk them out before another entrance.');
  const fromX=offscreen(actor.x);
  const duration=travelDuration(Math.abs(fromX-actor.x),gait,scene.duration-start-.1);
  if(duration<.2)throw Error('Move the playhead earlier to add an entrance.');
  if(blocked(scene,id,start,start+duration))throw Error('Another movement overlaps this entrance. Move or trim it first.');
  return {...scene,clips:[...scene.clips,visibility(id,start,true),path(id,fromX,actor.y,actor.x,actor.y,start,duration,gait)]};
}
export function exitSceneActor(scene:Scene,id:string,time:number,gait:Gait) {
  validateStart(scene,time);
  const start=timed(scene,time);
  const actor=evaluate(scene,start).actors.find(item=>item.id===id);
  if(!actor)throw Error('Select a character in this scene.');
  if(!actor.visible)throw Error('This character is already hidden. Use Walk in or Run in instead.');
  if(blocked(scene,id,start,start+.15))throw Error('Another movement overlaps this exit. Move or trim it first.');
  const toX=offscreen(actor.x);
  const duration=travelDuration(Math.abs(toX-actor.x),gait,scene.duration-start-.11);
  if(duration<.2)throw Error('Move the playhead earlier to leave time for an exit.');
  if(blocked(scene,id,start,start+duration))throw Error('Another movement overlaps this exit. Move or trim it first.');
  const hideAt=Math.min(scene.duration-cueLength,start+duration);
  return {...scene,clips:[...scene.clips,path(id,actor.x,actor.y,toX,actor.y,start,duration,gait),visibility(id,hideAt,false)]};
}
export function setActorVisibleAt(scene:Scene,id:string,time:number,visible:boolean){
  validateStart(scene,time);
  if(!scene.actors.some(actor=>actor.id===id))throw Error('Select a character first.');
  return {...scene,clips:[...scene.clips,visibility(id,timed(scene,time),visible)]};
}
