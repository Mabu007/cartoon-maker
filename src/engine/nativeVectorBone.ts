import {vectorDrawList,worldPoint,type VectorDrawRegion,type VectorMatrix,type VectorCommand} from './vectorArtwork.ts';
import type {NativeVectorComponentData,CompiledArtwork} from './visualAssets.ts';
import type {Character,View} from './schema.ts';
import type {Point} from './artworkGeometry.ts';
/** Only explicitly mirror-safe normalized bone art is active in this slice.
 * Facing-specific asymmetric art and fixed slots retain the existing fallback. */
export function nativeBoneFor(c:Character,slot:CompiledArtwork['slot'],view:View){
  return c.visual?.vectorComponents?.find(p=>p.slot===slot&&p.view===view&&p.profiles.includes(c.visual!.profile)&&p.artwork.units==='bone-normalized'&&p.artwork.compatibility.mirrorSafe);
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
