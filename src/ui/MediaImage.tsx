import { useEffect, useState } from 'react';
import { isR2MediaRef, mediaUrl, subscribeMediaUser } from '../services/media.ts';

function useMediaSource(source:string|undefined) {
  const [resolved,setResolved]=useState(() => source && !isR2MediaRef(source) ? source : '');
  useEffect(()=>{
    let live=true;
    const refresh=()=>{
      if(!source){setResolved('');return;}
      if(!isR2MediaRef(source)){setResolved(source);return;}
      setResolved('');
      void mediaUrl(source).then(url=>{if(live)setResolved(url);}).catch(()=>{if(live)setResolved('');});
    };
    refresh();
    const remove=subscribeMediaUser(refresh);
    return()=>{live=false;remove();};
  },[source]);
  return resolved;
}
export function MediaImage({source,alt='',className}:{source?:string;alt?:string;className?:string}) {
  const src=useMediaSource(source);
  return src?<img src={src} alt={alt} className={className}/>:<span className={className} role="img" aria-label={alt||'Artwork loading'}/>;
}
export function MediaSvgImage({source,...props}:{source?:string;width:number;height:number;x?:number;y?:number;preserveAspectRatio?:string}) {
  const href=useMediaSource(source);
  return href?<image href={href} {...props}/>:null;
}
