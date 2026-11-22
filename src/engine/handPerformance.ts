import type { Action, Expression } from './schema.ts';
import type { HandPose } from './illustration.ts';

export type HandPerformanceInput = {
  action:Action;locomotion:Action;side:'left'|'right';carrying:boolean;
  time:number;expression:Expression;speechWeight:number;
};
/** Frame-independent hand acting. Deliberate gestures override conversational
 * beats; the prop grip cannot be interrupted by voice or emotion.
 */
export function performanceHandPose(input:HandPerformanceInput):HandPose {
  const {action,locomotion,side,carrying,time,expression,speechWeight}=input;
  if(carrying)return 'grip';
  if(action==='throw-prop'&&side==='right')return 'open';
  if(action==='cry'||action==='reach'||action==='surprise'||action==='cartoon-block')return 'open';
  if(['cartoon-guard','cartoon-jab','cartoon-hook','cartoon-kick'].includes(action))return 'fist';
  if(action==='point' && side==='right')return 'point';
  if(['wave','celebrate','open-hand','shrug'].includes(action))return 'open';
  if(action==='fist'||action==='angry'||expression==='angry')return 'fist';
  if(action==='hand-to-face'&&side==='right')return 'open';
  if(['hand-on-hip','hand-to-pocket'].includes(action)&&side==='right')return 'fist';
  if(speechWeight>.12) {
    // Slow, staggered beats, not jitter on each audio frame.
    const beat=Math.floor(Math.max(0,time)*1.6+.15);
    if(side==='right')return (['open','open','relaxed','point','open','relaxed'] as const)[beat%6];
    return (['relaxed','open','relaxed','relaxed','open','relaxed'] as const)[beat%6];
  }
  if(locomotion==='run')return 'fist';
  if(locomotion==='walk')return side==='right'?'relaxed':'fist';
  if(action==='listen'||action==='think')return 'relaxed';
  return 'relaxed';
}
