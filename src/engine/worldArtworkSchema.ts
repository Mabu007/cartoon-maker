import {z} from 'zod';
import {VectorArtworkV1,vectorDrawList} from './vectorArtwork.ts';
import {LveMaterial} from './lveSimulation.ts';
const n=(a:number,b:number)=>z.number().finite().min(a).max(b);
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
export const nativeWorldPropKinds=['cup','book','phone','table','counter','plant'] as const;
export type NativeWorldPropKind=typeof nativeWorldPropKinds[number];
export const worldPropBounds:Record<NativeWorldPropKind,readonly [number,number]>={cup:[33,28],book:[55,12],phone:[25,33],table:[188,68],counter:[155,110],plant:[76,113]};
export function worldPropCompatible(kind:string,art:WorldArtworkData){if(!nativeWorldPropKinds.includes(kind as NativeWorldPropKind))return false;const [w,h]=worldPropBounds[kind as NativeWorldPropKind],[x,y,x1,y1]=art.artwork.bounds;return x>=-w/2&&x1<=w/2&&y>=-h&&y1<=5;}
export const worldLayers=['background','midground','foreground'] as const;
export const worldKinds=['curtain','flag','branch','hanging-sign','hanging-light','furniture','household','architecture','prop'] as const;
export const worldArtLimits={layers:20,commands:8192,nodes:48,groups:2,points:5,displacement:8,coordinate:180} as const;
export const WorldSource=z.strictObject({id,revision:z.number().int().min(1).max(1_000_000),license:z.string().min(1).max(500),provenance:z.string().min(1).max(500)});
const point=z.tuple([n(-180,180),n(-180,180)]);
export const WorldArtwork=z.strictObject({
 version:z.literal(1),id,source:WorldSource.optional(),kind:z.enum(worldKinds),artwork:VectorArtworkV1,
 dynamics:z.array(z.strictObject({group:id,points:z.array(point).min(2).max(worldArtLimits.points),material:LveMaterial,proxyIds:z.array(id).max(4)})).max(worldArtLimits.groups).optional(),
 enabled:z.boolean().optional(),strength:n(0,1).optional()
}).superRefine((v,ctx)=>{
 const a=v.artwork,issue=(path:string[],message:string)=>ctx.addIssue({code:'custom',path,message});
 if(a.units!=='rig'||a.pivot.some(x=>x!==0)||a.bounds.some(x=>Math.abs(x)>worldArtLimits.coordinate)||!vectorDrawList(a))issue(['artwork'],'World artwork requires supported single-subpath rig geometry, origin pivot and bounded coordinates');
 if(a.regions.some(r=>r.transform))issue(['artwork','regions'],'World region transforms are unsupported; use placement transform');
 if(a.poses.length)issue(['artwork','poses'],'World artwork has no authored pose variants');
 const seen=new Set<string>();
 for(const d of v.dynamics??[]){
  const regions=a.regions.filter(r=>r.material?.controlGroup===d.group);
  if(seen.has(d.group)||!a.controlGroups.includes(d.group)||!regions.length||d.material.maxDisplacement>worldArtLimits.displacement||d.proxyIds.some(id=>!a.collisionProxies.some(p=>p.id===id))||new Set(d.proxyIds).size!==d.proxyIds.length||d.points.some(([x,y],i)=>x<a.bounds[0]||x>a.bounds[2]||y<a.bounds[1]||y>a.bounds[3]||i>0&&Math.hypot(x-d.points[i-1][0],y-d.points[i-1][1])<.01)||!regions.some(r=>r.material!.weights.some(w=>w.pin===1))||!regions.some(r=>r.material!.weights.some(w=>w.pin<1&&w.influence>0)))issue(['dynamics'],'Invalid world group, weighted pins, material, proxy or chain bounds');
  seen.add(d.group);
 }
});
export type WorldArtworkData=z.infer<typeof WorldArtwork>;
export const WorldPlacement=z.strictObject({id,art:WorldArtwork,layer:z.enum(worldLayers),x:n(-2000,3000),y:n(-2000,3000),scale:n(.1,8),rotation:n(-360,360),depth:n(-1000,1000),lighting:z.boolean(),perspective:z.boolean(),occluder:z.boolean()});
export type WorldPlacementData=z.infer<typeof WorldPlacement>;
export const WorldSet=z.strictObject({version:z.literal(1),id,source:WorldSource.optional(),name:z.string().min(1).max(70),layers:z.array(WorldPlacement).min(1).max(worldArtLimits.layers),walkable:z.array(z.strictObject({x:n(-2000,3000),y:n(-2000,3000)})).min(3).max(80),surfaces:z.array(z.strictObject({id,x:n(-2000,3000),y:n(-2000,3000),width:n(1,1000),kind:z.enum(['floor','table','counter'])})).max(12)}).superRefine((v,ctx)=>{
 if(new Set(v.layers.map(x=>x.id)).size!==v.layers.length||new Set(v.surfaces.map(x=>x.id)).size!==v.surfaces.length)ctx.addIssue({code:'custom',message:'Duplicate world layer/surface identity'});
 let nodes=0,commands=0;for(const l of v.layers){nodes+=(l.art.dynamics??[]).reduce((n,d)=>n+d.points.length,0);commands+=l.art.artwork.regions.reduce((n,r)=>n+r.commands.length,0);}
 if(nodes>worldArtLimits.nodes||commands>worldArtLimits.commands)ctx.addIssue({code:'custom',message:'World set aggregate budget exceeded'});
});
export type WorldSetData=z.infer<typeof WorldSet>;
