import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { retargetCaptureFrame, compilePerformance, type Landmark, type CaptureFrame } from '../src/engine/performanceCapture.ts';
import { rig } from '../src/engine/animation.ts';
import { smoothLivePerformance,livePerformanceScene,LIVE_PREVIEW_TIME } from '../src/engine/livePerformanceScene.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { ProjectDocument } from '../src/engine/schema.ts';

const point=(x:number,y:number,visibility=1):Landmark=>({x,y,visibility});
function observed(t=1):CaptureFrame {
  const p=Array.from({length:33},()=>point(0,0,0));
  p[0]=point(.5,.25);p[2]=point(.58,.31);p[5]=point(.42,.31);
  p[11]=point(.64,.46);p[12]=point(.36,.46);
  p[13]=point(.68,.62);p[14]=point(.32,.62);
  p[15]=point(.7,.78);p[16]=point(.3,.78);
  return {t,pose:p};
}
test('raised webcam arms map to the correct mirrored cartoon side',()=>{
  const raw=observed();
  raw.pose[13]=point(.72,.29);raw.pose[15]=point(.75,.15);
  raw.pose[14]=point(.28,.29);raw.pose[16]=point(.25,.15);
  const captured=retargetCaptureFrame(raw);
  assert(captured);
  assert((captured.pose.leftShoulder??0)<-90,'performer left must raise cartoon left');
  assert((captured.pose.rightShoulder??0)>90,'performer right must raise cartoon right');
  const character=makeProject(true).characters[0];
  const drawing=rig(character,captured.pose,1);
  assert(drawing.left.hand.y<drawing.left.shoulder.y,'cartoon left hand stays raised');
  assert(drawing.right.hand.y<drawing.right.shoulder.y,'cartoon right hand stays raised');
  assert(drawing.left.hand.x<drawing.right.hand.x,'left and right wrists stay on the right sides');
});
test('two visible eyes produce head roll and direction when nose alone would not',()=>{
  const neutral=retargetCaptureFrame(observed())!;
  const tilted=observed(2);
  tilted.pose[2]=point(.58,.36);tilted.pose[5]=point(.42,.26);
  const roll=retargetCaptureFrame(tilted)!;
  assert(Math.abs((roll.pose.head??0)-(neutral.pose.head??0))>12);
  assert(roll.focus);
  const averted=observed(3);
  averted.pose[0]=point(.54,.25);
  const facing=retargetCaptureFrame(averted)!;
  assert(Math.abs(facing.focus?.x??0)>.2);
  // Horizontal facing is a head-art yaw channel, not a sideways neck roll.
  assert.equal(facing.pose.neck,0);
  assert.equal(facing.headFacing,'left');
  assert((facing.headYaw??0)>.3);
});
test('face-only partial frame retains eyes and expression but never invents limbs',()=>{
  const frame=observed();
  for(const i of [11,12,13,14,15,16])frame.pose[i].visibility=0;
  frame.face={browInnerUp:.6,mouthSmileLeft:.8,eyeBlinkRight:.7};
  const key=retargetCaptureFrame(frame);
  assert(key?.facial);
  assert.equal(key.pose.leftShoulder,undefined);
  assert.equal(key.pose.rightShoulder,undefined);
  assert.equal(key.pose.leftHip,undefined);
  assert.equal(key.pose.rightKnee,undefined);
  assert(key.focus);
});
test('missing right elbow, wrists and hips do not invalidate visible left arm',()=>{
  const frame=observed();
  for(const i of [14,16,23,24,25,26,27,28])frame.pose[i].visibility=0;
  const key=retargetCaptureFrame(frame)!;
  assert(key.pose.leftShoulder!==undefined);
  assert.equal(key.pose.rightShoulder,undefined);
  assert.equal(key.pose.leftHip,undefined);
  assert.equal(key.pose.rightHip,undefined);
  const normalized=compilePerformance([frame,{...frame,t:1.2}]);
  assert(normalized.keys.length>=2);
});
test('fast live hand movement responds immediately but remains bounded',()=>{
  const prev={time:1,pose:{leftShoulder:8,rightShoulder:8,head:0}};
  const next={time:1.08,pose:{leftShoulder:-130,rightShoulder:130,head:23}};
  const preview=smoothLivePerformance(prev,next,.25);
  assert((preview.pose.leftShoulder??0)<-105);
  assert((preview.pose.rightShoulder??0)>105);
  assert((preview.pose.head??0)>16);
});
test('a visible hand alone updates its finger pose without making up shoulder motion',()=>{
  const pose=Array.from({length:33},()=>point(0,0,0));
  const hand=Array.from({length:21},(_,index)=>point(.7+(index%5)*.012,.43-index*.012));
  hand[0]=point(.7,.62);
  const key=retargetCaptureFrame({t:1,pose,leftHand:hand});
  assert(key,'a tracked hand can supply a finger gesture without body tracking');
  assert(key.hands);
  assert.equal(key.pose.leftShoulder,undefined);
  assert.equal(key.pose.rightElbow,undefined);
  assert.equal(key.pose.leftHip,undefined);
});
test('eye glances between two identical poses survive loss-bounded recording compression',async()=>{
  const {reducePerformanceKeys}=await import('../src/engine/performanceCapture.ts');
  const keys=[
    {time:0,pose:{head:0},focus:{x:0,y:0}},
    {time:.5,pose:{head:0},focus:{x:.8,y:-.3}},
    {time:1,pose:{head:0},focus:{x:0,y:0}}
  ];
  const reduced=reducePerformanceKeys(keys);
  assert.equal(reduced.length,3);
});
test('captured gaze remains deterministic through timeline encoding and preview',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const key=retargetCaptureFrame(observed())!;
  key.focus={x:-.72,y:.18};
  const preview=livePerformanceScene(scene,actor.id,key);
  const persisted=ProjectDocument.parse({...project,scenes:[preview]});
  const state=evaluate(persisted.scenes[0],LIVE_PREVIEW_TIME,
    new Map(project.characters.map(c=>[c.id,c]))).actors[0];
  assert.deepEqual(state.focus,key.focus);
  assert(state.capturedArms?.left);
  assert(state.capturedArms?.right);
  assert.equal(preview.actors[0].view,'front');
  assert(preview.actors[0].scale>=1.7);
});
