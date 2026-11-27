import test from 'node:test';
import assert from 'node:assert/strict';
import {flagshipCharacters,studioCharacters} from '../src/engine/visualPresets.ts';
import {CharacterDefinition,views} from '../src/engine/schema.ts';
import {viewArt} from '../src/engine/actorArt.ts';
import {buildLayeredHair} from '../src/engine/layeredHair.ts';
import {exportCharacterIdentity,importCharacterIdentity} from '../src/engine/characterIdentity.ts';
import {visualRigAnchors} from '../src/engine/visualRig.ts';
test('vector studio upgrades are opt-in, valid and independently reproducible across views',()=>{
  assert.equal(studioCharacters.every(c=>!c.hairDesign),true);
  for(const c of flagshipCharacters){
    assert(CharacterDefinition.safeParse(c).success);
    assert.deepEqual(importCharacterIdentity(exportCharacterIdentity(c),c.id),c);
    for(const view of views){
      const model=buildLayeredHair(c,viewArt[view]);assert(model);
      const a=visualRigAnchors(c,view);assert(Object.values(a).every(p=>Number.isFinite(p.x+p.y)));
      if(viewArt[view].rear)assert(model.artwork.regions.filter(r=>r.id.startsWith('lock-')).every(r=>r.layer<0));
    }
  }
});
