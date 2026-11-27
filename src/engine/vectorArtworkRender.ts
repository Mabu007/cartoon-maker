import type {Graphics} from 'pixi.js';
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
