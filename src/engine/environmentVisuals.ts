import { z } from 'zod';
const n=(min:number,max:number)=>z.number().finite().min(min).max(max);
const color=z.string().regex(/^#[a-f\d]{6}$/i);
const key=z.strictObject({time:n(0,180),scale:n(.2,4),opacity:n(0,1).optional(),depth:n(-1000,1000).optional()});
export const EntityVisual=z.strictObject({perspective:z.boolean().optional(),lighting:z.boolean().optional(),opacity:n(0,1).optional(),keys:z.array(key).max(120).optional()}).superRefine((v,ctx)=>{
  if(v.keys?.some((k,i)=>i>0&&k.time<=v.keys![i-1].time))ctx.addIssue({code:'custom',message:'Visual keys must have unique increasing times.'});
});
export const Perspective=z.strictObject({enabled:z.boolean(),retimeMovement:z.boolean().optional(),horizon:n(-540,530),nearY:n(0,1080),farY:n(0,1080),nearScale:n(.1,4),farScale:n(.1,4),minScale:n(.05,4),maxScale:n(.05,4)}).superRefine((p,ctx)=>{
  if(p.nearY<=p.farY||p.farY<=p.horizon)ctx.addIssue({code:'custom',message:'Place horizon above far reference, and far reference above near reference.'});
  if(p.nearScale<p.farScale||p.minScale>p.maxScale)ctx.addIssue({code:'custom',message:'Near scale must be at least far scale; minimum must not exceed maximum.'});
});
export const Light=z.strictObject({id:z.string().min(1).max(80),x:n(-2000,3000),y:n(-2000,3000),color,intensity:n(0,2),radius:n(10,1500),falloff:n(.5,4),keys:z.array(z.strictObject({time:n(0,180),x:n(-2000,3000),y:n(-2000,3000),intensity:n(0,2)})).max(120).optional()}).superRefine((l,ctx)=>{
  if(l.keys?.some((k,i)=>i>0&&k.time<=l.keys![i-1].time))ctx.addIssue({code:'custom',message:'Light keys must have unique increasing times.'});
});
export const EnvironmentVisual=z.strictObject({version:z.literal(1),quality:z.enum(['eco','balanced','high']),
  lighting:z.strictObject({enabled:z.boolean(),ambient:color,intensity:n(0,1.5),shadow:color,shadowOpacity:n(0,1),lights:z.array(Light).max(8)}).optional(),
  perspective:Perspective.optional(),
  walkable:z.array(z.strictObject({x:n(-2000,3000),y:n(-2000,3000)})).min(3).max(80).optional()
}).superRefine((v,ctx)=>{
  const lights=v.lighting?.lights??[];
  if(new Set(lights.map(l=>l.id)).size!==lights.length)ctx.addIssue({code:'custom',message:'Light IDs must be unique.'});
});
export type EnvironmentVisualData=z.infer<typeof EnvironmentVisual>;
export type PerspectiveData=z.infer<typeof Perspective>;
export const defaultPerspective:PerspectiveData={enabled:true,horizon:190,nearY:480,farY:270,nearScale:1,farScale:.28,minScale:.15,maxScale:1.8};
export const lightingPresets={
  daylight:{ambient:'#fff5e5',intensity:1},overcast:{ambient:'#cbd9ed',intensity:.85},
  night:{ambient:'#665b91',intensity:.58},streetlight:{ambient:'#74618e',intensity:.6},noir:{ambient:'#675b7e',intensity:.48}
} as const;
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
/** Reference calibration in image-space; deliberately supports artistic scale offsets. */
export function perspectiveScale(y:number,p?:PerspectiveData){
  if(!p?.enabled)return 1;
  const slope=(p.nearScale-p.farScale)/(p.nearY-p.farY);
  return clamp(p.farScale+(y-p.farY)*slope,p.minScale,p.maxScale);
}
export function sampleVisual<T extends {scale:number;depth:number;visual?:z.infer<typeof EntityVisual>}>(entity:T,time:number,y:number,p?:PerspectiveData):T{
  const keys=entity.visual?.keys;
  let scale=1,opacity=entity.visual?.opacity??1,depth=entity.depth;
  if(keys?.length){
    const next=keys.findIndex(k=>k.time>time),a=keys[next<0?keys.length-1:Math.max(0,next-1)],b=keys[next<0?keys.length-1:next];
    const t=a===b?0:clamp((time-a.time)/(b.time-a.time)),w=t*t*(3-2*t);
    scale=a.scale+(b.scale-a.scale)*w;
    opacity=(a.opacity??opacity)+((b.opacity??opacity)-(a.opacity??opacity))*w;
    depth=(a.depth??depth)+((b.depth??depth)-(a.depth??depth))*w;
  }
  return {...entity,scale:entity.scale*scale*(entity.visual?.perspective===false?1:perspectiveScale(y,p)),depth,visual:{...entity.visual,opacity}};
}
const rgb=(c:string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
export function lightAt(x:number,y:number,settings?:EnvironmentVisualData,time=0){
  const light=settings?.lighting;
  if(!light?.enabled)return 0xffffff;
  const value=rgb(light.ambient).map(channel=>channel*light.intensity);
  for(const source of light.lights){
    const keys=source.keys;let px=source.x,py=source.y,intensity=source.intensity;
    if(keys?.length){const i=keys.findIndex(k=>k.time>time),a=keys[i<0?keys.length-1:Math.max(0,i-1)],b=keys[i<0?keys.length-1:i],t=a===b?0:clamp((time-a.time)/(b.time-a.time));px=a.x+(b.x-a.x)*t;py=a.y+(b.y-a.y)*t;intensity=a.intensity+(b.intensity-a.intensity)*t;}
    const weight=intensity*Math.pow(clamp(1-Math.hypot(x-px,y-py)/source.radius),source.falloff),c=rgb(source.color);
    value.forEach((channel,i)=>{value[i]=channel+c[i]*weight;});
  }
  return value.reduce((result,channel)=>result*256+Math.round(clamp(channel)*255),0);
}
export function inWalkable(point:{x:number;y:number},polygon?:{x:number;y:number}[]){
  if(!polygon)return true;let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if(((a.y>point.y)!==(b.y>point.y))&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
