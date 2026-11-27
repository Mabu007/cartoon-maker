import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {delimiter,join,dirname} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
function loadPackage(name){
  try{return require(name);}catch{
    for(const dir of process.env.PATH.split(delimiter)){
      const candidate=join(dirname(dir),name);
      if(existsSync(join(candidate,'package.json')))return require(candidate);
    }
  }throw Error('Required QA package unavailable: '+name);
}
const playwright=loadPackage('playwright');
const hosted=process.env.SIRVIBE_HOSTED_QA==='1';
const chromium=hosted?loadPackage('@sparticuz/chromium'):undefined;
const harness='qa-vector-runtime.html',svgHarness='qa-vector-runtime.tsx';
if(existsSync(harness)||existsSync(svgHarness))throw Error('Refusing to overwrite existing QA harness');
await writeFile(harness,'<!doctype html><html><head><meta charset="utf-8"><title>Vector QA</title></head><body><div id="qa-root"></div></body></html>');
await writeFile(svgHarness,`import React from 'react';import {createRoot} from 'react-dom/client';import {NativeCharacterPreview} from './src/ui/NativeCharacterPreview.tsx';const root=createRoot(document.getElementById('qa-root')!);export function draw(c:any,view:any,flip:boolean,action:any){root.render(<NativeCharacterPreview character={c} view={view} flip={flip} action={action} expression="happy" scale={1.2} frozenTime={.5}/>);}`);
const out='qa-vector-results';await mkdir(out,{recursive:true});
const dev=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'inherit'});
const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4180','--strictPort'],{stdio:'inherit'});
async function wait(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('Server not available '+url);}
let browser;const report={source:process.env.GITHUB_SHA??process.env.VERCEL_GIT_COMMIT_SHA??'local',browser:'',errors:[],samples:[],offline:null};
try{
  await Promise.all([wait('http://127.0.0.1:4179'),wait('http://127.0.0.1:4180')]);
  browser=await playwright.chromium.launch({headless:true,...(chromium?{executablePath:await chromium.executablePath()}:{}),args:[...(chromium?.args??[]),'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:960,height:660}});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:4179/'+harness);
  await page.evaluate(async()=>{
    const [{createRenderer},{makeProject},{studioCharacters,flagshipCharacters},{views}]=await Promise.all([
      import('/src/engine/renderer.ts'),import('/src/engine/presets.ts'),import('/src/engine/visualPresets.ts'),import('/src/engine/schema.ts')]);
    const renderer=await createRenderer('16:9',1,true),project=makeProject(true);
    const canvas=renderer.canvas;document.getElementById('qa-root').appendChild(canvas);document.body.style.margin='0';
    const fixture=(set)=>{const characters=project.characters.map((c,i)=>i<2?{...structuredClone(set[i]),id:c.id}:c);return characters;};
    window.qa={renderer,project,views,fixture,sets:[studioCharacters,flagshipCharacters]};
  });
  for(const set of [0,1]){
    for(const view of ['front','three-quarter','side','back-quarter','back'])for(const flip of [false,true]){
      await page.evaluate(({set,view,flip})=>{
        const {renderer,project,fixture,sets}=window.qa;
        const scene=structuredClone(project.scenes[0]);scene.actors.forEach(a=>{a.view=view;a.flip=flip;});
        renderer.draw(scene,fixture(sets[set]),0,{edit:true});
      },{set,view,flip});
      await page.locator('canvas').screenshot({path:out+'/'+(set?'upgrade':'baseline')+'-'+view+'-'+(flip?'mirror':'normal')+'.png'});
    }
    for(const time of [1.2,9.45,17.6]){
      await page.evaluate(({set,time})=>{const {renderer,project,fixture,sets}=window.qa;renderer.draw(project.scenes[0],fixture(sets[set]),time,{subtitles:true});},{set,time});
      await page.locator('canvas').screenshot({path:out+'/'+(set?'upgrade':'baseline')+'-time-'+time+'.png'});
    }
  }
  report.samples=await page.evaluate(()=>{
    const {renderer,project,fixture,sets}=window.qa,results=[];
    for(const set of [0,1,1,0]){
      const chars=fixture(sets[set]),scene=project.scenes[0],draw=t=>renderer.draw(scene,chars,t,{subtitles:true});
      for(let i=0;i<60;i++)draw(.2+i/24);
      const a=[];for(let i=0;i<160;i++){const t=performance.now();draw(.2+(i%96)/24);a.push(performance.now()-t);}
      a.sort((a,b)=>a-b);results.push({set:set?'upgrade':'baseline',count:a.length,medianMs:a[80],p95Ms:a[151]});
    }return results;
  });
  const fixture=await page.evaluate(async()=>{const {project,fixture,sets}=window.qa;const {resizeSceneTimeline}=await import('/src/engine/timelineEditing.ts');const cropped={...project,name:'Vector QA 3s',characters:fixture(sets[1]),scenes:[resizeSceneTimeline(project.scenes[0],3)]};return {format:'toonroom-backup-1',project:cropped,audio:{}};});
  await page.evaluate(()=>window.qa.renderer.destroy());
  await page.evaluate(async()=>{
    const {draw}=await import('/qa-vector-runtime.tsx');window.qa.svg=draw;
  });
  for(const i of [0,1])for(const view of ['front','three-quarter','side','back-quarter','back']){
    await page.evaluate(({i,view})=>window.qa.svg(window.qa.sets[1][i],view,false,'talk'),{i,view});
    await page.locator('.native-character-svg').waitFor();await page.locator('.native-character-svg').screenshot({path:out+'/svg-'+i+'-'+view+'.png'});
  }
  await context.close();
  const offline=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});const p=await offline.newPage();
  p.on('pageerror',e=>report.errors.push(e.message));await p.goto('http://127.0.0.1:4180/?studio=1');
  await p.waitForFunction(()=>navigator.serviceWorker.controller!==null,{},{timeout:60000});
  const cache=await p.evaluate(async()=>({keys:await caches.keys(),urls:(await Promise.all((await caches.keys()).map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)))).flat()}));
  assert(cache.urls.some(u=>u.includes('dsp.worker-')));assert(cache.urls.some(u=>u.includes('frameExport-')));
  await p.getByRole('heading',{name:'My cartoons'}).waitFor();
  await p.getByLabel('Import SIRVIBE project backup').setInputFiles({name:'qa.sirvibe',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await p.getByLabel('Project name').waitFor({timeout:30000});
  assert.equal(await p.getByLabel('Project name').inputValue(),'Vector QA 3s');
  await p.getByRole('button',{name:'Home',exact:true}).click();
  await p.getByLabel('Rename Vector QA 3s').waitFor({timeout:30000});
  await offline.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.getByLabel('Rename Vector QA 3s').waitFor({timeout:30000});
  await p.screenshot({path:out+'/offline-shell.png'});
  await p.locator('article').filter({has:p.getByLabel('Rename Vector QA 3s')}).locator('.project-cover').click();
  await p.getByLabel('Project name').waitFor();assert.equal(await p.getByLabel('Project name').inputValue(),'Vector QA 3s');
  await p.getByRole('button',{name:'Export video',exact:true}).click();await p.getByRole('button',{name:'Render video',exact:true}).click();
  const video=p.getByLabel('Exported video preview');await video.waitFor({timeout:180000});
  const metadata=await video.evaluate(async v=>{if(v.readyState<1)await new Promise((res,rej)=>{v.addEventListener('loadedmetadata',res,{once:true});v.addEventListener('error',rej,{once:true});});return {width:v.videoWidth,height:v.videoHeight,duration:v.duration};});
  assert(metadata.width>0&&metadata.height>0&&metadata.duration>2.5);
  const downloadPromise=p.waitForEvent('download');await p.getByRole('link',{name:/Download (WEBM|MP4)/}).click();const download=await downloadPromise;await download.saveAs(out+'/'+download.suggestedFilename());
  report.offline={shellReload:true,projectReopen:true,export:metadata,cacheKeys:cache.keys,resources:cache.urls.length};
  assert.equal(report.errors.length,0,report.errors.join('\n'));await offline.close();
}finally{
  await writeFile(out+'/results.json',JSON.stringify(report,null,2));await browser?.close();dev.kill();preview.kill();await Promise.all([unlink(harness),unlink(svgHarness)]);
}
console.log('QA_RESULTS '+JSON.stringify(report));
console.log('Browser QA complete; visual captures require review. Timings are CPU draw submission, not target hardware.');
