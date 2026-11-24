import assert from 'node:assert/strict';
import test from 'node:test';
import {measureThumb,createThumbStabilizer,thumbExtended,type ThumbMotion} from '../src/engine/thumbIntelligence.ts';
import {observedHandPose,type FingerCurls} from '../src/engine/performanceHandIntelligence.ts';
import {applyCapturedFingerCurls,sampleHandRig} from '../src/engine/handRig.ts';
import {samplePerformance,type Landmark,type PerformanceKey} from '../src/engine/performanceCapture.ts';
import {CapturedPoseKey} from '../src/engine/schema.ts';
import {maskPerformance,defaultTrackingSelection} from '../src/engine/trackingSelection.ts';
import {mirrorCapturedRig} from '../src/engine/humanReconstruction.ts';
import {compileResolvedPerformance} from '../src/engine/resolvedPerformance.ts';
const point=(x:number,y:number):Landmark=>({x,y,z:0,visibility:0});
const extended:ThumbMotion={curl:0,opposition:0,abduction:1,pinch:0};
const folded:ThumbMotion={curl:1,opposition:1,abduction:0,pinch:0};
const closed:FingerCurls=[0,1,1,1,1];
function palm(){
  const hand=Array.from({length:21},()=>point(.5,.5));
  hand[0]=point(.5,.7);hand[5]=point(.4,.5);hand[9]=point(.5,.5);hand[17]=point(.6,.5);hand[8]=point(.4,.3);
  hand[1]=point(.45,.65);hand[2]=point(.39,.59);hand[3]=point(.33,.53);hand[4]=point(.27,.47);
  return hand;
}
test('thumb measurements distinguish extension and opposition without visibility metadata',()=>{
  const hand=palm(),open=measureThumb(hand)!;
  assert(thumbExtended(open));assert(open.curl<.1);
  hand[2]=point(.39,.59);hand[3]=point(.44,.54);hand[4]=point(.51,.59);
  const fist=measureThumb(hand)!;
  assert(fist.opposition>.7);assert(fist.curl>.5);assert(!thumbExtended(fist));
  const mirror=hand.map(p=>({...p,x:1-p.x}));
  for(const channel of ['curl','opposition','abduction','pinch'] as const)
    assert(Math.abs(measureThumb(mirror)![channel]-fist[channel])<.002);
});
test('pinch is measured relative to palm width and index tip',()=>{
  const hand=palm();hand[4]=point(.42,.47);hand[8]=point(.42,.47);
  const thumb=measureThumb(hand)!;
  assert(thumb.pinch>.99);
  assert.equal(observedHandPose([.5,.6,1,1,1],{...thumb,opposition:.8}),'pinch');
});
test('thumbs up and folded fist have different silhouettes without modifying other digits',()=>{
  const base=sampleHandRig('relaxed');
  const up=applyCapturedFingerCurls(base,closed,1,extended);
  const fist=applyCapturedFingerCurls(base,closed,1,folded);
  assert.equal(observedHandPose(closed,extended),'thumbs-up');
  assert.equal(observedHandPose(closed,folded),'fist');
  assert(up.thumb[2][1]<-15);
  assert(fist.thumb[2][0]>-2);
  assert.deepEqual(up.fingers,fist.fingers);
  assert.equal(observedHandPose([0,0,0,0,0],extended),'open');
  assert.equal(observedHandPose([1,0,1,1,1],folded),'point');
  assert.equal(observedHandPose([1,0,0,1,1],folded),'count-two');
  const open=applyCapturedFingerCurls(base,[0,0,0,0,0],1,extended);
  assert(open.thumb[2][0]<-14);
  assert.deepEqual(applyCapturedFingerCurls(base,closed,0,extended),base);
});
test('a single noisy thumb frame cannot flip a held gesture; missing evidence expires',()=>{
  const filter=createThumbStabilizer();
  assert.deepEqual(filter.update(extended,0),extended);
  assert.deepEqual(filter.update(folded,.07),extended);
  assert.deepEqual(filter.update(extended,.14),extended);
  filter.update(folded,.21);
  const confirmed=filter.update(folded,.28)!;
  assert(confirmed.opposition>.7);
  assert.deepEqual(filter.update(undefined,.4),confirmed);
  assert.equal(filter.update(undefined,.9),undefined);
  filter.reset();assert.equal(filter.update(undefined,1),undefined);
});
test('thumb metadata interpolates, mirrors, survives recording schema and obeys hand switch',()=>{
  const first:PerformanceKey={time:0,pose:{},fingerCurls:{left:closed},thumbs:{left:extended}};
  const last:PerformanceKey={...first,time:1,thumbs:{left:folded}};
  const mid=samplePerformance([first,last],.5);
  assert.equal(mid.thumbs?.left?.opposition,.5);
  assert.equal(mirrorCapturedRig(mid).thumbs?.right?.opposition,.5);
  assert(CapturedPoseKey.safeParse(mid).success);
  const take=compileResolvedPerformance([{elapsed:0,sample:first},{elapsed:1,sample:last}],1);
  assert.equal(take.keys[0].thumbs?.left?.abduction,1);
  assert.equal(take.keys.at(-1)?.thumbs?.left?.opposition,1);
  assert.equal(maskPerformance({...mid,pose:{head:5}},{...defaultTrackingSelection,hands:false})?.thumbs,undefined);
});
