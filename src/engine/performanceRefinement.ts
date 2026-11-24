/** Noncausal refinement on timestamped retargeted observations. Never moves
 * a sample in time; only reconstructs short, bracketed gaps and damps noise
 * around near-stationary holds. Long occlusions remain explicit.
 */
import { cleanResolvedObservations,type ResolvedObservation } from './resolvedPerformance.ts';
import { samplePerformance,type PerformanceKey } from './performanceCapture.ts';
import { mixDegrees,wrapDegrees } from './worldRetarget.ts';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
function sameBeat(a:PerformanceKey,b:PerformanceKey){
  return a.contact===b.contact&&a.bodyFacing===b.bodyFacing&&a.headFacing===b.headFacing&&
    a.hands?.left===b.hands?.left&&a.hands?.right===b.hands?.right;
}
export function refinePerformance(observations:readonly ResolvedObservation[]):ResolvedObservation[]{
  const source=cleanResolvedObservations(observations);
  const result=source.slice();
  const present=(o:ResolvedObservation)=>o.sample&&(o.sample.presence??1)>.9;
  for(let i=1;i<source.length-1;i++){
    if(present(source[i]))continue;
    const start=i;
    while(i<source.length&&!present(source[i]))i++;
    if(i>=source.length)break;
    const before=source[start-1],after=source[i],a=before.sample,b=after.sample;
    if(!a||!b||!sameBeat(a,b)||after.elapsed-before.elapsed>.28)continue;
    for(let j=start;j<i;j++){
      const fraction=(source[j].elapsed-before.elapsed)/(after.elapsed-before.elapsed);
      const sample=samplePerformance([{...a,time:0},{...b,time:1}],fraction);
      // Only interpolate jointly observed channels, not new body parts.
      for(const joint of Object.keys(sample.pose) as (keyof typeof sample.pose)[])
        if(a.pose[joint]===undefined||b.pose[joint]===undefined)delete sample.pose[joint];
      for(const side of ['left','right'] as const)
        if(!a.armTargets?.[side]||!b.armTargets?.[side])delete sample.armTargets?.[side];
      result[j]={...source[j],sample:{...sample,time:source[j].elapsed,presence:1}};
    }
  }
  const snapshot=result.slice();
  return snapshot.map((event,i)=>{
    const a=snapshot[i-1]?.sample,b=event.sample,c=snapshot[i+1]?.sample;
    if(!a||!b||!c||[a,b,c].some(k=>(k.presence??1)<.9)||!sameBeat(a,b)||!sameBeat(b,c)||
      snapshot[i+1].elapsed-snapshot[i-1].elapsed>.35)return event;
    const pose={...b.pose},targets={...b.armTargets};
    for(const joint of Object.keys(pose) as (keyof typeof pose)[]){
      const x=a.pose[joint],y=b.pose[joint],z=c.pose[joint];
      if(x!==undefined&&y!==undefined&&z!==undefined&&Math.abs(wrapDegrees(z-x))<5&&Math.abs(wrapDegrees(y-x))<12)
        pose[joint]=mixDegrees(y,mixDegrees(x,z,.5),.5);
    }
    for(const side of ['left','right'] as const){
      const x=a.armTargets?.[side],y=b.armTargets?.[side],z=c.armTargets?.[side];
      if(x&&y&&z&&distance(x,z)<3&&distance(x,y)<7)
        targets[side]={x:y.x*.5+(x.x+z.x)*.25,y:y.y*.5+(x.y+z.y)*.25};
    }
    return {...event,sample:{...b,pose,armTargets:targets.left||targets.right?targets:undefined}};
  });
}
/** Keep recorded gesture timing aligned to the observation clock while
 * using stabilized contact/facing decisions. Raw source stays untouched. */
export function combineCaptureEvidence(raw:PerformanceKey,stable:PerformanceKey):PerformanceKey{
  const pose={...stable.pose};
  for(const joint of Object.keys(raw.pose) as (keyof typeof pose)[]){
    const x=raw.pose[joint],y=stable.pose[joint];
    if(x!==undefined&&y!==undefined&&Math.abs(wrapDegrees(x-y))>7)pose[joint]=wrapDegrees(mixDegrees(y,x,.72));
  }
  const targets={...stable.armTargets};
  for(const side of ['left','right'] as const){
    const x=raw.armTargets?.[side],y=stable.armTargets?.[side];
    if(x&&y&&distance(x,y)>4)targets[side]={x:y.x*.25+x.x*.75,y:y.y*.25+x.y*.75};
  }
  return {...stable,pose,armTargets:targets.left||targets.right?targets:undefined};
}
