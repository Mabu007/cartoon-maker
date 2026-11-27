import test from 'node:test';
import assert from 'node:assert/strict';
import {characters} from '../src/engine/presets.ts';
import {CharacterVisual,NativeVectorComponent} from '../src/engine/visualAssets.ts';
import {forearmVectorFixture} from '../src/engine/vectorArtworkFixture.ts';
import {nativeBoneFor} from '../src/engine/nativeVectorBone.ts';
test('opt-in imported native bone geometry fits morphology without mutating source or endpoints',()=>{
  const part=NativeVectorComponent.parse({id:'fit',slot:'forearm-left',view:'front',profiles:['average'],artwork:forearmVectorFixture,fitMorphology:'anatomical-v1'});
  const visual=CharacterVisual.parse({version:1,style:'illustrated',profile:'average',vectorComponents:[part],wristWidth:1.15,muscleDefinition:1});
  const c={...characters[0],visual},original=JSON.stringify(visual.vectorComponents![0]);
  const result=nativeBoneFor(c,'forearm-left','front')!;
  assert.notDeepEqual(result.artwork.regions[0].commands,part.artwork.regions[0].commands);
  assert.deepEqual(result.artwork.anchors,part.artwork.anchors);assert.equal(JSON.stringify(visual.vectorComponents![0]),original);
  assert.equal(nativeBoneFor({...c,nose:'long'},'forearm-left','front'),result);
});
