import assert from 'node:assert/strict';
import test from 'node:test';
import {createMotionIntent} from '../src/engine/motionIntent.ts';
import {createPerformanceStabilizer} from '../src/engine/performanceStabilizer.ts';
import {cleanResolvedObservations,compileResolvedPerformance} from '../src/engine/resolvedPerformance.ts';
import {samplePerformance,type PerformanceKey} from '../src/engine/performanceCapture.ts';

test('a held wrist ignores small jitter and isolated large excursions',()=>{
  const gate=createMotionIntent();
  assert.deepEqual(gate.update([20,-30],0,3),[20,-30]);
  for(let i=1;i<=80;i++){
    const raw=i===20?[48,12]:[20+Math.sin(i)*1.5,-30+Math.cos(i)*1.5];
    assert.deepEqual(gate.update(raw,i*.07,3),[20,-30]);
  }
});
test('a coherent diagonal gesture unlocks, moves, settles, then unlocks again',()=>{
  const gate=createMotionIntent();
  gate.update([0,0],0,3);
  assert.deepEqual(gate.update([8,-8],.07,3),[0,0]);
  assert.deepEqual(gate.update([16,-16],.14,3),[8,-8]);
  for(let i=3;i<8;i++)gate.update([24,-24],i*.07,3);
  const held=gate.update([24,-24],.56,3);
  for(let i=9;i<20;i++)assert.deepEqual(gate.update([24+Math.sin(i),-24],i*.07,3),held);
  gate.update([14,-14],1.4,3);
  const moved=gate.update([4,-4],1.47,3);
  assert(moved[0]<held[0]&&moved[1]>held[1]);
});
test('small cumulative displacement can unlock without one large frame',()=>{
  const gate=createMotionIntent();gate.update([0],0,3);
  let result=[0];
  for(let i=1;i<=16;i++)result=gate.update([i*.5],i*.07,3);
  assert(result[0]>5);
});
test('independent arms hold through noisy torso and opposite-arm motion',()=>{
  const stabilizer=createPerformanceStabilizer();
  const sample=(i:number):PerformanceKey=>({time:i*.07,
    pose:{leftShoulder:-60+Math.sin(i)*2,rightShoulder:i<12?20+i*4:68},
    armTargets:{left:{x:-20+Math.sin(i)*1.2,y:-32+Math.cos(i)*1.2},right:{x:15,y:i<12?25-i*4:-19}}
  });
  const first=stabilizer.update(sample(0));
  let final=first;
  for(let i=1;i<35;i++){
    final=stabilizer.update(sample(i));
    assert.deepEqual(final.armTargets?.left,first.armTargets?.left);
  }
  assert((final.armTargets?.right?.y??25)<-16);
});
test('intent gate resets cleanly for another camera session and raw mode bypasses it',()=>{
  const gate=createMotionIntent();gate.update([20],0,4);
  assert.deepEqual(gate.update([40],.07,0),[40]);
  gate.reset();assert.deepEqual(gate.update([-25],0,4),[-25]);
});
test('stationary recording compresses to a stable held pose on the timeline',()=>{
  const stabilizer=createPerformanceStabilizer();
  const observations=Array.from({length:60},(_,i)=>({elapsed:i*.07,
    sample:stabilizer.update({time:i*.07,pose:{leftShoulder:45+Math.sin(i)*1.5},
      armTargets:{left:{x:20+Math.sin(i),y:-30+Math.cos(i)}}})}));
  const take=compileResolvedPerformance(observations,59*.07);
  assert(take.keys.length<=3);
  assert.deepEqual(samplePerformance(take.keys,.5).armTargets?.left,observations[0].sample.armTargets?.left);
});

test('offline cleanup removes an isolated pose spike without mutating the source or filling gaps',()=>{
  const make=(elapsed:number,x:number)=>({elapsed,sample:{time:elapsed,pose:{leftShoulder:x},armTargets:{left:{x,y:-20}}}});
  const raw=[make(0,0),make(.07,40),make(.14,0)];
  const cleaned=cleanResolvedObservations(raw);
  assert.equal(cleaned[1].sample?.pose.leftShoulder,0);
  assert.equal(cleaned[1].sample?.armTargets?.left?.x,0);
  assert.equal(raw[1].sample.pose.leftShoulder,40);
  const gap=[raw[0],{elapsed:.07},raw[2]];
  assert.equal(cleanResolvedObservations(gap)[1].sample,undefined);
});
