import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compilePerformance, retargetCaptureFrame, samplePerformance, samplePerformanceHands, reducePerformanceKeys, findStrike, actingDNA, makeRecoilKeys,
  type CaptureFrame, type PerformanceKey } from '../src/engine/performanceCapture.ts';
import { segmentedPerformance, splitTimelineClips, trimTimelineClip } from '../src/engine/timelineEditing.ts';
import { worldBodyProjector, mixDegrees } from '../src/engine/worldRetarget.ts';
import { capturedMicroMotion } from '../src/engine/performanceMicroMotion.ts';
import { sampleLayeredHandRig } from '../src/engine/handRig.ts';
import { evaluate } from '../src/engine/evaluate.ts';
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
test('unreliable right shoulder remains unobserved while the valid left arm survives',()=>{
  const missing=frame(0);missing.pose[12].visibility=.2;
  const detected=retargetCaptureFrame(missing);
  assert(detected,'a missing shoulder must not discard visible joints');
  assert.equal(detected.pose.rightShoulder,undefined);
  assert.equal(detected.pose.rightElbow,undefined);
  assert(detected.pose.leftShoulder!==undefined);
  assert.throws(()=>compilePerformance([missing,missing]),/Capture at least two/);
});
test('seated webcam tracking accepts upper-body-only frames without fabricating legs',()=>{
  const upper=frame(1);
  for(const i of [23,24,25,26,27,28])upper.pose[i].visibility=0;
  const captured=retargetCaptureFrame(upper);
  assert(captured,'observed shoulders and arms should drive live puppeteering');
  assert(captured.pose.rightShoulder!==undefined);
  assert(captured.pose.rightElbow!==undefined);
  assert.equal(captured.pose.leftHip,undefined);
  assert.equal(captured.pose.rightKnee,undefined);
  const partial=frame(2);
  partial.pose[16].visibility=0;
  const pose=retargetCaptureFrame(partial);
  assert(pose,'one hand outside the webcam should not invalidate the whole body');
  assert.equal(pose.pose.rightElbow,undefined);
  assert(pose.pose.leftElbow!==undefined);
});
test('captured clips survive schema validation and editing',()=>{
  const project=makeProject(true);
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
  const project=makeProject(true),scene=project.scenes[0];
  const wrong={
    id:'wrong-performance',track:'body',actor:scene.actors[0].id,action:'idle',layer:'gesture',start:0,length:1,
    performance:[{time:.8,pose:{leftWrist:9999}},{time:.4,pose:{rightShoulder:30}}]
  };
  const parsed=ProjectDocument.safeParse({...project,scenes:[{...scene,clips:[...scene.clips,wrong]},...project.scenes.slice(1)]});
  assert.equal(parsed.success,false);
});

test('pose blender leads from shoulder through elbow to wrist without missing authored endpoints',()=>{
  const keys:PerformanceKey[]=[
    {time:0,pose:{rightShoulder:0,rightElbow:0,rightWrist:0}},
    {time:1,pose:{rightShoulder:80,rightElbow:80,rightWrist:80}}
  ];
  const halfway=samplePerformance(keys,.5).pose;
  assert.ok((halfway.rightShoulder??0)>(halfway.rightElbow??0));
  assert.ok((halfway.rightElbow??0)>(halfway.rightWrist??0));
  assert.equal(samplePerformance(keys,1).pose.rightWrist,80);
});


test('world-space upper-body rotation changes the mapped pose without touching 2D fallback',()=>{
  const plain=frame(0);
  const before=retargetCaptureFrame(plain)!;
  const world=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
  for(const [i,x,y,z] of [
    [0,0,-.47,-.04],[11,-.21,-.32,-.09],[12,.21,-.32,.09],
    [13,-.30,-.21,-.06],[14,.34,-.22,.18],
    [15,-.38,-.1,-.03],[16,.42,-.10,.3],
    [23,-.11,0,0],[24,.11,0,0],[25,-.11,.22,0],[26,.11,.22,0],
    [27,-.11,.46,0],[28,.11,.46,0]
  ])world[i]={x,y,z,visibility:1};
  const projector=worldBodyProjector(world);
  assert.ok(projector);
  assert.ok(projector!.frontness>.6);
  const observed=retargetCaptureFrame({...plain,world})!;
  assert.ok(Math.abs((observed.pose.rightShoulder??0)-(before.pose.rightShoulder??0))>.5);
  assert.deepEqual(retargetCaptureFrame({...plain,world:world.slice(0,10)}),before);
});
test('3D angular wrap and incomplete world data never yield a bad pose',()=>{
  assert.ok(Math.abs(mixDegrees(179,-179,.5)-180)<.01);
  const points=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
  assert.equal(worldBodyProjector(points),undefined);
  const key=retargetCaptureFrame(frame(0))!;
  assert.ok(Object.values(key.pose).every(value=>Number.isFinite(value)));
});
test('natural captured micro-acting is deterministic, sub-degree and never changes authored hands or legs',()=>{
  const character=makeProject(true).characters[0];
  const base={leftElbow:25,rightElbow:-29,leftKnee:71,rightHip:-40};
  const act={time:6.4,speaking:true,listening:false,intensity:1};
  const first=capturedMicroMotion(character,base,act);
  assert.deepEqual(first,capturedMicroMotion(character,base,act));
  assert.equal(first.leftElbow,25);
  assert.equal(first.rightElbow,-29);
  assert.equal(first.leftKnee,71);
  assert.equal(first.rightHip,-40);
  assert.ok(Math.abs(first.head??0)<1.1);
  assert.ok(Math.abs(first.torso??0)<1.1);
  assert.deepEqual(capturedMicroMotion({...character,personality:{autoActing:'off'}},base,act),base);
});
test('recorded finger gestures blend continuously, preserving joints and anatomy',()=>{
  const a=sampleLayeredHandRig('relaxed',1,'open','fist',0,1);
  const middle=sampleLayeredHandRig('relaxed',1,'open','fist',.5,1);
  const b=sampleLayeredHandRig('relaxed',1,'open','fist',1,1);
  assert.ok(a.params.curl[1]<middle.params.curl[1]);
  assert.ok(middle.params.curl[1]<b.params.curl[1]);
  assert.ok(middle.fingers.flat().flat().every(Number.isFinite));
  const keys:PerformanceKey[]=[
    {time:0,pose:{},hands:{left:'open',right:'relaxed'}},
    {time:1,pose:{},hands:{left:'fist',right:'relaxed'}}
  ];
  const transition=samplePerformanceHands(keys,.5)!;
  assert.equal(transition.from.left,'open');
  assert.equal(transition.to.left,'fist');
  assert.ok(Math.abs(transition.progress-.5)<.001);
});
test('loss-bounded key reduction collapses static poses but retains expressive hand and head beats',()=>{
  const still:PerformanceKey[]=Array.from({length:121},(_,i)=>({
    time:i/120,pose:{head:4,torso:1,rightShoulder:6},
    hands:{left:'relaxed',right:'relaxed'}
  }));
  assert.equal(reducePerformanceKeys(still).length,2);
  const changing=still.map((key,i)=>({
    ...key,
    pose:{...key.pose,head:i>55&&i<77?13:key.pose.head},
    hands:i>70?{left:'point' as const,right:'relaxed' as const}:key.hands
  }));
  const compressed=reducePerformanceKeys(changing);
  assert.ok(compressed.length>2);
  assert.ok(compressed.length<changing.length);
  assert.equal(compressed.at(-1)?.time,1);
});
test('camera acting leaves authored action and dialogue visemes intact',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const characters=new Map(project.characters.map(character=>[character.id,character]));
  const before=evaluate(scene,2,characters).actors.find(a=>a.id===actor.id)!;
  const captured:Extract<Clip,{track:'body'}>={
    id:'capture-layer-test',track:'body',actor:actor.id,action:'idle',layer:'gesture',
    start:1,length:4,performanceOrigin:'mocap',
    performance:[
      {time:0,pose:{head:6,torso:6,rightShoulder:15},hands:{left:'relaxed',right:'open'}},
      {time:1,pose:{head:11,torso:2,rightShoulder:47},hands:{left:'open',right:'point'}}
    ]
  };
  const overlay={...scene,clips:[...scene.clips,captured]};
  const after=evaluate(overlay,2,characters).actors.find(a=>a.id===actor.id)!;
  assert.equal(after.action,before.action);
  assert.equal(after.locomotion,before.locomotion);
  assert.equal(after.x,before.x);
  assert.equal(after.y,before.y);
  assert.ok(after.handOverride);
  const originalDialogue=evaluate(scene,9,characters).actors.find(a=>a.id===actor.id)!;
  const captureDialogue=evaluate({...overlay,clips:[
    ...scene.clips,{...captured,id:'voice-capture',start:8,length:3}
  ]},9,characters).actors.find(a=>a.id===actor.id)!;
  assert.deepEqual(captureDialogue.viseme,originalDialogue.viseme);
});
