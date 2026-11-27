import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import 'fake-indexeddb/auto';
import {aiVectorCategories,aiCategoryInfo,generateAiVectorSpecification,nativePackageSchemaText,aiStarterPackage,exportAiStarter,explainNativeValidation,type AiVectorOptions} from '../src/engine/aiVectorSpecification.ts';
import {NativeAssetPackage,nativePackageLimits,nativeCategorySlots,parseNativePackage,nativeKey,applyNativePackage,calibrateNative} from '../src/engine/nativeAssetPackage.ts';
import {nativeDynamicsLimits,assetViews} from '../src/engine/visualAssets.ts';
import {flagshipCharacters} from '../src/engine/visualPresets.ts';
import {visualRigAnchors} from '../src/engine/visualRig.ts';
import {saveNativeAssets,listNativeAssets,deleteNativeAsset,exportInstalledNative} from '../src/services/nativeAssetStore.ts';
import {makeProject} from '../src/engine/presets.ts';
import {ProjectDocument,CharacterDefinition} from '../src/engine/schema.ts';
import {createMovieBackup,restoreMovie} from '../src/services/projectExchange.ts';
import {characterAudition} from '../src/engine/characterWorkspace.ts';
import {CharacterDynamics} from '../src/engine/characterDynamics.ts';
const base=flagshipCharacters[1];
const options:AiVectorOptions={category:'hair',brief:'Copper locs, subtle cel shading',views:['front','three-quarter'],material:'braid',profile:'curvy',style:'illustrated',character:base};
test('specification includes actual current schema, runtime bounds, task, rig anchors and portable data rules',t=>{
 const start=performance.now(),prompt=generateAiVectorSpecification(options),ms=performance.now()-start;
 assert.deepEqual(JSON.parse(nativePackageSchemaText()),z.toJSONSchema(NativeAssetPackage,{io:'input',reused:'ref'}));
 for(const term of ['version 2','sirvibe-native-vector','bone-normalized','end','weights','pin','influence','dependencies','coverage','mirrorSafe','No fabricated rotations','Copper locs','head-accessory','nonzero','reference image','AUTHORED STARTER',JSON.stringify(nativePackageLimits),JSON.stringify(nativeDynamicsLimits)])assert(prompt.includes(term),term);
 assert(prompt.endsWith(nativePackageSchemaText()));
 const anchor=visualRigAnchors(base,'front').head;assert(prompt.includes(JSON.stringify([Math.round(anchor.x*100)/100,Math.round(anchor.y*100)/100])));
 assert(!prompt.includes(base.name+' |'));assert.equal(prompt,generateAiVectorSpecification(options));
 t.diagnostic('AI_SPEC_CPU '+JSON.stringify({firstMs:ms,chars:prompt.length,schemaChars:nativePackageSchemaText().length}));
});
test('category capability and task restrictions align with importer; no unsupported claims or fake views',()=>{
 for(const [key,entry] of Object.entries(aiVectorCategories)){const category=key as AiVectorOptions['category'];if(entry.status==='unsupported'){assert.throws(()=>generateAiVectorSpecification({...options,category}));continue;}
  const info=aiCategoryInfo(category);assert(info.slots?.every(slot=>(nativeCategorySlots[info.manifest!] as readonly string[]).includes(slot)));
  assert(generateAiVectorSpecification({...options,category,views:['front']},{includeSchema:false}).includes(info.reason));}
 assert.throws(()=>generateAiVectorSpecification({...options,category:'character',views:assetViews}),/budget/);
 assert.throws(()=>generateAiVectorSpecification({...options,views:['front','front']}));
 assert.equal(aiStarterPackage({...options,views:['back']}),undefined);
 const starter=aiStarterPackage({...options,views:['front','back']})!;assert.deepEqual(starter.packs[0].coverage,['front']);assert.equal(starter.packs[0].components.length,1);
});
test('authored starters for hair, shirt and accessory survive actual importer, palette edit, storage, runtime and backup',async()=>{
 let c=base;
 for(const [category,material] of [['hair','braid'],['shirt','fabric'],['accessory','spring']] as const){
  const request={...options,category,material};const text=exportAiStarter(request)!;const p=parseNativePackage(text);
  assert.deepEqual(p,aiStarterPackage(request));const prompt=generateAiVectorSpecification(request,{includeSchema:false});assert(prompt.includes(JSON.stringify(p)));
  const calibrated=calibrateNative(p,0,0,{palette:{base:'#457889'}});await saveNativeAssets(calibrated);
  const key=nativeKey(calibrated.packs[0]);const reopened=parseNativePackage(await exportInstalledNative(key));assert.deepEqual(reopened,calibrated);
  c=applyNativePackage(c,reopened.packs,key);await deleteNativeAsset(key);
 }
 assert.equal((await listNativeAssets()).length,0);assert.equal(c.visual?.vectorComponents?.length,6);
 const {scene}=characterAudition(c,'talk','neutral','front',false,'expressive',60);const dyn=new CharacterDynamics();const frame=dyn.sample(scene,[c],1.8).get('preview')!;assert(Object.keys(frame.native??{}).length>0);assert.deepEqual(dyn.sample(scene,[c],1.8).get('preview'),frame);dyn.dispose();
 const project=makeProject(true);c=CharacterDefinition.parse({...c,id:project.characters[0].id});project.characters[0]=c;const restored=await restoreMovie(new File([await createMovieBackup(ProjectDocument.parse(project))],'ai-authored.sirvibe'));assert.deepEqual(restored.characters[0].visual,c.visual);
 const rigid=aiStarterPackage({...options,material:'rigid'})!;assert(rigid.packs[0].components.every(c=>!c.dynamics&&c.artwork.regions.every(r=>!r.material)));
});
test('actual validation errors retain paths and produce actionable repair guidance',()=>{
 const p=aiStarterPackage(options)!;
 for(const [mutate,pattern] of [[(v:any)=>v.packs[0].coverage=['back'],/coverage/i],[(v:any)=>v.packs[0].dependencies=[{id:'missing',revision:2}],/dependency|revision/i],[(v:any)=>v.packs[0].components[0].artwork.regions[0].material.weights=[],/weights/i],[(v:any)=>v.packs[0].components[0].artwork.pivot=[999,999],/bounds|pivot/i]] as const){const copy=structuredClone(p);mutate(copy);try{parseNativePackage(JSON.stringify(copy));assert.fail('invalid fixture accepted');}catch(e){const report=explainNativeValidation(e);assert.match(report.message,pattern);assert(report.hint.length>35);}}
 assert.match(explainNativeValidation(Error('$: Only plain JSON objects are accepted; ZIP, SVG and compressed files are unsupported')).hint,/plain JSON/);
});
