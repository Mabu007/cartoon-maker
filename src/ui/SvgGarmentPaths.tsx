import {useId} from 'react';
import type {Character} from '../engine/schema.ts';
import type {GarmentPath} from '../engine/garmentGeometry.ts';
export function GarmentPattern({character,id}:{character:Character;id:string}){
 const d=character.garmentDesign;if(!d||d.pattern==='solid'||d.patternOpacity===0)return null;
 const size=8*d.patternScale;
 return <defs><pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size}>
  <g fill={d.accent} opacity={d.patternOpacity}>{d.pattern==='dots'?<circle cx={size*.5} cy={size*.5} r={size*.12}/>:<><rect width={size*.24} height={size}/>{d.pattern==='checks'&&<rect width={size} height={size*.24}/>}</>}</g>
 </pattern></defs>;
}
export function SvgGarmentPaths({paths,patternId}:{paths:readonly GarmentPath[];patternId:string}){
 const id=useId().replace(/:/g,'');
 return <>{paths.map(item=>item.image&&item.imageBox?<g key={item.id}><defs><clipPath id={id+'-'+item.id}><path d={item.d}/></clipPath></defs><image href={item.image} {...item.imageBox} preserveAspectRatio="xMidYMid meet" clipPath={'url(#'+id+'-'+item.id+')'}/></g>:<g key={item.id}><path d={item.d} fill={item.fill} stroke={item.stroke} strokeWidth={item.strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>{item.fabric&&<path d={item.d} fill={`url(#${patternId}) none`} stroke="none"/>}</g>)}</>;
}
