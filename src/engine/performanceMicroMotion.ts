/**
 * Add tiny, personality-shaped secondary acting to an *already authored*
 * performance. Never generates gestures, changes feet, moves the root,
 * replaces lip-sync or competes with a user's recorded arms.
 *
 * Stateless function of movie time: repeatable for scrubbing and export.
 */
import type { Character, JointPose } from './schema.ts';
import { clamp } from './animation.ts';

const seed = (id:string) => {
  let value=2166136261;
  for(let i=0;i<id.length;i++)value=Math.imul(value^id.charCodeAt(i),16777619);
  return (value>>>0)/4294967296;
};
export type MicroContext={
  time:number; speaking:boolean; listening:boolean; intensity?:number;
  authoredGesture?:boolean;
};
export function capturedMicroMotion(character:Character,base:JointPose,context:MicroContext):JointPose {
  const config=character.personality;
  if(config?.autoActing==='off')return base;
  const subtle=config?.autoActing==='subtle'?.48:1;
  const expressiveness=(config?.expressiveness??55)/100;
  const nervousness=(config?.nervousness??25)/100;
  const energy=(config?.energy??50)/100;
  const controlled=clamp(context.intensity??1,0,1);
  const amplitude=controlled*subtle*(.32+expressiveness*.68);
  if(amplitude<.001)return base;
  const phase=seed(character.id)*Math.PI*2;
  const t=Math.max(0,context.time);
  // Frequencies are slow and incommensurate, avoiding a visibly looping idle.
  const breath=Math.sin(t*2.05+phase);
  const sway=Math.sin(t*.72+phase*.62);
  const attentive=context.listening ? Math.sin(t*1.65+phase*.4)*.31 : 0;
  const speech=context.speaking ? Math.sin(t*3.15+phase*.43)*(.29+.20*energy):0;
  const out:JointPose={...base};
  out.torso=(out.torso??0)+amplitude*(breath*.34+sway*(.27+nervousness*.3));
  out.neck=(out.neck??0)+amplitude*(breath*.17+attentive*.33);
  out.head=(out.head??0)+amplitude*(speech+attentive+sway*(.35+nervousness*.32));
  // Preserve captured shoulder/elbow/wrist motion, particularly when the
  // creator has also placed a manual gesture on this interval.
  if(!context.authoredGesture){
    out.leftShoulder=(out.leftShoulder??0)+amplitude*breath*.20;
    out.rightShoulder=(out.rightShoulder??0)-amplitude*breath*.20;
  }
  return out;
}
