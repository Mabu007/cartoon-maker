import type {Landmark} from './performanceCapture.ts';
export type ThumbMotion={curl:number;opposition:number;abduction:number;pinch:number};
export type ThumbPair={left?:ThumbMotion;right?:ThumbMotion};
const unit=(n:number)=>Math.max(0,Math.min(1,n));
const vector=(a:Landmark,b:Landmark)=>[a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0)];
const dot=(a:number[],b:number[])=>a.reduce((v,x,i)=>v+x*b[i],0);
const length=(a:number[])=>Math.hypot(...a);
const distance=(a:Landmark,b:Landmark)=>length(vector(a,b));
const normal=(a:number[])=>a.map(v=>v/Math.max(1e-8,length(a)));
const valid=(p?:Landmark):p is Landmark=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z??0);
const round=(v:number)=>Math.round(unit(v)*1000)/1000;
/** Palm-relative anatomical frame, invariant to camera rotation and mirrored hands.
 * No pose-model visibility is required for these hand landmarks. */
export function measureThumb(hand?:Landmark[]):ThumbMotion|undefined{
  if(!hand||hand.length<21)return undefined;
  const [w,cmc,mcp,ip,tip,index]=hand;
  const middle=hand[9],pinky=hand[17],indexTip=hand[8];
  if(![w,cmc,mcp,ip,tip,index,middle,pinky,indexTip].every(valid))return undefined;
  const width=distance(index,pinky),height=distance(w,middle);
  if(width<1e-5||height<1e-5)return undefined;
  const outward=normal(vector(index,pinky));
  const palmUp=normal(vector(middle,w));
  const segmentLengths=[distance(cmc,mcp),distance(mcp,ip),distance(ip,tip)];
  if(segmentLengths.some(v=>v<width*.025))return undefined;
  const straightness=distance(cmc,tip)/segmentLengths.reduce((a,b)=>a+b,0);
  const ipBend=1-dot(normal(vector(ip,mcp)),normal(vector(tip,ip)));
  const curl=unit(Math.max((.96-straightness)/.40,ipBend*.75));
  const radial=dot(vector(tip,index),outward)/width;
  const travel=dot(vector(tip,cmc),outward)/width;
  const along=dot(vector(tip,cmc),palmUp)/height;
  const opposition=unit((.13-radial)/.65);
  const abduction=unit(Math.max(radial/.65,travel/.9,along*.75*(1-opposition)));
  const pinch=unit(1-distance(tip,indexTip)/(width*.35));
  return {curl:round(curl),opposition:round(opposition),abduction:round(abduction),pinch:round(pinch)};
}
export const thumbChannels=['curl','opposition','abduction','pinch'] as const;
export function blendThumb(a:ThumbMotion,b:ThumbMotion,t:number):ThumbMotion{
  return {curl:a.curl+(b.curl-a.curl)*t,opposition:a.opposition+(b.opposition-a.opposition)*t,
    abduction:a.abduction+(b.abduction-a.abduction)*t,pinch:a.pinch+(b.pinch-a.pinch)*t};
}
export function thumbExtended(v:ThumbMotion){return v.curl<.44&&v.opposition<.46&&v.abduction>.27;}
/** Independent thumb hold: reject one-frame changes of intent, then blend
 * toward fresh evidence. Missing data holds briefly, never forever. */
export function createThumbStabilizer(){
  let current:ThumbMotion|undefined,pending:ThumbMotion|undefined,last=-Infinity;
  return {
    update(value:ThumbMotion|undefined,time:number,quality=1){
      if(!value||quality<.12)return time-last<=.45?current:undefined;
      if(!current||time-last>.65||time<last){current={...value};pending=undefined;last=time;return current;}
      const dt=Math.max(.016,time-last);last=time;
      const delta=Math.max(...thumbChannels.map(k=>Math.abs(value[k]-current![k])));
      if(delta<.055){pending=undefined;return current;}
      if(delta>.25){
        if(!pending||Math.max(...thumbChannels.map(k=>Math.abs(value[k]-pending![k])))>.24){pending={...value};return current;}
      }
      pending=undefined;current=blendThumb(current,value,1-Math.exp(-dt*22));return current;
    },
    reset(){current=pending=undefined;last=-Infinity;}
  };
}
