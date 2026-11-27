import type {CoherentActingFrame} from './coherentActing.ts';
import {coupledLimbOffset} from './characterDynamics.ts';
import {deformCheekOutline} from './secondarySurface.ts';
import type {SecondaryOffsets} from './characterDynamics.ts';
import {deformGarmentPanels} from './garmentGeometry.ts';
import {dynamicHairPaths} from './layeredHair.ts';
import type {SurfaceFill} from './vvleRender.ts';
import {classifyArtworkPose} from './primaryArtworkPose.ts';
import type {ResolvedArtworkPose} from './resolvedArtworkPose.ts';
import {garmentEnabled,garmentTorso,garmentSleeve,garmentLeg,garmentSkirt,garmentFoot} from './garmentGeometry.ts';
import {drawGarmentPaths} from './garmentRender.ts';
import {nativePartFor,boneDrawList} from './nativeVectorBone.ts';
import {buildLayeredHair,hasLayeredHair,hairRenderPaths} from './layeredHair.ts';
import {deformFaceLandmarks,faceLandmarks} from './faceIdentityGeometry.ts';
import type {NativeBonePathCache} from './vectorArtworkRender.ts';
import { drawComponent, drawBoneComponent, componentFor } from './hybridArtwork.ts';
import {drawStudioLimb,drawAnatomicalLimb} from './studioLimbArt.ts';
import { propArm, type PropPose } from './propMotion.ts';
import { bodyProportions } from './bodyBuild.ts';
import { gaitProfiles, isSleep, type GaitStyle } from './performanceCatalog.ts';
import { Graphics, type Container } from 'pixi.js';
import { armIK, gaitLeg, mix, rig, seatedLeg, viewForward, type Point } from './animation.ts';
import { ellipse, INK, line, rect, segment } from './art.ts';
import { drawIllustratedHair, drawIllustratedHand, shade } from './illustration.ts';
import type {FacialPerformance} from './facialAnimation.ts';
import type {FacialControls} from './facialIntelligence.ts';
import { at, drawBag, drawHandheld, drawShoe, drawTop, drawWatch, sleeveCoverage, vector, type CostumeTexture } from './wardrobeArt.ts';
import { drawBeard, drawCatalogHair, drawEar, drawExtra, drawEye, drawFaceDetails, drawEyewear, drawHat, drawNose, drawPiercing, headMetrics, headOutline, resetEyeLayers } from './headCatalogArt.ts';
import { drawExpressionMouth, hideExpressionMouth } from './mouthArt.ts';
import type { GestureSample } from './livingCharacter.ts';
import type { ThumbPair } from './thumbIntelligence.ts';
import type { FingerCurls, CapturedContact } from './performanceHandIntelligence.ts';
import type {ArmTargets,ArmBends,ArmDepths,ArmSide} from './performanceArmIntelligence.ts';
import type {HandPose} from './handRig.ts';
import type { Viseme } from './visemes.ts';
import type { ActingIntent, EmotionSpace, Action, Character, Expression, JointPose, Prop, View, PerformanceFacing } from './schema.ts';

export {viewArt} from './visualFrame.ts';
import type {HeadAudition,HeadDeformation} from './headDeformation.ts';
import {viewArt,resolveVisualFrame,snapshotResolvedArtworkPose,type VisualFrame} from './visualFrame.ts';
function classicStroke(g: Graphics, joints: Point[], width: number, color: string) {
  line(g, joints, INK, width + 4.5);
  line(g, joints, color, width);
}
/** Identical arm IK used to draw the gripping hand; shared with attached image props. */
export function heldGripPoint(character:Character,view:View,pose:JointPose,side:'left'|'right'='right'):Point {
  const art=viewArt[view];
  const [,hand]=propArm(character,rig(character,pose,art.width),side,{action:'idle',time:0,weight:1},true,art.rear);
  return {x:hand.x+7,y:hand.y+9};
}
export function drawActor(g:Graphics,face:Container,c:Character, view: View, pose: JointPose, expression: Expression, amplitude: number, held?: Prop, time = 0, action: Action = 'idle', actorId = c.id, speaking = false,
  viseme?: { shape: Viseme; weight: number }, focus?: { x: number; y: number },
  locomotion: Action = action, lift = 0, gaitTime = time, velocity?: number, forward = viewForward(view),
  actionTime = time, gaitWeight=1, listening=false, turnScale=1,
  appearance?:{behavior?:CoherentActingFrame;secondary?:SecondaryOffsets;surface?:SurfaceFill;onResolvedArtworkPose?:(frame:ResolvedArtworkPose)=>void;rearHairArt?:Graphics;mirrored?:boolean;vectorCache?:NativeBonePathCache;texture?:CostumeTexture;camera?:boolean;art?:Graphics;gaitStyle?:GaitStyle;gestureArt?:Graphics;actionWeight?:number;propPose?:PropPose;expressionIntensity?:number;actingIntent?:ActingIntent;emotion?:EmotionSpace;facialCapture?:{controls:FacialControls;influence:number;tracking?:import('./trackingSelection.ts').TrackingSelection};capturedArms?:{left:boolean;right:boolean};
    capturedFingers?:{left?:FingerCurls;right?:FingerCurls;thumbs?:ThumbPair;influence:number;confidence?:{left?:number;right?:number}};
    capturedRig?:{targets:ArmTargets;bends:ArmBends;extensions?:ArmBends;depths:ArmDepths;near?:ArmSide;influence:number;confidence?:{left?:number;right?:number}};
    capturedHeadFacing?:PerformanceFacing;capturedHeadYaw?:number;headAudition?:HeadAudition;
    capturedContact?:{type:CapturedContact;influence:number};heldItems?:{left?:Prop;right?:Prop};handOverride?:{left:HandPose;right:HandPose;from:{left:HandPose;right:HandPose};progress:number;influence:number;observed?:{left:boolean;right:boolean}}},
  handGesture?: GestureSample) {
  const costume=appearance?.texture;
  const lookAtCamera=appearance?.camera??false;
  const art = viewArt[view];
  const frame=resolveVisualFrame({c,view,pose,expression,amplitude,held,time,action,actorId,viseme,focus,locomotion,lift,gaitTime,velocity,forward,actionTime,gaitWeight,listening,turnScale,appearance,handGesture});
  const r=frame.rig;
  const limbWidth = 10 * c.thickness;
  const build=bodyProportions(c);
  const bodyArt=g;
  const legacyStroke=c.visual?.style==='illustrated'?drawStudioLimb:classicStroke;
  const garments=garmentEnabled(c);
  const anatomical=c.visual?.style==='illustrated'&&c.visual.limbArt==='anatomical-v1';
  const carryingHand=(side:ArmSide)=>frame.carrying[side];
  const mocapFront=(side:ArmSide)=>frame.capturedFront[side];
  const cryHand=(side:ArmSide)=>frame.cry[side];
  type ArmParts='all'|'upper'|'lower'|'hand';
  const arm = (side:ArmSide,carrying=false,g:Graphics=bodyArt,part:ArmParts='all') => {
    const joint=r[side];
    const costumeHand=c.wardrobe?.hand??'right';
    const holdsCostume=side===costumeHand&&!carrying&&
      Boolean(c.wardrobe?.handheld&&c.wardrobe.handheld!=='none');
    const reachesFace=cryHand(side);
    const {elbow,hand}=frame.arms[side];
    const primary=c.visual?.primaryArt==='pose-v1'?classifyArtworkPose(joint.shoulder,elbow,hand,{view,side,centerX:r.neck.x,contact:carrying||holdsCostume||reachesFace||Boolean(appearance?.capturedContact&&(appearance.capturedContact.type.endsWith(side)||['prayer','hands-on-head','guard'].includes(appearance.capturedContact.type))),confidence:appearance?.capturedRig?.confidence?.[side],expectedLength:28*c.arms}):undefined;
    const stroke=(target:Graphics,points:Point[],width:number,color:string)=>anatomical
      ?drawAnatomicalLimb(target,points,width,color,points[0]===elbow?'forearm':'upper-arm',c.visual,primary,appearance?.surface,appearance?.secondary?.body)
      :legacyStroke(target,points,width,color);
    const coverage=sleeveCoverage(c);
    const upper=coverage<=1;
    const cuffStart=upper?joint.shoulder:elbow, cuffEnd=upper?elbow:hand;
    const cover=upper?coverage:coverage-1;
    const cuff={x:cuffStart.x+(cuffEnd.x-cuffStart.x)*cover,y:cuffStart.y+(cuffEnd.y-cuffStart.y)*cover};
    const drawUpper=part==='all'||part==='upper';
    const drawLower=part==='all'||part==='lower';
    const customUpper=drawUpper&&drawBoneComponent(g,c,`upper-arm-${side}`,view,joint.shoulder,elbow,c.thickness*build.arm,costume,appearance?.vectorCache,appearance?.mirrored,primary?.kind);
    const customLower=drawLower&&drawBoneComponent(g,c,`forearm-${side}`,view,elbow,hand,c.thickness*(.63+.37*build.arm),costume,appearance?.vectorCache,appearance?.mirrored,primary?.kind);
    if(drawUpper&&drawLower&&build.arm===1&&!customUpper&&!customLower){
      stroke(g,[joint.shoulder,elbow,hand],limbWidth,c.skin);
    }else{
      if(drawUpper&&!customUpper)stroke(g,[joint.shoulder,elbow],limbWidth*build.arm,c.skin);
      if(drawLower&&!customLower)stroke(g,[elbow,hand],limbWidth*(.63+.37*build.arm),c.skin);
      if(drawUpper&&!customUpper&&build.arm>1)
        segment(g,(joint.shoulder.x+elbow.x)/2,(joint.shoulder.y+elbow.y)/2,
          elbow.x,elbow.y,shade(c.skin,-.18),1.2);
    }
    if(garments){drawGarmentPaths(g,c,garmentSleeve(c,joint.shoulder,elbow,hand,part,customUpper,customLower,appearance?.secondary?coupledLimbOffset(appearance.secondary):undefined),costume,appearance?.surface,elbow);}
    else if(coverage>0&&(customUpper||customLower)){
      if(drawUpper&&!customUpper)stroke(g,[joint.shoulder,upper?cuff:elbow],limbWidth*build.arm+4,c.shirt);
      if(drawLower&&!customLower&&!upper)stroke(g,[elbow,cuff],limbWidth*build.arm+4,c.shirt);
    }else if(coverage>0){
      if(part==='all'){
        stroke(g,upper?[joint.shoulder,cuff]:[joint.shoulder,elbow,cuff],limbWidth*build.arm+4,c.shirt);
        segment(g,cuff.x-3,cuff.y,cuff.x+3,cuff.y+1,c.wardrobe?.trim??shade(c.shirt,-.27),1.45);
      }else if(drawUpper){
        const end=upper?cuff:elbow;
        stroke(g,[joint.shoulder,end],limbWidth*build.arm+4,c.shirt);
        if(upper)segment(g,cuff.x-3,cuff.y,cuff.x+3,cuff.y+1,
          c.wardrobe?.trim??shade(c.shirt,-.27),1.45);
      }else if(drawLower&&!upper){
        stroke(g,[elbow,cuff],limbWidth*build.arm+4,c.shirt);
        segment(g,cuff.x-3,cuff.y,cuff.x+3,cuff.y+1,
          c.wardrobe?.trim??shade(c.shirt,-.27),1.45);
      }
    }
    // For MoCap we paint upper arms behind the chest, then each entire
    // forearm+hand in stable near/far order over the chest and face.
    if(part==='upper'||part==='lower')return;
    if(side===costumeHand && !carrying && !holdsCostume) drawBag(g,c,art,r.neck,r.hip,hand,costume);
    if(holdsCostume) drawHandheld(g,c,hand);
    const handFrame=frame.hands[side];
    g.context.save().setTransform(at(hand.x,hand.y,handFrame.scale.x,handFrame.scale.y,handFrame.rotationRadians*180/Math.PI));
    drawIllustratedHand(g,c.skin,handFrame.geometry);
    g.context.restore();
    const watchSide=c.wardrobe?.watchSide??costumeHand;
    if(watchSide==='both'||side===watchSide)drawWatch(g,c,hand,elbow);
  };
  const resolvedLegs=frame.legs;
  const leg = (side: 'left' | 'right') => {
    const joint = r[side];
    const resolved=resolvedLegs[side];
    const {knee,foot,moving}=resolved;
    const primary=c.visual?.primaryArt==='pose-v1'?classifyArtworkPose(joint.upper,knee,foot,{view,side,centerX:r.hip.x,seated:action==='sit',arm:false,expectedLength:38*c.legs*c.height}):undefined;
    const stroke=(target:Graphics,points:Point[],width:number,color:string)=>anatomical
      ?drawAnatomicalLimb(target,points,width,color,points[0]===knee?'calf':'thigh',c.visual,primary,appearance?.surface,appearance?.secondary?.body)
      :legacyStroke(target,points,width,color);
    const bottom=c.wardrobe?.bottoms??(c.outfit==='athleisure'?'leggings':'straight');
    const swim=c.outfit==='bikini';
    const shorts=bottom==='shorts'||bottom==='biker-shorts';
    const width={straight:11,cargo:16,joggers:13,shorts:15,'wide-leg':17,'skinny-jeans':8,skirt:10,'cargo-joggers':15,leggings:8,'biker-shorts':10}[bottom]*c.thickness*build.leg;
    const customThigh=drawBoneComponent(g,c,`thigh-${side}`,view,joint.upper,knee,c.thickness*build.leg,costume,appearance?.vectorCache,appearance?.mirrored,primary?.kind);
    const customCalf=drawBoneComponent(g,c,`calf-${side}`,view,knee,foot,c.thickness*build.leg*build.calves,costume,appearance?.vectorCache,appearance?.mirrored,primary?.kind);
    if(garments){
      if(!customThigh)stroke(g,[joint.upper,knee],limbWidth*.82*build.leg,c.skin);
      if(!customCalf)stroke(g,[knee,foot],limbWidth*.82*build.leg*build.calves,c.skin);
      drawGarmentPaths(g,c,garmentLeg(c,joint.upper,knee,foot,customThigh,customCalf,appearance?.secondary?coupledLimbOffset(appearance.secondary):undefined),costume,appearance?.surface,knee);
    }else if(customThigh||customCalf){
      const color=swim||shorts||bottom==='skirt'?c.skin:c.pants;
      if(!customThigh)stroke(g,[joint.upper,knee],width,color);
      if(!customCalf)stroke(g,[knee,foot],width*build.calves,color);
    }else if(swim||shorts||bottom==='skirt') {
      if(c.visual?.calfWidth!==undefined){stroke(g,[joint.upper,knee],limbWidth*.82*build.leg,c.skin);stroke(g,[knee,foot],limbWidth*.82*build.leg*build.calves,c.skin);}
      else stroke(g,[joint.upper,knee,foot],limbWidth*.82*build.leg,c.skin);
      if(shorts&&!swim)stroke(g,[joint.upper,{x:(joint.upper.x+knee.x)/2,y:(joint.upper.y+knee.y)/2}],width,c.pants);
    } else {
      if(c.visual?.calfWidth!==undefined){stroke(g,[joint.upper,knee],width,c.pants);stroke(g,[knee,foot],width*build.calves,c.pants);}
      else stroke(g,[joint.upper,knee,foot],width,c.pants);
      if(c.visual?.calfWidth===undefined&&build.calves>1)stroke(g,[knee,{x:(knee.x+foot.x)/2,y:(knee.y+foot.y)/2}],width*build.calves,c.pants);
      if(bottom==='joggers'||bottom==='cargo-joggers')segment(g,knee.x,knee.y,foot.x,foot.y,c.wardrobe?.trim??shade(c.pants,.22),1.4);
      if(bottom==='cargo'||bottom==='cargo-joggers')rect(g,(joint.upper.x+knee.x)/2-5,(joint.upper.y+knee.y)/2-3,10,9,shade(c.pants,.13),2,1);
      if(bottom==='skinny-jeans'||bottom==='leggings')segment(g,foot.x-3,foot.y-5,foot.x+3,foot.y-5,shade(c.pants,.28),1.4);
    }
    const toe=moving||art.profile||(view!=='front'&&view!=='back')?Math.sign(forward):(side==='left'?-1:1);
    if(drawComponent(g,c,`shoe-${side}`,view,foot.x,foot.y,0,costume,appearance?.vectorCache,appearance?.mirrored))return;
    if(garments){drawGarmentPaths(g,c,garmentFoot(c,foot,toe,art.rear),costume,appearance?.surface,foot);return;}
    const footScale=c.visual?.footSize??1;
    g.context.save().setTransform(at(foot.x*(1-footScale),foot.y*(1-footScale),footScale));
    drawShoe(g,c,foot,toe,costume,view==='back');
    g.context.restore();
  };
  leg(art.rear?'right':'left'); leg(art.rear?'left':'right');
  const rearArm=art.rear?'right':'left';
  if(!cryHand(rearArm)&&!mocapFront(rearArm))arm(rearArm,carryingHand(rearArm));
  const frontArm=art.rear?'left':'right';
  const capturedOrder=frame.capturedOrder;
  // One draw pass per captured arm below. Previously the upper arm was
  // painted into bodyArt, while the forearm and hand lived in gestureArt,
  // separated by the torso. At a crossing this created a visible hole.
  // The complete shoulder -> elbow -> wrist line and attached hand now
  // share one Graphics layer and one pair of solved endpoints.
  if(garments){const skirt=garmentSkirt(c,art,r.hip,action==='sit',[resolvedLegs.left.knee,resolvedLegs.right.knee]);const motion=appearance?.secondary;drawGarmentPaths(g,c,motion?deformGarmentPanels(skirt,r.hip.y-3,r.hip.y+28,motion.cloth,motion.body):skirt,costume,appearance?.surface,r.hip);}
  if(!garments&&c.outfit!=='bikini'&&c.wardrobe?.bottoms==='skirt' && !['slip-dress','sundress'].includes(c.outfit)) {
    const x=r.hip.x, y=r.hip.y, width=18*art.width*c.thickness*build.hip;
    const hem=24+(c.wardrobe.hem??0)*12;
    vector(g,`M ${x-width} ${y-5}H${x+width}L${x+width*1.29} ${y+hem}Q${x} ${y+hem+7} ${x-width*1.29} ${y+hem}Z`,c.pants,INK,2.1);
    for(const offset of [-.57,0,.57]) segment(g,x+offset*width,y+2,x+offset*width*1.15,y+hem,shade(c.pants,-.28),1.1);
  }
  if(!drawComponent(g,c,'top',view,r.neck.x,r.neck.y,-(pose.torso??0)-(pose.hips??0),costume,appearance?.vectorCache,appearance?.mirrored,appearance?.secondary?.native)){
    if(garments){const top=garmentTorso(c,art,r.neck,r.hip,r.left.shoulder,r.right.shoulder,action==='sit'?1:Math.min(1,Math.abs(pose.torso??0)/35));const motion=appearance?.secondary;drawGarmentPaths(g,c,motion?deformGarmentPanels(top,r.neck.y+12,r.hip.y+4,motion.cloth,motion.body):top,costume,appearance?.surface,{x:(r.neck.x+r.hip.x)/2,y:(r.neck.y+r.hip.y)/2});}
    else drawTop(g,c,art,r.neck,r.hip,costume);
  }
  drawExtra(g,c,art,0,0,'torso',r.neck.x,r.neck.y+6,appearance?.secondary?.accessories);
  drawBag(g,c,art,r.neck,r.hip,undefined,costume,appearance?.secondary?.accessories);
  if(!cryHand(frontArm)&&!mocapFront(frontArm))arm(frontArm,carryingHand(frontArm));
  for(const side of capturedOrder)
    arm(side,false,appearance?.gestureArt??g,'all');
  if(cryHand('left'))arm('left',false,appearance?.gestureArt??g);
  if(cryHand('right'))arm('right',false,appearance?.gestureArt??g);
  face.position.set(frame.head.position.x,frame.head.position.y);
  face.angle=frame.head.angle;
  face.scale.set(frame.head.scale.x,frame.head.scale.y);
  if(isSleep(action)&&!speaking){
    const p=actionTime*.54%1;
    const x=r.head.x+27+p*16, y=r.head.y-54-p*34, size=4+p*4;
    line(g,[{x:x-size,y:y-size},{x:x+size,y:y-size},{x:x-size,y:y+size},{x:x+size,y:y+size}],'#e2d3ef',2.2);
  }
  const {headView,facial:mood}=frame;
  const facialArt=appearance?.art??(face instanceof Graphics?face:undefined);
  const rearHair=appearance?.rearHairArt;
  if(rearHair){rearHair.clear();rearHair.position.set(face.position.x,face.position.y);rearHair.angle=face.angle;rearHair.scale.set(face.scale.x,face.scale.y);}
  if(facialArt)drawFace(face,facialArt,c,headView,mood,lookAtCamera,action==='cry'?actionTime:undefined,costume,rearHair,appearance?.vectorCache,frame.headMirrored,headSurface(appearance?.surface,frame.head),appearance?.secondary,frame.headDeformation);
  if(appearance?.onResolvedArtworkPose)appearance.onResolvedArtworkPose(snapshotResolvedArtworkPose(frame,{position:{x:face.x,y:face.y},angle:face.angle,scale:{x:face.scale.x,y:face.scale.y}}));
  return frame;
}
function headSurface(surface:SurfaceFill|undefined,head:VisualFrame['head']):SurfaceFill|undefined {
  if(!surface)return;
  const radians=head.angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians),mirrored=head.scale.x<0;
  return (color,material,point,angle=0,shape)=>{
    const x=point.x*head.scale.x,y=point.y*head.scale.y;
    return surface(color,material,{x:head.position.x+x*cos-y*sin,y:head.position.y+x*sin+y*cos},
      head.angle+(mirrored?-angle:angle),shape,mirrored);
  };
}
function drawFace(face:Container,g:Graphics,c:Character,view:View,mood:FacialPerformance,camera:boolean,cryTime?:number,texture?:CostumeTexture,rearHair?:Graphics,vectorCache?:NativeBonePathCache,mirrored=false,surface?:SurfaceFill,secondary?:SecondaryOffsets,deformation?:HeadDeformation) {
  const art=viewArt[view], {rear,profile}=art;
  const layers=resetEyeLayers(face);
  const {w,h}=headMetrics(c,art), q=c.wardrobe;
  const yScale=h/45;
  const corrected=deformation&&deformFaceLandmarks(c,art,deformation);
  const ears=profile?[-w*.47]:[-w+3,w-3];
  if(corrected&&deformation){
    const far=deformation.yaw<0?0:1;
    ears[far]+=far===0?corrected.farEarInset:-corrected.farEarInset;
  }
  const earY=corrected?.earY??8*yScale,backEar=deformation&&deformation.yaw<0?0:1;
  const openHat=['none','visor','sun-visor','fascinator'].includes(c.hat);
  const customHairPart=openHat?componentFor(c,'hair',view):undefined;
  const nativeHair=openHat?nativePartFor(c,'hair',view,mirrored):undefined;
  const customHairReady=Boolean(customHairPart&&texture?.(customHairPart.image)||nativeHair&&vectorCache&&boneDrawList(nativeHair));
  const layered=hasLayeredHair(c),hair=openHat&&!customHairReady?buildLayeredHair(c,art):undefined;
  if(hair)for(const item of dynamicHairPaths(hair,'background',secondary?.hair))vector(rearHair??g,item.d,item.fill==='none'?item.fill:surface?.(item.fill,'hair',{x:0,y:-20})??item.fill,item.stroke,item.strokeWidth);
  if(!profile)drawEar(g,c,ears[backEar],earY,backEar===1?-1:1);
  const customHead=drawComponent(g,c,'head-base',view,0,0,0,texture,vectorCache,mirrored);
  if(!customHead){
    const outline=headOutline(c,art,deformation);
    vector(g,secondary?.face.some(Boolean)?deformCheekOutline(outline,h,secondary.face):outline,surface?.(c.skin,'skin',{x:0,y:0})??c.skin,c.visual?.style==='illustrated'?shade(c.skin,-.48):INK,c.visual?.style==='illustrated'?1.9:3.5);
  }
  if(!customHead)vector(g,`M ${-w*.81} 5 Q ${-w*.85} ${h*.63} ${-w*.32} ${h*.77} Q ${-w*.57} ${h*.55} ${-w*.81} 5Z`,shade(c.skin,-.10),INK,0);
  if(c.visual?.style==='illustrated'&&!rear){
    const tone=shade(c.skin,-.25);
    if(!customHead){
      vector(g,`M ${-w*.62} ${-h*.48} Q ${-w*.43} ${-h*.81} ${w*.13} ${-h*.79} Q ${-w*.28} ${-h*.56} ${-w*.62} ${-h*.48}Z`,shade(c.skin,.09),INK,0);
      vector(g,`M ${w*.78} ${h*.03} Q ${w*.67} ${h*.58} ${w*.31} ${h*.8} Q ${w*.55} ${h*.33} ${w*.78} ${h*.03}Z`,shade(c.skin,-.15),INK,0);
    }
    vector(g,`M ${-w*.65} ${h*.34} Q ${-w*.48} ${h*.45} ${-w*.29} ${h*.4} M ${w*.32} ${h*.4} Q ${w*.52} ${h*.43} ${w*.7} ${h*.29}`,'none',tone,.9);
    if(c.visual.profile==='mature'||c.visual.profile==='elderly')vector(g,`M ${-w*.35} ${-h*.47} Q 0 ${-h*.51} ${w*.38} ${-h*.45} M ${-w*.35} ${-h*.38} Q 0 ${-h*.42} ${w*.38} ${-h*.36}`,'none',tone,.8);
  }
  const customHair=openHat&&drawComponent(g,c,'hair',view,0,0,0,texture,vectorCache,mirrored,secondary?.native);
  if(hair&&!customHair){
    for(const item of dynamicHairPaths(hair,'foreground',secondary?.hair))vector(g,item.d,item.fill==='none'?item.fill:surface?.(item.fill,'hair',{x:0,y:-20})??item.fill,item.stroke,item.strokeWidth);
  }else if(openHat&&!customHair&&!layered) {
    if(!drawCatalogHair(g,c,art,w,h))drawIllustratedHair(g,c,art,w,h);
  } else if(!customHair&&!layered&&['bob','hime','mullet','ponytail','waves','wolf-cut','braids','locs','curtain-bangs'].includes(c.hair)) {
    if(!drawCatalogHair(g,c,art,w,h*.83))drawIllustratedHair(g,c,art,w,h*.83);
  }
  const nearEar=1-backEar;
  drawEar(g,c,ears[nearEar],earY,nearEar===0?1:-1);
  drawHat(g,c,art,w,h);
  if(rear) {
    hideExpressionMouth(face);
    drawPiercing(g,c,art,ears,0,secondary?.earrings);
    drawExtra(g,c,art,w,h,'head');
    drawComponent(g,c,'head-accessory',view,0,0,0,texture,vectorCache,mirrored,secondary?.native);
    return;
  }
  const legacy=corrected?undefined:faceLandmarks(c,art);
  const {center,eyeY,noseX,mouthX}=corrected??legacy!;
  const eyes=corrected?corrected.eyes.map(eye=>eye.x):legacy!.eyes;
  drawFaceDetails(g,c,art);
  eyes.forEach((x,i)=>drawEye(g,layers.eyes[i],c,mood,x,corrected?.eyes[i].y??eyeY,i?1:-1,Boolean(!corrected&&i&&art.face),camera,corrected?center:art.face,corrected?.eyes[i].width));
  // Raised cheeks follow the asymmetric expression without changing face geometry.
  if(!profile&&mood.controls){
    eyes.forEach((x,i)=>{
      const lift=i?mood.controls!.cheekRight:mood.controls!.cheekLeft;
      if(lift>.05)g.ellipse(x+(i?3:-3),eyeY+12-lift*1.5,5.7,2.3+lift*.8)
        .fill({color:'#a95d5e',alpha:lift*.12});
    });
  }
  if(q?.unibrow&&eyes.length>1)segment(g,eyes[0]+7,eyeY-12+(q.browOffset??0),eyes[1]-7,eyeY-12+(q.browOffset??0),c.hairColor,2);
  if(!profile&&['happy','excited','sad'].includes(mood.expression)) {
    for(const x of eyes)g.ellipse(Math.max(-w+9,Math.min(w-9,x+(x<center?-8:8))),14,5,2.7)
      .fill({color:mood.expression==='sad'?'#956a80':'#db887b',alpha:.23});
  }
  if(cryTime!==undefined){
    eyes.forEach((x,index)=>{
      const fall=(cryTime*2.1+index*.43)%1;
      g.ellipse(x+(index?3:-3),eyeY+15+fall*25,2.3,3.9+fall*2).fill({color:'#80d8f3',alpha:1-fall*.7});
    });
  }
  drawEyewear(layers.eyewear,c,art,eyes,eyeY);
  drawNose(g,c,art,noseX,corrected?.noseY);
  drawBeard(g,c,art,mouthX,w,h);
  drawPiercing(g,c,art,ears,profile?mouthX:noseX,secondary?.earrings);
  drawExtra(g,c,art,w,h,'head');
    drawComponent(g,c,'head-accessory',view,0,0,0,texture,vectorCache,mirrored,secondary?.native);
  if(q?.extra==='mask') hideExpressionMouth(face);
  else drawExpressionMouth(face,c,mood,mouthX,view,corrected);
}
