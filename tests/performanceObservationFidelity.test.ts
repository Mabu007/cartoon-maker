import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFaceObservation, freshFaceSignals } from '../src/services/performanceTracker.ts';
import { resolvePreviewFocus } from '../src/engine/gaze.ts';
import { facialFromBlendshapes } from '../src/engine/facialIntelligence.ts';
import { retargetCaptureFrame, samplePerformance, type CaptureFrame, type PerformanceKey } from '../src/engine/performanceCapture.ts';
import { smoothLivePerformance } from '../src/engine/livePerformanceScene.ts';
import { compileResolvedPerformance, type ResolvedObservation } from '../src/engine/resolvedPerformance.ts';
import { makeProject } from '../src/engine/presets.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { ProjectDocument, type Clip } from '../src/engine/schema.ts';

test('Face Landmarker official result shape preserves brows, mouth, and mesh after 600ms',()=>{
  const landmarks=Array.from({length:264},(_,i)=>({x:(i%17)/17,y:(i%23)/23}));
  const result=extractFaceObservation({
    faceLandmarks:[landmarks],
    faceBlendshapes:[{categories:[
      {categoryName:'browInnerUp',score:.74},
      {categoryName:'mouthSmileRight',score:.86},
      {categoryName:'eyeBlinkLeft',score:.63}
    ]}]
  });
  assert.equal(result.landmarks?.length,264);
  assert.equal(result.blendshapes?.browInnerUp,.74);
  assert.equal(result.blendshapes?.mouthSmileRight,.86);
  const fresh=freshFaceSignals(result.blendshapes,1230,result.landmarks,30,1250);
  assert.equal(fresh.blendshapes?.eyeBlinkLeft,.63);
  assert.equal(fresh.landmarks,undefined,'expired mesh must not erase fresh blendshapes');
  const expired=freshFaceSignals(result.blendshapes,1230,result.landmarks,30,2000);
  assert.equal(expired.blendshapes,undefined);
  assert.equal(expired.landmarks,undefined);
  const mapped=facialFromBlendshapes(fresh.blendshapes!);
  assert(mapped.browLeft>.25&&mapped.smileRight>.8&&mapped.blinkLeft>.6);
});

test('preview retains captured eye focus unless the animator explicitly overrides it',()=>{
  const captured={x:-.72,y:.28};
  const override={x:.35,y:-.45};
  assert.deepEqual(resolvePreviewFocus(true,undefined,captured),captured);
  assert.deepEqual(resolvePreviewFocus(true,override,captured),override);
  assert.deepEqual(resolvePreviewFocus(false,override,captured),captured);
  assert.equal(resolvePreviewFocus(true,undefined,undefined),undefined);
});
function seatedFrame(time:number,noseX=.5,brow=.05,smile=0):CaptureFrame {
  const pose=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
  const set=(index:number,x:number,y:number)=>{pose[index]={x,y,visibility:1};};
  set(0,noseX,.25);set(2,.58,.29);set(5,.42,.29);
  set(11,.64,.44);set(12,.36,.44);set(13,.69,.54);set(14,.3,.54);
  set(15,.74,.66);set(16,.26,.66);
  // A seated actor's hips and legs are intentionally *not* visible.
  return {t:time,pose,face:{
    browInnerUp:brow,mouthSmileLeft:smile,mouthSmileRight:smile*.8,
    eyeBlinkLeft:brow>.7?.6:.02
  }};
}
test('one seated take preserves live gestures, glance, brow, dropout and spoken tail',()=>{
  let previous:PerformanceKey|undefined;
  const seen=(elapsed:number,noseX:number,brow:number,hand:'open'|'point'|'fist',smile=0)=>{
    const raw=retargetCaptureFrame(seatedFrame(1000+elapsed,noseX,brow,smile));
    assert(raw);
    const key={...raw,hands:{left:'relaxed' as const,right:hand}};
    const filtered=smoothLivePerformance(previous,key,.2);
    previous=filtered;
    return {elapsed,sample:filtered} satisfies ResolvedObservation;
  };
  const observations:ResolvedObservation[]=[
    {elapsed:0},
    seen(.72,.5,.12,'open'),
    seen(1.1,.56,.2,'point'),
    seen(1.38,.54,.9,'point',.4),
    {elapsed:1.56},
    {elapsed:1.86}
  ];
  // A reacquired pose must start a new filter segment, not interpolate
  // the unobserved interval as a continuous gesture.
  previous=undefined;
  observations.push(seen(2.15,.51,.4,'open'),seen(2.52,.49,.1,'fist'));
  const duration=3.35; // Recording/voice continues after last visible pose.
  observations.push({elapsed:3.35});
  const compiled=compileResolvedPerformance(observations,duration);
  assert.equal(compiled.duration,duration,'motion duration follows Record to Stop');
  assert.equal(compiled.framesAccepted,5);
  assert(compiled.framesDropped>=3);
  assert.equal(compiled.keys[0].presence,0,'late initial lock is an explicit gap');
  assert(compiled.keys.some(k=>k.presence===0&&k.time>.4&&k.time<.7));
  assert.equal(samplePerformance(compiled.keys,1.75/duration).presence,0);
  assert.equal(samplePerformance(compiled.keys,.95).presence,0,'trailing audio has no invented movement');
  const glanced=samplePerformance(compiled.keys,1.1/duration);
  assert(Math.abs(glanced.focus?.x??0)>.15);
  assert.equal(glanced.hands?.right,'point');
  const raised=samplePerformance(compiled.keys,1.38/duration);
  assert((raised.facial?.browLeft??0)>.25,'brow accent must survive key reduction');

  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const clip:Extract<Clip,{track:'performance'}>={
    id:'seated-mocap',track:'performance',actor:actor.id,name:'Seated scene',
    start:0,length:compiled.duration,performanceOrigin:'mocap',performance:compiled.keys
  };
  const speech:Extract<Clip,{track:'dialogue'}>={
    id:'spoken-line',track:'dialogue',actor:actor.id,
    start:0,length:duration,asset:'asset:seated-voice',
    text:'You really think I did that?',volume:1,muted:false,offset:0,
    visemes:[{start:2.85,end:3.22,shape:'round'}]
  };
  const local={...scene,clips:[clip,speech]};
  const doc=ProjectDocument.parse({...project,scenes:[local,...project.scenes.slice(1)]});
  const characters=new Map(doc.characters.map(c=>[c.id,c]));
  const tracked=evaluate(doc.scenes[0],1.1,characters).actors.find(a=>a.id===actor.id);
  assert(tracked?.capturedFocus,'saved timeline keeps the same glance as live');
  assert(tracked.handOverride);
  const missing=evaluate(doc.scenes[0],1.75,characters).actors.find(a=>a.id===actor.id);
  assert.equal(missing?.facialCapture,undefined,'tracking gap releases facial ownership');
  assert.equal(missing?.capturedFocus,undefined,'tracking gap releases captured gaze');
  const talking=evaluate(doc.scenes[0],3.0,characters).actors.find(a=>a.id===actor.id);
  assert(talking?.speaking,'dialogue remains active throughout the Record-to-Stop interval');
  assert.equal(talking?.viseme?.shape,'round');
});
test('key limiter retains hard tracker transitions while bounding a busy recording',()=>{
  const events:ResolvedObservation[]=[];
  for(let i=0;i<450;i++){
    const elapsed=i/30;
    events.push({elapsed,sample:i>190&&i<198?undefined:{
      time:elapsed,pose:{leftShoulder:Math.sin(i/9)*48,head:Math.sin(i/24)*14},
      focus:{x:Math.sin(i/40)*.5,y:0}
    }});
  }
  events.push({elapsed:15,sample:{time:15,pose:{}}});
  const compiled=compileResolvedPerformance(events,15);
  assert(compiled.keys.length<=240);
  assert(compiled.keys.some(k=>k.presence===0&&k.time>.35&&k.time<.48));
  assert.equal(compiled.keys[0].time,0);
  assert.equal(compiled.keys.at(-1)?.time,1);
});
