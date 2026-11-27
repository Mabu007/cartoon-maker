import { rig } from './animation.ts';
import { viewArt } from './actorArt.ts';
import type { Character, JointPose, View } from './schema.ts';
/** The compiler's calibration contract is a view of the existing rig, not another skeleton. */
export function visualRigAnchors(character:Character,view:View='front',pose:JointPose={}){
  const source=rig(character,pose,viewArt[view].width);
  return {
    root:{x:0,y:0},ground:{x:0,y:0},pelvis:source.hip,neck:source.neck,head:source.head,
    torso:{x:(source.hip.x+source.neck.x)/2,y:(source.hip.y+source.neck.y)/2},
    chest:source.neck,hair:source.head,top:source.neck,
    leftShoulder:source.left.shoulder,leftElbow:source.left.elbow,leftWrist:source.left.hand,leftHand:source.left.hand,
    rightShoulder:source.right.shoulder,rightElbow:source.right.elbow,rightWrist:source.right.hand,rightHand:source.right.hand,
    leftHip:source.left.upper,leftKnee:source.left.knee,leftAnkle:source.left.foot,leftFoot:source.left.foot,
    rightHip:source.right.upper,rightKnee:source.right.knee,rightAnkle:source.right.foot,rightFoot:source.right.foot
  };
}
