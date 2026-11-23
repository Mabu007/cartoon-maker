/**
 * Small on-device One Euro filtering and tracking-state recovery for MoCap.
 * A single instance is owned by one Performance Studio webcam session.
 * The stabilized key is used BOTH for live preview AND the recorded clip.
 * No React state updates, additional models, allocations of large arrays,
 * or frame-rate-dependent easing are required.
 */
import type { JointName } from './schema.ts';
import type { PerformanceKey } from './performanceCapture.ts';
import { decideFrontArm, contactHysteresis, type ArmSide } from './performanceArmIntelligence.ts';
import { observedHandPose, type FingerCurls } from './performanceHandIntelligence.ts';
import { constrainCapturedHead, headFacingForYaw } from './performanceHeadEye.ts';
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
type FilterState={time:number;value:number;derivative:number};
function coefficient(cutoff:number,dt:number){
  return 1/(1+1/(2*Math.PI*Math.max(.05,cutoff)*dt));
}
export function oneEuroStep(
  previous:FilterState|undefined,measurement:number,time:number,
  minCutoff=2.1,beta=.035,derivativeCutoff=1.5,angular=false
):FilterState{
  if(!previous||!Number.isFinite(previous.value)||!Number.isFinite(time)||
    time-previous.time>.32||time<=previous.time)
    return {time,value:measurement,derivative:0};
  const dt=clamp(time-previous.time,.012,.2);
  const rawDelta=angular
    ?((measurement-previous.value+540)%360)-180
    :measurement-previous.value;
  const derivative=rawDelta/dt;
  const da=coefficient(derivativeCutoff,dt);
  const smoothedVelocity=previous.derivative+(derivative-previous.derivative)*da;
  const a=coefficient(minCutoff+beta*Math.abs(smoothedVelocity),dt);
  return {time,value:previous.value+rawDelta*a,derivative:smoothedVelocity};
}
export function createPerformanceStabilizer(){
  const filters=new Map<string,FilterState>();
  const lastGoodHand:{left?:{time:number;curls:FingerCurls};right?:{time:number;curls:FingerCurls}}={};
  const bend:{left?:number;right?:number}={};
  const pendingBend:{left?:number;right?:number}={};
  const counts:{left:number;right:number}={left:0,right:0};
  const handState:{
    left:{current?:NonNullable<PerformanceKey['hands']>['left'];candidate?:string;count:number};
    right:{current?:NonNullable<PerformanceKey['hands']>['right'];candidate?:string;count:number}
  }={left:{count:0},right:{count:0}};
  let nearArm:ArmSide|undefined;
  let nearCandidate:ArmSide|undefined,nearFrames=0;
  let lastTime=-Infinity,lastObservation=-Infinity;
  let lastOutput:PerformanceKey|undefined;
  const lastJoint=new Map<JointName,{time:number;value:number}>();
  const lastTarget:{
    left?:{time:number;x:number;y:number};
    right?:{time:number;x:number;y:number}
  }={};
  let trackedHead:'front'|'left'|'right'='front';
  let headCandidate:'front'|'left'|'right'|undefined,headFrames=0;
  let recentYaw:{time:number;value:number}|undefined;
  let reacquire:{since:number;previous:PerformanceKey}|undefined;
  let activeContact:string|undefined;
  let candidateContact:string|undefined;
  let candidateFrames=0,lastContactSeen=-Infinity;
  function filter(name:string,value:number,time:number,base:number,beta:number,angle=false,speedLimit?:number){
    const previous=filters.get(name);
    const next=oneEuroStep(previous,value,time,base,beta,1.7,angle);
    // Prevent single-frame neck/head spikes from snapping the entire face.
    // This is only active for captured head/neck, not authored animations.
    if(speedLimit&&previous&&time>previous.time&&time-previous.time<.35){
      const reach=speedLimit*(time-previous.time);
      next.value=previous.value+clamp(next.value-previous.value,-reach,reach);
    }
    filters.set(name,next);
    return next.value;
  }
  function recover(time:number):PerformanceKey|undefined{
    if(!lastOutput||!Number.isFinite(time))return undefined;
    const age=Math.max(0,time-lastObservation);
    if(age>=.72)return undefined;
    const fraction=clamp((age-.16)/.56,0,1);
    const presence=1-fraction*fraction*(3-2*fraction);
    const last=lastOutput;
    const confidence=last.handConfidence?{
      left:(last.handConfidence.left??0)*presence,
      right:(last.handConfidence.right??0)*presence
    }:undefined;
    return {...last,time,presence,
      ...(confidence?{handConfidence:confidence}:{}),
      ...(last.armConfidence?{armConfidence:{
        left:(last.armConfidence.left??1)*presence,
        right:(last.armConfidence.right??1)*presence
      }}:{})};
  }
  function update(key:PerformanceKey,smoothing=.25):PerformanceKey{
    const time=key.time;
    if(!Number.isFinite(time))return key;
    if(time<=lastTime)reset();
    else if(time-lastTime>.22){
      const previous=recover(time);
      const hadCapture=lastOutput!==undefined;
      reset();
      if(hadCapture)reacquire={since:time,previous:previous??{
        time,pose:{},presence:0
      }};
    }
    lastTime=time;
    const amount=clamp(smoothing,0,1);
    const pose={...key.pose};
    // Missing landmarks are not evidence of a new neutral joint. Preserve
    // each individually for 160ms, then relax over 420ms. Other observed
    // joints keep tracking at full speed; no whole-puppet reset.
    for(const [joint,previous] of lastJoint){
      if(pose[joint]!==undefined)continue;
      const age=time-previous.time;
      if(age>=.58){lastJoint.delete(joint);continue;}
      const fade=clamp((age-.16)/.42,0,1);
      pose[joint]=previous.value*(1-fade*fade*(3-2*fade));
    }
    for(const [joint,measurement] of Object.entries(pose) as [JointName,number][]){
      if(!Number.isFinite(measurement))continue;
      const wrist=joint.endsWith('Wrist');
      const elbow=joint.endsWith('Elbow');
      const base=wrist?3.1-amount*1.5:elbow?3.7-amount*1.5:4.7-amount*1.1;
      const beta=wrist?.085:elbow?.070:.045;
      const head=joint==='head'||joint==='neck';
      pose[joint]=clamp(filter('joint:'+joint,measurement,time,
        head?2.2-amount*.75:base,head?0.016:beta,true,
        head?(joint==='head'?135:95):undefined),-180,180);
      if(key.pose[joint]!==undefined)lastJoint.set(joint,{time,value:pose[joint]!});
    }
    const targets:PerformanceKey['armTargets']={};
    const depths:PerformanceKey['armDepth']={};
    const bends:PerformanceKey['armBend']={};
    const curls:PerformanceKey['fingerCurls']={};
    const confidence:PerformanceKey['handConfidence']={};
    const armConfidence:PerformanceKey['armConfidence']={};
    const hands:NonNullable<PerformanceKey['hands']>={left:'relaxed',right:'relaxed'};
    for(const side of ['left','right'] as const){
      const point=key.armTargets?.[side];
      if(point){
        targets[side]={
          x:filter(side+':target-x',point.x,time,3.6-amount*1.6,.095),
          y:filter(side+':target-y',point.y,time,3.6-amount*1.6,.095)
        };
        lastTarget[side]={time,...targets[side]!};
        armConfidence[side]=1;
      }else{
        const observed=lastTarget[side],age=observed?time-observed.time:Infinity;
        if(observed&&age<.6){
          targets[side]={x:observed.x,y:observed.y};
          const fade=clamp((age-.12)/.48,0,1);
          armConfidence[side]=1-fade*fade*(3-2*fade);
        }
      }
      const depth=key.armDepth?.[side];
      if(depth!==undefined)
        depths[side]=clamp(filter(side+':depth',depth,time,2.5,.012),-1,1);
      const measuredBend=key.armBend?.[side];
      if(measuredBend!==undefined){
        if(bend[side]===undefined) bend[side]=measuredBend;
        else if(measuredBend!==bend[side]){
          counts[side]=pendingBend[side]===measuredBend?counts[side]+1:1;
          pendingBend[side]=measuredBend;
          if(counts[side]>=3){bend[side]=measuredBend;counts[side]=0;pendingBend[side]=undefined;}
        }else{counts[side]=0;pendingBend[side]=undefined;}
        bends[side]=bend[side];
      }else if(bend[side]!==undefined && lastTarget[side] &&
        time-lastTarget[side]!.time<.6){
        // Do not suddenly invert the elbow when its pole keypoint is briefly
        // hidden behind the chest. Keep the proven anatomical bend until
        // fresh evidence or the whole arm fades out.
        bends[side]=bend[side];
      }
      const detected=key.fingerCurls?.[side];
      const quality=clamp(key.handConfidence?.[side]??1,0,1);
      if(detected&&quality>.08){
        // An old detector frame may remain visible briefly but never
        // restarts the hold timer. Its influence decays while the arm moves.
        if(quality>.92)lastGoodHand[side]={time,curls:detected};
        confidence[side]=quality;
        curls[side]=detected.map((value,index)=>
          clamp(filter(side+':finger:'+index,value,time,2.3-amount*1.2,.22*quality),0,1)
        ) as FingerCurls;
      }else{
        const held=lastGoodHand[side],age=held?time-held.time:Infinity;
        if(held&&age<.17){
          // Deliberate short pose hold with confidence fading. Never persist
          // it as a fully observed hand, and never hold indefinitely.
          confidence[side]=clamp(1-age/.17,0,1);
          curls[side]=held.curls.map((value,index)=>
            clamp(filter(side+':finger:'+index,value,time,2,.12),0,1)
          ) as FingerCurls;
        }
      }
      const state=handState[side];
      if(curls[side]&&(confidence[side]??0)>.1){
        const classified=observedHandPose(curls[side]!);
        if(state.current===undefined){state.current=classified;}
        else if(classified!==state.current){
          state.count=state.candidate===classified?state.count+1:1;
          state.candidate=classified;
          if(state.count>=2){
            state.current=classified;state.count=0;state.candidate=undefined;
          }
        }else{state.count=0;state.candidate=undefined;}
      }else{state.candidate=undefined;state.count=0;}
      hands[side]=state.current??key.hands?.[side]??'relaxed';
    }
    if(depths.left!==undefined||depths.right!==undefined){
      const proposed=decideFrontArm(depths,nearArm);
      if(!nearArm)nearArm=proposed;
      else if(proposed!==nearArm){
        nearFrames=nearCandidate===proposed?nearFrames+1:1;
        nearCandidate=proposed;
        if(nearFrames>=3){nearArm=proposed;nearCandidate=undefined;nearFrames=0;}
      }else{nearCandidate=undefined;nearFrames=0;}
    }
    const observedContact=key.contact;
    if(observedContact)lastContactSeen=time;
    const inferred=observedContact??(time-lastContactSeen<.15?activeContact:undefined);
    const contact=contactHysteresis(activeContact,inferred,candidateContact,candidateFrames);
    activeContact=contact.contact;
    candidateContact=contact.candidate;
    candidateFrames=contact.count;
    const headYaw=key.headYaw!==undefined
      ?clamp(filter('head:yaw',key.headYaw,time,2.8,.16),-1,1)
      :recentYaw&&time-recentYaw.time<.5
        ?recentYaw.value*(1-clamp((time-recentYaw.time-.16)/.34,0,1))
        :undefined;
    if(key.headYaw!==undefined)recentYaw={time,value:headYaw!};
    if(headYaw!==undefined){
      const next=headFacingForYaw(headYaw,trackedHead);
      if(next===trackedHead){headCandidate=undefined;headFrames=0;}
      else{
        headFrames=headCandidate===next?headFrames+1:1;
        headCandidate=next;
        if(headFrames>=3){trackedHead=next;headCandidate=undefined;headFrames=0;}
      }
    }
    const focus=key.focus?{
      x:clamp(filter('eyes:x',key.focus.x,time,4,.15),-1,1),
      y:clamp(filter('eyes:y',key.focus.y,time,4,.15),-1,1)
    }:undefined;
    const result:PerformanceKey={
      ...key,pose:constrainCapturedHead(pose),focus,hands,
      ...(headYaw!==undefined?{headYaw,headFacing:trackedHead}:{}),
      armTargets:targets.left||targets.right?targets:undefined,
      armConfidence:armConfidence.left!==undefined||armConfidence.right!==undefined?armConfidence:undefined,
      armDepth:depths.left!==undefined||depths.right!==undefined?depths:undefined,
      armBend:bends.left!==undefined||bends.right!==undefined?bends:undefined,
      nearArm,
      fingerCurls:curls.left||curls.right?curls:undefined,
      handConfidence:confidence.left!==undefined||confidence.right!==undefined?confidence:undefined,
      contact:activeContact as PerformanceKey['contact']
    };
    if(reacquire){
      // Blend the first 180ms from the last held pose to the new measured
      // one. After a long outage, fade in from the existing authored rig.
      const ratio=clamp((time-reacquire.since)/.18,0,1);
      const t=ratio*ratio*(3-2*ratio);
      const prev=reacquire.previous;
      const merged={...result.pose};
      for(const joint of Object.keys(merged) as JointName[]){
        const v=merged[joint],from=prev.pose[joint];
        if(v!==undefined&&from!==undefined)
          merged[joint]=from+(v-from)*t;
      }
      result.pose=constrainCapturedHead(merged);
      result.presence=(prev.presence??1)*(1-t)+t;
      if(prev.focus&&result.focus)result.focus={
        x:prev.focus.x+(result.focus.x-prev.focus.x)*t,
        y:prev.focus.y+(result.focus.y-prev.focus.y)*t
      };
      if(prev.armTargets&&result.armTargets){
        for(const side of ['left','right'] as const){
          const old=prev.armTargets[side],next=result.armTargets[side];
          if(old&&next)result.armTargets[side]={
            x:old.x+(next.x-old.x)*t,y:old.y+(next.y-old.y)*t
          };
        }
      }
      if(t<.6&&prev.headFacing)result.headFacing=prev.headFacing;
      if(t>=1)reacquire=undefined;
    }
    lastOutput=result;lastObservation=time;
    return result;
  }
  function reset(){
    filters.clear();
    lastJoint.clear();lastTarget.left=undefined;lastTarget.right=undefined;
    lastOutput=undefined;lastObservation=-Infinity;recentYaw=undefined;
    trackedHead='front';headCandidate=undefined;headFrames=0;
    reacquire=undefined;
    lastGoodHand.left=undefined;lastGoodHand.right=undefined;
    bend.left=undefined;bend.right=undefined;
    pendingBend.left=undefined;pendingBend.right=undefined;
    counts.left=0;counts.right=0;
    for(const side of ['left','right'] as const){
      handState[side].current=undefined;
      handState[side].candidate=undefined;
      handState[side].count=0;
    }
    nearArm=undefined;nearCandidate=undefined;nearFrames=0;
    activeContact=undefined;candidateContact=undefined;
    candidateFrames=0;lastContactSeen=-Infinity;
    lastTime=-Infinity;
  }
  return {update,recover,reset};
}
