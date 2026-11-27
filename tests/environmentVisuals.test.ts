import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPerspective, EnvironmentVisual, lightAt, perspectiveScale, sampleVisual, inWalkable } from '../src/engine/environmentVisuals.ts';
import { makeRevenentDemo } from '../src/engine/revenentDemo.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { renderDepth } from '../src/engine/cameraTransform.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import { makeProject } from '../src/engine/presets.ts';
const visual={version:1 as const,quality:'balanced' as const,lighting:{enabled:true,ambient:'#333355',intensity:.5,shadow:'#101020',shadowOpacity:.3,lights:[{id:'warm',x:400,y:200,color:'#ff9900',intensity:.7,radius:200,falloff:2}]}};
test('perspective matches calibration, clamps outside the ground plane and has safe disabled defaults',()=>{
  assert.equal(perspectiveScale(defaultPerspective.nearY,defaultPerspective),1);
  assert(Math.abs(perspectiveScale(defaultPerspective.farY,defaultPerspective)-.28)<1e-8);
  assert.equal(perspectiveScale(-10000,defaultPerspective),.15);
  assert.equal(perspectiveScale(10000,defaultPerspective),1.8);
  assert.equal(perspectiveScale(220,{...defaultPerspective,enabled:false}),1);assert.equal(perspectiveScale(100),1);
  assert.equal(EnvironmentVisual.safeParse({version:1,quality:'eco',perspective:{...defaultPerspective,farY:480}}).success,false);
});
test('ambient multiplication, smooth local falloff and disabled lighting are deterministic',()=>{
  assert.equal(lightAt(0,0),0xffffff);
  assert.equal(lightAt(0,0,{...visual,lighting:{...visual.lighting,enabled:false}}),0xffffff);
  const near=lightAt(400,200,visual),mid=lightAt(500,200,visual),far=lightAt(700,200,visual);
  assert((near>>16)>(mid>>16));assert((mid>>16)>(far>>16));assert.equal(lightAt(700,200,visual),lightAt(1000,200,visual));
  assert.equal(lightAt(400,200,visual,2),near);
});
test('animated local light sampling is independent of prior rendered frames',()=>{
  const settings=structuredClone(visual);Object.assign(settings.lighting.lights[0],{keys:[{time:0,x:0,y:200,intensity:0},{time:10,x:400,y:200,intensity:1}]});
  const a=lightAt(400,200,settings,8);lightAt(400,200,settings,1);assert.equal(lightAt(400,200,settings,8),a);
});
test('scale keys multiply base and perspective without moving the ground anchor',()=>{
  const entity={scale:2,depth:0,x:50,y:480,visual:{keys:[{time:0,scale:1,opacity:1,depth:0},{time:10,scale:2,opacity:0,depth:4}]}};
  const middle=sampleVisual(entity,5,480,defaultPerspective);assert.equal(middle.scale,3);assert.equal(middle.x,50);assert.equal(middle.y,480);assert.equal(middle.visual?.opacity,.5);assert.equal(middle.depth,2);
  assert.equal(sampleVisual({...entity,visual:{perspective:false}},5,270,defaultPerspective).scale,2);
});
test('scale and light keys reject duplicate or unordered times',()=>{
  const p=makeProject(false);p.scenes[0].actors=[{id:'a',characterId:p.characters[0].id,x:480,y:420,scale:1,rotation:0,depth:0,view:'front',flip:false,expression:'neutral',visual:{keys:[{time:2,scale:1},{time:1,scale:2}]}}];
  assert.equal(ProjectDocument.safeParse(p).success,false);
});
test('Revenent gets smaller, walks behind the car and emerges using actual foot depth',()=>{
  const p=makeRevenentDemo(),scene=p.scenes[0],map=new Map(p.characters.map(c=>[c.id,c]));
  const near=evaluate(scene,0,map),behind=evaluate(scene,5.5,map),away=evaluate(scene,10.5,map);
  assert(near.actors[0].scale>behind.actors[0].scale);
  assert(renderDepth(near.actors[0].depth,near.actors[0].y)>renderDepth(near.objects[0].depth,near.objects[0].y));
  assert(renderDepth(behind.actors[0].depth,behind.actors[0].y)<renderDepth(behind.objects[0].depth,behind.objects[0].y));
  assert(away.actors[0].x>away.objects[0].x+150);
  assert.deepEqual(evaluate(scene,5.5,map),behind);
});
test('walkable polygons warn for out-of-region ground positions without moving actors',()=>{
  const polygon=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  assert(inWalkable({x:50,y:50},polygon));assert(!inWalkable({x:101,y:50},polygon));assert(inWalkable({x:-1,y:-1}));
});
