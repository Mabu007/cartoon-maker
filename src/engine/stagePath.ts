import { clamp, gaitSpeeds, type Point } from './animation.ts';
import { gaitProfiles, type GaitStyle } from './performanceCatalog.ts';
import { uid, type Clip, type Scene } from './schema.ts';

export type MoveClip = Extract<Clip,{track:'movement'}>;
export type TravelGait = NonNullable<MoveClip['gait']>;
export type PathMode = 'move' | 'enter' | 'exit';

export function stagePath(scene:Scene, actor:string, time:number, points:Point[], gait:TravelGait, style:GaitStyle, mode:PathMode, existing?:MoveClip) {
  if (scene.trackSettings?.movement?.locked) throw new Error('Unlock Movement to edit the path.');
  if (mode!=='move' && scene.trackSettings?.actors?.locked) throw new Error('Unlock Actors to change an entrance or exit.');
  const actorData=scene.actors.find(item=>item.id===actor);
  if(!actorData)throw Error('Select a character in this scene.');
  const nodes=points.map(p=>({x:Math.round(clamp(p.x,-2000,3000)),y:Math.round(clamp(p.y,-2000,3000))}))
    .filter((p,i,all)=>i===0||p.x!==all[i-1].x||p.y!==all[i-1].y);
  const [first]=nodes, last=nodes.at(-1);
  if(nodes.length<2||nodes.length>32||!last)throw new Error('Choose different start and finish points. You can add up to 30 waypoints.');
  const start=existing?.start??clamp(Math.round(time*100)/100,0,scene.duration-(mode==='exit'?.2:.1));
  const lengths=[0];
  for(let i=1;i<nodes.length;i++)lengths.push(lengths[i-1]+Math.hypot(nodes[i].x-nodes[i-1].x,nodes[i].y-nodes[i-1].y));
  const distance=lengths.at(-1)!;
  const matching=scene.clips.filter((c):c is MoveClip=>c.track==='movement'&&c.actor===actor&&c.id!==existing?.id);
  const overlapsStart=(clip:MoveClip)=>clip.start<=start && clip.start+clip.length>start+.0001;
  const fixedPosition=(clip:MoveClip)=>!clip.keyframes&&!clip.gait&&clip.fromX===clip.toX&&clip.fromY===clip.toY;
  if(!existing&&matching.some(clip=>overlapsStart(clip)&&!fixedPosition(clip)))
    throw new Error('The character is already moving at this time. Edit that path or move the playhead.');
  const available=matching.reduce((end,c)=>c.start>start ? Math.min(end,c.start) : end,scene.duration-(mode==='exit'?.1:0))-start;
  if(!existing&&available<.1-.0001)throw new Error('Move the playhead to a spot with more room for movement.');
  const length=existing?.length??Math.min(available,Math.max(.1,Math.round(distance/(gaitSpeeds[gait]*gaitProfiles[style].speed*actorData.scale)*100)/100));
  const clip:MoveClip={id:existing?.id??uid(),track:'movement',actor,gait,style,start,length,fromX:first.x,fromY:first.y,toX:last.x,toY:last.y,
    ...(nodes.length>2?{keyframes:nodes.map((p,i)=>({...p,time:lengths[i]/distance}))}:{})};
  const clips=existing?scene.clips.map(c=>c.id===clip.id?clip:c):[...scene.clips,clip];
  if(mode!=='move')clips.push({id:uid(),track:'actors',actor,visible:mode==='enter',start:mode==='exit'?Math.min(scene.duration-.1,start+length):start,length:.1});
  return {scene:{...scene,clips},clip};
}
