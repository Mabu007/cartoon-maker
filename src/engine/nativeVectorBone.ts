import type {ArtworkPoseClass} from './primaryArtworkPose.ts';
import {isBoneSlot} from './artworkGeometry.ts';
import {VectorArtworkV1} from './vectorArtwork.ts';
import {vectorDrawList,worldPoint,type VectorDrawRegion,type VectorMatrix,type VectorCommand} from './vectorArtwork.ts';
import type {NativeVectorComponentData,CompiledArtwork} from './visualAssets.ts';
import type {Character,View} from './schema.ts';
import type {Point} from './artworkGeometry.ts';
/** Explicit facing art is selected in pre-global-mirror coordinates.
 * Unspecified direction requires mirror-safe geometry; fixed slots still fall back. */
export function nativePartFor(c:Character,slot:NativeVectorComponentData['slot'],view:View,mirrored=false){
  return c.visual?.vectorComponents?.find(p=>p.slot===slot&&p.view===view&&p.profiles.includes(c.visual!.profile)&&(p.facing?p.facing===(mirrored?'mirrored':'normal'):p.artwork.compatibility.mirrorSafe));
}
const poseParts=new WeakMap<NativeVectorComponentData,Map<ArtworkPoseClass,NativeVectorComponentData>>();
const fittedParts=new WeakMap<NativeVectorComponentData,Map<string,NativeVectorComponentData>>();
export function nativeBoneFor(c:Character,slot:CompiledArtwork['slot'],view:View,mirrored=false,pose:ArtworkPoseClass='rest'){
  let part=nativePartFor(c,slot,view,mirrored);
  if(!part||!isBoneSlot(slot)||part.artwork.units!=='bone-normalized')return;
  const variant=part.poseArtwork?.find(v=>v.pose===pose);if(variant){let variants=poseParts.get(part);if(!variants){variants=new Map();poseParts.set(part,variants);}let selected=variants.get(pose);if(!selected){selected={...part,artwork:variant.artwork,poseArtwork:undefined};variants.set(pose,selected);}part=selected;}
  if(!part.fitMorphology)return part;
  const v=c.visual,quant=(n:number)=>Math.round(n*20)/20;
  const proximal=slot.startsWith('calf')?quant(v?.kneeWidth??1):1;
  const distal=slot.startsWith('forearm')?quant(v?.wristWidth??1):slot.startsWith('thigh')?quant(v?.kneeWidth??1):slot.startsWith('calf')?quant(v?.ankleWidth??1):1;
  const muscle=quant(v?.muscleDefinition??.5),soft=quant(v?.softness??.5);
  if(proximal===1&&distal===1&&muscle===.5&&soft===.5)return part;
  const key=[proximal,distal,muscle,soft].join('/');let cache=fittedParts.get(part);if(!cache){cache=new Map();fittedParts.set(part,cache);}const hit=cache.get(key);if(hit)return hit;
  // Restrict opt-in deformation to untransformed simple bone-local geometry.
  // Unknown masks, transforms and custom pose variants retain the source.
  if(part.artwork.regions.some(r=>r.transform||r.clipRegionId||r.maskRegionId)||part.artwork.poses.length)return part;
  const morph=(commands:VectorCommand[])=>commands.map(cmd=>{const values:(string|number)[]=[cmd[0]];for(let i=1;i<cmd.length;i+=2){const x=Number(cmd[i]),y=Number(cmd[i+1]),u=Math.max(0,Math.min(1,x));const belly=Math.sin(Math.PI*u);values.push(x,y*(proximal*(1-u)+distal*u)*(1+(muscle-.5)*.24*belly**2+(soft-.5)*.20*belly));}return values as VectorCommand;});
  const [x0,y0,x1,y1]=part.artwork.bounds;
  const result=VectorArtworkV1.safeParse({...part.artwork,bounds:[x0,y0*1.5,x1,y1*1.5],regions:part.artwork.regions.map(r=>({...r,commands:morph(r.commands)}))});
  if(!result.success)return part;
  const fitted={...part,artwork:result.data};if(cache.size>=8)cache.delete(cache.keys().next().value!);cache.set(key,fitted);return fitted;
}
export function boneVectorMatrix(start:Point,end:Point,thickness:number):VectorMatrix|undefined{
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
  if(![start.x,start.y,end.x,end.y,thickness,length].every(Number.isFinite)||length<.01||thickness<=0)return;
  const width=10*Math.max(.5,Math.min(2,thickness));
  return [dx,dy,-dy/length*width,dx/length*width,start.x,start.y];
}
/** Authored offset is a saved artistic control, not velocity or simulation state.
 * Each region clamps independently. No timeline history or random state. */
export function boneDrawList(part:NativeVectorComponentData):VectorDrawRegion[]|undefined{
  const art=part.artwork;
  if(!part.authoredOffset)return vectorDrawList(art);
  const rest=vectorDrawList(art);
  if(!rest)return;
  return rest.map(r=>{
    const displaced=vectorDrawList(art,{}, {ownerId:part.id,regionId:r.id,localToWorld:[1,0,0,1,0,0],displacement:part.authoredOffset!,velocity:[0,0]});
    return displaced?.find(d=>d.id===r.id)??r;
  });
}
export function composeVectorMatrix(a:VectorMatrix,b:VectorMatrix):VectorMatrix{
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function positionedVectorRegion(r:VectorDrawRegion,world:VectorMatrix):VectorDrawRegion{
  const m=composeVectorMatrix(world,r.transform??[1,0,0,1,0,0]);
  const commands=r.commands.map(c=>{
    const values:(string|number)[]=[c[0]];
    for(let i=1;i<c.length;i+=2)values.push(...worldPoint(m,Number(c[i]),Number(c[i+1])));
    return values as VectorCommand;
  });
  return {...r,commands,transform:undefined,stroke:r.stroke?{...r.stroke,width:r.stroke.width*Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]))}:undefined};
}

/** Fixed components use rig-space pivots, without changing the pose or source. */
export function fixedVectorMatrix(part:NativeVectorComponentData,x:number,y:number,angle=0):VectorMatrix|undefined{
  if(part.artwork.units!=='rig'||![x,y,angle].every(Number.isFinite))return;
  const r=angle*Math.PI/180,a=Math.cos(r),b=Math.sin(r),[px,py]=part.artwork.pivot;
  return [a,b,-b,a,x-a*px+b*py,y-b*px-a*py];
}

/** Sparse native group deformation, preserving region pins. */
export function dynamicNativeDrawList(part:NativeVectorComponentData,offsets:Readonly<Record<string,readonly [number,number]>>){
 const rest=boneDrawList(part);if(!rest||!part.dynamics?.length)return rest;
 const art=part.artwork,byId=new Map(art.regions.map(r=>[r.id,r]));
 return rest.map(r=>{const group=byId.get(r.id)?.material?.controlGroup,q=group&&offsets[part.id+'/'+group];if(!q||!q.some(Boolean))return r;
 const draw=vectorDrawList(art,{}, {ownerId:part.id,regionId:r.id,localToWorld:[1,0,0,1,0,0],displacement:q,velocity:[0,0]});return draw?.find(d=>d.id===r.id)??r;});
}
