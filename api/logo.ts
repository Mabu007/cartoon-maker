import { configuredR2, presignMedia } from '../server/r2.js';

/** A public, fixed brand asset. All other R2 objects stay user-private. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
    try {
      const signed = presignMedia(configuredR2(),'toonroom/logo.png','GET');
      const upstream=await fetch(signed,{method:'GET',signal:AbortSignal.timeout(10000)});
      if(!upstream.ok)return new Response(null,{status:404});
      const type=upstream.headers.get('content-type')?.split(';')[0].toLowerCase()??'';
      if(!['image/png','image/webp','image/jpeg'].includes(type))
        return new Response(null,{status:415});
      const max=4*1024*1024;
      const length=Number(upstream.headers.get('content-length')||'0');
      if(length>max)return new Response(null,{status:413});
      const file=await upstream.arrayBuffer();
      if(!file.byteLength||file.byteLength>max)return new Response(null,{status:413});
      return new Response(request.method==='HEAD'?null:file,{headers:{
        'Content-Type':type,'Cache-Control':'public, max-age=180, s-maxage=180',
        'X-Content-Type-Options':'nosniff'
      }});
    } catch (error) {
      console.error('Brand logo unavailable:',error instanceof Error?error.message:'unknown');
      return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
};
