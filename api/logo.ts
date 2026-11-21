import { configuredR2, presignMedia } from '../server/r2.js';

/** A public, fixed brand asset. All other R2 objects stay user-private. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
    try {
      const r2=configuredR2();
      // The official asset lives at bucket "toonroom" / object "logo.png".
      // Accept the original prefixed object path as a read-only fallback so
      // deployments with a different bucket layout remain compatible.
      let upstream:Response|null=null;
      for(const key of ['logo.png','toonroom/logo.png']){
        const signed=presignMedia(r2,key,'GET');
        const result=await fetch(signed,{method:'GET',signal:AbortSignal.timeout(10000)});
        if(result.ok){upstream=result;break;}
        if(result.status!==404)return new Response(null,{status:502});
      }
      if(!upstream)return new Response(null,{status:404});
      const max=4*1024*1024;
      const length=Number(upstream.headers.get('content-length')||'0');
      if(length>max)return new Response(null,{status:413});
      const file=await upstream.arrayBuffer();
      if(!file.byteLength||file.byteLength>max)return new Response(null,{status:413});
      const bytes=new Uint8Array(file);
      // R2 objects can be uploaded with generic application/octet-stream
      // metadata. Detect actual supported image bytes so the official PNG
      // displays correctly regardless of its stored Content-Type.
      const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value);
      const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
        String.fromCharCode(...bytes.slice(8,12))==='WEBP';
      const type=png?'image/png':jpeg?'image/jpeg':webp?'image/webp':null;
      if(!type)return new Response(null,{status:415});
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
