import test from 'node:test';
import assert from 'node:assert/strict';
import {Graphics} from 'pixi.js';
import {studioCharacters} from '../src/engine/visualPresets.ts';
import {studioBoneFrame} from '../src/engine/studioLimbArt.ts';
import {makeProject} from '../src/engine/presets.ts';
import {ProjectDocument,views} from '../src/engine/schema.ts';
import {visualRigAnchors} from '../src/engine/visualRig.ts';
import {at,drawShoe} from '../src/engine/wardrobeArt.ts';

test('native studio prototypes are editable, schema-valid and retain five-view rig anchors',()=>{
 const p=makeProject(false);
 for(const character of studioCharacters){
  assert.equal(character.visual?.style,'illustrated');
  assert(!character.visual?.components?.length);
  assert(ProjectDocument.safeParse({...p,characters:[character]}).success);
  for(const view of views){
   const anchors=visualRigAnchors(character,view);
   for(const point of Object.values(anchors))assert(Number.isFinite(point.x)&&Number.isFinite(point.y));
  }
 }
});

test('Studio Sbu boots keep stable bounds under repeated foot-size transforms',()=>{
 const [sbu]=studioCharacters;
 const graphics=new Graphics(),foot={x:8,y:-3},scale=sbu.visual!.footSize!;
 function draw(toe:number){
  graphics.clear();
  graphics.context.save().setTransform(at(foot.x*(1-scale),foot.y*(1-scale),scale));
  drawShoe(graphics,sbu,foot,toe);
  graphics.context.restore();
  const {x,y,width,height}=graphics.context.bounds.rectangle;
  return {x,y,width,height};
 }
 const right=draw(1),left=draw(-1);
 assert(right.width<40&&right.height<35);
 assert(left.width<40&&left.height<35);
 for(let frame=0;frame<12;frame++){
  assert.deepEqual(draw(1),right);
  assert.deepEqual(draw(-1),left);
 }
});
test('studio bone frame maps exact endpoints without changing width when the rig turns',()=>{
 for(const b of [{x:30,y:0},{x:0,y:30},{x:-30,y:0},{x:20,y:-20}]){
  const f=studioBoneFrame({x:0,y:0},b,12)!;
  assert.equal(f.width,12);
  assert(Math.abs(Math.cos(f.angle*Math.PI/180)*f.length-b.x)<1e-8);
  assert(Math.abs(Math.sin(f.angle*Math.PI/180)*f.length-b.y)<1e-8);
 }
 assert.equal(studioBoneFrame({x:0,y:0},{x:0,y:0},12),undefined);
});
