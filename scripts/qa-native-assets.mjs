/** Actual Chromium native renderer and IndexedDB round-trip; no user data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
function load(name){try{return require(name);}catch{for(const dir of process.env.PATH.split(delimiter)){const p=join(dirname(dir),name);if(existsSync(join(p,'package.json')))return require(p);}throw Error('QA dependency missing: '+name);}}
const playwright=load('playwright'),chromium=load('@sparticuz/chromium'),out='dist/qa-native-assets',harness='qa-native-assets.html',entry='qa-native-assets.tsx';
if(existsSync(harness)||existsSync(entry))throw Error('QA harness already exists');
await mkdir(out,{recursive:true});await writeFile(harness,'<!doctype html><html><body style="margin:0;background:#303039"><div id="qa"></div><script type="module" src="/'+entry+'"></script></body></html>');
await writeFile(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {NativeAssetLibrary} from './src/ui/NativeAssetLibrary.tsx';import {flagshipCharacters} from './src/engine/visualPresets.ts';import {applyNativePackage} from './src/engine/nativeAssetPackage.ts';import {createRenderer} from './src/engine/renderer.ts';import {characterAudition} from './src/engine/characterWorkspace.ts';import {listNativeAssets} from './src/services/nativeAssetStore.ts';import {Application,Graphics} from 'pixi.js';import {drawVectorRegions} from './src/engine/vectorArtworkRender.ts';import {vectorDrawList} from './src/engine/vectorArtwork.ts';
const mount=document.querySelector('#qa');let character=structuredClone(flagshipCharacters[1]);const root=createRoot(mount);
root.render(<NativeAssetLibrary profile={character.visual.profile} character={character} apply={(packs,key)=>{character=applyNativePackage(character,packs,key);window.qa.character=character;}}/>);
window.qa={character,createRenderer,characterAudition,listNativeAssets,Application,Graphics,drawVectorRegions,vectorDrawList};`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'inherit'});
let browser;const report={source:process.env.VERCEL_GIT_COMMIT_SHA??'local',browser:'',samples:[],errors:[]};
try{
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:4179/'+harness)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,'Vite unavailable');
 browser=await playwright.chromium.launch({headless:true,executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.startsWith('--disable-gpu')&&!a.startsWith('--use-angle')&&!a.startsWith('--use-gl')),'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.browser=browser.version();const context=await browser.newContext({viewport:{width:960,height:720}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:4179/'+harness);
 await page.getByRole('button',{name:'Example hair'}).click();await page.getByLabel('Quarantined native vector preview').waitFor();assert.equal(await page.evaluate(async()=>(await window.qa.listNativeAssets()).length),0);
 await page.getByLabel('Native palette base').fill('#664433');await page.screenshot({path:out+'/quarantine.png',timeout:15000});await page.getByRole('button',{name:'Install validated package'}).click();await page.getByRole('button',{name:'Use Copper swept locks'}).click();
 for(const [kind,name] of [['clothing','Indigo tunic panel'],['accessory','Brass ear pendant']]){await page.getByRole('button',{name:'Example '+kind}).click();await page.getByRole('button',{name:'Install validated package'}).click();await page.getByRole('button',{name:'Use '+name}).click();}
 await page.getByLabel('Import native package').setInputFiles({name:'evil.sirvibe-assets',mimeType:'application/json',buffer:Buffer.from('<svg onload="alert(1)"/>')});await page.getByRole('status').filter({hasText:'Only plain JSON'}).waitFor();assert.equal(await page.evaluate(async()=>(await window.qa.listNativeAssets()).length),3);
 const result=await page.evaluate(async()=>{const {character,createRenderer,characterAudition}=window.qa,renderer=await createRenderer('1:1',.8,true);document.body.appendChild(renderer.canvas);const {scene}=characterAudition(character,'talk','neutral','front',false,'expressive',60),off=characterAudition(character,'talk','neutral','front',false,'off',0).scene;
 const draw=(s,t)=>{renderer.draw(s,[character],t,{});return renderer.canvas.toDataURL('image/png');};const a=draw(off,1.7),b=draw(scene,1.7);draw(scene,2.2);const seek=draw(scene,1.7);
 const times=[];for(let i=0;i<60;i++){const start=performance.now();renderer.draw(scene,[character],i/30,{});times.push(performance.now()-start);}times.sort((a,b)=>a-b);
 const result={changed:a!==b,seekEqual:b===seek,parts:character.visual.vectorComponents.length,metrics:renderer.secondaryMetrics(),p50Ms:times[30],p95Ms:times[57],before:a,after:b};renderer.destroy();return result;});
 assert.equal(result.parts,6);assert(result.changed,'Physics did not change rendered pixels');assert(result.seekEqual,'Seek pixel mismatch');
 for(const name of ['before','after'])await writeFile(out+'/'+name+'.png',Buffer.from(result[name].split(',')[1],'base64'));const {before,after,...summary}=result;report.samples.push(summary);
 await page.getByText('Import editable SVG',{exact:true}).click();
 await page.getByLabel('SVG artwork rights').fill('Original QA artwork');
 await page.getByLabel('SVG artwork source').fill('SIRVIBE native package browser fixture');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80"><path fill="#c06020" fill-rule="evenodd" d="M-38 -38 L38 -38 L38 38 L-38 38 Z M-25 -25 L-2 -25 L-2 25 L-25 25 Z M5 -25 L25 -25 L25 25 L5 25 Z M10 -10 L20 -10 L20 10 L10 10 Z"/></svg>';
 await page.getByLabel('Import editable SVG',{exact:true}).setInputFiles({name:'Compound face sheet.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
 await page.getByLabel('Quarantined native vector preview').waitFor();
 await page.getByRole('button',{name:'Install validated package'}).click();
 await page.getByRole('button',{name:'Use Compound face sheet'}).click();
 const fillPixels=await page.evaluate(async()=>{
  const {character,Application,Graphics,drawVectorRegions,vectorDrawList}=window.qa;
  const art=character.visual.vectorComponents.find(part=>part.slot==='head-base').artwork;
  const app=new Application();
  await app.init({width:100,height:100,background:'#ffffff',autoStart:false,preference:'webgl',preserveDrawingBuffer:true});
  const g=new Graphics();app.stage.addChild(g);
  const draw=rule=>{
   const layers=vectorDrawList({...art,regions:art.regions.map(region=>({...region,fillRule:rule}))});
   drawVectorRegions(g.clear(),layers,[1,0,0,1,50,50]);app.render();
   const read=document.createElement('canvas');read.width=100;read.height=100;
   const ctx=read.getContext('2d');ctx.drawImage(app.canvas,0,0);
   return [16,30,57,65,90].map(x=>Array.from(ctx.getImageData(x,50,1,1).data).slice(0,3));
  };
  const result={evenodd:draw('evenodd'),nonzero:draw('nonzero')};
  app.destroy(true,{children:true});return result;
 });
 const paint=[192,96,32],background=[255,255,255];
 assert.deepEqual(fillPixels.evenodd,[paint,background,background,paint,background]);
 assert.deepEqual(fillPixels.nonzero,[paint,paint,paint,paint,background]);
 report.importedSvg=fillPixels;
 // Reopen same IndexedDB database in new document, then read installed
 // geometry with networking disabled. This is offline library access, not
 // an entire service worker reload/export test.
 await page.reload();await page.getByRole('button',{name:'Use Brass ear pendant'}).waitFor();await context.setOffline(true);
 assert.equal(await page.evaluate(async()=>(await window.qa.listNativeAssets()).length),4);
 report.offlineLibrary=true;assert.equal(report.errors.length,0,report.errors.join('\n'));console.log('NATIVE_ASSET_QA '+JSON.stringify(report));await context.close();
}finally{await writeFile(out+'/results.json',JSON.stringify(report,null,2));await browser?.close();server.kill();await Promise.all([unlink(harness),unlink(entry)]);}
