import { clamp, rig, type Point } from './animation.ts';
import type { ActorData, Character, JointPose } from './schema.ts';

type PosedActor = Pick<ActorData,'x'|'y'|'scale'|'rotation'|'flip'> & { pose: JointPose; lift: number };

export function eyeWorldPoint(actor: PosedActor,character: Character): Point {
  const head=rig(character,actor.pose,1).head;
  return actorWorldPoint(actor,{x:head.x,y:head.y-5*character.head});
}

export function actorWorldPoint(actor:PosedActor,point:Point):Point {
  const x=point.x*actor.scale*(actor.flip?-1:1), y=(point.y-actor.lift)*actor.scale;
  const radians=actor.rotation*Math.PI/180, cos=Math.cos(radians), sin=Math.sin(radians);
  return {x:actor.x+x*cos-y*sin,y:actor.y+x*sin+y*cos};
}

/** Creator-facing gaze sliders override the preview, otherwise use the
 * captured/evaluated gaze. Undefined does not mean look straight ahead. */
export function resolvePreviewFocus(
  characterPreview:boolean,previewFocus:{x:number;y:number}|undefined,
  evaluatedFocus:{x:number;y:number}|undefined
) {
  return characterPreview&&previewFocus!==undefined?previewFocus:evaluatedFocus;
}

export function aimEyes(eye:Point,target:Point,directionFlip:boolean,angle:number,scale:number) {
  const dx=target.x-eye.x,dy=target.y-eye.y;
  const radians=-angle*Math.PI/180, cos=Math.cos(radians), sin=Math.sin(radians);
  const x=(dx*cos-dy*sin)*(directionFlip?-1:1),y=dx*sin+dy*cos;
  const depth=Math.max(42*scale,Math.hypot(x,y)*.62);
  return {x:clamp(x/depth,-1,1),y:clamp(y/depth,-1,1)};
}
