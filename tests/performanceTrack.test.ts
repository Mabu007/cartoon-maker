import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument, tracks, trackNames, type Clip } from '../src/engine/schema.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { splitTimelineClips, trimTimelineClip, resizeSceneTimeline } from '../src/engine/timelineEditing.ts';
import { facialFromBlendshapes } from '../src/engine/facialIntelligence.ts';

const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0].id;
const facial=facialFromBlendshapes({mouthSmileLeft:.8,mouthSmileRight:.65,eyeBlinkLeft:.2});
const take:Extract<Clip,{track:'performance'}>={
  id:'webcam-performance-take',track:'performance',actor,name:'Zee — nervous laugh',
  start:2,length:2,performanceOrigin:'mocap',
  performance:[
    {time:0,pose:{head:4,torso:3,leftShoulder:10,rightShoulder:14},hands:{left:'relaxed',right:'open'},facial},
    {time:1,pose:{head:16,torso:-5,leftShoulder:22,rightShoulder:28},hands:{left:'loose-open',right:'point'},facial}
  ]
};
const withTake={...scene,clips:[...scene.clips,take]};

test('dedicated Performance track is part of the canonical schema and remains visible',()=>{
  assert(tracks.includes('performance'));
  assert.equal(trackNames.performance,'Performance');
  const parsed=ProjectDocument.parse({...project,scenes:[withTake,...project.scenes.slice(1)]});
  const clip=parsed.scenes[0].clips.find(item=>item.id===take.id);
  assert.equal(clip?.track,'performance');
  assert.equal(clip?.track==='performance'&&clip.name,'Zee — nervous laugh');
});
test('performance take drives body, hands and continuous facial controls in playback',()=>{
  const parsed=ProjectDocument.parse({...project,scenes:[withTake,...project.scenes.slice(1)]});
  const frame=evaluate(parsed.scenes[0],3,new Map(parsed.characters.map(c=>[c.id,c])));
  const state=frame.actors.find(item=>item.id===actor);
  assert(state);
  assert.equal(state.facialCapture?.controls.smileLeft,facial.smileLeft);
  assert.equal(state.handOverride?.right,'point');
  assert.equal(state.pose.head,10);
});
test('performance clips trim and split with their original motion preserved',()=>{
  const split=splitTimelineClips(withTake,[take.id],3);
  const left=split.scene.clips.find(item=>item.id===take.id);
  const right=split.scene.clips.find(item=>item.id===split.added[0]);
  assert(left?.track==='performance'&&right?.track==='performance');
  if(left?.track==='performance'&&right?.track==='performance'){
    assert.equal(left.performance[0].time,0);
    assert.equal(left.performance.at(-1)?.time,1);
    assert.equal(right.performance[0].time,0);
    assert.equal(right.performance.at(-1)?.time,1);
    assert.deepEqual(left.performance.at(-1)?.pose,right.performance[0]?.pose);
    assert.equal(right.name,take.name);
  }
  const trimmed=trimTimelineClip(withTake,take.id,'out',3.5).clips.find(item=>item.id===take.id);
  assert(trimmed?.track==='performance');
  if(trimmed?.track==='performance'){
    assert.equal(trimmed.length,1.5);
    assert.equal(trimmed.performance[0].time,0);
    assert.equal(trimmed.performance.at(-1)?.time,1);
  }
});
test('performance track mute and lock settings behave like other timeline tracks',()=>{
  const parsed=ProjectDocument.parse({...project,scenes:[withTake,...project.scenes.slice(1)]});
  const muted=evaluate({...parsed.scenes[0],trackSettings:{performance:{muted:true}}},3);
  const audible=evaluate(parsed.scenes[0],3);
  assert.equal(muted.actors[0].facialCapture,undefined);
  assert(audible.actors[0].facialCapture);
  assert.throws(()=>trimTimelineClip({...withTake,trackSettings:{performance:{locked:true}}},take.id,'out',3.5),/Unlock/);
});
test('shortening a scene retimes a webcam take rather than dropping its last poses',()=>{
  const shortened=resizeSceneTimeline({...withTake,duration:4},3);
  const clip=shortened.clips.find(item=>item.id===take.id);
  assert(clip?.track==='performance');
  if(clip?.track==='performance'){
    assert.equal(clip.length,1);
    assert.equal(clip.performance[0].time,0);
    assert.equal(clip.performance.at(-1)?.time,1);
  }
});
