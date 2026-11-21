import { type Graphics, type TextStyleOptions } from 'pixi.js';
import { clamp } from './animation.ts';
import type { Clip } from './schema.ts';
import type { Point } from './cameraTransform.ts';

export type VfxClip = Extract<Clip,{track:'vfx'}>;
export type TextClip = Extract<Clip,{track:'text'}>;
export const effectTime = (clip:Pick<Clip,'start'|'length'>,time:number) => clamp((time-clip.start)/clip.length);
const TAU=Math.PI*2;
const burst=(x:number,y:number,r:number,tips:number,inner=.55)=>
  Array.from({length:tips*2},(_,i)=>{
    const a=i*TAU/(tips*2)-Math.PI/2, d=r*(i%2?inner:1);
    return [x+Math.cos(a)*d,y+Math.sin(a)*d];
  }).flat();

export function drawVisualEffect(g:Graphics, clip:VfxClip, p:Point, t:number, width:number, height:number) {
  const {x,y}=p, s=clip.strength, alpha=Math.sin(Math.PI*clamp(t*1.2))*.94;
  if(clip.effect==='comedy-flash'){
    g.rect(0,0,width,height).fill({color:'#fff1d4',alpha:Math.max(0,1-t*3)*.42*s}); return;
  }
  if(clip.effect==='impact-boom'){
    const r=(54+22*t)*s;
    g.poly(burst(x,y,r,11,.68)).fill({color:'#ff925f',alpha}).stroke({color:'#76354a',width:3,alpha});
    g.poly(burst(x,y,r*.68,8,.65)).fill({color:'#ffe18b',alpha});return;
  }
  if(clip.effect==='shock-ring'){
    for(const delay of [0,.22]){
      g.circle(x,y,Math.max(1,(16+78*(t-delay))*s)).stroke({color:'#fff5c8',width:4*s,alpha:t>delay?alpha:0});
    }
    return;
  }
  const count=clip.effect==='confetti'?22:clip.effect==='speed-lines'?12:8;
  for(let i=0;i<count;i++){
    const angle=i*TAU/count+t*(clip.effect==='impact-stars'?2.1:.15);
    const distance=(17+t*(clip.effect==='comic-sweat'?38:83))*s;
    const dx=Math.cos(angle),dy=Math.sin(angle);
    const px=x+dx*distance,py=y+dy*distance;
    if(clip.effect==='impact-stars'||clip.effect==='sparkles'){
      g.poly(burst(px,py,(5+((i*7)%9))*(1-t*.55)*s,clip.effect==='sparkles'?4:5,.4))
        .fill({color:i%2?'#fff7c6':'#ffc35c',alpha});
    }else if(clip.effect==='dust-puff'){
      g.circle(px,y+dy*distance*.25,(8+i%4+10*t)*s).fill({color:'#eee0d2',alpha:alpha*.72});
    }else if(clip.effect==='comic-sweat'){
      if(i<5)g.ellipse(px,y+dy*distance-Math.max(0,t-.4)*44,3*s,7*s).fill({color:'#7fe9ff',alpha});
    }else if(clip.effect==='confetti'){
      g.rect(px,py+t*t*55,5*s,9*s).fill({color:['#fb85b6','#ffdf81','#8de7ca','#b1a0ff'][i%4],alpha});
    }else if(clip.effect==='speed-lines'){
      g.moveTo(px,py).lineTo(px+dx*28*s,py+dy*28*s).stroke({color:'#fff8eb',alpha,width:2.1*s});
    }
  }
}
export function drawTransition(g:Graphics, effect:string, p:number, w:number, h:number) {
  const shade='#171522';
  switch(effect){
    case 'wipe-left': g.rect(w*(1-p),0,w*p,h).fill(shade); return;
    case 'wipe-right':g.rect(0,0,w*p,h).fill(shade);return;
    case 'flash-cut':g.rect(0,0,w,h).fill({color:'#fff7ee',alpha:Math.sin(Math.PI*p)});return;
    case 'iris-in':case 'iris-out':
      g.rect(0,0,w,h).fill(shade).circle(w/2,h/2,Math.max(.1,Math.hypot(w,h)/2*(effect==='iris-in'?p:1-p))).cut();
      return;
    default:g.rect(0,0,w,h).fill({color:shade,alpha:effect==='fade-in'?1-p:p});
  }
}
export function titleStyle(clip:TextClip,width:number):TextStyleOptions{
  const comic=clip.style==='comic';
  return {
    fontFamily:'Arial',fontWeight:clip.style==='caption'?'600':'900',fontStyle:comic?'italic':'normal',
    fontSize:clip.size,fill:clip.color,align:'center',wordWrap:true,breakWords:true,wordWrapWidth:width*.86,
    stroke:{color:'#21172d',width:comic?4:2,join:'round'},
    dropShadow:{color:'#1c152d',alpha:.34,distance:3,blur:3}
  };
}
