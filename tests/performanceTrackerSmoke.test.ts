import assert from 'node:assert/strict';
import test from 'node:test';
import {startPerformanceTracker} from '../src/services/performanceTracker.ts';
import {retargetCaptureFrame} from '../src/engine/performanceCapture.ts';
import {maskPerformance,defaultTrackingSelection} from '../src/engine/trackingSelection.ts';

test('capture adapter actually invokes the pose detector and returns a usable key',async()=>{
  let calls=0;
  const landmarks=Array.from({length:33},()=>({x:0,y:0,visibility:0}));
  landmarks[11]={x:.65,y:.45,visibility:1};
  landmarks[12]={x:.35,y:.45,visibility:1};
  landmarks[13]={x:.72,y:.58,visibility:1};
  landmarks[15]={x:.79,y:.70,visibility:1};
  const runtime=async()=>({files:{},module:{
    FilesetResolver:{forVisionTasks:async()=>({})},
    PoseLandmarker:{createFromOptions:async()=>({detectForVideo:()=>{calls++;return {landmarks:[landmarks]};},close(){}})},
    HandLandmarker:{createFromOptions:async()=>{throw Error('Unexpected hand model');}},
    FaceLandmarker:{createFromOptions:async()=>{throw Error('Unexpected face model');}}
  }});
  const tracker=await startPerformanceTracker({pose:true,hands:false,face:false},runtime);
  const frame=tracker.detect({width:320,height:240} as ImageBitmap,100);
  assert.equal(calls,1);
  assert(frame);
  assert(maskPerformance(retargetCaptureFrame(frame),defaultTrackingSelection)?.armTargets?.left);
  tracker.close();
});
test('hand-only capture never initializes or calls pose detection',async()=>{
  const hand=Array.from({length:21},(_,i)=>({x:.65+(i%4)*.01,y:.65-i*.006,z:0}));
  const runtime=async()=>({files:{},module:{
    FilesetResolver:{forVisionTasks:async()=>({})},
    PoseLandmarker:{createFromOptions:async()=>{throw Error('Unexpected pose model');}},
    HandLandmarker:{createFromOptions:async()=>({detectForVideo:()=>({landmarks:[hand]}),close(){}})},
    FaceLandmarker:{createFromOptions:async()=>{throw Error('Unexpected face model');}}
  }});
  const tracker=await startPerformanceTracker({pose:false,hands:true,face:false},runtime);
  const frame=tracker.detect({width:320,height:240} as ImageBitmap,100);
  assert(frame?.leftHand||frame?.rightHand);
  assert.equal(tracker.features.pose,false);
  tracker.close();
});
