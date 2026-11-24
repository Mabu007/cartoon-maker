import assert from 'node:assert/strict';
import test from 'node:test';
import {reconstructHumanFrame,observedBodyYaw,facingForBodyYaw,mirrorCapturedRig} from '../src/engine/humanReconstruction.ts';
import {refinePerformance,combineCaptureEvidence} from '../src/engine/performanceRefinement.ts';
import {createPerformanceStabilizer} from '../src/engine/performanceStabilizer.ts';
import {CapturedPoseKey} from '../src/engine/schema.ts';
import type {CaptureFrame,Landmark,PerformanceKey} from '../src/engine/performanceCapture.ts';

const point=(x:number,y:number,visibility=1,z=0):Landmark=>({x,y,z,visibility});
test('fresh anatomically plausible hand observations recover a missing wrist, stale ones do not',()=>{
  const pose=Array.from({length:33},()=>point(0,0,0));
  pose[11]=point(.65,.45);pose[12]=point(.35,.45);pose[13]=point(.7,.3);
  const frame:CaptureFrame={t:0,pose,leftHand:[point(.72,.2)],handAgeMs:{left:0}};
  const rebuilt=reconstructHumanFrame(frame);
  assert.equal(rebuilt.pose[15].visibility,.65);
  assert.equal(frame.pose[15].visibility,0);
  assert.equal(reconstructHumanFrame({...frame,handAgeMs:{left:200}}).pose[15].visibility,0);
});
test('metric shoulder yaw is independent of the face and is hysteretic',()=>{
  const world=Array.from({length:33},()=>point(0,0,0));
  world[11]=point(.15,0,1,.19);world[12]=point(-.15,0,1,-.19);
  const yaw=observedBodyYaw(world)!;
  assert(yaw>.32);
  assert.equal(facingForBodyYaw(yaw,'front'),'left');
  assert.equal(facingForBodyYaw(.2,'left'),'left');
  assert.equal(facingForBodyYaw(.05,'left'),'front');
});
test('body orientation persists in valid compact timeline keys',()=>{
  const stabilizer=createPerformanceStabilizer();
  stabilizer.update({time:0,pose:{head:0},bodyYaw:.8});
  const key=stabilizer.update({time:.07,pose:{head:0},bodyYaw:.8});
  assert.equal(key.bodyFacing,'left');
  assert(CapturedPoseKey.safeParse({...key,time:.5}).success);
});
const key=(x:number):PerformanceKey=>({time:0,pose:{leftShoulder:x},armTargets:{left:{x,y:-30}}});
test('short same-beat occlusion is reconstructed without changing source timing',()=>{
  const source=[{elapsed:0,sample:key(0)},{elapsed:.07},{elapsed:.14,sample:key(10)}];
  const refined=refinePerformance(source);
  assert.equal(refined[1].elapsed,.07);
  assert.equal(refined[1].sample?.armTargets?.left?.x,5);
  assert.equal(source[1].sample,undefined);
});
test('long occlusion remains explicit and a contact change is not fabricated',()=>{
  const source=[{elapsed:0,sample:key(0)},{elapsed:.5},{elapsed:1,sample:key(10)}];
  assert.equal(refinePerformance(source)[1].sample,undefined);
  const change=[{elapsed:0,sample:key(0)},{elapsed:.07},{elapsed:.14,sample:{...key(10),contact:'prayer' as const}}];
  assert.equal(refinePerformance(change)[1].sample,undefined);
});
test('recording evidence restores deliberate motion without changing small held noise',()=>{
  const stable=key(10);
  assert.equal(combineCaptureEvidence(key(11),stable).armTargets?.left?.x,10);
  assert((combineCaptureEvidence(key(30),stable).armTargets?.left?.x??0)>20);
});

test('left-facing artwork preserves the same screen wrist and hand identity',()=>{
  const original:PerformanceKey={time:0,pose:{leftShoulder:30,rightShoulder:-10},armTargets:{left:{x:-25,y:-30},right:{x:15,y:10}},
    hands:{left:'point',right:'fist'},contact:'chin-left',nearArm:'left'};
  const mirrored=mirrorCapturedRig(original);
  assert.deepEqual(mirrored.armTargets?.right,{x:25,y:-30});
  assert.equal(mirrored.hands?.right,'point');
  assert.equal(mirrored.contact,'chin-right');
  assert.equal(mirrored.pose.rightShoulder,-30);
  assert.equal(original.hands?.left,'point');
});
