import {z} from 'zod';
const n=(lo:number,hi:number)=>z.number().finite().min(lo).max(hi);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const garmentFits=['tight','regular','relaxed','oversized'] as const;
export const garmentTops=['shirt','blouse','hoodie','tunic','dress'] as const;
export const garmentBottoms=['trousers','shorts','leggings','skirt','none'] as const;
export const garmentOuters=['none','jacket','coat'] as const;
export const garmentShoes=['sneaker','boot','loafer','none'] as const;
export const garmentMaterials=['cotton','denim','knit','leather','linen'] as const;
export const GarmentDesignV1=z.strictObject({
 version:z.literal(1),top:z.enum(garmentTops),bottom:z.enum(garmentBottoms),outer:z.enum(garmentOuters),footwear:z.enum(garmentShoes),
 fit:z.enum(garmentFits),material:z.enum(garmentMaterials),
 neckline:z.enum(['crew','v','collar']),sleeve:n(0,2),length:n(.8,1.2),waist:n(.9,1.15),hem:n(.9,1.2),cuff:n(.9,1.2),
 pockets:z.boolean(),seams:z.boolean(),closure:z.enum(['none','buttons','zipper']),pattern:z.enum(['solid','stripes','checks','dots']),
 patternScale:n(.7,1.5),patternOpacity:n(0,.7),outerColor:color,accent:color,sole:color,laces:color,soleThickness:n(1,4),laceDetail:z.boolean(),
 logo:z.enum(['none','circle','diamond']),logoScale:n(.6,1.2),folds:n(0,1)
});
export type GarmentDesign=z.infer<typeof GarmentDesignV1>;
export const garmentDefaults:GarmentDesign={version:1,top:'shirt',bottom:'trousers',outer:'none',footwear:'sneaker',fit:'regular',material:'cotton',neckline:'crew',sleeve:1.85,length:1,waist:1,hem:1,cuff:1,pockets:true,seams:true,closure:'none',pattern:'solid',patternScale:1,patternOpacity:.3,outerColor:'#3c4d55',accent:'#d6c6ad',sole:'#dfd9cb',laces:'#ece5d8',soleThickness:2,laceDetail:true,logo:'none',logoScale:1,folds:.6};

const point=z.strictObject({x:n(-500,500),y:n(-500,500)});
export const GarmentPhysicsV1=z.strictObject({
 id:z.enum(['top','trousers','skirt','outer','footwear']),layer:z.enum(['inner','outer']),materialId:z.enum(garmentMaterials),
 stiffness:n(0,256),damping:n(0,32),wind:n(0,1),displacement:n(0,8),
 pins:z.array(z.strictObject({name:z.string().min(1).max(40),point,weight:z.literal(1)})).min(1).max(8),
 free:z.array(z.strictObject({id:z.string().min(1).max(60),weight:z.literal(0),influence:n(0,1),rest:z.tuple([point,point,point])})).max(4),
 collisionProxies:z.array(z.strictObject({id:z.string(),a:point,b:point,radius:n(1,80)})).max(8)
});
