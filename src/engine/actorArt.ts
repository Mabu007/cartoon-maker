import type { Container, Graphics } from 'pixi.js';
import { armIK, gaitLeg, rig, viewForward, type Point } from './animation.ts';
import { ellipse, INK, line, rect, segment } from './art.ts';
import { drawIllustratedHair, drawIllustratedHand, shade, type HandPose } from './illustration.ts';
import { facialPerformance, type FacialPerformance } from './facialAnimation.ts';
import { at, drawBag, drawHandheld, drawShoe, drawTop, drawWatch, sleeveCoverage, vector, type CostumeTexture } from './wardrobeArt.ts';
import { drawBeard, drawCatalogHair, drawEar, drawExtra, drawEye, drawEyewear, drawHat, drawNose, drawPiercing, headMetrics, headOutline, resetEyeLayers } from './headCatalogArt.ts';
import { drawExpressionMouth, hideExpressionMouth } from './mouthArt.ts';
import { performanceHandPose } from './handPerformance.ts';
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
export function heldGripPoint(character: Character, view: View, pose: JointPose): Point {
  const art=viewArt[view], r=rig(character,pose,art.width);
  const [, hand]=armIK(r.right.shoulder,{x:r.head.x+(art.rear?-26:45),y:r.head.y+43},28*character.arms,28*character.arms,1);
  return {x:hand.x+7,y:hand.y+9};
}
export function drawActor(g:Graphics,face:Container,facialArt:Graphics,c:Character, view: View, pose: JointPose, expression: Expression, amplitude: number, held?: Prop, time = 0, action: Action = 'idle', actorId = c.id, speaking = false,
  viseme?: { shape: Viseme; weight: number }, focus?: { x: number; y: number },
  locomotion: Action = action, lift = 0, gaitTime = time, velocity?: number, forward = viewForward(view),
  actionTime = time, gaitWeight=1, listening=false, turnScale=1, costume?:CostumeTexture, lookAtCamera=false) {
  const art = viewArt[view];
  const r = rig(c, pose, art.width);
  const limbWidth = 10 * c.thickness;
  const arm = (side: 'left' | 'right', carrying = false) => {
    const joint = r[side];
    const [elbow, hand] = carrying ? armIK(joint.shoulder, { x: r.head.x + (art.rear ? -26 : 45), y: r.head.y + 43 }, 28 * c.arms, 28 * c.arms, 1) : [joint.elbow, joint.hand];
    const coverage=sleeveCoverage(c);
    const upper=coverage<=1;
    const cuffStart=upper?joint.shoulder:elbow, cuffEnd=upper?elbow:hand;
    const cover=upper?coverage:coverage-1;
    const cuff={x:cuffStart.x+(cuffEnd.x-cuffStart.x)*cover,y:cuffStart.y+(cuffEnd.y-cuffStart.y)*cover};
    stroke(g,[joint.shoulder,elbow,hand],limbWidth,c.skin);
    if(coverage>0) {
      stroke(g,upper?[joint.shoulder,cuff]:[joint.shoulder,elbow,cuff],limbWidth+4,c.shirt);
      segment(g,cuff.x-3,cuff.y,cuff.x+3,cuff.y+1,c.wardrobe?.trim??shade(c.shirt,-.27),1.45);
    }
    const costumeHand = c.wardrobe?.hand ?? 'right';
    const holdsCostume = side===costumeHand && !carrying && Boolean(c.wardrobe?.handheld && c.wardrobe.handheld!=='none');
    const handMode:HandPose = performanceHandPose({
      action,locomotion,side,carrying:carrying||holdsCostume,time,expression,
      speechWeight:speaking?(viseme?.weight??0):0
    });
    if(side===costumeHand && !carrying && !holdsCostume) drawBag(g,c,art,r.neck,r.hip,hand,costume);
    if(holdsCostume) drawHandheld(g,c,hand);
    const forearm=Math.atan2(hand.y-elbow.y,hand.x-elbow.x);
    const rotation=handMode==='relaxed'?forearm-Math.PI/2:handMode==='open'?forearm+Math.PI/2:0;
    const facing=art.profile?1:(side==='right'?1:-1)*(art.rear?-1:1);
    g.context.save().setTransform(at(hand.x,hand.y,art.profile&&handMode==='relaxed'?.73:1,1,rotation*180/Math.PI));
    drawIllustratedHand(g,0,0,limbWidth*(art.profile&&side==='left'?.78:.91),c.skin,handMode,facing<0?-1:1);
    g.context.restore();
    const watchSide=c.wardrobe?.watchSide??costumeHand;
    if(watchSide==='both'||side===watchSide)drawWatch(g,c,hand,elbow);
    if (carrying && held) {
      const x = hand.x + 7, y = hand.y + 9;
      if (held.kind === 'cup') {
        ellipse(g, x + 8, y - 11, 6, 5, held.color, 2);
        rect(g, x - 8, y - 17, 16, 17, held.color, 3, 2);
        ellipse(g, x, y - 16, 6, 2, '#875746');
      } else if (held.kind !== 'image') {
        rect(g, x - 8, y - 19, 16, 19, held.color, 3, 2);
      }
    }
  };
  const leg = (side: 'left' | 'right') => {
    const joint = r[side];
    let knee = joint.knee, foot = joint.foot;
    const moving = locomotion === 'walk' || locomotion === 'run';
    if (moving) {
      const [walkingKnee,walkingFoot]=gaitLeg(joint.upper,c.legs*c.height,gaitTime,
        locomotion,side,forward,lift,velocity);
      knee={x:joint.knee.x+(walkingKnee.x-joint.knee.x)*gaitWeight,
        y:joint.knee.y+(walkingKnee.y-joint.knee.y)*gaitWeight};
      foot={x:joint.foot.x+(walkingFoot.x-joint.foot.x)*gaitWeight,
        y:joint.foot.y+(walkingFoot.y-joint.foot.y)*gaitWeight};
    }
    const bottom=c.wardrobe?.bottoms??(c.outfit==='athleisure'?'leggings':'straight');
    const shorts=bottom==='shorts'||bottom==='biker-shorts';
    const width={straight:11,cargo:16,joggers:13,shorts:15,'wide-leg':17,'skinny-jeans':8,skirt:10,'cargo-joggers':15,leggings:8,'biker-shorts':10}[bottom]*c.thickness;
    if(shorts||bottom==='skirt') {
      stroke(g,[joint.upper,knee,foot],limbWidth*.82,c.skin);
      if(shorts)stroke(g,[joint.upper,{x:(joint.upper.x+knee.x)/2,y:(joint.upper.y+knee.y)/2}],width,c.pants);
    } else {
      stroke(g,[joint.upper,knee,foot],width,c.pants);
      if(bottom==='joggers'||bottom==='cargo-joggers')segment(g,knee.x,knee.y,foot.x,foot.y,c.wardrobe?.trim??shade(c.pants,.22),1.4);
      if(bottom==='cargo'||bottom==='cargo-joggers')rect(g,(joint.upper.x+knee.x)/2-5,(joint.upper.y+knee.y)/2-3,10,9,shade(c.pants,.13),2,1);
      if(bottom==='skinny-jeans'||bottom==='leggings')segment(g,foot.x-3,foot.y-5,foot.x+3,foot.y-5,shade(c.pants,.28),1.4);
    }
    const toe=moving||art.profile||(view!=='front'&&view!=='back')?Math.sign(forward):(side==='left'?-1:1);
    drawShoe(g,c,foot,toe,costume,view==='back');
  };
  leg(art.rear?'right':'left'); leg(art.rear?'left':'right');
  arm(art.rear?'right':'left',art.rear&&Boolean(held));
  if(c.wardrobe?.bottoms==='skirt' && !['slip-dress','sundress'].includes(c.outfit)) {
    const x=r.hip.x, y=r.hip.y, width=18*art.width*c.thickness;
    const hem=24+(c.wardrobe.hem??0)*12;
    vector(g,`M ${x-width} ${y-5}H${x+width}L${x+width*1.29} ${y+hem}Q${x} ${y+hem+7} ${x-width*1.29} ${y+hem}Z`,c.pants,INK,2.1);
    for(const offset of [-.57,0,.57]) segment(g,x+offset*width,y+2,x+offset*width*1.15,y+hem,shade(c.pants,-.28),1.1);
  }
  drawTop(g,c,art,r.neck,r.hip,costume);
  drawExtra(g,c,art,0,0,'torso',r.neck.x,r.neck.y+6);
  drawBag(g,c,art,r.neck,r.hip,undefined,costume);
  arm(art.rear?'left':'right',!art.rear&&Boolean(held));
  face.position.set(r.head.x, r.head.y);
  face.angle = r.angle + (listening ? Math.sin(time*2.4+actorId.length*.7)*1.4 : 0);
  face.scale.set(c.head*turnScale,c.head);
  // Never add synthetic random jaw motion over audio-aligned silence.
  const mood = facialPerformance(time, actorId, action, expression, amplitude, viseme, focus);
  if (action === 'blink' && actionTime < .22) mood.blink = Math.max(mood.blink, 1 - Math.abs(actionTime - .11) / .11);
  const headView = lookAtCamera && (art.profile || art.rear)
    ? view === 'back' ? 'back' : 'three-quarter' : view;
  drawFace(face,facialArt,c,headView,mood,lookAtCamera);
}
function drawFace(face:Container,g:Graphics,c:Character,view:View,mood:FacialPerformance,camera:boolean) {
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
