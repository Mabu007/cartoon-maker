import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT=Number(process.env.PORT)||8788, MAX=5_000_000, LIMIT=2;
const secret=process.env.WORKER_TOKEN||'',binary=process.env.RHUBARB_BINARY||'/opt/rhubarb/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb';
if(secret.length<32)throw Error('WORKER_TOKEN must be a 32+ character private random string.');
let running=0;
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
function authenticated(value){
 const provided=Buffer.from((value||'').replace(/^Bearer /,'')),wanted=Buffer.from(secret);
 return provided.length===wanted.length&&timingSafeEqual(provided,wanted);
}
function validateWav(value){
 if(value.byteLength<44||value.byteLength>MAX)throw Error('Invalid WAV size.');
 const d=new DataView(value.buffer,value.byteOffset,value.byteLength);
 const four=at=>value.subarray(at,at+4).toString('ascii');
 if(four(0)!=='RIFF'||four(8)!=='WAVE'||four(12)!=='fmt '||d.getUint16(20,true)!==1||
  d.getUint16(22,true)!==1||d.getUint16(34,true)!==16||d.getUint32(24,true)!==16000)
  throw Error('Expected 16 kHz, mono, 16-bit PCM WAV.');
 const duration=(value.length-44)/32000;
 if(duration<.1||duration>120)throw Error('Recording length must be 0.1 to 120 seconds.');
 return duration;
}
async function run(wav,text,recognizer,duration){
 const folder=await mkdtemp(join(tmpdir(),'rhubarb-worker-'));
 try {
  const audio=join(folder,'audio.wav'),dialog=join(folder,'transcript.txt'),output=join(folder,'mouth.json');
  await Promise.all([writeFile(audio,wav),writeFile(dialog,text)]);
  const args=['--threads','2','--extendedShapes','GHX','-r',recognizer,'-f','json','-o',output,
   ...(text.trim()?['-d',dialog]:[]),audio];
  await new Promise((resolve,reject)=>{
   const child=spawn(binary,args,{shell:false,stdio:['ignore','ignore','pipe']});
   let completed=false,stderr='';
   const finish=error=>{if(completed)return;completed=true;clearTimeout(timeout);error?reject(error):resolve();};
   const timeout=setTimeout(()=>{child.kill('SIGKILL');finish(Error('Rhubarb exceeded 40 seconds.'));},40000);
   child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-400);});
   child.on('error',finish);
   child.on('close',code=>finish(code===0?undefined:Error('Rhubarb exited '+code+' '+stderr)));
  });
  const data=await readFile(output,'utf8');
  if(data.length>250000)throw Error('Too many Rhubarb output bytes.');
  const result=JSON.parse(data);
  if(!Array.isArray(result.mouthCues)||!result.mouthCues.length||result.mouthCues.length>3000)
   throw Error('No valid Rhubarb mouth cues.');
  let previous=0;
  for(const cue of result.mouthCues){
   if(!Number.isFinite(cue?.start)||!Number.isFinite(cue?.end)||cue.start<previous-.012||
    cue.end<=cue.start||cue.end>duration+.2||!(/^[A-HX]$/).test(cue.value))throw Error('Invalid Rhubarb cue.');
   previous=cue.end;
  }
  return result;
 }finally{await rm(folder,{recursive:true,force:true}).catch(()=>{});}
}
createServer(async (req,res)=>{
 if(req.url==='/healthz'&&req.method==='GET'){json(res,200,{ok:true,engine:'rhubarb',limit:LIMIT});return;}
 if(req.method!=='POST'||req.url!=='/analyze'){json(res,404,{error:'Not found'});return;}
 if(!authenticated(req.headers.authorization)){json(res,401,{error:'Unauthorized'});return;}
 if(running>=LIMIT){json(res,429,{error:'Rhubarb worker busy'});return;}
 if(Number(req.headers['content-length']||0)>MAX+5000){json(res,413,{error:'Recording too large'});return;}
 running++;
 try {
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX+5000)throw Error('Request too large');chunks.push(chunk);}
  const body=Buffer.concat(chunks);
  const form=await new Request('http://localhost/analyze',{method:'POST',
   headers:{'content-type':req.headers['content-type']||''},body}).formData();
  const file=form.get('audio'),text=form.get('text'),mode=form.get('recognizer')||'pocketSphinx';
  if(!(file instanceof File)||file.size>MAX||file.type!=='audio/wav'||typeof text!=='string'||text.length>4000||
   !['pocketSphinx','phonetic'].includes(mode))throw Error('Invalid audio, transcript or recognizer.');
  const wav=Buffer.from(await file.arrayBuffer()),duration=validateWav(wav);
  json(res,200,await run(wav,text,mode,duration));
 }catch(error){console.error('Rhubarb worker:',error.message);json(res,422,{error:'Rhubarb could not analyze this recording.'});}
 finally{running--;}
}).listen(PORT,'0.0.0.0');
