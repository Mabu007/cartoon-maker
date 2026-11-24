/**
 * SIRVIBE Performance Compiler.
 * Deterministic, offline-capable retargeting from normalized landmark observations
 * to sparse, editable poses. No personal video is persisted by this module.
 */
import type { TrackingSelection } from './trackingSelection.ts';
import { reconstructHumanFrame, observedBodyYaw } from './humanReconstruction.ts';
import { clamp, ease, mix } from './animation.ts';
import { fuseWorldAngle, mixDegrees, worldBodyProjector, wrapDegrees } from './worldRetarget.ts';
import { observedArmGuidance, interpolateArmTarget, type ArmEvidenceMap, type ArmTargets, type ArmBends, type ArmDepths, type ArmSide } from './performanceArmIntelligence.ts';
import type { Character, Expression, JointPose } from './schema.ts';
import type { HandPose } from './handRig.ts';
import { measuredFingerCurls, observedHandPose, detectedHandContact,
  type FingerCurls, type CapturedContact } from './performanceHandIntelligence.ts';
import { blendFacialControls, facialFromBlendshapes, capturedEyeFocus, type FacialControls } from './facialIntelligence.ts';
import { constrainCapturedHead,estimateHeadYaw,headFacingForYaw } from './performanceHeadEye.ts';

export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export type CaptureFrame = {
  t: number; aspect?:number; pose: Landmark[]; world?: Landmark[]; leftHand?: Landmark[]; rightHand?: Landmark[];
  face?: Record<string, number>;
  /** Independent pupil gaze from Face Landmarker iris points when available. */
  eyeFocus?:{x:number;y:number};
  /** Face mesh yaw cue when available; otherwise the pose nose is used. */
  headYaw?:number;
  /** Face model enabled: never treat nose motion as actual pupil detection. */
  faceTracking?:boolean;
  /** Elapsed milliseconds since each tracked hand was last truly detected. */
  handAgeMs?:{left?:number;right?:number};
};
export type CaptureOptions = { exaggeration?: number; smoothing?: number; maxKeys?: number };
export type PerformanceKey = {
  time: number; pose: JointPose; lift?: number;
  tracking?:TrackingSelection;
  /** 0 for a genuine tracking gap; optional for backward-compatible clips. */
  presence?: number;
  hands?: { left: HandPose; right: HandPose }; expression?: Expression;
  fingerCurls?:{left?:FingerCurls;right?:FingerCurls};
  contact?:CapturedContact;
  /** Optional shoulder-local wrist anchors, depth scores and stable bend pole. */
  armTargets?:ArmTargets;
  /** Transient elbow evidence used only by the capture solver. */
  armEvidence?:ArmEvidenceMap;
  /** Measured extension ratio and stable pole are saved for deterministic replay. */
  armExtension?:ArmBends;
  armBend?:ArmBends;
  armDepth?:ArmDepths;
  nearArm?:ArmSide;
  handConfidence?:{left?:number;right?:number};
  /** Screen-space eye direction, normalized and independent of the authored gaze track. */
  focus?: { x:number; y:number };
  bodyYaw?:number;
  bodyFacing?:'front'|'left'|'right';
  headYaw?:number;
  headFacing?:'front'|'left'|'right';
  armConfidence?:{left?:number;right?:number};
  /** Reduced and editable face blendshapes; never raw webcam imagery. */
  facial?: FacialControls;
};
export type PerformanceIntent = 'rest' | 'point' | 'open-hands' | 'emphasis' | 'guard' | 'strike';
export type MotionDNA = {
  energy: number; gestureAmplitude: number; movementSmoothness: number;
  dominantHand: 'left' | 'right'; observations: number;
};
const tracked = ['hips','torso','neck','head','leftShoulder','leftElbow','leftWrist','rightShoulder','rightElbow','rightWrist',
  'leftHip','leftKnee','rightHip','rightKnee'] as const;
const confidence = (p?: Landmark) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= .55;
const midpoint = (a: Landmark, b: Landmark): Landmark => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const angle = (a: Landmark,b:Landmark) => Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI;
function degrees(value:number) {
  return ((value+180)%360+360)%360-180;
}
function facialExpression(face?: Record<string, number>): Expression | undefined {
  if(!face)return undefined;
  const strength=(...names:string[])=>Math.max(0,...names.map(name=>face[name]??0));
  const smile=strength('mouthSmileLeft','mouthSmileRight');
  const frown=strength('browDownLeft','browDownRight');
  if(strength('eyeWideLeft','eyeWideRight')>.55&&strength('jawOpen')>.28)return 'surprised';
  if(smile>.55)return 'happy';
  if(frown>.64&&smile<.3)return 'angry';
  if(strength('mouthFrownLeft','mouthFrownRight')>.48)return 'sad';
  return undefined;
}
export function retargetCaptureFrame(frame: CaptureFrame): PerformanceKey | undefined {
  frame=reconstructHumanFrame(frame);
  const p=frame.pose;
  const leftCurls=measuredFingerCurls(frame.leftHand),rightCurls=measuredFingerCurls(frame.rightHand);
  const left=leftCurls?observedHandPose(leftCurls):undefined;
  const right=rightCurls?observedHandPose(rightCurls):undefined;
  const contact=detectedHandContact(p,(frame.handAgeMs?.left??0)<=160?frame.leftHand:undefined,(frame.handAgeMs?.right??0)<=160?frame.rightHand:undefined,(frame.handAgeMs?.left??0)<=160?leftCurls:undefined,(frame.handAgeMs?.right??0)<=160?rightCurls:undefined);
  const arms=observedArmGuidance(p,frame.world,frame.aspect);
  // A webcam can show just a face, one arm, or the full body. Do not reject
  // legitimate facial movement because the performer's hips or shoulders
  // were cropped. Never invent joints the camera cannot see.
  const shouldersVisible=confidence(p[11])&&confidence(p[12]);
  const visibleArms=shouldersVisible&&[13,14,15,16].some(i=>confidence(p[i]));
  const visibleEyes=confidence(p[2])&&confidence(p[5]);
  const visibleFace=visibleEyes||Boolean(frame.face)||!!frame.eyeFocus||frame.headYaw!==undefined;
  const visibleLegs=(confidence(p[23])&&confidence(p[25]))||
    (confidence(p[24])&&confidence(p[26]));
  if(!visibleArms&&!visibleFace&&!visibleLegs&&!shouldersVisible&&!confidence(p[23])&&!left&&!right)return undefined;
  const world=worldBodyProjector(frame.world);
  // MediaPipe labels the *performer's* left/right. Front-facing cartoon rigs
  // display that performer like a mirror, so horizontal arm angles must also
  // be mirrored. Previously an upward left arm was mapped toward the torso.
  const angleOf=(from:number,to:number) => {
    const image=degrees(-angle(p[from],p[to]));
    return world?fuseWorldAngle(image,world.angle(from,to),world.frontness):image;
  };
  const hipsVisible=shouldersVisible&&confidence(p[23])&&confidence(p[24]);
  const shoulders=shouldersVisible?midpoint(p[11],p[12]):undefined;
  const screenTorso=hipsVisible
    ?-degrees(180-angle(midpoint(p[23],p[24]),shoulders!))
    :0;
  const worldTorso=hipsVisible && world && world.angle(23,11)!==undefined && world.angle(24,12)!==undefined
    ? degrees(180-mixDegrees(world.angle(23,11)!,world.angle(24,12)!,.5))
    : undefined;
  const torso=clamp(worldTorso===undefined?screenTorso:
    fuseWorldAngle(screenTorso,worldTorso,world!.frontness),-28,28);
  const shoulderRoll=shouldersVisible?clamp(Math.atan2(p[11].y-p[12].y,Math.max(.03,Math.abs(p[11].x-p[12].x)))*180/Math.PI,-14,14):0;
  const pose:JointPose=shouldersVisible?{torso:hipsVisible?torso:shoulderRoll}:{};
  if(confidence(p[23])&&confidence(p[24])){
    pose.hips=clamp(-Math.atan2(p[23].y-p[24].y,Math.max(.03,Math.abs(p[23].x-p[24].x)))*180/Math.PI,-18,18);
  }
  for(const side of ['left','right'] as const) {
    const i=side==='left'?11:12, e=side==='left'?13:14, w=side==='left'?15:16;
    if(!confidence(p[i])||!confidence(p[e]))continue;
    const upper=angleOf(i,e);
    pose[`${side}Shoulder`]=clamp(degrees(upper-(side==='left'?-13:13)-(pose.torso??0)),-165,165);
    if(confidence(p[w])){
      pose[`${side}Elbow`]=clamp(degrees(angleOf(e,w)-upper),-160,160);
      const hand=side==='left'?frame.leftHand:frame.rightHand;
      const fresh=(frame.handAgeMs?.[side]??0)<=120;
      const palm=hand&&fresh&&hand.length>9?angle(hand[0],hand[9]):angle(p[e],p[w]);
      pose[`${side}Wrist`]=clamp(degrees(palm-angle(p[e],p[w])),-65,65);
    }
  }
  // Two eye landmarks measure the face's actual tilt; the nose alone cannot
  // distinguish a head turn from a shoulder sway. This runs within Pose's
  // existing 33 landmarks and adds zero neural-network inference cost.
  let focus:PerformanceKey['focus'];
  if(visibleEyes){
    const leftEye=p[2],rightEye=p[5],eyeWidth=Math.max(.025,Math.abs(leftEye.x-rightEye.x));
    const eyeMid=midpoint(leftEye,rightEye);
    const eyeRoll=-Math.atan2(leftEye.y-rightEye.y,eyeWidth)*180/Math.PI;
    const nose=confidence(p[0])?p[0]:eyeMid;
    // Looking left/right should turn the illustrated head, not fold the
    // neck sideways. Reserve only a tiny accompanying neck roll; actual
    // head tilt comes from the line between the eyes.
    pose.neck=0;
    pose.head=clamp(eyeRoll*.95-(pose.torso??0)-(pose.hips??0),-22,22);
    focus={
      x:clamp(-(nose.x-eyeMid.x)/eyeWidth*1.75,-.85,.85),
      y:clamp((nose.y-eyeMid.y)/eyeWidth*-.4,-.6,.6)
    };
  }else if(shoulders&&confidence(p[0])){
    // Eye occlusion: use modest head sway only, never a giant false rotation.
    const horizontal=(p[0].x-shoulders.x)/Math.max(.1,Math.abs(p[11].x-p[12].x));
    pose.head=clamp(-horizontal*13-torso*.25,-18,18);
  }
  // Optional eye blendshapes distinguish an eye roll/glance from a head
  // turn. Pose-only capture still works when detailed face tracking is off.
  const gaze=capturedEyeFocus(frame.face);
  if(frame.eyeFocus)focus={x:clamp(frame.eyeFocus.x,-1,1),y:clamp(frame.eyeFocus.y,-1,1)};
  else if(gaze)focus={x:gaze.x,y:gaze.y};
  else if(frame.faceTracking)focus=undefined;
  // Legs are included only when observed; never fabricate missing knees/feet.
  for(const side of ['left','right'] as const){
    const a=side==='left'?23:24,b=side==='left'?25:26,c=side==='left'?27:28;
    if(confidence(p[a])&&confidence(p[b])){
      const thigh=angleOf(a,b);
      pose[`${side}Hip`]=clamp(degrees(thigh-(side==='left'?-5:5)),-100,100);
      if(confidence(p[c]))pose[`${side}Knee`]=clamp(degrees(angleOf(b,c)-thigh),-135,135);
    }
  }
  const emotion=facialExpression(frame.face);
  const yaw=frame.headYaw??(visibleEyes
    ?estimateHeadYaw(confidence(p[0])?p[0]:undefined,p[2],p[5])
    :undefined);
  const bodyYaw=observedBodyYaw(frame.world);
  return {time:frame.t,pose:constrainCapturedHead(pose),...(bodyYaw!==undefined?{bodyYaw}:{}),...(focus?{focus}:{}),
    ...(yaw!==undefined?{headYaw:yaw,headFacing:headFacingForYaw(yaw)}:{}),
    ...(arms.targets.left||arms.targets.right?{armTargets:arms.targets}:{}),
    ...(arms.evidence.left||arms.evidence.right?{armEvidence:arms.evidence}:{}),
    ...(arms.bends.left!==undefined||arms.bends.right!==undefined?{armBend:arms.bends}:{}),
    ...(arms.depths.left!==undefined||arms.depths.right!==undefined?{armDepth:arms.depths}:{}),
    ...(left||right?{hands:{left:left??'relaxed',right:right??'relaxed'}}:{}),
    ...(leftCurls||rightCurls?{fingerCurls:{...(leftCurls?{left:leftCurls}:{}),
      ...(rightCurls?{right:rightCurls}:{})}}:{}),
    ...((leftCurls||rightCurls)?{handConfidence:{
      ...(leftCurls?{left:clamp(1-(frame.handAgeMs?.left??0)/800,0,1)}:{}),
      ...(rightCurls?{right:clamp(1-(frame.handAgeMs?.right??0)/300,0,1)}:{})
    }}:{}),
    ...(contact?{contact}:{}),
    ...(emotion?{expression:emotion}:{}),
    ...(frame.face?{facial:facialFromBlendshapes(frame.face)}:{})};
}
function interpolate(a:PerformanceKey,b:PerformanceKey,at:number):PerformanceKey {
  const fraction=clamp((at-a.time)/Math.max(.000001,b.time-a.time));
  const aPresent=a.presence??1,bPresent=b.presence??1;
  // Never synthesize a motion trajectory across a webcam dropout.
  // Hold and briefly release the last seen pose. Reacquisition starts from
  // the new observation; its first 100ms blend in from the underlying rig.
  if(aPresent===0||bPresent===0) {
    if(aPresent===0&&bPresent===0)return {time:at,pose:{},presence:0};
    const fade=Math.min(.12,(b.time-a.time)*.5);
    if(aPresent===0){
      const weight=clamp((at-(b.time-fade))/Math.max(.000001,fade));
      return weight<=0?{time:at,pose:{},presence:0}:
        {...b,time:at,presence:ease(weight)};
    }
    const weight=1-clamp((at-a.time)/Math.max(.000001,fade));
    return weight<=0?{time:at,pose:{},presence:0}:
      {...a,time:at,presence:ease(weight)};
  }
  const pose:JointPose={};
  for(const joint of tracked) {
    const left=a.pose[joint],right=b.pose[joint];
    if(left===undefined&&right===undefined)continue;
    // Animator-style overlap: the shoulder initiates a gesture, the elbow
    // follows, and the wrist settles last. The lag is an intra-key interval,
    // not a delayed timestamp, so each authored pose is hit exactly.
    const lag=joint.endsWith('Wrist')?.035:
      joint.endsWith('Elbow')?.02:joint==='head'?.006:0;
    const phase=clamp((fraction-lag)/Math.max(.01,1-lag));
    // An unobserved joint must fade to neutral, not freeze at the last
    // observed wrist/arm position for the remainder of a performance.
    pose[joint]=mixDegrees(left??0,right??0,ease(phase));
  }
  const fingerCurls:PerformanceKey['fingerCurls']={};
  for(const side of ['left','right'] as const){
    const first=a.fingerCurls?.[side],second=b.fingerCurls?.[side];
    if(first&&second)fingerCurls[side]=first.map((v,i)=>
      Math.round(mix(v,second[i],fraction)*1000)/1000) as FingerCurls;
    else fingerCurls[side]=fraction<.5?first:second;
  }
  const armTargets:ArmTargets={},armDepth:ArmDepths={},armBend:ArmBends={},armExtension:ArmBends={};
  const handConfidence:PerformanceKey['handConfidence']={};
  const armConfidence:PerformanceKey['armConfidence']={};
  for(const side of ['left','right'] as const){
    const source=a.armTargets?.[side],destination=b.armTargets?.[side];
    if(source&&destination)armTargets[side]=a.armExtension?.[side]!==undefined&&b.armExtension?.[side]!==undefined?interpolateArmTarget(source,destination,fraction):{
      x:mix(source.x,destination.x,fraction),y:mix(source.y,destination.y,fraction)};
    else armTargets[side]=fraction<.5?source:destination;
    const first=a.armDepth?.[side],second=b.armDepth?.[side];
    armDepth[side]=first!==undefined&&second!==undefined
      ?mix(first,second,fraction):fraction<.5?first:second;
    armBend[side]=fraction<.5?a.armBend?.[side]:b.armBend?.[side];
    const e1=a.armExtension?.[side],e2=b.armExtension?.[side];
    armExtension[side]=e1!==undefined&&e2!==undefined?mix(e1,e2,fraction):fraction<.5?e1:e2;
    // A real pole switch must pass through extension rather than jump the
    // elbow through the arm. Interpolate the signed flexion continuously.
    const p1=a.armBend?.[side],p2=b.armBend?.[side];
    const point=armTargets[side];
    if(point&&e1!==undefined&&e2!==undefined&&p1&&p2&&p1!==p2){
      const signed=mix(p1*Math.acos(clamp(e1)),p2*Math.acos(clamp(e2)),fraction);
      const length=Math.hypot(point.x,point.y),reach=55.99*Math.cos(signed);
      if(length>.001)armTargets[side]={x:point.x*reach/length,y:point.y*reach/length};
      armExtension[side]=Math.cos(signed);armBend[side]=signed<0?-1:1;
    }
    const armFrom=a.armConfidence?.[side],armTo=b.armConfidence?.[side];
    armConfidence[side]=armFrom!==undefined&&armTo!==undefined
      ?mix(armFrom,armTo,fraction):fraction<.5?armFrom:armTo;
    const confidenceFrom=a.handConfidence?.[side],confidenceTo=b.handConfidence?.[side];
    handConfidence[side]=confidenceFrom!==undefined&&confidenceTo!==undefined
      ?mix(confidenceFrom,confidenceTo,fraction)
      :fraction<.5?confidenceFrom:confidenceTo;
  }
  return {time:at,pose,tracking:a.tracking??b.tracking,
    ...(armTargets.left||armTargets.right?{armTargets}:{}),
    ...(armDepth.left!==undefined||armDepth.right!==undefined?{armDepth}:{}),
    ...(armBend.left!==undefined||armBend.right!==undefined?{armBend}:{}),
    ...(armExtension.left!==undefined||armExtension.right!==undefined?{armExtension}:{}),
    ...(fraction<.5?a.nearArm?{nearArm:a.nearArm}:{}:b.nearArm?{nearArm:b.nearArm}:{}),
    ...(handConfidence.left!==undefined||handConfidence.right!==undefined?{handConfidence}:{}),
    ...(armConfidence.left!==undefined||armConfidence.right!==undefined?{armConfidence}:{}),
    ...((a.headYaw!==undefined||b.headYaw!==undefined)?{headYaw:mix(a.headYaw??0,b.headYaw??0,fraction)}:{}),
    ...((a.bodyYaw!==undefined||b.bodyYaw!==undefined)?{bodyYaw:mix(a.bodyYaw??b.bodyYaw??0,b.bodyYaw??a.bodyYaw??0,fraction)}:{}),
    ...((fraction<.5?a.bodyFacing:b.bodyFacing)?{bodyFacing:fraction<.5?a.bodyFacing:b.bodyFacing}:{}),
    ...(fraction<.5?a.headFacing?{headFacing:a.headFacing}:{}:
      b.headFacing?{headFacing:b.headFacing}:{}),
    ...(fingerCurls.left||fingerCurls.right?{fingerCurls}:{}),
    ...(fraction<.5?a.contact?{contact:a.contact}:{}:b.contact?{contact:b.contact}:{}),
    ...((a.presence!==undefined||b.presence!==undefined)?{presence:mix(aPresent,bPresent,fraction)}:{}),
    hands: fraction<.5 ? a.hands : b.hands,
    ...((a.focus||b.focus)?{focus:a.focus&&b.focus
      ?{x:mix(a.focus.x,b.focus.x,fraction),y:mix(a.focus.y,b.focus.y,fraction)}
      :a.focus??b.focus}:{}),
    expression: fraction<.5?a.expression:b.expression,
    ...((a.facial||b.facial)?{facial:a.facial&&b.facial
      ? blendFacialControls(a.facial,b.facial,ease(fraction))
      : fraction<.5?a.facial:b.facial}: {})};
}
export function samplePerformance(keys:readonly PerformanceKey[],normalized:number):PerformanceKey {
  if(!keys.length)return {time:normalized,pose:{}};
  const t=clamp(normalized);
  if(t<=keys[0].time)return keys[0];
  if(t>=keys[keys.length-1].time)return keys[keys.length-1];
  let lo=0,hi=keys.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(keys[mid].time<=t)lo=mid;else hi=mid;}
  return interpolate(keys[lo],keys[hi],t);
}
export type PerformanceHandTransition={
  from:{left:HandPose;right:HandPose};
  to:{left:HandPose;right:HandPose};
  progress:number;
};
/** Sample on-demand; never persist transition metadata in strict scene JSON. */
export function samplePerformanceHands(keys:readonly PerformanceKey[],normalized:number):PerformanceHandTransition|undefined {
  if(!keys.length)return undefined;
  const t=clamp(normalized);
  if(samplePerformance(keys,t).presence===0)return undefined;
  let lo=0,hi=keys.length-1;
  if(t<=keys[0].time)hi=0;
  else if(t>=keys[hi].time)lo=hi;
  else while(hi-lo>1){
    const mid=(lo+hi)>>1;
    if(keys[mid].time<=t)lo=mid;else hi=mid;
  }
  const from=keys[lo].hands;
  const to=keys[hi].hands;
  // Finger poses only exist while explicitly observed. Never propagate a
  // later hand detection backward through frames where it was not visible.
  if(!from&&!to)return undefined;
  if(!from||!to){
    const selected=t<=(keys[lo].time+keys[hi].time)/2?from:to;
    return selected?{from:selected,to:selected,progress:1}:undefined;
  }
  return {from,to,progress:lo===hi?1:ease(clamp((t-keys[lo].time)/Math.max(1e-6,keys[hi].time-keys[lo].time)))};
}

const round=(v:number)=>Math.round(v*10)/10;
/** Error-bounded key reduction. Keep meaningful talk beats, hand shapes and
 * expressions while collapsing long periods of stillness into two keys.
 * Measurement uses the SAME interpolator as the rendered animation. */
export function reducePerformanceKeys(keys:readonly PerformanceKey[],tolerance=1.7):PerformanceKey[] {
  if(keys.length<3)return [...keys];
  const kept=new Set<number>([0,keys.length-1]);
  const pending:[[number,number],...[number,number][]]=[[0,keys.length-1]];
  const watched=tracked;
  while(pending.length){
    const [from,to]=pending.pop()!;
    if(to-from<2)continue;
    const first=keys[from],last=keys[to];
    let candidate=-1,largest=tolerance;
    for(let index=from+1;index<to;index++){
      const observed=keys[index];
      const estimated=samplePerformance([first,last],observed.time);
      let error=0;
      for(const joint of watched){
        const value=observed.pose[joint];
        // Visibility changes are meaningful acting beats: keeping the
        // surrounding keys while deleting the dropout would invent an arm
        // moving through a period when the camera never saw it.
        if(value===undefined){
          if(estimated.pose[joint]!==undefined)error=Math.max(error,8);
          continue;
        }
        if(estimated.pose[joint]===undefined)error=Math.max(error,8);
        const delta=Math.abs(wrapDegrees(value-(estimated.pose[joint]??value)));
        const emphasis=joint==='head'||joint==='torso'?1.5:
          joint.endsWith('Wrist')?.7:1;
        error=Math.max(error,delta*emphasis);
      }
      if(observed.nearArm!==estimated.nearArm)error=Math.max(error,40);
      if(observed.bodyFacing!==estimated.bodyFacing)error=Math.max(error,35);
      if(observed.bodyYaw!==undefined&&estimated.bodyYaw!==undefined)error=Math.max(error,Math.abs(observed.bodyYaw-estimated.bodyYaw)*35);
      if(observed.headFacing!==estimated.headFacing)error=Math.max(error,28);
      if(observed.headYaw!==undefined&&estimated.headYaw!==undefined)
        error=Math.max(error,Math.abs(observed.headYaw-estimated.headYaw)*35);
      for(const side of ['left','right'] as const){
        if(observed.hands?.[side]!==estimated.hands?.[side])error=Math.max(error,20);
        const arm=observed.armTargets?.[side],estimate=estimated.armTargets?.[side];
        if(Boolean(arm)!==Boolean(estimate))error=Math.max(error,30);
        else if(arm&&estimate)error=Math.max(error,Math.hypot(arm.x-estimate.x,arm.y-estimate.y)*1.5);
        const ext=observed.armExtension?.[side],pred=estimated.armExtension?.[side];
        if(ext!==undefined&&pred!==undefined)error=Math.max(error,Math.abs(ext-pred)*65);
        if(observed.armBend?.[side]!==estimated.armBend?.[side])
          error=Math.max(error,20);
        const armWeight=observed.armConfidence?.[side],estimateWeight=estimated.armConfidence?.[side];
        if(Boolean(armWeight!==undefined)!==Boolean(estimateWeight!==undefined))
          error=Math.max(error,25);
        else if(armWeight!==undefined&&estimateWeight!==undefined)
          error=Math.max(error,Math.abs(armWeight-estimateWeight)*35);
        const actualDepth=observed.armDepth?.[side],estimatedDepth=estimated.armDepth?.[side];
        if(actualDepth!==undefined&&estimatedDepth!==undefined)
          error=Math.max(error,Math.abs(actualDepth-estimatedDepth)*24);
        const handWeight=observed.handConfidence?.[side],predictedWeight=estimated.handConfidence?.[side];
        if(handWeight!==undefined&&predictedWeight!==undefined)
          error=Math.max(error,Math.abs(handWeight-predictedWeight)*25);
        const raw=observed.fingerCurls?.[side],interpolated=estimated.fingerCurls?.[side];
        if(Boolean(raw)!==Boolean(interpolated))error=Math.max(error,24);
        else if(raw&&interpolated)for(let digit=0;digit<5;digit++)
          error=Math.max(error,Math.abs(raw[digit]-interpolated[digit])*62);
      }
      if(observed.contact!==estimated.contact)error=Math.max(error,28);
      if(observed.expression!==estimated.expression)error=Math.max(error,20);
      // Force explicit tracking gaps into the key set before other compression.
      if(Math.abs((observed.presence??1)-(estimated.presence??1))>.05)
        error=Math.max(error,100);
      if(observed.focus){
        if(!estimated.focus)error=Math.max(error,20);
        else error=Math.max(error,Math.hypot(
          observed.focus.x-estimated.focus.x,observed.focus.y-estimated.focus.y)*38);
      }
      if(observed.facial){
        if(!estimated.facial)error=Math.max(error,20);
        else for(const channel of Object.keys(observed.facial) as (keyof FacialControls)[])
          error=Math.max(error,Math.abs(observed.facial[channel]-estimated.facial[channel])*48);
      }
      if(error>largest){largest=error;candidate=index;}
    }
    if(candidate<0)continue;
    kept.add(candidate);
    pending.push([from,candidate],[candidate,to]);
  }
  return [...kept].sort((a,b)=>a-b).map(index=>keys[index]);
}
/** Resample by elapsed capture timestamps; reject out-of-order/low-confidence frames.
 * Exponential low-pass smoothing suppresses tracking noise, without changing
 * pose timing. A hard 240-key cap keeps JSON save/export bounded. */
export function compilePerformance(frames: readonly CaptureFrame[], options:CaptureOptions={}) {
  const valid=frames.map(retargetCaptureFrame).filter((v):v is PerformanceKey=>!!v)
    .filter((v,i,a)=>i===0||v.time>a[i-1].time);
  if(valid.length<2)throw Error('Capture at least two valid frames. Keep your face, shoulders or another tracked body part in view.');
  const start=valid[0].time, duration=valid[valid.length-1].time-start;
  if(duration<.15)throw Error('Performance is too short. Record at least half a second.');
  const max=Math.max(2,Math.min(240,Math.floor(options.maxKeys??180)));
  const count=Math.min(max,Math.max(2,Math.ceil(duration*12)+1));
  const exaggerated=clamp(options.exaggeration??1,.25,2.5);
  const smoothing=clamp(options.smoothing??.55,0,1);
  const keys:PerformanceKey[]=[];
  let at=0;
  for(let i=0;i<count;i++){
    const elapsed=duration*i/(count-1);
    while(at<valid.length-2&&valid[at+1].time-start<elapsed)at++;
    const source=interpolate(valid[at],valid[at+1],start+elapsed);
    const prev=keys[keys.length-1];
    const pose:JointPose={};
    for(const joint of tracked){
      const raw=source.pose[joint];
      if(raw===undefined)continue;
      // Pose exaggeration scales relative to the neutral rig, with hard limits.
      const target=clamp(raw*exaggerated,-165,165);
      if(prev?.pose[joint]===undefined){pose[joint]=round(target);continue;}
      const from=prev.pose[joint]!;
      // One-Euro-inspired adaptive temporal filtering: keep near-still poses
      // calm without delaying intentional fast conversational gestures.
      const dt=duration/(count-1);
      const velocity=Math.abs(wrapDegrees(target-from))/Math.max(.03,dt);
      const cutoff=1.25+(1-smoothing)*4.2+Math.min(8,velocity*.016);
      const response=1-Math.exp(-2*Math.PI*cutoff*dt);
      const deadband=Math.abs(wrapDegrees(target-from))<.48 ? .48 : 1;
      pose[joint]=round(clamp(mixDegrees(from,target,response*deadband),-165,165));
    }
    keys.push({time:Math.round((elapsed/duration)*10000)/10000,pose,
      ...(source.focus?{focus:prev?.focus?{
        x:round(mix(prev.focus.x,source.focus.x,1-smoothing*.45)),
        y:round(mix(prev.focus.y,source.focus.y,1-smoothing*.45))}:source.focus}:{}),
      ...(source.hands?{hands:source.hands}:{}),...(source.expression?{expression:source.expression}:{}),
      ...(source.facial?{facial:prev?.facial
        ? blendFacialControls(prev.facial,source.facial,1-smoothing*.6)
        : source.facial}:{})});
  }
  keys[0].time=0;keys[keys.length-1].time=1;
  return {keys:reducePerformanceKeys(keys),duration:Math.round(duration*100)/100,
    framesAccepted:valid.length,framesDropped:frames.length-valid.length};
}
export function classifyPerformance(keys: readonly PerformanceKey[],at:number):PerformanceIntent {
  const k=samplePerformance(keys,at),p=k.pose;
  if(k.hands?.left==='fist'&&k.hands?.right==='fist'&&
    Math.max(Math.abs(p.leftShoulder??0),Math.abs(p.rightShoulder??0))>45)return 'guard';
  if(k.hands?.left==='point'||k.hands?.right==='point')return 'point';
  if(k.hands?.left==='open'&&k.hands?.right==='open')return 'open-hands';
  if(Math.max(Math.abs(p.leftShoulder??0),Math.abs(p.rightShoulder??0))>55)return 'emphasis';
  return 'rest';
}
/** Estimate a strike only when a fist rapidly extends over a short interval.
 * This is a suggestion for an editor, never a claim of physical contact. */
export function findStrike(keys: readonly PerformanceKey[]):number|undefined {
  for(let i=2;i<keys.length;i++){
    const before=keys[i-2],now=keys[i],dt=now.time-before.time;
    if(dt<=0)continue;
    for(const side of ['left','right'] as const){
      if(now.hands?.[side]!=='fist')continue;
      const start=Math.abs(before.pose[`${side}Elbow`]??0),end=Math.abs(now.pose[`${side}Elbow`]??0);
      if(start-end>24&&dt<.24)return now.time;
    }
  }
  return undefined;
}
/** Authorable recoil clip. No automatic target hits, physics, or teleporting. */
export function makeRecoilKeys():PerformanceKey[] {
  return [
    {time:0,pose:{torso:0,head:0,leftShoulder:0,rightShoulder:0},hands:{left:'relaxed',right:'relaxed'}},
    {time:.18,pose:{torso:-13,head:19,leftShoulder:54,leftElbow:65,rightShoulder:-45,rightElbow:-70},hands:{left:'open',right:'open'},expression:'surprised'},
    {time:.38,pose:{torso:-20,head:25,leftShoulder:65,leftElbow:70,rightShoulder:-56,rightElbow:-76},hands:{left:'open',right:'open'},expression:'surprised'},
    {time:.74,pose:{torso:-9,head:9,leftShoulder:32,leftElbow:48,rightShoulder:-23,rightElbow:-42},hands:{left:'relaxed',right:'relaxed'},expression:'angry'},
    {time:1,pose:{torso:0,head:0,leftShoulder:0,rightShoulder:0},hands:{left:'relaxed',right:'relaxed'}}
  ];
}
/** Extract observable physical tendencies, not psychological traits. */
export function actingDNA(keys:readonly PerformanceKey[]):MotionDNA {
  let magnitude=0,velocity=0,left=0,right=0,changes=0;
  for(let i=0;i<keys.length;i++){
    const p=keys[i].pose;
    left+=Math.abs(p.leftShoulder??0);right+=Math.abs(p.rightShoulder??0);
    magnitude+=(Math.abs(p.leftShoulder??0)+Math.abs(p.rightShoulder??0))/2;
    if(i){
      const delta=Math.abs((p.leftShoulder??0)-(keys[i-1].pose.leftShoulder??0))+
        Math.abs((p.rightShoulder??0)-(keys[i-1].pose.rightShoulder??0));
      velocity+=delta/Math.max(.01,keys[i].time-keys[i-1].time);changes+=delta;
    }
  }
  const n=Math.max(1,keys.length);
  return {energy:Math.round(clamp(velocity/Math.max(1,n-1)/500,0,1)*100),
    gestureAmplitude:Math.round(clamp(magnitude/n/90,0,1)*100),
    movementSmoothness:Math.round(clamp(1-changes/n/60,0,1)*100),
    dominantHand:left>right?'left':'right',observations:keys.length};
}
export function personalityStrength(character?:Character) {
  return character ? clamp(.72+(character.personality?.expressiveness??50)/500,.5,1.2):1;
}
