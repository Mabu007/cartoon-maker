import assert from 'node:assert/strict';
import test from 'node:test';
import {trackingModelPlan,maskPerformance,blendSelectedFace,type TrackingSelection} from '../src/engine/trackingSelection.ts';
import {neutralFacialControls} from '../src/engine/facialIntelligence.ts';
import {samplePerformance,type PerformanceKey} from '../src/engine/performanceCapture.ts';
import {CapturedPoseKey} from '../src/engine/schema.ts';
import {estimateHeadYaw,headFacingForYaw} from '../src/engine/performanceHeadEye.ts';
const off:TrackingSelection={head:false,face:false,eyes:false,torso:false,hips:false,legs:false,arms:false,hands:false};
const example:PerformanceKey={time:0,pose:{head:10,torso:5,hips:4,leftShoulder:30,leftHip:25,leftKnee:20},headFacing:'left',hands:{left:'point',right:'relaxed'},fingerCurls:{left:[1,0,1,1,1]},armTargets:{left:{x:-30,y:20}},focus:{x:.4,y:0},facial:{...neutralFacialControls,blinkLeft:1,smileLeft:1}};
test('fingers alone omit all unrelated channels and models',()=>{
 const selection={...off,hands:true};
 assert.deepEqual(trackingModelPlan(selection),{pose:false,hands:true,face:false});
 const key=maskPerformance(example,selection)!;
 assert.deepEqual(key.pose,{});assert.equal(key.armTargets,undefined);
 assert.equal(key.focus,undefined);assert.equal(key.facial,undefined);assert.equal(key.headFacing,undefined);
 assert.equal(key.hands?.left,'point');assert(CapturedPoseKey.safeParse(key).success);
 assert.deepEqual(samplePerformance([key,{...key,time:1}],.5).tracking,selection);
});
test('face-only can skip pose and hand inference',()=>{
 assert.deepEqual(trackingModelPlan({...off,head:true,face:true,eyes:true}),{pose:false,hands:false,face:true});
});
test('eyes and expressions preserve unrelated facial channels',()=>{
 const base={...neutralFacialControls,blinkLeft:.2,smileLeft:.3};
 const observed={...neutralFacialControls,blinkLeft:1,smileLeft:1};
 const eye=blendSelectedFace(base,observed,1,{...off,eyes:true});
 assert.equal(eye.blinkLeft,1);assert.equal(eye.smileLeft,.3);
 const face=blendSelectedFace(base,observed,1,{...off,face:true});
 assert.equal(face.blinkLeft,.2);assert.equal(face.smileLeft,1);
});
test('pelvis and legs can be captured independently',()=>{
 assert.deepEqual(maskPerformance(example,{...off,hips:true})?.pose,{hips:4});
 assert.deepEqual(maskPerformance(example,{...off,legs:true})?.pose,{leftHip:25,leftKnee:20});
 assert.equal(maskPerformance(example,off),undefined);
});
test('nose direction follows mirrored camera view',()=>{
 const a={x:.4,y:.3},b={x:.6,y:.3};
 assert.equal(headFacingForYaw(estimateHeadYaw({x:.54,y:.34},a,b)!),'left');
 assert.equal(headFacingForYaw(estimateHeadYaw({x:.46,y:.34},a,b)!),'right');
});
