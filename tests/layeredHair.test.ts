import test from 'node:test';
import assert from 'node:assert/strict';
import {characters} from '../src/engine/presets.ts';
import {CharacterDefinition,views} from '../src/engine/schema.ts';
import {viewArt} from '../src/engine/actorArt.ts';
import {hairDesignDefaults,HairDesignV1} from '../src/engine/hairDesignSchema.ts';
import {layeredHairStyles,buildLayeredHair,hasLayeredHair,hairRenderPaths,layeredHairCacheSize,clearLayeredHairCache} from '../src/engine/layeredHair.ts';
import {VectorArtworkV1,deformRegion} from '../src/engine/vectorArtwork.ts';
test('legacy hair is unchanged until opt-in and bald has no artwork',()=>{
  assert.equal(hasLayeredHair(characters[0]),false);
  assert.equal(buildLayeredHair({...characters[0],hair:'bald',hairDesign:hairDesignDefaults},viewArt.front),undefined);
  assert.equal(hasLayeredHair({...characters[0],hair:'cornrows'}),true);
  assert(!HairDesignV1.safeParse({...hairDesignDefaults,material:{...hairDesignDefaults.material,wind:2}}).success);
});
test('curated styles validate every view at bounded parameter extremes',()=>{
  for(const hair of layeredHairStyles){
    if(hair==='bald')continue;
    for(const view of views)for(const high of [false,true]){
      const design={...hairDesignDefaults,length:high?1.3:.7,width:high?1.15:.85,volume:high?1.3:.7,hairline:high?.1:-.1,density:high?1:0,braidThickness:high?1.25:.75,parting:high?.3:-.3};
      const c=CharacterDefinition.parse({...characters[0],hair,hairDesign:design,wardrobe:{...characters[0].wardrobe,headStretch:high?1.25:.8,cheekWidth:high?1.28:.72,forehead:high?1.2:.8}});
      const model=buildLayeredHair(c,viewArt[view])!;
      assert(model.artwork.regions.length<=24);assert(model.groups.length<=6);
      assert.deepEqual(VectorArtworkV1.parse(JSON.parse(JSON.stringify(model.artwork))),model.artwork);
      for(const group of model.groups){assert.equal(group.pins[0],1);assert.equal(group.points.length,group.pins.length);assert(group.collisionProxyIds.includes('head'));assert(model.artwork.anchors.some(a=>a.id===group.id+'-root'));}
      for(const region of model.artwork.regions){
        const moved=deformRegion(region,[100,0]);let k=0;
        for(let i=0;i<region.commands.length;i++)for(let j=1;j<region.commands[i].length;j+=2){
          const before=Number(region.commands[i][j]),after=Number(moved[i][j]);const weight=region.material?.weights[k++];
          if(!weight||weight.pin===1)assert.equal(before,after);
          assert(Math.abs(after-before)<=(region.material?.maxDisplacement??0)+1e-8);
        }
      }
      const all=[...hairRenderPaths(model,'background'),...hairRenderPaths(model,'foreground')];assert.equal(all.length,model.artwork.regions.length);
      assert(all.every(p=>! /NaN|Infinity/.test(p.d)));
    }
  }
  assert(layeredHairCacheSize()<=48);
});
test('hair swaps, palette and shape changes invalidate cache, unrelated face edits do not',()=>{
  clearLayeredHairCache();const c={...characters[0],hair:'locs' as const,hairDesign:hairDesignDefaults};
  const a=buildLayeredHair(c,viewArt.front)!;assert.equal(buildLayeredHair(c,viewArt.front),a);
  assert.equal(buildLayeredHair({...c,nose:'long'},viewArt.front),a);
  assert.notEqual(buildLayeredHair({...c,hairColor:'#123456'},viewArt.front),a);
  assert.notEqual(buildLayeredHair({...c,hair:'braids'},viewArt.front),a);
  assert.notEqual(buildLayeredHair({...c,hairDesign:{...hairDesignDefaults,length:1.3}},viewArt.front),a);
  assert.equal(hairRenderPaths(a,'foreground'),hairRenderPaths(a,'foreground'));
  assert.notDeepEqual(hairRenderPaths(a,'foreground',[8,0]),hairRenderPaths(a,'foreground'));
  assert(Object.isFrozen(a.artwork.regions));
});
