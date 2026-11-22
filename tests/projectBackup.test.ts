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
