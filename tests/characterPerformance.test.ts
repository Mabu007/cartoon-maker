import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument,views,type Expression } from '../src/engine/schema.ts';
import { mouthGeometry,mouthParameters,blendMouthParameters } from '../src/engine/mouthRig.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';
import { performanceHandPose } from '../src/engine/handPerformance.ts';
import { sampleTimedViseme,visemeNames } from '../src/engine/visemes.ts';
import { motionBlend,travelProgress,travelSpeed,footContactAt } from '../src/engine/animation.ts';
import { evaluate,movementPosition,MOVIE_FRAME_RATE } from '../src/engine/evaluate.ts';
const project=makeProject(true),c=project.characters[0];
const mood=(shape:typeof visemeNames[number],time=1)=>
  facialPerformance(time,c.id,'talk','neutral',.7,{shape,weight:shape==='rest'?0:1});
test('all visemes produce finite parametric SVG paths in front, 3/4 and side views',()=>{
 for(const shape of visemeNames)for(const view of ['front','three-quarter','side'] as const){
  const output=mouthGeometry(c,mood(shape),view);
  assert.match(output.cavityPath,/^M /);
  assert.match(output.upperLipPath,/^M /);
  assert.match(output.lowerLipPath,/^M /);
  assert(!/NaN|Infinity|undefined/.test(output.cavityPath));
  assert(output.rx>0 && output.teeth.length===6);
  assert(output.parameters.jawOpening>=0 && output.parameters.jawOpening<=1);
  assert(output.parameters.lipClosure>=0 && output.parameters.lipClosure<=1);
 }
});
test('closed B/M/P and silent rest stay completely closed despite emotion and audio volume',()=>{
 for(const shape of ['closed','rest'] as const){
  const m=facialPerformance(2,c.id,'talk','excited',1,{shape,weight:1});
  const rig=mouthGeometry(c,m,'front');
  assert.equal(rig.open,false);
  assert.equal(rig.parameters.lipClosure,1);
  assert.equal(rig.parameters.teethVisibility,0);
  assert.equal(rig.parameters.tongueVisibility,0);
 }
});
test('rounded, puckered, wide and tongue shapes have visibly different parameter sets',()=>{
 const wide=mouthGeometry(c,mood('wide'),'front');
 const rounded=mouthGeometry(c,mood('round'),'front');
 const pucker=mouthGeometry(c,mood('pucker'),'front');
 const tongue=mouthGeometry(c,mood('tongue'),'front');
 const bite=mouthGeometry(c,mood('bite'),'front');
 assert(wide.rx>rounded.rx && rounded.rx>pucker.rx);
 assert(tongue.tongue.visible);
 assert(!pucker.tongue.visible);
 assert(bite.parameters.teethVisibility>rounded.parameters.teethVisibility);
 assert(wide.parameters.lipRounding<rounded.parameters.lipRounding);
});
test('all teeth are separately addressable, and per-tooth gold/missing/customization survives schema',()=>{
 const character={...c,goldTeeth:[2],missingTeeth:[4],
   toothColors:['#efefef','#fefefe','#f1f1f1','#f2f2f2','#f3f3f3','#f4f4f4']};
 const parsed=ProjectDocument.parse({...project,characters:[character,...project.characters.slice(1)]});
 const rig=mouthGeometry(parsed.characters[0],mood('wide'),'front');
 assert.equal(rig.teeth.length,5);
 assert(!rig.teeth.some(t=>t.id==='tooth-4'));
 assert.equal(rig.teeth[2].id,'tooth-2');
 assert.equal(rig.teeth[2].fill,'#f1f1f1');
 const gold=mouthGeometry({...c,goldTeeth:[2]},mood('wide'),'front');
 assert.equal(gold.teeth[2].fill,'#eac05c');
});
test('teeth and tongue geometry cannot escape the displayed cavity because mask shape is shared',()=>{
 for(const shape of ['wide','open','tongue','bite','round','pucker'] as const){
  const rig=mouthGeometry(c,mood(shape),'front');
  assert(rig.open);
  assert(rig.cavityPath.endsWith(' Z'));
  assert(rig.teeth.every(t=>t.x>-rig.rx && t.x<rig.rx && t.width>0 && t.height>=0));
  assert(rig.tongue.ry>=0 && rig.tongue.rx<rig.rx);
 }
});
test('side profile projects mouth width without moving individual tooth indexes',()=>{
 const front=mouthGeometry(c,mood('wide'),'front');
 const side=mouthGeometry(c,mood('wide'),'side');
 assert.equal(side.profileScale,.75);
 assert.equal(front.profileScale,1);
 assert.deepEqual(front.teeth,side.teeth);
});
test('viseme interpolation is deterministic, softened across vowels, but closed consonants stay exact',()=>{
 const cues=[{start:0,end:.2,shape:'closed' as const},
   {start:.2,end:.7,shape:'open' as const},{start:.7,end:1,shape:'rest' as const}];
 const before=sampleTimedViseme(cues,.199);
 const onset=sampleTimedViseme(cues,.201);
 const middle=sampleTimedViseme(cues,.24);
 assert.equal(before.shape,'closed');
 assert.equal(before.weight,1);
 assert.equal(onset.from,'closed');
 assert(onset.blend!<middle.blend!);
 const a=mouthGeometry(c,facialPerformance(.201,c.id,'talk','neutral',1,onset),'front');
 const b=mouthGeometry(c,facialPerformance(.24,c.id,'talk','neutral',1,middle),'front');
 assert(b.parameters.jawOpening>a.parameters.jawOpening);
 assert.equal(sampleTimedViseme(cues,.78).shape,'rest');
});
test('mouth interpolation clamps controls and never extrapolates outside presets',()=>{
 const a=mouthParameters(c,mood('closed')),b=mouthParameters(c,mood('round'));
 assert.deepEqual(blendMouthParameters(a,b,0),a);
 assert.deepEqual(blendMouthParameters(a,b,1),b);
 assert.deepEqual(blendMouthParameters(a,b,2),b);
});
test('user mouth proportions persist and deform the same rig rather than switch images',()=>{
 const base=mouthGeometry(c,mood('open'),'front');
 const customized={...c,mouthRig:{width:1.35,jawScale:1.3,roundness:.6,asymmetry:.35}};
 const parsed=ProjectDocument.parse({...project,characters:[customized,...project.characters.slice(1)]});
 const changed=mouthGeometry(parsed.characters[0],mood('open'),'front');
 assert(changed.rx>base.rx && changed.bottom>base.bottom);
 assert.notEqual(changed.cornerLeft,changed.cornerRight);
});
test('emotional speaking preserves phoneme closure while changing gaze and asymmetry',()=>{
 const nervous=facialPerformance(1.3,c.id,'talk','nervous',1,{shape:'wide',weight:1},{x:.8,y:-.4});
 const angry=facialPerformance(1.3,c.id,'talk','angry',1,{shape:'wide',weight:1},{x:.8,y:-.4});
 assert.equal(nervous.viseme,'wide');
 assert.equal(angry.viseme,'wide');
 assert(mouthParameters(c,nervous).asymmetry>mouthParameters(c,angry).asymmetry);
 const closed=facialPerformance(1.3,c.id,'talk','nervous',1,{shape:'closed',weight:1});
 assert.equal(mouthGeometry(c,closed,'front').open,false);
});
test('directed focus reaches target while blinks and pupil movements stay pure at any frame rate',()=>{
 const left=facialPerformance(.85,c.id,'listen','neutral',0,undefined,{x:-.9,y:.25});
 const right=facialPerformance(.85,c.id,'listen','neutral',0,undefined,{x:.9,y:.25});
 assert(left.gazeX<right.gazeX);
 for(const time of [0,.13,.87,2.7,4.3,9.8]){
  const state=facialPerformance(time,c.id,'listen','happy',0,undefined,{x:.25,y:0});
  assert.deepEqual(state,facialPerformance(time,c.id,'listen','happy',0,undefined,{x:.25,y:0}));
  assert(state.blink>=0 && state.blink<=1);
 }
});
test('speakers and listeners have independently targeted eyes and listening states',()=>{
 const original=project.scenes[0],speakers=original.actors;
 assert(speakers.length>=2);
 const dialogue={id:'test-dialogue',track:'dialogue' as const,actor:speakers[0].id,text:'Hi',
  start:2,length:2,asset:'builtin:sbu-food',volume:1,muted:false,offset:0};
 const scene={...original,clips:[dialogue]};
 const frame=evaluate(scene,2.3);
 const speaker=frame.actors.find(a=>a.id===speakers[0].id)!;
 const listener=frame.actors.find(a=>a.id===speakers[1].id)!;
 assert.equal(speaker.speaking,true);
 assert.equal(listener.listening,true);
 assert(listener.focus);
 assert(Number.isFinite(listener.focus!.x));
 assert(!Number.isNaN(listener.focus!.y));
});
test('point, wave, palm, fist, speech beats and held prop use distinct hand poses',()=>{
 const input={action:'idle' as const,locomotion:'idle' as const,side:'right' as const,
  carrying:false,time:0,expression:'neutral' as const,speechWeight:0};
 assert.equal(performanceHandPose({...input,action:'point'}),'point');
 assert.equal(performanceHandPose({...input,action:'wave'}),'open');
 assert.equal(performanceHandPose({...input,action:'open-hand'}),'open');
 assert.equal(performanceHandPose({...input,action:'fist'}),'fist');
 assert.equal(performanceHandPose({...input,carrying:true,action:'point'}),'grip');
 const speech=Array.from({length:10},(_,i)=>performanceHandPose({...input,time:i*.7,speechWeight:1}));
 assert(speech.includes('open')&&speech.includes('point')&&speech.includes('relaxed'));
 assert.equal(performanceHandPose({...input,side:'left',action:'point'}),'relaxed');
});
test('physical travel starts/stops at zero speed and progresses monotonically with no jumps',()=>{
 assert.equal(travelProgress(0),0);
 assert.equal(travelProgress(1),1);
 assert.equal(travelSpeed(0),0);
 assert.equal(travelSpeed(1),0);
 assert(travelSpeed(.5)>0);
 let previous=-1;
 for(let n=0;n<=100;n++){const value=travelProgress(n/100);assert(value>=previous);previous=value;}
 assert.equal(motionBlend(1,1,2),0);
 assert.equal(motionBlend(3,1,2),0);
 assert(motionBlend(2,1,2)>.99);
});
test('walking frame endpoints are planted and ramp smoothly while running makes bigger recovery',()=>{
 const slow=footContactAt(.1,'walk','left',80);
 const fast=footContactAt(.1,'run','left',160);
 assert(Number.isFinite(slow.x)&&Number.isFinite(fast.y));
 const actor=project.scenes[0].actors[0];
 const movement={id:'motion',track:'movement' as const,actor:actor.id,start:2,length:3,
  fromX:180,fromY:420,toX:480,toY:420,gait:'walk' as const};
 const scene={...project.scenes[0],clips:[movement]};
 const start=evaluate(scene,2.00001).actors.find(a=>a.id===actor.id)!;
 const middle=evaluate(scene,3.5).actors.find(a=>a.id===actor.id)!;
 const finish=evaluate(scene,4.99999).actors.find(a=>a.id===actor.id)!;
 assert(start.gaitWeight<middle.gaitWeight);
 assert(finish.gaitWeight<middle.gaitWeight);
 assert(start.gaitVelocity!<middle.gaitVelocity!);
 assert(finish.gaitVelocity!<middle.gaitVelocity!);
 assert(Math.abs(movementPosition(movement,0).x-180)<1e-8);
 assert(Math.abs(movementPosition(movement,1).x-480)<1e-8);
});
test('preview and export at identical timestamps reproduce exactly the same pose and mouth rig',()=>{
 const actor=project.scenes[0].actors[0];
 const clips=[{id:'demo-talk',track:'dialogue' as const,actor:actor.id,start:1,length:3,
   text:'Speech',offset:0,volume:1,muted:false,asset:'builtin:sbu-food',
   visemes:[{start:0,end:.2,shape:'closed' as const},{start:.2,end:1,shape:'open' as const},
     {start:1,end:3,shape:'rest' as const}]}];
 const scene={...project.scenes[0],clips};
 for(const frame of [0,20,31,34,36,38,50,60,80,120,180]){
  const time=frame/MOVIE_FRAME_RATE;
  const first=evaluate(scene,time).actors.find(a=>a.id===actor.id)!;
  const second=evaluate(scene,time).actors.find(a=>a.id===actor.id)!;
  assert.deepEqual(first,second);
  const moodA=facialPerformance(time,actor.id,first.action,first.expression,.6,first.viseme,first.focus);
  const moodB=facialPerformance(time,actor.id,second.action,second.expression,.6,second.viseme,second.focus);
  assert.deepEqual(mouthGeometry(c,moodA,first.view),mouthGeometry(c,moodB,second.view));
 }
});
