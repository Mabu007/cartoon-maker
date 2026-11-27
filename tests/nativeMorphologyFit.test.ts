import test from 'node:test';
import assert from 'node:assert/strict';
import {characters} from '../src/engine/presets.ts';
import {CharacterVisual,NativeVectorComponent} from '../src/engine/visualAssets.ts';
import {forearmVectorFixture} from '../src/engine/vectorArtworkFixture.ts';
import {nativeBoneFor,fixedVectorMatrix,nativePartFor} from '../src/engine/nativeVectorBone.ts';
test('opt-in imported native bone geometry fits morphology without mutating source or endpoints',()=>{
  const part=NativeVectorComponent.parse({id:'fit',slot:'forearm-left',view:'front',profiles:['average'],artwork:forearmVectorFixture,fitMorphology:'anatomical-v1'});
  const visual=CharacterVisual.parse({version:1,style:'illustrated',profile:'average',vectorComponents:[part],wristWidth:1.15,muscleDefinition:1});
  const c={...characters[0],visual},original=JSON.stringify(visual.vectorComponents![0]);
  const result=nativeBoneFor(c,'forearm-left','front')!;
  assert.notDeepEqual(result.artwork.regions[0].commands,part.artwork.regions[0].commands);
  assert.deepEqual(result.artwork.anchors,part.artwork.anchors);assert.equal(JSON.stringify(visual.vectorComponents![0]),original);
  assert.equal(nativeBoneFor({...c,nose:'long'},'forearm-left','front'),result);
});

test('fixed native components preserve authored pivot and facing selection',()=>{
  const part=NativeVectorComponent.parse({id:'head',slot:'head-base',view:'front',profiles:['average'],facing:'normal',artwork:{...forearmVectorFixture,units:'rig',pivot:[.2,.1],compatibility:{rig:'sirvibe-native-v1',mirrorSafe:false}}});
  const visual=CharacterVisual.parse({version:1,style:'illustrated',profile:'average',vectorComponents:[part]});
  const c={...characters[0],visual};assert(nativePartFor(c,'head-base','front',false));assert.equal(nativePartFor(c,'head-base','front',true),undefined);
  const m=fixedVectorMatrix(part,22,-30,45)!;const [x,y]=part.artwork.pivot;
  assert(Math.abs(m[0]*x+m[2]*y+m[4]-22)<1e-9);assert(Math.abs(m[1]*x+m[3]*y+m[5]+30)<1e-9);
});
