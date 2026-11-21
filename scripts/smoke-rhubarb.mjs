#!/usr/bin/env node
/** Native Rhubarb integration smoke test on real bundled cartoon dialogue.
 * Requires RHUBARB_BINARY pointing at the official CLI plus ffmpeg on PATH.
 * Not part of npm test because the native binary is hosted separately.
 */
import { spawn } from 'node:child_process';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
const binary=process.env.RHUBARB_BINARY;
if(!binary)throw Error('Set RHUBARB_BINARY to the full Rhubarb executable path.');
const samples=['sbu-food.mp3','sbu-lunch.mp3','zee-safe.mp3'];
const folder=await mkdtemp(join(tmpdir(),'toonroom-native-smoke-'));
function run(command,args) {
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{shell:false,stdio:['ignore','pipe','pipe']});
  let stderr='',stdout='';
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error(command+' timed out'));},45000);
  child.stdout.on('data',x=>{stdout+=String(x);});
  child.stderr.on('data',x=>{stderr=(stderr+String(x)).slice(-1000);});
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(command+' exited '+code+': '+stderr));});
 });
}
try{
 console.log('Rhubarb version',String(await run(binary,['--version'])).trim());
 for(const [index,source] of samples.entries()){
  const wav=join(folder,index+'.wav'),json=join(folder,index+'.json');
  await run('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',
   '-i',resolve('public/audio',source),'-ac','1','-ar','16000','-c:a','pcm_s16le',wav]);
  await run(binary,['--threads','2','--extendedShapes','GHX','-r','pocketSphinx','-f','json','-o',json,wav]);
  const report=JSON.parse(await readFile(json,'utf8'));
  const duration=report.metadata?.duration,cues=report.mouthCues;
  if(!Number.isFinite(duration)||duration<.1||!Array.isArray(cues)||cues.length<2)
   throw Error(source+' did not return timed mouth cues');
  let previous=0;
  for(const cue of cues) {
   if(!/^[A-HX]$/.test(cue.value)||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||
     cue.start<previous-.012||cue.end<=cue.start||cue.end>duration+.2)
    throw Error(source+' contains invalid cue '+JSON.stringify(cue));
   previous=cue.end;
  }
  console.log(source, {duration,cues:cues.length,first:cues[0],last:cues.at(-1)});
 }
 console.log('PASS: three real recordings analyzed by native Rhubarb CLI.');
}finally{await rm(folder,{recursive:true,force:true}).catch(()=>{});}
