import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProject } from '../src/engine/presets.ts';
import { uid } from '../src/engine/schema.ts';
import { putAudio, getAudio, projectAssets } from '../src/services/audio.ts';
import { createMovieBackup, restoreMovie } from '../src/services/projectExchange.ts';
test('binary backups restore exact media with fresh project and audio identities',async()=>{
  const project=makeProject(false),id=uid();
  const bytes=new Uint8Array(1400000);bytes[37]=75;
  await putAudio(id,new Blob([bytes],{type:'audio/wav'}));
  project.scenes[0].clips.push({id:uid(),track:'music',start:0,length:3,asset:'asset:'+id,name:'Soundtrack',volume:.5,offset:0,muted:false});
  const blob=await createMovieBackup(project);
  assert(blob.size<bytes.length+100000); // No base64 expansion of large audio.
  const restored=await restoreMovie(new File([blob],'movie.sirvibe'));
  assert.notEqual(restored.id,project.id);
  const fresh=projectAssets(restored)[0];assert.notEqual(fresh,id);
  assert.deepEqual(new Uint8Array(await (await getAudio(fresh))!.arrayBuffer()),bytes);
  await assert.rejects(restoreMovie(new File([blob.slice(0,-100)],'truncated.sirvibe')),/incomplete/);
  const damaged=new Uint8Array(await blob.arrayBuffer());damaged[damaged.length-20]^=1;
  await assert.rejects(restoreMovie(new File([damaged],'damaged.sirvibe')),/damaged/);
});
test('legacy JSON backups still import without reusing asset identities',async()=>{
  const project=makeProject(false),id=uid();
  project.scenes[0].clips.push({id:uid(),track:'music',start:0,length:1,asset:'asset:'+id,name:'old',volume:1,offset:0,muted:false});
  const legacy={format:'toonroom-backup-1',project,audio:{[id]:{type:'audio/wav',data:btoa('older recording')}}};
  const restored=await restoreMovie(new File([JSON.stringify(legacy)],'old.json'));
  assert.notEqual(projectAssets(restored)[0],id);
  assert.equal(await (await getAudio(projectAssets(restored)[0]))?.text(),'older recording');
});
test('an invalid later asset cannot leak earlier import files into device storage',async()=>{
  const p=makeProject(false),a=uid(),b=uid();
  await putAudio(a,new Blob(['first audio'],{type:'audio/wav'}));
  await putAudio(b,new Blob(['second audio'],{type:'audio/wav'}));
  p.scenes[0].clips.push(...[a,b].map((id,i)=>({id:uid(),track:'music' as const,start:i,length:1,asset:'asset:'+id,name:'clip',volume:1,offset:0,muted:false})));
  const blob=await createMovieBackup(p);
  async function assetCount(){return new Promise<number>((resolve,reject)=>{const r=indexedDB.open('sirvibe-media',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('files').objectStore('files').count();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};});}
  const before=await assetCount(),bytes=new Uint8Array(await blob.arrayBuffer());bytes[bytes.length-1]^=1;
  await assert.rejects(restoreMovie(new File([bytes],'corrupt.sirvibe')),/damaged/);
  assert.equal(await assetCount(),before);
});
test('storage failure halfway through a valid import rolls back its newly allocated assets',async()=>{
  const p=makeProject(false),a=uid(),b=uid();
  for(const id of [a,b])await putAudio(id,new Blob(['valid audio '+id],{type:'audio/wav'}));
  p.scenes[0].clips.push(...[a,b].map((id,i)=>({id:uid(),track:'music' as const,start:i,length:1,asset:'asset:'+id,name:'clip',volume:1,offset:0,muted:false})));
  const blob=await createMovieBackup(p);
  async function count(){return new Promise<number>((resolve,reject)=>{const r=indexedDB.open('sirvibe-media',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('files').objectStore('files').count();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};});}
  const before=await count(),original=IDBObjectStore.prototype.put;let writes=0;
  IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){
    if(this.name==='files'&&++writes===2)throw new DOMException('Storage full','QuotaExceededError');
    return original.call(this,value,key);
  };
  try {await assert.rejects(restoreMovie(new File([blob],'valid.sirvibe')),/Storage full/);}
  finally {IDBObjectStore.prototype.put=original;}
  assert.equal(await count(),before);
  assert(await getAudio(a));assert(await getAudio(b));
});
