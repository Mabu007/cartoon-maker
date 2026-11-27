import assert from 'node:assert/strict';
import test from 'node:test';
import {animations,rig,sample,viewForward} from '../src/engine/animation.ts';
import {flagshipCharacters} from '../src/engine/visualPresets.ts';
import {viewArt,heldGripPoint} from '../src/engine/actorArt.ts';
import {resolveArtworkArm,resolveArtworkLeg} from '../src/engine/resolvedArtworkPose.ts';
import {classifyArtworkPose} from '../src/engine/primaryArtworkPose.ts';
import {anatomicalSegments,morphLimbArtwork,poseLimbArtwork,primaryArtworkCacheSize} from '../src/engine/anatomicalVectorArt.ts';
import {propArm} from '../src/engine/propMotion.ts';
import {solveStrictCapturedArm} from '../src/engine/performanceArmIntelligence.ts';
import {CharacterDefinition,views,type Clip} from '../src/engine/schema.ts';
import {makeProject} from '../src/engine/presets.ts';
import {evaluate} from '../src/engine/evaluate.ts';
import {forearmVectorFixture} from '../src/engine/vectorArtworkFixture.ts';
import {NativeVectorComponent,CharacterVisual} from '../src/engine/visualAssets.ts';
import {nativeBoneFor} from '../src/engine/nativeVectorBone.ts';
import {garmentDefaults} from '../src/engine/garmentDesignSchema.ts';
import {garmentSkirt,garmentTorso} from '../src/engine/garmentGeometry.ts';
const length=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
test('resolved arm geometry preserves authoritative prop and strict captured IK endpoints in every view',()=>{
 for(const c of flagshipCharacters)for(const view of views)for(const side of ['left','right'] as const){
  const r=rig(c,{},viewArt[view].width),art=viewArt[view],original=structuredClone(r);
  const prop={action:'idle' as const,time:0,weight:1};
  const held=resolveArtworkArm(c,r,side,art,'idle',0,true,false,true,false,{propPose:prop,capturedArms:{left:true,right:true}});
  const [elbow,hand]=propArm(c,r,side,prop,true,art.rear);
  assert.deepEqual(held.elbow,elbow);assert.deepEqual(held.hand,hand);
  assert.deepEqual({x:held.hand.x+7,y:held.hand.y+9},heldGripPoint(c,view,{},side));
  for(const target of [{x:0,y:-100},{x:4,y:-7},{x:42,y:10},{x:-34,y:5}]){
   const authority={capturedArms:{left:true,right:true},capturedRig:{targets:{[side]:target},bends:{[side]:side==='left'?-1:1},depths:{},influence:1}};
   const solved=resolveArtworkArm(c,r,side,art,'idle',0,false,false,true,false,authority);
   const reference=solveStrictCapturedArm(r[side].shoulder,target,c.arms,side,side==='left'?-1:1);
   assert(Math.abs(length(solved.shoulder,solved.elbow)-28*c.arms)<1e-6);
   assert(Math.abs(length(solved.elbow,solved.hand)-28*c.arms)<1e-6);
   assert(length(solved.hand,reference.hand)<1e-6);
  }
  assert.deepEqual(r,original);
 }
});
test('pose-aware vector contours preserve topology and axial points; cache is bounded',()=>{
 for(const c of flagshipCharacters)for(const view of views)for(const action of ['idle','walk','run','sit','wave','talk','point','cry'] as const){
  const s=sample(animations[action],.4),r=rig(c,s.pose,viewArt[view].width);
  for(const side of ['left','right'] as const){
   const a=resolveArtworkArm(c,r,side,viewArt[view],action,.4,false,false,false,action==='cry');
   const l=resolveArtworkLeg(c,r,side,action,action==='walk'||action==='run'?action:'idle',s.lift,.4,viewForward(view));
   const original=structuredClone([a,l]);
   for(const [points,region] of [[[a.shoulder,a.elbow,a.hand],'upper-arm'],[[l.upper,l.knee,l.foot],'thigh']] as const){
    const [start,joint,end]=points;const desc=classifyArtworkPose(start,joint,end,{view,side,centerX:r.hip.x,arm:region==='upper-arm',seated:action==='sit'});
    const frames=anatomicalSegments(points,10,region,c.visual,desc);
    for(const {frame,art,region:part} of frames){
     const rest=morphLimbArtwork(part,c.visual);
     for(const key of ['outline','shadow','highlight'] as const){
      const num=(d:string)=>d.match(/-?(?:\d+(?:\.\d*)?|\.\d+)/g)!.map(Number);
      assert.equal(art[key].replace(/[^MLQCZ]/g,''),rest[key].replace(/[^MLQCZ]/g,''));
      assert.deepEqual(num(art[key]).filter((_,i)=>i%2===0),num(rest[key]).filter((_,i)=>i%2===0));
     }
     assert(frame.length>0);
     assert.equal(poseLimbArtwork(part,rest,desc),art);
    }
   }
   assert.deepEqual([a,l],original);
  }
 }
 assert(primaryArtworkCacheSize()<=96);
});
test('pose classes use explicit contact, confidence and optional hysteresis; seeking is deterministic',()=>{
 const a={x:20,y:0},b={x:32,y:20},c={x:22,y:-12},opts={view:'front' as const,side:'right' as const,centerX:0};
 assert.equal(classifyArtworkPose(a,b,c,opts).kind,'raised');
 assert.equal(classifyArtworkPose(a,b,c,{...opts,contact:true}).kind,'contact');
 assert.equal(classifyArtworkPose(a,b,c,{...opts,contact:true,confidence:.1}).kind,'raised');
 const near={x:22,y:-6};assert.equal(classifyArtworkPose(a,b,near,{...opts,previous:'raised'}).kind,'raised');
 assert.deepEqual(classifyArtworkPose(a,b,c,opts),classifyArtworkPose(a,b,c,opts));
});
test('authored alternate topology selects only the matching pose and facing',()=>{
 const artwork={...forearmVectorFixture,regions:forearmVectorFixture.regions.map(r=>({...r,fill:undefined,stroke:{paint:{kind:'palette' as const,key:'ink'},width:.03},commands:[['M',0,0],['L',1,0]] as typeof r.commands,material:undefined}))};
 const part=NativeVectorComponent.parse({id:'pose-variant',slot:'forearm-left',view:'front',profiles:['average'],facing:'normal',artwork:forearmVectorFixture,poseArtwork:[{pose:'raised',artwork}]});
 const c=CharacterDefinition.parse({...flagshipCharacters[0],visual:CharacterVisual.parse({version:1,style:'illustrated',profile:'average',primaryArt:'pose-v1',vectorComponents:[part]})});
 assert.deepEqual(nativeBoneFor(c,'forearm-left','front',false,'raised')?.artwork,artwork);
 assert.equal(nativeBoneFor(c,'forearm-left','front',true,'raised'),undefined);
 assert.deepEqual(nativeBoneFor(c,'forearm-left','front',false,'seated')?.artwork,forearmVectorFixture);
});
test('recorded timeline fixture retains capture, hand and speech authority across tracking loss',()=>{
 const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0].id;
 const take:Extract<Clip,{track:'performance'}>={id:'artwork-take',track:'performance',actor,name:'Resolved art audition',start:2,length:2,performanceOrigin:'mocap',performance:[{time:0,pose:{leftShoulder:12,leftElbow:25},armTargets:{left:{x:25,y:15}},armBend:{left:-1},hands:{left:'point',right:'relaxed'},presence:1},{time:.5,pose:{},presence:0},{time:1,pose:{leftShoulder:20,leftElbow:35},armTargets:{left:{x:22,y:12}},armBend:{left:-1},hands:{left:'open',right:'relaxed'},presence:1}]};
 const input={...scene,clips:[...scene.clips,take]},chars=new Map(project.characters.map(c=>[c.id,c]));
 const snapshots=[2,2.5,3,3.5,3.99].map(t=>evaluate(input,t,chars));
 for(let i=0;i<snapshots.length;i++){
  const state=snapshots[i].actors.find(a=>a.id===actor)!;assert(state);
  const c=chars.get(state.characterId)!,r=rig(c,state.pose,viewArt[state.view].width),before=structuredClone(state);
  const solved=resolveArtworkArm(c,r,'left',viewArt[state.view],state.action,state.actionTime??0,!!state.heldItems?.left,false,!!state.capturedArms?.left,false,state);
  assert(Number.isFinite(solved.hand.x));assert.deepEqual(state,before);
 }
});
test('seated wrap skirt follows knee support without moving the rig',()=>{
 const c={...flagshipCharacters[1],garmentDesign:{...garmentDefaults,top:'wrap-tunic' as const,bottom:'wrap-skirt' as const}};
 const hip={x:0,y:-76},knees=[{x:-15,y:-60},{x:30,y:-55}] as const;
 const a=garmentSkirt(c,viewArt.front,hip,false),b=garmentSkirt(c,viewArt.front,hip,true,knees);
 assert.notEqual(a[0].d,b[0].d);assert(b.some(x=>x.id==='wrap-overlap'));assert.deepEqual(knees,[{x:-15,y:-60},{x:30,y:-55}]);
 const r=rig(c,{},1);assert(garmentTorso(c,viewArt.front,r.neck,r.hip,r.left.shoulder,r.right.shoulder).some(x=>x.id==='top-wrap-diagonal'));
});
