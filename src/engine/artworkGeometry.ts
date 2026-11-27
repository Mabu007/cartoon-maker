import type { CompiledArtwork } from './visualAssets.ts';
export type Point={x:number;y:number};
export const boneSlots=['upper-arm-left','forearm-left','upper-arm-right','forearm-right','thigh-left','calf-left','thigh-right','calf-right'] as const;
export const isBoneSlot=(slot:string)=>boneSlots.some(value=>value===slot);
export const characterCoreSlots=['head-base','top',...boneSlots,'shoe-left','shoe-right'] as const;
/** Two calibrated image landmarks map exactly onto the native solved joint pair.
 * Width scaling is perpendicular to the bone, so it cannot detach either joint. */
export function boneArtworkTransform(part:Pick<CompiledArtwork,'pivot'|'end'|'width'|'height'>,start:Point,end:Point,thickness=1){
  if(!part.end)throw Error('A limb needs both joint pivots.');
  const px=part.pivot.x*part.width,py=part.pivot.y*part.height;
  const rx=part.end.x*part.width-px,ry=part.end.y*part.height-py,den=rx*rx+ry*ry;
  const dx=end.x-start.x,dy=end.y-start.y;
  if(den<1e-6||Math.hypot(dx,dy)<1e-6)return undefined;
  const width=Math.max(.5,Math.min(2,thickness));
  const a0=(dx*rx+dy*ry)/den,b0=(dy*rx-dx*ry)/den;
  const xx=(rx*rx+width*ry*ry)/den,xy=(1-width)*rx*ry/den,yy=(ry*ry+width*rx*rx)/den;
  const a=a0*xx-b0*xy,b=b0*xx+a0*xy,c=a0*xy-b0*yy,d=b0*xy+a0*yy;
  return {a,b,c,d,tx:start.x-a*px-c*py,ty:start.y-b*px-d*py};
}
export const transformArtworkPoint=(m:NonNullable<ReturnType<typeof boneArtworkTransform>>,p:Point)=>({x:m.a*p.x+m.c*p.y+m.tx,y:m.b*p.x+m.d*p.y+m.ty});
