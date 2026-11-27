import {FillGradient} from 'pixi.js';
import {dominantLight,volumeColor,pseudoNormal,type VolumeFrame,type SurfaceMaterial} from './volumetricLighting.ts';
import type {Point} from './animation.ts';
export type SurfaceFill=(base:string,material:SurfaceMaterial,center:Point,angle?:number,shape?:'ellipsoid'|'cylinder')=>string|FillGradient;
const quantColor=(s:string)=>'#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(s.slice(i,i+2),16)/12)*12).toString(16).padStart(2,'0')).join('');
/** Per-renderer bounded gradient texture cache. No eviction during drawing:
 * textures referenced by previous frame remain valid until next render. */
export class VolumeGradientCache{
 private entries=new Map<string,FillGradient>();private used=new Set<string>();
 begin(){this.used.clear();}
 fill(frame:VolumeFrame,base:string,material:SurfaceMaterial,center:Point,rotation=0,mirrored=false,shape:'ellipsoid'|'cylinder'='ellipsoid'):string|FillGradient{
  if(!/^#[a-f0-9]{6}$/i.test(base))return base;
  const light=dominantLight(frame,center),r=rotation*Math.PI/180;
  const lx=(Math.cos(r)*light.x+Math.sin(r)*light.y)*(mirrored?-1:1),ly=-Math.sin(r)*light.x+Math.cos(r)*light.y;
  const angle=Math.round(Math.atan2(ly,lx)*8/Math.PI)*Math.PI/8,dx=Math.cos(angle),dy=Math.sin(angle);
  const stops=[-.88,-.4,.15,.65,.94].map((u,i)=>{
   const [x,y,z]=pseudoNormal(dx*u,dy*u,shape==='cylinder'?'ellipsoid':shape);
   const px=x*(mirrored?-1:1),nx=Math.cos(r)*px-Math.sin(r)*y,ny=Math.sin(r)*px+Math.cos(r)*y;
   return {offset:i/4,color:quantColor(volumeColor(frame,center,[nx,ny,z],base,material))};
  });
  const key=[angle,shape,...stops.map(s=>s.color)].join('|'),hit=this.entries.get(key);if(hit){this.used.add(key);return hit;}
  if(this.entries.size>=128)return stops[2].color;
  const g=new FillGradient({type:'linear',start:{x:.5-dx*.5,y:.5-dy*.5},end:{x:.5+dx*.5,y:.5+dy*.5},textureSpace:'local',textureSize:32,colorStops:stops});
  this.entries.set(key,g);this.used.add(key);return g;
 }
 end(){for(const [key,g] of this.entries)if(!this.used.has(key)){g.destroy();this.entries.delete(key);}}
 dispose(){for(const g of this.entries.values())g.destroy();this.entries.clear();this.used.clear();}
 get size(){return this.entries.size;}
}
