import { EnvironmentVisual, defaultPerspective, type EnvironmentVisualData } from './environmentVisuals.ts';
export type EnvironmentHandle={kind:'light';id:string}|{kind:'horizon'|'nearY'|'farY'};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
/** A canvas gesture returns one document edit. Animated lights receive a key at the scene playhead. */
export function moveEnvironmentHandle(source:EnvironmentVisualData,handle:EnvironmentHandle,point:{x:number;y:number},time:number){
  if(![point.x,point.y,time].every(Number.isFinite))throw Error('Invalid environment handle position.');
  if(handle.kind==='light'){
    if(!source.lighting?.lights.some(light=>light.id===handle.id))throw Error('This light no longer exists.');
    return EnvironmentVisual.parse({...source,lighting:{...source.lighting,lights:source.lighting.lights.map(light=>{
      if(light.id!==handle.id)return light;
      const x=clamp(point.x,-2000,3000),y=clamp(point.y,-2000,3000);
      if(!light.keys?.length)return {...light,x,y};
      const t=Math.round(clamp(time,0,180)*100)/100;
      const next=light.keys.findIndex(key=>key.time>t),a=light.keys[next<0?light.keys.length-1:Math.max(0,next-1)],b=light.keys[next<0?light.keys.length-1:next];
      const weight=a===b?0:clamp((t-a.time)/(b.time-a.time),0,1),intensity=a.intensity+(b.intensity-a.intensity)*weight;
      return {...light,keys:[...light.keys.filter(key=>key.time!==t),{time:t,x,y,intensity}].sort((a,b)=>a.time-b.time)};
    })}});
  }
  const p=source.perspective??defaultPerspective;
  const y=handle.kind==='horizon'?clamp(point.y,-540,Math.min(530,p.farY-1)):handle.kind==='farY'?clamp(point.y,Math.max(0,p.horizon+1),p.nearY-1):clamp(point.y,p.farY+1,1080);
  return EnvironmentVisual.parse({...source,perspective:{...p,[handle.kind]:y}});
}
