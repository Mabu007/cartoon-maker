import test from 'node:test';
import assert from 'node:assert/strict';
import {studioCharacters} from '../src/engine/visualPresets.ts';
import {studioBoneFrame} from '../src/engine/studioLimbArt.ts';
import {makeProject} from '../src/engine/presets.ts';
import {ProjectDocument,views} from '../src/engine/schema.ts';
import {visualRigAnchors} from '../src/engine/visualRig.ts';

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
test('studio bone frame maps exact endpoints without changing width when the rig turns',()=>{
 for(const b of [{x:30,y:0},{x:0,y:30},{x:-30,y:0},{x:20,y:-20}]){
  const f=studioBoneFrame({x:0,y:0},b,12)!;
  assert.equal(f.width,12);
  assert(Math.abs(Math.cos(f.angle*Math.PI/180)*f.length-b.x)<1e-8);
  assert(Math.abs(Math.sin(f.angle*Math.PI/180)*f.length-b.y)<1e-8);
 }
 assert.equal(studioBoneFrame({x:0,y:0},{x:0,y:0},12),undefined);
});
