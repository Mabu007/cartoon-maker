import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorize } from '../server/authorize.js';

/** The Vercel function can use a native Rhubarb binary where installed, or
 * securely proxy to the Docker worker. Never run shell strings or client URLs.
 */
const MAX_BYTES=5_000_000,MAX_TEXT=4000;
function wavDuration(data:ArrayBuffer):number {
  if(data.byteLength<44||data.byteLength>MAX_BYTES)throw Error('WAV must be 44 bytes to 5 MB.');
  const view=new DataView(data);
  const string=(at:number)=>String.fromCharCode(...new Uint8Array(data,at,4));
  if(string(0)!=='RIFF'||string(8)!=='WAVE'||string(12)!=='fmt '||
    view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||
    view.getUint32(24,true)!==16000||view.getUint16(34,true)!==16)
    throw Error('Expected 16 kHz, 16-bit mono PCM WAV.');
  const duration=(data.byteLength-44)/(16000*2);
  if(duration<.1||duration>120)throw Error('Recording must be between 0.1 and 120 seconds.');
  return duration;
}
function validCues(value:unknown,duration:number){
  const data=value as {mouthCues?:{start:number;end:number;value:string}[]}|null;
  if(!Array.isArray(data?.mouthCues)||!data.mouthCues.length||data.mouthCues.length>3000)
    throw Error('Rhubarb returned invalid mouth cues.');
  let end=0;
  for(const cue of data.mouthCues) {
    if(!cue||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||
      cue.start<end-.012||cue.start<0||cue.end<=cue.start||
      cue.end>duration+.2||!/^[A-HX]$/.test(cue.value))
      throw Error('Rhubarb returned invalid cue timestamps or shapes.');
    end=cue.end;
  }
  return value;
}
async function nativeAnalysis(wav:ArrayBuffer,text:string,recognizer:string){
  const binary=process.env.RHUBARB_BINARY;
  if(!binary)throw Error('Rhubarb executable not configured.');
  const folder=await mkdtemp(join(tmpdir(),'toonroom-rhubarb-'));
  try {
    const input=join(folder,'recording.wav'),dialogue=join(folder,'dialogue.txt'),output=join(folder,'cues.json');
    await Promise.all([writeFile(input,Buffer.from(wav)),writeFile(dialogue,text)]);
    const args=['--threads','2','--extendedShapes','GHX','-r',recognizer,
      '-f','json','-o',output,...(text.trim()?['-d',dialogue]:[]),input];
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(binary,args,{shell:false,stdio:['ignore','ignore','pipe']});
      let done=false,stderr='';
      const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve();};
      const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('Rhubarb analysis timed out.'));},40000);
      child.stderr.on('data',(chunk:Buffer)=>{stderr=(stderr+String(chunk)).slice(-500);});
      child.on('error',(error:Error)=>finish(error));
      child.on('close',(code:number|null)=>finish(code===0?undefined:Error('Rhubarb exited '+code+': '+stderr)));
    });
    return JSON.parse(await readFile(output,'utf8')) as unknown;
  }finally{await rm(folder,{recursive:true,force:true}).catch(()=>{});}
}
async function workerAnalysis(wav:ArrayBuffer,text:string,recognizer:string){
  const endpoint=process.env.RHUBARB_WORKER_URL,secret=process.env.RHUBARB_WORKER_TOKEN;
  if(!endpoint||!secret)throw Error('Rhubarb worker URL/token missing.');
  const url=new URL('/analyze',endpoint);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))
    throw Error('Rhubarb worker URL must use HTTPS.');
  const form=new FormData();
  form.set('audio',new Blob([wav],{type:'audio/wav'}),'voice.wav');
  form.set('text',text);form.set('recognizer',recognizer);
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secret}`},body:form,
    signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('Rhubarb worker returned HTTP '+response.status+'.');
  const data=await response.text();
  if(data.length>250_000)throw Error('Rhubarb output too large.');
  return JSON.parse(data) as unknown;
}
async function post(request:Request) {
  if(!process.env.RHUBARB_BINARY&&!process.env.RHUBARB_WORKER_URL)
    return Response.json({error:'Rhubarb is not deployed. Estimated lip-sync is available until the analyzer is configured.'},{status:503});
  if(process.env.RHUBARB_GUEST_ENABLED!=='true'&&!await authorize(request).catch(()=>false))
    return Response.json({error:'Sign in to use accurate Rhubarb lip-sync.'},{status:401});
  try {
    const form=await request.formData(),audio=form.get('audio'),text=form.get('text'),rawMode=form.get('recognizer');
    if(!(audio instanceof File)||audio.size<44||audio.size>MAX_BYTES||audio.type!=='audio/wav')
      return Response.json({error:'Upload 16 kHz mono WAV under 5 MB.'},{status:400});
    if(typeof text!=='string'||text.length>MAX_TEXT)
      return Response.json({error:'Transcript must be at most 4000 characters.'},{status:400});
    const mode=rawMode??'pocketSphinx';
    if(mode!=='pocketSphinx'&&mode!=='phonetic')
      return Response.json({error:'Invalid speech recognizer.'},{status:400});
    const wav=await audio.arrayBuffer(),duration=wavDuration(wav);
    const cues=validCues(process.env.RHUBARB_BINARY?
      await nativeAnalysis(wav,text,mode):
      await workerAnalysis(wav,text,mode),duration);
    return Response.json(cues,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error) {
    console.warn('Rhubarb analysis:',error instanceof Error?error.message:'Unknown error');
    return Response.json({error:'Rhubarb analysis failed. Estimated cues are available; retry when the analyzer is online.'},{status:502});
  }
}
export default {fetch(request:Request){
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  return post(request);
}};
