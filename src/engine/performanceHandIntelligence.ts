/**
 * Deterministic, local hand observations for SIRVIBE's existing vector rig.
 * MediaPipe remains the only ML inference; no new model or asset is required.
 *
 * Finger curls are normalized 0=open, 1=closed. A missing finger/hand is
 * UNKNOWN, never treated as a fist or as an observed relaxed hand.
 */
import { thumbExtended, type ThumbMotion } from './thumbIntelligence.ts';
import { clamp } from './animation.ts';
import { validHandPoint } from '../services/handAssociation.ts';
import type { Landmark } from './performanceCapture.ts';

export type FingerCurls=[number,number,number,number,number];
export type CapturedContact='prayer'|'hands-on-head'|'guard'|'punch-left'|'punch-right'|'chin-left'|'chin-right'|'forehead-left'|'forehead-right'|'hip-left'|'hip-right';
const groups=[[2,3,4],[5,6,8],[9,10,12],[13,14,16],[17,18,20]] as const;
const good=(p?:Landmark)=>Boolean(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=.5);
const gap=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);
function jointCurl(base:Landmark,middle:Landmark,tip:Landmark){
  const a={x:base.x-middle.x,y:base.y-middle.y,z:(base.z??0)-(middle.z??0)};
  const b={x:tip.x-middle.x,y:tip.y-middle.y,z:(tip.z??0)-(middle.z??0)};
  const denom=Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z);
  if(denom<1e-8)return 0;
  const cos=clamp((a.x*b.x+a.y*b.y+a.z*b.z)/denom,-1,1);
  const angle=Math.acos(cos)*180/Math.PI;
  return clamp((165-angle)/105);
}
export function measuredFingerCurls(hand?:Landmark[]):FingerCurls|undefined {
  if(!hand||hand.length<21||!validHandPoint(hand[0]))return undefined;
  const wrist=hand[0],curls:number[]=[];
  for(const [baseIndex,middleIndex,tipIndex] of groups){
    const base=hand[baseIndex],middle=hand[middleIndex],tip=hand[tipIndex];
    if(!validHandPoint(base)||!validHandPoint(middle)||!validHandPoint(tip))return undefined;
    const distance3=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
    const reach=distance3(tip,wrist)/Math.max(.001,distance3(base,wrist)+distance3(middle,base));
    const distanceCurl=clamp((1.25-reach)/.7);
    const segmentRatio=distance3(base,tip)/Math.max(.001,distance3(base,middle)+distance3(middle,tip));
    // 3D segment geometry distinguishes a straight finger aimed toward
    // the lens from one truly folded into the palm.
    const bend=jointCurl(base,middle,tip);
    const curl=segmentRatio>.96&&bend<.12?Math.min(.15,distanceCurl*.2):clamp(distanceCurl*.55+bend*.45);
    // Expand clear open/closed evidence to the illustrated rig's full range.
    curls.push(Math.round(clamp((curl-.12)/.68)*1000)/1000);
  }
  return curls as FingerCurls;
}
export function observedHandPose(curls:FingerCurls,thumb?:ThumbMotion){
  const extended=curls.slice(1).map(v=>v<.46);
  const count=extended.filter(Boolean).length;
  if(thumb&&thumb.pinch>.78&&thumb.opposition>.38&&count<=1&&curls[1]<.85)return 'pinch' as const;
  if(count===0&&(thumb?thumbExtended(thumb):curls[0]<.36))return 'thumbs-up' as const;
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
  pose:readonly Landmark[],left?:Landmark[],right?:Landmark[],
  observedLeft?:FingerCurls,observedRight?:FingerCurls
):CapturedContact|undefined{
  const head=pose[0],leftShoulder=pose[11],rightShoulder=pose[12],
    leftWrist=pose[15],rightWrist=pose[16];
  const shoulders=good(leftShoulder)&&good(rightShoulder);
  if(!shoulders)return undefined;
  const span=Math.max(.07,gap(leftShoulder,rightShoulder));
  const mid={x:(leftShoulder.x+rightShoulder.x)/2,y:(leftShoulder.y+rightShoulder.y)/2};
  const both=good(leftWrist)&&good(rightWrist);
  const leftFingers=observedLeft??measuredFingerCurls(left);
  const rightFingers=observedRight??measuredFingerCurls(right);
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
  // Single-hand contacts require observed palm/fingertip proximity, not
  // simply a wrist that happens to cross the face in projection.
  for(const side of ['left','right'] as const){
    const hand=side==='left'?left:right;
    const wrist=side==='left'?leftWrist:rightWrist;
    if(!hand||!good(hand[0])||!good(wrist)||gap(hand[0],wrist)>span*.28)continue;
    const palm=hand[9],tip=hand[12],hip=pose[side==='left'?23:24];
    const near=(point:Landmark,radius:number)=>[palm,tip].some(p=>validHandPoint(p)&&gap(p,point)<span*radius);
    if(good(head)){
      const eyes=pose[2],other=pose[5];
      const forehead={x:head.x,y:head.y-span*.26};
      const chin={x:head.x,y:head.y+span*.19};
      if(good(eyes)&&good(other)&&near(forehead,.16))return side==='left'?'forehead-left':'forehead-right';
      if(near(chin,.14))return side==='left'?'chin-left':'chin-right';
    }
    if(good(hip)&&near(hip,.2))return side==='left'?'hip-left':'hip-right';
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
