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
  const distance=nodes.reduce((sum,point,i)=>i?sum+Math.hypot(point.x-nodes[i-1].x,point.y-nodes[i-1].y):sum,0);
  const matching=scene.clips.filter((c):c is MoveClip=>c.track==='movement'&&c.actor===actor&&c.id!==existing?.id);
  const overlapsStart=(clip:MoveClip)=>clip.start<=start && clip.start+clip.length>start+.0001;
  const fixedPosition=(clip:MoveClip)=>!clip.keyframes&&!clip.gait&&clip.fromX===clip.toX&&clip.fromY===clip.toY;
  if(!existing&&matching.some(clip=>overlapsStart(clip)&&!fixedPosition(clip)))
    throw new Error('The character is already moving at this time. Edit that path or move the playhead.');
  const available=matching.reduce((end,c)=>c.start>start ? Math.min(end,c.start) : end,scene.duration-(mode==='exit'?.1:0))-start;
  if(!existing&&available<.1-.0001)throw new Error('Move the playhead to a spot with more room for movement.');
  const length=existing?.length??Math.min(available,Math.max(.1,Math.round(distance/(gaitSpeeds[gait]*gaitProfiles[style].speed*actorData.scale)*100)/100));
  const clip:MoveClip={id:existing?.id??uid(),track:'movement',actor,gait,style,start,length,fromX:first.x,fromY:first.y,toX:last.x,toY:last.y,
    ...(nodes.length>2?{keyframes:pathNodes(nodes)}:{})};
  const clips=existing?scene.clips.map(c=>c.id===clip.id?clip:c):[...scene.clips,clip];
  if(mode!=='move')clips.push({id:uid(),track:'actors',actor,visible:mode==='enter',start:mode==='exit'?Math.min(scene.duration-.1,start+length):start,length:.1});
  return {scene:{...scene,clips},clip};
}

export function pathNodes(points:Point[]) {
  const distances=[0];
  for(let index=1;index<points.length;index++){
    const before=points[index-1], point=points[index];
    distances.push(distances[index-1]+Math.hypot(point.x-before.x,point.y-before.y));
  }
  const length=distances.at(-1)||1;
  return points.map((point,index)=>({...point,time:distances[index]/length}));
}

export function insertWaypoint(points:Point[], point:Point) {
  let after=0, distance=Infinity;
  for(let index=0;index<points.length-1;index++){
    const a=points[index], b=points[index+1];
    const dx=b.x-a.x, dy=b.y-a.y;
    const t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/Math.max(1e-8,dx*dx+dy*dy));
    const closest=Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
    if(closest<distance){after=index;distance=closest;}
  }
  return [...points.slice(0,after+1),point,...points.slice(after+1)];
}

/** A local monotone cubic passes through each handle while rounding corners.
 * Matching endpoint tangents avoid a velocity jump at each waypoint.
 */
export function smoothPath(keys:ReturnType<typeof pathNodes>, t:number) {
  const right=keys.findIndex(key=>key.time>=t);
  const end=right<0?keys.length-1:Math.max(1,right), start=end-1;
  const a=keys[start], b=keys[end];
  const window=Math.max(1e-9,b.time-a.time), p=clamp((t-a.time)/window);
  const sample=(axis:'x'|'y')=>{
    const tangent=(index:number)=>{
      if(index===0||index===keys.length-1)return 0;
      const left=keys[index-1], here=keys[index], right=keys[index+1];
      const one=(here[axis]-left[axis])/Math.max(1e-9,here.time-left.time);
      const two=(right[axis]-here[axis])/Math.max(1e-9,right.time-here.time);
      return one*two<=0?0:2*one*two/(one+two);
    };
    const mix=p*p*(3-2*p);
    return (1-mix)*a[axis]+mix*b[axis]+window*p*(1-p)*((1-p)*tangent(start)-p*tangent(end));
  };
  return {x:sample('x'),y:sample('y')};
}
