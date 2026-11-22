import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('dist/offline-manifest.json','utf8'));
const worker=await readFile('dist/sw.js','utf8');
assert(manifest.urls.includes('/index.html'));
assert(manifest.urls.includes('/manifest.webmanifest'));
assert(manifest.urls.some(url=>url.includes('dsp.worker-')));
assert(manifest.urls.some(url=>url.includes('frameExport-')));
assert(manifest.urls.some(url=>url.includes('recorderWebm-')));
let bytes=0;
for(const url of manifest.urls){assert(worker.includes(JSON.stringify(url)));bytes+=(await stat('dist'+url)).size;}
const html=await readFile('dist/index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g))assert(manifest.urls.includes(match[1]),'Missing offline resource: '+match[1]);
console.log(`Verified offline bundle ${manifest.version}: ${manifest.urls.length} files, ${(bytes/1048576).toFixed(2)} MiB. Includes DSP worker, video exporters, local assets and lazy libraries.`);
