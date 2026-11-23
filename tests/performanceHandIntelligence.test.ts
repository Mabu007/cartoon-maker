import assert from 'node:assert/strict';
import test from 'node:test';
import { measuredFingerCurls, observedHandPose, detectedHandContact } from '../src/engine/performanceHandIntelligence.ts';
import { capturedEyeFocus } from '../src/engine/facialIntelligence.ts';
import { sampleHandRig, applyCapturedFingerCurls } from '../src/engine/handRig.ts';
import { retargetCaptureFrame, samplePerformance, reducePerformanceKeys, type Landmark } from '../src/engine/performanceCapture.ts';
import { smoothLivePerformance } from '../src/engine/livePerformanceScene.ts';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import { evaluate } from '../src/engine/evaluate.ts';

const point=(x:number,y:number,visibility=1):Landmark=>({x,y,visibility});
const groups=[[2,3,4],[5,6,8],[9,10,12],[13,14,16],[17,18,20]] as const;
function hand(extended:boolean[]=[true,true,true,true,true],x=.5,y=.8):Landmark[]{
  const p=Array.from({length:21},()=>point(x,y));
  p[0]=point(x,y);
  for(let digit=0;digit<5;digit++){
    const [base,middle,tip]=groups[digit];
    const offset=(digit-2)*.025;
    p[base]=point(x+offset,y-.15);
    p[middle]=point(x+offset,y-(extended[digit]?.27:.17));
    p[tip]=point(x+offset,y-(extended[digit]?.5:.06));
  }
  return p;
}
function body(positions?:{left?:[number,number];right?:[number,number]}){
  const p=Array.from({length:33},()=>point(0,0,0));
  p[0]=point(.5,.18);p[2]=point(.57,.2);p[5]=point(.43,.2);
  p[11]=point(.64,.5);p[12]=point(.36,.5);
  p[13]=point(.60,.53);p[14]=point(.4,.53);
  p[15]=point(...(positions?.left??[.60,.66]));
  p[16]=point(...(positions?.right??[.40,.66]));
  return p;
}
test('each finger bends independently, not just a small library of preset hands',()=>{
  const allOpen=measuredFingerCurls(hand());
  const fist=measuredFingerCurls(hand([false,false,false,false,false]));
  const indexOnly=measuredFingerCurls(hand([false,true,false,false,false]));
  const ringOnly=measuredFingerCurls(hand([true,true,true,false,true]));
  assert(allOpen?.every(value=>value<.45));
  assert(fist?.every(value=>value>.66));
  assert.equal(observedHandPose(fist!),'fist');
  assert.equal(observedHandPose(indexOnly!),'point');
  assert(ringOnly![3]>ringOnly![2]+.3,'the ring must close without closing the middle');
  const shape=applyCapturedFingerCurls(sampleHandRig('relaxed'),ringOnly!,1);
  assert(shape.params.curl[3]>.65);
  assert(shape.params.curl[2]<.42);
  assert(shape.fingers[2][2][1]<shape.fingers[3][2][1],
    'closed ring fingertip should be visibly nearer the palm');
  assert.equal(measuredFingerCurls(hand().slice(0,6)),undefined);
});
test('face blendshapes move pupils for real eye rolls without requiring head motion',()=>{
  const up=capturedEyeFocus({eyeLookUpLeft:.87,eyeLookUpRight:.9});
  assert(up&&up.y<-.65);
  const down=capturedEyeFocus({eyeLookDownLeft:.82,eyeLookDownRight:.89});
  assert(down&&down.y>.65);
  const glance=capturedEyeFocus({eyeLookOutLeft:.82,eyeLookInRight:.79});
  assert(glance&&glance.x<-.65);
  const still=capturedEyeFocus({eyeLookOutLeft:.02,eyeLookUpLeft:.08});
  assert.equal(still,undefined);
  const captured=retargetCaptureFrame({t:3,pose:body(),face:{eyeLookUpLeft:.9,eyeLookUpRight:.92}});
  assert(captured?.focus&&captured.focus.y<-.65);
});
test('two visible wrists support prayer, hands-on-head, guarding and a clenched punch',()=>{
  const open=hand(),fist=hand([false,false,false,false,false]);
  const prayer=body({left:[.48,.47],right:[.52,.47]});
  assert.equal(detectedHandContact(prayer,open,open),'prayer');
  const head=body({left:[.37,.1],right:[.63,.1]});
  assert.equal(detectedHandContact(head,open,open),'hands-on-head');
  const guard=body({left:[.36,.39],right:[.64,.39]});
  assert.equal(detectedHandContact(guard,fist,fist),'guard');
  const punch=body({left:[.05,.45],right:[.47,.67]});
  assert.equal(detectedHandContact(punch,fist,open),'punch-left');
  const absent=body({left:[.48,.47],right:[.52,.47]});
  absent[16].visibility=0;
  assert.equal(detectedHandContact(absent,open,open),undefined,
    'unobserved second wrist must not turn into an invented prayer gesture');
});
test('capture, interpolation, saved project and playback retain five curls and both-hand contact',()=>{
  const p=body({left:[.48,.47],right:[.52,.47]});
  const first=retargetCaptureFrame({t:1,pose:p,leftHand:hand(),rightHand:hand()});
  const second=retargetCaptureFrame({t:1.2,pose:p,leftHand:hand([false,true,false,false,false]),rightHand:hand()});
  assert(first?.fingerCurls?.left&&second?.fingerCurls?.left);
  assert.equal(first.contact,'prayer');
  const smooth=smoothLivePerformance(first,second,.25);
  assert(smooth.fingerCurls?.left&&smooth.fingerCurls.left[1]<.5);
  const keys=[{...first,time:0},{...second,time:1}];
  const sampled=samplePerformance(keys,.5);
  assert(sampled.fingerCurls?.left);
  assert.equal(sampled.contact,'prayer');
  const reduced=reducePerformanceKeys([keys[0],sampled,keys[1]],1.6);
  assert(reduced.length>=2);
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const clip={id:'five-digit-prayer',track:'performance' as const,actor:actor.id,
    start:0,length:2,name:'Pray',facing:'front' as const,performance:keys};
  const doc=ProjectDocument.parse({...project,
    scenes:[{...scene,clips:[clip]},...project.scenes.slice(1)]});
  const persisted=doc.scenes[0].clips[0];
  assert(persisted.track==='performance');
  assert.equal(persisted.performance[0].contact,'prayer');
  assert(persisted.performance[1].fingerCurls?.left);
  const state=evaluate(doc.scenes[0],.75,new Map(doc.characters.map(c=>[c.id,c]))).actors[0];
  assert.equal(state.capturedContact?.type,'prayer');
  assert(state.capturedFingers?.left);
});
test('captured hand ownership releases during tracking loss without stale finger poses',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const visible={time:0,pose:{leftShoulder:45,rightShoulder:-45},
    fingerCurls:{left:[1,0,1,1,1] as [number,number,number,number,number]},
    contact:'punch-left' as const,presence:1};
  const gone={time:.4,pose:{},presence:0};
  const back={...visible,time:1};
  const clip={id:'dropout-hands',track:'performance' as const,actor:actor.id,
    start:0,length:3,performance:[visible,gone,back]};
  const state=evaluate({...scene,clips:[clip]},1.2,new Map(project.characters.map(c=>[c.id,c]))).actors[0];
  assert.equal(state.capturedFingers,undefined);
  assert.equal(state.capturedContact,undefined);
  assert.equal(state.capturedArms?.left,false);
  const previous=ProjectDocument.parse({...project,scenes:[scene,...project.scenes.slice(1)]});
  assert(previous.scenes.length>0,'older projects without finger data remain valid');
});
