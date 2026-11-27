import {evaluate} from './evaluate.ts';
import {perspectiveScale} from './environmentVisuals.ts';
import {sceneForces} from './sceneForces.ts';
import {LveSimulation,lveDefaultConfig,type LveDefinitionData,type LveSampler} from './lveSimulation.ts';
import {vectorDrawList,deformRegion,type VectorDrawRegion,type VectorMatrix} from './vectorArtwork.ts';
import type {WorldArtworkData,WorldPlacementData} from './worldArtworkSchema.ts';
import type {Character,Scene,Prop} from './schema.ts';
export type WorldOffsets=Readonly<Record<string,readonly [number,number]>>;
export const layerKey=(id:string)=>'layer:'+id;
export const propKey=(id:string)=>'prop:'+id;
export function worldTransform(x:number,y:number,scale:number,rotation:number,flip=false):VectorMatrix{const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),sx=flip?-scale:scale;return [c*sx,s*sx,-s*scale,c*scale,x,y];}
export const placementScale=(l:WorldPlacementData,scene:Scene)=>l.scale*(l.perspective?perspectiveScale(l.y,scene.visual?.perspective):1);
export const activeWorldProp=(p:Prop)=>p.imageData?undefined:p.worldArtwork;
type Binding={id:string;key:string;group:string;strength:number;layer?:WorldPlacementData;propId?:string;tip:string};
export class WorldDynamics{
 private sim?:LveSimulation;private scene?:Scene;private chars?:readonly Character[];private width=960;private bindings:Binding[]=[];private hz:30|60=30;
 private configure(scene:Scene,characters:readonly Character[],width:number){
  const q=scene.visual?.secondaryMotion;if(!q?.enabled||q.strength===0){this.dispose();return false;}
  if(this.scene===scene&&this.width===width&&this.chars?.length===characters.length&&this.chars.every((c,i)=>c===characters[i]))return !!this.sim;
  this.dispose();this.scene=scene;this.chars=characters;this.width=width;this.hz=q.quality==='eco'?30:60;
  const defs:LveDefinitionData[]=[],bindings:Binding[]=[];let nodes=0;
  const max=q.quality==='eco'?24:48;
  const add=(key:string,art:WorldArtworkData,where:Pick<Binding,'layer'|'propId'>)=>{
   if(art.enabled===false||!art.dynamics?.length||art.strength===0)return;
   for(const d of art.dynamics){if(nodes+d.points.length>max)continue;nodes+=d.points.length;const id='world-'+defs.length,tip='n'+(d.points.length-1);
    defs.push({version:1,id,nodes:d.points.map(([x,y],i)=>({id:'n'+i,rest:{x,y},pin:i===0?1:0,material:d.material})),constraints:d.points.slice(1).map(([x,y],i)=>({a:'n'+i,b:'n'+(i+1),length:Math.hypot(x-d.points[i][0],y-d.points[i][1]),strength:.8,kind:'distance'})),colliders:art.artwork.collisionProxies.filter(p=>d.proxyIds.includes(p.id)).map(p=>({id:p.id,a:{x:p.center[0],y:p.center[1]},b:{x:p.center[0],y:p.center[1]},radius:Math.min(100,p.radius),groups:[d.material.collisionGroup]}))});
    bindings.push({id,key,group:d.group,strength:q.strength*(art.strength??.65),tip,...where});
   }
  };
  for(const l of [...(scene.visual?.world?.layers??[])].sort((a,b)=>a.id.localeCompare(b.id)))add(layerKey(l.id),l.art,{layer:l});
  for(const p of [...scene.objects].sort((a,b)=>a.id.localeCompare(b.id))){const a=activeWorldProp(p);if(a)add(propKey(p.id),a,{propId:p.id});}
  this.bindings=bindings;if(!defs.length)return false;
  this.sim=new LveSimulation(defs,{...lveDefaultConfig,hz:this.hz,seed:q.seed,iterations:q.quality==='eco'?2:4,maxNodesPerActor:10,maxSceneNodes:max,maxConstraints:48,checkpointInterval:this.hz},scene.id+'-world');return true;
 }
 sample(scene:Scene,characters:readonly Character[],time:number,width=960):Map<string,WorldOffsets>{
  if(!this.configure(scene,characters,width)||!this.sim)return new Map();
  const q=scene.visual!.secondaryMotion!,bindings=new Map(this.bindings.map(b=>[b.id,b])),chars=new Map(characters.map(c=>[c.id,c]));
  let cachedTick=-1,props=new Map<string,Prop>(),held=new Set<string>();
  const sampler:LveSampler=(tick,id)=>{const b=bindings.get(id)!,t=tick/this.hz;
   if(b.layer){const l=b.layer;return {transform:worldTransform(l.x,l.y,placementScale(l,scene),l.rotation),forces:sceneForces(q,t,l.x,l.y)};}
   if(cachedTick!==tick){const s=evaluate(scene,t,chars,width);props=new Map(s.objects.map(p=>[p.id,p]));held=new Set(s.actors.filter(a=>a.visible).flatMap(a=>[a.heldItems?.left?.id,a.heldItems?.right?.id,a.held?.id].filter((x):x is string=>!!x)));cachedTick=tick;}
   const p=props.get(b.propId!);if(!p||held.has(p.id))return {transform:[1,0,0,1,0,0],forces:sceneForces(q,t,0,0),sleep:true};
   return {transform:worldTransform(p.x,p.y,p.scale,p.rotation,p.flip),forces:sceneForces(q,t,p.x,p.y)};
  };
  const out=new Map<string,WorldOffsets>();for(const e of this.sim.seek(Math.min(180*this.hz,Math.max(0,Math.floor(time*this.hz+1e-7))),sampler)){const b=bindings.get(e.id)!,tip=e.nodes.find(n=>n.id===b.tip);if(!tip)continue;out.set(b.key,{...out.get(b.key),[b.group]:[Math.round(tip.dx*b.strength*100)/100,Math.round(tip.dy*b.strength*100)/100]});}return out;
 }
 instrumentation(){return this.sim?.instrumentation();}
 dispose(){this.sim?.dispose();this.sim=undefined;this.scene=undefined;this.chars=undefined;this.bindings=[];}
}
const restCache=new WeakMap<WorldArtworkData,VectorDrawRegion[]>();
export function worldDrawList(a:WorldArtworkData,offsets?:WorldOffsets,palette?:Record<string,string>){
 let rest=palette?undefined:restCache.get(a);if(!rest){rest=vectorDrawList(a.artwork,palette)??[];if(!palette)restCache.set(a,rest);}
 if(!offsets||a.enabled===false)return rest;
 const byId=new Map(a.artwork.regions.map(r=>[r.id,r]));
 return rest.map(r=>{const source=byId.get(r.id),q=source?.material&&offsets[source.material.controlGroup];return q?.some(Boolean)?{...r,commands:deformRegion(source!,q)}:r;});
}
