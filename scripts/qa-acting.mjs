/** Browser audition of actual Pixi frames; short silent WebM clips (built-in data only).
 * Dialogue/visemes are evaluated from the same timeline. Audio export is a separate gate. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
function load(name){try{return require(name);}catch{for(const dir of process.env.PATH.split(delimiter)){const p=join(dirname(dir),name);if(existsSync(join(p,'package.json')))return require(p);}throw Error('QA dependency missing: '+name);}}
const playwright=load('playwright'),chromium=load('@sparticuz/chromium'),harness='qa-acting-runtime.html',out='dist/qa-acting';
if(existsSync(harness))throw Error('QA harness already exists');
await mkdir(out,{recursive:true});await writeFile(harness,'<!doctype html><html><body style="margin:0"><div id="qa"></div></body></html>');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4179','--strictPort'],{stdio:'inherit'});
let browser;const report={source:process.env.VERCEL_GIT_COMMIT_SHA??'local',browser:'',samples:[],errors:[]};
try{
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:4179/'+harness)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,'Vite did not start');
 browser=await playwright.chromium.launch({headless:true,executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.startsWith('--disable-gpu')&&!a.startsWith('--use-angle')&&!a.startsWith('--use-gl')),'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.browser=browser.version();const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:4179/'+harness);
 await page.evaluate(async()=>{const [{createRenderer},{actingAudition}]=await Promise.all([import('/src/engine/renderer.ts'),import('/src/engine/actingAudition.ts')]);const renderer=await createRenderer('16:9',.75,true);document.querySelector('#qa').appendChild(renderer.canvas);window.qa={renderer,actingAudition};});
 const captures=[];
 for(const mode of ['off','confident','nervous','relaxed']){
  const data=await page.evaluate(async mode=>{
   const {renderer,actingAudition}=window.qa,p=actingAudition(mode==='off'?'confident':mode,mode!=='off'),s=p.scenes[0],chars=p.characters;
   const draw=t=>renderer.draw(s,chars,t,{subtitles:true}),pixels=()=>renderer.canvas.toDataURL('image/png');
   draw(2.3);const first=pixels();draw(5.1);draw(2.3);const seek=pixels();
   const times=[];for(let i=0;i<36;i++){const start=performance.now();draw(i/12);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
   // Record 4 seconds of identical scene time at 12fps. MediaRecorder
   // capture is visual-only: no audio claim or production-export claim.
   const stream=renderer.canvas.captureStream(0),track=stream.getVideoTracks()[0],mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
   const chunks=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1200000});
   const complete=new Promise((resolve,reject)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onerror=e=>reject(e.error??Error('Recorder failure'));rec.onstop=()=>resolve(new Blob(chunks,{type:mime}));});
   draw(.5);rec.start();for(let i=0;i<48;i++){draw(.5+i/12);track.requestFrame();await new Promise(r=>setTimeout(r,84));}
   rec.stop();const blob=await complete;stream.getTracks().forEach(t=>t.stop());
   const recording=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
   return {first,seekEqual:first===seek,recording,bytes:blob.size,p50Ms:times[18],p95Ms:times[34],samples:times.length,settings:chars[0].personality};
  },mode);
  assert(data.seekEqual,'Render seek mismatch '+mode);assert(data.bytes>1000,'Empty video '+mode);
  const bytes=Buffer.from(data.recording.split(',')[1],'base64');await writeFile(out+'/'+mode+'.webm',bytes);
  await writeFile(out+'/'+mode+'.png',Buffer.from(data.first.split(',')[1],'base64'));
  const {first,recording,...summary}=data;captures.push(first);report.samples.push({mode,...summary});console.log('ACTING_RENDER_QA '+JSON.stringify({mode,...summary}));
 }
 assert(captures[0]!==captures[1]&&captures[1]!==captures[2]&&captures[2]!==captures[3],'Profiles should render distinctly');
 await page.evaluate(()=>window.qa.renderer.destroy());assert.equal(report.errors.length,0,report.errors.join('\n'));await writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log('ACTING_RENDER_COMPLETE '+JSON.stringify(report));
}finally{await browser?.close();server.kill();await unlink(harness);}
