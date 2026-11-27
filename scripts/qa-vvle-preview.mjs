/** Isolated preview-only verification; built-in characters, no user media. */
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,delimiter} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
function load(name){try{return require(name);}catch{for(const dir of process.env.PATH.split(delimiter)){const p=join(dirname(dir),name);if(existsSync(join(p,'package.json')))return require(p);}throw Error('QA dependency missing: '+name);}}
const playwright=load('playwright'),chromium=load('@sparticuz/chromium');
const harness='qa-vvle-runtime.html';if(existsSync(harness))throw Error('QA harness already exists');
await writeFile(harness,'<!doctype html><html><body style="margin:0;background:#222"><div id="qa"></div></body></html>');
const out=process.env.QA_OUT??'dist/qa-vvle';await mkdir(out,{recursive:true});
const port=process.env.QA_PORT??'4179';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',port,'--strictPort'],{stdio:'inherit'});
let browser;const errors=[];const result={source:process.env.VERCEL_GIT_COMMIT_SHA??'local',applicationSource:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:'',samples:[],errors};
try{
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:'+port+'/'+harness)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,'Vite did not start');
 browser=await playwright.chromium.launch({headless:true,executablePath:await chromium.executablePath(),args:[...chromium.args.filter(a=>!a.startsWith('--disable-gpu')&&!a.startsWith('--use-angle')&&!a.startsWith('--use-gl')),'--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 result.browser=browser.version();const page=await browser.newPage({viewport:{width:960,height:600}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port+'/'+harness);
 await page.evaluate(async()=>{
  const [{createRenderer},{makeProject},{flagshipCharacters},{garmentDefaults},{cinematicPresets}]=await Promise.all([import('/src/engine/renderer.ts'),import('/src/engine/presets.ts'),import('/src/engine/visualPresets.ts'),import('/src/engine/garmentDesignSchema.ts'),import('/src/engine/vvlePresets.ts')]);
  const renderer=await createRenderer('16:9',.75,true),project=makeProject(true);
  document.querySelector('#qa').appendChild(renderer.canvas);
  const chars=project.characters.map((c,i)=>i<2?{...structuredClone(flagshipCharacters[i]),id:c.id,garmentDesign:{...garmentDefaults,top:i?'blouse':'shirt',bottom:i?'skirt':'trousers',outer:i?'none':'jacket',outerColor:'#304a48'}}:c);
  const scene=structuredClone(project.scenes[0]);window.qa={renderer,chars,scene,cinematicPresets};
 });
 const capture=async(name)=>{
  const url=await page.evaluate(()=>window.qa.renderer.canvas.toDataURL('image/jpeg',.72));
  const bytes=Buffer.from(url.split(',')[1],'base64');
  await writeFile(out+'/'+name+'.jpg',bytes);
  return bytes;
 };
 const draw=async(preset,view='three-quarter',flip=false,time=1.2)=>{
  await page.evaluate(({preset,view,flip,time})=>{
   const {renderer,chars,scene,cinematicPresets}=window.qa,s=structuredClone(scene);
   s.actors.forEach(a=>{a.view=view;a.flip=flip;});if(preset!=='flat')s.visual={version:1,quality:'balanced',...structuredClone(cinematicPresets[preset])};else s.visual=undefined;
   renderer.draw(s,chars,time,{edit:true});
  },{preset,view,flip,time});
 };
 let flat;for(const preset of ['flat','interrogation','candlelit','night-street','daylight','portrait']){
  await draw(preset);const data=await capture(preset);
  if(preset==='flat')flat=data;else assert.notDeepEqual(data,flat,'Lighting should change pixels');
  if(process.env.QA_EMIT_CAPTURE==='1'&&['flat','portrait','interrogation'].includes(preset)){const base64=data.toString('base64');for(let i=0;i<base64.length;i+=1800)console.log('VVLE_CAPTURE '+preset+' '+(i/1800)+' '+base64.slice(i,i+1800));}
 }
 for(const view of ['front','three-quarter','side','back-quarter','back'])for(const flip of [false,true]){await draw('portrait',view,flip);await capture(view+'-'+flip);}
 result.samples=await page.evaluate(()=>{
  const {renderer,chars,scene,cinematicPresets}=window.qa,out=[];
  for(const mode of ['flat','portrait','portrait','flat']){
   const s=structuredClone(scene);if(mode==='portrait'){s.visual={version:1,quality:'balanced',...structuredClone(cinematicPresets.portrait)};s.visual.lighting.lights[0].keys=[{time:0,x:180,y:150,intensity:1},{time:3,x:800,y:260,intensity:1.2}];}else s.visual=undefined;
   for(let i=0;i<20;i++)renderer.draw(s,chars,i/24,{});
   const times=[];for(let i=0;i<120;i++){const start=performance.now();renderer.draw(s,chars,i/40,{});times.push(performance.now()-start);}times.sort((a,b)=>a-b);out.push({mode,count:times.length,medianMs:times[60],p95Ms:times[114]});
  }return out;
 });
 await capture('moving');
 result.retention=await page.evaluate(()=>{
  const {renderer,chars,scene,cinematicPresets}=window.qa,s=structuredClone(scene);
  s.visual={version:1,quality:'balanced',...structuredClone(cinematicPresets.portrait)};
  s.visual.lighting.lights[0].keys=[{time:0,x:180,y:150,intensity:1},{time:3,x:800,y:260,intensity:1.2}];
  const draw=time=>{renderer.draw(s,chars,time);return renderer.canvas.toDataURL();};
  const first=draw(.6);
  for(let i=0;i<32;i++)renderer.draw(s,chars,1.7+i/30);
  return {seekEqual:first===draw(.6),...renderer.volumeMetrics()};
 });
 assert(result.retention.seekEqual,'Atlas swatches must reproduce the same pixels after a seek');
 assert(result.retention.textureBytes>0&&result.retention.textureBytes<=16*1024*1024,'Atlas texture budget exceeded');
 await page.evaluate(()=>window.qa.renderer.destroy());assert.equal(errors.length,0,errors.join('\n'));
 console.log('VVLE_QA '+JSON.stringify(result));
}catch(error){errors.push(String(error));throw error;}
finally{await writeFile(out+'/results.json',JSON.stringify(result,null,2));await browser?.close();server.kill();await unlink(harness);}
