import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { livePerformanceScene, LIVE_PREVIEW_TIME, smoothLivePerformance } from '../src/engine/livePerformanceScene.ts';
import { facialFromBlendshapes } from '../src/engine/facialIntelligence.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { ProjectDocument } from '../src/engine/schema.ts';

test('live puppeteering uses the exact saved Performance clip and character rig',()=>{
  const project=makeProject(true);
  const scene=project.scenes[0],actor=scene.actors[0];
  const face=facialFromBlendshapes({eyeBlinkLeft:.82,mouthSmileRight:.72});
  const live=livePerformanceScene(scene,actor.id,{
    time:4,pose:{head:13,rightShoulder:21,leftElbow:-27,torso:8},
    hands:{left:'open',right:'point'},facial:face,expression:'happy'
  });
  assert.equal(live.actors.length,1);
  assert.equal(live.actors[0].characterId,actor.characterId);
  assert.equal(live.clips.length,1);
  assert.equal(live.clips[0].track,'performance');
  const parsed=ProjectDocument.parse({...project,scenes:[live]});
  const view=evaluate(parsed.scenes[0],LIVE_PREVIEW_TIME,new Map(project.characters.map(c=>[c.id,c])));
  const state=view.actors[0];
  assert(state.facialCapture);
  assert.equal(state.facialCapture.controls.blinkLeft,face.blinkLeft);
  assert.equal(state.handOverride?.right,'point');
  assert(state.pose.rightShoulder!==undefined);
  assert.equal(scene.actors.length,project.scenes[0].actors.length);
  assert(!scene.clips.some(c=>c.id==='__live-performance-preview'));
});
test('preview frame smoothing is pure, bounded and preserves discrete hand gestures',()=>{
  const first={time:0,pose:{head:-25,torso:12,rightShoulder:20},hands:{left:'open' as const,right:'relaxed' as const}};
  const second={time:1,pose:{head:25,torso:-12,rightShoulder:-20},hands:{left:'point' as const,right:'fist' as const}};
  const smoothed=smoothLivePerformance(first,second,.8);
  assert(smoothed.pose.head!<25&&smoothed.pose.head!>-25);
  assert.equal(smoothed.hands?.right,'fist');
  assert.deepEqual(first.pose,{head:-25,torso:12,rightShoulder:20});
  assert.deepEqual(smoothLivePerformance(undefined,second,.8),second);
});
test('preview avoids rendering other actors, timelines and user media into its scene',()=>{
  const project=makeProject(true),scene=project.scenes[0];
  const live=livePerformanceScene(scene,scene.actors[0].id);
  assert.equal(live.actors.length,1);
  assert.deepEqual(live.clips,[]);
  assert.deepEqual(live.objects,[]);
  assert.equal(live.backgroundImage,undefined);
  assert.equal(live.trackSettings,undefined);
  assert.equal(live.actors[0].gazeTarget,'camera');
  assert.throws(()=>livePerformanceScene(scene,'missing-actor'),/Select an actor/);
});
