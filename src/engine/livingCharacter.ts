import { clamp, ease, mix } from './animation.ts';
import type { Action, Character, Expression, JointPose } from './schema.ts';

/**
 * SIRVIBE Living Characters.
 * A pure timeline-time sampler: no mutable random state, frame-step simulation
 * or network calls. Preview, scrubbing, export, and offline renders agree.
 */
export const traitDefaults = {
  confidence: 55, expressiveness: 55, energy: 50, sociability: 55,
  nervousness: 25, aggressiveness: 20, playfulness: 45, patience: 55,
  restlessness: 25, emotionalReactivity: 55, gestureFrequency: 55,
  gestureAmplitude: 55, movementSpeed: 50, postureOpenness: 55,
  eyeContact: 65, personalSpace: 50, reactionIntensity: 55, movementSmoothness: 65
} as const;

export type Trait = keyof typeof traitDefaults;
export type Personality = ReturnType<typeof resolvePersonality>;
type Preset = NonNullable<NonNullable<Character['personality']>['preset']>;
export type GestureKind = 'beat'|'explain'|'point'|'question'|'shrug'|'chin'|'rub'|'fidget'|'rest';
export type HandShape = 'relaxed'|'open'|'point'|'grip'|'fist'|'pinch'|'palm-up'|'thumbs-up'|'count';

const presets: Record<Preset,Partial<Record<Trait,number>>> = {
  balanced:{}, confident:{confidence:92,postureOpenness:85,eyeContact:88,nervousness:8,gestureAmplitude:64},
  shy:{confidence:19,postureOpenness:22,eyeContact:22,nervousness:78,gestureAmplitude:20,gestureFrequency:28},
  nervous:{nervousness:91,restlessness:85,confidence:25,movementSmoothness:25,eyeContact:34},
  relaxed:{energy:24,restlessness:10,movementSmoothness:92,aggressiveness:7,gestureFrequency:24},
  hyperactive:{energy:95,restlessness:90,expressiveness:96,gestureFrequency:91,gestureAmplitude:90},
  funny:{playfulness:90,expressiveness:88,energy:72,gestureAmplitude:85},
  serious:{playfulness:9,patience:85,expressiveness:32,gestureFrequency:26,movementSmoothness:87},
  arrogant:{confidence:98,postureOpenness:95,eyeContact:87,patience:20,gestureAmplitude:78},
  mysterious:{expressiveness:19,gestureFrequency:14,movementSmoothness:93,eyeContact:43,energy:25},
  dramatic:{emotionalReactivity:96,expressiveness:98,gestureAmplitude:96,reactionIntensity:95},
  grumpy:{aggressiveness:78,patience:18,playfulness:8,postureOpenness:34},
  playful:{playfulness:93,expressiveness:84,energy:75,gestureFrequency:75}
};
export function resolvePersonality(value?:Character['personality']) {
  const preset=value?.preset??'balanced';
  const result={...traitDefaults,...presets[preset]} as Record<Trait,number>;
  for(const key of Object.keys(traitDefaults) as Trait[]){
    const override=value?.[key];
    if(typeof override==='number'&&Number.isFinite(override))result[key]=clamp(override,0,100);
  }
  return {...result,preset,signature:value?.signature??'none',autoActing:value?.autoActing??'full'};
}
function hash(text:string) {
  let n=2166136261;
  for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);
  return n>>>0;
}
function chance(seed:number,slot:number,salt:number) {
  let value=(seed^Math.imul(slot+1,0x9e3779b1)^Math.imul(salt,0x85ebca6b))>>>0;
  value=Math.imul(value^(value>>>16),0x7feb352d);
  value=Math.imul(value^(value>>>15),0x846ca68b);
  return ((value^(value>>>16))>>>0)/0x100000000;
}
const spokenActions=new Set<Action>(['idle','talk','listen','walk','run','sit','stand','idle-relaxed','idle-alert','idle-bored','idle-nervous']);
export type ActingContext = {
  time:number; actorId:string; action:Action; locomotion:Action; expression:Expression;
  speaking:boolean; speechWeight:number; listening?:boolean;
  manualGesture?:boolean; carrying?:boolean;
};
export type GestureSample = {kind:GestureKind;side:'left'|'right';weight:number;phase:number};

/**
 * Gesture slots have independent seeded choices, an anticipation/stroke/recovery
 * envelope, pauses, and a cooldown for the more emphatic gestures.
 */
export function gestureAt(character:Character,input:ActingContext):GestureSample {
  const traits=resolvePersonality(character.personality);
  const none:GestureSample={kind:'rest',side:'right',weight:0,phase:0};
  if(traits.autoActing==='off'||input.manualGesture||!spokenActions.has(input.action))return none;
  const t=Math.max(0,Number.isFinite(input.time)?input.time:0);
  const talking=input.speaking&&input.speechWeight>.055;
  const activity=talking?1:input.listening?.32:.18;
  const frequency=traits.gestureFrequency/100;
  const interval=mix(3.0,.86,frequency)*mix(1.24,.83,traits.energy/100);
  const seed=hash(character.id);
  const slot=Math.floor(t/interval);
  const phase=(t-slot*interval)/interval;
  // A few full periods of restraint are essential for believable conversation.
  const threshold=talking?mix(.2,.87,frequency):mix(.03,.28,traits.restlessness/100);
  if(chance(seed,slot,1)>threshold)return none;
  const kindChoice=chance(seed,slot,2),side: 'left'|'right'=chance(seed,slot,3)<.29?'left':'right';
  const choices:GestureKind[]=talking
    ? ['beat','explain','question','beat','point','shrug','explain','beat']
    : ['fidget','chin','rest','rub','fidget','rest','shrug','rest'];
  let kind=choices[Math.min(choices.length-1,Math.floor(kindChoice*choices.length))];
  if(talking&&traits.nervousness>70&&kind==='point')kind='fidget';
  if(talking&&traits.confidence<28&&kind==='point')kind='question';
  if(input.expression==='angry'&&talking&&kind==='question')kind='point';
  if(input.expression==='sad'&&kind==='point')kind='chin';
  if((traits.signature==='point'||traits.signature==='touch-chin'||traits.signature==='rub-hands'||traits.signature==='shrug')&&chance(seed,slot,4)<.36){
    kind=traits.signature==='touch-chin'?'chin':traits.signature==='rub-hands'?'rub':traits.signature;
  }
  // Suppress adjacent strongly distinctive gestures, without relying on previous frames.
  if((kind==='point'||kind==='rub')&&chance(seed,slot-1,2)>.72)kind='beat';
  const anticipation=ease(clamp(phase/.24));
  const recovery=ease(clamp((.94-phase)/.28));
  const stroke=Math.min(anticipation,recovery);
  const amplitude=mix(.25,1.15,traits.gestureAmplitude/100);
  const context=talking?mix(.48,1,clamp(input.speechWeight)):activity;
  const expressive=mix(.6,1.22,traits.expressiveness/100);
  const gentle=traits.autoActing==='subtle'?.4:1;
  const weight=clamp(stroke*amplitude*context*expressive*gentle);
  return {kind,side,weight,phase};
}

const gesturalAngles: Record<Exclude<GestureKind,'rest'>,[number,number,number]> = {
  beat:[44,49,12],explain:[50,75,20],point:[83,17,0],question:[34,87,26],
  shrug:[-42,-48,15],chin:[38,111,-12],rub:[36,92,24],fidget:[16,64,9]
};

/** Joint-safe additive layer. Explicit gestures and prop interactions retain authority. */
export function livingPose(character:Character,input:ActingContext,base:JointPose):JointPose {
  const p=resolvePersonality(character.personality);
  if(p.autoActing==='off')return base;
  const t=Math.max(0,Number.isFinite(input.time)?input.time:0);
  const subtle=p.autoActing==='subtle'?.42:1;
  const result:JointPose={...base};
  const motion=input.locomotion==='walk'||input.locomotion==='run';
  const quiet=spokenActions.has(input.action);
  const breath=Math.sin(t*2.05+hash(character.id)*.00001);
  const sway=Math.sin(t*.75+hash(character.id)*.000009);
  const posture=(p.postureOpenness-50)/50;
  const anxious=p.nervousness/100;
  // Preserve strong authored poses: secondary animation is kept small.
  const secondary=quiet?1:.24;
  result.torso=(result.torso??0)+(posture*-3.8+breath*1.1+sway*anxious*1.8)*secondary*subtle;
  result.neck=(result.neck??0)+(breath*.55-sway*.8)*secondary*subtle;
  result.head=(result.head??0)+(sway*(.8+anxious*2.7)+(p.signature==='tilt-head'?3:0))*secondary*subtle;
  if(!motion&&quiet&&!input.manualGesture){
    const stillness=1-p.restlessness/150;
    result.leftShoulder=(result.leftShoulder??0)+(posture*-4+breath*.4)*stillness*subtle;
    result.rightShoulder=(result.rightShoulder??0)+(posture*4-breath*.4)*stillness*subtle;
  }
  if(motion) {
    const gaitEnergy=mix(.7,1.32,p.energy/100);
    result.leftShoulder=(result.leftShoulder??0)*gaitEnergy;
    result.rightShoulder=(result.rightShoulder??0)*gaitEnergy;
    result.leftElbow=(result.leftElbow??0)+p.confidence/100*4*subtle;
    result.rightElbow=(result.rightElbow??0)+p.confidence/100*4*subtle;
  }
  const gesture=gestureAt(character,input);
  if(gesture.weight>.001&&!input.manualGesture){
    const [shoulder,elbow,wrist]=gesturalAngles[gesture.kind as Exclude<GestureKind,'rest'>];
    const side=gesture.side==='right'&&input.carrying?'left':gesture.side;
    const sign=side==='right'?1:-1;
    const w=gesture.weight*(motion?.48:1);
    const s=(side+'Shoulder') as 'rightShoulder'|'leftShoulder';
    const e=(side+'Elbow') as 'rightElbow'|'leftElbow';
    const r=(side+'Wrist') as 'rightWrist'|'leftWrist';
    result[s]=mix(result[s]??0,shoulder*sign,w);
    result[e]=mix(result[e]??0,elbow*sign,w);
    result[r]=mix(result[r]??0,wrist*sign,w);
    // A gesture is a body action, not a disembodied hand.
    result.head=(result.head??0)+Math.sin(Math.PI*gesture.phase)*w*2;
    result.torso=(result.torso??0)+w*sign*1.9;
  }
  return result;
}
export function gestureHand(character:Character,input:ActingContext,side:'left'|'right'):HandShape|undefined {
  const sample=gestureAt(character,input);
  if(sample.weight<.14)return undefined;
  const gesturingSide=sample.side==='right'&&input.carrying?'left':sample.side;
  if(gesturingSide!==side&&sample.kind!=='rub'&&sample.kind!=='shrug')return undefined;
  switch(sample.kind){
    case 'point':return 'point';
    case 'explain':return 'open';
    case 'question':return 'palm-up';
    case 'chin':return 'pinch';
    case 'rub':return 'open';
    case 'shrug':return 'palm-up';
    case 'beat':return 'open';
    case 'fidget':return 'pinch';
    default:return undefined;
  }
}
