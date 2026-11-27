/**
 * Webcam arm evidence -> SIRVIBE's small 2D rig. Only measured joints are
 * converted; there is no 3D reconstruction, model inference or camera image
 * persistence. Artist-facing target coordinates are relative to the shoulder.
 */
import type { Landmark } from './performanceCapture.ts';
import type { Point } from './animation.ts';

export type ArmSide='left'|'right';
export type ArmTargets={left?:Point;right?:Point};
export type ArmBends={left?:number;right?:number};
export type ArmDepths={left?:number;right?:number};
export type ArmEvidence={elbow:Point;confidence:number;extension:number};
export type ArmEvidenceMap=Partial<Record<ArmSide,ArmEvidence>>;
const finite=(v:number|undefined)=>v!==undefined&&Number.isFinite(v);
const visible=(point?:Landmark):point is Landmark=>Boolean(point&&finite(point.x)&&finite(point.y)&&
  (point.visibility??1)>=.55);
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Image normalized X and Y must not be treated as equally scaled axes:
 * on 4:3 webcam frames, normalized Y spans fewer horizontal pixel units. */
export function observedArmGuidance(
  pose:readonly Landmark[],world?:readonly Landmark[],aspect=4/3
):{targets:ArmTargets;bends:ArmBends;depths:ArmDepths;evidence:ArmEvidenceMap}{
  const targets:ArmTargets={},bends:ArmBends={},depths:ArmDepths={},evidence:ArmEvidenceMap={};
  const shoulderSpan=visible(pose[11])&&visible(pose[12])
    ?Math.hypot(pose[11].x-pose[12].x,(pose[11].y-pose[12].y)/Math.max(.75,aspect)):undefined;
  if(!shoulderSpan||shoulderSpan<.065)return {targets,bends,depths,evidence};
  // Compensate for the shoulder line foreshortening as the performer turns.
  // The inferred metric orientation is evidence, not a new limb measurement.
  const wl=world?.[11],wr=world?.[12];
  const metricWidth=visible(wl)&&visible(wr)&&finite(wl.z)&&finite(wr.z)?Math.hypot(wl.x-wr.x,wl.z!-wr.z!):0;
  const frontal=metricWidth>.11&&metricWidth<.9?clamp(Math.abs(wl!.x-wr!.x)/metricWidth,.6,1):1;
  const scale=48*frontal/shoulderSpan;
  const torsoX=(pose[11].x+pose[12].x)/2;
  for(const side of ['left','right'] as const){
    const s=side==='left'?11:12,e=side==='left'?13:14,w=side==='left'?15:16;
    if(!visible(pose[s])||!visible(pose[w]))continue;
    const shoulder=pose[s],elbow=pose[e],wrist=pose[w];
    const raw={x:-(wrist.x-shoulder.x)*scale,
      y:(wrist.y-shoulder.y)*scale/Math.max(.75,aspect)};
    const reach=Math.hypot(raw.x,raw.y);
    // The rig has two 28-unit bones. A measured wrist near the shoulder
    // remains intentionally bent but cannot collapse the elbow into a knot.
    const length=clamp(reach,12,55);
    targets[side]={x:raw.x/Math.max(.001,reach)*length,
      y:raw.y/Math.max(.001,reach)*length};
    // The wrist target is still valid if only the elbow is occluded.
    // Preserve the previous bend pole in the stabilizer until it is seen.
    if(visible(elbow)){
      const elbowLocal={x:-(elbow.x-shoulder.x)*scale,
        y:(elbow.y-shoulder.y)*scale/Math.max(.75,aspect)};
      const upper=Math.hypot(elbowLocal.x,elbowLocal.y),lower=distance(raw,elbowLocal);
      if(upper>3&&lower>3&&reach>1){
        // Normalize by THIS arm's observed segment lengths, not shoulder width.
        // A projected straight human arm must remain straight on a cartoon
        // even when its proportions, camera distance or yaw differ.
        const extension=clamp(reach/(upper+lower),.32,1);
        const ratio=clamp(upper/lower,.45,2.2);
        const confidence=Math.min(shoulder.visibility??1,elbow.visibility??1,wrist.visibility??1)*(ratio===upper/lower?1:.35);
        const corrected=extension>=.975?55.99:clamp(56*extension,18,55.99);
        const f=corrected/reach;
        if(confidence>=.65)targets[side]={x:raw.x*f,y:raw.y*f};
        const observed={x:elbowLocal.x*56/(upper+lower),y:elbowLocal.y*56/(upper+lower)};
        evidence[side]={elbow:observed,confidence:clamp(confidence,0,1),extension};
        const cross=raw.x*elbowLocal.y-raw.y*elbowLocal.x;
        if(Math.abs(cross)>28&&confidence>=.65&&extension<.975)bends[side]=cross>0?1:-1;
      }
    }
    if(!evidence[side])evidence[side]={elbow:{x:0,y:0},confidence:0,extension:clamp(reach/56,.32,1)};
    const metricShoulder=world?.[s],metricWrist=world?.[w];
    const metricDepth=visible(metricShoulder)&&visible(metricWrist)&&
      finite(metricShoulder.z)&&finite(metricWrist.z)
      ?(metricShoulder.z!-metricWrist.z!)*1.8:undefined;
    const screenDepth=finite(shoulder.z)&&finite(wrist.z)
      ?(shoulder.z!-wrist.z!)*1.4:undefined;
    const visibleHeight=(shoulder.y-wrist.y)*.4;
    const crossed=side==='left'?wrist.x<torsoX:wrist.x>torsoX;
    const lateral=crossed?.08:0;
    depths[side]=clamp((metricDepth??screenDepth??0)+visibleHeight+lateral,-1,1);
  }
  return {targets,bends,depths,evidence};
}
/** Solve the actual shoulder-to-wrist reach using two fixed 28-unit arm
 * bones. Pole preference is continuous through noisy near-straight angles,
 * and the output cannot hyperextend or collapse onto the shoulder. */
export function solveCapturedArm(
  shoulder:Point,relativeTarget:Point,armScale:number,
  pole:number,previousElbow?:Point
):{elbow:Point;hand:Point;reach:number}{
  const bone=Math.max(8,28*armScale);
  const dx=relativeTarget.x*armScale,dy=relativeTarget.y*armScale;
  const rawLength=Math.hypot(dx,dy);
  const reach=clamp(rawLength,Math.max(5,bone*.32),2*bone-.01);
  const a=Math.atan2(dy,dx);
  const hand={x:shoulder.x+Math.cos(a)*reach,
    y:shoulder.y+Math.sin(a)*reach};
  const bendAngle=Math.acos(clamp(reach/(2*bone),-1,1));
  const make=(side:number):Point=>({
    x:shoulder.x+Math.cos(a+side*bendAngle)*bone,
    y:shoulder.y+Math.sin(a+side*bendAngle)*bone
  });
  let preference=pole<0?-1:1;
  // If a measured elbow exists, resolve ambiguous bend sides by which
  // candidate is *closest*; never randomly invert the elbow near extension.
  if(previousElbow&&Math.abs(pole)<.1){
    const positive=make(1),negative=make(-1);
    preference=distance(negative,previousElbow)<distance(positive,previousElbow)?-1:1;
  }
  return {elbow:make(preference),hand,reach};
}
/** Preserve a readable anatomical elbow under crossed-body targets.
 *
 * Two mathematically valid IK elbows exist for a given shoulder/wrist.
 * Most sideways flips in camera acting came from choosing the anatomically
 * inverted solution when MediaPipe's elbow became occluded. Prefer the
 * silhouette outside the torso, and only use the observed pole to resolve
 * poses in which both solutions are anatomically credible. The wrist remains
 * reachable and both bones retain their original lengths. */
export function solveAnatomicalArm(
  shoulder:Point,relativeTarget:Point,scale:number,side:ArmSide,
  observedPole?:number,restElbow?:Point
):{elbow:Point;hand:Point;reach:number}{
  const sign=side==='left'?-1:1;
  const safeTarget={
    x:clamp(relativeTarget.x,-55,55),
    y:clamp(relativeTarget.y,-55,55)
  };
  const left=solveCapturedArm(shoulder,safeTarget,scale,-1);
  const right=solveCapturedArm(shoulder,safeTarget,scale,1);
  const sidePenalty=(elbow:Point)=>{
    // A wrist may cross the chest; its elbow normally remains near or
    // outside its shoulder. Allow 8 px inward for natural near-face acting.
    const inward=Math.max(0,8-sign*(elbow.x-shoulder.x));
    return inward*inward*.20;
  };
  const score=(value:typeof left,pole:number)=>{
    let cost=sidePenalty(value.elbow);
    if(observedPole!==undefined&&observedPole!==pole)cost+=20;
    if(restElbow)cost+=Math.hypot(value.elbow.x-restElbow.x,
      value.elbow.y-restElbow.y)*.13;
    return cost;
  };
  return score(left,-1)<=score(right,1)?left:right;
}

/** Strict dialogue-mode envelope. In screen coordinates positive Y is down.
 * Never draw an upper arm above horizontal, or fold it deep into the chest.
 * If the measured wrist is unreachable inside this envelope, move the wrist
 * to the nearest feasible pose instead of violating the elbow constraint.
 * This is pure and identical during live preview, timeline and export. */
export function solveStrictCapturedArm(shoulder:Point,target:Point,scale:number,side:ArmSide,pole?:number){
  const bone=Math.max(8,28*scale),sign=side==='left'?-1:1;
  const minInward=-bone*.22, maxFlex=142*Math.PI/180;
  const legal=(elbow:Point)=>elbow.y>=shoulder.y-1e-7&&sign*(elbow.x-shoulder.x)>=minInward-1e-7;
  const requested={x:shoulder.x+target.x*scale,y:shoulder.y+target.y*scale};
  const desiredReach=clamp(distance(requested,shoulder),bone*2*Math.cos(maxFlex/2),bone*2-.01);
  const preferred=pole===-1?-1:pole===1?1:sign;
  const exact=solveCapturedArm(shoulder,target,scale,preferred);
  const alternate=solveCapturedArm(shoulder,target,scale,-preferred);
  const valid=(s:typeof exact)=>legal(s.elbow)&&s.reach>=bone*2*Math.cos(maxFlex/2)-1e-7;
  if(valid(exact))return {...exact,pole:preferred,restricted:false};
  if(valid(alternate))return {...alternate,pole:-preferred,restricted:true};
  // Both branches violate the hard envelope. Search the short allowed
  // shoulder arc and solve the nearest permitted forearm angle analytically.
  const angleMin=side==='left'?Math.acos(.22):0;
  const angleMax=side==='right'?Math.acos(-.22):Math.PI;
  // A measured straight arm remains straight even when its original
  // screen direction violates the low-elbow envelope. Rotate the entire
  // reach to the closest legal shoulder direction instead of inventing flexion.
  if(desiredReach>=bone*2-.1){
    const bend=Math.acos(clamp(desiredReach/(2*bone),-1,1));
    const direction=Math.atan2(requested.y-shoulder.y,requested.x-shoulder.x);
    let nearest:ReturnType<typeof solveCapturedArm>&{pole:number;restricted:boolean}|undefined;
    let error=Infinity;
    for(const candidate of [preferred,-preferred]){
      const desiredAngle=direction+candidate*bend;
      for(const turn of [-2*Math.PI,0,2*Math.PI]){
        const upper=clamp(desiredAngle+turn,angleMin,angleMax);
        const a=upper-candidate*bend;
        const solution=solveCapturedArm(shoulder,{x:Math.cos(a)*desiredReach/scale,y:Math.sin(a)*desiredReach/scale},scale,candidate);
        if(!legal(solution.elbow))continue;
        const cost=distance(solution.hand,requested);
        if(cost<error){nearest={...solution,pole:candidate,restricted:true};error=cost;}
      }
    }
    if(nearest)return nearest;
  }
  let best:{elbow:Point;hand:Point;reach:number;pole:number;restricted:boolean}|undefined;
  let bestCost=Infinity;
  const angleWrap=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
  const consider=(a:number)=>{
    const elbow={x:shoulder.x+Math.cos(a)*bone,y:shoulder.y+Math.sin(a)*bone};
    const desired=Math.atan2(requested.y-elbow.y,requested.x-elbow.x);
    const flex=clamp(angleWrap(desired-a),-maxFlex,maxFlex);
    const forearm=a+flex;
    const hand={x:elbow.x+Math.cos(forearm)*bone,y:elbow.y+Math.sin(forearm)*bone};
    const reach=distance(shoulder,hand);
    const actualPole=flex<0?1:-1;
    const cost=distance(requested,hand)**2+1.4*(reach-desiredReach)**2+(actualPole!==preferred?bone*.2:0);
    if(cost<bestCost){bestCost=cost;best={elbow,hand,reach,pole:actualPole,restricted:true};}
  };
  for(let i=0;i<=32;i++)consider(angleMin+(angleMax-angleMin)*i/32);
  // Refine the minimum between samples to avoid stepwise shoulder movement.
  const a=Math.atan2(best!.elbow.y-shoulder.y,best!.elbow.x-shoulder.x);
  const step=(angleMax-angleMin)/32;
  for(let i=-8;i<=8;i++)consider(clamp(a+step*i/8,angleMin,angleMax));
  return best!;
}

/** Pure scoring in canonical 28+28 rig units. A stable pole is selected at
 * capture time and stored in the key; renderer playback has no history. */
export function scoreArmPoles(target:Point,side:ArmSide,evidence?:ArmEvidence,previous?:number,previousElbow?:Point){
  const origin={x:0,y:0},sign=side==='left'?-1:1;
  const quality=evidence?.confidence??0;
  const extension=evidence?.extension??Math.hypot(target.x,target.y)/56;
  const straight=Math.hypot(target.x,target.y)>=55.9;
  const cost=(pole:number)=>{
    const solved=solveCapturedArm(origin,target,1,pole),elbow=solved.elbow;
    const reliable=quality>=.78&&!!evidence;
    const inward=Math.max(0,-sign*elbow.x-(sign*target.x<0?12:5));
    const high=Math.max(0,-elbow.y-(reliable&&evidence.elbow.y< -4?Math.abs(evidence.elbow.y)+5:Math.max(5,-target.y*.55)));
    const observed=reliable&&!straight?distance(elbow,evidence.elbow):0;
    return inward*inward*(reliable?.12:.55)+high*high*(reliable?.22:.85)+observed*observed*quality*.75+
      (previousElbow?distance(elbow,previousElbow)*.65:0)+(previous!==undefined&&pole!==previous?22:0);
  };
  const negative=cost(-1),positive=cost(1);
  return {negative,positive,pole:negative<=positive?-1:1,straight,quality,extension};
}
export function createObedientArm(side:ArmSide){
  let pole:number|undefined,candidate:number|undefined,count=0,previousElbow:Point|undefined,lastExtension:number|undefined;
  let pendingExtension:number|undefined;
  let diagnostics:ReturnType<typeof scoreArmPoles>&{blocked:boolean;chosen:number}|undefined;
  return {
    update(target:Point,evidence?:ArmEvidence){
      const measured=evidence&&evidence.confidence>=.65?evidence.extension:undefined;
      if(measured!==undefined){
        if(lastExtension===undefined){lastExtension=measured;}
        else if(Math.abs(measured-lastExtension)>.025){
          // A single spurious elbow observation cannot make a held arm fold.
          const coherent=pendingExtension!==undefined&&(pendingExtension-lastExtension)*(measured-lastExtension)>0;
          if(coherent){lastExtension=Math.abs(measured-lastExtension)>.12?measured:lastExtension+(measured-lastExtension)*.65;pendingExtension=undefined;}
          else pendingExtension=measured;
        }else pendingExtension=undefined;
      }
      const length=Math.hypot(target.x,target.y);
      // For an initially occluded elbow, default to a conservative modest
      // bend rather than guessing a tightly folded arm. Hold that estimate
      // until trustworthy geometry becomes available.
      if(lastExtension===undefined)lastExtension=clamp(Math.max(.84,length/56),.32,1);
      const extension=lastExtension;
      // Missing elbow must not invent a deeper flexion; maintain previous reach.
      const desired=extension>=.975?55.99:clamp(extension*56,18,55.99);
      const adjusted=length>.001?{x:target.x*desired/length,y:target.y*desired/length}:{x:0,y:desired};
      const score=scoreArmPoles(adjusted,side,evidence,pole,previousElbow);
      let blocked=false;
      if(pole===undefined)pole=score.pole;
      else if(score.pole!==pole&&!score.straight){
        const advantage=Math.abs(score.negative-score.positive);
        if(score.quality>=.78&&advantage>30){
          count=candidate===score.pole?count+1:1;candidate=score.pole;
          if(count>=3){pole=score.pole;count=0;candidate=undefined;}else blocked=true;
        }else{candidate=undefined;count=0;blocked=true;}
      }else{candidate=undefined;count=0;}
      const safe=solveStrictCapturedArm({x:0,y:0},adjusted,1,side,pole);
      previousElbow=safe.elbow;
      pole=safe.pole;
      diagnostics={...score,blocked:blocked||safe.restricted,chosen:pole};
      return {target:safe.hand,pole,extension:clamp(safe.reach/56,0,1)};
    },
    debug:()=>diagnostics,
    reset(){pole=candidate=undefined;count=0;previousElbow=undefined;lastExtension=undefined;pendingExtension=undefined;diagnostics=undefined;}
  };
}
/** Polar interpolation avoids shrinking a straight arm when its direction
 * changes. The reach channel controls actual elbow flexion. */
export function interpolateArmTarget(a:Point,b:Point,t:number):Point{
  const ar=Math.atan2(a.y,a.x),br=Math.atan2(b.y,b.x);
  const delta=Math.atan2(Math.sin(br-ar),Math.cos(br-ar));
  const angle=ar+delta*t,r=Math.hypot(a.x,a.y)*(1-t)+Math.hypot(b.x,b.y)*t;
  return {x:Math.cos(angle)*r,y:Math.sin(angle)*r};
}

/** This score is strictly a 2D occlusion suggestion, not ground-truth depth.
 * If score difference is ambiguous, preserve the previous drawing order. */
export function decideFrontArm(
  depths:ArmDepths,previous:ArmSide|undefined,
  base:ArmSide='right',margin=.16
):ArmSide{
  const a=depths.left,b=depths.right;
  if(a===undefined&&b===undefined)return previous??base;
  if(a===undefined)return 'right';
  if(b===undefined)return 'left';
  if(Math.abs(a-b)<=margin)return previous??base;
  return a>b?'left':'right';
}
/** Stable two-hand contact is a first-class relationship. Only the caller
 * may activate it after both wrists have been observed. */
export function contactHysteresis(
  previous:string|undefined,observed:string|undefined,
  candidate:string|undefined,consecutive:number
):{contact:string|undefined;candidate:string|undefined;count:number}{
  if(observed===previous)return {contact:previous,candidate:undefined,count:0};
  if(!observed)return {contact:undefined,candidate:undefined,count:0};
  const count=observed===candidate?consecutive+1:1;
  return {contact:count>=2?observed:previous,candidate:count>=2?undefined:observed,
    count:count>=2?0:count};
}

/** A captured arm must stay one connected piece in the same Pixi Graphics
 * layer. Segment-splitting between bodyArt and gestureArt made the elbow
 * disappear behind the shirt while its forearm remained in front. */
export function connectedCapturedArmOrder(
  observed:{left:boolean;right:boolean},near:ArmSide
):ArmSide[]{
  const sides=(['left','right'] as const).filter(side=>observed[side]);
  return sides.sort((a,b)=>a===near?1:b===near?-1:0);
}
export type ArmPaintPass={side:ArmSide;part:'upper'|'lower'|'hand'};
/** A renderer-independent painter order that keeps nearer forearms and hands
 * together. Upper arms tuck behind the shirt; far lower arm then hand are
 * painted before the near lower arm then hand. */
export function observedArmPaintOrder(
  observed:{left:boolean;right:boolean},nearest:ArmSide
):ArmPaintPass[]{
  const available=(['left','right'] as const).filter(side=>observed[side]);
  const ordered=available.sort((a,b)=>a===nearest?1:b===nearest?-1:0);
  return [
    ...ordered.map(side=>({side,part:'upper' as const})),
    ...ordered.flatMap(side=>[
      {side,part:'lower' as const},{side,part:'hand' as const}
    ])
  ];
}
