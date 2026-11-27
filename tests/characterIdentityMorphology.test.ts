import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterDefinition,views} from '../src/engine/schema.ts';
import {characters} from '../src/engine/presets.ts';
import {applyProfile,studioCharacters} from '../src/engine/visualPresets.ts';
import {bodyProfiles} from '../src/engine/visualAssets.ts';
import {rig,seatedLeg} from '../src/engine/animation.ts';
import {visualRigAnchors} from '../src/engine/visualRig.ts';
import {bodyProportions} from '../src/engine/bodyBuild.ts';
import {limbArtwork,morphLimbArtwork,anatomicalSegments} from '../src/engine/anatomicalVectorArt.ts';
import {characterIdentity,exportCharacterIdentity,importCharacterIdentity,duplicateCharacterIdentity,randomizeCharacterIdentity,setIdentityLock} from '../src/engine/characterIdentity.ts';
test('legacy identity stays absent; explicit export, import and duplicate preserve canonical record',()=>{
  const old=characters[0];assert.deepEqual(CharacterDefinition.parse(old),old);
  const locked=setIdentityLock(studioCharacters[0],'face',true);
  const randomized=randomizeCharacterIdentity(locked,420);
  assert.deepEqual(randomized,randomizeCharacterIdentity(locked,420));
  assert.equal(randomized.shape,locked.shape);assert.equal(randomized.nose,locked.nose);
  assert.notEqual(randomized.height,randomizeCharacterIdentity(locked,421).height);
  assert.equal(characterIdentity(randomized).seed,420);
  assert.deepEqual(importCharacterIdentity(exportCharacterIdentity(randomized),randomized.id),randomized);
  assert.deepEqual(importCharacterIdentity(JSON.stringify(old),old.id),old);
  const duplicate=duplicateCharacterIdentity(randomized,'copy');
  assert.equal(duplicate.id,'copy');assert.deepEqual(duplicate.identity,randomized.identity);assert.deepEqual(duplicate.visual,randomized.visual);
  assert.throws(()=>importCharacterIdentity(JSON.stringify({format:'sirvibe-character',version:99,character:old}),old.id));
});
test('new profiles and bounded body extremes retain finite connected five-view rig',()=>{
  for(const profile of bodyProfiles){
    const base=applyProfile(studioCharacters[0],profile);
    for(const v of [.8,1,1.2]){
      const c=CharacterDefinition.parse({...base,visual:{...base.visual!,shoulders:v,waist:v,hips:v,abdomen:v}});
      for(const view of views){
        const a=visualRigAnchors(c,view);
        for(const point of Object.values(a))assert(Number.isFinite(point.x)&&Number.isFinite(point.y));
        const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
        assert(Math.abs(dist(a.leftShoulder,a.leftElbow)-28*c.arms)<1e-8);
        assert(Math.abs(dist(a.leftElbow,a.leftWrist)-28*c.arms)<1e-8);
        assert(Math.abs(dist(a.leftHip,a.leftKnee)-38*c.legs*c.height)<1e-8);
        assert(Math.abs(dist(a.leftKnee,a.leftAnkle)-38*c.legs*c.height)<1e-8);
        const [knee,foot]=seatedLeg(a.leftHip,c.legs*c.height,20,'left');assert(Number.isFinite(knee.x+foot.y));
      }
    }
  }
  const lean=applyProfile(studioCharacters[0],'lean'),heavy=applyProfile(studioCharacters[0],'heavyset');
  assert(bodyProportions(heavy).waist>bodyProportions(lean).waist);
  assert(bodyProportions({...lean,visual:{...lean.visual!,abdomen:1.3}}).bell>bodyProportions(lean).bell);
});
test('morphological control points change real contour geometry without shifting bone frame',()=>{
  const m={wristWidth:1.15,kneeWidth:.85,ankleWidth:1.15,muscleDefinition:1,softness:.9};
  for(const region of ['upper-arm','forearm','thigh','calf'] as const){
    const before=limbArtwork[region],after=morphLimbArtwork(region,m);
    assert.equal(morphLimbArtwork(region),before);assert.equal(morphLimbArtwork(region,m),after);
    assert.notEqual(after.outline,before.outline);assert(!/NaN|Infinity/.test(after.outline));
    assert.equal(after.outline.match(/[MLQCZ]/g)?.join(''),before.outline.match(/[MLQCZ]/g)?.join(''));
  }
  const joints=[{x:0,y:0},{x:10,y:20},{x:30,y:40}];
  assert.deepEqual(anatomicalSegments(joints,10,'upper-arm',m).map(s=>s.frame),anatomicalSegments(joints,10,'upper-arm').map(s=>s.frame));
});
