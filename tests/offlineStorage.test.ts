import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProject } from '../src/engine/presets.ts';
import { uid } from '../src/engine/schema.ts';
import { listDeviceProjects, saveDeviceProject, previousDeviceProject, migrateDeviceLibrary, mergeDeviceProjects, renameDeviceProject } from '../src/services/deviceProjects.ts';
import { getLocalMedia, putLocalMedia } from '../src/services/localMedia.ts';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),key:(i:number)=>[...storage.keys()][i]??null,get length(){return storage.size;}}});
const movie=()=>({...makeProject(false),id:uid()});
function externalChange(scope:string,project:ReturnType<typeof movie>){
  return new Promise<void>((resolve,reject)=>{
    const req=indexedDB.open('sirvibe-projects',2);
    req.onsuccess=()=>{const db=req.result,tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({scope,id:project.id,project,updated:Date.now()+9999});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
  });
}
test('autosaves commit in order and retain an earlier recoverable version',async()=>{
  const p=movie();
  await listDeviceProjects('serial');
  await Promise.all([saveDeviceProject('serial',p),saveDeviceProject('serial',{...p,name:'second'}),saveDeviceProject('serial',{...p,name:'third'})]);
  assert.equal((await listDeviceProjects('serial'))[0].project.name,'third');
  assert.equal((await previousDeviceProject('serial',p.id))?.name,'second');
});
test('external tab edits cannot be silently overwritten, including rename',async()=>{
  const p=movie();await saveDeviceProject('conflict',p);
  await externalChange('conflict',{...p,name:'other tab'});
  await assert.rejects(saveDeviceProject('conflict',{...p,name:'stale tab'}),/another tab/);
  await assert.rejects(renameDeviceProject('conflict',p.id,'stale rename'),/another tab/);
  assert.equal((await listDeviceProjects('conflict'))[0].project.name,'other tab');
});
test('legacy device and localStorage projects migrate once and retain originals',async()=>{
  const p=movie();storage.set('toonroom.projects.v1.old-account',JSON.stringify([{project:p,updated:1}]));
  await migrateDeviceLibrary('guest');
  const first=await listDeviceProjects('guest');
  assert(first.some(row=>row.project.id===p.id));
  assert.equal((await listDeviceProjects('old-account'))[0].project.id,p.id);
  await migrateDeviceLibrary('guest');
  assert.equal((await listDeviceProjects('guest')).length,first.length);
  assert(storage.has('toonroom.projects.v1.old-account'));
});
test('cloud import creates a new local copy even when the cloud timestamp is newer',async()=>{
  const p=movie();await saveDeviceProject('copies',p);
  await mergeDeviceProjects('copies',[{project:{...p,name:'remote'},updated:Date.now()+10000}]);
  const rows=await listDeviceProjects('copies');
  assert.equal(rows.length,2);
  assert.deepEqual(rows.find(row=>row.project.id===p.id)?.project,p);
  assert(rows.some(row=>row.project.id!==p.id&&row.project.name==='remote · cloud copy'));
});
test('IndexedDB media fallback survives reopening and never accepts empty media',async()=>{
  const blob=new Blob(['recorded voice'],{type:'audio/webm'});
  await putLocalMedia('fallback',blob);
  assert.equal(await (await getLocalMedia('fallback'))?.text(),'recorded voice');
  await assert.rejects(putLocalMedia('fallback',new Blob([])),/empty/);
  assert.equal(await (await getLocalMedia('fallback'))?.text(),'recorded voice');
});
test('OPFS writes close before metadata commits and failed writes retain old assets',async()=>{
  const files=new Map<string,Blob>();let fail=false;
  const dir={
    getDirectoryHandle:async()=>dir,
    getFileHandle:async(path:string)=>({
      createWritable:async()=>({write:async(blob:Blob)=>{if(fail)throw Error('disk full');files.set(path,blob);},close:async()=>{},abort:async()=>{}}),
      getFile:async()=>{if(!files.has(path))throw Error('missing');return files.get(path)!;}
    }),removeEntry:async(path:string)=>{files.delete(path);}
  };
  Object.defineProperty(navigator,'storage',{configurable:true,value:{getDirectory:async()=>dir}});
  const data=new Blob([new Uint8Array(1024*1024)],{type:'audio/wav'});
  await putLocalMedia('opfs',data);
  assert.equal(files.size,1);
  assert.equal((await getLocalMedia('opfs'))?.size,data.size);
  fail=true;
  await putLocalMedia('opfs',new Blob([new Uint8Array(1024*1024+4)],{type:'audio/wav'}));
  assert.equal((await getLocalMedia('opfs'))?.size,data.size+4); // IDB fallback
  assert.equal(files.size,1); // The prior file is retained for safe recovery.
  await putLocalMedia('missing-opfs',data); // fallback still works
  fail=false;
  await putLocalMedia('lost',data);
  files.clear();
  await assert.rejects(getLocalMedia('lost'),/missing/);
});
test('a redundant save preserves the useful recovery snapshot',async()=>{
  const p=movie();await saveDeviceProject('noop',p);
  await saveDeviceProject('noop',{...p,name:'revision'});
  await saveDeviceProject('noop',{...p,name:'revision'});
  assert.equal((await previousDeviceProject('noop',p.id))?.name,p.name);
});
test('deleting after a queued autosave cannot resurrect a project',async()=>{
  const {removeDeviceProject}=await import('../src/services/deviceProjects.ts');
  const p=movie();await saveDeviceProject('deletion',p);
  await Promise.all([saveDeviceProject('deletion',{...p,name:'queued'}),removeDeviceProject('deletion',p.id)]);
  assert.equal((await listDeviceProjects('deletion')).length,0);
  assert.equal(await previousDeviceProject('deletion',p.id),undefined);
});
test('deleted projects cannot be recreated by a stale tab or delayed save',async()=>{
  const {removeDeviceProject}=await import('../src/services/deviceProjects.ts');
  const p=movie();await saveDeviceProject('tombstone',p);
  await removeDeviceProject('tombstone',p.id);
  await assert.rejects(saveDeviceProject('tombstone',{...p,name:'stale'}),/deleted/);
  assert.equal((await listDeviceProjects('tombstone')).length,0);
});
test('external deletion is detected even when this tab never performed the delete',async()=>{
  const p=movie();await saveDeviceProject('external-delete',p);
  await new Promise<void>((resolve,reject)=>{const r=indexedDB.open('sirvibe-projects',2);r.onsuccess=()=>{const db=r.result,tx=db.transaction('projects','readwrite');tx.objectStore('projects').delete(['external-delete',p.id]);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
  await assert.rejects(saveDeviceProject('external-delete',p),/deleted/);
});
test('explicitly opening the latest saved version releases a stale-tab conflict safely',async()=>{
  const {getDeviceProject,observeDeviceProject}=await import('../src/services/deviceProjects.ts');
  const p=movie();await saveDeviceProject('reopen',p);
  await externalChange('reopen',{...p,name:'newer version'});
  await listDeviceProjects('reopen');
  await assert.rejects(saveDeviceProject('reopen',p),/another tab/); // A background list must not acknowledge the new version.
  const latest=await getDeviceProject('reopen',p.id);
  assert.equal(latest.project.name,'newer version');
  observeDeviceProject('reopen',latest);
  const saved=await saveDeviceProject('reopen',{...latest.project,name:'edited after reopen'});
  assert.equal(saved.project.name,'edited after reopen');
});
test('a damaged project is retained and recovered once without hiding healthy movies',async()=>{
  const {takeDeviceWarnings}=await import('../src/services/deviceProjects.ts');
  takeDeviceWarnings();
  const p=movie(),healthy=movie();
  await saveDeviceProject('damaged',p);
  await saveDeviceProject('damaged',{...p,name:'second revision'});
  await saveDeviceProject('damaged',healthy);
  await externalChange('damaged',{id:p.id,name:'incomplete record'} as any);
  const rows=await listDeviceProjects('damaged');
  assert.equal(rows.length,2);
  assert(rows.some(row=>row.project.id===healthy.id));
  assert(rows.some(row=>row.project.name===p.name+' · recovered'&&row.project.id!==p.id));
  assert(takeDeviceWarnings().some(message=>message.includes('damaged')));
  assert.equal((await listDeviceProjects('damaged')).length,2);
  const {getDeviceProject}=await import('../src/services/deviceProjects.ts');
  await assert.rejects(getDeviceProject('damaged',p.id)); // The damaged original was not silently replaced.
});
test('unreadable legacy JSON cannot block healthy IndexedDB projects',async()=>{
  const p=movie();await saveDeviceProject('legacy-broken',p);
  storage.set('toonroom.projects.v1.legacy-broken','{broken json');
  assert.equal((await listDeviceProjects('legacy-broken'))[0].project.id,p.id);
  assert.equal(storage.get('toonroom.projects.v1.legacy-broken'),'{broken json');
});
test('blocked browser preferences do not break session recovery or theme defaults',async()=>{
  const {lastEditorSession,editorSessionFor,readPreference}=await import('../src/services/projects.ts');
  const previous=localStorage.getItem;
  try {
    localStorage.getItem=()=>{throw new DOMException('Storage blocked','SecurityError');};
    assert.equal(readPreference('toonroom.theme'),null);
    assert.equal(lastEditorSession('guest'),undefined);
    assert.equal(editorSessionFor('guest','project'),undefined);
  } finally {localStorage.getItem=previous;}
});
