import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRevenentDemo} from '../src/engine/revenentDemo.ts';
import {evaluate,movementPosition} from '../src/engine/evaluate.ts';
import {actorPositionAt,resolveHandInteractions} from '../src/engine/objectInteractionEngine.ts';
import {makeProp} from '../src/engine/presets.ts';
import type {Clip} from '../src/engine/schema.ts';

test('prop custody and rendered actor position agree with perspective retiming and opt-out',()=>{
  const project=makeRevenentDemo(),scene=project.scenes[0];
  const actor=scene.actors[0],move=scene.clips.find((c):c is Extract<Clip,{track:'movement'}>=>c.track==='movement'&&c.actor===actor.id)!;
  assert(move);
  scene.visual!.perspective!.retimeMovement=true;
  const t=move.start+move.length*.5;
  const position=movementPosition(move,.5,scene.visual!.perspective);
  assert.deepEqual(actorPositionAt(scene,actor.id,t),position);
  const frame=evaluate(scene,t).actors.find(a=>a.id===actor.id)!;
  assert.equal(frame.x,position.x);assert.equal(frame.y,position.y);
  const prop={...makeProp('cup'),x:position.x,y:position.y};
  scene.objects=[prop];
  scene.clips=[move,{id:'equip-depth',track:'props',actor:actor.id,target:prop.id,interaction:'equip',start:t,length:.5} as Clip];
  assert.equal(resolveHandInteractions(scene,t).owned.get(prop.id)?.actor,actor.id);
  actor.visual={...actor.visual,perspective:false};
  assert.deepEqual(actorPositionAt(scene,actor.id,t),movementPosition(move,.5));
});
