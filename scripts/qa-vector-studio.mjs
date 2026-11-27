import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {delimiter,join,dirname} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{
  for(const dir of process.env.PATH.split(delimiter)){
    const candidate=join(dirname(dir),'playwright');
    if(existsSync(join(candidate,'package.json'))){playwright=require(candidate);break;}
  }
}
if(!playwright)throw Error('Install playwright@1.51.1 via npm exec before running QA');
const out='qa-vector-results';await mkdir(out,{recursive:true});
const dev=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'inherit'});
const preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4180','--strictPort'],{stdio:'inherit'});
async function wait(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw Error('Server not available '+url);}
let browser;const report={source:process.env.GITHUB_SHA??process.env.VERCEL_GIT_COMMIT_SHA??'local',browser:'',errors:[],samples:[],offline:null};
try{
  await Promise.all([wait('http://127.0.0.1:4179'),wait('http://127.0.0.1:4180')]);
  browser=await playwright.chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:960,height:660}});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:4179');
  await page.evaluate(async()=>{
    const [{createRenderer},{makeProject},{studioCharacters,flagshipCharacters},{views}]=await Promise.all([
      import('/src/engine/renderer.ts'),import('/src/engine/presets.ts'),import('/src/engine/visualPresets.ts'),import('/src/engine/schema.ts')]);
    const renderer=await createRenderer('16:9',1,true),project=makeProject(true);
    const canvas=renderer.canvas;document.body.replaceChildren(canvas);document.body.style.margin='0';
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
  await page.evaluate(()=>window.qa.renderer.destroy());await context.close();
  const offline=await browser.newContext();const p=await offline.newPage();
  p.on('pageerror',e=>report.errors.push(e.message));await p.goto('http://127.0.0.1:4180');
  await p.waitForFunction(()=>navigator.serviceWorker.controller!==null,{},{timeout:60000});
  const cache=await p.evaluate(async()=>({keys:await caches.keys(),urls:(await Promise.all((await caches.keys()).map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)))).flat()}));
  assert(cache.urls.some(u=>u.includes('dsp.worker-')));assert(cache.urls.some(u=>u.includes('frameExport-')));
  await offline.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await p.screenshot({path:out+'/offline-shell.png'});
  report.offline={shellReload:true,cacheKeys:cache.keys,resources:cache.urls.length};
  assert.equal(report.errors.length,0,report.errors.join('\n'));await offline.close();
}finally{
  await writeFile(out+'/results.json',JSON.stringify(report,null,2));await browser?.close();dev.kill();preview.kill();
}
console.log('Browser QA complete; visual captures require review. Timings are CPU draw submission, not target hardware.');
