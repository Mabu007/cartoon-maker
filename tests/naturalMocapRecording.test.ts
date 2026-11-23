import assert from 'node:assert/strict';
import test from 'node:test';
import { solveAnatomicalArm,solveCapturedArm } from '../src/engine/performanceArmIntelligence.ts';
import { estimateHeadYaw,headFacingForYaw } from '../src/engine/performanceHeadEye.ts';
import { createPerformanceStabilizer } from '../src/engine/performanceStabilizer.ts';
import { compileResolvedPerformance } from '../src/engine/resolvedPerformance.ts';
import { finishOptionalAudio,recordingQuality } from '../src/services/performanceRecording.ts';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import type { PerformanceKey } from '../src/engine/performanceCapture.ts';
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
test('captured elbows prefer anatomically outward solutions even with a flipped noisy pole',()=>{
  for(const side of ['left','right'] as const){
    const sign=side==='left'?-1:1;
    const shoulder={x:sign*24,y:-162};
    for(const goal of [
      {x:sign*33,y:10},{x:-sign*30,y:-27},
      {x:sign*5,y:-52},{x:-sign*45,y:-12}
    ]){
      const a=solveAnatomicalArm(shoulder,goal,1,side,1);
      const b=solveAnatomicalArm(shoulder,goal,1,side,-1);
      for(const candidate of [a,b]){
        assert(Math.abs(dist(shoulder,candidate.elbow)-28)<.00001);
        assert(Math.abs(dist(candidate.elbow,candidate.hand)-28)<.00001);
        assert(candidate.reach>8&&candidate.reach<56);
        const inward=Math.max(0,-sign*(candidate.elbow.x-shoulder.x));
        const alternatives=[
          solveCapturedArm(shoulder,goal,1,-1),
          solveCapturedArm(shoulder,goal,1,1)
        ];
        // Whenever an outward anatomical candidate exists, never choose a
        // deeply inward elbow just because MediaPipe's pole changed sign.
        if(alternatives.some(elbow=>sign*(elbow.elbow.x-shoulder.x)>12))
          assert(inward<19,'elbow must not fold into the character torso');
      }
    }
  }
});
test('head tracks front, slight left and slight right with separate hysteresis',()=>{
  const eyeA={x:.58,y:.25},eyeB={x:.42,y:.25};
  assert.equal(headFacingForYaw(0),'front');
  assert.equal(headFacingForYaw(.8),'left');
  assert.equal(headFacingForYaw(-.8),'right');
  assert.equal(headFacingForYaw(.15,'left'),'left');
  assert.equal(headFacingForYaw(-.15,'right'),'right');
  assert.equal(headFacingForYaw(0,'left'),'front');
  assert((estimateHeadYaw({x:.47,y:.28},eyeA,eyeB)??0)>.3);
  assert((estimateHeadYaw({x:.53,y:.28},eyeA,eyeB)??0)<-.3);
});
test('head pose takes multiple observed frames to change and ignores one-frame flips',()=>{
  const filter=createPerformanceStabilizer();
  const key=(time:number,yaw:number):PerformanceKey=>({
    time,pose:{head:0,torso:0,neck:0},headYaw:yaw
  });
  assert.equal(filter.update(key(0,.75)).headFacing,'front');
  assert.equal(filter.update(key(.075,.75)).headFacing,'front');
  assert.equal(filter.update(key(.15,.75)).headFacing,'left');
  assert.equal(filter.update(key(.225,-.8)).headFacing,'left');
  assert.equal(filter.update(key(.30,.75)).headFacing,'left');
});
test('individual missing arm joints hold briefly and gently relax, rather than snapping',()=>{
  const filter=createPerformanceStabilizer();
  const frame=(time:number,observed:boolean):PerformanceKey=>({
    time,pose:observed?{leftShoulder:-60,leftElbow:75,head:8}: {head:8},
    ...(observed?{armTargets:{left:{x:-35,y:-15}}}:{})
  });
  filter.update(frame(0,true));
  const brief=filter.update(frame(.1,false));
  assert.equal(brief.pose.leftShoulder,-60);
  assert(brief.armTargets?.left);
  assert((brief.armConfidence?.left??0)>.95);
  const fading=filter.update(frame(.31,false));
  assert((fading.pose.leftShoulder??-61)>-60);
  assert((fading.armConfidence?.left??1)<1);
  const gone=filter.update(frame(.7,false));
  assert.equal(gone.armTargets,undefined);
});
test('complete tracking dropout holds then fades; re-acquisition blends from last pose',()=>{
  const filter=createPerformanceStabilizer();
  const sample=(time:number,arm:number):PerformanceKey=>({
    time,pose:{leftShoulder:arm,torso:0,head:0}
  });
  filter.update(sample(0,70));
  const held=filter.recover(.11);assert(held);
  assert.equal(held.presence,1);
  const fading=filter.recover(.40);assert(fading);
  assert((fading.presence??0)>0&&(fading.presence??0)<1);
  assert.equal(filter.recover(.73),undefined);
  const reacquired=filter.update(sample(.45,-65));
  assert((reacquired.pose.leftShoulder??0)>-65,'return must not teleport to a newly detected wrist');
  const settled=filter.update(sample(.7,-65));
  assert(Math.abs((settled.pose.leftShoulder??0)+65)<15);
});
test('recorded confidence-faded frames remain faded after timeline compilation',()=>{
  const sample=(time:number,presence:number):PerformanceKey=>({
    time,pose:{leftShoulder:40},presence
  });
  const result=compileResolvedPerformance([
    {elapsed:0,sample:sample(0,1)},
    {elapsed:.25,sample:sample(.25,.65)},
    {elapsed:.5,sample:sample(.5,.15)},
    {elapsed:.75},
    {elapsed:1,sample:sample(1,1)}
  ],1);
  assert(result.keys.some(key=>(key.presence??1)<1&&(key.presence??0)>0));
  assert(result.keys.some(key=>key.presence===0));
  assert.equal(result.duration,1);
});
test('motion-only recording does not require a MediaRecorder or audio track',async()=>{
  assert.equal(await finishOptionalAudio(undefined,[]),undefined);
  assert.equal(recordingQuality(0,.1),'Record at least a moment of movement.');
  assert.equal(recordingQuality(0,1),'The camera could not see enough of your performance.');
  assert.equal(recordingQuality(10,1),undefined);
});
test('a broken microphone stop event cannot hang recording compilation',async()=>{
  const blocked=new EventTarget() as MediaRecorder;
  Object.defineProperty(blocked,'state',{value:'recording'});
  Object.defineProperty(blocked,'mimeType',{value:'audio/webm'});
  Object.defineProperty(blocked,'stop',{value:()=>undefined});
  const start=Date.now();
  const output=await finishOptionalAudio(blocked,[],110);
  assert.equal(output,undefined);
  assert(Date.now()-start<900);
});
test('saved head turns and arm confidence validate and replay in existing scene schema',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const clip={id:'recorded-natural-take',track:'performance' as const,
    actor:actor.id,start:0,length:2,facing:'front' as const,
    performance:[
      {time:0,pose:{leftShoulder:-25,head:3},headYaw:0,headFacing:'front' as const,
        armConfidence:{left:1},armTargets:{left:{x:-25,y:-20}}},
      {time:1,pose:{leftShoulder:-30,head:5},headYaw:.7,headFacing:'left' as const,
        armConfidence:{left:.4},armTargets:{left:{x:-30,y:-24}}}
    ]
  };
  const parsed=ProjectDocument.parse({...project,scenes:[
    {...scene,clips:[clip]},...project.scenes.slice(1)
  ]});
  const persisted=ProjectDocument.parse(JSON.parse(JSON.stringify(parsed)));
  const evaluated=evaluate(persisted.scenes[0],1,
    new Map(persisted.characters.map(c=>[c.id,c]))).actors[0];
  assert.equal(evaluated.capturedHeadFacing,'left');
  assert(evaluated.capturedRig?.confidence?.left!==undefined);
});
