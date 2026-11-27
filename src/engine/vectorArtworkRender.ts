import {GraphicsPath,Matrix,type Graphics} from 'pixi.js';
import {boneDrawList,composeVectorMatrix,positionedVectorRegion} from './nativeVectorBone.ts';
import type {NativeVectorComponentData} from './visualAssets.ts';
import {svgPath,worldPoint,type VectorDrawRegion,type VectorMatrix} from './vectorArtwork.ts';
/** Generate a native SVG preview descriptor; no SVG DOM used by stage rendering. */
export function nativeVectorPreview(regions:readonly VectorDrawRegion[]){
  return regions.map(r=>({id:r.id,d:svgPath(r.commands),fill:r.fill??'none',fillRule:r.fillRule,
    stroke:r.stroke?.color??'none',strokeWidth:r.stroke?.width,transform:r.transform?'matrix('+r.transform.join(' ')+')':undefined}));
}
/** Direct bounded Pixi path updates, no SVG parsing. First-slice adapter only.
 * The supplied Graphics is owned and cleared by its caller, not this module.
 * World/region coordinates are composed here; stroke width uses geometric mean scale.
 * Anisotropic stroke parity is explicitly not certified by this adapter.
 */
export function drawVectorRegions(g:Graphics,regions:readonly VectorDrawRegion[],world:VectorMatrix=[1,0,0,1,0,0]){
  for(const r of regions){
    const m=r.transform??[1,0,0,1,0,0] as const;
    const p=(x:number,y:number)=>worldPoint(world,...worldPoint(m,x,y));
    const emit=()=>{
      g.beginPath();
      for(const c of r.commands){
        switch(c[0]){
          case 'M':g.moveTo(...p(c[1],c[2]));break;
          case 'L':g.lineTo(...p(c[1],c[2]));break;
          case 'Q':g.quadraticCurveTo(...p(c[1],c[2]),...p(c[3],c[4]));break;
          case 'C':g.bezierCurveTo(...p(c[1],c[2]),...p(c[3],c[4]),...p(c[5],c[6]));break;
          case 'Z':g.closePath();break;
        }
      }
    };
    if(r.fill){emit();g.fill(r.fill);}
    if(r.stroke){
      const scale=Math.sqrt(Math.abs((m[0]*m[3]-m[1]*m[2])*(world[0]*world[3]-world[1]*world[2])));
      emit();g.stroke({color:r.stroke.color,width:r.stroke.width*scale,cap:'round',join:'round'});
    }
  }
}

/** Per-renderer bounded cache of compiled rest/authored paths. The frame path
 * is a deep clone, because Pixi transforms can mutate nested instructions.
 * This is CPU path compilation, not a claim of persistent GPU tessellation. */
export class NativeBonePathCache{
  private entries=new Map<NativeVectorComponentData,{region:VectorDrawRegion;path:GraphicsPath}[]|undefined>();
  constructor(private readonly limit=64){if(!Number.isInteger(limit)||limit<1||limit>256)throw Error('Invalid native path cache capacity');}
  get size(){return this.entries.size;}
  dispose(){this.entries.clear();}
  prepare(part:NativeVectorComponentData){
    if(this.entries.has(part)){
      const hit=this.entries.get(part);this.entries.delete(part);this.entries.set(part,hit);return hit;
    }
    const result=boneDrawList(part)?.map(region=>{
      const path=new GraphicsPath();
      for(const c of region.commands){
        switch(c[0]){
          case 'M':path.moveTo(c[1],c[2]);break;
          case 'L':path.lineTo(c[1],c[2]);break;
          case 'Q':path.quadraticCurveTo(c[1],c[2],c[3],c[4]);break;
          case 'C':path.bezierCurveTo(c[1],c[2],c[3],c[4],c[5],c[6]);break;
          case 'Z':path.closePath();break;
        }
      }
      return {region,path};
    });
    this.entries.set(part,result);
    if(this.entries.size>this.limit){const oldest=this.entries.keys().next().value;if(oldest)this.entries.delete(oldest);}
    return result;
  }
  draw(g:Graphics,part:NativeVectorComponentData,world:VectorMatrix){
    const compiled=this.prepare(part);if(!compiled)return false;
    for(const {region,path} of compiled){
      const m=composeVectorMatrix(world,region.transform??[1,0,0,1,0,0]);
      const shape=path.clone(true).transform(new Matrix(...m));
      if(region.fill)g.path(shape).fill(region.fill);
      if(region.stroke)g.path(shape.clone(true)).stroke({color:region.stroke.color,width:region.stroke.width*Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2])),cap:'round',join:'round'});
    }
    return true;
  }
}
export function nativeBonePreview(part:NativeVectorComponentData,world:VectorMatrix){
  const draw=boneDrawList(part);
  return draw&&nativeVectorPreview(draw.map(r=>positionedVectorRegion(r,world)));
}
