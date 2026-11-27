import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AssetManifest, CharacterVisual, parseAssetPackage, exportAssetPackage, compileComponents, compatibility, assetInstructions, bodyProfiles } from '../src/engine/visualAssets.ts';
import { visualExamples } from '../src/engine/visualExamples.ts';
import { applyProfile, illustratedCharacters } from '../src/engine/visualPresets.ts';
import { CharacterDefinition, ProjectDocument } from '../src/engine/schema.ts';
import { characters, makeProject } from '../src/engine/presets.ts';
import { rig } from '../src/engine/animation.ts';
import { componentTransform } from '../src/engine/hybridArtwork.ts';
import { rasterDimensions } from '../src/services/assetPreparation.ts';
const envelope=(packs:unknown[])=>JSON.stringify({format:'sirvibe-assets',version:1,packs});
test('all original examples validate and package round trips preserve calibrated components',()=>{
  const parsed=parseAssetPackage(exportAssetPackage(visualExamples));assert.deepEqual(parsed.packs,visualExamples);
  for(const pack of parsed.packs){
    const binary=Uint8Array.from(Buffer.from(pack.files[0].data.split(',')[1],'base64'));
    assert.deepEqual(rasterDimensions(binary),{width:pack.files[0].width,height:pack.files[0].height});
  }
  assert.equal(compileComponents(visualExamples[0]).length,2);
  assert.match(compatibility(visualExamples[0]),/Limited orientations/);
});
test('manifest rejects traversal, executable resources, unknown fields, duplicate files and missing art',()=>{
  const pack=visualExamples[0];
  for(const value of ['../hair.webp','/hair.webp','art/../hair.webp','hair.svg','http://remote/hair.png','art\\hair.webp'])
    assert.equal(AssetManifest.safeParse({...pack,files:[{...pack.files[0],path:value}]}).success,false,value);
  assert.equal(AssetManifest.safeParse({...pack,script:'alert(1)'}).success,false);
  assert.equal(AssetManifest.safeParse({...pack,files:[pack.files[0],pack.files[0]]}).success,false);
  assert.equal(AssetManifest.safeParse({...pack,files:[{...pack.files[0],data:'data:image/svg+xml;base64,PHN2Zz4='}]}).success,false);
  assert.equal(AssetManifest.safeParse({...pack,parts:[{...pack.parts[0],file:'missing.webp'}]}).success,false);
});
test('packages reject unsupported versions, duplicate identities, missing dependencies, cycles and budgets',()=>{
  const pack=visualExamples[0];
  assert.throws(()=>parseAssetPackage(envelope([{...pack,version:2}])));
  assert.throws(()=>parseAssetPackage(envelope([pack,pack])),/Duplicate/);
  assert.throws(()=>parseAssetPackage(envelope([{...pack,dependencies:['missing']}])));
  assert.throws(()=>parseAssetPackage(envelope([{...pack,id:'a',dependencies:['b']},{...pack,id:'b',dependencies:['a']}])),/cycle/);
  assert.throws(()=>parseAssetPackage(' '.repeat(12_000_001)),/12 MB/);
  assert.equal(AssetManifest.safeParse({...pack,files:Array.from({length:3},(_,i)=>({...pack.files[0],path:`file${i}.webp`,width:2048,height:2048}))}).success,false);
});
test('joint calibration, explicit view mappings and body fit cannot silently accept incompatible art',()=>{
  const pack=visualExamples[0],components=compileComponents(pack);
  assert.equal(CharacterVisual.safeParse({version:1,style:'illustrated',profile:'average',components:[components[0],components[0]]}).success,false);
  assert.equal(CharacterVisual.safeParse({version:1,style:'illustrated',profile:'average',components:[{...components[0],profiles:['slim']}]}).success,false);
  assert.equal(AssetManifest.safeParse({...pack,parts:[{...pack.parts[0],pivot:{x:2,y:0}}]}).success,false);
  assert.equal(AssetManifest.safeParse({...pack,parts:[{...pack.parts[0],view:'invented'}]}).success,false);
  assert.equal(AssetManifest.safeParse({...pack,parts:[{...pack.parts[0],slot:'top'}]}).success,false);
});
test('body profiles produce real geometry changes with connected rig anchors',()=>{
  const base=characters[0],slim=applyProfile(base,'slim'),curvy=applyProfile(base,'curvy');
  assert.notDeepEqual(rig(slim,{},1),rig(curvy,{},1));
  for(const profile of bodyProfiles){const c=CharacterDefinition.parse(applyProfile(base,profile)),r=rig(c,{},1);assert(Number.isFinite(r.head.y));assert(Math.abs(Math.hypot(r.left.elbow.x-r.left.shoulder.x,r.left.elbow.y-r.left.shoulder.y)-28*c.arms)<1e-8);}
  const normal=rig(base,{},1),wide=rig({...base,visual:{version:1,style:'illustrated',profile:'average',shoulders:1.2}}, {},1);
  assert(wide.right.shoulder.x>normal.right.shoulder.x);
});
test('profile switch detaches incompatible garments and resets only profile-dependent body adjustments',()=>{
  const original=illustratedCharacters[0],curvy=applyProfile(original,'curvy');
  assert.equal(curvy.visual?.components?.length,0);
  assert.equal(curvy.skin,original.skin);assert.equal(curvy.personality?.preset,'serious');
  CharacterDefinition.parse(curvy);
});
test('calibrated garment fit follows body and preserves its declared pivot',()=>{
  const c=illustratedCharacters[0],component=c.visual!.components![0],box=componentTransform(component,c,11,-130,5);
  assert.equal(box.x,11);assert.equal(box.y,-130);assert.equal(box.angle,5);assert(box.height>component.height);
});
test('AI export and machine-readable schemas reflect the actual specification',()=>{
  assert.match(assetInstructions('clothing','curvy'),/torso panel only/);
  assert.match(assetInstructions('hair'),/NORMALISED/);
  assert.equal(z.toJSONSchema(AssetManifest).type,'object');
  for(const c of illustratedCharacters)CharacterDefinition.parse(c);
  const project=makeProject(false);project.characters.push(...illustratedCharacters);ProjectDocument.parse(project);
});
test('dimension preflight rejects unknown raster headers before browser decoding',()=>{
  assert.throws(()=>rasterDimensions(new Uint8Array(40)),/not a supported/);
  const bytes=new Uint8Array(24);bytes.set([0x89,80,78,71]);bytes.set([73,72,68,82],12);new DataView(bytes.buffer).setUint32(16,1024);new DataView(bytes.buffer).setUint32(20,512);
  assert.deepEqual(rasterDimensions(bytes),{width:1024,height:512});
});
test('rig calibration exposes the exact native ground and joints for every supported view',async()=>{
  const {visualRigAnchors}=await import('../src/engine/visualRig.ts');
  for(const view of ['front','three-quarter','side','back-quarter','back'] as const){const anchors=visualRigAnchors(illustratedCharacters[0],view);assert.deepEqual(anchors.ground,{x:0,y:0});assert.equal(anchors.hair,anchors.head);assert.equal(anchors.top,anchors.neck);assert(anchors.head.y<anchors.pelvis.y);assert.notEqual(anchors.leftShoulder.x,anchors.rightShoulder.x);}
});
