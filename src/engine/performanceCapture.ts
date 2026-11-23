/**
 * SIRVIBE Performance Compiler.
 * Deterministic, offline-capable retargeting from normalized landmark observations
 * to sparse, editable poses. No personal video is persisted by this module.
 */
import { clamp, ease, mix } from './animation.ts';
import { fuseWorldAngle, mixDegrees, worldBodyProjector, wrapDegrees } from './worldRetarget.ts';
import type { Character, Expression, JointPose } from './schema.ts';
import type { HandPose } from './handRig.ts';
import { blendFacialControls, facialFromBlendshapes, type FacialControls } from './facialIntelligence.ts';

export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export type CaptureFrame = {
  t: number; pose: Landmark[]; world?: Landmark[]; leftHand?: Landmark[]; rightHand?: Landmark[];
  face?: Record<string, number>;
};
export type CaptureOptions = { exaggeration?: number; smoothing?: number; maxKeys?: number };
export type PerformanceKey = {
  time: number; pose: JointPose; lift?: number;
  hands?: { left: HandPose; right: HandPose }; expression?: Expression;
  /** Reduced and editable face blendshapes; never raw webcam imagery. */
  facial?: FacialControls;
};
export type PerformanceIntent = 'rest' | 'point' | 'open-hands' | 'emphasis' | 'guard' | 'strike';
export type MotionDNA = {
  energy: number; gestureAmplitude: number; movementSmoothness: number;
  dominantHand: 'left' | 'right'; observations: number;
};
const tracked = ['torso','head','leftShoulder','leftElbow','leftWrist','rightShoulder','rightElbow','rightWrist',
  'leftHip','leftKnee','rightHip','rightKnee'] as const;
const confidence = (p?: Landmark) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= .55;
const midpoint = (a: Landmark, b: Landmark): Landmark => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const distance = (a: Landmark,b:Landmark) => Math.hypot(a.x-b.x,a.y-b.y);
const angle = (a: Landmark,b:Landmark) => Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI;
function degrees(value:number) {
  return ((value+180)%360+360)%360-180;
}
function handShape(hand?: Landmark[]): HandPose | undefined {
  if(!hand || hand.length<21 || !confidence(hand[0]))return undefined;
  const wrist=hand[0];
  const bend=[4,8,12,16,20].map((tip,i)=>{
    const base=hand[[2,5,9,13,17][i]];
    const middle=hand[[3,6,10,14,18][i]];
    const end=hand[tip];
    if(!base||!middle||!end)return .5;
    const reach=distance(end,wrist)/Math.max(.001,distance(base,wrist)+distance(middle,base));
    return clamp((1.25-reach)/.7);
  });
  const extended=bend.slice(1).map(v=>v<.48);
  const count=extended.filter(Boolean).length;
  if(count===4)return 'open';
  if(count===0)return 'fist';
  if(extended[0]&&!extended[1]&&!extended[2]&&!extended[3])return 'point';
  if(extended[0]&&extended[1]&&!extended[2]&&!extended[3])return 'count-two';
  if(extended[0]&&extended[1]&&extended[2]&&!extended[3])return 'count-three';
  if(count===3||count===4)return 'loose-open';
  return 'relaxed';
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
  const p=frame.pose;
  // Speaking-at-a-desk framing often excludes hips and even one wrist. Keep
  // accurate observed upper-body motion; never synthesize unobserved legs.
  if(p.length<17||![11,12].every(i=>confidence(p[i]))||
    ![13,14,15,16].some(i=>confidence(p[i])))return undefined;
  const world=worldBodyProjector(frame.world);
  const angleOf=(from:number,to:number) => {
    const image=angle(p[from],p[to]);
    return world?fuseWorldAngle(image,world.angle(from,to),world.frontness):image;
  };
  const hipsVisible=confidence(p[23])&&confidence(p[24]);
  const shoulders=midpoint(p[11],p[12]);
  const screenTorso=hipsVisible
    ?degrees(180-angle(midpoint(p[23],p[24]),shoulders))
    :0;
  const worldTorso=hipsVisible && world && world.angle(23,11)!==undefined && world.angle(24,12)!==undefined
    ? degrees(180-mixDegrees(world.angle(23,11)!,world.angle(24,12)!,.5))
    : undefined;
  const torso=clamp(worldTorso===undefined?screenTorso:
    fuseWorldAngle(screenTorso,worldTorso,world!.frontness),-28,28);
  const pose:JointPose={torso};
  for(const side of ['left','right'] as const) {
    const i=side==='left'?11:12, e=side==='left'?13:14, w=side==='left'?15:16;
    if(!confidence(p[e]))continue;
    const upper=angleOf(i,e);
    pose[`${side}Shoulder`]=clamp(degrees(upper-(side==='left'?-13:13)-torso),-165,165);
    if(confidence(p[w])){
      pose[`${side}Elbow`]=clamp(degrees(angleOf(e,w)-upper),-160,160);
      const hand=side==='left'?frame.leftHand:frame.rightHand;
      const palm=hand&&hand.length>9?angle(hand[0],hand[9]):angle(p[e],p[w]);
      pose[`${side}Wrist`]=clamp(degrees(palm-angle(p[e],p[w])),-65,65);
    }
  }
  if(confidence(p[0])){
    const screenHead=degrees(180-angle(shoulders,p[0]))-torso;
    const worldHead=world?.angle(11,0)!==undefined && world?.angle(12,0)!==undefined
      ? degrees(180-mixDegrees(world.angle(11,0)!,world.angle(12,0)!,.5))-torso : undefined;
    pose.head=clamp(worldHead===undefined?screenHead:
      fuseWorldAngle(screenHead,worldHead,world!.frontness),-35,35);
  }
  // Legs are included only when observed; never fabricate missing knees/feet.
  for(const side of ['left','right'] as const){
    const a=side==='left'?23:24,b=side==='left'?25:26,c=side==='left'?27:28;
    if(confidence(p[a])&&confidence(p[b])){
      const thigh=angleOf(a,b);
      pose[`${side}Hip`]=clamp(degrees(thigh-(side==='left'?-5:5)),-100,100);
      if(confidence(p[c]))pose[`${side}Knee`]=clamp(degrees(angleOf(b,c)-thigh),-135,135);
    }
  }
  const left=handShape(frame.leftHand),right=handShape(frame.rightHand);
  return {time:frame.t,pose,
    ...(left||right?{hands:{left:left??'relaxed',right:right??'relaxed'}}:{}),
    ...(facialExpression(frame.face)?{expression:facialExpression(frame.face)}:{}),
    ...(frame.face?{facial:facialFromBlendshapes(frame.face)}:{})};
}
function interpolate(a:PerformanceKey,b:PerformanceKey,at:number):PerformanceKey {
  const fraction=clamp((at-a.time)/Math.max(.000001,b.time-a.time));
  const pose:JointPose={};
  for(const joint of tracked) {
    const left=a.pose[joint],right=b.pose[joint];
    if(left===undefined&&right===undefined)continue;
    // Animator-style overlap: the shoulder initiates a gesture, the elbow
    // follows, and the wrist settles last. The lag is an intra-key interval,
    // not a delayed timestamp, so each authored pose is hit exactly.
    const lag=joint.endsWith('Wrist')?.15:
      joint.endsWith('Elbow')?.075:joint==='head'?.045:0;
    const phase=clamp((fraction-lag)/Math.max(.01,1-lag));
    pose[joint]=mixDegrees(left??right??0,right??left??0,ease(phase));
  }
  return {time:at,pose,
    hands: fraction<.5 ? a.hands??b.hands : b.hands??a.hands,
    expression: fraction<.5?a.expression??b.expression:b.expression??a.expression,
    ...((a.facial||b.facial)?{facial:a.facial&&b.facial
      ? blendFacialControls(a.facial,b.facial,ease(fraction))
      : a.facial??b.facial}: {})};
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
  let lo=0,hi=keys.length-1;
  if(t<=keys[0].time)hi=0;
  else if(t>=keys[hi].time)lo=hi;
  else while(hi-lo>1){
    const mid=(lo+hi)>>1;
    if(keys[mid].time<=t)lo=mid;else hi=mid;
  }
  const from=keys[lo].hands??keys[hi].hands;
  const to=keys[hi].hands??from;
  if(!from||!to)return undefined;
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
        if(value===undefined)continue;
        const delta=Math.abs(wrapDegrees(value-(estimated.pose[joint]??value)));
        const emphasis=joint==='head'||joint==='torso'?1.5:
          joint.endsWith('Wrist')?.7:1;
        error=Math.max(error,delta*emphasis);
      }
      for(const side of ['left','right'] as const)
        if(observed.hands?.[side]!==estimated.hands?.[side])error=Math.max(error,20);
      if(observed.expression!==estimated.expression)error=Math.max(error,20);
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
  if(valid.length<2)throw Error('Capture at least two clearly tracked frames with both arms and shoulders visible.');
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
