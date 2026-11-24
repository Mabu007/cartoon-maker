import assert from 'node:assert/strict';
import test from 'node:test';
import {createObedientArm,observedArmGuidance,solveCapturedArm,scoreArmPoles} from '../src/engine/performanceArmIntelligence.ts';
import {createPerformanceStabilizer} from '../src/engine/performanceStabilizer.ts';
import {samplePerformance,type Landmark,type PerformanceKey} from '../src/engine/performanceCapture.ts';
import {compileResolvedPerformance} from '../src/engine/resolvedPerformance.ts';
import {CapturedPoseKey} from '../src/engine/schema.ts';
import {defaultStageViewport,zoomCanvasAt,boundStageViewport} from '../src/engine/stageViewport.ts';
const origin={x:0,y:0};
const magnitude=(p:{x:number;y:number})=>Math.hypot(p.x,p.y);
const target={x:-40,y:10};
const evidence=(pole:number,confidence=1)=>({elbow:solveCapturedArm(origin,target,1,pole).elbow,extension:magnitude(target)/56,confidence});
test('short projected human arm that is actually straight is not rendered bent',()=>{
  const pose:Landmark[]=Array.from({length:33},()=>({x:0,y:0,visibility:0}));
  pose[11]={x:.65,y:.45,visibility:1};pose[12]={x:.35,y:.45,visibility:1};
  pose[13]={x:.7,y:.38,visibility:1};pose[15]={x:.75,y:.31,visibility:1};
  const guidance=observedArmGuidance(pose);
  assert(guidance.evidence.left!.extension>.99);
  const arm=createObedientArm('left').update(guidance.targets.left!,guidance.evidence.left);
  assert(magnitude(arm.target)>55.9);
  const solved=solveCapturedArm(origin,arm.target,1,arm.pole);
  assert(Math.abs(magnitude(solved.elbow)-28)<1e-7);
  assert(Math.abs(Math.hypot(solved.hand.x-solved.elbow.x,solved.hand.y-solved.elbow.y)-28)<1e-7);
});
test('weak or missing evidence never flips an established pole',()=>{
  const solver=createObedientArm('left');
  const first=solver.update(target,evidence(1));
  for(let i=0;i<6;i++)assert.equal(solver.update(target,evidence(-first.pole,.58)).pole,first.pole);
  assert.equal(solver.update(target).pole,first.pole);
});
test('high-confidence opposite elbow evidence must persist for three observations',()=>{
  const solver=createObedientArm('left');
  const first=solver.update(target,evidence(1));
  const opposite=evidence(-first.pole);
  assert.equal(solver.update(target,opposite).pole,first.pole);
  assert.equal(solver.update(target,opposite).pole,first.pole);
  assert.equal(solver.update(target,opposite).pole,-first.pole);
});
test('ambiguous cross-body reach prefers a non-elevated elbow',()=>{
  const wrist={x:24,y:20};
  const score=scoreArmPoles(wrist,'left');
  const chosen=solveCapturedArm(origin,wrist,1,score.pole);
  assert(chosen.elbow.y>=-5);
});
test('one erroneous bent measurement cannot fold a held straight arm',()=>{
  const solver=createObedientArm('left');
  const first=solver.update({x:-56,y:0},{elbow:{x:-28,y:0},extension:1,confidence:1});
  const glitch=solver.update({x:-30,y:0},{elbow:{x:-15,y:-23},extension:.54,confidence:1});
  assert.equal(glitch.extension,first.extension);
  assert(magnitude(solver.update({x:-25,y:0}).target)>55.9);
});
test('rotating a straight arm on the timeline preserves extension and bone lengths',()=>{
  const keys:PerformanceKey[]=[{time:0,pose:{},armTargets:{left:{x:-55.99,y:0}},armExtension:{left:1},armBend:{left:1}},
    {time:1,pose:{},armTargets:{left:{x:0,y:-55.99}},armExtension:{left:1},armBend:{left:1}}];
  for(let i=0;i<=20;i++){
    const key=samplePerformance(keys,i/20);
    assert(magnitude(key.armTargets!.left!)>55.9);
    assert(CapturedPoseKey.safeParse(key).success);
  }
});
test('stabilized elbow reach and pole survive recording serialization',()=>{
  const stabilizer=createPerformanceStabilizer();
  const frames=Array.from({length:10},(_,i)=>({elapsed:i*.1,sample:stabilizer.update({time:i*.1,pose:{leftShoulder:25},armTargets:{left:target},armEvidence:{left:evidence(1)}})}));
  const result=compileResolvedPerformance(frames,.9);
  const key=samplePerformance(result.keys,.5);
  assert(key.armExtension?.left!==undefined);
  assert(key.armBend?.left!==undefined);
  assert(!key.armEvidence);
  assert(CapturedPoseKey.safeParse(key).success);
});
test('two-minute expressive take can retain more than 240 keys',()=>{
  const observations=Array.from({length:721},(_,i)=>({elapsed:i/6,sample:{time:i/6,pose:{leftShoulder:i%2?45:-45}}}));
  const take=compileResolvedPerformance(observations,120);
  assert.equal(take.duration,120);
  assert(take.keys.length>240&&take.keys.length<=1560);
  assert.equal(take.keys[0].time,0);assert.equal(take.keys.at(-1)?.time,1);
});
test('canvas zoom is cursor anchored, bounded and exactly resets to fit',()=>{
  const rect={left:50,top:30,width:400,height:200},pointer={x:180,y:110};
  const zoomed=zoomCanvasAt(defaultStageViewport,2,pointer,rect);
  const center={x:250,y:130};
  assert.equal((pointer.x-center.x-zoomed.panX)/zoomed.zoom,pointer.x-center.x);
  assert.equal((pointer.y-center.y-zoomed.panY)/zoomed.zoom,pointer.y-center.y);
  const bounded=boundStageViewport({...zoomed,panX:9999,panY:-9999},rect.width,rect.height);
  assert.equal(bounded.panX,200);assert.equal(bounded.panY,-100);
  assert.deepEqual(zoomCanvasAt(bounded,1,pointer,rect),defaultStageViewport);
});
