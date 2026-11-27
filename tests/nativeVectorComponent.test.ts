import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterVisual} from '../src/engine/visualAssets.ts';
import {forearmVectorFixture} from '../src/engine/vectorArtworkFixture.ts';
test('optional native vector uses existing visual identity and preserves legacy shape',()=>{
  const legacy={version:1,style:'illustrated',profile:'average'};
  assert.deepEqual(CharacterVisual.parse(legacy),legacy);
  const component={id:'forearm-fixture',slot:'forearm-left',view:'front',profiles:['average'],artwork:forearmVectorFixture};
  const candidate={...legacy,vectorComponents:[component]};
  assert.deepEqual(CharacterVisual.parse(JSON.parse(JSON.stringify(candidate))),candidate);
  assert(!CharacterVisual.safeParse({...legacy,vectorComponents:[component,component]}).success);
});
