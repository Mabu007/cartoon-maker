import type { Account } from './cloud.ts';
import { uid } from '../engine/schema.ts';

export type MediaKind='audio'|'image'|'video';
const limits:Record<MediaKind,number>={audio:20*1024*1024,image:12*1024*1024,video:100*1024*1024};
const mime:Record<MediaKind,Set<string>>={
  audio:new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/mp4','audio/aac','audio/flac']),
  image:new Set(['image/webp','image/png','image/jpeg']),
  video:new Set(['video/mp4','video/webm','video/quicktime'])
};
const mediaRef=/^r2:(image|video):([a-f\d-]{12,64})$/i;
let activeUser: Account|null=null;
const urls=new Map<string,string>();
const inflight=new Map<string,Promise<string>>();
const subscribers=new Set<()=>void>();
export function setMediaUser(user:Account|null){
  if(activeUser?.uid===user?.uid){activeUser=user;return;}
  activeUser=user;
  for(const url of urls.values())URL.revokeObjectURL(url);
  urls.clear();inflight.clear();subscribers.forEach(fn=>fn());
}
export function subscribeMediaUser(fn:()=>void){subscribers.add(fn);return()=>{subscribers.delete(fn);};}
export function getMediaUser(){return activeUser;}
export function isR2MediaRef(value:string|undefined):boolean{return !!value&&mediaRef.test(value);}
export function createMediaRef(kind:'image'|'video',id:string){return `r2:${kind}:${id}`;}
function parseRef(value:string){
  const match=mediaRef.exec(value);
  if(!match)throw Error('Invalid R2 media reference.');
  return {kind:match[1] as 'image'|'video',id:match[2]};
}
async function signedUrl(user:Account,action:'upload'|'read',kind:MediaKind,id:string,file?:Blob){
  const token=await user.getIdToken();
  const result=await fetch('/api/media',{method:'POST',headers:{
    'Content-Type':'application/json',Authorization:`Bearer ${token}`
  },body:JSON.stringify({action,kind,id,...(file?{size:file.size,contentType:file.type}:{})})});
  const data=await result.json().catch(()=>null) as {url?:string;error?:string}|null;
  if(!result.ok||!data?.url)throw Error(data?.error||'Could not access cloud media. Check your sign-in and R2 setup.');
  return data.url;
}
export async function uploadR2Media(user:Account,kind:MediaKind,blob:Blob,id:string=uid()) {
  if(!blob.size || blob.size>limits[kind])throw Error(`File exceeds the ${limits[kind]/1048576} MB ${kind} limit.`);
  if(!mime[kind].has(blob.type))throw Error('Unsupported media type: '+(blob.type||'unknown'));
  const url=await signedUrl(user,'upload',kind,id,blob);
  const response=await fetch(url,{method:'PUT',body:blob,headers:{'Content-Type':blob.type},mode:'cors',credentials:'omit'});
  if(!response.ok)throw Error(`R2 upload failed (HTTP ${response.status}). Check your bucket CORS policy.`);
  return id;
}
export async function readR2Media(user:Account,kind:MediaKind,id:string) {
  const url=await signedUrl(user,'read',kind,id);
  const result=await fetch(url,{method:'GET',mode:'cors',credentials:'omit'});
  if(!result.ok)throw Error(`R2 ${kind} not found (HTTP ${result.status}).`);
  const headerSize=Number(result.headers.get('content-length')||'0');
  if(headerSize>limits[kind])throw Error('Cloud media exceeds the allowed file size.');
  const body=await result.blob();
  if(body.size>limits[kind])throw Error('Cloud media exceeds the allowed file size.');
  return body;
}
/** Cached local blob URLs avoid downloading images on every animation frame. */
export async function mediaUrl(value:string):Promise<string>{
  if(!isR2MediaRef(value))return value;
  const user=activeUser;
  if(!user)throw Error('Sign in to load this saved cloud image.');
  const key=user.uid+':'+value;
  const hit=urls.get(key);
  if(hit)return hit;
  const prior=inflight.get(key);
  if(prior)return prior;
  const request=(async()=>{
    const {kind,id}=parseRef(value);
    const blob=await readR2Media(user,kind,id);
    if(activeUser?.uid!==user.uid)throw Error('Account changed while loading artwork.');
    const url=URL.createObjectURL(blob);
    urls.set(key,url);
    return url;
  })().finally(()=>inflight.delete(key));
  inflight.set(key,request);
  return request;
}
export async function imageToR2(user:Account,webpData:string){
  if(!webpData.startsWith('data:image/webp;base64,'))throw Error('Only optimized WebP images can be stored as scene artwork.');
  const blob=await fetch(webpData).then(r=>r.blob());
  const bytes=await blob.arrayBuffer();
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const id=Array.from(digest,value=>value.toString(16).padStart(2,'0')).join('');
  await uploadR2Media(user,'image',blob,id);
  return createMediaRef('image',id);
}
