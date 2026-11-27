// Stage 15A same-art comparison. Run this identical script from both worktrees.
// npm exec --yes --package=playwright@1.51.1 -- node /path/to/qa-stage-15a-baseline.mjs
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,dirname,delimiter} from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
if(process.argv[2]==='--compare'){
 const [a,b]=await Promise.all(process.argv.slice(3,5).map(p=>readFile(p,'utf8').then(JSON.parse)));
 assert.equal(a.fixtureVersion,b.fixtureVersion);
 assert.deepEqual(a.audioHashes,b.audioHashes,'Audio assets differ');
 assert.deepEqual(a.snapshots,b.snapshots,'Resolved pose/viseme/gaze/hand/foot snapshots differ');
 const mismatches=Object.keys(a.images).filter(k=>a.images[k]!==b.images[k]);
 console.log(JSON.stringify({baseline:a.sha,candidate:b.sha,pixelHashMismatches:mismatches,baselineTiming:a.timing,candidateTiming:b.timing,baselineGPU:a.gpu,candidateGPU:b.gpu},null,2));
 assert.deepEqual(Object.keys(a.images),Object.keys(b.images));assert.deepEqual(mismatches,[],'PNG hash differs; inspect pixels and environment');
 process.exit(0);
}
const require=createRequire(join(process.cwd(),'package.json'));
function loadPlaywright(){try{return require('playwright');}catch{
 for(const dir of (process.env.PATH??'').split(delimiter)){
  const path=join(dirname(dir),'playwright');
  if(existsSync(join(path,'package.json')))return require(path);
 }
 throw Error('Playwright missing; use npm exec --yes --package=playwright@1.51.1 -- node <script>');
}}
const {chromium}=loadPlaywright();
const out=resolve(process.env.QA_OUT??'qa-stage-15a-results');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const port=Number(process.env.QA_PORT??4189);
const harness='qa-stage-15a-runtime.html';
assert(!existsSync(harness),'Refusing to overwrite harness');
assert(!existsSync(join(out,'report.json')),'Use a fresh QA_OUT directory per run');
await mkdir(out,{recursive:true});
await writeFile(harness,'<!doctype html><html><head><meta charset="utf-8"><title>Stage 15A QA</title></head><body style="margin:0"><main id="root"></main></body></html>',{flag:'wx'});
const dev=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'inherit'});
const report={fixtureVersion:1,sha,host:{platform:os.platform(),cpu:os.cpus()[0]?.model,ramBytes:os.totalmem(),node:process.version},browser:null,gpu:null,errors:[],audioHashes:{},snapshots:{},images:{},timing:null,exports:{}};
const hash=b=>createHash('sha256').update(b).digest('hex');
let browser;
try{
 const url='http://127.0.0.1:'+port+'/'+harness;
 let ready=false;
 for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,250));}
 assert(ready,'Vite never became ready');
 for(const file of ['zee-spicy.mp3','zee-safe.mp3'])report.audioHashes[file]=hash(await readFile(join('public/audio',file)));
 const executablePath=process.env.CHROMIUM_EXECUTABLE??['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync);
 // Do not force SwiftShader. Record actual GL renderer and reject software when hardware is required.
 browser=await chromium.launch({headless:process.env.QA_HEADED!=='1',...(executablePath?{executablePath}:{}),args:['--enable-webgl','--autoplay-policy=no-user-gesture-required']});
 report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1,acceptDownloads:true});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(url);
 report.gpu=await page.evaluate(async()=>{
  const [{createRenderer},{makeProject},{flagshipCharacters},{ProjectDocument},{createAudioMixer}]=await Promise.all([
   import('/src/engine/renderer.ts'),import('/src/engine/presets.ts'),import('/src/engine/visualPresets.ts'),import('/src/engine/schema.ts'),import('/src/services/audio.ts')]);
  const p=makeProject(true),source=p.scenes[0],s='actor-sbu',z='actor-zee';
  const chars=flagshipCharacters.map((c,i)=>({...structuredClone(c),id:i?'zee':'sbu'}));
  const actors=source.actors.map(a=>({...a,expression:'neutral'}));
  const clip=(id,track,fields)=>({id,track,start:0,length:8,...fields});
  const dialogue=(id,asset,text,start,length)=>clip(id,'dialogue',{actor:z,asset:'builtin:'+asset,text,start,length,volume:.92,muted:false,offset:0});
  const clips=[clip('presence-s','actors',{actor:s}),clip('presence-z','actors',{actor:z}),
   clip('look-s','gaze',{actor:s,target:z}),clip('look-z','gaze',{actor:z,target:s}),
   dialogue('speech-one','zee-spicy','Mmm. Extra spicy.',.75,2.3),
   dialogue('speech-two','zee-safe','I was just checking if it was safe.',4.1,3.45),
   clip('camera','camera',{shot:'two-shot',transition:'cut'})];
  const base={...source,id:'qa15a-scene',name:'Same-art listening beat',duration:8,actors,clips};
  const seated={...structuredClone(base),clips:[...structuredClone(clips),clip('seated','body',{actor:z,action:'sit',layer:'body',target:'sofa'}),clip('cup','props',{actor:z,target:'cup',interaction:'equip',start:0,length:.1,hand:'right'})]};
  const capture={...structuredClone(base),clips:[...structuredClone(clips),clip('captured','performance',{actor:s,start:1,length:6,name:'Synthetic dropout',performanceOrigin:'mocap',performance:[
   {time:0,pose:{head:3,leftShoulder:10},presence:1,headYaw:.15,headFacing:'front',armTargets:{left:{x:-24,y:23}},armBend:{left:-1},hands:{left:'open',right:'relaxed'}},
   {time:.35,pose:{head:9,leftShoulder:20},presence:1,headYaw:.3,headFacing:'right',armTargets:{left:{x:-20,y:15}},armBend:{left:-1},hands:{left:'point',right:'relaxed'}},
   {time:.55,pose:{},presence:0},
   {time:.75,pose:{head:7,leftShoulder:12},presence:1,headYaw:-.2,headFacing:'left',armTargets:{left:{x:-23,y:20}},armBend:{left:-1}},
   {time:1,pose:{head:0,leftShoulder:4},presence:1,headYaw:0,headFacing:'front'}
  ]})]};
  const project=ProjectDocument.parse({...p,id:'qa15a-project',name:'15A dialogue',characters:chars,scenes:[base]});
  const scenarios={dialogue:project.scenes[0],seated:ProjectDocument.parse({...project,scenes:[seated]}).scenes[0],dropout:ProjectDocument.parse({...project,scenes:[capture]}).scenes[0]};
  const renderer=await createRenderer('16:9',1,true);document.getElementById('root').appendChild(renderer.canvas);
  const mixer=createAudioMixer();await mixer.prepare([base]);await renderer.prepareImages([base],project.characters);
  window.qa={renderer,mixer,project,scenarios};
  const gl=renderer.canvas.getContext('webgl2');const ext=gl?.getExtension('WEBGL_debug_renderer_info');
  return {webgl2:!!gl,version:gl?.getParameter(gl.VERSION)??null,vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
 });
 const times=[0,.8,1.3,2.1,3,3.8,4.1,4.4,5.2,6.4,7.5,7.95];
 const captures=[];
 for(const view of ['front','three-quarter','side','back-quarter','back'])for(const flip of [false,true])for(const time of [.8,3.8,5.2])captures.push({scenario:'dialogue',view,flip,time});
 for(const scenario of ['seated','dropout'])for(const time of times)captures.push({scenario,view:'three-quarter',flip:false,time});
 for(const p of captures){
  const key=[p.scenario,p.view,p.flip?'mirror':'normal',p.time].join('-');
  report.snapshots[key]=await page.evaluate(({scenario,view,flip,time})=>{
   const {renderer,mixer,project,scenarios}=window.qa,scene=structuredClone(scenarios[scenario]);
   scene.actors.forEach((a,i)=>{a.view=view;a.flip=i?!flip:flip;});
   const frames=[];renderer.draw(scene,project.characters,time,{amplitude:(id,t)=>mixer.amplitude(scene,id,t),onResolvedArtworkPose:f=>frames.push(f)});
   if(frames.length!==2)throw Error('Expected two resolved actor snapshots');
   for(const f of frames)for(const side of ['left','right']){
    if(Math.hypot(f.arms[side].hand.x-f.hands[side].position.x,f.arms[side].hand.y-f.hands[side].position.y)>1e-7)throw Error('Disconnected wrist');
   }
   return {frames,amplitude:scene.actors.map(a=>mixer.amplitude(scene,a.id,time))};
  },p);
  report.images[key]=hash(await page.locator('canvas').screenshot({path:join(out,key+'.png')}));
 }
 assert(Object.values(report.snapshots).some(s=>s.amplitude[1]>0),'Dialogue envelope never became nonzero');
 report.timing=await page.evaluate(async()=>{
  const {renderer,mixer,project,scenarios}=window.qa,scene=scenarios.dialogue;
  const draw=t=>renderer.draw(scene,project.characters,t,{amplitude:(id,at)=>mixer.amplitude(scene,id,at)});
  for(let i=0;i<60;i++)draw(i/30);
  const submission=[],cadence=[];let previous;
  for(let i=0;i<240;i++){const stamp=await new Promise(r=>requestAnimationFrame(r));if(previous!==undefined)cadence.push(stamp-previous);previous=stamp;
   const start=performance.now();draw(i/30);submission.push(performance.now()-start);}
  const stats=a=>{const sorted=[...a].sort((a,b)=>a-b);return {samples:a,p50:sorted[Math.floor((a.length-1)*.5)],p95:sorted[Math.floor((a.length-1)*.95)]}};
  return {submissionMs:stats(submission),rafCadenceMs:stats(cadence),jsHeapBytes:performance.memory?.usedJSHeapSize??null};
 });
 if(process.env.QA_EXPORTS==='1'){
  for(const mode of ['frame','recorder']){
   try{
    const download=page.waitForEvent('download',{timeout:180000});
    const details=await page.evaluate(async mode=>{
     const {project}=window.qa;let exporter;
     const old=Object.getOwnPropertyDescriptor(globalThis,'VideoEncoder');
     try{
      if(mode==='frame'){exporter=(await import('/src/services/frameExport.ts')).frameExporter('webm');}
      else{Object.defineProperty(globalThis,'VideoEncoder',{value:undefined,configurable:true});exporter=(await import('/src/services/export.ts')).browserExporter;}
      const result=await exporter.run(project,'16:9',false,new AbortController().signal,()=>{});
      if(!result.blob.size)throw Error('Empty export');
      const link=document.createElement('a'),url=URL.createObjectURL(result.blob);link.href=url;link.download=mode+'.'+result.extension;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      return {bytes:result.blob.size,type:result.blob.type,extension:result.extension};
     }finally{if(mode==='recorder'){if(old)Object.defineProperty(globalThis,'VideoEncoder',old);else delete globalThis.VideoEncoder;}}
    },mode);
    await (await download).saveAs(join(out,mode+'.'+details.extension));report.exports[mode]=details;
   }catch(e){report.exports[mode]={error:String(e)};}
  }
 }
 await page.evaluate(()=>{window.qa.renderer.destroy();window.qa.mixer.close();});
 assert.equal(report.errors.length,0,report.errors.join('\n'));
 if(process.env.QA_REQUIRE_HARDWARE==='1')assert(report.gpu.webgl2&&report.gpu.renderer&&!/swiftshader|llvmpipe|software/i.test(report.gpu.renderer),'No hardware WebGL 2 proof');
 if(process.env.QA_EXPORTS==='1')for(const mode of ['frame','recorder'])assert(report.exports[mode]?.bytes>0,JSON.stringify(report.exports[mode]));
} catch(e){report.errors.push(String(e));throw e;} finally{
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();dev.kill();await unlink(harness);
}
console.log('Stage 15A evidence: '+out);
