import assert from 'node:assert/strict';
import test from 'node:test';
import {startPerformanceTracker} from '../src/services/performanceTracker.ts';
import {associateObservedHands} from '../src/services/handAssociation.ts';
import {measuredFingerCurls,observedHandPose} from '../src/engine/performanceHandIntelligence.ts';
import {retargetCaptureFrame,type Landmark,type PerformanceKey} from '../src/engine/performanceCapture.ts';
import {createPerformanceStabilizer} from '../src/engine/performanceStabilizer.ts';
import {applyCapturedFingerCurls,sampleHandRig} from '../src/engine/handRig.ts';
import {makeProject} from '../src/engine/presets.ts';
import {evaluate} from '../src/engine/evaluate.ts';
import type {Clip} from '../src/engine/schema.ts';

function peaceHand():Landmark[]{
  const point=(x:number,y:number,z=0):Landmark=>({x,y,z,visibility:0});
  const hand=Array.from({length:21},()=>point(.65,.65));
  hand[0]=point(.65,.65);
  for(const [digit,base,middle,tip] of [[0,2,3,4],[1,5,6,8],[2,9,10,12],[3,13,14,16],[4,17,18,20]]){
    const x=.60+digit*.025;
    hand[base]=point(x,.57);
    hand[middle]=point(x,.53);
    hand[tip]=point(x,digit===1||digit===2?.47:.61);
  }
  return hand;
}
test('valid hand landmarks with zero visibility are associated and retain the actual gesture',()=>{
  const hand=peaceHand();
  const association=associateObservedHands([hand],[]);
  assert.equal(association.left,hand);
  const curls=measuredFingerCurls(hand);
  assert(curls);
  assert.equal(observedHandPose(curls),'count-two');
  assert(curls[1]<.15&&curls[2]<.15&&curls[3]>.65&&curls[4]>.65);
  const bad=hand.slice();bad[8]={...bad[8],x:NaN};
  assert.equal(measuredFingerCurls(bad),undefined);
  assert.deepEqual(associateObservedHands([bad],[]),{});
});
test('real adapter result shape with zero visibility reaches retarget, stabilization and rig',async()=>{
  const hand=peaceHand();
  const runtime=async()=>({files:{},module:{
    FilesetResolver:{forVisionTasks:async()=>({})},
    PoseLandmarker:{createFromOptions:async()=>{throw Error('Unexpected pose model');}},
    HandLandmarker:{createFromOptions:async()=>({detectForVideo:()=>({landmarks:[hand]}),close(){}})},
    FaceLandmarker:{createFromOptions:async()=>{throw Error('Unexpected face model');}}
  }});
  const tracker=await startPerformanceTracker({pose:false,hands:true,face:false},runtime);
  const frame=tracker.detect({width:640,height:480} as ImageBitmap,100);
  assert(frame?.leftHand);
  const key=retargetCaptureFrame(frame)!;
  assert.equal(key.hands?.left,'count-two');
  const stable=createPerformanceStabilizer().update(key);
  assert(stable.fingerCurls?.left);
  const geometry=applyCapturedFingerCurls(sampleHandRig('relaxed'),stable.fingerCurls.left,stable.handConfidence?.left??0);
  assert(geometry.params.curl[1]<.15&&geometry.params.curl[2]<.15);
  assert(geometry.params.curl[3]>.65&&geometry.params.curl[4]>.65);
  tracker.close();
});
test('timeline gaze takes priority over captured pupils then capture resumes',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const key:PerformanceKey={time:0,pose:{head:5},focus:{x:.8,y:.4}};
  const performance:Clip={id:'test-motion',track:'performance',actor:actor.id,start:0,length:4,performance:[key,{...key,time:1}]};
  const gaze:Clip={id:'test-gaze',track:'gaze',actor:actor.id,start:1,length:1,target:'camera'};
  const stage={...scene,duration:4,clips:[performance,gaze]};
  const characters=new Map(project.characters.map(c=>[c.id,c]));
  const at=(t:number)=>evaluate(stage,t,characters).actors.find(a=>a.id===actor.id)!;
  assert.deepEqual(at(.5).focus,key.focus);
  assert.equal(at(1.5).capturedFocus,undefined);
  assert.deepEqual(at(1.5).focus,{x:0,y:-.08});
  assert.equal(at(1.5).authoredGaze,true);
  assert.deepEqual(at(2.5).focus,key.focus);
});
