/**
 * Unified SIRVIBE capture recorder.
 *
 * Receives the exact filtered PerformanceKey displayed in the Studio, with
 * timestamps relative to the moment the user pressed Record. No second
 * retarget/filter pass, no uniform 12Hz sampling, and no interpolation across
 * tracking loss. Audio and motion share the same origin and end time.
 */
import { clamp } from './animation.ts';
import { reducePerformanceKeys, samplePerformance, type PerformanceKey } from './performanceCapture.ts';

export type ResolvedObservation = {
  /** Seconds since the shared Record clock, not wall-clock epoch time. */
  elapsed: number;
  /** Undefined means the camera could not reliably observe this frame. */
  sample?: PerformanceKey;
};
export type ResolvedTake = {
  keys: PerformanceKey[];
  duration: number;
  framesAccepted: number;
  framesDropped: number;
};
const precision=(n:number)=>Math.round(n*1e6)/1e6;
const absent=(time:number):PerformanceKey=>({time,pose:{},presence:0});
function keyAt(observation:ResolvedObservation,duration:number):PerformanceKey {
  const time=precision(clamp(observation.elapsed/duration));
  if(!observation.sample)return absent(time);
  const {armEvidence:_,...sample}=observation.sample;
  return {...sample,time,presence:clamp(sample.presence??1)};
}

/** Capture compression protects visibility transitions; the maximum remains
 * compatible with the bounded long-take key schema. */
function limitKeys(keys:PerformanceKey[],maximum:number):PerformanceKey[] {
  // Long takes are reduced in overlapping bounded windows, avoiding a
  // quadratic whole-take scan on low-end devices. Each boundary is retained.
  const reduce=(tolerance=1.7)=>{
    if(keys.length<=320)return reducePerformanceKeys(keys,tolerance);
    const output:PerformanceKey[]=[];
    for(let start=0;start<keys.length-1;start+=239){
      const window=reducePerformanceKeys(keys.slice(start,start+240),tolerance);
      output.push(...(start?window.slice(1):window));
    }
    return output;
  };
  let reduced=reduce();
  for(const tolerance of [2.8,4.5,7,10,15,25,40,70]){
    if(reduced.length<=maximum)break;
    reduced=reduce(tolerance);
  }
  if(reduced.length<=maximum)return reduced;
  const mandatory=new Set<number>([0,reduced.length-1]);
  for(let i=1;i<reduced.length;i++) {
    if((reduced[i].presence??1)!==(reduced[i-1].presence??1)){
      mandatory.add(i-1);mandatory.add(i);
    }
  }
  if(mandatory.size>maximum)throw Error(
    'Tracking dropped out too often to keep every transition. Improve lighting or framing and record again.'
  );
  const optional=reduced.map((_,i)=>i).filter(i=>!mandatory.has(i));
  const remaining=maximum-mandatory.size;
  for(let i=0;i<remaining&&optional.length;i++) {
    const position=Math.min(optional.length-1,Math.floor((i+.5)*optional.length/remaining));
    mandatory.add(optional[position]);
  }
  return [...mandatory].sort((a,b)=>a-b).map(i=>reduced[i]);
}

/** Optional post-take despiking. Only isolated, large departures between
 * two mutually agreeing nearby samples are corrected. Preserve all timing,
 * tracking gaps, contact changes, and discrete hand/head/expression beats.
 * The caller's original observation array is never mutated.
 */
export function cleanResolvedObservations(observations:readonly ResolvedObservation[]):ResolvedObservation[]{
  const angularDistance=(a:number,b:number)=>Math.abs(((a-b+540)%360)-180);
  return observations.map((event,index)=>{
    const left=observations[index-1],right=observations[index+1];
    const a=left?.sample,b=event.sample,c=right?.sample;
    if(!a||!b||!c||right.elapsed-left.elapsed>.28||
      right.elapsed<=left.elapsed||event.elapsed<=left.elapsed||event.elapsed>=right.elapsed||
      [a,b,c].some(key=>(key.presence??1)<.95))return event;
    if(a.contact!==b.contact||b.contact!==c.contact||a.expression!==b.expression||
      b.expression!==c.expression||a.headFacing!==b.headFacing||b.headFacing!==c.headFacing||
      a.nearArm!==b.nearArm||b.nearArm!==c.nearArm)return event;
    const fraction=(event.elapsed-left.elapsed)/(right.elapsed-left.elapsed);
    const expected=samplePerformance([{...a,time:0},{...c,time:1}],fraction);
    const pose={...b.pose},targets={...b.armTargets};
    let changed=false;
    for(const joint of Object.keys(pose) as (keyof typeof pose)[]){
      const av=a.pose[joint],bv=b.pose[joint],cv=c.pose[joint],ev=expected.pose[joint];
      if(av!==undefined&&bv!==undefined&&cv!==undefined&&ev!==undefined&&
        angularDistance(av,cv)<3&&angularDistance(bv,ev)>15){
        pose[joint]=ev;changed=true;
      }
    }
    for(const side of ['left','right'] as const){
      if(a.hands?.[side]!==b.hands?.[side]||b.hands?.[side]!==c.hands?.[side]||
        a.armBend?.[side]!==b.armBend?.[side]||b.armBend?.[side]!==c.armBend?.[side]||
        [a,b,c].some(key=>(key.armConfidence?.[side]??1)<.95))continue;
      const first=a.armTargets?.[side],middle=b.armTargets?.[side],last=c.armTargets?.[side],predicted=expected.armTargets?.[side];
      if(b.armExtension?.[side]===undefined&&first&&middle&&last&&predicted&&Math.hypot(first.x-last.x,first.y-last.y)<2&&
        Math.hypot(middle.x-predicted.x,middle.y-predicted.y)>8){
        targets[side]=predicted;changed=true;
      }
    }
    return changed?{...event,sample:{...b,pose,armTargets:targets.left||targets.right?targets:undefined}}:event;
  });
}

/**
 * Unlike the legacy raw-landmark compiler, this path cannot silently change
 * joint timing: input samples were *already* retargeted and filtered for the
 * on-screen character. Unknown intervals are persisted as presence=0.
 */
export function compileResolvedPerformance(
  observations:readonly ResolvedObservation[], takeDuration:number,
  options:{maxKeys?:number;cleanMotion?:boolean}={}
):ResolvedTake {
  if(!Number.isFinite(takeDuration)||takeDuration<.15||takeDuration>180)
    throw Error('Record a performance between 0.15 and 180 seconds.');
  const max=Math.max(2,Math.min(2400,Math.floor(options.maxKeys??Math.max(240,Math.ceil(takeDuration*13)))));
  let previous=-1;
  const ordered:ResolvedObservation[]=[];
  for(const event of observations){
    if(!Number.isFinite(event.elapsed)||event.elapsed<0||event.elapsed>takeDuration+.001)continue;
    if(event.elapsed<=previous+0.00001)continue;
    previous=event.elapsed;
    ordered.push(event);
  }
  const accepted=ordered.filter(o=>o.sample).length;
  if(accepted<2)throw Error(
    'At least two tracked moments are required. Improve lighting, face the webcam and try again.'
  );
  const normalized=(options.cleanMotion?cleanResolvedObservations(ordered):ordered).map(o=>keyAt(o,takeDuration));
  const first=normalized[0];
  const keys:PerformanceKey[] = first.time>0 ? [absent(0),...normalized] : normalized;
  const last=keys[keys.length-1];
  if(last.time<1){
    const lag=takeDuration-ordered[ordered.length-1].elapsed;
    // Do not extend an old pose into an unobserved audio tail.
    keys.push(lag<=.15&&last.presence!==0
      ? {...last,time:1}
      : absent(1));
  }else last.time=1;
  if(keys.length<2)throw Error('Not enough timing data to create a performance.');
  const compact=limitKeys(keys,max);
  compact[0]={...compact[0],time:0};
  compact[compact.length-1]={...compact[compact.length-1],time:1};
  return {
    keys:compact,
    duration:Math.round(takeDuration*1000)/1000,
    framesAccepted:accepted,
    framesDropped:ordered.length-accepted
  };
}
