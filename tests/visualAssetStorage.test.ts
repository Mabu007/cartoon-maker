import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { listVisualAssets, saveVisualAssets, updateVisualAsset, deleteVisualAsset } from '../src/services/visualAssetStore.ts';
import { visualExamples } from '../src/engine/visualExamples.ts';
import { createMovieBackup, restoreMovie } from '../src/services/projectExchange.ts';
import { makeRevenentDemo } from '../src/engine/revenentDemo.ts';
import { saveDeviceProject, listDeviceProjects, clearAllDeviceProjects } from '../src/services/deviceProjects.ts';
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{get length(){return storage.size;},key:(i:number)=>[...storage.keys()][i]??null,getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);},removeItem:(key:string)=>{storage.delete(key);}},configurable:true});
test('asset imports commit atomically, reject collisions and support rename, favourite and removal',async()=>{
  const pack=visualExamples[0];await saveVisualAssets([pack]);
  await updateVisualAsset(pack.id,{name:'My hair',favorite:true});
  const stored=(await listVisualAssets()).find(r=>r.id===pack.id)!;assert.equal(stored.pack.name,'My hair');assert(stored.favorite);
  await assert.rejects(saveVisualAssets([{...pack,id:'new-pack'},pack]));assert(!(await listVisualAssets()).some(row=>row.id==='new-pack'));
  await deleteVisualAsset(pack.id);assert.equal((await listVisualAssets()).length,0);
});
test('portable movies retain illustrated components, calibration, occluders and lighting without a shared library',async()=>{
  const project=makeRevenentDemo(),blob=await createMovieBackup(project),restored=await restoreMovie(new File([blob],'revenent.sirvibe'));
  assert.deepEqual(restored.characters,project.characters);assert.deepEqual(restored.scenes[0].visual,project.scenes[0].visual);assert.equal(restored.scenes[0].objects[0].imageData,project.scenes[0].objects[0].imageData);
});
test('explicit fresh start clears projects, recovery and migration sources without resurrecting old cartoons',async()=>{
  const p=makeRevenentDemo();await saveDeviceProject('guest',p);await saveDeviceProject('account', {...p,id:'other'});
  storage.set('toonroom.projects.v1.guest',JSON.stringify([{project:p,updated:1}]));storage.set('toonroom.last-session.v1.guest','previous');storage.set('toonroom.theme','dark');
  await clearAllDeviceProjects();assert.deepEqual(await listDeviceProjects('guest'),[]);assert.deepEqual(await listDeviceProjects('account'),[]);assert.equal(storage.get('toonroom.theme'),'dark');assert(!storage.has('toonroom.projects.v1.guest'));
  await assert.rejects(saveDeviceProject('guest',p),/deleted/);
});
test('dependent artwork packs block deletion until the dependent pack is removed',async()=>{
  const pack=visualExamples[0],dependent={...visualExamples[1],id:'dependent',dependencies:[pack.id]};
  await saveVisualAssets([pack,dependent]);await assert.rejects(deleteVisualAsset(pack.id));assert((await listVisualAssets()).some(row=>row.id===pack.id));
  await deleteVisualAsset(dependent.id);await deleteVisualAsset(pack.id);
});
