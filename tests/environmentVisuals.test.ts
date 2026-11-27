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
test('canvas ground handles preserve calibration order and bounds',async()=>{
  const {moveEnvironmentHandle}=await import('../src/engine/environmentEditing.ts');
  const source={version:1 as const,quality:'balanced' as const,perspective:defaultPerspective};
  const a=moveEnvironmentHandle(source,{kind:'horizon'},{x:0,y:1000},0);assert(a.perspective!.horizon<a.perspective!.farY);
  const b=moveEnvironmentHandle(source,{kind:'nearY'},{x:0,y:0},0);assert(b.perspective!.nearY>b.perspective!.farY);
  const c=moveEnvironmentHandle(source,{kind:'farY'},{x:0,y:-500},0);assert(c.perspective!.farY>c.perspective!.horizon);assert.equal(source.perspective.nearY,480);
});
test('dragging an animated light keys the current playhead and retains earlier motion',async()=>{
  const {moveEnvironmentHandle}=await import('../src/engine/environmentEditing.ts');
  const source={...visual,lighting:{...visual.lighting,lights:[{...visual.lighting.lights[0],keys:[{time:0,x:10,y:20,intensity:0},{time:10,x:100,y:200,intensity:1}]}]}};
  const result=moveEnvironmentHandle(source,{kind:'light',id:'warm'},{x:350,y:230},5);
  assert.equal(result.lighting!.lights[0].keys!.length,3);assert.equal(result.lighting!.lights[0].keys![1].intensity,.5);assert.equal(result.lighting!.lights[0].keys![1].x,350);assert.deepEqual(source.lighting.lights[0].keys[0],{time:0,x:10,y:20,intensity:0});
});
test('optional perspective retiming moves quickly near camera and slows toward depth while preserving endpoints',async()=>{
  const {movementPosition}=await import('../src/engine/evaluate.ts');
  const clip={id:'depth',track:'movement' as const,actor:'a',start:0,length:10,fromX:100,fromY:480,toX:800,toY:270};
  const p={...defaultPerspective,retimeMovement:true};
  assert.deepEqual(movementPosition(clip,0,p),{x:100,y:480});assert.deepEqual(movementPosition(clip,1,p),{x:800,y:270});
  assert(movementPosition(clip,.5,p).x>movementPosition(clip,.5).x);
  const nearSpeed=movementPosition(clip,.3,p).x-movementPosition(clip,.2,p).x,farSpeed=movementPosition(clip,.8,p).x-movementPosition(clip,.7,p).x;
  assert(nearSpeed>farSpeed);const again=movementPosition(clip,.5,p);movementPosition(clip,.9,p);assert.deepEqual(movementPosition(clip,.5,p),again);
  const horizontal={...clip,toY:480};assert(Math.abs(movementPosition(horizontal,.4,p).x-movementPosition(horizontal,.4).x)<1e-6);
});
test('perspective walking opt-out retains authored movement and frame/gait evaluation share the same path',async()=>{
  const p=makeRevenentDemo(),scene=p.scenes[0],at=4,frame=evaluate(scene,at,new Map(p.characters.map(c=>[c.id,c]))),move=scene.clips.find(c=>c.track==='movement')!;
  const {movementPosition}=await import('../src/engine/evaluate.ts');if(move.track!=='movement')throw Error('Missing demo path');
  const expected=movementPosition(move,(at-move.start)/move.length,scene.visual!.perspective);assert.equal(frame.actors[0].x,expected.x);assert.equal(frame.actors[0].y,expected.y);
  scene.actors[0].visual={perspective:false};const flat=evaluate(scene,at);assert.equal(flat.actors[0].x,movementPosition(move,(at-move.start)/move.length).x);assert.equal(flat.actors[0].scale,1);
});
