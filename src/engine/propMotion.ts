import { animations, armIK, clamp, ease, mix, rig, type Point } from './animation.ts';
import { propRelease } from './performanceCatalog.ts';
import type { Action, Character, JointPose, Prop } from './schema.ts';

export type PropPose = {action:Action; time:number; weight:number; target?:Point;hand?:'left'|'right'};
const cycle=(pose:PropPose)=>pose.time/animations[pose.action].duration%1;
export function propArm(character:Character, joints:ReturnType<typeof rig>, side:'left'|'right', pose:PropPose, carrying:boolean, rear=false) {
  const joint=joints[side], {head,neck,hip}=joints;
  const phase=cycle(pose), beat=Math.sin(phase*Math.PI*2);
  const raised=ease(clamp((phase-.1)/.23))*ease(clamp((.88-phase)/.22));
  let target:Point|undefined;
  switch(pose.action){
    case 'eat':case 'drink':
      if(side==='right')target={x:mix(neck.x+29,head.x+17,raised),y:mix(neck.y+25,head.y+30,raised)};
      break;
    case 'write':
      if(side==='right')target={x:neck.x+32+beat*7,y:hip.y-7+Math.sin(phase*22)*2};
      break;
    case 'read':
      target={x:neck.x+(side==='right'?19:2),y:neck.y+34};break;
    case 'phone-call':
      if(side==='right')target={x:head.x+26,y:head.y+9};break;
    case 'drive':
      target={x:neck.x+(side==='right'?37:4),y:neck.y+32+beat*(side==='right'?7:-7)};break;
    case 'pick-up':case 'put-down':
      if(side===(pose.hand??'right')&&pose.target)target=pose.target;
      break;
    case 'throw-prop':case 'cartoon-stab':break;
    default:
      if(carrying)target={x:head.x+(side==='left'?-1:1)*(rear?26:45),y:head.y+43};break;
  }
  if(!target)return [joint.elbow,joint.hand] as const;
  const weight=pose.weight;
  return armIK(joint.shoulder,{x:mix(joint.hand.x,target.x,weight),y:mix(joint.hand.y,target.y,weight)},
    28*character.arms,28*character.arms,side==='right'?1:-1);
}

export function propPlacement(character:Character, joints:ReturnType<typeof rig>, pose:PropPose, prop:Prop, rear:boolean,side:'left'|'right'='right') {
  const [,hand]=propArm(character,joints,side,pose,true,rear);
  const phase=cycle(pose);
  const scale=clamp(prop.scale,.25,2);
  if(pose.action==='drive'){
    const [,left]=propArm(character,joints,'left',pose,false,rear);
    return {x:(hand.x+left.x)/2,y:(hand.y+left.y)/2+22*scale,angle:14*Math.sin(phase*Math.PI*2),scale};
  }
  const angle=pose.action==='drink'?-28*Math.sin(Math.PI*phase)**3:pose.action==='phone-call'?-12:pose.action==='write'?-42:pose.action==='cartoon-stab'?-8:0;
  const offset:Partial<Record<Prop['kind'],Point>>={
    cup:{x:5,y:10},book:{x:0,y:4},pencil:{x:10,y:7},phone:{x:1,y:8},snack:{x:6,y:8},
    'foam-dagger':{x:15,y:10},image:{x:7,y:9},ball:{x:4,y:12}
  };
  const grip=offset[prop.kind]??{x:5,y:6};
  return {x:hand.x+grip.x*scale,y:hand.y+grip.y*scale,angle:prop.rotation+angle,scale};
}

export function transferFraction(action:Action) {
  return action==='pick-up'||action==='put-down'||action==='throw-prop'?propRelease[action]:undefined;
}

export function throwArc(from:Point,to:Point,progress:number) {
  const p=clamp(progress);
  const height=clamp(Math.abs(to.x-from.x)*.29,32,135);
  return {x:mix(from.x,to.x,p),y:mix(from.y,to.y,p)-4*height*p*(1-p)};
}
