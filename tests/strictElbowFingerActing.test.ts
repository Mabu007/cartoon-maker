import assert from 'node:assert/strict';
import test from 'node:test';
import {solveStrictCapturedArm} from '../src/engine/performanceArmIntelligence.ts';
import {measuredFingerCurls,observedHandPose,type FingerCurls} from '../src/engine/performanceHandIntelligence.ts';
import {sampleHandRig,applyCapturedFingerCurls} from '../src/engine/handRig.ts';
import type {Landmark} from '../src/engine/performanceCapture.ts';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
test('all captured elbow targets stay at or below the shoulder without inward folding',()=>{
  for(const side of ['left','right'] as const)for(const scale of [.7,1,1.4])for(const pole of [-1,1]){
    const shoulder={x:23,y:-132},bone=Math.max(8,28*scale),sign=side==='left'?-1:1;
    for(let x=-65;x<=65;x+=5)for(let y=-65;y<=65;y+=5){
      const solved=solveStrictCapturedArm(shoulder,{x,y},scale,side,pole);
      assert(solved.elbow.y>=shoulder.y-1e-6);
      assert(sign*(solved.elbow.x-shoulder.x)>=-bone*.22-1e-6);
      assert(Math.abs(distance(shoulder,solved.elbow)-bone)<1e-6);
      assert(Math.abs(distance(solved.elbow,solved.hand)-bone)<1e-6);
      assert(solved.reach>=2*bone*Math.cos(142*Math.PI/360)-1e-6);
    }
  }
});
test('ordinary raised hand remains possible with a low elbow',()=>{
  const shoulder={x:0,y:0},target={x:-32,y:-12};
  const arm=solveStrictCapturedArm(shoulder,target,1,'left',1);
  assert(arm.elbow.y>=-1e-7);
  assert(distance(arm.hand,target)<1e-6);
  assert(arm.hand.y<0);
});
test('point, two, three, fist and thumbs up are distinct finger configurations',()=>{
  const gestures:[FingerCurls,string][]=[
    [[1,0,1,1,1],'point'],[[1,0,0,1,1],'count-two'],[[1,0,0,0,1],'count-three'],
    [[1,1,1,1,1],'fist'],[[0,1,1,1,1],'thumbs-up'],[[0,0,0,0,0],'open']
  ];
  for(const [curls,pose] of gestures)assert.equal(observedHandPose(curls),pose);
  const thumb=applyCapturedFingerCurls(sampleHandRig('thumbs-up'),[0,1,1,1,1],1);
  assert(thumb.params.thumbOpposition<-.6);
  assert(thumb.params.curl[0]===0);
  assert(thumb.params.curl.slice(1).every(v=>v===1));
});
test('a straight finger projecting toward the lens is not treated as curled',()=>{
  const hand:Landmark[]=Array.from({length:21},()=>({x:.5,y:.7,z:0}));
  const groups=[[2,3,4],[5,6,8],[9,10,12],[13,14,16],[17,18,20]];
  for(const [base,mid,tip] of groups){
    hand[base]={x:.5,y:.6,z:0};
    hand[mid]={x:.5,y:.59,z:-.06};
    hand[tip]={x:.5,y:.58,z:-.12};
  }
  assert(measuredFingerCurls(hand)!.every(c=>c<.2));
});
