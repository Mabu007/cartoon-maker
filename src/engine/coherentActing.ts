/** Pure scene-time behavior schedule. No mutable random state, no facial
 * inference, no independent root/IK/hand/viseme authority. */
import type {Action,Character,JointPose} from './schema.ts';
import type {ActingContext,Personality,GestureSample} from './livingCharacter.ts';
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;};
function rand(seed:number,slot:number,salt:number){let n=(seed^Math.imul(slot+1,0x9e3779b1)^Math.imul(salt,0x85ebca6b))>>>0;n=Math.imul(n^(n>>>16),0x7feb352d);return ((n^(n>>>15))>>>0)/4294967296;}
/** Event entirely within its slot: exact zero and zero derivative at boundaries. */
function event(t:number,seed:number,period:number,duration:number,salt:number,probability=1){
 const slot=Math.floor(t/period),local=t-slot*period,at=.15+rand(seed,slot,salt)*Math.max(0,period-duration-.3);
 if(rand(seed,slot,salt+31)>probability)return 0;
 const p=(local-at)/duration;return p>0&&p<1?Math.sin(Math.PI*p)**2:0;
}
export type ActingAuthority={body?:boolean;arms?:boolean;head?:boolean;eyes?:boolean;face?:boolean;gaze?:boolean;capture?:boolean};
export type ActingState='idle'|'listening'|'speaking'|'reacting'|'transition';
export type CoherentActingFrame={state:ActingState;breath:number;shift:number;nod:number;glanceX:number;glanceY:number;blink:number;faceFree:boolean;eyesFree:boolean;headFree:boolean;gestureFree:boolean;weight:number};
const quiet=new Set<Action>(['idle','talk','listen','idle-alert','idle-relaxed','idle-bored','idle-nervous']);
export function coherentEnabled(c:Pick<Character,'personality'>){return c.personality?.actingModel==='coherent-v1';}
export function coherentFrame(c:Character,p:Personality,input:ActingContext,authority:ActingAuthority={}):CoherentActingFrame{
 const t=Number.isFinite(input.time)?Math.max(0,input.time):0,seed=hash(c.id+'|'+input.actorId+'|'+(c.personality?.behaviorSeed??0));
 const active=p.autoActing!=='off',weight=active?(p.autoActing==='subtle'?.42:1):0;
 const state:ActingState=!quiet.has(input.action)?'transition':input.speaking?'speaking':input.listening?'listening':input.expression!=='neutral'?'reacting':'idle';
 const period=3.5+(100-p.energy)*.014+(100-p.breathingRate)*.012;
 const breath=Math.sin((t/period+rand(seed,0,1))*2*Math.PI)*p.breathingAmplitude/100*weight;
 const shift=event(t,seed,5.5+(100-p.idleTiming)*.06,1.5,4,.35+p.restlessness*.003)*(rand(seed,Math.floor(t/(5.5+(100-p.idleTiming)*.06)),17)<.5?-1:1)*weight;
 const nod=state==='listening'?event(t,seed,4.8+(100-p.responseTendency)*.065,.75,8,.28+p.responseTendency*.005)*weight:0;
 const glance=event(t,seed,4.6+(p.eyeContact)*.045,1.2,12,.18+(100-p.eyeContact)*.007)*weight;
 const sign=rand(seed,Math.floor(t/(4.6+p.eyeContact*.045)),9)<.5?-1:1;
 const blink=active&&!authority.eyes&&!authority.capture?event(t,seed,2.5+(100-p.blinkFrequency)*.037,.18,22):0;
 return {state,breath,shift,nod,glanceX:glance*sign*(1-p.eyeContact/120),glanceY:glance*(.15+p.nervousness*.004),blink,
 faceFree:!authority.face&&!authority.capture,eyesFree:!authority.eyes&&!authority.capture&&!authority.gaze,headFree:!authority.head&&!authority.body&&!authority.capture,gestureFree:!authority.arms&&!authority.body&&!authority.capture,weight};
}
/** Add only in idle/unclaimed channels, preserve every authored angle and all
 * legs, wrists and contacts when claimed. No generated hips/root/lift. */
export function applyCoherentPose(base:JointPose,p:Personality,input:ActingContext,frame:CoherentActingFrame,gesture:GestureSample,gestured:JointPose):JointPose{
 if(!frame.weight||frame.state==='transition')return base;
 const out={...base},open=(p.postureOpenness-50)/50,conf=(p.confidence-50)/50,head=(p.headOrientation-50)/50;
 if(frame.headFree){out.torso=clamp((base.torso??0)-open*4*frame.weight+frame.breath*.85+frame.shift*1.8,-35,35);out.neck=clamp((base.neck??0)+frame.breath*.35+frame.nod*1.6,-25,25);out.head=clamp((base.head??0)+head*3*frame.weight-conf*1.4*frame.weight+frame.nod*4+frame.shift*.6,-30,30);}
 if(frame.gestureFree&&!input.occupiedHands){
  out.leftShoulder=(base.leftShoulder??0)-open*7*frame.weight+frame.breath*.35;
  out.rightShoulder=(base.rightShoulder??0)+open*7*frame.weight-frame.breath*.35;
 }
 if(frame.gestureFree&&gesture.weight>0&&gesture.kind!=='rest'){
  const sides=gesture.kind==='rub'?['left','right'] as const:[gesture.side];
  for(const side of sides){if(input.occupiedHands===side||input.occupiedHands==='both')continue;for(const joint of ['Shoulder','Elbow','Wrist'] as const){const k=`${side}${joint}` as keyof JointPose;if(gestured[k]!==undefined)out[k]=gestured[k];}}
 }
 return out;
}
