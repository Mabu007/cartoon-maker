import {BufferImageSource,Matrix,Texture,type FillStyle} from 'pixi.js';
import {prepareVolumeSurface,pseudoNormal,type VolumeFrame,type SurfaceMaterial} from './volumetricLighting.ts';
import type {Point} from './animation.ts';

type SurfaceShape='ellipsoid'|'cylinder';
export type SurfaceFill=(base:string,material:SurfaceMaterial,center:Point,angle?:number,shape?:SurfaceShape,reflected?:boolean)=>string|FillStyle;
const channels=[1,3,5] as const;
const samples=[-.88,-.4,.15,.65,.94] as const;
const quantColor=(value:string)=>'#'+channels.map(i=>Math.min(255,Math.round(parseInt(value.slice(i,i+2),16)/12)*12).toString(16).padStart(2,'0')).join('');
const frameLimit=128;
const tileSize=24,tilesPerRow=16,atlasWidth=tileSize*tilesPerRow,atlasHeight=tileSize*frameLimit/tilesPerRow;

type Atlas={pixels:Uint8Array;source:BufferImageSource;texture:Texture};
type GradientEntry={key:string;style:FillStyle};
const slotOrigin=(slot:number)=>({x:slot%tilesPerRow*tileSize,y:Math.floor(slot/tilesPerRow)*tileSize});
function createAtlas():Atlas{
 const pixels=new Uint8Array(atlasWidth*atlasHeight*4);
 const source=new BufferImageSource({resource:pixels,width:atlasWidth,height:atlasHeight,format:'rgba8unorm',scaleMode:'linear'});
 return {pixels,source,texture:new Texture({source})};
}
function paintTile(atlas:Atlas,slot:number,colors:string[],dx:number,dy:number){
 const origin=slotOrigin(slot),rgb=colors.map(color=>channels.map(index=>parseInt(color.slice(index,index+2),16)));
 const lastPixel=tileSize-1;
 for(let y=0;y<tileSize;y++)for(let x=0;x<tileSize;x++){
  const t=4*Math.max(0,Math.min(1,.5+(x/lastPixel-.5)*dx+(y/lastPixel-.5)*dy));
  const stop=Math.min(3,Math.floor(t)),next=stop+1,blend=t-stop;
  const offset=((origin.y+y)*atlasWidth+origin.x+x)*4;
  for(let ch=0;ch<3;ch++)atlas.pixels[offset+ch]=Math.round(rgb[stop][ch]+(rgb[next][ch]-rgb[stop][ch])*blend);
  atlas.pixels[offset+3]=255;
 }
}
function tileStyle(texture:Texture,slot:number):FillStyle{
 const {x,y}=slotOrigin(slot),lastPixel=tileSize-1;
 // Map shape bounds to texel centers so adjacent swatches cannot bleed.
 return {texture,textureSpace:'local',matrix:new Matrix(atlasWidth/lastPixel,0,0,atlasHeight/lastPixel,-(x+.5)/lastPixel,-(y+.5)/lastPixel)};
}

/** One texture per renderer. Each frame assigns slots in paint order so
 * repeated seeks address identical atlas coordinates. Paint happens on the
 * CPU and the texture is uploaded immediately before Pixi submits the frame. */
export class VolumeGradientCache{
 private readonly slots:GradientEntry[]=[];
 private readonly used=new Map<string,FillStyle>();
 private atlas?:Atlas;
 private dirty=false;

 begin(){this.used.clear();}

 fill(frame:VolumeFrame,base:string,material:SurfaceMaterial,center:Point,rotation=0,mirrored=false,shape:SurfaceShape='ellipsoid',flat=false):string|FillStyle{
  if(!/^#[a-f0-9]{6}$/i.test(base))return base;
  const surface=prepareVolumeSurface(frame,center),paint=surface.paint(base,material);
  if(flat)return paint([0,0,1]);
  const light=surface.direction,r=rotation*Math.PI/180,cos=Math.cos(r),sin=Math.sin(r),mirror=mirrored?-1:1;
  const lx=(cos*light.x+sin*light.y)*mirror,ly=-sin*light.x+cos*light.y;
  // The artwork's local X axis follows the solved bone. Its cylindrical
  // normal varies only across the bone, along local Y.
  const direction=shape==='cylinder'?(ly<0?-4:4):Math.round(Math.atan2(ly,lx)*8/Math.PI);
  const angle=direction*Math.PI/8;
  const dx=shape==='cylinder'?0:Math.cos(angle),dy=Math.sin(angle);
  const colors=samples.map(u=>{
   const normal=shape==='cylinder'?pseudoNormal(dy*u,0,'cylinder'):pseudoNormal(dx*u,dy*u);
   const x=shape==='cylinder'?0:normal[0]*mirror,y=shape==='cylinder'?normal[0]:normal[1];
   return quantColor(paint([cos*x-sin*y,sin*x+cos*y,normal[2]]));
  });
  const key=[direction,shape,...colors].join('|');
  const used=this.used.get(key);
  if(used)return used;
  const slot=this.used.size;
  if(slot>=frameLimit)return colors[2];
  const atlas=this.atlas??=createAtlas();
  const existing=this.slots[slot];
  const style=existing?.style??tileStyle(atlas.texture,slot);
  if(existing?.key!==key){
   paintTile(atlas,slot,colors,dx,dy);
   this.slots[slot]={key,style};this.dirty=true;
  }
  this.used.set(key,style);
  return style;
 }

 flush(){if(this.dirty){this.atlas!.source.update();this.dirty=false;}}

 dispose(){this.atlas?.texture.destroy(true);this.atlas=undefined;this.slots.length=0;this.used.clear();this.dirty=false;}
 get size(){return this.used.size;}
 get textureBytes(){return this.atlas?.pixels.byteLength??0;}
}
