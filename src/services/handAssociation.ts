/**
 * Identity-preserving MediaPipe hand association.
 *
 * Pose Landmarker already labels the actor's anatomical left/right wrists.
 * At a wrist crossing, proximity by itself is ambiguous: use the last
 * associated palm location with a short temporal history as a tie-breaker.
 * Hands are never invented when the detector returns fewer than two.
 */
import type { Landmark } from '../engine/performanceCapture.ts';
type Side='left'|'right';
export type HandAssignment={left?:Landmark[];right?:Landmark[]};
const good=(p?:Landmark)=>Boolean(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  (p.visibility??1)>=.5);
// Hand Landmarker visibility is not a per-joint confidence measurement.
export const validHandPoint=(p?:Landmark):p is Landmark=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const dist=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);
export function associateObservedHands(
  detections:readonly Landmark[][],pose:readonly Landmark[],
  previous:HandAssignment={},maxDistance=.29
):HandAssignment{
  const result:HandAssignment={};
  const valid=detections.filter(hand=>hand.length>=21&&hand.slice(0,21).every(validHandPoint)).slice(0,2);
  if(!valid.length)return result;
  const wrist:{left?:Landmark;right?:Landmark}={
    left:good(pose[15])?pose[15]:undefined,
    right:good(pose[16])?pose[16]:undefined
  };
  const anchorDistance=wrist.left&&wrist.right?dist(wrist.left,wrist.right):0;
  const ambiguous=anchorDistance<.09;
  const score=(side:Side,hand:Landmark[])=>{
    const target=wrist[side],last=previous[side]?.[0];
    if(target){
      const current=dist(hand[0],target);
      if(current>maxDistance)return Infinity;
      return current*(ambiguous?.45:1.15)+(last?dist(hand[0],last)*.65:0);
    }
    if(last){
      const continuity=dist(hand[0],last);
      return continuity<maxDistance?continuity*.72:Infinity;
    }
    // Hand-only framing: use the detector image's anatomical-side
    // convention as a weak last resort. No absent opposite hand is created.
    return side==='left'?Math.abs(hand[0].x-.75)+.18:
      Math.abs(hand[0].x-.25)+.18;
  };
  if(valid.length===1){
    const left=score('left',valid[0]),right=score('right',valid[0]);
    if(!Number.isFinite(left)&&!Number.isFinite(right))return result;
    result[left<=right?'left':'right']=valid[0];
    return result;
  }
  const [a,b]=valid;
  const aligned=score('left',a)+score('right',b);
  const crossed=score('left',b)+score('right',a);
  if(Number.isFinite(aligned)||Number.isFinite(crossed)){
    if(aligned<=crossed){result.left=a;result.right=b;}
    else{result.left=b;result.right=a;}
    return result;
  }
  // If only one side has a credible match, keep only that side. A bad
  // detection must never swap identities by manufacturing a second wrist.
  const candidates=[
    {side:'left' as const,hand:a,cost:score('left',a)},
    {side:'left' as const,hand:b,cost:score('left',b)},
    {side:'right' as const,hand:a,cost:score('right',a)},
    {side:'right' as const,hand:b,cost:score('right',b)}
  ].filter(item=>Number.isFinite(item.cost)).sort((x,y)=>x.cost-y.cost);
  if(candidates.length)result[candidates[0].side]=candidates[0].hand;
  return result;
}
