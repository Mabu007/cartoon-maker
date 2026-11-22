import { test } from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {offlineBundle} from '../scripts/pwa.mjs';
test('worker-only updates get a new cache identity while unchanged builds are deterministic',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sirvibe-pwa-'));
  try {
    const dir=join(root,'dist'),template=join(root,'sw-template.js');await mkdir(dir);
    await writeFile(join(dir,'index.html'),'<html>studio</html>');
    await writeFile(template,'const VERSION=__VERSION__;const PRECACHE=__PRECACHE__;');
    const plugin=offlineBundle(template);
    await plugin.writeBundle({dir});
    const first=JSON.parse(await readFile(join(dir,'offline-manifest.json'),'utf8'));
    await plugin.writeBundle({dir});
    assert.equal(JSON.parse(await readFile(join(dir,'offline-manifest.json'),'utf8')).version,first.version);
    await writeFile(template,'const VERSION=__VERSION__;const PRECACHE=__PRECACHE__;/* worker fix */');
    await plugin.writeBundle({dir});
    const second=JSON.parse(await readFile(join(dir,'offline-manifest.json'),'utf8'));
    assert.notEqual(second.version,first.version);
    assert.deepEqual(second.urls,['/index.html']);
  } finally {await rm(root,{recursive:true,force:true});}
});
