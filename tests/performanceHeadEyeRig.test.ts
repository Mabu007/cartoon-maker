import assert from 'node:assert/strict';
import test from 'node:test';
import { connectedCapturedArmOrder,solveCapturedArm } from '../src/engine/performanceArmIntelligence.ts';
import { constrainCapturedHead,headRoll,observedIrisFocus } from '../src/engine/performanceHeadEye.ts';
import { createPerformanceStabilizer } from '../src/engine/performanceStabilizer.ts';
import { retargetCaptureFrame, samplePerformance,type Landmark,type PerformanceKey } from '../src/engine/performanceCapture.ts';
import { makeProject } from '../src/engine/presets.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { ProjectDocument,type Clip } from '../src/engine/schema.ts';

const point=(x:number,y:number,visibility=1):Landmark=>({x,y,visibility});
const close=(a:number,b:number)=>Math.abs(a-b)<1e-7;
function irisMesh(leftX:number,rightX:number,dy=0):Landmark[]{
  const mesh=Array.from({length:478},()=>point(0,0));
  mesh[33]=point(.40,.3);mesh[133]=point(.46,.3);
  mesh[159]=point(.43,.282);mesh[145]=point(.43,.32);
  mesh[362]=point(.54,.3);mesh[263]=point(.60,.3);
  mesh[386]=point(.57,.282);mesh[374]=point(.57,.32);
  mesh[468]=point(leftX,.301+dy);mesh[473]=point(rightX,.301+dy);
  return mesh;
}
function seatedPose():Landmark[]{
  const p=Array.from({length:33},()=>point(0,0,0));
  p[0]=point(.5,.2);p[2]=point(.58,.24);p[5]=point(.42,.24);
  p[11]=point(.64,.42);p[12]=point(.36,.42);
  p[13]=point(.72,.50);p[14]=point(.28,.52);
  p[15]=point(.77,.27);p[16]=point(.23,.34);
  return p;
}
test('captured arms paint as one uninterrupted shoulder-elbow-wrist-hand chain',()=>{
  for(const near of ['left','right'] as const){
    const order=connectedCapturedArmOrder({left:true,right:true},near);
    assert.deepEqual(order,near==='left'?['right','left']:['left','right']);
    assert.equal(new Set(order).size,2);
    assert.equal(order.at(-1),near,'nearest whole arm renders last');
  }
  assert.deepEqual(connectedCapturedArmOrder({left:true,right:false},'right'),['left']);
  assert.deepEqual(connectedCapturedArmOrder({left:false,right:false},'right'),[]);
  const shoulder={x:-18,y:-150};
  const solved=solveCapturedArm(shoulder,{x:22,y:-35},1,-1);
  // Endpoint continuity: one exact shared elbow between upper and lower bones.
  assert(close(Math.hypot(solved.elbow.x-shoulder.x,solved.elbow.y-shoulder.y),28));
  assert(close(Math.hypot(solved.hand.x-solved.elbow.x,solved.hand.y-solved.elbow.y),28));
});
test('one captured head cannot exceed the combined neck/torso/head roll envelope',()=>{
  for(const pose of [
    {torso:28,neck:14,head:34},
    {torso:-28,neck:-14,head:-34},
    {torso:10,neck:-10,head:28},
    {torso:0,neck:0,head:0},
    {torso:20,neck:-12,head:-34}
  ]){
    const bounded=constrainCapturedHead(pose);
    assert(Math.abs(headRoll(bounded))<=23.00001);
    assert(Math.abs(bounded.torso??0)<=18);
    assert(Math.abs(bounded.neck??0)<=8);
    assert(Math.abs(bounded.head??0)<=18);
  }
  const authored={rightShoulder:91,rightElbow:-20};
  assert.equal(constrainCapturedHead(authored),authored,
    'ordinary non-facial action poses are untouched');
});
test('head stabilization rejects one-frame spikes without delaying a deliberate nod',()=>{
  const filter=createPerformanceStabilizer();
  const at=(time:number,head:number):PerformanceKey=>({
    time,pose:{torso:0,neck:0,head}
  });
  filter.update(at(0,0));
  const flicker=filter.update(at(.033,150));
  assert(Math.abs(headRoll(flicker.pose))<=23);
  assert(Math.abs(flicker.pose.head??0)<5,
    'a 33ms frame should not throw the face across its whole range');
  let nod=flicker;
  for(let i=2;i<=16;i++)nod=filter.update(at(i*.033,18));
  assert((nod.pose.head??0)>9,'intentional sustained head tilt remains expressive');
  assert(Math.abs(headRoll(nod.pose))<=23);
});
test('two 478-point face irises drive independent eyeball gaze with the head still',()=>{
  const center=observedIrisFocus(irisMesh(.43,.57));
  assert(center);assert(Math.abs(center.x)<.08);
  const glance=observedIrisFocus(irisMesh(.451,.591));
  assert(glance && glance.x<-.45);
  const opposite=observedIrisFocus(irisMesh(.410,.55));
  assert(opposite && opposite.x>.45);
  const upwards=observedIrisFocus(irisMesh(.43,.57,-.008));
  assert(upwards && upwards.y<-.3);
  assert.equal(observedIrisFocus(irisMesh(.43,.57).slice(0,468)),undefined);
  // Turning or tilting the skull should not be mistaken for pupil motion.
  const tilted=irisMesh(.451,.591);
  const radians=32*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  for(const landmark of tilted){
    const dx=landmark.x-.5,dy=landmark.y-.3;
    landmark.x=.5+dx*cos-dy*sin;
    landmark.y=.3+dx*sin+dy*cos;
  }
  const tiltFocus=observedIrisFocus(tilted);
  assert(tiltFocus&&Math.abs(tiltFocus.x-glance.x)<.12,
    'eye-relative iris gaze must remain stable under a rotated face');
  const missingEye=irisMesh(.43,.592);
  missingEye[145]=point(.43,.282);
  assert(observedIrisFocus(missingEye),
    'a valid eye remains usable when the opposite eye is occluded');
});
test('iris direction beats inferred nose-based gaze in a seated acting take',()=>{
  const raw=retargetCaptureFrame({
    t:1,pose:seatedPose(),
    eyeFocus:{x:-.8,y:-.45},
    face:{eyeLookOutRight:.75,eyeLookDownLeft:.35}
  });
  assert(raw);
  assert.deepEqual(raw.focus,{x:-.8,y:-.45});
  assert(Math.abs(headRoll(raw.pose))<=23);
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const keys=[{...raw,time:0},{...raw,time:1}];
  const clip:Extract<Clip,{track:'performance'}>={
    id:'head-eye-take',track:'performance',actor:actor.id,
    start:0,length:2,performance:keys
  };
  const stored=ProjectDocument.parse({
    ...project,scenes:[{...scene,clips:[clip]},...project.scenes.slice(1)]
  });
  const current=evaluate(stored.scenes[0],1,
    new Map(stored.characters.map(c=>[c.id,c]))).actors[0];
  assert.deepEqual(current.capturedFocus,{x:-.8,y:-.45});
  assert(Math.abs(headRoll(current.pose))<=23);
  assert.deepEqual(samplePerformance(keys,.5).focus,raw.focus);
});
