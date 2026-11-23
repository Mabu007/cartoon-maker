/**
 * SIRVIBE Facial Acting Intelligence (v1).
 *
 * A continuous, rig-neutral facial action vocabulary. Expression presets are
 * *directions*, not frame-based sprites. This module is pure: previews, reverse
 * timeline scrubbing, and exports produce identical facial controls.
 */
import type { Expression, Character, ActingIntent, EmotionSpace } from './schema.ts';
import { clamp, mix } from './animation.ts';
import { resolvePersonality } from './livingCharacter.ts';

export type FacialControls = {
  browLeft: number; browRight: number;
  browTiltLeft: number; browTiltRight: number;
  eyeNarrowLeft: number; eyeNarrowRight: number;
  blinkLeft: number; blinkRight: number;
  eyeWideLeft: number; eyeWideRight: number;
  cheekLeft: number; cheekRight: number;
  smileLeft: number; smileRight: number;
  frownLeft: number; frownRight: number;
  lipPress: number; lipRound: number;
  jawTension: number; noseWrinkle: number;
};
export const neutralFacialControls: Readonly<FacialControls> = Object.freeze({
  browLeft:0,browRight:0,browTiltLeft:0,browTiltRight:0,
  eyeNarrowLeft:0,eyeNarrowRight:0,blinkLeft:0,blinkRight:0,eyeWideLeft:0,eyeWideRight:0,
  cheekLeft:0,cheekRight:0,smileLeft:0,smileRight:0,
  frownLeft:0,frownRight:0,lipPress:0,lipRound:0,jawTension:0,noseWrinkle:0
});
type PartialFace = Partial<FacialControls>;
const expressions:Record<Expression,PartialFace> = {
  neutral:{},
  happy:{browLeft:.14,browRight:.15,eyeNarrowLeft:.15,eyeNarrowRight:.16,cheekLeft:.72,cheekRight:.77,smileLeft:.84,smileRight:.89},
  excited:{browLeft:.68,browRight:.72,eyeWideLeft:.49,eyeWideRight:.53,cheekLeft:.72,cheekRight:.74,smileLeft:.95,smileRight:.95},
  smug:{browLeft:.39,browRight:-.17,browTiltLeft:.18,browTiltRight:-.15,eyeNarrowLeft:.35,eyeNarrowRight:.16,cheekLeft:.24,smileLeft:.75,smileRight:.30},
  confused:{browLeft:.66,browRight:-.28,browTiltLeft:-.27,browTiltRight:.31,eyeNarrowRight:.28,lipPress:.18,lipRound:.10},
  sleepy:{browLeft:-.19,browRight:-.18,eyeNarrowLeft:.64,eyeNarrowRight:.65,lipPress:.10},
  angry:{browLeft:-.69,browRight:-.74,browTiltLeft:-.55,browTiltRight:.55,eyeNarrowLeft:.48,eyeNarrowRight:.51,frownLeft:.50,frownRight:.55,lipPress:.48,jawTension:.72,noseWrinkle:.32},
  surprised:{browLeft:.93,browRight:.92,eyeWideLeft:.86,eyeWideRight:.87,lipRound:.68},
  sad:{browLeft:.48,browRight:.47,browTiltLeft:.40,browTiltRight:-.40,eyeNarrowLeft:.22,eyeNarrowRight:.23,frownLeft:.73,frownRight:.77,lipPress:.24},
  thinking:{browLeft:.35,browRight:-.13,browTiltLeft:.11,eyeNarrowLeft:.19,eyeNarrowRight:.34,lipPress:.27,lipRound:.18},
  nervous:{browLeft:.51,browRight:.63,browTiltLeft:-.14,browTiltRight:.19,eyeWideLeft:.30,eyeWideRight:.38,smileLeft:.27,smileRight:.44,lipPress:.43,jawTension:.37}
};
/** Directable acting objectives may deliberately combine contradictory facial cues.
 * This is where SIRVIBE distinguishes a forced smile from genuine happiness. */
const intentions: Record<ActingIntent,PartialFace> = {
  none:{},
  suspicious:{browLeft:.51,browRight:-.40,browTiltLeft:.28,browTiltRight:-.3,eyeNarrowLeft:.48,eyeNarrowRight:.55,lipPress:.45},
  skeptical:{browLeft:.67,browRight:-.48,eyeNarrowRight:.5,smileLeft:.14,lipPress:.24},
  'forced-smile':{browLeft:.16,browRight:.20,eyeWideLeft:.12,eyeWideRight:.15,smileLeft:.67,smileRight:.64,cheekLeft:.12,cheekRight:.08,lipPress:.34,jawTension:.26},
  'suppress-laugh':{browLeft:.20,browRight:.20,eyeNarrowLeft:.42,eyeNarrowRight:.40,cheekLeft:.7,cheekRight:.65,smileLeft:.67,smileRight:.53,lipPress:.75},
  'hide-anger':{browLeft:-.53,browRight:-.42,eyeNarrowLeft:.37,eyeNarrowRight:.34,smileLeft:.58,smileRight:.49,lipPress:.63,jawTension:.88},
  'holding-back-tears':{browLeft:.54,browRight:.56,browTiltLeft:.38,browTiltRight:-.35,eyeNarrowLeft:.28,eyeNarrowRight:.29,frownLeft:.58,frownRight:.64,lipPress:.83},
  'awkward-silence':{browLeft:.38,browRight:.55,eyeWideLeft:.26,eyeWideRight:.18,smileLeft:.23,smileRight:.38,lipPress:.62},
  'silent-judgment':{browLeft:.5,browRight:-.3,eyeNarrowLeft:.52,eyeNarrowRight:.60,lipPress:.64},
  'dramatic-realization':{browLeft:.95,browRight:.94,eyeWideLeft:.89,eyeWideRight:.89,lipRound:.82},
  sarcastic:{browLeft:.64,browRight:-.19,browTiltLeft:.38,browTiltRight:-.18,eyeNarrowLeft:.25,eyeNarrowRight:.52,smileLeft:.61,smileRight:.20},
  embarrassed:{browLeft:.56,browRight:.48,eyeNarrowLeft:.31,eyeNarrowRight:.32,smileLeft:.19,smileRight:.26,lipPress:.67,cheekLeft:.34,cheekRight:.32},
  intimidate:{browLeft:-.78,browRight:-.76,eyeNarrowLeft:.68,eyeNarrowRight:.67,lipPress:.64,jawTension:.82},
  reassure:{browLeft:.27,browRight:.28,eyeNarrowLeft:.12,eyeNarrowRight:.14,cheekLeft:.47,cheekRight:.46,smileLeft:.55,smileRight:.53},
  'lying-nervously':{browLeft:.62,browRight:.51,eyeWideLeft:.36,eyeWideRight:.25,smileLeft:.34,smileRight:.60,lipPress:.52,jawTension:.46},
  disbelieving:{browLeft:.75,browRight:-.30,eyeNarrowRight:.6,eyeWideLeft:.28,lipPress:.32,lipRound:.15},
  curious:{browLeft:.53,browRight:.67,eyeWideLeft:.18,eyeWideRight:.27,lipRound:.08},
  'excited-announcement':{browLeft:.8,browRight:.8,eyeWideLeft:.52,eyeWideRight:.54,cheekLeft:.75,cheekRight:.73,smileLeft:.97,smileRight:.94},
  'quiet-disappointment':{browLeft:.3,browRight:.30,eyeNarrowLeft:.30,eyeNarrowRight:.29,frownLeft:.62,frownRight:.61,lipPress:.30},
  'confident-explanation':{browLeft:.18,browRight:.12,eyeNarrowLeft:.11,eyeNarrowRight:.1,smileLeft:.28,smileRight:.26},
  uncomfortable:{browLeft:.48,browRight:.55,eyeWideLeft:.15,eyeWideRight:.16,smileLeft:.23,smileRight:.30,lipPress:.67,jawTension:.54}
};
const channels = Object.keys(neutralFacialControls) as (keyof FacialControls)[];
const signed = new Set<keyof FacialControls>(['browLeft','browRight','browTiltLeft','browTiltRight']);
const limit=(key:keyof FacialControls,value:number)=>clamp(value,signed.has(key)?-1:0,1);
export function blendFacialControls(a:FacialControls,b:FacialControls,weight:number):FacialControls {
  const result={...a};
  const w=clamp(Number.isFinite(weight)?weight:0,0,1.5);
  for(const channel of channels) result[channel]=limit(channel,mix(a[channel],b[channel],w));
  return result;
}
export function facialExpressionControls(expression:Expression,intensity=1):FacialControls {
  const target=expressions[expression]??{};
  const full={...neutralFacialControls,...target};
  return blendFacialControls({...neutralFacialControls},full,clamp(Number.isFinite(intensity)?intensity:1,0,1.5));
}
function hash(text:string) {
  let h=2166136261;
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return (h>>>0)/4294967296;
}
function pulse(time:number,seed:number,period:number) {
  // Sparse, smooth acting beats. No stateful randomness or frame-rate coupling.
  const phase=((time/period+seed)%1+1)%1;
  const distance=Math.abs(phase-.47);
  return distance<.1 ? Math.sin(Math.PI*(1-distance/.1))**2 : 0;
}
/** Character-aware acting controls, with a restrained asymmetric micro-beat. */
export function actingFacialControls(
  time:number, actorId:string, expression:Expression,
  personality?:Character['personality'], intensity=1, intention:ActingIntent='none'
):FacialControls {
  const traits=resolvePersonality(personality);
  const expressiveness=traits.expressiveness/100;
  const nervousness=traits.nervousness/100;
  const strength=clamp(intensity,0,1.5)*mix(.78,1.15,expressiveness);
  const face=facialExpressionControls(expression,strength);
  if(intention!=='none'){
    const direction=intentions[intention];
    for(const key of Object.keys(direction) as (keyof FacialControls)[])
      face[key]=limit(key,(direction[key]??0)*strength);
  }
  if(traits.autoActing==='off')return face;
  const subtle=traits.autoActing==='subtle'?.4:1;
  // Temperament modifies the *same* authored emotion, not just idle motion.
  // An anxious actor holds more lip tension and opens their eyes slightly more.
  if(expression==='nervous'){
    face.lipPress=clamp(face.lipPress+nervousness*.18*subtle);
    face.eyeWideLeft=clamp(face.eyeWideLeft+nervousness*.1*subtle);
    face.eyeWideRight=clamp(face.eyeWideRight+nervousness*.12*subtle);
  }
  if(expression==='smug'){
    const confidence=traits.confidence/100;
    face.smileLeft=clamp(face.smileLeft+confidence*.08*subtle);
  }
  const seed=hash(actorId);
  const t=Number.isFinite(time)?Math.max(0,time):0;
  const micro=pulse(t,seed,4.2+seed*2.3)*subtle*(.05+.075*nervousness);
  // Meaningful, tiny asymmetry only when an expression has already engaged.
  if(expression==='smug'||expression==='confused'||expression==='thinking'||expression==='nervous'){
    face.browLeft=limit('browLeft',face.browLeft+micro);
    face.eyeNarrowRight=limit('eyeNarrowRight',face.eyeNarrowRight+micro*.65);
  }
  return face;
}

/**
 * Map optional local MediaPipe Face Landmarker blendshapes to native 2D
 * controls. Never serialize raw face landmarks, camera pixels or scores
 * outside these bounded, purpose-built acting channels.
 */
export function facialFromBlendshapes(blendshapes:Record<string,number>):FacialControls {
  const value=(key:string)=>clamp(Number.isFinite(blendshapes[key])?blendshapes[key]:0);
  const brow=(side:'Left'|'Right')=>clamp(
    value('browInnerUp')*.55+value('browOuterUp'+side)-value('browDown'+side),-1,1);
  return {
    ...neutralFacialControls,
    browLeft:brow('Left'),browRight:brow('Right'),
    browTiltLeft:clamp(value('browOuterUpLeft')-value('browDownLeft'),-1,1),
    browTiltRight:clamp(value('browDownRight')-value('browOuterUpRight'),-1,1),
    eyeNarrowLeft:value('eyeSquintLeft'),eyeNarrowRight:value('eyeSquintRight'),
    eyeWideLeft:value('eyeWideLeft'),eyeWideRight:value('eyeWideRight'),
    blinkLeft:value('eyeBlinkLeft'),blinkRight:value('eyeBlinkRight'),
    cheekLeft:Math.max(value('cheekSquintLeft'),value('mouthSmileLeft')*.4),
    cheekRight:Math.max(value('cheekSquintRight'),value('mouthSmileRight')*.4),
    smileLeft:value('mouthSmileLeft'),smileRight:value('mouthSmileRight'),
    frownLeft:value('mouthFrownLeft'),frownRight:value('mouthFrownRight'),
    lipPress:Math.max(value('mouthPressLeft'),value('mouthPressRight')),
    lipRound:Math.max(value('mouthPucker'),value('mouthFunnel')*.8),
    jawTension:Math.max(value('mouthPressLeft'),value('mouthPressRight')),
    noseWrinkle:Math.max(value('noseSneerLeft'),value('noseSneerRight'))
  };
}

/** Apply continuous affect on top of directed facial acting. Explicit values
 * remain artist-controlled; no claim of inferring psychology from voice. */
export function emotionFacialControls(base:FacialControls, emotion?:EmotionSpace):FacialControls {
  if(!emotion)return base;
  const valence=clamp(emotion.valence??0,-1,1);
  const arousal=clamp(emotion.arousal??.5);
  const dominance=clamp(emotion.dominance??.5);
  const tension=clamp(emotion.tension??.2);
  const positive=Math.max(0,valence),negative=Math.max(0,-valence);
  const out={...base};
  out.smileLeft=clamp(out.smileLeft+positive*.38);
  out.smileRight=clamp(out.smileRight+positive*.4);
  out.frownLeft=clamp(out.frownLeft+negative*.36);
  out.frownRight=clamp(out.frownRight+negative*.39);
  out.browLeft=clamp(out.browLeft+(arousal-.5)*.31-(dominance-.5)*.16,-1,1);
  out.browRight=clamp(out.browRight+(arousal-.5)*.33-(dominance-.5)*.18,-1,1);
  out.eyeWideLeft=clamp(out.eyeWideLeft+Math.max(0,arousal-.5)*.28);
  out.eyeWideRight=clamp(out.eyeWideRight+Math.max(0,arousal-.5)*.30);
  out.eyeNarrowLeft=clamp(out.eyeNarrowLeft+Math.max(0,.45-arousal)*.18);
  out.eyeNarrowRight=clamp(out.eyeNarrowRight+Math.max(0,.45-arousal)*.19);
  out.lipPress=clamp(out.lipPress+tension*.38);
  out.jawTension=clamp(out.jawTension+tension*.38);
  return out;
}
