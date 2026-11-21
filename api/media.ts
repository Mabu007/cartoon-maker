import { authenticatedUid } from '../server/authorize.js';
import { configuredR2, mediaKey, mediaLimits, mediaTypes, presignMedia, validAssetId, type MediaKind } from '../server/r2.js';

const respond=(body:Record<string,unknown>,status=200)=>Response.json(body,{
  status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
});
/** Private, scoped upload/read URL issuance. No R2 secret ever leaves the API. */
async function handle(request:Request){
  if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  const uid=await authenticatedUid(request);
  if(!uid)return respond({error:'Sign in to use cloud media.'},401);
  let body:Record<string,unknown>;
  try {
    const value=await request.json();
    if(!value || typeof value!=='object' || Array.isArray(value))throw Error('bad request');
    body=value as Record<string,unknown>;
  }catch {return respond({error:'Send valid media request JSON.'},400);}
  const {kind,id,action}=body;
  if(kind!=='audio'&&kind!=='image'&&kind!=='video'||!validAssetId(id)||!['upload','read'].includes(String(action)))
    return respond({error:'Invalid media kind, ID or operation.'},400);
  const mediaKind=kind as MediaKind, key=mediaKey(uid,mediaKind,id);
  if(action==='upload'){
    const type=body.contentType,size=body.size;
    if(typeof type!=='string' || !mediaTypes[mediaKind].has(type) ||
       typeof size!=='number' || !Number.isSafeInteger(size) || size<1 || size>mediaLimits[mediaKind])
      return respond({error:'Unsupported media format or size.'},400);
  }
  try {
    const r2=configuredR2();
    const type=action==='upload'?body.contentType as string:undefined;
    const url=presignMedia(r2,key,action==='upload'?'PUT':'GET',type);
    return respond({url,expiresIn:120,kind:mediaKind});
  } catch(error) {
    console.error('Media signing unavailable:',error instanceof Error?error.message:'unknown error');
    return respond({error:'Cloud media storage is not ready. Try again later.'},503);
  }
}
export default {fetch:handle};
