import {z} from 'zod';
const num=(a:number,b:number)=>z.number().finite().min(a).max(b);
export const hairMaterials=z.strictObject({stiffness:num(0,256),damping:num(0,32),wind:num(0,1),maxDisplacement:num(0,12)});
export const HairDesignV1=z.strictObject({
  version:z.literal(1),length:num(.7,1.3),width:num(.85,1.15),volume:num(.7,1.3),hairline:num(-.1,.1),
  density:num(0,1),braidThickness:num(.75,1.25),parting:num(-.3,.3),highlight:num(0,.45),
  material:hairMaterials
});
export type HairDesign=z.infer<typeof HairDesignV1>;
export const hairDesignDefaults:HairDesign={version:1,length:1,width:1,volume:1,hairline:0,density:.5,braidThickness:1,parting:0,highlight:.23,material:{stiffness:72,damping:10,wind:.35,maxDisplacement:8}};
