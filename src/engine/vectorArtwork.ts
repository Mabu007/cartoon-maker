import { z } from 'zod';
import {compileCompoundFill,type CompoundFill} from './compoundVectorFill.ts';

/** Geometry is local, +x right (or along a bone), +y down. No SVG input. */
export const vectorArtworkLimits={commandsPerPath:128,commandsPerArtwork:1024,palette:32,regions:24,weights:384} as const;
const n = z.number().finite().min(-4096).max(4096);
const unit = z.number().finite().min(0).max(1);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const point = z.tuple([n,n]);
const transform = z.tuple([n,n,n,n,n,n]).refine(m => Math.abs(m[0]*m[3]-m[1]*m[2]) >= 0.000001, 'Singular transform');
const command = z.union([
  z.tuple([z.literal('M'),n,n]), z.tuple([z.literal('L'),n,n]),
  z.tuple([z.literal('Q'),n,n,n,n]), z.tuple([z.literal('C'),n,n,n,n,n,n]),
  z.tuple([z.literal('Z')])
]);
export type VectorCommand = z.infer<typeof command>;
const paint = z.union([
  z.strictObject({kind:z.literal('solid'),color:z.string().regex(/^#[0-9a-fA-F]{6}$/)}),
  z.strictObject({kind:z.literal('palette'),key:id})
]);
const path = z.array(command).min(2).max(vectorArtworkLimits.commandsPerPath).superRefine((commands,ctx)=>{
  let open=false, edges=0;
  for(const c of commands){
    if(c[0]==='M'){if(open&&edges===0)ctx.addIssue({code:'custom',message:'Empty subpath'});open=true;edges=0;}
    else if(!open) ctx.addIssue({code:'custom',message:'A subpath must start with M'});
    else if(c[0]==='Z'){
      if(edges===0)ctx.addIssue({code:'custom',message:'Empty closed subpath'});
      open=false;
    }else edges++;
  }
  if(commands.at(-1)?.[0]==='M')ctx.addIssue({code:'custom',message:'Empty trailing subpath'});
});
const material = z.strictObject({id, stiffness:z.number().finite().min(0).max(256), damping:z.number().finite().min(0).max(32)});
const deformation = z.strictObject({
  materialId:id, controlGroup:id, collisionProxyId:id.optional(),
  maxDisplacement:z.number().finite().min(0).max(32),
  // Each pair of coordinates (including curve handles) is one rest point.
  // Pin and influence are independent; a pin of 1 is immovable.
  weights:z.array(z.strictObject({pin:unit,influence:unit})).max(vectorArtworkLimits.weights)
});
const region = z.strictObject({
  id, layer:z.number().int().min(-128).max(128), commands:path,
  fillRule:z.enum(['nonzero','evenodd']), fill:paint.optional(),
  stroke:z.strictObject({paint,width:z.number().finite().gt(0).max(32)}).optional(),
  transform:transform.optional(), material:deformation.optional(),
  clipRegionId:id.optional(), maskRegionId:id.optional()
});
const proxy = z.strictObject({id,center:point,radius:z.number().finite().gt(0).max(4096)});
const pose = z.strictObject({id,regionId:id,commands:path});
export const VectorArtworkV1 = z.strictObject({
  version:z.literal(1), units:z.enum(['rig','bone-normalized']),
  bounds:z.tuple([n,n,n,n]), pivot:point,
  anchors:z.array(z.strictObject({id,point})).max(32),
  palette:z.record(id,z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  materials:z.array(material).max(16), controlGroups:z.array(id).max(16),
  collisionProxies:z.array(proxy).max(16),
  regions:z.array(region).min(1).max(vectorArtworkLimits.regions), poses:z.array(pose).max(24),
  compatibility:z.strictObject({rig:z.literal('sirvibe-native-v1'),mirrorSafe:z.boolean()})
}).superRefine((a,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:'custom',message});
  const unique=(ids:string[])=>new Set(ids).size===ids.length;
  if(!unique(a.regions.map(r=>r.id))||!unique(a.anchors.map(x=>x.id))||
     !unique(a.materials.map(x=>x.id))||!unique(a.controlGroups)||
     !unique(a.collisionProxies.map(x=>x.id))||!unique(a.poses.map(x=>x.id)))issue('Duplicate local identity');
  const [x0,y0,x1,y1]=a.bounds;
  if(x1<=x0||y1<=y0)issue('Invalid bounds');
  const inside=(x:number,y:number)=>x>=x0&&x<=x1&&y>=y0&&y<=y1;
  if(!inside(...a.pivot)||a.anchors.some(x=>!inside(...x.point)))issue('Pivot or anchor outside bounds');
  if(Object.keys(a.palette).length>vectorArtworkLimits.palette)issue('Palette budget exceeded');
  const ids=new Set(a.regions.map(r=>r.id));
  const byId=new Map(a.regions.map(r=>[r.id,r]));
  let total=0;
  const checkGeometry=(commands:VectorCommand[],matrix?:z.infer<typeof transform>)=>{
    const m=matrix??[1,0,0,1,0,0];
    let points=0;
    for(const c of commands){
      for(let i=1;i<c.length;i+=2){
        const x=Number(c[i]),y=Number(c[i+1]);points++;
        if(!inside(m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]))issue('Control point outside declared bounds');
      }
    }
    total+=commands.length;
    return points;
  };
  for(const r of a.regions){
    const count=checkGeometry(r.commands,r.transform);
    if(!r.fill&&!r.stroke)issue('Region has no paint');
    for(const p of [r.fill,r.stroke?.paint])if(p?.kind==='palette'&&!Object.hasOwn(a.palette,p.key))issue('Unknown palette reference');
    for(const ref of [r.clipRegionId,r.maskRegionId])if(ref&&(!ids.has(ref)||ref===r.id))issue('Invalid mask or clip reference');
    if(r.material){
      const d=r.material;
      if(!a.materials.some(x=>x.id===d.materialId)||!a.controlGroups.includes(d.controlGroup)||
        (d.collisionProxyId&&!a.collisionProxies.some(x=>x.id===d.collisionProxyId)))issue('Unknown deformation reference');
      if(d.weights.length!==count)issue('Deformation weights must match all rest points');
    }
  }
  const active=new Set<string>(), visited=new Set<string>();
  function visit(key:string){
    if(active.has(key)){issue('Mask/clip reference cycle');return;}
    if(visited.has(key))return;
    active.add(key);const r=byId.get(key);
    for(const ref of [r?.clipRegionId,r?.maskRegionId])if(ref&&ids.has(ref))visit(ref);
    active.delete(key);visited.add(key);
  }
  for(const key of ids)visit(key);
  for(const p of a.poses){
    const r=byId.get(p.regionId);
    if(!r||p.commands.length!==r.commands.length||p.commands.some((c,i)=>c[0]!==r.commands[i][0]))issue('Incompatible pose topology');
    checkGeometry(p.commands,r?.transform);
  }
  if(total>vectorArtworkLimits.commandsPerArtwork)issue('Artwork command budget exceeded');
});
export type VectorArtwork = z.infer<typeof VectorArtworkV1>;
export type VectorRegion = VectorArtwork['regions'][number];
export type VectorMatrix = readonly [number,number,number,number,number,number];
/** Runtime state never belongs in saved artwork. Owner is the actor or prop instance. */
export type VectorRuntimeState = {ownerId:string;regionId:string;localToWorld:VectorMatrix; displacement:readonly [number,number];velocity:readonly [number,number]};
export function worldPoint(m:VectorMatrix,x:number,y:number):[number,number]{
  return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
}
export function localPoint(m:VectorMatrix,x:number,y:number):[number,number]{
  const det=m[0]*m[3]-m[1]*m[2];
  if(!Number.isFinite(det)||Math.abs(det)<1e-6)throw Error('Singular world transform');
  return [(m[3]*(x-m[4])-m[2]*(y-m[5]))/det,(-m[1]*(x-m[4])+m[0]*(y-m[5]))/det];
}
export function svgPath(commands:readonly VectorCommand[]):string{
  return commands.map(c=>c.join(' ')).join(' ');
}
/** Bounded displacement in region-local coordinates. Never edits the rest commands. */
export function deformRegion(r:VectorRegion, displacement:readonly [number,number]):VectorCommand[]{
  const d=r.material;
  if(!d||!displacement.every(Number.isFinite))return r.commands.map(c=>[...c] as VectorCommand);
  const length=Math.hypot(...displacement);
  const scale=length>0?Math.min(1,d.maxDisplacement/length):0;
  let index=0;
  return r.commands.map(c=>{
    const values:(string|number)[]=[c[0]];
    for(let i=1;i<c.length;i+=2){
      const w=d.weights[index++];const f=w.influence*(1-w.pin)*scale;
      values.push(Number(c[i])+displacement[0]*f,Number(c[i+1])+displacement[1]*f);
    }
    return values as VectorCommand;
  });
}
/** Demo only: one spring axis pair, fixed time step, finite/clamped state. */
export function springDemo(s:VectorRuntimeState,target:readonly [number,number],material:{stiffness:number;damping:number},max:number):VectorRuntimeState{
  if(![...target,...s.displacement,...s.velocity,material.stiffness,material.damping,max].every(Number.isFinite)||max<0||max>32||material.stiffness<0||material.stiffness>256||material.damping<0||material.damping>32)
    throw Error('Invalid spring demo state');
  const dt=1/60;
  const clamp=(v:number,limit:number)=>Math.max(-limit,Math.min(limit,v));
  const tlen=Math.hypot(...target),ts=tlen>max?max/tlen:1;
  let vx=clamp(s.velocity[0]+(material.stiffness*(target[0]*ts-s.displacement[0])-material.damping*s.velocity[0])*dt,64);
  let vy=clamp(s.velocity[1]+(material.stiffness*(target[1]*ts-s.displacement[1])-material.damping*s.velocity[1])*dt,64);
  let x=s.displacement[0]+vx*dt,y=s.displacement[1]+vy*dt;
  const len=Math.hypot(x,y);
  if(len>max){x*=max/len;y*=max/len;vx=0;vy=0;}
  return {...s,displacement:[x,y],velocity:[vx,vy]};
}
export type VectorDrawRegion={id:string;commands:VectorCommand[];fill?:string;stroke?:{color:string;width:number};fillRule:'nonzero'|'evenodd';transform?:VectorMatrix;compound?:CompoundFill};
function freezeDeep<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
/** Own one cache per preview or renderer. Validate once at the asset boundary.
 * Keyed by caller identity AND source reference; edits replace source objects.
 * Runtime source is a frozen parse copy. No GPU resources owned by this cache.
 */
export class VectorArtworkCache{
  private entries=new Map<string,{input:unknown;art:VectorArtwork}>();
  private readonly capacity:number;
  constructor(capacity=64){
    this.capacity=capacity;
    if(!Number.isInteger(capacity)||capacity<1||capacity>256)throw Error('Invalid cache capacity');
  }
  prepare(key:string,input:unknown):VectorArtwork{
    const entry=this.entries.get(key);
    if(entry&&entry.input===input){this.entries.delete(key);this.entries.set(key,entry);return entry.art;}
    const art=freezeDeep(VectorArtworkV1.parse(input));
    this.entries.delete(key);this.entries.set(key,{input,art});
    if(this.entries.size>this.capacity){const oldest=this.entries.keys().next().value;if(oldest!==undefined)this.entries.delete(oldest);}
    return art;
  }
  invalidate(key:string){this.entries.delete(key);}
  dispose(){this.entries.clear();}
  get size(){return this.entries.size;}
}
/** Both render adapters consume the same native drawing order. Compound
 * fills support validated polygon rings without masks or dynamic weights. */
export function vectorDrawList(art:VectorArtwork,palette:Readonly<Record<string,string>>={},state?:VectorRuntimeState):VectorDrawRegion[]|undefined{
  const compounds=new Map<string,CompoundFill>();
  for(const region of art.regions){
    if(region.clipRegionId||region.maskRegionId)return;
    const multiple=region.commands.filter(command=>command[0]==='M').length!==1;
    if(!multiple&&region.fillRule==='nonzero')continue;
    if(region.material||state?.regionId===region.id)return;
    const compound=compileCompoundFill(region.commands,region.fillRule);
    if(!compound)return;
    compounds.set(region.id,compound);
  }
  const color=(p:z.infer<typeof paint>)=>{
    if(p.kind==='solid')return p.color;
    const override=Object.hasOwn(palette,p.key)?palette[p.key]:undefined;
    return override&&/^#[0-9a-fA-F]{6}$/.test(override)?override:art.palette[p.key];
  };
  return [...art.regions].sort((a,b)=>a.layer-b.layer).map(r=>({
    id:r.id,commands:state?.regionId===r.id?deformRegion(r,state.displacement):r.commands.map(c=>[...c] as VectorCommand),
    fill:r.fill?color(r.fill):undefined,stroke:r.stroke?{color:color(r.stroke.paint),width:r.stroke.width}:undefined,
    fillRule:r.fillRule,transform:r.transform,...(compounds.has(r.id)?{compound:compounds.get(r.id)}:{})
  }));
}
