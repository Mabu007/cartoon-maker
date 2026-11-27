import assert from 'node:assert/strict';
import test from 'node:test';
import {flagshipCharacters} from '../src/engine/visualPresets.ts';
import {views} from '../src/engine/schema.ts';
import {rig,viewForward} from '../src/engine/animation.ts';
import {resolveArtworkArm,resolveArtworkLeg} from '../src/engine/resolvedArtworkPose.ts';
import {facialPerformance} from '../src/engine/facialAnimation.ts';
import {resolveVisualFrame,snapshotResolvedArtworkPose,viewArt,type VisualFrameInputs} from '../src/engine/visualFrame.ts';

test('15A frame preserves legacy resolver endpoints, facial cue and mirror across views',()=>{
 for(const c of flagshipCharacters)for(const view of views)for(const mirrored of [false,true])for(const action of ['idle','sit','walk'] as const){
  const input:VisualFrameInputs={c,view,pose:{},expression:'neutral',amplitude:.4,time:1.25,action,actorId:c.id,locomotion:action,lift:action==='sit'?20:0,gaitTime:.4,forward:viewForward(view),actionTime:.4,gaitWeight:1,listening:false,turnScale:1,viseme:{shape:'closed',weight:.8},focus:{x:.2,y:-.1},appearance:{mirrored,capturedHeadYaw:.2,capturedHeadFacing:'left'}};
  const f=resolveVisualFrame(input),r=rig(c,input.pose,viewArt[view].width);
  assert.deepEqual(f.rig,r);
  for(const side of ['left','right'] as const){
   const holdsCostume=side===(c.wardrobe?.hand??'right')&&Boolean(c.wardrobe?.handheld&&c.wardrobe.handheld!=='none');
   assert.deepEqual(f.arms[side],resolveArtworkArm(c,r,side,viewArt[view],action,input.actionTime,false,holdsCostume,false,false,input.appearance));
   assert.deepEqual(f.legs[side],resolveArtworkLeg(c,r,side,action,action,input.lift,input.gaitTime,input.forward,1,undefined,input.appearance));
   assert.equal(f.hands[side].position,f.arms[side].hand);
   assert.equal(f.attachments.feet[side],f.legs[side].foot);
  }
  const left=!viewArt[view].rear&&!f.headDeformation;
  if(f.headDeformation){assert.equal(f.head.position.x,r.head.x);assert.equal(f.head.scale.x,c.head);}
  assert.equal(f.headMirrored,mirrored!==left);
  assert.equal(f.headPitch,0);assert.equal(f.headYaw,.2);
  assert.equal(f.speech.shape,'closed');assert.equal(f.speech.mouthOpen,0);
  assert.deepEqual(f.facial,facialPerformance(input.time,c.id,action,'neutral',input.amplitude,input.viseme,{x:left?-.2:.2,y:-.1},c.personality));
  const snap=snapshotResolvedArtworkPose(f);
  assert.notEqual(snap.arms,f.arms);assert.deepEqual(snap.arms,f.arms);
  assert.notEqual(snap.hands.left?.geometry,f.hands.left.geometry);
  assert.equal('headYaw' in snap,false);
 }
});
