import type {EnvironmentVisualData} from './environmentVisuals.ts';
import type {Point} from './animation.ts';
import type {VvleData} from './vvleSchema.ts';
export type SurfaceMaterial='skin'|'hair'|'fabric'|'leather'|'metal'|'glass';
export const surfaceMaterials={skin:{diffuse:.94,specular:.15,roughness:.52},hair:{diffuse:.8,specular:.38,roughness:.3},fabric:{diffuse:1,specular:.04,roughness:.88},leather:{diffuse:.9,specular:.28,roughness:.36},metal:{diffuse:.57,specular:.85,roughness:.18},glass:{diffuse:.42,specular:.9,roughness:.12}} as const;
type Vec3=readonly [number,number,number];
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const norm=(x:number,y:number,z:number):Vec3=>{const l=Math.hypot(x,y,z)||1;return [x/l,y/l,z/l];};
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const rgb=(s:string)=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);
const hex=(a:number[])=>'#'+a.map(v=>Math.round(clamp(v)*255).toString(16).padStart(2,'0')).join('');
const rad=(n:number)=>n*Math.PI/180;
export type VolumeSource={x:number;y:number;rgb:number[];intensity:number;radius:number;falloff:number;kind:'point'|'directional'|'spot'|'fill'|'rim';direction:number;cone:number;elevation:number;softness:number};
export type VolumeFrame={settings:VvleData;ambient:number[];lights:VolumeSource[];depth:number};
export function sampleVolumeFrame(settings:EnvironmentVisualData|undefined,time:number,depth=0):VolumeFrame|undefined{
 if(!settings?.volume?.enabled||!settings.lighting?.enabled)return;
 const lighting=settings.lighting;
 const lights=lighting.lights.slice(0,settings.quality==='eco'?2:settings.quality==='high'?8:4).map(source=>{
  const keys=source.keys;let x=source.x,y=source.y,intensity=source.intensity;
  if(keys?.length){const i=keys.findIndex(k=>k.time>time),a=keys[i<0?keys.length-1:Math.max(0,i-1)],b=keys[i<0?keys.length-1:i],t=a===b?0:clamp((time-a.time)/(b.time-a.time));x=a.x+(b.x-a.x)*t;y=a.y+(b.y-a.y)*t;intensity=a.intensity+(b.intensity-a.intensity)*t;}
  const v=source.volume??{kind:'point' as const,elevation:100,direction:0,cone:65,softness:.5};
  return {x,y,intensity,radius:source.radius,falloff:source.falloff,rgb:rgb(source.color),...v};
 });
 return {settings:settings.volume,ambient:rgb(lighting.ambient).map(v=>v*lighting.intensity),lights,depth:clamp(depth,-1000,1000)};
}
/** Analytic ellipsoid/cylinder normal; normalized coordinates within a region.
 * Back hemisphere is approximated by the rim term, never a 3D mesh. */
export function pseudoNormal(u:number,v:number,shape:'ellipsoid'|'cylinder'='ellipsoid'):Vec3{
 const x=clamp(u,-.98,.98),y=shape==='cylinder'?0:clamp(v,-.98,.98),q=Math.min(.98,x*x+y*y);
 return norm(x,y,Math.sqrt(1-q));
}
function sourceVector(l:VolumeSource,p:Point):{dir:Vec3;weight:number}{
 const dx=l.x-p.x,dy=l.y-p.y,az=rad(l.direction);
 const dir=l.kind==='directional'?norm(Math.cos(az),Math.sin(az),l.elevation/160):norm(dx,dy,l.kind==='rim'?-.45*l.elevation:l.elevation);
 let weight=l.intensity*(l.kind==='directional'?1:Math.pow(clamp(1-Math.hypot(dx,dy)/l.radius),l.falloff));
 if(l.kind==='spot'){const distance=Math.hypot(dx,dy)||1,angle=(-dx*Math.cos(az)-dy*Math.sin(az))/distance,edge=Math.cos(rad(l.cone/2));weight*=clamp((angle-edge)/Math.max(.02,l.softness*.4));}
 return {dir,weight};
}
export function volumeColor(frame:VolumeFrame,point:Point,normal:Vec3,base:string,material:SurfaceMaterial):string{
 const m=surfaceMaterials[material],c=rgb(base),sum=frame.ambient.map(x=>x*(1-frame.settings.occlusion*(1-normal[2])*.5)),spec=[0,0,0];
 for(const l of frame.lights){const {dir,weight}=sourceVector(l,point),lambert=clamp((dot(normal,dir)+l.softness*.2)/(1+l.softness*.2)),rim=l.kind==='rim'?Math.pow(1-clamp(normal[2]),2):0;
  const diffuse=(l.kind==='fill'?.45+.55*lambert:lambert)*m.diffuse+rim*.65;
  const h=norm(dir[0],dir[1],dir[2]+1),shine=Math.pow(clamp(dot(normal,h)),4+(1-m.roughness)*32)*m.specular;
  for(let i=0;i<3;i++){sum[i]+=l.rgb[i]*weight*diffuse;spec[i]+=l.rgb[i]*weight*shine;}}
 const exposure=Math.pow(2,frame.settings.exposure),depthHaze=frame.settings.depthHaze*clamp(-frame.depth/1000);
 const out=c.map((v,i)=>clamp(((v*sum[i]+spec[i]*.4)*exposure-.5)*frame.settings.contrast+.5)*(1-depthHaze)+frame.ambient[i]*depthHaze);
 const gray=out[0]*.2126+out[1]*.7152+out[2]*.0722;
 return hex(out.map(v=>gray+(v-gray)*frame.settings.saturation));
}
export type VolumePaint={point:(p:Point)=>Point;normal:(x:number,y:number,z:number)=>Vec3;frame:VolumeFrame;fill:(color:string,material:SurfaceMaterial,point:Point,angle?:number,shape?:'ellipsoid'|'cylinder')=>unknown};
/** Dominant screen-space light direction, weighted by influence at the surface. */
export function dominantLight(frame:VolumeFrame,point:Point){let x=0,y=0,w=0;for(const l of frame.lights){const a=sourceVector(l,point);x+=a.dir[0]*a.weight;y+=a.dir[1]*a.weight;w+=a.weight;}return {x,y,weight:w};}
export const colorNumber=(hex:string)=>parseInt(hex.slice(1),16);
