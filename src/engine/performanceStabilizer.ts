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
  let lastTime=-Infinity;
  let activeContact:string|undefined;
  let candidateContact:string|undefined;
  let candidateFrames=0,lastContactSeen=-Infinity;
  function filter(name:string,value:number,time:number,base:number,beta:number,angle=false){
    const next=oneEuroStep(filters.get(name),value,time,base,beta,1.7,angle);
    filters.set(name,next);
    return next.value;
  }
  function update(key:PerformanceKey,smoothing=.25):PerformanceKey{
    const time=key.time;
    if(!Number.isFinite(time))return key;
    if(time<=lastTime||time-lastTime>.42)reset();
    lastTime=time;
    const amount=clamp(smoothing,0,1);
    const pose={...key.pose};
    for(const [joint,measurement] of Object.entries(pose) as [JointName,number][]){
      if(!Number.isFinite(measurement))continue;
      const wrist=joint.endsWith('Wrist');
      const elbow=joint.endsWith('Elbow');
      const base=wrist?3.1-amount*1.5:elbow?3.7-amount*1.5:4.7-amount*1.1;
      const beta=wrist?.085:elbow?.070:.045;
      pose[joint]=clamp(filter('joint:'+joint,measurement,time,base,beta,true),-180,180);
    }
    const targets:PerformanceKey['armTargets']={};
    const depths:PerformanceKey['armDepth']={};
    const bends:PerformanceKey['armBend']={};
    const curls:PerformanceKey['fingerCurls']={};
    const confidence:PerformanceKey['handConfidence']={};
    const hands:NonNullable<PerformanceKey['hands']>={left:'relaxed',right:'relaxed'};
    for(const side of ['left','right'] as const){
      const point=key.armTargets?.[side];
      if(point){
        targets[side]={
          x:filter(side+':target-x',point.x,time,3.6-amount*1.6,.095),
          y:filter(side+':target-y',point.y,time,3.6-amount*1.6,.095)
        };
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
      nearArm=decideFrontArm(depths,nearArm);
    }
    const observedContact=key.contact;
    if(observedContact)lastContactSeen=time;
    const inferred=observedContact??(time-lastContactSeen<.15?activeContact:undefined);
    const contact=contactHysteresis(activeContact,inferred,candidateContact,candidateFrames);
    activeContact=contact.contact;
    candidateContact=contact.candidate;
    candidateFrames=contact.count;
    const focus=key.focus?{
      x:clamp(filter('eyes:x',key.focus.x,time,4,.15),-1,1),
      y:clamp(filter('eyes:y',key.focus.y,time,4,.15),-1,1)
    }:undefined;
    const result:PerformanceKey={
      ...key,pose,focus,hands,
      armTargets:targets.left||targets.right?targets:undefined,
      armDepth:depths.left!==undefined||depths.right!==undefined?depths:undefined,
      armBend:bends.left!==undefined||bends.right!==undefined?bends:undefined,
      nearArm,
      fingerCurls:curls.left||curls.right?curls:undefined,
      handConfidence:confidence.left!==undefined||confidence.right!==undefined?confidence:undefined,
      contact:activeContact as PerformanceKey['contact']
    };
    return result;
  }
  function reset(){
    filters.clear();
    lastGoodHand.left=undefined;lastGoodHand.right=undefined;
    bend.left=undefined;bend.right=undefined;
    pendingBend.left=undefined;pendingBend.right=undefined;
    counts.left=0;counts.right=0;
    for(const side of ['left','right'] as const){
      handState[side].current=undefined;
      handState[side].candidate=undefined;
      handState[side].count=0;
    }
    nearArm=undefined;activeContact=undefined;candidateContact=undefined;
    candidateFrames=0;lastContactSeen=-Infinity;
    lastTime=-Infinity;
  }
  return {update,reset};
}
