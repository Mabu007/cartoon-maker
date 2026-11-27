/** Stage 15A: borrowed, actor-local primary geometry before paint.
 * The frame is read-only by contract, consumed synchronously, never persisted.
 * No new deformation, retargeting, or secondary simulation occurs here.
 */
import {rig,type Point} from './animation.ts';
import {coherentEnabled,type CoherentActingFrame} from './coherentActing.ts';
import {resolveArtworkArm,resolveArtworkLeg,type ArtworkPoseAuthority,type ResolvedArtworkPose,type ResolvedHandArtwork} from './resolvedArtworkPose.ts';
import {facialPerformance} from './facialAnimation.ts';
import {blendSelectedFace,type TrackingSelection} from './trackingSelection.ts';
import {neutralFacialControls,type FacialControls} from './facialIntelligence.ts';
import {handPerformance} from './handPerformance.ts';
import {morphHandGeometry,handRotation,handRotationParams,handSize,handWidthScale,sampleHandRig,sampleLayeredHandRig,applyCapturedFingerCurls,type HandPose} from './handRig.ts';
import {decideFrontArm,connectedCapturedArmOrder,type ArmSide} from './performanceArmIntelligence.ts';
import type {FingerCurls} from './performanceHandIntelligence.ts';
import type {ThumbPair} from './thumbIntelligence.ts';
import type {GestureSample} from './livingCharacter.ts';
import type {VisemeSample} from './visemes.ts';
import type {Action,ActingIntent,Character,EmotionSpace,Expression,JointPose,PerformanceFacing,Prop,View} from './schema.ts';

export const viewArt: Record<View, { width: number; face: number; far: boolean; rear: boolean; profile: boolean }> = {
  front: { width: 1, face: 0, far: true, rear: false, profile: false },
  'three-quarter': { width: .88, face: 12, far: true, rear: false, profile: false },
  side: { width: .57, face: 20, far: false, rear: false, profile: true },
  'back-quarter': { width: .81, face: -15, far: false, rear: true, profile: false },
  back: { width: 1, face: 0, far: false, rear: true, profile: false }
};

export type VisualFrameAuthority=ArtworkPoseAuthority & {
  behavior?:CoherentActingFrame; mirrored?:boolean;camera?:boolean;
  expressionIntensity?:number;actingIntent?:ActingIntent;emotion?:EmotionSpace;
  facialCapture?:{controls:FacialControls;influence:number;tracking?:TrackingSelection};
  capturedFingers?:{left?:FingerCurls;right?:FingerCurls;thumbs?:ThumbPair;influence:number;confidence?:{left?:number;right?:number}};
  capturedHeadFacing?:PerformanceFacing;capturedHeadYaw?:number;heldItems?:{left?:Prop;right?:Prop};
  handOverride?:{left:HandPose;right:HandPose;from:{left:HandPose;right:HandPose};progress:number;influence:number;observed?:{left:boolean;right:boolean}};
};
export type VisualFrameInputs={
  c:Character;view:View;pose:JointPose;expression:Expression;amplitude:number;
  held?:Prop;time:number;action:Action;actorId:string;
  viseme?:VisemeSample;focus?:Point;locomotion:Action;lift:number;gaitTime:number;
  velocity?:number;forward:number;actionTime:number;gaitWeight:number;listening:boolean;turnScale:number;
  appearance?:VisualFrameAuthority;handGesture?:GestureSample;
};
export type VisualFrame=Readonly<Omit<ResolvedArtworkPose,'hands'>> & {
  readonly hands:Readonly<Record<ArmSide,ResolvedHandArtwork>>;
  /** Existing normalized capture yaw, not degrees. No authoritative pitch channel yet. */
  readonly headYaw:number;readonly headPitch:0;
  readonly speech:Readonly<{cue?:VisemeSample;shape:VisemeSample['shape'];strength:number;mouthOpen:number}>;
  readonly attachments:Readonly<{head:ResolvedArtworkPose['head'];palms:Readonly<Record<ArmSide,ResolvedHandArtwork>>;feet:Readonly<Record<ArmSide,Point>>}>;
  readonly headMirrored:boolean;
  readonly capturedOrder:readonly ArmSide[];
  readonly carrying:Readonly<Record<ArmSide,boolean>>;
  readonly cry:Readonly<Record<ArmSide,boolean>>;
  readonly capturedFront:Readonly<Record<ArmSide,boolean>>;
};
export function resolveVisualFrame(input:VisualFrameInputs):VisualFrame{
  const {c,view,pose,expression,amplitude,held,time,action,actorId,viseme,focus,locomotion,lift,gaitTime,velocity,forward,actionTime,gaitWeight,listening,turnScale,appearance,handGesture}=input;
  const art=viewArt[view],r=rig(c,pose,art.width),lookAtCamera=appearance?.camera??false;
  const crying=action==='cry'&&!art.rear;
  // Captured hands must remain *in front* of clothing and faces whenever
  // they are raised. The old fixed back/front arm order buried one wrist
  // behind the shirt and made open-hand gestures disappear.
  const carryingHand=(side:'left'|'right')=>!!(appearance?.heldItems?.[side]??(side==='right'?held:undefined));
  const freeHand=(side:'left'|'right')=>!carryingHand(side)&&
    !(c.wardrobe?.handheld&&c.wardrobe.handheld!=='none'&&(c.wardrobe.hand??'right')===side);
  const mocapFront=(side:'left'|'right')=>Boolean(!art.rear&&freeHand(side)&&appearance?.capturedArms?.[side]);
  const cryHand=(side:'left'|'right')=>crying&&freeHand(side);

  const rearArm=art.rear?'right':'left';

  const frontArm=art.rear?'left':'right';
  const nearest=appearance?.capturedRig?.near??decideFrontArm(
    appearance?.capturedRig?.depths??{},undefined,frontArm
  );
  const capturedOrder=connectedCapturedArmOrder({
    left:mocapFront('left'),right:mocapFront('right')
  },nearest);

  const carrying={left:carryingHand('left'),right:carryingHand('right')};
  const cry={left:cryHand('left'),right:cryHand('right')};
  const capturedFront={left:mocapFront('left'),right:mocapFront('right')};
  const costumeHand=c.wardrobe?.hand??'right';
  function resolveArm(side:ArmSide){
    const occupied=carrying[side];
    const holdsCostume=side===costumeHand&&!occupied&&Boolean(c.wardrobe?.handheld&&c.wardrobe.handheld!=='none');
    return resolveArtworkArm(c,r,side,art,action,actionTime,occupied,holdsCostume,capturedFront[side],cry[side],appearance);
  }
  const arms={left:resolveArm('left'),right:resolveArm('right')};
  const legs={left:resolveArtworkLeg(c,r,'left',action,locomotion,lift,gaitTime,forward,gaitWeight,velocity,appearance),right:resolveArtworkLeg(c,r,'right',action,locomotion,lift,gaitTime,forward,gaitWeight,velocity,appearance)};
  function resolveHand(side:ArmSide):ResolvedHandArtwork{
    const {elbow,hand}=arms[side];
    const carryingHandForSide=carrying[side];
    const holdsCostume=side===costumeHand&&!carryingHandForSide&&Boolean(c.wardrobe?.handheld&&c.wardrobe.handheld!=='none');
    const carrying=carryingHandForSide;
    const performance = handPerformance({
      action, locomotion, side, carrying: carrying || holdsCostume || (action === 'drive' && !!held),
      gesture: handGesture, actionWeight: appearance?.actionWeight
    });
    const observed=!(carrying||holdsCostume)&&appearance?.handOverride?.observed?.[side]!==false
      ? appearance?.handOverride : undefined;
    const presetGeometry=observed
      ? sampleLayeredHandRig(performance.pose,performance.blend,
        observed.from[side],observed[side],observed.progress,observed.influence)
      : sampleHandRig(performance.pose,performance.blend);
    const confidence=appearance?.capturedFingers?.confidence?.[side]??1;
    const geometry=applyCapturedFingerCurls(presetGeometry,
      !carrying&&!holdsCostume?appearance?.capturedFingers?.[side]:undefined,
      (appearance?.capturedFingers?.influence??0)*confidence,
      !carrying&&!holdsCostume?appearance?.capturedFingers?.thumbs?.[side]:undefined);
    const forearm = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
    const wristDegrees = pose[`${side}Wrist`] ?? 0;
    const rotation = observed||appearance?.capturedFingers?.[side]
      ? handRotationParams(forearm,wristDegrees,geometry.params.wristBend,side)
      : handRotation(forearm,wristDegrees,performance.pose,performance.blend,side);
    const scale = handSize(c.thickness)*(appearance?.capturedFingers?.[side]?1.12:1)*(c.visual?.handSize??1);
    const width = handWidthScale(view, side, geometry.params.wristTwist);
    const handArt=morphHandGeometry(geometry,c.visual?.fingerLengths,Boolean(carrying||holdsCostume||observed||appearance?.capturedFingers?.[side]||performance.pose==='grip'||performance.pose==='pinch'));
    return {position:hand,rotationRadians:rotation,scale:{x:scale*width,y:scale},geometry:handArt,occupied:carrying||holdsCostume};
  }
  const hands={left:resolveHand('left'),right:resolveHand('right')};
  const headYaw=appearance?.capturedHeadYaw??0;
  // Use the already stabilized yaw as a subtle continuous transition,
  // while the front/three-quarter artwork supplies the three discrete poses.
  const position={x:r.head.x-headYaw*3.6*c.head,y:r.head.y};
  const angle = r.angle + (listening&&!coherentEnabled(c) ? Math.sin(time*2.4+actorId.length*.7)*1.4 : 0);
  // Three modest head poses are independent from the body facing selected
  // by the director. Mirroring the three-quarter head does not rotate the
  // whole torso or change the saved character viewpoint.
  const trackedHead=art.rear?undefined:appearance?.capturedHeadFacing;
  const scale={x:c.head*turnScale*(1-.09*Math.abs(headYaw))*(trackedHead==='left'?-1:1),y:c.head};
  // Never add synthetic random jaw motion over audio-aligned silence.
  const localFocus=trackedHead==='left'&&focus?{x:-focus.x,y:focus.y}:focus;
  const mood = facialPerformance(time, actorId, action, expression, amplitude, viseme, localFocus, c.personality,appearance?.expressionIntensity??1,appearance?.actingIntent,appearance?.emotion,appearance?.behavior);
  if(appearance?.facialCapture) mood.controls=blendSelectedFace(
    mood.controls??{...neutralFacialControls},appearance.facialCapture.controls,appearance.facialCapture.influence,appearance.facialCapture.tracking);
  if (action === 'blink' && actionTime < .22) mood.blink = Math.max(mood.blink, 1 - Math.abs(actionTime - .11) / .11);
  const headView:View = trackedHead
    ? trackedHead==='front'?'front':'three-quarter'
    : lookAtCamera && (art.profile || art.rear)
      ? view === 'back' ? 'back' : 'three-quarter' : view;

  const head={position,angle,scale};
  return {actorId,view,headView,mirrored:Boolean(appearance?.mirrored),lift,rig:r,arms,legs,head,nearArm:nearest,hands,facial:mood,action,locomotion,time,
    headYaw,headPitch:0,speech:{cue:viseme,shape:mood.viseme,strength:viseme?.weight??0,mouthOpen:mood.mouthOpen},
    attachments:{head,palms:hands,feet:{left:legs.left.foot,right:legs.right.foot}},
    headMirrored:Boolean(appearance?.mirrored)!==(trackedHead==='left'),capturedOrder,carrying,cry,capturedFront};
}
/** Only the opt-in legacy diagnostic copies data. Do not retain the live frame. */
export function snapshotResolvedArtworkPose(frame:VisualFrame,head=frame.head):ResolvedArtworkPose{
  const {actorId,view,headView,mirrored,lift,rig,arms,legs,nearArm,hands,facial,action,locomotion,time}=frame;
  return structuredClone({actorId,view,headView,mirrored,lift,rig,arms,legs,head,nearArm,hands,facial,action,locomotion,time});
}
