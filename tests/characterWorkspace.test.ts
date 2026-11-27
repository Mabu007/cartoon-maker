import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {startDraft,draftHistory,randomizeWorkspace,characterAudition} from '../src/engine/characterWorkspace.ts';
import {flagshipCharacters} from '../src/engine/visualPresets.ts';
import {makeProject} from '../src/engine/presets.ts';
import {CharacterDefinition,ProjectDocument,views} from '../src/engine/schema.ts';
import {setIdentityLock,exportCharacterIdentity,importCharacterIdentity,duplicateCharacterIdentity} from '../src/engine/characterIdentity.ts';
import {garmentDefaults} from '../src/engine/garmentDesignSchema.ts';
import {characterSecondaryDefaults} from '../src/engine/secondaryMotionSchema.ts';
import {evaluate} from '../src/engine/evaluate.ts';
import {saveDeviceProject,getDeviceProject} from '../src/services/deviceProjects.ts';
import {createMovieBackup,restoreMovie} from '../src/services/projectExchange.ts';
const storage=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{value:{get length(){return storage.size;},key:(i:number)=>[...storage.keys()][i]??null,getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>{storage.set(k,v);},removeItem:(k:string)=>storage.delete(k)},configurable:true});
const base=flagshipCharacters[1];
test('draft edits coalesce per control, undo/redo/reset restore original and history is bounded',()=>{
 let s=startDraft(base);s=draftHistory(s,{type:'edit',update:c=>({...c,height:1.1}),key:'height',time:10});
 s=draftHistory(s,{type:'edit',update:c=>({...c,height:1.2}),key:'height',time:100});
 assert.equal(s.past.length,1);s=draftHistory(s,{type:'edit',update:c=>({...c,hair:'locs'}),key:'hair',time:150});assert.equal(s.past.length,2);
 const result=s.present;s=draftHistory(s,{type:'undo'});assert.equal(s.present.height,1.2);assert.equal(s.present.hair,base.hair);s=draftHistory(s,{type:'redo'});assert.equal(s.present,result);
 s=draftHistory(s,{type:'reset',value:base});assert.equal(s.present,base);s=draftHistory(s,{type:'undo'});assert.equal(s.present,result);
 for(let i=0;i<50;i++)s=draftHistory(s,{type:'edit',update:c=>({...c,name:'Test '+i}),time:1000+i*500});
 assert.equal(s.past.length,32);assert.equal(s.future.length,0);
});
test('targeted deterministic randomization preserves locked groups, imported identity and compatible modular outfits',()=>{
 const c=setIdentityLock({...base,garmentDesign:garmentDefaults},'body',true);
 const face=randomizeWorkspace(c,77,'face');assert.deepEqual(face,randomizeWorkspace(c,77,'face'));assert.equal(face.hair,c.hair);assert.equal(face.shirt,c.shirt);assert.equal(face.height,c.height);assert.deepEqual(face.garmentDesign,c.garmentDesign);
 for(let seed=0;seed<64;seed++){const next=randomizeWorkspace(c,seed,'wardrobe');assert.equal(next.hair,c.hair);assert.equal(next.height,c.height);assert.equal(next.skin,c.skin);assert(CharacterDefinition.safeParse(next).success);assert(next.garmentDesign?.top!=='dress'||next.garmentDesign.bottom==='none');}
 assert.deepEqual(randomizeWorkspace(c,10,'body').visual,c.visual);
 assert.equal(importCharacterIdentity(exportCharacterIdentity(c),'another').id,'another');assert.equal(duplicateCharacterIdentity(c,'copy').id,'copy');
});
test('same runtime audition across five views, actions and opt-in physics; no draft mutation',t=>{
 const c=CharacterDefinition.parse({...base,personality:{preset:'confident',actingModel:'coherent-v1',autoActing:'full'},secondaryMotion:characterSecondaryDefaults}),original=JSON.stringify(c),samples:number[]=[];
 for(const view of views)for(const action of ['idle','walk','run','sit','stand','talk','wave','turn'] as const){
  const {scene,span}=characterAudition(c,action,'neutral',view,false,'subtle',15);assert(scene.visual?.secondaryMotion?.enabled);assert(span>0);const chars=new Map([[c.id,c]]);
  const start=performance.now(),first=evaluate(scene,.6,chars,540);samples.push(performance.now()-start);assert.equal(first.actors[0].characterId,c.id);assert.deepEqual(first,evaluate(scene,.6,chars,540));assert(Number.isFinite(first.actors[0].pose.head??0));if(action==='idle')assert.equal(first.actors[0].behavior?.headFree,true);
 }
 assert.equal(JSON.stringify(c),original);assert.equal(characterAudition(c,'idle','neutral','front',false,'off',0).scene.visual,undefined);
 samples.sort((a,b)=>a-b);t.diagnostic('WORKSPACE_CPU '+JSON.stringify({samples:samples.length,p50Ms:samples[20],p95Ms:samples[38]}));
});
test('new original character survives local device storage, movie backup and scene placement',async()=>{
 const project=makeProject(true),actor=project.scenes[0].actors[0],c=CharacterDefinition.parse({...randomizeWorkspace({...base,id:'workspace-original',name:'Workspace original',garmentDesign:garmentDefaults},45,'all'),hair:'locs',secondaryMotion:characterSecondaryDefaults,personality:{preset:'relaxed',actingModel:'coherent-v1',autoActing:'subtle'},voicePreset:'warm'});
 const original=JSON.stringify(project.characters[0]);project.characters.push(c);project.scenes[0].actors.push({...actor,id:'workspace-actor',characterId:c.id});
 const verified=ProjectDocument.parse(project);await saveDeviceProject('guest',verified);const stored=(await getDeviceProject('guest',verified.id)).project;
 assert.deepEqual(stored.characters.find(x=>x.id===c.id),c);assert.equal(JSON.stringify(stored.characters[0]),original);
 const restored=await restoreMovie(new File([await createMovieBackup(verified)],'workspace.sirvibe'));
 assert.deepEqual(restored.characters.find(x=>x.id===c.id),c);
 assert(evaluate(restored.scenes[0],1,new Map(restored.characters.map(x=>[x.id,x]))).actors.some(a=>a.id==='workspace-actor'&&a.characterId===c.id));
});
