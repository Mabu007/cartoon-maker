/** Hosted Chromium: actual Pixi render, deterministic seek, silent recording.
 * The production offline reopen is a separate gate after visual proof. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
function load(name){try{return require(name);}catch{for(const dir of process.env.PATH.split(delimiter)){const p=join(dirname(dir),name);if(existsSync(join(p,'package.json')))return require(p);}throw Error('QA dependency missing: '+name);}}
const playwright=load('playwright'),chromium=load('@sparticuz/chromium'),harness='qa-living-world.html',out='dist/qa-living-world';
if(existsSync(harness))throw Error('QA harness already exists');
await mkdir(out,{recursive:true});await writeFile(harness,'<!doctype html><html><body style="margin:0"><div id="qa"></div></body></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'inherit'});
const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4180','--strictPort'],{stdio:'inherit'});
let browser;const report={source:process.env.VERCEL_GIT_COMMIT_SHA??'local',browser:'',samples:[],errors:[]};
try{
 for(const port of [4179,4180]){let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:'+port)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,'Vite unavailable '+port);}
 browser=await playwright.chromium.launch({headless:true,executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.startsWith('--disable-gpu')&&!a.startsWith('--use-angle')&&!a.startsWith('--use-gl')),'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.browser=browser.version();const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:4179/'+harness);
 const fixture=await page.evaluate(async()=>{const [{createRenderer},{livingWorldAudition},{makeWorldSet},{createMovieBackup,restoreMovie}]=await Promise.all([import('/src/engine/renderer.ts'),import('/src/engine/livingWorldAudition.ts'),import('/src/engine/worldCatalog.ts'),import('/src/services/projectExchange.ts')]);const p=livingWorldAudition();p.name='Living World QA';const renderer=await createRenderer('16:9',.75,true);document.querySelector('#qa').appendChild(renderer.canvas);window.qa={renderer,p,makeWorldSet,createMovieBackup,restoreMovie};return {format:'toonroom-backup-1',project:p,audio:{}};});
 for(const mode of ['off','on']){const data=await page.evaluate(async mode=>{const {renderer,p}=window.qa,s=structuredClone(p.scenes[0]),chars=p.characters;s.visual.secondaryMotion.enabled=mode==='on';
 const draw=t=>renderer.draw(s,chars,t,{subtitles:true}),pixels=()=>renderer.canvas.toDataURL('image/png');
 draw(1.5);const first=pixels();draw(7.5);const camera=pixels();draw(1.5);const seek=pixels();
 const times=[];for(let i=0;i<90;i++){const start=performance.now();draw(i/30);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
 const metrics={world:renderer.worldMetrics(),characters:renderer.secondaryMetrics()};
 const stream=renderer.canvas.captureStream(0),track=stream.getVideoTracks()[0],mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
 const chunks=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1600000});const complete=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onerror=e=>reject(e.error??Error('Recorder failure'));rec.onstop=()=>resolve(new Blob(chunks,{type:mime}));});
 draw(.2);rec.start();for(let i=0;i<84;i++){draw(.2+i/12);track.requestFrame();await new Promise(r=>setTimeout(r,84));}rec.stop();const blob=await complete;stream.getTracks().forEach(t=>t.stop());
 const recording=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 return {first,camera,seekEqual:first===seek,recording,bytes:blob.size,p50Ms:times[45],p95Ms:times[85],samples:times.length,metrics};},mode);
 assert(data.seekEqual,'Seek mismatch '+mode);assert(data.bytes>1000,'Empty recording');await writeFile(out+'/'+mode+'.png',Buffer.from(data.first.split(',')[1],'base64'));await writeFile(out+'/'+mode+'-camera.png',Buffer.from(data.camera.split(',')[1],'base64'));await writeFile(out+'/'+mode+'.webm',Buffer.from(data.recording.split(',')[1],'base64'));const {first,camera,recording,...summary}=data;report.samples.push({mode,...summary});console.log('WORLD_RENDER '+JSON.stringify({mode,...summary}));if(mode==='off')report.baseline=first;else{assert.notEqual(first,report.baseline,'No world/character motion pixels changed');delete report.baseline;}}
 for(const name of ['Living room','Township street','Shop','Podcast studio']){const data=await page.evaluate(name=>{const {renderer,p,makeWorldSet}=window.qa,s=structuredClone(p.scenes[0]);s.visual.world=makeWorldSet(name);renderer.draw(s,p.characters,1.5);return renderer.canvas.toDataURL('image/png');},name);await writeFile(out+'/'+name.replaceAll(' ','-')+'.png',Buffer.from(data.split(',')[1],'base64'));}
 const backed=await page.evaluate(async()=>{const q=window.qa,restored=await q.restoreMovie(new File([await q.createMovieBackup(q.p)],'world.sirvibe'));return JSON.stringify(restored.scenes[0].visual.world)===JSON.stringify(q.p.scenes[0].visual.world);});assert(backed);report.backupRoundTrip=true;await page.evaluate(()=>window.qa.renderer.destroy());assert.equal(report.errors.length,0,report.errors.join('\n'));console.log('WORLD_RENDER_COMPLETE '+JSON.stringify(report));await writeFile(out+'/render-results.json',JSON.stringify(report,null,2));
 // Actual built production shell, same browser/page to avoid single-process
 // Chromium context shutdown; service worker offline reload and saved scene.
 await page.goto('http://127.0.0.1:4180/?studio=1');await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{},{timeout:60000});await page.getByLabel('Import SIRVIBE project backup').setInputFiles({name:'living-world.sirvibe',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await page.getByLabel('Project name').waitFor({timeout:30000});assert.equal(await page.getByLabel('Project name').inputValue(),'Living World QA');await page.getByRole('button',{name:'Home',exact:true}).click();await page.getByLabel('Rename Living World QA').waitFor({timeout:30000});await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel('Rename Living World QA').waitFor({timeout:30000});await page.locator('article').filter({has:page.getByLabel('Rename Living World QA')}).locator('.project-cover').click();await page.getByLabel('Project name').waitFor();assert.equal(await page.getByLabel('Project name').inputValue(),'Living World QA');await page.screenshot({path:out+'/offline-reopened.png',timeout:15000});report.offlineReopen=true;assert.equal(report.errors.length,0,report.errors.join('\n'));console.log('WORLD_QA_COMPLETE '+JSON.stringify(report));
}finally{await writeFile(out+'/results.json',JSON.stringify(report,null,2));await browser?.close();server.kill();preview.kill();await unlink(harness);}
