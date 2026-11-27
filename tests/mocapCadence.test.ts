import assert from 'node:assert/strict';
import test from 'node:test';
import { observedArmGuidance } from '../src/engine/performanceArmIntelligence.ts';
import { createPerformanceStabilizer } from '../src/engine/performanceStabilizer.ts';
import type { Landmark, PerformanceKey } from '../src/engine/performanceCapture.ts';

test('visible wrist continues to guide IK with an occluded elbow',()=>{
  const pose:Landmark[]=Array.from({length:33},()=>({x:0,y:0,visibility:0}));
  pose[11]={x:.65,y:.45,visibility:1};
  pose[12]={x:.35,y:.45,visibility:1};
  pose[15]={x:.75,y:.15,visibility:1};
  const result=observedArmGuidance(pose);
  assert(result.targets.left);
  assert(result.targets.left.y<0);
  assert.equal(result.bends.left,undefined);
});
test('slow but valid inference does not repeatedly reset held poses',()=>{
  const stabilizer=createPerformanceStabilizer();
  const key=(time:number,x:number):PerformanceKey=>({time,pose:{leftShoulder:60},armTargets:{left:{x,y:-35}}});
  const initial=stabilizer.update(key(0,12));
  for(let i=1;i<=10;i++){
    const next=stabilizer.update(key(i*.65,12+Math.sin(i)));
    assert.deepEqual(next.armTargets?.left,initial.armTargets?.left);
    assert.equal(next.armConfidence?.left,1);
  }
});
test('a single slow missed wrist observation cannot drop a raised arm',()=>{
  const stabilizer=createPerformanceStabilizer();
  const raised:PerformanceKey={time:0,pose:{leftShoulder:60},armTargets:{left:{x:12,y:-35}}};
  stabilizer.update(raised);
  const missing=stabilizer.update({time:.7,pose:{head:0}});
  assert.deepEqual(missing.armTargets?.left,raised.armTargets?.left);
  assert.equal(missing.armConfidence?.left,1);
  const recovered=stabilizer.update({...raised,time:.95});
  assert.equal(recovered.armConfidence?.left,1);
});
