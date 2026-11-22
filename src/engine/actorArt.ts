import { propArm, propPlacement, type PropPose } from './propMotion.ts';
import { bodyProportions } from './bodyBuild.ts';
import { gaitProfiles, isSleep, type GaitStyle } from './performanceCatalog.ts';
import { Graphics, type Container } from 'pixi.js';
import { armIK, gaitLeg, mix, rig, seatedLeg, viewForward, type Point } from './animation.ts';
import { ellipse, INK, line, rect, segment } from './art.ts';
import { drawIllustratedHair, drawIllustratedHand, shade, type HandPose } from './illustration.ts';
import { facialPerformance, type FacialPerformance } from './facialAnimation.ts';
import { at, drawBag, drawHandheld, drawShoe, drawTop, drawWatch, sleeveCoverage, vector, type CostumeTexture } from './wardrobeArt.ts';
import { drawBeard, drawCatalogHair, drawEar, drawExtra, drawEye, drawEyewear, drawHat, drawNose, drawPiercing, headMetrics, headOutline, resetEyeLayers } from './headCatalogArt.ts';
import { drawExpressionMouth, hideExpressionMouth } from './mouthArt.ts';
import { performanceHandPose } from './handPerformance.ts';
import { gestureAt, gestureHand } from './livingCharacter.ts';
import { handRotation } from './handRig.ts';
import type { Viseme } from './visemes.ts';
import type { Action, Character, Expression, JointPose, Prop, View } from './schema.ts';

export const viewArt: Record<View, { width: number; face: number; far: boolean; rear: boolean; profile: boolean }> = {
  front: { width: 1, face: 0, far: true, rear: false, profile: false },
  'three-quarter': { width: .88, face: 12, far: true, rear: false, profile: false },
  side: { width: .57, face: 20, far: false, rear: false, profile: true },
  'back-quarter': { width: .81, face: -15, far: false, rear: true, profile: false },
  back: { width: 1, face: 0, far: false, rear: true, profile: false }
};
function stroke(g: Graphics, joints: Point[], width: number, color: string) {
  line(g, joints, INK, width + 4.5);
  line(g, joints, color, width);
}
/** Identical arm IK used to draw the gripping hand; shared with attached image props. */
export function heldGripPoint(character:Character,view:View,pose:JointPose):Point {
  const art=viewArt[view];
  const [,hand]=propArm(character,rig(character,pose,art.width),'right',{action:'idle',time:0,weight:1},true,art.rear);
  return {x:hand.x+7,y:hand.y+9};
}
export function heldPropPose(character:Character, view:View, pose:JointPose, prop:Prop, action:PropPose) {
  const art=viewArt[view];
  return propPlacement(character,rig(character,pose,art.width),action,prop,art.rear);
}
export function drawActor(g:Graphics,face:Container,c:Character, view: View, pose: JointPose, expression: Expression, amplitude: number, held?: Prop, time = 0, action: Action = 'idle', actorId = c.id, speaking = false,
  viseme?: { shape: Viseme; weight: number }, focus?: { x: number; y: number },
  locomotion: Action = action, lift = 0, gaitTime = time, velocity?: number, forward = viewForward(view),
  actionTime = time, gaitWeight=1, listening=false, turnScale=1,
  appearance?:{texture?:CostumeTexture;camera?:boolean;art?:Graphics;gaitStyle?:GaitStyle;gestureArt?:Graphics;actionWeight?:number;propPose?:PropPose},
  actingPhrase?:{start:number;duration:number;text:string}) {
  const costume=appearance?.texture;
  const lookAtCamera=appearance?.camera??false;
  const art = viewArt[view];
  const r = rig(c, pose, art.width);
  const limbWidth = 10 * c.thickness;
  const build=bodyProportions(c);
  const bodyArt=g;
  const crying=action==='cry'&&!art.rear;
  const freeHand=(side:'left'|'right')=>!(held&&side==='right')&&
    !(c.wardrobe?.handheld&&c.wardrobe.handheld!=='none'&&(c.wardrobe.hand??'right')===side);
  const cryHand=(side:'left'|'right')=>crying&&freeHand(side);
  const arm = (side: 'left' | 'right', carrying = false, g:Graphics=bodyArt) => {
    const joint = r[side];
    const propPose=appearance?.propPose??{action,time:actionTime,weight:appearance?.actionWeight??1};
    let [elbow, hand]=propArm(c,r,side,propPose,carrying,art.rear);
    const reachesFace=cryHand(side);
    if(reachesFace){
      const sign=side==='right'?1:-1, weight=appearance?.actionWeight??1;
      const eyeX=r.head.x+(art.profile?15:art.face*.38+sign*12)*c.head;
      const rub=Math.sin(actionTime*17+sign*.5)*2.5;
      [elbow,hand]=armIK(joint.shoulder,{ x:mix(hand.x,eyeX+sign*1.6,weight),
        y:mix(hand.y,r.head.y+(-3+rub)*c.head,weight) },28*c.arms,28*c.arms,sign);
    }
    const coverage=sleeveCoverage(c);
    const upper=coverage<=1;
    const cuffStart=upper?joint.shoulder:elbow, cuffEnd=upper?elbow:hand;
    const cover=upper?coverage:coverage-1;
    const cuff={x:cuffStart.x+(cuffEnd.x-cuffStart.x)*cover,y:cuffStart.y+(cuffEnd.y-cuffStart.y)*cover};
    if(build.arm===1)stroke(g,[joint.shoulder,elbow,hand],limbWidth,c.skin);
    else{
      stroke(g,[joint.shoulder,elbow],limbWidth*build.arm,c.skin);
      stroke(g,[elbow,hand],limbWidth*(.63+.37*build.arm),c.skin);
      if(build.arm>1)segment(g,(joint.shoulder.x+elbow.x)/2,(joint.shoulder.y+elbow.y)/2,elbow.x,elbow.y,shade(c.skin,-.18),1.2);
    }
    if(coverage>0) {
      stroke(g,upper?[joint.shoulder,cuff]:[joint.shoulder,elbow,cuff],limbWidth*build.arm+4,c.shirt);
      segment(g,cuff.x-3,cuff.y,cuff.x+3,cuff.y+1,c.wardrobe?.trim??shade(c.shirt,-.27),1.45);
    }
    const costumeHand = c.wardrobe?.hand ?? 'right';
    const holdsCostume = side===costumeHand && !carrying && Boolean(c.wardrobe?.handheld && c.wardrobe.handheld!=='none');
    const handMode:HandPose = performanceHandPose({
      action,locomotion,side,carrying:carrying||holdsCostume||(action==='drive'&&!!held),time,expression,
      speechWeight:speaking?(viseme?.weight??(action==='talk'?.55:0)):0,
      character:c,actorId,speaking,listening,phrase:actingPhrase
    });
    if(side===costumeHand && !carrying && !holdsCostume) drawBag(g,c,art,r.neck,r.hip,hand,costume);
    if(holdsCostume) drawHandheld(g,c,hand);
    const forearm=Math.atan2(hand.y-elbow.y,hand.x-elbow.x);
    const wristDegrees=pose[side+'Wrist' as keyof JointPose]??0;
    // A pointing index, waving palm and resting fingers all extend away from the cuff.
    const rotation=handRotation(forearm,wristDegrees,handMode);
    const facing=art.profile?1:(side==='right'?1:-1)*(art.rear?-1:1);
    g.context.save().setTransform(at(hand.x,hand.y,art.profile&&handMode==='relaxed'?.73:1,1,rotation*180/Math.PI));
    const gestureContext={time,actorId,action,locomotion,expression,speaking,
      speechWeight:speaking?(viseme?.weight??(action==='talk'?.55:0)):0,listening,carrying:carrying||holdsCostume,phrase:actingPhrase};
    const naturalHand=gestureHand(c,gestureContext,side);
    const blendHand=naturalHand===handMode?gestureAt(c,gestureContext).weight:1;
    drawIllustratedHand(g,0,0,limbWidth*(art.profile&&side==='left'?.78:.91),c.skin,handMode,facing<0?-1:1,blendHand);
    g.context.restore();
    const watchSide=c.wardrobe?.watchSide??costumeHand;
    if(watchSide==='both'||side===watchSide)drawWatch(g,c,hand,elbow);
  };
  const leg = (side: 'left' | 'right') => {
    const joint = r[side];
    let knee = joint.knee, foot = joint.foot;
    const moving = locomotion === 'walk' || locomotion === 'run';
    if (moving) {
      const [walkingKnee,walkingFoot]=gaitLeg(joint.upper,c.legs*c.height,gaitTime,
        locomotion,side,forward,lift,velocity,gaitProfiles[appearance?.gaitStyle??'natural'].lift);
      knee={x:joint.knee.x+(walkingKnee.x-joint.knee.x)*gaitWeight,
        y:joint.knee.y+(walkingKnee.y-joint.knee.y)*gaitWeight};
      foot={x:joint.foot.x+(walkingFoot.x-joint.foot.x)*gaitWeight,
        y:joint.foot.y+(walkingFoot.y-joint.foot.y)*gaitWeight};
    }
    // Sit and Stand transfer the torso over feet planted at actor-floor y=0.
    if(!moving&&(action==='sit'||action==='stand')){
      [knee,foot]=seatedLeg(joint.upper,c.legs*c.height,lift,side);
    }
    const bottom=c.wardrobe?.bottoms??(c.outfit==='athleisure'?'leggings':'straight');
    const swim=c.outfit==='bikini';
    const shorts=bottom==='shorts'||bottom==='biker-shorts';
    const width={straight:11,cargo:16,joggers:13,shorts:15,'wide-leg':17,'skinny-jeans':8,skirt:10,'cargo-joggers':15,leggings:8,'biker-shorts':10}[bottom]*c.thickness*build.leg;
    if(swim||shorts||bottom==='skirt') {
      stroke(g,[joint.upper,knee,foot],limbWidth*.82*build.leg,c.skin);
      if(shorts&&!swim)stroke(g,[joint.upper,{x:(joint.upper.x+knee.x)/2,y:(joint.upper.y+knee.y)/2}],width,c.pants);
    } else {
      stroke(g,[joint.upper,knee,foot],width,c.pants);
      if(build.calves>1)stroke(g,[knee,{x:(knee.x+foot.x)/2,y:(knee.y+foot.y)/2}],width*build.calves,c.pants);
      if(bottom==='joggers'||bottom==='cargo-joggers')segment(g,knee.x,knee.y,foot.x,foot.y,c.wardrobe?.trim??shade(c.pants,.22),1.4);
      if(bottom==='cargo'||bottom==='cargo-joggers')rect(g,(joint.upper.x+knee.x)/2-5,(joint.upper.y+knee.y)/2-3,10,9,shade(c.pants,.13),2,1);
      if(bottom==='skinny-jeans'||bottom==='leggings')segment(g,foot.x-3,foot.y-5,foot.x+3,foot.y-5,shade(c.pants,.28),1.4);
    }
    const toe=moving||art.profile||(view!=='front'&&view!=='back')?Math.sign(forward):(side==='left'?-1:1);
    drawShoe(g,c,foot,toe,costume,view==='back');
  };
  leg(art.rear?'right':'left'); leg(art.rear?'left':'right');
  if(!cryHand(art.rear?'right':'left'))arm(art.rear?'right':'left',art.rear&&!!held);
  if(c.outfit!=='bikini'&&c.wardrobe?.bottoms==='skirt' && !['slip-dress','sundress'].includes(c.outfit)) {
    const x=r.hip.x, y=r.hip.y, width=18*art.width*c.thickness*build.hip;
    const hem=24+(c.wardrobe.hem??0)*12;
    vector(g,`M ${x-width} ${y-5}H${x+width}L${x+width*1.29} ${y+hem}Q${x} ${y+hem+7} ${x-width*1.29} ${y+hem}Z`,c.pants,INK,2.1);
    for(const offset of [-.57,0,.57]) segment(g,x+offset*width,y+2,x+offset*width*1.15,y+hem,shade(c.pants,-.28),1.1);
  }
  drawTop(g,c,art,r.neck,r.hip,costume);
  drawExtra(g,c,art,0,0,'torso',r.neck.x,r.neck.y+6);
  drawBag(g,c,art,r.neck,r.hip,undefined,costume);
  if(!cryHand(art.rear?'left':'right'))arm(art.rear?'left':'right',!art.rear&&!!held);
  if(cryHand('left'))arm('left',false,appearance?.gestureArt??g);
  if(cryHand('right'))arm('right',false,appearance?.gestureArt??g);
  face.position.set(r.head.x, r.head.y);
  face.angle = r.angle + (listening ? Math.sin(time*2.4+actorId.length*.7)*1.4 : 0);
  face.scale.set(c.head*turnScale,c.head);
  // Never add synthetic random jaw motion over audio-aligned silence.
  const mood = facialPerformance(time, actorId, action, expression, amplitude, viseme, focus, c.personality);
  if(isSleep(action)&&!speaking){
    const p=actionTime*.54%1;
    const x=r.head.x+27+p*16, y=r.head.y-54-p*34, size=4+p*4;
    line(g,[{x:x-size,y:y-size},{x:x+size,y:y-size},{x:x-size,y:y+size},{x:x+size,y:y+size}],'#e2d3ef',2.2);
  }
  if (action === 'blink' && actionTime < .22) mood.blink = Math.max(mood.blink, 1 - Math.abs(actionTime - .11) / .11);
  const headView = lookAtCamera && (art.profile || art.rear)
    ? view === 'back' ? 'back' : 'three-quarter' : view;
  const facialArt=appearance?.art??(face instanceof Graphics?face:undefined);
  if(facialArt)drawFace(face,facialArt,c,headView,mood,lookAtCamera,action==='cry'?actionTime:undefined);
}
function drawFace(face:Container,g:Graphics,c:Character,view:View,mood:FacialPerformance,camera:boolean,cryTime?:number) {
  const art=viewArt[view], {rear,profile}=art;
  const layers=resetEyeLayers(face);
  const {w,h}=headMetrics(c,art), q=c.wardrobe;
  const yScale=h/45;
  const ears=profile?[-w*.47]:[-w+3,w-3];
  if(!profile)drawEar(g,c,ears[1],8*yScale,-1);
  vector(g,headOutline(c,art),c.skin,INK,3.5);
  vector(g,`M ${-w*.81} 5 Q ${-w*.85} ${h*.63} ${-w*.32} ${h*.77} Q ${-w*.57} ${h*.55} ${-w*.81} 5Z`,shade(c.skin,-.10),INK,0);
  const openHat=['none','visor','sun-visor','fascinator'].includes(c.hat);
  if(openHat) {
    if(!drawCatalogHair(g,c,art,w,h))drawIllustratedHair(g,c,art,w,h);
  } else if(['bob','hime','mullet','ponytail','waves','wolf-cut','braids','locs','curtain-bangs'].includes(c.hair)) {
    if(!drawCatalogHair(g,c,art,w,h*.83))drawIllustratedHair(g,c,art,w,h*.83);
  }
  drawEar(g,c,ears[0],8*yScale,1);
  drawHat(g,c,art,w,h);
  if(rear) {
    hideExpressionMouth(face);
    drawPiercing(g,c,art,ears,0);
    drawExtra(g,c,art,w,h,'head');
    return;
  }
  const center=profile?w*.62:art.face*w/42;
  const facialOffset=q?.facialOffset??0;
  const spacing=Math.min(w*.35,13*c.eyeSpacing);
  const eyes=profile?[center+facialOffset]:[center-spacing+facialOffset,Math.min(w-8,center+spacing*(art.face?.81:1)-facialOffset)];
  const eyeY=-5*yScale;
  eyes.forEach((x,i)=>drawEye(g,layers.eyes[i],c,mood,x,eyeY,i?1:-1,Boolean(i&&art.face),camera,art.face));
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
  const noseX=profile?w*.94:center;
  drawNose(g,c,art,noseX);
  const mouthX=profile?w*.65:center;
  drawBeard(g,c,art,mouthX,w,h);
  drawPiercing(g,c,art,ears,profile?mouthX:noseX);
  drawExtra(g,c,art,w,h,'head');
  if(q?.extra==='mask') hideExpressionMouth(face);
  else drawExpressionMouth(face,c,mood,mouthX,view);
}
