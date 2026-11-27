/** Scene-clock adapter. Physics only returns local artwork offsets.
 * Reference hair group IDs are stable across views; missing groups are omitted.
 * No actor, rig, prop, facial or timeline state is written by this module. */
import {evaluate,type CharacterState} from './evaluate.ts';
import {rig,viewForward,type Point} from './animation.ts';
import {buildLayeredHair,type HairModel} from './layeredHair.ts';
import {LveSimulation,LveMaterial,lveMaterials,lveDefaultConfig,type LveDefinitionData,type LveMaterialData,type LveSampler} from './lveSimulation.ts';
import {characterSecondaryDefaults,type SceneSecondaryData,type SecondaryComponent} from './secondaryMotionSchema.ts';
import type {Character,Scene,View} from './schema.ts';
import type {VectorMatrix} from './vectorArtwork.ts';
const viewWidth:Record<View,number>={front:1,'three-quarter':.88,side:.57,'back-quarter':.81,back:1};
const front={width:1,face:0,far:true,rear:false,profile:false};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export type Offset=readonly [number,number];
export type SecondaryOffsets={hair:Readonly<Record<string,Offset>>;accessories:Offset;earrings:Offset;body:Offset;cloth:Offset;face:Offset};
const zero:Offset=[0,0];
const blank=():SecondaryOffsets=>({hair:{},accessories:zero,earrings:zero,body:zero,cloth:zero,face:zero});
type Binding={id:string;actorId:string;head:boolean;component:SecondaryComponent;group?:string;tip:string;strength:number;root:Point};
function material(c:Character,component:SecondaryComponent,base:LveMaterialData,max:number):LveMaterialData{
 const patch=c.secondaryMotion?.components?.[component]?.material??{};
 return LveMaterial.parse({...base,...patch,maxDisplacement:Math.min(max,patch.maxDisplacement??base.maxDisplacement)});
}
function strength(c:Character,s:SceneSecondaryData,key:SecondaryComponent){const q=c.secondaryMotion??characterSecondaryDefaults,o=q.components?.[key];return q.enabled&&o?.enabled!==false?s.strength*q.strength*(o?.strength??1):0;}
export function buildDynamics(scene:Scene,characters:readonly Character[],settings:SceneSecondaryData){
 const chars=new Map(characters.map(c=>[c.id,c])),defs:LveDefinitionData[]=[],bindings:Binding[]=[];
 // Whole groups selected in deterministic actor / component order. Budget is
 // per actor rather than per group. IDs are short and independent of user IDs.
 const max=settings.quality==='eco'?24:48;
 for(const [i,actor] of [...scene.actors].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).entries()){
  const c=chars.get(actor.characterId);if(!c)continue;let count=0;
  const add=(component:SecondaryComponent,head:boolean,points:Point[],pins:number[],mat:LveMaterialData,group?:string,colliders:LveDefinitionData['colliders']=[])=>{
   const weight=strength(c,settings,component);if(weight===0||mat.maxDisplacement===0||count+points.length>max)return;
   const id='a'+i+'-'+component+'-'+(group??'spring'),tip='n'+(points.length-1);
   defs.push({version:1,id,nodes:points.map((rest,j)=>({id:'n'+j,rest,pin:pins[j],material:mat})),constraints:points.slice(1).map((p,j)=>({a:'n'+j,b:'n'+(j+1),length:Math.max(.001,Math.hypot(p.x-points[j].x,p.y-points[j].y)),strength:.8,kind:'distance'})),colliders});
   bindings.push({id,actorId:actor.id,head,component,group,tip,strength:weight,root:points[0]});count+=points.length;
  };
  const hair=buildLayeredHair(c,front);
  if(hair&&['none','visor','sun-visor','fascinator'].includes(c.hat)){
   for(const g of hair.groups){const mat=hair.artwork.materials.find(m=>m.id===g.materialId)!;
    const collision=hair.artwork.collisionProxies.filter(p=>g.collisionProxyIds.includes(p.id)).map(p=>({id:p.id,a:{x:p.center[0],y:p.center[1]},b:{x:p.center[0],y:p.center[1]},radius:p.radius*.85,groups:[0]}));
    const points=g.points.map(([x,y])=>({x,y}));
    add('hair',true,points,g.pins,material(c,'hair',{...lveMaterials.braid,stiffness:mat.stiffness,damping:mat.damping,windResponse:g.wind,gravityScale:.05,maxDisplacement:g.maxDisplacement},Math.min(8,g.maxDisplacement)),g.id,g.mode==='chain'?collision:[]);
   }
  }
  const q=c.wardrobe;
  if(c.earrings||q?.piercing&&q.piercing!=='none')add('accessories',true,[{x:0,y:0},{x:0,y:8}],[1,0],material(c,'accessories',{...lveMaterials.braid,gravityScale:.025,maxDisplacement:2},2),'earrings');
  if(['chain','lanyard'].includes(q?.extra??c.accessory)||q?.bag&&q.bag!=='none')
    add('accessories',false,[{x:0,y:0},{x:0,y:12}],[1,0],material(c,'accessories',{...lveMaterials.braid,gravityScale:.04,maxDisplacement:3},3));
  if(c.garmentDesign){
   const rigid=c.garmentDesign.material==='leather'||c.garmentDesign.material==='denim';
   add('cloth',false,[{x:0,y:0},{x:0,y:22}],[1,0],material(c,'cloth',{...lveMaterials.fabric,gravityScale:.025,stiffness:rigid?150:72,maxDisplacement:rigid?1:4},rigid?1:4));
  }
  // Body offsets are limited by softness, not sex or body identity. Only
  // supported garment surface contours consume them, never bone positions.
  const soft=clamp(c.visual?.softness??.5,0,1);
  if(c.visual?.primaryArt==='pose-v1')add('body',false,[{x:0,y:0}],[0],material(c,'body',{...lveMaterials.spring,gravityScale:0,windResponse:0,stiffness:110,damping:20,maxDisplacement:1.6*soft},1.6*soft));
  if(c.visual?.primaryArt==='pose-v1')add('face',true,[{x:0,y:0}],[0],material(c,'face',{...lveMaterials.spring,gravityScale:0,windResponse:0,stiffness:140,damping:24,maxDisplacement:.55*soft},.55*soft));
 }
 return {defs,bindings};
}
export function secondaryAnchor(actor:CharacterState,c:Character,view:View,flip:boolean,head:boolean,time=actor.actionTime):VectorMatrix{
 const r=rig(c,actor.pose,viewWidth[view]),yaw=actor.capturedHeadYaw??0,p=head?{x:r.head.x-yaw*3.6*c.head,y:r.head.y}:r.neck;
 const rotation=actor.rotation*Math.PI/180,cos=Math.cos(rotation),sin=Math.sin(rotation),sx=actor.scale*(flip?-1:1),sy=actor.scale;
 const localAngle=head?(r.angle+(actor.listening?Math.sin(time*2.4+actor.id.length*.7)*1.4:0))*Math.PI/180:0,lc=Math.cos(localAngle),ls=Math.sin(localAngle),headScale=head?c.head:1;
 const headMirror=head&&view!=='back'&&view!=='back-quarter'&&actor.capturedHeadFacing==='left'?-1:1;
 const a=cos*sx*lc-sin*sy*ls,b=sin*sx*lc+cos*sy*ls,d=-cos*sx*ls-sin*sy*lc,e=-sin*sx*ls+cos*sy*lc;
 const turn=head?actor.turnScale*(1-.09*Math.abs(yaw)):1;
 return [a*headScale*headMirror*turn,b*headScale*headMirror*turn,d*headScale,e*headScale,actor.x+cos*sx*p.x-sin*sy*(p.y-actor.lift),actor.y+sin*sx*p.x+cos*sy*(p.y-actor.lift)];
}
export class CharacterDynamics{
 private sim?:LveSimulation;private scene?:Scene;private chars?:readonly Character[];private byId=new Map<string,Character>();private signature='';private bindings:Binding[]=[];private settings?:SceneSecondaryData;private width=960;private cachedTick=-1;private cachedActors=new Map<string,CharacterState>();private cameraView?:View;private hz=30;
 private configure(scene:Scene,characters:readonly Character[],width:number){
  const settings=scene.visual?.secondaryMotion;
  if(!settings?.enabled||settings.strength===0){this.dispose();return false;}
  if(this.scene===scene&&this.width===width&&this.chars?.length===characters.length&&this.chars.every((c,i)=>c===characters[i])&&this.sim)return true;
  // Document objects are immutable under the project store. Compare only when
  // references change; full canonical input revision invalidates seek history.
  const signature=JSON.stringify([scene,characters,width]);
  if(this.signature!==signature||!this.sim){
   this.dispose();const {defs,bindings}=buildDynamics(scene,characters,settings);
   this.settings=settings;this.bindings=bindings;this.hz=settings.quality==='eco'?30:60;
   if(!defs.length)return false;
   this.sim=new LveSimulation(defs,{...lveDefaultConfig,seed:settings.seed,hz:this.hz,iterations:settings.quality==='eco'?2:4,maxSceneNodes:settings.quality==='eco'?96:192,maxNodesPerActor:48,checkpointInterval:this.hz,maxCheckpoints:16},scene.id);
   this.signature=signature;this.byId=new Map(characters.map(c=>[c.id,c]));this.cachedTick=-1;
  }
  this.scene=scene;this.chars=characters;this.width=width;return true;
 }
 sample(scene:Scene,characters:readonly Character[],time:number,width=960):Map<string,SecondaryOffsets>{
  if(!this.configure(scene,characters,width)||!this.sim||!this.settings)return new Map();
  const settings=this.settings,bindingMap=new Map(this.bindings.map(b=>[b.id,b]));
  const sampler:LveSampler=(tick,id)=>{
   const t=tick/this.hz;
   if(this.cachedTick!==tick){const state=evaluate(scene,t,this.byId,width);this.cachedActors=new Map(state.actors.map(a=>[a.id,a]));this.cameraView=state.camera.view;this.cachedTick=tick;}
   const binding=bindingMap.get(id)!,a=this.cachedActors.get(binding.actorId),c=a&&this.byId.get(a.characterId);
   const forces={gravity:{x:0,y:12},wind:{x:settings.windX,y:settings.windY},turbulence:settings.turbulence};
   for(const g of settings.gusts){const p=(t-g.time)/g.duration;if(p>=0&&p<=1){const w=Math.sin(Math.PI*p);forces.wind.x+=g.x*w;forces.wind.y+=g.y*w;}}
   if(!a||!c||!a.visible)return {transform:[1,0,0,1,0,0],forces,sleep:true};
   const view=this.cameraView??a.view,flip=a.flip!==(viewForward(view)!==viewForward(a.view));
   const m=secondaryAnchor(a,c,view,flip,binding.head,t),root=binding.root;
   return {transform:[m[0],m[1],m[2],m[3],m[4]+m[0]*root.x+m[2]*root.y,m[5]+m[1]*root.x+m[3]*root.y],forces};
  };
  // At most one fixed tick per 30/60Hz. Same random-access clock for export
  // and preview. Render interpolation uses current tick (no look-ahead).
  const tick=Math.min(180*this.hz,Math.max(0,Math.floor(time*this.hz+1e-7))),raw=this.sim.seek(tick,sampler),out=new Map<string,SecondaryOffsets>();
  for(const entity of raw){const b=bindingMap.get(entity.id);if(!b)continue;const n=entity.nodes.find(n=>n.id===b.tip);if(!n)continue;
   const q:Offset=[Math.round(n.dx*b.strength*100)/100,Math.round(n.dy*b.strength*100)/100],o=out.get(b.actorId)??blank();
   if(b.component==='hair'&&b.group)o.hair={...o.hair,[b.group]:q};else if(b.component==='accessories'&&b.group==='earrings')o.earrings=q;else if(b.component!=='hair')o[b.component]=q;
   out.set(b.actorId,o);
  }return out;
 }
 instrumentation(){return this.sim?.instrumentation();}
 dispose(){this.sim?.dispose();this.sim=undefined;this.scene=undefined;this.chars=undefined;this.signature='';this.bindings=[];this.byId.clear();this.cachedActors.clear();this.cachedTick=-1;this.settings=undefined;}
}
/** Stable weighted path deformation uses the existing material pins. */
export function hairGroupOffsets(model:HairModel,offsets:SecondaryOffsets|undefined){if(!offsets)return undefined;const out:Record<string,Offset>={};for(const g of model.groups){const q=offsets.hair[g.id];if(q)out[g.id]=q;}return out;}

export function coupledLimbOffset(o:SecondaryOffsets):Offset{return [o.body[0]*.5+o.cloth[0]*.2,o.body[1]*.5+o.cloth[1]*.2];}
