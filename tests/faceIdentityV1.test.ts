import test from 'node:test';
import assert from 'node:assert/strict';
import {characters} from '../src/engine/presets.ts';
import {CharacterDefinition,views} from '../src/engine/schema.ts';
import {viewArt} from '../src/engine/actorArt.ts';
import {faceLandmarks,headOutline,eyeIdentity,faceDetailGeometry,secondaryCheekOffset} from '../src/engine/faceIdentityGeometry.ts';
import {facialPerformance} from '../src/engine/facialAnimation.ts';
import {mouthGeometry} from '../src/engine/mouthRig.ts';
import {visemeNames} from '../src/engine/visemes.ts';
import {sampleHandRig,morphHandGeometry} from '../src/engine/handRig.ts';
import {NativeVectorComponent,CharacterVisual} from '../src/engine/visualAssets.ts';
import {forearmVectorFixture} from '../src/engine/vectorArtworkFixture.ts';
import {nativeBoneFor} from '../src/engine/nativeVectorBone.ts';
test('face identity survives every supported head view and mouth closure',()=>{
  const a=CharacterDefinition.parse({...characters[0],shape:'heart',wardrobe:{...characters[0].wardrobe,eyeWidth:1.15,eyeTilt:8,irisSize:1.2,forehead:1.1,cupidBow:.9,upperLipRatio:1.3,freckles:.8}});
  const b=CharacterDefinition.parse({...a,shape:'square',mouth:'line',wardrobe:{...a.wardrobe,cupidBow:.1,upperLipRatio:.7}});
  assert.deepEqual(CharacterDefinition.parse(JSON.parse(JSON.stringify(a))),a);
  for(const view of views){
    const art=viewArt[view],l=faceLandmarks(a,art);
    assert.notEqual(headOutline(a,art),headOutline(b,art));
    if(art.rear){assert.equal(l.eyes.length,0);assert.equal(faceDetailGeometry(a,art).length,0);}
    for(const shape of visemeNames){
      const mood=facialPerformance(1,a.id,'talk','angry',.8,{shape,weight:1},{x:1,y:0},a.personality);
      const ma=mouthGeometry(a,mood,view),mb=mouthGeometry(b,mood,view);
      assert(!/NaN|Infinity/.test(ma.cavityPath+ma.upperLipPath));assert.notEqual(ma.upperLipPath,mb.upperLipPath);
      if(shape==='rest'||shape==='closed')assert.equal(ma.open,false);
      for(const x of l.eyes){
        const e=eyeIdentity(a,mood,x,l.eyeY,-1,false,false,art.face);
        assert(Number.isFinite(e.pupilX+e.pupilY+e.radius));
        assert(!eyeIdentity(a,{...mood,blink:1},x,l.eyeY,-1,false,false,art.face).open);
      }
    }
  }
  assert.equal(secondaryCheekOffset(99),1.5);
});
test('finger morphology retains roots and contact gestures',()=>{
  const g=sampleHandRig('open'),m=morphHandGeometry(g,[1.1,.9,1.1,1,.9]);
  assert.deepEqual(g.fingers.map(p=>p[0]),m.fingers.map(p=>p[0]));
  assert.notDeepEqual(g.fingers,m.fingers);assert.equal(morphHandGeometry(g,[1.1,.9,1.1,1,.9],true),g);
});
test('explicit facing variants may coexist without mirroring unsafe art',()=>{
  const part={id:'facing',slot:'forearm-left',view:'front',profiles:['average'],artwork:{...forearmVectorFixture,compatibility:{rig:'sirvibe-native-v1',mirrorSafe:false}}};
  const a=NativeVectorComponent.parse({...part,facing:'normal'}),b=NativeVectorComponent.parse({...part,id:'mirrored',facing:'mirrored'});
  const visual=CharacterVisual.parse({version:1,style:'illustrated',profile:'average',vectorComponents:[a,b]});
  const c={...characters[0],visual};
  assert.equal(nativeBoneFor(c,'forearm-left','front',false)?.id,a.id);
  assert.equal(nativeBoneFor(c,'forearm-left','front',true)?.id,b.id);
  assert(!CharacterVisual.safeParse({...visual,vectorComponents:[a,b,NativeVectorComponent.parse(part)]}).success);
});
