/**
 * Deterministic, local hand observations for SIRVIBE's existing vector rig.
 * MediaPipe remains the only ML inference; no new model or asset is required.
 *
 * Finger curls are normalized 0=open, 1=closed. A missing finger/hand is
 * UNKNOWN, never treated as a fist or as an observed relaxed hand.
 */
import { clamp } from './animation.ts';
import type { Landmark } from './performanceCapture.ts';

export type FingerCurls=[number,number,number,number,number];
export type CapturedContact='prayer'|'hands-on-head'|'guard'|'punch-left'|'punch-right';
const groups=[[2,3,4],[5,6,8],[9,10,12],[13,14,16],[17,18,20]] as const;
const good=(p?:Landmark)=>Boolean(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=.5);
const gap=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);
function jointCurl(base:Landmark,middle:Landmark,tip:Landmark){
  const a={x:base.x-middle.x,y:base.y-middle.y};
  const b={x:tip.x-middle.x,y:tip.y-middle.y};
  const denom=Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y);
  if(denom<1e-8)return 0;
  const cos=clamp((a.x*b.x+a.y*b.y)/denom,-1,1);
  const angle=Math.acos(cos)*180/Math.PI;
  return clamp((165-angle)/105);
}
export function measuredFingerCurls(hand?:Landmark[]):FingerCurls|undefined {
  if(!hand||hand.length<21||!good(hand[0]))return undefined;
  const wrist=hand[0],curls:number[]=[];
  for(const [baseIndex,middleIndex,tipIndex] of groups){
    const base=hand[baseIndex],middle=hand[middleIndex],tip=hand[tipIndex];
    if(!good(base)||!good(middle)||!good(tip))return undefined;
    const reach=gap(tip,wrist)/Math.max(.001,gap(base,wrist)+gap(middle,base));
    const distanceCurl=clamp((1.25-reach)/.7);
    curls.push(Math.round(clamp(distanceCurl*.74+jointCurl(base,middle,tip)*.26)*1000)/1000);
  }
  return curls as FingerCurls;
}
export function observedHandPose(curls:FingerCurls){
  const extended=curls.slice(1).map(v=>v<.46);
  const count=extended.filter(Boolean).length;
  if(count===0&&curls[0]<.36)return 'thumbs-up' as const;
  if(count===0)return 'fist' as const;
  if(count===4)return 'open' as const;
  if(extended[0]&&!extended[1]&&!extended[2]&&!extended[3])return 'point' as const;
  if(extended[0]&&extended[1]&&!extended[2]&&!extended[3])return 'count-two' as const;
  if(extended[0]&&extended[1]&&extended[2]&&!extended[3])return 'count-three' as const;
  if(count===3)return 'loose-open' as const;
  // Non-preset fingers still animate independently via the captured curls.
  return 'relaxed' as const;
}
/** Classify only observed joint arrangements. Do not infer an emotion from a
 * gesture, nor invent an unseen second hand for a contact. */
export function detectedHandContact(
  pose:readonly Landmark[],left?:Landmark[],right?:Landmark[]
):CapturedContact|undefined{
  const head=pose[0],leftShoulder=pose[11],rightShoulder=pose[12],
    leftWrist=pose[15],rightWrist=pose[16];
  const shoulders=good(leftShoulder)&&good(rightShoulder);
  if(!shoulders)return undefined;
  const span=Math.max(.07,gap(leftShoulder,rightShoulder));
  const mid={x:(leftShoulder.x+rightShoulder.x)/2,y:(leftShoulder.y+rightShoulder.y)/2};
  const both=good(leftWrist)&&good(rightWrist);
  const leftFingers=measuredFingerCurls(left);
  const rightFingers=measuredFingerCurls(right);
  const leftFist=Boolean(leftFingers&&leftFingers.slice(1).every(v=>v>.65));
  const rightFist=Boolean(rightFingers&&rightFingers.slice(1).every(v=>v>.65));
  if(both){
    const near=gap(leftWrist,rightWrist)/span;
    const wristCenter={x:(leftWrist.x+rightWrist.x)/2,y:(leftWrist.y+rightWrist.y)/2};
    const nearHead=good(head)&&leftWrist.y<head.y+span*.32&&rightWrist.y<head.y+span*.32&&
      Math.abs(leftWrist.x-head.x)<span*.94&&Math.abs(rightWrist.x-head.x)<span*.94;
    if(nearHead)return 'hands-on-head';
    // Both wrists touch in front of the chest, with fingers open/partly open.
    if(near<.42&&wristCenter.y<mid.y+span*.5&&wristCenter.y>mid.y-span*.65&&
       leftFingers&&rightFingers&&
       leftFingers.slice(1).some(v=>v<.65)&&rightFingers.slice(1).some(v=>v<.65))
      return 'prayer';
    if(leftFist&&rightFist&&good(head)&&
       Math.abs(leftWrist.x-mid.x)<span*.85&&Math.abs(rightWrist.x-mid.x)<span*.85&&
       leftWrist.y<mid.y+span*.45&&rightWrist.y<mid.y+span*.45)
      return 'guard';
  }
  // A clenched, visibly extended arm can be a punch pose. No punching is
  // inferred from a raised palm or an unknown hand.
  const punch=(side:'left'|'right')=>{
    const wrist=side==='left'?leftWrist:rightWrist;
    const shoulder=side==='left'?leftShoulder:rightShoulder;
    const fist=side==='left'?leftFist:rightFist;
    const elbow=pose[side==='left'?13:14];
    if(!fist||!good(wrist)||!good(elbow))return false;
    return gap(wrist,shoulder)>span*.92 &&
      Math.abs(wrist.x-mid.x)>span*.84&&
      Math.abs(wrist.y-shoulder.y)<span*.67;
  };
  if(punch('left'))return 'punch-left';
  if(punch('right'))return 'punch-right';
  return undefined;
}
