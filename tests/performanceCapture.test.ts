import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compilePerformance, retargetCaptureFrame, samplePerformance, findStrike, actingDNA, makeRecoilKeys,
  type CaptureFrame, type PerformanceKey } from '../src/engine/performanceCapture.ts';
import { segmentedPerformance, splitTimelineClips, trimTimelineClip } from '../src/engine/timelineEditing.ts';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument, type Clip } from '../src/engine/schema.ts';

function frame(t:number,shift=0):CaptureFrame {
  const pose=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
  for(const [i,x,y] of [
    [0,.5,.3],[11,.4,.41],[12,.6,.41],[13,.38,.54],[14,.62+shift,.54],
    [15,.37,.66],[16,.64+shift,.66],[23,.45,.7],[24,.55,.7],
    [25,.45,.84],[26,.56,.84],[27,.45,.98],[28,.56,.98]
  ])pose[i]={x,y,visibility:1};
  return {t,pose};
}
test('capture compiles into bounded monotonic editable keys',()=>{
  const frames=Array.from({length:61},(_,i)=>frame(i/12,Math.sin(i/7)*.1));
  const a=compilePerformance(frames,{exaggeration:1.3,smoothing:.5,maxKeys:25});
  const b=compilePerformance(frames,{exaggeration:1.3,smoothing:.5,maxKeys:25});
  assert.deepEqual(a,b);
  assert.equal(a.keys[0].time,0);
  assert.equal(a.keys.at(-1)?.time,1);
  assert.ok(a.keys.length<=25);
  assert.ok(a.keys.every((k,i)=>i===0||k.time>a.keys[i-1].time));
  assert.ok(a.keys.every(k=>Object.values(k.pose).every(v=>Number.isFinite(v)&&Math.abs(v)<=165)));
  assert.ok(Number.isFinite(samplePerformance(a.keys,.5).pose.rightShoulder));
});
test('unreliable body tracking is not converted into a fabricated pose',()=>{
  const missing=frame(0);missing.pose[12].visibility=.2;
  assert.equal(retargetCaptureFrame(missing),undefined);
  assert.throws(()=>compilePerformance([missing,missing]),/Capture at least two/);
});
test('captured clips survive schema validation and editing',()=>{
  const project=makeProject(false);
  const scene=project.scenes[0];
  const actor=scene.actors[0];
  assert.ok(actor);
  const compiled=compilePerformance(Array.from({length:18},(_,i)=>frame(i/12,i*.003)));
  const motion:Extract<Clip,{track:'body'}>={
    id:'performance-test',track:'body',actor:actor.id,action:'idle',layer:'gesture',
    start:0,length:compiled.duration,performanceOrigin:'mocap',performance:compiled.keys
  };
  const next={...project,scenes:[{...scene,clips:[...scene.clips,motion]},...project.scenes.slice(1)]};
  assert.equal(ProjectDocument.safeParse(next).success,true);
  const split=splitTimelineClips(next.scenes[0],['performance-test'],motion.length/2);
  const left=split.scene.clips.find(c=>c.id===motion.id);
  const right=split.scene.clips.find(c=>c.id===split.added[0]);
  assert.equal(left?.track,'body');assert.equal(right?.track,'body');
  if(left?.track==='body'&&right?.track==='body'){
    assert.equal(left.performance?.[0]?.time,0);
    assert.equal(left.performance?.at(-1)?.time,1);
    assert.deepEqual(left.performance?.at(-1)?.pose,right.performance?.[0]?.pose);
  }
  const trimmed=trimTimelineClip(next.scenes[0],motion.id,'out',motion.length*.8);
  const edited=trimmed.clips.find(c=>c.id===motion.id);
  assert.equal(edited?.track,'body');
  if(edited?.track==='body')assert.equal(edited.performance?.at(-1)?.time,1);
});
test('recoil is an editable deterministic five-pose animation',()=>{
  const keys=makeRecoilKeys();
  assert.equal(keys.length,5);
  assert.equal(keys[0].time,0);assert.equal(keys.at(-1)?.time,1);
  assert.equal(samplePerformance(keys,.3).expression,'surprised');
});
test('strike suggestions require a fist and quick extension',()=>{
  const keys:PerformanceKey[]=[
    {time:0,pose:{rightElbow:95},hands:{left:'relaxed',right:'fist'}},
    {time:.09,pose:{rightElbow:67},hands:{left:'relaxed',right:'fist'}},
    {time:.18,pose:{rightElbow:8},hands:{left:'relaxed',right:'fist'}}
  ];
  assert.equal(findStrike(keys),.18);
  const dna=actingDNA(keys);
  assert.equal(dna.dominantHand,'right');
  assert.ok(dna.energy>=0&&dna.energy<=100);
});
test('invalid performance keys are rejected rather than silently clamped',()=>{
  const project=makeProject(false),scene=project.scenes[0];
  const wrong={
    id:'wrong-performance',track:'body',actor:scene.actors[0].id,action:'idle',layer:'gesture',start:0,length:1,
    performance:[{time:.8,pose:{leftWrist:9999}},{time:.4,pose:{rightShoulder:30}}]
  };
  const parsed=ProjectDocument.safeParse({...project,scenes:[{...scene,clips:[...scene.clips,wrong]},...project.scenes.slice(1)]});
  assert.equal(parsed.success,false);
});
