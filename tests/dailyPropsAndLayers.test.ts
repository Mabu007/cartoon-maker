import assert from 'node:assert/strict';
import test from 'node:test';
import { addSceneActor } from '../src/engine/actorPresence.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { characters, makeProp, makeScene } from '../src/engine/presets.ts';
import { compatibleObjects, removeObjectWithDecisions } from '../src/engine/interactions.ts';
import { moveLayer, nextLayerDepth, orderedLayers } from '../src/engine/sceneLayers.ts';
import { SceneDefinition, type Clip } from '../src/engine/schema.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';

const cast=new Map(characters.map(character=>[character.id,character]));
const placed=addSceneActor(makeScene('Living room',false),characters[0].id,0);
const chair=makeProp('chair'), cup=makeProp('cup'), ball=makeProp('ball');
const scene={...placed.scene,objects:[chair,cup,ball]};
const body=(action:Extract<Clip,{track:'body'}>['action'],start:number,length:number,target?:string):Extract<Clip,{track:'body'}>=>
  ({id:action,layer:action==='drink'||action==='throw-prop'?'gesture':'body',track:'body',actor:placed.actorId,action,start,length,...(target?{target}:{})});

test('a relative layer move puts an actor or prop immediately next to the selected reference',()=>{
  const next=moveLayer(scene,ball.id,{reference:placed.actorId,side:'ahead'});
  const layers=orderedLayers(next);
  const index=layers.findIndex(item=>item.id===placed.actorId);
  assert.equal(layers[index+1].id,ball.id);
  const below=moveLayer(next,ball.id,{reference:chair.id,side:'behind'});
  const changedY=new Map([[ball.id,3000],[chair.id,-2000],[placed.actorId,-1500]]);
  const order=orderedLayers(below,changedY).map(item=>item.id);
  assert.equal(order.indexOf(ball.id),order.indexOf(chair.id)-1);
  assert.equal(nextLayerDepth(below),4);
  assert.equal(SceneDefinition.safeParse(below).success,true);
});

test('seated sleep closes eyes, keeps the actor position and survives removing the seat',()=>{
  const setup={...scene,clips:[body('sleep-seated',1,6,chair.id)]};
  const frame=evaluate(setup,2,cast).actors[0];
  assert.equal(frame.sitting,true);
  assert.equal(frame.seat,chair.id);
  assert.equal(frame.y,scene.actors[0].y);
  assert.equal(facialPerformance(2,frame.id,frame.action,frame.expression).blink,1);
  const removed=removeObjectWithDecisions(setup,chair.id);
  assert.equal(evaluate(removed,2,cast).actors[0].action,'sleep-seated');
  assert.deepEqual(compatibleObjects(scene,'drink').map(prop=>prop.id),[cup.id]);
});

test('a timed prop can be picked up, thrown, saved at the landing point and put down near the actor later',()=>{
  const setup={...scene,clips:[
    body('pick-up',1,1,ball.id),
    {...body('throw-prop',4,2,ball.id),pointAt:{x:730,y:425}},
    body('put-down',8,1,ball.id)
  ]};
  assert.equal(evaluate(setup,1.25,cast).actors[0].held,undefined);
  assert.equal(evaluate(setup,3,cast).actors[0].held?.id,ball.id);
  assert.equal(evaluate(setup,4.5,cast).actors[0].held?.id,ball.id);
  const airborne=evaluate(setup,5.55,cast);
  assert(!airborne.actors[0].held);
  assert(airborne.objects.find(prop=>prop.id===ball.id)!.y<400);
  const parked=evaluate(setup,6.75,cast).objects.find(prop=>prop.id===ball.id)!;
  assert.equal(parked.x,730);
  assert.equal(parked.y,425);
  const replaced=evaluate(setup,10.25,cast).objects.find(prop=>prop.id===ball.id)!;
  assert.equal(replaced.y,scene.actors[0].y);
  assert(Math.abs(replaced.x-scene.actors[0].x)<40);
});
