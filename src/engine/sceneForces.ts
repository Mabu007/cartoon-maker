import type {SceneSecondaryData} from './secondaryMotionSchema.ts';
import type {LveForceData} from './lveSimulation.ts';
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
/** Shared deterministic world-space forces. Camera is not an input.
 * Local region weights fade to zero at the circular boundary. */
export function sceneForces(settings:SceneSecondaryData,t:number,x:number,y:number):LveForceData{
 let wx=settings.windX,wy=settings.windY;
 for(const g of settings.gusts){const p=(t-g.time)/g.duration;if(p>=0&&p<=1){const w=Math.sin(Math.PI*p);wx+=g.x*w;wy+=g.y*w;}}
 for(const region of settings.regions??[]){const p=clamp(1-Math.hypot(x-region.x,y-region.y)/region.radius,0,1),w=p*p*(3-2*p);wx+=region.windX*w;wy+=region.windY*w;}
 // Preserve prior global-gust semantics unless new region/force controls used.
 if(settings.regions?.length){wx=clamp(wx,-320,320);wy=clamp(wy,-320,320);}
 return {gravity:{x:0,y:settings.gravity??12},wind:{x:wx,y:wy},turbulence:settings.turbulence};
}
