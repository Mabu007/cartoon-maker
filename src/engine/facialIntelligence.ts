/**
 * SIRVIBE Facial Acting Intelligence (v1).
 *
 * A continuous, rig-neutral facial action vocabulary. Expression presets are
 * *directions*, not frame-based sprites. This module is pure: previews, reverse
 * timeline scrubbing, and exports produce identical facial controls.
 */
import type { Expression, Character } from './schema.ts';
import { clamp, mix } from './animation.ts';
import { resolvePersonality } from './livingCharacter.ts';

export type FacialControls = {
  browLeft: number; browRight: number;
  browTiltLeft: number; browTiltRight: number;
  eyeNarrowLeft: number; eyeNarrowRight: number;
  eyeWideLeft: number; eyeWideRight: number;
  cheekLeft: number; cheekRight: number;
  smileLeft: number; smileRight: number;
  frownLeft: number; frownRight: number;
  lipPress: number; lipRound: number;
  jawTension: number; noseWrinkle: number;
};
export const neutralFacialControls: Readonly<FacialControls> = Object.freeze({
  browLeft:0,browRight:0,browTiltLeft:0,browTiltRight:0,
  eyeNarrowLeft:0,eyeNarrowRight:0,eyeWideLeft:0,eyeWideRight:0,
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
  personality?:Character['personality'], intensity=1
):FacialControls {
  const traits=resolvePersonality(personality);
  const expressiveness=traits.expressiveness/100;
  const nervousness=traits.nervousness/100;
  const strength=clamp(intensity,0,1.5)*mix(.78,1.15,expressiveness);
  const face=facialExpressionControls(expression,strength);
  if(traits.autoActing==='off')return facialExpressionControls(expression,clamp(intensity,0,1.5));
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
