import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observedArmGuidance,solveCapturedArm,decideFrontArm,
  observedArmPaintOrder
} from '../src/engine/performanceArmIntelligence.ts';
import { createPerformanceStabilizer,oneEuroStep } from '../src/engine/performanceStabilizer.ts';
import { associateObservedHands } from '../src/services/handAssociation.ts';
import { retargetCaptureFrame, samplePerformance, reducePerformanceKeys } from '../src/engine/performanceCapture.ts';
import { makeProject } from '../src/engine/presets.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import type { Landmark,PerformanceKey } from '../src/engine/performanceCapture.ts';

const p=(x:number,y:number,visibility=1,z=0):Landmark=>({x,y,visibility,z});
function seatedArms(){
  const a=Array.from({length:33},()=>p(0,0,0));
  a[0]=p(.5,.17);a[2]=p(.57,.22);a[5]=p(.43,.22);
  a[11]=p(.67,.48);a[12]=p(.33,.48);
  a[13]=p(.58,.42);a[14]=p(.43,.53);
  a[15]=p(.44,.27,1,-.22);a[16]=p(.49,.35,1,-.04);
  // No hips, knees or feet: the user's webcam is framed from the desk up.
  return a;
}
const length=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
test('seated crossed-arm measurement preserves anatomical target, elbow pole and depth',()=>{
  const pose=seatedArms();
  const evidence=observedArmGuidance(pose);
  assert(evidence.targets.left&&evidence.targets.right);
  assert(Number.isFinite(evidence.targets.left.x));
  assert(evidence.depths.left!==undefined&&evidence.depths.right!==undefined);
  assert(evidence.depths.left>evidence.depths.right,'nearer upper wrist wins when Z is observed');
  const key=retargetCaptureFrame({t:1,pose});
  assert(key?.armTargets?.left&&key.armTargets.right);
  assert.equal(key.pose.leftHip,undefined,'no fabricated legs');
  assert.equal(key.pose.rightKnee,undefined);
  assert.equal(key.armDepth?.left,evidence.depths.left);
});
test('two-bone elbow IK maintains both bone lengths and limits collapse/extension',()=>{
  const shoulder={x:-25,y:-160};
  for(const target of [
    {x:21,y:-12},{x:2,y:-2},{x:0,y:-99},{x:-70,y:-9}
  ]){
    for(const pole of [-1,1]){
      const solved=solveCapturedArm(shoulder,target,1,pole);
      assert(Number.isFinite(solved.elbow.x)&&Number.isFinite(solved.hand.x));
      assert(Math.abs(length(shoulder,solved.elbow)-28)<1e-8);
      assert(Math.abs(length(solved.elbow,solved.hand)-28)<1e-8);
      assert(solved.reach>=8&&solved.reach<56);
    }
  }
  const a=solveCapturedArm(shoulder,{x:35,y:-15},1,1);
  const b=solveCapturedArm(shoulder,{x:35,y:-15},1,-1);
  assert(length(a.elbow,b.elbow)>5,'pole preference genuinely changes elbow bend');
});
test('near-arm drawing order paints each forearm and hand after the chest with no duplicates',()=>{
  const left=observedArmPaintOrder({left:true,right:true},'left');
  assert.deepEqual(left.map(p=>p.side+':'+p.part),[
    'right:upper','left:upper','right:lower','right:hand','left:lower','left:hand'
  ]);
  const right=observedArmPaintOrder({left:true,right:true},'right');
  assert.equal(right.at(-1)?.side,'right');
  assert.deepEqual(observedArmPaintOrder({left:true,right:false},'right').map(p=>p.part),
    ['upper','lower','hand']);
  assert.equal(decideFrontArm({left:.8,right:.15},'right'),'left');
  assert.equal(decideFrontArm({left:.42,right:.36},'right'),'right',
    'ambiguous depth retains the established near hand');
});
test('One Euro filter damps near-still wobble but responds rapidly to a strong gesture',()=>{
  let last=oneEuroStep(undefined,0,0);
  for(let i=1;i<=8;i++)last=oneEuroStep(last,i%2?1.4:-1.4,i*.05,2.2,.08);
  assert(Math.abs(last.value)<1.4,'small random-looking motion is suppressed');
  const extended=oneEuroStep(last,115,.46,2.2,.08);
  assert(extended.value>65,'fast arm raise stays responsive');
  const reset=oneEuroStep(extended,-45,2,2.2,.08);
  assert.equal(reset.value,-45,'long tracking loss resets rather than drags stale motion');
});
test('stabilizer retains anatomical front hand and elbow through a single-frame crossing',()=>{
  const filter=createPerformanceStabilizer();
  const key=(time:number,left:number,right:number):PerformanceKey=>({
    time,pose:{leftShoulder:-50,leftElbow:44,rightShoulder:50,rightElbow:-48},
    armTargets:{left:{x:20,y:-20},right:{x:-24,y:-24}},
    armDepth:{left,right},armBend:{left:-1,right:1}
  });
  assert.equal(filter.update(key(0,.8,.1)).nearArm,'left');
  assert.equal(filter.update(key(.07,.04,.95)).nearArm,'left');
  assert.equal(filter.update(key(.14,.04,.95)).nearArm,'left');
  assert.equal(filter.update(key(.21,.04,.95)).nearArm,'left');
  assert.equal(filter.update(key(.28,.04,.95)).nearArm,'right',
    'sustained depth change eventually reorders hands');
  assert.equal(filter.update(key(.35,.80,.10)).nearArm,'right',
    'a momentary depth inversion cannot cause order flicker');
});
test('captured contact is deliberate, does not flicker, and releases after loss',()=>{
  const filter=createPerformanceStabilizer();
  const key=(time:number,contact?:PerformanceKey['contact']):PerformanceKey=>({
    time,pose:{leftShoulder:-50,rightShoulder:50},contact
  });
  assert.equal(filter.update(key(0,'prayer')).contact,undefined);
  assert.equal(filter.update(key(.07,'prayer')).contact,'prayer');
  assert.equal(filter.update(key(.14)).contact,'prayer','brief loss holds stable contact');
  assert.equal(filter.update(key(.30)).contact,undefined,'contact cannot persist indefinitely');
});
test('hand-only dropout keeps the last curl briefly with fading confidence, not forever',()=>{
  const filter=createPerformanceStabilizer();
  const k=(time:number,hasHand:boolean,quality=1):PerformanceKey=>({
    time,pose:{head:0},
    ...(hasHand?{fingerCurls:{left:[.8,0,1,1,1] as [number,number,number,number,number]},
      handConfidence:{left:quality}}:{})
  });
  const live=filter.update(k(0,true));
  assert.equal(live.handConfidence?.left,1);
  const missed=filter.update(k(.08,false));
  assert(missed.handConfidence?.left!==undefined&&missed.handConfidence.left<1);
  assert(missed.fingerCurls?.left);
  const gone=filter.update(k(.23,false));
  assert.equal(gone.fingerCurls?.left,undefined);
  assert.equal(gone.handConfidence?.left,undefined);
});
test('crossed-wrist hand identity stays on anatomical side and never invents opposite hand',()=>{
  const pose=seatedArms();
  const makeHand=(x:number,y:number)=>Array.from({length:21},()=>p(x,y));
  const left=makeHand(.44,.27),right=makeHand(.49,.35);
  const first=associateObservedHands([right,left],pose);
  assert.equal(first.left,left);
  assert.equal(first.right,right);
  // Wrist landmarks approach one another; previous palm positions
  // preserve the assignment through that brief ambiguous crossing.
  pose[15]=p(.47,.31);pose[16]=p(.47,.31);
  const next=associateObservedHands([left,right],pose,first);
  assert.equal(next.left,left);
  assert.equal(next.right,right);
  const one=associateObservedHands([right],pose,first);
  assert(Boolean(one.right)&&!one.left);
  const empty=associateObservedHands([],pose,first);
  assert.equal(empty.left,undefined);assert.equal(empty.right,undefined);
});
test('new arm metadata round trips through performance keys and releases at scene dropout',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const observed=retargetCaptureFrame({t:1,pose:seatedArms()})!;
  const first={...observed,time:0,nearArm:'left' as const,armBend:{left:-1,right:1}};
  const gap={time:.5,pose:{},presence:0};
  const last={...observed,time:1,nearArm:'right' as const};
  const clip={id:'arms-crossing',track:'performance' as const,actor:actor.id,
    start:0,length:2,performance:[first,gap,last]};
  const document=ProjectDocument.parse({...project,
    scenes:[{...scene,clips:[clip]},...project.scenes.slice(1)]});
  // JSON intentionally canonicalizes -0 to 0. Compare the revalidated
  // project with the actual serialized on-disk form, not its pre-JSON source.
  const onDisk=JSON.parse(JSON.stringify(document));
  const serialized=ProjectDocument.parse(onDisk);
  assert.deepEqual(serialized.scenes[0].clips[0],onDisk.scenes[0].clips[0]);
  const frame=evaluate(serialized.scenes[0],.2,new Map(project.characters.map(c=>[c.id,c]))).actors[0];
  assert(frame.capturedRig?.targets.left);
  assert.equal(frame.capturedRig?.near,'left');
  const lost=evaluate(serialized.scenes[0],1,new Map(project.characters.map(c=>[c.id,c]))).actors[0];
  assert.equal(lost.capturedRig,undefined);
  const savedKeys=[first,{...first,time:.25,nearArm:'left' as const},gap,last];
  const kept=reducePerformanceKeys(savedKeys,1.5);
  assert(kept.some(k=>k.presence===0),'compression never bridges unobserved crossing');
  assert.equal(samplePerformance([first,gap,last],.5).presence,0);
});
