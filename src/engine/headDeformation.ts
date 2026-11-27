import {clamp} from './animation.ts';
import type {Character,View} from './schema.ts';

export const headAuditionLimits={yaw:20,pitch:10,roll:15} as const;
export type HeadAudition={yaw:number;pitch:number;roll:number};
export type HeadDeformation=Readonly<{yaw:number;pitch:number}>;
const customHeadSlots=new Set(['head-base','head-accessory']);

export function supportsHeadDeformation(character:Character,view:View){
  const art=character.visual;
  return (view==='front'||view==='three-quarter')&&art?.primaryArt==='pose-v1'
    &&!art.components?.some(part=>customHeadSlots.has(part.slot))
    &&!art.vectorComponents?.some(part=>customHeadSlots.has(part.slot));
}

export function sampleHeadDeformation(character:Character,view:View,capturedYaw?:number,audition?:HeadAudition):HeadDeformation|undefined{
  if(!supportsHeadDeformation(character,view)||(capturedYaw===undefined&&!audition&&!character.visual?.headRig))return;
  // Capture yaw is the existing normalized nose estimate, with positive
  // values describing a turn toward the character's local left.
  const yaw=audition?.yaw??(capturedYaw===undefined?(view==='three-quarter'?12:0):-headAuditionLimits.yaw*capturedYaw);
  const pitch=audition?.pitch??0;
  return {yaw:clamp(yaw/headAuditionLimits.yaw,-1,1),pitch:clamp(pitch/headAuditionLimits.pitch,-1,1)};
}
