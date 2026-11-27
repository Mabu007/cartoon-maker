import {z} from 'zod';
const n=(a:number,b:number)=>z.number().finite().min(a).max(b);
export const vvleLightKinds=['point','directional','spot','fill','rim'] as const;
export const VvleLight=z.strictObject({kind:z.enum(vvleLightKinds),elevation:n(10,500),direction:n(-180,180),cone:n(10,170),softness:n(.05,1)});
export const VvleSettings=z.strictObject({version:z.literal(1),enabled:z.boolean(),exposure:n(-2,2),contrast:n(.65,1.5),saturation:n(0,1.5),occlusion:n(0,.65),shadowLength:n(0,2),parallax:n(0,.18),depthHaze:n(0,.6)});
export type VvleData=z.infer<typeof VvleSettings>;
export const vvleDefaults:VvleData={version:1,enabled:true,exposure:0,contrast:1.05,saturation:1,occlusion:.2,shadowLength:.6,parallax:.04,depthHaze:.08};
