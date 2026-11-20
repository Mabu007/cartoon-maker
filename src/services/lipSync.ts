import { textVisemes, type VisemeCue, type Viseme } from '../engine/visemes.ts';
export const RHUBARB_ENGINE='rhubarb-1.14.0-GHX';
export type Analysis={cues:VisemeCue[];source:'rhubarb'|'estimated';engine:string;analyzedDuration:number;cacheKey?:string;reason?:string};
export type Recognizer='pocketSphinx'|'phonetic';
export type AnalyzeOptions={token?:string;recognizer?:Recognizer};
const validShapes=new Set<Viseme>(['rest','closed','bite','wide','open','round','pucker','tongue']);
export function validStoredAlignment(value:Analysis|undefined,key:string,duration:number):value is Analysis {
 if(value?.source!=='rhubarb'||value.cacheKey!==key||
   Math.abs(value.analyzedDuration-duration)>=.08||
   !Array.isArray(value.cues)||!value.cues.length||value.cues.length>3000)return false;
 let last=0;
 for(const cue of value.cues) {
  if(!cue||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||
     cue.start<last-.012||cue.end<=cue.start||cue.end>duration+.2||
     !validShapes.has(cue.shape)||cue.strength!==undefined&&
       (!Number.isFinite(cue.strength)||cue.strength<0||cue.strength>1))return false;
  last=cue.end;
 }
 return true;
}
const mapping:Record<string,{shape:Viseme;strength?:number}>={
 A:{shape:'closed',strength:1},B:{shape:'wide',strength:.6},C:{shape:'open',strength:.75},
 D:{shape:'open',strength:1},E:{shape:'round',strength:.8},F:{shape:'pucker',strength:1},
 G:{shape:'bite',strength:1},H:{shape:'tongue',strength:.9},X:{shape:'rest',strength:0}
};
/** Official Rhubarb output: {metadata:{duration},mouthCues:[{start,end,value:A-H|X}]} */
export function parseRhubarbOutput(value:unknown,duration:number):VisemeCue[]{
 if(!Number.isFinite(duration)||duration<.1||duration>180)throw Error('Invalid audio duration.');
 const result=value as {mouthCues?:{start:number;end:number;value:string}[];metadata?:{duration?:number}}|null;
 if(!result||!Array.isArray(result.mouthCues)||!result.mouthCues.length||result.mouthCues.length>3000)throw Error('Rhubarb returned no mouth cues or too many cues.');
 if(result.metadata?.duration!==undefined&&(!Number.isFinite(result.metadata.duration)||Math.abs(result.metadata.duration-duration)>.35))throw Error('Rhubarb analyzed a recording of different duration.');
 const cues:VisemeCue[]=[];let previous=0;
 for(const cue of result.mouthCues){
  if(!cue||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<0||
     cue.end<=cue.start||cue.end>duration+.2||!Object.hasOwn(mapping,cue.value)||
     cue.start<previous-.012)throw Error('Rhubarb cue has invalid shape, timestamp or order.');
  const start=Math.max(previous,cue.start),end=Math.min(duration,cue.end);
  if(start>previous+.004)cues.push({start:previous,end:start,shape:'rest'});
  if(end>start){cues.push({start,end,...mapping[cue.value]});previous=end;}
 }
 if(previous<duration-.003)cues.push({start:previous,end:duration,shape:'rest'});
 if(!cues.length||cues.length>3000)throw Error('Rhubarb returned invalid cues.');
 return cues;
}
function toWave(buffer:AudioBuffer):Blob{
 const raw=new ArrayBuffer(44+buffer.length*2),d=new DataView(raw);
 const write=(at:number,s:string)=>{for(let i=0;i<s.length;i++)d.setUint8(at+i,s.charCodeAt(i));};
 write(0,'RIFF');d.setUint32(4,raw.byteLength-8,true);write(8,'WAVE');
 write(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);
 d.setUint16(22,1,true);d.setUint32(24,buffer.sampleRate,true);d.setUint32(28,buffer.sampleRate*2,true);
 d.setUint16(32,2,true);d.setUint16(34,16,true);write(36,'data');d.setUint32(40,buffer.length*2,true);
 const pcm=buffer.getChannelData(0);
 for(let i=0;i<pcm.length;i++){const x=Math.max(-1,Math.min(1,pcm[i]));d.setInt16(44+i*2,x<0?x*32768:x*32767,true);}
 return new Blob([raw],{type:'audio/wav'});
}
export async function compatibleWave(audio:Blob):Promise<Blob>{
 if(!audio.size||audio.size>20*1024*1024)throw Error('Recording exceeds 20 MB.');
 const decoder=new OfflineAudioContext(1,1,16000);
 const decoded=await decoder.decodeAudioData(await audio.arrayBuffer());
 if(decoded.duration<.1||decoded.duration>120||!Number.isFinite(decoded.duration))throw Error('Analysis supports 0.1–120 seconds.');
 const ctx=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
 const source=ctx.createBufferSource();source.buffer=decoded;source.connect(ctx.destination);source.start();
 const wav=toWave(await ctx.startRendering());
 if(wav.size>5_000_000)throw Error('Normalized recording exceeds 5 MB.');
 return wav;
}
const hex=(data:ArrayBuffer)=>[...new Uint8Array(data)].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function alignmentKey(audio:Blob,text:string,recognizer:Recognizer='pocketSphinx'){
 const digest=hex(await crypto.subtle.digest('SHA-256',await audio.arrayBuffer()));
 const input=new TextEncoder().encode(['toonroom-alignment-3',RHUBARB_ENGINE,recognizer,digest,text.trim().replace(/\s+/g,' ')].join('\u0000'));
 return hex(await crypto.subtle.digest('SHA-256',input));
}
let dbPromise:Promise<IDBDatabase>|undefined;
function db(){
 dbPromise??=new Promise((resolve,reject)=>{const open=indexedDB.open('toonroom-lipsync',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('alignments');
  open.onsuccess=()=>resolve(open.result);
  open.onerror=()=>{dbPromise=undefined;reject(open.error);};
 });
 return dbPromise;
}
async function cacheRead(key:string):Promise<Analysis|undefined>{
 const storage=await db();return new Promise((resolve,reject)=>{const req=storage.transaction('alignments').objectStore('alignments').get(key);
  req.onsuccess=()=>resolve(req.result as Analysis|undefined);req.onerror=()=>reject(req.error);
 });
}
async function cacheWrite(key:string,value:Analysis){
 const storage=await db();await new Promise<void>((resolve,reject)=>{const tx=storage.transaction('alignments','readwrite');
  tx.objectStore('alignments').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);
 });
}
async function transport(wave:Blob,text:string,recognizer:Recognizer,token?:string):Promise<unknown>{
 const form=new FormData();form.set('audio',wave,'dialogue.wav');form.set('text',text);form.set('recognizer',recognizer);
 const response=await fetch('/api/lipsync',{method:'POST',body:form,
  headers:token?{Authorization:`Bearer ${token}`}:undefined,signal:AbortSignal.timeout(50_000)});
 if(!response.ok){const issue=await response.json().catch(()=>({})) as {error?:string};
  throw Error(issue.error||`Rhubarb request failed with HTTP ${response.status}.`);
 }
 return response.json();
}
export type AlignmentAdapter={normalize:(audio:Blob)=>Promise<Blob>;
 request:(wave:Blob,text:string,recognizer:Recognizer,token?:string)=>Promise<unknown>;
 read:(key:string)=>Promise<Analysis|undefined>;save:(key:string,result:Analysis)=>Promise<void>};
const implementation:AlignmentAdapter={normalize:compatibleWave,request:transport,read:cacheRead,save:cacheWrite};
export function createLipSyncAnalyzer(adapter:AlignmentAdapter=implementation){
 const inflight=new Map<string,Promise<Analysis>>();
 return async (audio:Blob,text:string,duration:number,options:AnalyzeOptions={}):Promise<Analysis>=>{
  const recognizer=options.recognizer??(/[\u0100-\uffff]/.test(text)?'phonetic':'pocketSphinx');
  const fallback=(error:unknown):Analysis=>({cues:textVisemes(text,duration),source:'estimated',engine:'text-estimate-1',
   analyzedDuration:duration,reason:error instanceof Error?error.message:'Rhubarb unavailable.'});
  let key:string;
  try{key=await alignmentKey(audio,text,recognizer);}catch(error){return fallback(error);}
  if(inflight.has(key))return inflight.get(key)!;
  const pending=(async()=>{
   try{
    const hit=await adapter.read(key).catch(()=>undefined);
    if(validStoredAlignment(hit,key,duration))return hit;
    const wave=await adapter.normalize(audio);
    const raw=await adapter.request(wave,text.trim(),recognizer,options.token);
    const result:Analysis={cues:parseRhubarbOutput(raw,duration),source:'rhubarb',engine:RHUBARB_ENGINE,cacheKey:key,analyzedDuration:duration};
    await adapter.save(key,result).catch(()=>{});return result;
   }catch(error){return fallback(error);}
  })();
  inflight.set(key,pending);
  try{return await pending;}finally{if(inflight.get(key)===pending)inflight.delete(key);}
 };
}
/** Every speech source uses a single analyzer. Only real Rhubarb cues are
 * cached: an outage does not permanently turn subsequent attempts into estimates.
 */
export const analyzeLipSync=createLipSyncAnalyzer();
