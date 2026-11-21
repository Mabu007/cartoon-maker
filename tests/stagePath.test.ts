import assert from 'node:assert/strict';
import test from 'node:test';
import { addSceneActor, setActorVisibleAt } from '../src/engine/actorPresence.ts';
import { evaluate, movementPosition } from '../src/engine/evaluate.ts';
import { makeScene } from '../src/engine/presets.ts';
import { TimelineClip, type Clip } from '../src/engine/schema.ts';
import { stagePath } from '../src/engine/stagePath.ts';

test('entrances follow waypoints in both directions and exit cues hide at the endpoint', () => {
  const {scene,actorId}=addSceneActor({...makeScene(),duration:20},'test-character',1,'place');
  const entrance=stagePath(scene,actorId,1,[{x:-75,y:430},{x:185,y:430},{x:55,y:410}],'run','tsotsi','enter');
  const {clip}=entrance;
  assert.equal(TimelineClip.safeParse(clip).success,true);
  assert.equal(evaluate(entrance.scene,.9).actors[0].visible,false);
  assert.equal(evaluate(entrance.scene,1).actors[0].visible,true);
  assert.deepEqual(movementPosition(clip,clip.keyframes![1].time),{x:185,y:430});
  assert.notEqual(evaluate(entrance.scene,1.1).actors[0].flip,evaluate(entrance.scene,clip.start+clip.length-.1).actors[0].flip);
  const exit=stagePath(entrance.scene,actorId,6,[{x:55,y:410},{x:-90,y:420}],'walk','natural','exit');
  assert.equal(evaluate(exit.scene,exit.clip.start+.05).actors[0].visible,true);
  assert.equal(evaluate(exit.scene,exit.clip.start+exit.clip.length+.05).actors[0].visible,false);
  assert.throws(()=>stagePath(entrance.scene,actorId,1.1,[{x:55,y:410},{x:90,y:420}],'walk','natural','move'),/already moving/);
});

test('a recovered actor can start a walk immediately and locked movement rejects changes', () => {
  const {scene,actorId}=addSceneActor(makeScene(),'test-character',0,'place');
  const visible=setActorVisibleAt(setActorVisibleAt(scene,actorId,0,false),actorId,1,true);
  const recovery:Clip={id:'fixed',track:'movement',actor:actorId,start:1,length:.1,fromX:450,fromY:410,toX:450,toY:410};
  const recovered={...visible,clips:[...visible.clips,recovery]};
  const result=stagePath(recovered,actorId,1,[{x:450,y:410},{x:650,y:410}],'walk','kid','move');
  const actor=evaluate(result.scene,1.5).actors[0];
  assert(actor.visible && actor.x>450 && actor.gaitStyle==='kid');
  assert.throws(()=>stagePath({...recovered,trackSettings:{movement:{locked:true}}},actorId,1,[{x:450,y:410},{x:650,y:410}],'walk','kid','move'),/Unlock Movement/);
});
