/** Isolated visual-only fixed tick solver. No renderer, IK, media or DOM dependency. */
import {z} from 'zod';
import {deformRegion,type VectorRegion,type VectorMatrix} from './vectorArtwork.ts';
const n=(a:number,b:number)=>z.number().finite().min(a).max(b);
const id=z.string().min(1).max(80);
const vec=z.strictObject({x:n(-10000,10000),y:n(-10000,10000)});
export type LvePoint=z.infer<typeof vec>;
export const LveMaterial=z.strictObject({mass:n(.1,8),stiffness:n(0,256),damping:n(0,32),gravityScale:n(0,2),drag:n(0,12),windResponse:n(0,2),maxDisplacement:n(0,32),collisionGroup:z.number().int().min(0).max(15)});
export type LveMaterialData=z.infer<typeof LveMaterial>;
export const lveMaterials={spring:{mass:1,stiffness:72,damping:12,gravityScale:.1,drag:2,windResponse:.3,maxDisplacement:8,collisionGroup:0},braid:{mass:1.2,stiffness:18,damping:7,gravityScale:.65,drag:2,windResponse:.4,maxDisplacement:12,collisionGroup:0},fabric:{mass:.6,stiffness:36,damping:9,gravityScale:.45,drag:3,windResponse:.8,maxDisplacement:10,collisionGroup:0}} satisfies Record<string,LveMaterialData>;
export const LveNode=z.strictObject({id,rest:vec,pin:n(0,1),material:LveMaterial});
const constraint=z.strictObject({a:id,b:id,length:n(.001,500),strength:n(0,1),kind:z.enum(['distance','bend'])});
const capsule=z.strictObject({id,a:vec,b:vec,radius:n(.1,100),groups:z.array(z.number().int().min(0).max(15)).min(1).max(16)});
export const LveDefinition=z.strictObject({version:z.literal(1),id,nodes:z.array(LveNode).min(1).max(128),constraints:z.array(constraint).max(256),colliders:z.array(capsule).max(16)}).superRefine((d,ctx)=>{
 const keys=new Set(d.nodes.map(x=>x.id));if(keys.size!==d.nodes.length)ctx.addIssue({code:'custom',message:'Duplicate node'});
 const edges=new Set<string>();for(const c of d.constraints){const k=[c.a,c.b].sort().join('/')+'/'+c.kind;if(c.a===c.b||!keys.has(c.a)||!keys.has(c.b)||edges.has(k))ctx.addIssue({code:'custom',message:'Invalid constraint'});edges.add(k);}
 if(new Set(d.colliders.map(c=>c.id)).size!==d.colliders.length)ctx.addIssue({code:'custom',message:'Duplicate collider'});
});
export const LveConfig=z.strictObject({version:z.literal(1),seed:z.number().int().min(0).max(4294967295),hz:z.union([z.literal(30),z.literal(60)]),iterations:z.number().int().min(1).max(6),maxNodesPerActor:z.number().int().min(1).max(128),maxSceneNodes:z.number().int().min(1).max(512),maxConstraints:z.number().int().min(0).max(1024),checkpointInterval:z.number().int().min(15).max(300),maxCheckpoints:z.number().int().min(1).max(32)});
export type LveConfigData=z.infer<typeof LveConfig>;
export const lveDefaultConfig:LveConfigData={version:1,seed:1,hz:60,iterations:4,maxNodesPerActor:48,maxSceneNodes:192,maxConstraints:384,checkpointInterval:60,maxCheckpoints:16};
export type LveDefinitionData=z.infer<typeof LveDefinition>;
export const LveForces=z.strictObject({gravity:vec,wind:vec,turbulence:n(0,80),impulse:vec.optional()});
export type LveForceData=z.infer<typeof LveForces>;
export type LveInput={transform:VectorMatrix;forces:LveForceData;cut?:boolean;sleep?:boolean};
export type LveSampler=(tick:number,entityId:string)=>LveInput;
const stateNode=z.strictObject({id,x:n(-10032,10032),y:n(-10032,10032),vx:n(-256,256),vy:n(-256,256)});
const matrix=z.tuple([n(-8,8),n(-8,8),n(-8,8),n(-8,8),n(-10000,10000),n(-10000,10000)]);
export const LveCheckpoint=z.strictObject({version:z.literal(1),signature:z.string().min(1),tick:z.number().int().min(0).max(10800),entities:z.array(z.strictObject({id,transform:matrix,velocity:vec,nodes:z.array(stateNode).max(128)})).max(512)});
export type LveCheckpointData=z.infer<typeof LveCheckpoint>;
type EntityState=LveCheckpointData['entities'][number];
type NodeState=EntityState['nodes'][number];
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const cap=(x:number,y:number,max:number):[number,number]=>{const l=Math.hypot(x,y);return l>max&&l>0?[x*max/l,y*max/l]:[x,y];};
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const identity:[number,number,number,number,number,number]=[1,0,0,1,0,0];
function noise(seed:number,tick:number,index:number){let x=(seed^Math.imul(tick+1,0x9e3779b1)^Math.imul(index+1,0x85ebca6b))>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967295*2-1;}
const localVector=(m:VectorMatrix,x:number,y:number):[number,number]=>{const det=m[0]*m[3]-m[1]*m[2];return Math.abs(det)<.002?[0,0]:[(m[3]*x-m[2]*y)/det,(-m[1]*x+m[0]*y)/det];};
function reset(d:LveDefinitionData,transform:EntityState['transform']=identity):EntityState{return {id:d.id,transform:[...transform],velocity:{x:0,y:0},nodes:d.nodes.map(n=>({id:n.id,x:n.rest.x,y:n.rest.y,vx:0,vy:0}))};}
const bound=(p:NodeState,n:LveDefinitionData['nodes'][number])=>{const [x,y]=cap(p.x-n.rest.x,p.y-n.rest.y,n.material.maxDisplacement*(1-n.pin));p.x=n.rest.x+x;p.y=n.rest.y+y;};
export type LveMetrics={tick:number;nodes:number;constraints:number;iterations:number;fallbackEntities:number;steps:number;collisions:number};
export class LveSimulation{
 private config:LveConfigData;private definitions:LveDefinitionData[]=[];private fallback:LveDefinitionData[]=[];private states:EntityState[]=[];private checkpoints:LveCheckpointData[]=[];private previous:EntityState[]=[];private signature='';private tick=0;private disposed=false;
 private metrics:LveMetrics={tick:0,nodes:0,constraints:0,iterations:0,fallbackEntities:0,steps:0,collisions:0};
 constructor(definitions:readonly LveDefinitionData[],config:LveConfigData=lveDefaultConfig,revision='initial'){
  this.config=LveConfig.parse(config);this.configure(definitions,revision);
 }
 private assertActive(){if(this.disposed)throw Error('LVE disposed');}
 private configure(definitions:readonly LveDefinitionData[],revision:string){
  const all=definitions.map(d=>LveDefinition.parse(d)).sort((a,b)=>cmp(a.id,b.id));
  if(new Set(all.map(d=>d.id)).size!==all.length||all.length>512)throw Error('Invalid entity identities/budget');
  this.definitions=[];this.fallback=[];let nodes=0,edges=0;
  for(const d of all){d.nodes.sort((a,b)=>cmp(a.id,b.id));d.constraints.sort((a,b)=>cmp(a.kind+'/'+a.a+'/'+a.b,b.kind+'/'+b.a+'/'+b.b));d.colliders.sort((a,b)=>cmp(a.id,b.id));
   if(d.nodes.length>this.config.maxNodesPerActor||nodes+d.nodes.length>this.config.maxSceneNodes||edges+d.constraints.length>this.config.maxConstraints)this.fallback.push(d);
   else{this.definitions.push(d);nodes+=d.nodes.length;edges+=d.constraints.length;}}
  // Exact signature (not a collision-prone short hash). Revision includes upstream timeline/asset edits.
  this.signature=JSON.stringify([revision,this.config,all]);this.states=this.definitions.map(d=>reset(d));this.previous=structuredClone(this.states);this.tick=0;this.checkpoints=[];
  this.metrics={tick:0,nodes,constraints:edges,iterations:this.config.iterations,fallbackEntities:this.fallback.length,steps:0,collisions:0};
 }
 invalidate(definitions:readonly LveDefinitionData[],revision:string){this.assertActive();this.configure(definitions,revision);}
 checkpoint():LveCheckpointData{this.assertActive();return {version:1,signature:this.signature,tick:this.tick,entities:structuredClone(this.states)};}
 restore(raw:unknown){this.assertActive();const c=LveCheckpoint.parse(raw);if(c.signature!==this.signature||c.tick>180*this.config.hz||c.entities.length!==this.definitions.length)throw Error('Incompatible checkpoint');
  for(let i=0;i<c.entities.length;i++){const e=c.entities[i],d=this.definitions[i];if(e.id!==d.id||e.nodes.length!==d.nodes.length||e.nodes.some((p,j)=>p.id!==d.nodes[j].id||Math.hypot(p.x-d.nodes[j].rest.x,p.y-d.nodes[j].rest.y)>d.nodes[j].material.maxDisplacement*(1-d.nodes[j].pin)+1e-6))throw Error('Invalid checkpoint state');}
  this.states=c.entities;this.previous=structuredClone(c.entities);this.tick=c.tick;this.metrics.tick=this.tick;
 }
 private step(sample:LveSampler){
  const dt=1/this.config.hz,next=this.tick+1;this.previous=structuredClone(this.states);
  for(let ei=0;ei<this.definitions.length;ei++){
   const d=this.definitions[ei],s=this.states[ei],input=sample(next,d.id),parsed=matrix.safeParse(input.transform),forces=LveForces.safeParse(input.forces);
   if(!parsed.success||!forces.success){this.states[ei]=reset(d,s.transform);continue;}
   const m=parsed.data,det=m[0]*m[3]-m[1]*m[2],jump=Math.hypot(m[4]-s.transform[4],m[5]-s.transform[5]);
   if(input.cut||input.sleep||jump>80||Math.abs(det)<.002){this.states[ei]=reset(d,m);this.previous[ei]=structuredClone(this.states[ei]);continue;}
   const [avx,avy]=cap((m[4]-s.transform[4])/dt,(m[5]-s.transform[5])/dt,256);
   const [ax,ay]=cap((avx-s.velocity.x)/dt,(avy-s.velocity.y)/dt,160);
   const force=forces.data,old=s.nodes.map(p=>({x:p.x,y:p.y}));s.transform=m;s.velocity={x:avx,y:avy};
   const index=new Map(d.nodes.map((n,i)=>[n.id,i]));
   for(let j=0;j<d.nodes.length;j++){const p=s.nodes[j],node=d.nodes[j],mat=node.material,free=1-node.pin;if(!free){p.x=node.rest.x;p.y=node.rest.y;p.vx=p.vy=0;continue;}
    const [fx,fy]=localVector(m,force.gravity.x*mat.gravityScale+force.wind.x*mat.windResponse+noise(this.config.seed,next,ei*128+j)*force.turbulence-ax+(force.impulse?.x??0)/dt,force.gravity.y*mat.gravityScale+force.wind.y*mat.windResponse+noise(this.config.seed^137,next,ei*128+j)*force.turbulence-ay+(force.impulse?.y??0)/dt);
    const [sx,sy]=cap(fx,fy,400),spring=mat.stiffness/mat.mass,decay=Math.exp(-(mat.damping/mat.mass+mat.drag)*dt);
    const [vx,vy]=cap((p.vx+((node.rest.x-p.x)*spring+sx)*dt*free)*decay,(p.vy+((node.rest.y-p.y)*spring+sy)*dt*free)*decay,160);
    p.x+=vx*dt;p.y+=vy*dt;bound(p,node);
   }
   for(let it=0;it<this.config.iterations;it++){
    for(const c of d.constraints){const ia=index.get(c.a)!,ib=index.get(c.b)!,a=s.nodes[ia],b=s.nodes[ib],na=d.nodes[ia],nb=d.nodes[ib],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),wa=(1-na.pin)/na.material.mass,wb=(1-nb.pin)/nb.material.mass;
     if(len<1e-8||wa+wb===0)continue;const k=(len-c.length)/len*c.strength/(wa+wb);a.x+=dx*k*wa;a.y+=dy*k*wa;b.x-=dx*k*wb;b.y-=dy*k*wb;bound(a,na);bound(b,nb);}
    for(let j=0;j<s.nodes.length;j++){const p=s.nodes[j],node=d.nodes[j];if(node.pin===1)continue;
     for(const c of d.colliders){if(!c.groups.includes(node.material.collisionGroup))continue;const dx=c.b.x-c.a.x,dy=c.b.y-c.a.y,t=clamp(((p.x-c.a.x)*dx+(p.y-c.a.y)*dy)/Math.max(1e-9,dx*dx+dy*dy),0,1),x=c.a.x+t*dx,y=c.a.y+t*dy,ux=p.x-x,uy=p.y-y,len=Math.hypot(ux,uy);
      if(len<c.radius){p.x=x+(len>1e-8?ux/len:1)*c.radius;p.y=y+(len>1e-8?uy/len:0)*c.radius;bound(p,node);this.metrics.collisions++;}}
    }
   }
   for(let j=0;j<s.nodes.length;j++){const p=s.nodes[j];[p.vx,p.vy]=cap((p.x-old[j].x)/dt,(p.y-old[j].y)/dt,160);}
  }
  this.tick=next;this.metrics.tick=next;this.metrics.steps++;
  if(next%this.config.checkpointInterval===0){this.checkpoints.push(this.checkpoint());if(this.checkpoints.length>this.config.maxCheckpoints)this.checkpoints.shift();}
 }
 /** Exact tick reconstruction. No dropping ticks on a scrub. Max 180 s; render alpha is separate. */
 seek(tick:number,sample:LveSampler){this.assertActive();if(!Number.isInteger(tick)||tick<0||tick>180*this.config.hz)throw Error('Invalid simulation tick');
  if(tick<this.tick){const nearest=this.checkpoints.filter(c=>c.tick<=tick).sort((a,b)=>b.tick-a.tick)[0];if(nearest)this.restore(nearest);else{this.states=this.definitions.map(d=>reset(d));this.previous=structuredClone(this.states);this.tick=0;}this.checkpoints=this.checkpoints.filter(c=>c.tick<=tick);}
  while(this.tick<tick)this.step(sample);this.metrics.tick=this.tick;return this.offsets();
 }
 /** Bounded realtime advancement; caller may defer remaining ticks, never discard them. */
 advance(target:number,sample:LveSampler,maxSubsteps=4){this.assertActive();if(!Number.isInteger(target)||target<this.tick||target>180*this.config.hz)throw Error('Invalid target tick');return this.seek(Math.min(target,this.tick+clamp(Math.floor(maxSubsteps),1,8)),sample);}
 offsets(alpha=1){this.assertActive();const t=Number.isFinite(alpha)?clamp(alpha,0,1):1;return [...this.definitions.map((d,i)=>({id:d.id,nodes:d.nodes.map((n,j)=>{const p=this.states[i].nodes[j],a=this.previous[i].nodes[j];return {id:n.id,dx:(a.x+(p.x-a.x)*t)-n.rest.x,dy:(a.y+(p.y-a.y)*t)-n.rest.y};})})),...this.fallback.map(d=>({id:d.id,nodes:d.nodes.map(n=>({id:n.id,dx:0,dy:0}))}))].sort((a,b)=>cmp(a.id,b.id));}
 instrumentation(){return {...this.metrics};}
 dispose(){this.states=[];this.previous=[];this.checkpoints=[];this.definitions=[];this.fallback=[];this.disposed=true;}
}
/** Adapter from a regional node delta to canonical weighted vector geometry. */
export function lveRegionCommands(region:VectorRegion,offset:{dx:number;dy:number}){return deformRegion(region,[offset.dx,offset.dy]);}
