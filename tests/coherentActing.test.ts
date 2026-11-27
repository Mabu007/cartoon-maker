import test from 'node:test';
import assert from 'node:assert/strict';
import {actingAudition,auditionProfiles} from '../src/engine/actingAudition.ts';
import {sampleCoherentActing,resolvePersonality} from '../src/engine/livingCharacter.ts';
import {coherentFrame} from '../src/engine/coherentActing.ts';
import {evaluate} from '../src/engine/evaluate.ts';
import {facialPerformance} from '../src/engine/facialAnimation.ts';
import {PersonalityDefinition,type Clip} from '../src/engine/schema.ts';
const input={time:2.5,actorId:'a',action:'idle' as const,locomotion:'idle' as const,expression:'neutral' as const,speaking:true,phrase:{start:1,duration:3.1,text:'Hey! Who ate my food?'}};
const sample=(p:ReturnType<typeof actingAudition>,t:number)=>evaluate(p.scenes[0],t,new Map(p.characters.map(c=>[c.id,c])));
test('coordinated profiles are distinct with deterministic actor-local schedule and unchanged visemes',()=>{
 const projects=auditionProfiles.map(profile=>actingAudition(profile));
 const profiles=projects.map(p=>Array.from({length:120},(_,i)=>sample(p,i/20).actors[0]));
 assert.notDeepEqual(profiles[0].map(x=>x.pose),profiles[1].map(x=>x.pose));
 assert.notDeepEqual(profiles[1].map(x=>x.pose),profiles[2].map(x=>x.pose));
 assert.deepEqual(profiles[0].map(x=>x.viseme),profiles[1].map(x=>x.viseme));
 const p=projects[0],times=[0,.6,1.2,2.1,3.9,4.6,5.5,7.8,9.2],first=times.map(t=>sample(p,t));assert.deepEqual([...times].reverse().map(t=>sample(p,t)).reverse(),first);
 const c=p.characters[0],traits=resolvePersonality(c.personality);
 assert.notDeepEqual(Array.from({length:200},(_,i)=>coherentFrame(c,traits,{...input,time:i/20,actorId:'a'}).breath),Array.from({length:200},(_,i)=>coherentFrame(c,traits,{...input,time:i/20,actorId:'b'}).breath));
});
test('opt-out, explicit body/gesture, gaze, facial and capture claims retain authority',()=>{
 const p=actingAudition('nervous'),c=p.characters[0],base={torso:12,head:5,leftElbow:40,rightWrist:10};
 for(const authority of [{body:true},{capture:true},{arms:true,head:true}]){const a=sampleCoherentActing(c,input,base,authority);assert.deepEqual(a.pose,base);assert.equal(a.gesture.weight,0);}
 const off={...c,personality:{...c.personality,autoActing:'off' as const}};assert.equal(sampleCoherentActing(off,input,base,{}).pose,base);
 const locked=sampleCoherentActing(c,input,base,{gaze:true,eyes:true,face:true}).frame,focus={x:.5,y:-.25},cue={shape:'open' as const,weight:.7};
 const mood=facialPerformance(2.5,'a','idle','neutral',.3,cue,focus,c.personality,1,'none',undefined,locked);
 assert.equal(mood.gazeX,focus.x*3.45);assert.equal(mood.gazeY,focus.y*2.45);assert.equal(mood.viseme,cue.shape);assert.equal(mood.blink,0);
 assert(!PersonalityDefinition.safeParse({actingModel:'coherent-v1',breathingAmplitude:101}).success);
});
test('timeline capture gaps and authored gestures suppress generated motion without changing viseme',()=>{
 const p=actingAudition('nervous'),s=p.scenes[0],actor=s.actors[0].id;
 const take:Extract<Clip,{track:'performance'}>={id:'coherent-capture',track:'performance',actor,name:'Take',start:1,length:3,performanceOrigin:'mocap',performance:[{time:0,pose:{leftShoulder:20,leftElbow:30},presence:1},{time:.5,pose:{},presence:0},{time:1,pose:{leftShoulder:14,leftElbow:24},presence:1}]};
 s.clips.push(take);
 for(const t of [1.2,2,2.5,3.8]){const a=sample(p,t).actors[0];assert.equal(a.handGesture?.weight,0);assert.equal(a.behavior?.headFree,false);assert.equal(a.behavior?.eyesFree,false);}
 s.clips=s.clips.filter(c=>c.id!==take.id);s.clips.push({id:'coherent-wave',track:'body',actor,start:1,length:3,action:'wave',layer:'gesture'});
 for(const t of [1.5,2.5]){const a=sample(p,t).actors[0];assert.equal(a.handGesture?.weight,0);assert.equal(a.behavior?.headFree,false);}
});
test('bounded stillness and coherent state changes, hosted scene CPU diagnostic',t=>{
 const p=actingAudition('relaxed'),times:number[]=[];let previous:number|undefined;
 for(let i=0;i<300;i++){const start=performance.now(),a=sample(p,i/30).actors[0];times.push(performance.now()-start);assert(a.behavior);assert(Math.abs(a.behavior.breath)<=1);assert(Math.abs(a.behavior.shift)<=1);if(i<25&&previous!==undefined)assert(Math.abs((a.pose.torso??0)-previous)<2);previous=a.pose.torso??0;}
 times.sort((a,b)=>a-b);t.diagnostic('ACTING_CPU '+JSON.stringify({frames:times.length,p50Ms:times[150],p95Ms:times[285]}));
});
