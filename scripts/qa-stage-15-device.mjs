/** Run with Chromium on the N4020. QA_SOFTWARE=1 enables a smoke run on other hosts. */
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {delimiter,dirname,join,resolve} from 'node:path';
import os from 'node:os';

const require=createRequire(import.meta.url);
function loadPlaywright(){
 try{return require('playwright');}catch{
  for(const bin of (process.env.PATH??'').split(delimiter)){
   const path=join(dirname(bin),'playwright');
   if(existsSync(join(path,'package.json')))return require(path);
  }
  throw Error('Run with npm exec --yes --package=playwright@1.51.1');
 }
}
const smoke=process.env.QA_SOFTWARE==='1';
const seconds=Number(process.env.QA_SOAK_SECONDS??(smoke?8:1200));
assert(Number.isFinite(seconds)&&seconds>=4&&seconds<=1200,'QA_SOAK_SECONDS must be between 4 and 1200');
const out=resolve(process.env.QA_OUT??'qa-stage-15-device-results');
const fixture='qa-stage-15-device.html',port=Number(process.env.QA_PORT??4189);
assert(!existsSync(fixture),'The benchmark harness already exists');
assert(!existsSync(join(out,'report.json')),'Use a fresh QA_OUT directory');
const chromiumPath=process.env.CHROMIUM_EXECUTABLE??['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync);
const cpu=os.cpus()[0]?.model??'unknown';
const report={sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),cpu,ramBytes:os.totalmem(),
 browser:null,gpu:null,smoke,samples:[],rss:[],errors:[],offline:null};
const budgets={intervalP95Ms:35,over50Ratio:.01,lveP95Ms:2,warmSeekP95Ms:250};
let browser,rssTimer;
const {chromium}=loadPlaywright();
await mkdir(out,{recursive:true});
await writeFile(fixture,'<!doctype html><html><body style="margin:0"><main id="qa"></main></body></html>',{flag:'wx'});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'inherit'});
function recordRss(){
 try{
  const rows=execFileSync('ps',['-e','-o','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
  const parents=new Set([process.pid]);
  for(let size=-1;size!==parents.size;){size=parents.size;for(const [pid,parent] of rows)if(parents.has(parent))parents.add(pid);}
  const rssKiB=rows.reduce((n,[pid,,rss])=>n+(parents.has(pid)?rss:0),0);
  report.rss.push({elapsedMs:Math.round(process.uptime()*1000),processTreeRssKiB:rssKiB});
 }catch(error){report.rssError=String(error);}
}
try{
 const url=`http://127.0.0.1:${port}/${fixture}`;
 let ready=false;
 for(let i=0;i<100;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 assert(ready,'Vite did not start');
 browser=await chromium.launch({headless:smoke||process.env.QA_HEADED==='0',executablePath:chromiumPath,
  args:['--enable-webgl','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 report.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1280,height:760},deviceScaleFactor:1});
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(url);
 report.gpu=await page.evaluate(async()=>{
  const [{createRenderer},{secondaryMotionAudition},{cinematicPresets}]=await Promise.all([
   import('/src/engine/renderer.ts'),import('/src/engine/secondaryMotionAudition.ts'),import('/src/engine/vvlePresets.ts')]);
  const renderer=await createRenderer('16:9',4/3,true);
  document.querySelector('#qa').appendChild(renderer.canvas);
  window.benchmark={renderer,secondaryMotionAudition,cinematicPresets};
  renderer.canvas.addEventListener('webglcontextlost',()=>{window.benchmark.contextLost=true;});
  const gl=renderer.canvas.getContext('webgl2');
  const info=gl?.getExtension('WEBGL_debug_renderer_info');
  return {webgl2:Boolean(gl),vendor:info?gl.getParameter(info.UNMASKED_VENDOR_WEBGL):null,
   renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null,
   width:renderer.canvas.width,height:renderer.canvas.height};
 });
 assert.equal(report.gpu.width,1280);assert.equal(report.gpu.height,720);
 assert(report.gpu.webgl2,'WebGL 2 is required for the benchmark');
 if(!smoke){
  assert(/N4020/i.test(cpu),'The benchmark requires an Intel N4020. Use QA_SOFTWARE=1 for a smoke run.');
  assert(report.gpu.renderer&&/Intel/i.test(report.gpu.renderer)&&!/swiftshader|llvmpipe|software/i.test(report.gpu.renderer),'No Intel hardware WebGL evidence');
 }
 try{report.offline=JSON.parse(await readFile('dist/offline-manifest.json','utf8')).version;}catch{/* Run npm run build for offline manifest metadata. */}
 recordRss();rssTimer=setInterval(recordRss,30_000);
 const workload=async ({cast,duration,moving})=>{
  const {renderer,secondaryMotionAudition,cinematicPresets}=window.benchmark;
  const {characters,scenes:[scene]}=secondaryMotionAudition(cast);
  if(moving){
   Object.assign(scene.visual,structuredClone(cinematicPresets.portrait));
   scene.visual.lighting.lights[0].keys=[{time:0,x:200,y:140,intensity:1.1},{time:11,x:720,y:230,intensity:.85},{time:21,x:280,y:160,intensity:1.1}];
  }
  const stats=values=>{
   const sorted=[...values].sort((a,b)=>a-b);
   const at=p=>sorted[Math.floor((sorted.length-1)*p)]??null;
   return {count:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99)};
  };
  const profile={evaluateMs:[],characterPhysicsMs:[],worldPhysicsMs:[],paintMs:[],submissionMs:[]};
  const drawOptions={onTiming:timing=>{for(const key of Object.keys(profile))profile[key].push(timing[key]);}};
  const interval=[],heap=[];
  const atFrame=()=>new Promise(r=>requestAnimationFrame(r));
  const started=await atFrame();
  let lastIndex=-1,lastDraw=started,nextHeap=0,missed=0;
  for(;;){
   const stamp=await atFrame(),elapsed=stamp-started;
   if(window.benchmark.contextLost)throw Error('WebGL context lost during playback');
   if(elapsed>duration*1000)break;
   const index=Math.floor((elapsed+1)*30/1000);
   if(index===lastIndex)continue;
   if(lastIndex>=0){interval.push(stamp-lastDraw);missed+=Math.max(0,index-lastIndex-1);}
   if(elapsed>=nextHeap){heap.push({elapsedMs:elapsed,bytes:performance.memory?.usedJSHeapSize??null});nextHeap+=30_000;}
   renderer.draw(scene,characters,(index/30)%scene.duration,drawOptions);
   lastIndex=index;lastDraw=stamp;
  }
  const seek=(times)=>times.map(time=>{const start=performance.now();renderer.draw(scene,characters,time);return performance.now()-start;});
  const coldSeek=seek([0,scene.duration-.5]);
  const warmSeek=seek([28.8,28.9,29,29.2,29.4,29.5,29.4,29.2,29,.3,.4,.5,.6]);
  return {cast,duration,moving,interval:stats(interval),over50Ratio:interval.filter(ms=>ms>50).length/Math.max(1,interval.length),
   missed,heap,volume:renderer.volumeMetrics(),coldSeekMs:coldSeek,warmSeekMs:stats(warmSeek),profile:Object.fromEntries(Object.entries(profile).map(([key,values])=>[key,stats(values)]))};
 };
 for(const config of [{cast:2,duration:smoke?4:30,moving:false},{cast:3,duration:seconds,moving:true}]){
  const result=await page.evaluate(workload,config);
  assert(result.interval.count>=2,'Insufficient playback samples');
  report.samples.push(result);recordRss();
  await page.locator('canvas').screenshot({path:join(out,`${config.cast}-actors.png`)});
 }
 await page.evaluate(()=>window.benchmark.renderer.destroy());
 report.budgets=budgets;
 report.meetsSampledBudgets=report.samples.every(sample=>sample.interval.p95<=budgets.intervalP95Ms&&
  sample.over50Ratio<=budgets.over50Ratio&&sample.warmSeekMs.p95<=budgets.warmSeekP95Ms&&
  sample.profile.characterPhysicsMs.p95+sample.profile.worldPhysicsMs.p95<=budgets.lveP95Ms);
 assert.equal(report.errors.length,0,report.errors.join('\n'));
 if(!smoke)assert(report.meetsSampledBudgets,'Playback, physics or seek exceeded the sampled budgets');
}catch(error){report.errors.push(String(error));throw error;}
finally{
 clearInterval(rssTimer);
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
 await browser?.close();server.kill();await unlink(fixture);
}
console.log(`Device benchmark report: ${join(out,'report.json')}`);
