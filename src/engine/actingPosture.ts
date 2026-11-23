/**
 * Upper-body acting direction for scenes where the character is otherwise
 * standing, talking or listening. Never changes actor roots, legs, foot
 * contact, held props, or explicit gestures/motion capture.
 *
 * Emotion alone is not an action: these are small direction-specific offsets
 * applied over the established pose, with authored animation always winning.
 */
import { clamp } from './animation.ts';
import type { ActingIntent, JointPose } from './schema.ts';

type UpperPose = Pick<JointPose,'head'|'neck'|'torso'|'leftShoulder'|'rightShoulder'>;
const directions:Record<ActingIntent,UpperPose> = {
  none:{},
  suspicious:{head:8,neck:-3,torso:3,leftShoulder:3,rightShoulder:-3},
  skeptical:{head:-8,neck:4,torso:-3,leftShoulder:-2,rightShoulder:2},
  'forced-smile':{head:-3,neck:2,torso:-2,leftShoulder:4,rightShoulder:5},
  'suppress-laugh':{head:5,neck:2,torso:4,leftShoulder:6,rightShoulder:6},
  'hide-anger':{head:-3,neck:-2,torso:4,leftShoulder:7,rightShoulder:8},
  'holding-back-tears':{head:8,neck:5,torso:5,leftShoulder:7,rightShoulder:8},
  'awkward-silence':{head:7,neck:3,torso:-2,leftShoulder:6,rightShoulder:5},
  'silent-judgment':{head:-9,neck:3,torso:-4,leftShoulder:-5,rightShoulder:-3},
  'dramatic-realization':{head:-10,neck:-4,torso:-5,leftShoulder:-7,rightShoulder:9},
  sarcastic:{head:-8,neck:3,torso:-5,leftShoulder:-4,rightShoulder:1},
  embarrassed:{head:12,neck:5,torso:6,leftShoulder:8,rightShoulder:7},
  intimidate:{head:-5,neck:-3,torso:6,leftShoulder:-9,rightShoulder:-8},
  reassure:{head:4,neck:2,torso:3,leftShoulder:-5,rightShoulder:-4},
  'lying-nervously':{head:9,neck:4,torso:-3,leftShoulder:7,rightShoulder:5},
  disbelieving:{head:-8,neck:-3,torso:-5,leftShoulder:-3,rightShoulder:2},
  curious:{head:7,neck:2,torso:5,leftShoulder:1,rightShoulder:1},
  'excited-announcement':{head:-6,neck:-2,torso:6,leftShoulder:-8,rightShoulder:-7},
  'quiet-disappointment':{head:12,neck:5,torso:6,leftShoulder:7,rightShoulder:7},
  'confident-explanation':{head:-2,neck:-1,torso:-4,leftShoulder:-5,rightShoulder:-5},
  uncomfortable:{head:7,neck:3,torso:5,leftShoulder:5,rightShoulder:7}
};
/** Stable, non-destructive direction offset; animation layers retain authority. */
export function directedActingPosture(base:JointPose, intent:ActingIntent, intensity=1):JointPose {
  const direction=directions[intent];
  if(!direction||intensity<=0)return base;
  const weight=clamp(Number.isFinite(intensity)?intensity:0,0,1.5);
  const pose:JointPose={...base};
  for(const joint of ['head','neck','torso','leftShoulder','rightShoulder'] as const){
    const amount=direction[joint];
    if(amount===undefined)continue;
    const limit=joint==='head'?35:joint==='neck'?30:joint==='torso'?40:165;
    pose[joint]=clamp((base[joint]??0)+amount*weight,-limit,limit);
  }
  return pose;
}
