/** Actual Chromium renderer audition; run against built-in project only. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
function load(name){try{return require(name);}catch{for(const dir of process.env.PATH.split(delimiter)){const p=join(dirname(dir),name);if(existsSync(join(p,'package.json')))return require(p);}throw Error('QA dependency missing: '+name);}}
const playwright=load('playwright'),chromium=load('@sparticuz/chromium'),harness='qa-lve-character-runtime.html',out='dist/qa-lve-character';
if(existsSync(harness))throw Error('QA harness already exists');
await mkdir(out,{recursive:true});await writeFile(harness,'<!doctype html><html><body style="margin:0"><div id="qa"></div></body></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'inherit'});
let browser;const report={source:process.env.VERCEL_GIT_COMMIT_SHA??'local',browser:'',samples:[],errors:[]};
try{
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:4179/'+harness)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,'Vite did not start');
 browser=await playwright.chromium.launch({headless:true,executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.startsWith('--disable-gpu')&&!a.startsWith('--use-angle')&&!a.startsWith('--use-gl')),'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.browser=browser.version();const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:4179/'+harness);
 await page.evaluate(async()=>{const [{createRenderer},{secondaryMotionAudition}]=await Promise.all([import('/src/engine/renderer.ts'),import('/src/engine/secondaryMotionAudition.ts')]);const renderer=await createRenderer('16:9',.75,true);document.querySelector('#qa').appendChild(renderer.canvas);window.qa={renderer,secondaryMotionAudition};});
 for(const cast of [2,3]){
  const result=await page.evaluate(cast=>{const {renderer,secondaryMotionAudition}=window.qa,p=secondaryMotionAudition(cast),scene=p.scenes[0],chars=p.characters,off={...scene,visual:{...scene.visual,secondaryMotion:{...scene.visual.secondaryMotion,enabled:false}}};
   const pixels=()=>renderer.canvas.toDataURL('image/png');
   renderer.draw(off,chars,1.5,{});const before=pixels();renderer.draw(scene,chars,1.5,{});const on=pixels();renderer.draw(scene,chars,2.5,{});renderer.draw(scene,chars,1.5,{});const seek=pixels();renderer.draw(off,chars,1.5,{});const after=pixels();
   const modes=[];for(const [mode,s] of [['off',off],['on',scene]]){const times=[];for(let i=0;i<12;i++)renderer.draw(s,chars,i/30,{});for(let i=0;i<60;i++){const start=performance.now();renderer.draw(s,chars,(i+12)/30,{});times.push(performance.now()-start);}times.sort((a,b)=>a-b);modes.push({mode,p50Ms:times[30],p95Ms:times[57],metrics:renderer.secondaryMetrics()});}
   return {cast,changed:before!==on,disabledEqual:before===after,seekEqual:on===seek,modes,before,on};
  },cast);
  assert(result.changed,'No visible physics change');assert(result.disabledEqual,'Disabled visual differs');assert(result.seekEqual,'Seek changed pixel output');
  for(const mode of ['before','on']){const bytes=Buffer.from(result[mode].split(',')[1],'base64');await writeFile(out+'/'+cast+'-'+mode+'.png',bytes);}
  const {before,on,...summary}=result;report.samples.push(summary);console.log('LVE_CHARACTER_QA '+JSON.stringify(summary));
 }
 await page.evaluate(()=>window.qa.renderer.destroy());assert.equal(report.errors.length,0,report.errors.join('\n'));await writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log('LVE_CHARACTER_COMPLETE '+JSON.stringify(report));
}finally{await browser?.close();server.kill();await unlink(harness);}
