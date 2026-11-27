import assert from 'node:assert/strict';
import test from 'node:test';
import {compileHeadRig,deformFaceLandmarks} from '../src/engine/faceIdentityGeometry.ts';
import {sampleHeadDeformation} from '../src/engine/headDeformation.ts';
import {CharacterDefinition} from '../src/engine/schema.ts';
import {viewArt} from '../src/engine/visualFrame.ts';
import {flagshipCharacters} from '../src/engine/visualPresets.ts';

const front=viewArt.front;

test('the catalog head fit is immutable, palette independent, and uses saved semantic offsets',()=>{
 const [sbu,zee]=flagshipCharacters;
 const compiled=compileHeadRig(sbu,front);
 assert(Object.isFrozen(compiled.handles));
 assert(Object.isFrozen(compiled.handles.nose));
 assert.equal(compileHeadRig({...sbu,skin:'#fff0aa'},front),compiled);
 assert.notEqual(compileHeadRig(zee,front),compiled);
 const calibrated=CharacterDefinition.parse({...sbu,visual:{...sbu.visual!,headRig:{
  version:1,family:'catalog-head-v1',handles:{nose:{x:3,y:-2},'left-eye':{x:-2,y:3}}
 }}});
 const neutral={yaw:0,pitch:0};
 const rest=deformFaceLandmarks(sbu,front,neutral),fitted=deformFaceLandmarks(calibrated,front,neutral);
 assert.equal(fitted.noseX-rest.noseX,3);
 assert.equal(fitted.noseY-rest.noseY,-2);
 assert.equal(fitted.eyes[0].y-rest.eyes[0].y,3);
 assert.equal(fitted.eyes[1].y,rest.eyes[1].y);
 assert.notEqual(compileHeadRig(calibrated,front),compiled);
 assert.deepEqual(CharacterDefinition.parse(JSON.parse(JSON.stringify(calibrated))),calibrated);
});

test('limited capture and rehearsal angles leave profile and rear art on their authored views',()=>{
 for(const character of flagshipCharacters){
  const neutral=sampleHeadDeformation(character,'front',0)!;
  const left=sampleHeadDeformation(character,'front',1)!;
  const right=sampleHeadDeformation(character,'front',-1)!;
  const poses=[left,neutral,right].map(input=>deformFaceLandmarks(character,front,input));
  assert(poses[0].noseX<poses[1].noseX&&poses[1].noseX<poses[2].noseX);
  assert(poses[0].eyes[0].width<poses[0].eyes[1].width);
  assert(poses[2].eyes[1].width<poses[2].eyes[0].width);
  const rehearsal={yaw:99,pitch:-99,roll:9};
  assert.deepEqual(sampleHeadDeformation(character,'front',.7,rehearsal),{yaw:1,pitch:-1});
  for(const view of ['side','back-quarter','back'] as const)assert.equal(sampleHeadDeformation(character,view,.7,rehearsal),undefined);
 }
});
