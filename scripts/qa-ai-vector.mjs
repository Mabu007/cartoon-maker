/** Actual Chromium native renderer and IndexedDB round-trip; no user data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
function load(name){try{return require(name);}catch{for(const dir of process.env.PATH.split(delimiter)){const p=join(dirname(dir),name);if(existsSync(join(p,'package.json')))return require(p);}throw Error('QA dependency missing: '+name);}}
const playwright=load('playwright'),chromium=load('@sparticuz/chromium'),out='dist/qa-ai-vector',harness='qa-ai-vector.html',entry='qa-ai-vector.tsx';
if(existsSync(harness)||existsSync(entry))throw Error('QA harness already exists');
await mkdir(out,{recursive:true});await writeFile(harness,'<!doctype html><html><body style="margin:0;background:#303039"><div id="qa"></div><script type="module" src="/'+entry+'"></script></body></html>');
await writeFile(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {NativeAssetLibrary} from './src/ui/NativeAssetLibrary.tsx';import {flagshipCharacters} from './src/engine/visualPresets.ts';import {applyNativePackage} from './src/engine/nativeAssetPackage.ts';import {createRenderer} from './src/engine/renderer.ts';import {characterAudition} from './src/engine/characterWorkspace.ts';import {listNativeAssets} from './src/services/nativeAssetStore.ts';import {generateAiVectorSpecification} from './src/engine/aiVectorSpecification.ts';import {makeProject} from './src/engine/presets.ts';import {ProjectDocument} from './src/engine/schema.ts';import {createMovieBackup,restoreMovie} from './src/services/projectExchange.ts';
const mount=document.querySelector('#qa');let character=structuredClone(flagshipCharacters[1]);const root=createRoot(mount);
root.render(<NativeAssetLibrary character={character} profile="curvy" apply={(packs,key)=>{character=applyNativePackage(character,packs,key);window.qa.character=character;}}/>);
window.qa={character,createRenderer,characterAudition,listNativeAssets,generateAiVectorSpecification,makeProject,ProjectDocument,createMovieBackup,restoreMovie};`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'inherit'});
let browser;const report={source:process.env.VERCEL_GIT_COMMIT_SHA??'local',browser:'',samples:[],errors:[]};
try{
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:4179/'+harness)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,'Vite unavailable');
 browser=await playwright.chromium.launch({headless:true,executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.startsWith('--disable-gpu')&&!a.startsWith('--use-angle')&&!a.startsWith('--use-gl')),'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.browser=browser.version();const context=await browser.newContext({viewport:{width:960,height:720},acceptDownloads:true}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:4179/'+harness);
 await page.getByText('AI vector specification · optional external workflow',{exact:true}).click();
 await page.getByLabel('AI asset task').selectOption('eyes');assert.equal(await page.getByRole('button',{name:'Copy AI Vector Asset Specification'}).count(),0);
 await page.getByLabel('AI asset task').selectOption('hair');await page.getByLabel('AI art brief').fill('Copper locs with restrained shading');
 const prompts=[];
 for(const [category,material,name] of [['hair','braid','Copper swept locks'],['shirt','fabric','Indigo tunic panel'],['accessory','spring','Brass ear pendant']]){
  await page.getByLabel('AI asset task').selectOption(category);await page.getByLabel('AI material preset').selectOption(material);
  const start=performance.now();await page.getByRole('button',{name:'Copy AI Vector Asset Specification'}).click();const prompt=await page.getByLabel('Generated AI vector specification').inputValue();assert(prompt.includes('RUNTIME JSON SCHEMA'));assert(prompt.includes('AUTHORED STARTER'));prompts.push({category,chars:prompt.length,clickMs:performance.now()-start});
  await writeFile(out+'/'+category+'-spec.txt',prompt);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download authored starter'}).click();const download=await pending;const bytes=await readFile(await download.path());await writeFile(out+'/'+category+'.sirvibe-assets',bytes);
  if(category==='hair'){
   await page.getByText('Paste external vector JSON',{exact:true}).click();await page.getByLabel('Paste native vector JSON').fill(bytes.toString());await page.getByRole('button',{name:'Validate pasted package'}).click();await page.getByLabel('Quarantined native vector preview').waitFor();
   assert.equal(await page.evaluate(async()=>(await window.qa.listNativeAssets()).length),0);await page.getByLabel('Native palette base').fill('#664433');await page.screenshot({path:out+'/quarantine.png',timeout:15000});
  }else await page.getByLabel('Import native package').setInputFiles({name:category+'.sirvibe-assets',mimeType:'application/json',buffer:bytes});
  await page.getByRole('button',{name:'Install validated package'}).click();await page.getByRole('button',{name:'Use '+name}).click();
 }
 report.prompts=prompts;
 await page.getByLabel('Import native package').setInputFiles({name:'evil.sirvibe-assets',mimeType:'application/json',buffer:Buffer.from('<svg onload="alert(1)"/>')});await page.getByRole('status').filter({hasText:'Only plain JSON'}).waitFor();assert.equal(await page.evaluate(async()=>(await window.qa.listNativeAssets()).length),3);
 const result=await page.evaluate(async()=>{const {character,createRenderer,characterAudition}=window.qa,renderer=await createRenderer('1:1',.8,true);document.body.appendChild(renderer.canvas);const {scene}=characterAudition(character,'talk','neutral','front',false,'expressive',60),off=characterAudition(character,'talk','neutral','front',false,'off',0).scene;
 const draw=(s,t)=>{renderer.draw(s,[character],t,{});return renderer.canvas.toDataURL('image/png');};const a=draw(off,1.7),b=draw(scene,1.7);draw(scene,2.2);const seek=draw(scene,1.7);
 const times=[];for(let i=0;i<60;i++){const start=performance.now();renderer.draw(scene,[character],i/30,{});times.push(performance.now()-start);}times.sort((a,b)=>a-b);
 const result={changed:a!==b,seekEqual:b===seek,parts:character.visual.vectorComponents.length,metrics:renderer.secondaryMetrics(),p50Ms:times[30],p95Ms:times[57],before:a,after:b};renderer.destroy();return result;});
 assert.equal(result.parts,6);assert(result.changed,'Physics did not change rendered pixels');assert(result.seekEqual,'Seek pixel mismatch');
 for(const name of ['before','after'])await writeFile(out+'/'+name+'.png',Buffer.from(result[name].split(',')[1],'base64'));const {before,after,...summary}=result;report.samples.push(summary);
 const saved=await page.evaluate(async()=>{const q=window.qa,p=q.makeProject(true),c={...q.character,id:p.characters[0].id};p.characters[0]=c;const blob=await q.createMovieBackup(q.ProjectDocument.parse(p));const restored=await q.restoreMovie(new File([blob],'ai-authored.sirvibe'));return JSON.stringify(restored.characters[0].visual)===JSON.stringify(c.visual);});assert(saved,'Embedded geometry backup changed');report.backupRoundTrip=saved;
 // Reopen same IndexedDB database in new document, then read installed
 // geometry with networking disabled. This is offline library access, not
 // an entire service worker reload/export test.
 await page.reload();await page.getByRole('button',{name:'Use Brass ear pendant'}).waitFor();await context.setOffline(true);
 assert.equal(await page.evaluate(async()=>(await window.qa.listNativeAssets()).length),3);
 report.offlineLibrary=true;assert.equal(report.errors.length,0,report.errors.join('\n'));console.log('AI_VECTOR_QA '+JSON.stringify(report));await context.close();
}finally{await writeFile(out+'/results.json',JSON.stringify(report,null,2));await browser?.close();server.kill();await Promise.all([unlink(harness),unlink(entry)]);}
