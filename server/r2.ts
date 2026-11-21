import { createHash, createHmac } from 'node:crypto';

export type MediaKind = 'audio' | 'image' | 'video';
export const mediaTypes: Record<MediaKind, ReadonlySet<string>> = {
  audio: new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/mp4','audio/aac','audio/flac']),
  image: new Set(['image/webp','image/png','image/jpeg']),
  video: new Set(['video/mp4','video/webm','video/quicktime'])
};
export const mediaLimits: Record<MediaKind, number> = {
  audio: 20 * 1024 * 1024, image: 12 * 1024 * 1024, video: 100 * 1024 * 1024
};
const safeId = /^[a-f0-9-]{12,64}$/i;
export function validAssetId(value:unknown):value is string {
  return typeof value==='string' && safeId.test(value) && !value.includes('..');
}
export function mediaKey(uid:string,kind:MediaKind,id:string){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || !validAssetId(id))throw Error('Invalid asset path');
  return `users/${uid}/${kind}/${id}`;
}
function encode(value:string) {
  return encodeURIComponent(value).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
}
function sha256(value:string){return createHash('sha256').update(value).digest('hex');}
function hmac(key:Buffer|string,message:string){return createHmac('sha256',key).update(message).digest();}
export type R2Config = {endpoint:string;bucket:string;accessKeyId:string;secretAccessKey:string};
export function configuredR2():R2Config{
  const account=process.env.R2_ACCOUNT_ID?.trim();
  const endpoint=process.env.R2_ENDPOINT?.trim() ||
    (account?`https://${account}.r2.cloudflarestorage.com`:'');
  const bucket=process.env.R2_BUCKET?.trim()??'';
  const accessKeyId=process.env.R2_ACCESS_KEY_ID?.trim()??'';
  const secretAccessKey=process.env.R2_SECRET_ACCESS_KEY??'';
  if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)throw Error('R2 storage is not configured');
  const parsed=new URL(endpoint);
  if(parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.pathname!=='/' ||
    parsed.search || parsed.hash || !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/i.test(parsed.hostname))
    throw Error('R2 endpoint must be the account S3 API origin');
  if(!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket))throw Error('Invalid R2 bucket');
  return {endpoint:parsed.origin,bucket,accessKeyId,secretAccessKey};
}
/** Sign a short-lived, private Cloudflare R2 S3 request (AWS SigV4).
 * Credentials remain server-side. A PUT signs Content-Type so the client
 * cannot silently change the declared media MIME type.
 */
export function presignMedia(
  config:R2Config, key:string, method:'GET'|'PUT', contentType?:string,
  now=new Date(), expires=120
):string{
  if(expires<1||expires>900)throw Error('Invalid signature duration');
  const endpoint=new URL(config.endpoint);
  const host=endpoint.host.toLowerCase();
  const amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
  const shortDate=amzDate.slice(0,8);
  const scope=`${shortDate}/auto/s3/aws4_request`;
  const signedHeaders=method==='PUT'?'content-type;host':'host';
  if(method==='PUT' && !contentType)throw Error('Content type required');
  const canonicalPath='/'+[config.bucket,...key.split('/')].map(encode).join('/');
  const params:Record<string,string>={
    'X-Amz-Algorithm':'AWS4-HMAC-SHA256',
    'X-Amz-Credential':config.accessKeyId+'/'+scope,
    'X-Amz-Date':amzDate,
    'X-Amz-Expires':String(expires),
    'X-Amz-SignedHeaders':signedHeaders
  };
  const query=Object.entries(params).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>encode(k)+'='+encode(v)).join('&');
  const headers=(method==='PUT'? `content-type:${contentType}\n`:'' )+`host:${host}\n`;
  const canonicalRequest=[method,canonicalPath,query,headers,signedHeaders,'UNSIGNED-PAYLOAD'].join('\n');
  const toSign=['AWS4-HMAC-SHA256',amzDate,scope,sha256(canonicalRequest)].join('\n');
  const signingKey=hmac(hmac(hmac(hmac('AWS4'+config.secretAccessKey,shortDate),'auto'),'s3'),'aws4_request');
  const signature=createHmac('sha256',signingKey).update(toSign).digest('hex');
  return endpoint.origin+canonicalPath+'?'+query+'&X-Amz-Signature='+signature;
}
