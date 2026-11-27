import test from 'node:test';
import assert from 'node:assert/strict';
import {anatomicalBoneFrame,anatomicalSegments,limbArtwork} from '../src/engine/anatomicalVectorArt.ts';
import {CharacterVisual} from '../src/engine/visualAssets.ts';
import {studioCharacters,applyProfile} from '../src/engine/visualPresets.ts';

test('native anatomy contours have distinct fixed closed SVG geometry',()=>{
  assert.equal(new Set(Object.values(limbArtwork).map(a=>a.outline)).size,4);
  for(const art of Object.values(limbArtwork))for(const path of Object.values(art)){
    assert(path.startsWith('M')&&path.endsWith('Z'));
    assert(!/NaN|Infinity/.test(path));
  }
});
test('bone frames retain endpoints, independent widths, and reject invalid input',()=>{
  for(const b of [{x:30,y:0},{x:0,y:30},{x:-30,y:0},{x:20,y:-20}]){
    const f=anatomicalBoneFrame({x:0,y:0},b,12)!;
    assert.equal(f.width,12);
    assert(Math.abs(Math.cos(f.angle*Math.PI/180)*f.length-b.x)<1e-8);
    assert(Math.abs(Math.sin(f.angle*Math.PI/180)*f.length-b.y)<1e-8);
  }
  assert.equal(anatomicalBoneFrame({x:0,y:0},{x:0,y:0},12),undefined);
  assert.equal(anatomicalBoneFrame({x:Infinity,y:0},{x:1,y:1},12),undefined);
  assert.equal(anatomicalBoneFrame({x:0,y:0},{x:1,y:1},0),undefined);
});
test('chain selects distinct anatomical regions while sharing the exact solved joint',()=>{
  const points=[{x:3,y:5},{x:15,y:30},{x:35,y:17}];
  for(const [upper,lower] of [['upper-arm','forearm'],['thigh','calf']] as const){
    const result=anatomicalSegments(points,10,upper);
    assert.deepEqual(result.map(s=>s.region),[upper,lower]);
    assert.equal(result[1].frame.x,points[1].x);
    assert.equal(result[1].frame.y,points[1].y);
    assert.equal(result[0].frame.width,10);
    assert(Math.abs(result[1].frame.width-8.3)<1e-8);
    assert.equal(result[0].art,limbArtwork[upper]);
  }
});
test('limb artwork is opt-in, schema validated, and survives profile edits',()=>{
  const legacy={version:1,style:'illustrated',profile:'average'};
  assert.equal(CharacterVisual.parse(legacy).limbArt,undefined);
  assert(!CharacterVisual.safeParse({...legacy,limbArt:'unknown'}).success);
  for(const c of studioCharacters){
    assert.equal(CharacterVisual.parse(c.visual).limbArt,'anatomical-v1');
    assert.equal(applyProfile(c,'slim').visual?.limbArt,'anatomical-v1');
  }
});
