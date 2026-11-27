import {coherentEnabled,coherentFrame,applyCoherentPose,type ActingAuthority} from './coherentActing.ts';
import { clamp, ease, mix } from './animation.ts';
import { dialogueBeatAt, type DialoguePhrase } from './dialogueGestures.ts';
import type { HandPose, HandSide } from './handRig.ts';
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
  eyeContact: 65, personalSpace: 50, reactionIntensity: 55, movementSmoothness: 65, breathingAmplitude:35, breathingRate:45, idleTiming:40, blinkFrequency:40, headOrientation:50, responseTendency:50
} as const;

export type Trait = keyof typeof traitDefaults;
export type Personality = ReturnType<typeof resolvePersonality>;
type Preset = NonNullable<NonNullable<Character['personality']>['preset']>;
export type GestureKind = 'beat' | 'explain' | 'point' | 'question' | 'shrug' | 'chin' |
  'rub' | 'fidget' | 'self-reference' | 'count-one' | 'count-two' | 'count-three' | 'rest';
export type OccupiedHands = HandSide | 'both';

const presets: Record<Preset,Partial<Record<Trait,number>>> = {
  balanced:{}, confident:{confidence:92,postureOpenness:85,eyeContact:88,nervousness:8,gestureAmplitude:64,headOrientation:40,blinkFrequency:28,responseTendency:62},
  shy:{confidence:19,postureOpenness:22,eyeContact:22,nervousness:78,gestureAmplitude:20,gestureFrequency:28,headOrientation:72,responseTendency:35},
  nervous:{nervousness:91,restlessness:85,confidence:25,movementSmoothness:25,eyeContact:34,breathingRate:75,breathingAmplitude:45,idleTiming:65,blinkFrequency:78,headOrientation:65},
  relaxed:{energy:24,restlessness:10,movementSmoothness:92,aggressiveness:7,gestureFrequency:24,breathingRate:20,breathingAmplitude:45,idleTiming:20,blinkFrequency:22},
  energetic:{energy:82,restlessness:42,expressiveness:76,gestureFrequency:75,gestureAmplitude:70,breathingRate:65,idleTiming:65,responseTendency:75},
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
  time: number; actorId: string; action: Action; locomotion: Action; expression: Expression;
  speaking: boolean; listening?: boolean; listeningEnvelope?:number; manualGesture?: boolean;
  occupiedHands?: OccupiedHands; phrase?: DialoguePhrase;
  /** Authored target in actor-local coordinates, relative to the upper body. */
  pointToward?: { x: number; y: number };
};

export type GestureSample = { kind: GestureKind; side: HandSide; weight: number; phase: number; pointAngle?: number };

const rest: GestureSample = { kind: 'rest', side: 'right', weight: 0, phase: 0 };

function gestureEnvelope(phase: number, traits: Personality) {
  const prepare = .25, strike = .46;
  const release = mix(.56, .69, traits.confidence / 100);
  if (phase < prepare) return ease(clamp(phase / prepare)) * .24;
  if (phase < strike) return mix(.24, 1, ease(clamp((phase - prepare) / (strike - prepare))));
  return 1 - ease(clamp((phase - release) / (1 - release)));
}

export function gestureAt(character: Character, input: ActingContext): GestureSample {
  const traits = resolvePersonality(character.personality);
  if (traits.autoActing === 'off' || input.manualGesture || !spokenActions.has(input.action) || input.occupiedHands === 'both') return rest;
  const time = Math.max(0, Number.isFinite(input.time) ? input.time : 0);
  const seed = hash(coherentEnabled(character)?character.id+'|'+input.actorId+'|'+(character.personality?.behaviorSeed??0):character.id);
  const primary = chance(seed, 0, 3) < .24 ? 'left' : 'right';
  let side: HandSide = input.occupiedHands === primary ? (primary === 'right' ? 'left' : 'right') : primary;
  const frequency = traits.gestureFrequency / 100;
  const spacing = 1.53 + (1 - frequency) * 1.1;
  const speech = input.speaking && input.phrase ? dialogueBeatAt(input.phrase, time, spacing) : undefined;
  let kind: GestureKind, phase: number, pointAngle: number | undefined;
  let strength = 1;

  if (speech) {
    phase = speech.phase;
    const generic = speech.intent === 'beat' || speech.intent === 'explain';
    if (generic && speech.slot !== 0 && chance(seed, speech.slot, 1) > mix(.24, .88, frequency)) return rest;
    if (speech.intent === 'direction') {
      const target = input.pointToward;
      const targetSide = target && (target.x < 0 ? 'left' : 'right');
      if (target && targetSide && targetSide !== input.occupiedHands && traits.confidence >= 30) {
        side = targetSide;
        kind = 'point';
        pointAngle = Math.atan2(target.x, target.y) * 180 / Math.PI;
      } else kind = 'beat';
    } else {
      kind = speech.intent;
    }
    if (kind === 'explain' && traits.confidence < 33) kind = 'beat';
    if (kind === 'beat' && traits.nervousness > 75 && !speech.audioOnly && chance(seed, speech.slot, 2) < .3) {
      kind = traits.signature === 'touch-chin' ? 'chin' : 'fidget';
    }
    if (kind === 'beat' && !speech.audioOnly && traits.signature === 'shrug') kind = 'shrug';
    if (kind === 'beat' && !speech.audioOnly && traits.signature === 'rub-hands' && !input.occupiedHands) kind = 'rub';
    strength = speech.audioOnly ? .48 : 1;
  } else {
    // Listening fidgets are rare and need a visibly restless personality.
    if (input.speaking || !input.listening || traits.restlessness < 74) return rest;
    const interval = 6.5, slot = Math.floor(time / interval);
    const start = 2 + chance(seed, slot, 5) * 2.5;
    phase = (time - slot * interval - start) / .54;
    if (phase <= 0 || phase >= 1 || chance(seed, slot, 1) > .36) return rest;
    kind = traits.signature === 'touch-chin' ? 'chin' : 'fidget';
    strength = .42;
  }
  const amplitude = mix(.26, 1.00, traits.gestureAmplitude / 100);
  const openness = mix(.70, 1.20, traits.confidence / 100);
  const energy = mix(.60, 1.20, traits.energy / 100);
  const restraint = (traits.autoActing === 'subtle' ? .42 : 1)*(coherentEnabled(character)?.72:1);
  const weight = clamp(gestureEnvelope(phase, traits) * amplitude * openness * energy * strength * restraint);
  return { kind, side, weight, phase, pointAngle };
}

const gesturalAngles: Record<Exclude<GestureKind, 'rest'>, [number, number, number]> = {
  beat: [34, 45, 4], explain: [49, 57, 9], point: [83, 8, 0], question: [28, 72, 10],
  shrug: [20, 62, 9], chin: [23, -131, -6], rub: [-14, -55, 1], fidget: [9, 24, 5],
  'self-reference': [21, -128, -6],
  'count-one': [42, 65, 1], 'count-two': [42, 65, 1], 'count-three': [42, 65, 1]
};

/** Joint-safe additive layer. Explicit gestures and prop interactions retain authority. */
export function livingPose(character: Character, input: ActingContext, base: JointPose, gesture = gestureAt(character, input)): JointPose {
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
  const confidence=(p.confidence-50)/50;
  const emotionMultiplier=input.expression==='neutral'?1:mix(.7,1.65,p.reactionIntensity/100);
  const proximity=input.listening?mix(-1,1,p.personalSpace/100):0;
  const anxious=p.nervousness/100;
  // Preserve strong authored poses: secondary animation is kept small.
  const secondary=quiet?1:.24;
  result.torso=(result.torso??0)+(posture*-7.8-confidence*2.1+breath*1.05+sway*anxious*1.9+proximity*2.2)*secondary*subtle;
  result.neck=(result.neck??0)+(breath*.5-sway*.8+confidence*1.1)*secondary*subtle;
  result.head=(result.head??0)+(sway*(.7+anxious*2.9)*emotionMultiplier-confidence*2.1+
    (p.signature==='tilt-head'?3:0))*secondary*subtle;
  if(input.listening&&!input.manualGesture){
    // A small acknowledgement and forward attention, separated by long holds.
    const phase=(t+hash(input.actorId)*.000007)%4.7;
    const acknowledgement=ease(clamp(1-Math.abs(phase-2.4)/.38));
    result.head=(result.head??0)+acknowledgement*5*(p.sociability/100)*subtle;
    result.neck=(result.neck??0)+acknowledgement*2.1*subtle;
  }
  if(!motion&&quiet&&!input.manualGesture){
    const stillness=1-p.restlessness/150;
    result.leftShoulder=(result.leftShoulder??0)+(posture*-13-confidence*3+breath*.4)*stillness*subtle;
    result.rightShoulder=(result.rightShoulder??0)+(posture*13+confidence*3-breath*.4)*stillness*subtle;
    // Inward elbows make a shy silhouette even in the silent rest frame.
    const guarded=clamp((48-p.confidence)/48)*p.nervousness/100;
    result.leftElbow=(result.leftElbow??0)-guarded*12*subtle;
    result.rightElbow=(result.rightElbow??0)+guarded*12*subtle;
  }
  if(motion) {
    const gaitEnergy=mix(.7,1.32,p.energy/100)*mix(.9,1.15,p.movementSpeed/100);
    result.leftShoulder=(result.leftShoulder??0)*gaitEnergy;
    result.rightShoulder=(result.rightShoulder??0)*gaitEnergy;
    result.leftElbow=(result.leftElbow??0)+p.confidence/100*4*subtle;
    result.rightElbow=(result.rightElbow??0)+p.confidence/100*4*subtle;
  }
  if (gesture.kind !== 'rest' && gesture.weight > 0) {
    const [shoulder, elbow, wrist] = gesturalAngles[gesture.kind];
    const weight = gesture.weight * (motion ? .48 : 1);
    const sides: HandSide[] = gesture.kind === 'rub' ? ['left', 'right'] : [gesture.side];
    for (const side of sides) {
      const sign = side === 'right' ? 1 : -1;
      const shoulderJoint = `${side}Shoulder` as const;
      const elbowJoint = `${side}Elbow` as const;
      const wristJoint = `${side}Wrist` as const;
      const aimedShoulder = gesture.pointAngle === undefined ? shoulder * sign :
        gesture.pointAngle - (13 + elbow) * sign - (result.torso ?? 0) - (result.hips ?? 0);
      result[shoulderJoint] = mix(result[shoulderJoint] ?? 0, aimedShoulder, weight);
      result[elbowJoint] = mix(result[elbowJoint] ?? 0, elbow * sign, weight);
      result[wristJoint] = mix(result[wristJoint] ?? 0, wrist * sign, weight);
    }
    result.head = (result.head ?? 0) + Math.sin(Math.PI * gesture.phase) * weight * 2;
    if (gesture.pointAngle === undefined) result.torso = (result.torso ?? 0) + weight * (gesture.side === 'right' ? 1.9 : -1.9);
  }
  return result;
}

const gestureHands: Record<Exclude<GestureKind, 'rest'>, HandPose> = {
  beat: 'loose-open', explain: 'palm-out', point: 'point', question: 'palm-up',
  shrug: 'shrug', chin: 'pinch', rub: 'loose-open', fidget: 'pinch',
  'self-reference': 'self-reference', 'count-one': 'count-one', 'count-two': 'count-two', 'count-three': 'count-three'
};

export function gestureHand(sample: GestureSample, side: HandSide): HandPose | undefined {
  if (sample.kind === 'rest' || (sample.side !== side && sample.kind !== 'rub')) return undefined;
  return gestureHands[sample.kind];
}

/** V1 uses existing semantic gesture sampler and angle vocabulary, but only
 * copies unclaimed arm channels from it. No legacy idle oscillation is stacked. */
export function sampleCoherentActing(character:Character,input:ActingContext,base:JointPose,authority:ActingAuthority){
 const p=resolvePersonality(character.personality),frame=coherentFrame(character,p,input,authority);
 const gesture=frame.gestureFree&&frame.state!=='transition'?gestureAt(character,input):rest;
 const gestured=gesture.weight>0?livingPose(character,input,base,gesture):base;
 return {pose:applyCoherentPose(base,p,input,frame,gesture,gestured),gesture,frame};
}
