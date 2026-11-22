/**
 * SIRVIBE Performance Compiler.
 * Deterministic, offline-capable retargeting from normalized landmark observations
 * to sparse, editable poses. No personal video is persisted by this module.
 */
import { clamp, ease, mix } from './animation.ts';
import type { Character, Expression, JointPose } from './schema.ts';
import type { HandPose } from './handRig.ts';

export type Landmark = { x: number; y: number; z?: number; visibility?: number };
export type CaptureFrame = {
  t: number; pose: Landmark[]; leftHand?: Landmark[]; rightHand?: Landmark[];
  face?: Record<string, number>;
};
export type CaptureOptions = { exaggeration?: number; smoothing?: number; maxKeys?: number };
export type PerformanceKey = {
  time: number; pose: JointPose; lift?: number;
  hands?: { left: HandPose; right: HandPose }; expression?: Expression;
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
  if(p.length<17||![11,12,13,14,15,16,23,24].every(i=>confidence(p[i])))return undefined;
  const hips=midpoint(p[23],p[24]), shoulders=midpoint(p[11],p[12]);
  const torso=clamp(degrees(180-angle(hips,shoulders)),-28,28);
  const pose:JointPose={torso};
  for(const side of ['left','right'] as const) {
    const i=side==='left'?11:12, e=side==='left'?13:14, w=side==='left'?15:16;
    const upper=angle(p[i],p[e]);
    pose[`${side}Shoulder`]=clamp(degrees(upper-(side==='left'?-13:13)-torso),-165,165);
    pose[`${side}Elbow`]=clamp(degrees(angle(p[e],p[w])-upper),-160,160);
    const hand=side==='left'?frame.leftHand:frame.rightHand;
    const palm=hand&&hand.length>9?angle(hand[0],hand[9]):angle(p[e],p[w]);
    pose[`${side}Wrist`]=clamp(degrees(palm-angle(p[e],p[w])),-65,65);
  }
  if(confidence(p[0]))pose.head=clamp(degrees(180-angle(shoulders,p[0]))-torso,-35,35);
  // Legs are included only when observed; never fabricate missing knees/feet.
  for(const side of ['left','right'] as const){
    const a=side==='left'?23:24,b=side==='left'?25:26,c=side==='left'?27:28;
    if(confidence(p[a])&&confidence(p[b])){
      const thigh=angle(p[a],p[b]);
      pose[`${side}Hip`]=clamp(degrees(thigh-(side==='left'?-5:5)),-100,100);
      if(confidence(p[c]))pose[`${side}Knee`]=clamp(degrees(angle(p[b],p[c])-thigh),-135,135);
    }
  }
  const left=handShape(frame.leftHand),right=handShape(frame.rightHand);
  return {time:frame.t,pose,
    ...(left||right?{hands:{left:left??'relaxed',right:right??'relaxed'}}:{}),
    ...(facialExpression(frame.face)?{expression:facialExpression(frame.face)}:{})};
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
    pose[joint]=mix(left??right??0,right??left??0,ease(phase));
  }
  return {time:at,pose,
    hands: fraction<.5 ? a.hands??b.hands : b.hands??a.hands,
    expression: fraction<.5?a.expression??b.expression:b.expression??a.expression};
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
const round=(v:number)=>Math.round(v*10)/10;
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
  const alpha=1-smoothing*.82;
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
      pose[joint]=round(prev?.pose[joint]===undefined?target:mix(prev.pose[joint]!,target,alpha));
    }
    keys.push({time:Math.round((elapsed/duration)*10000)/10000,pose,
      ...(source.hands?{hands:source.hands}:{}),...(source.expression?{expression:source.expression}:{})});
  }
  keys[0].time=0;keys[keys.length-1].time=1;
  return {keys,duration:Math.round(duration*100)/100,framesAccepted:valid.length,framesDropped:frames.length-valid.length};
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
