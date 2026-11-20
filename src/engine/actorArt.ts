import type { Graphics } from 'pixi.js';
import { armIK, gaitLeg, rig, viewForward, type Point } from './animation.ts';
import { ellipse, INK, line, rect, segment } from './art.ts';
import { drawIllustratedHair, drawIllustratedFacialHair, drawIllustratedHand, drawIllustratedHead, drawIllustratedTorso, shade } from './illustration.ts';
import { facialPerformance, type FacialPerformance } from './facialAnimation.ts';
import { drawExpressionMouth } from './mouthArt.ts';
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
export function drawActor(g: Graphics, face: Graphics, c: Character, view: View, pose: JointPose, expression: Expression, amplitude: number, held?: Prop, time = 0, action: Action = 'idle', actorId = c.id, speaking = false,
  viseme?: { shape: Viseme; weight: number }, focus?: { x: number; y: number },
  locomotion: Action = action, lift = 0, gaitTime = time, velocity?: number, forward = viewForward(view), actionTime = time) {
  const art = viewArt[view];
  const r = rig(c, pose, art.width);
  const limbWidth = 10 * c.thickness;
  const arm = (side: 'left' | 'right', carrying = false) => {
    const joint = r[side];
    const [elbow, hand] = carrying ? armIK(joint.shoulder, { x: r.head.x + (art.rear ? -26 : 45), y: r.head.y + 43 }, 28 * c.arms, 28 * c.arms, 1) : [joint.elbow, joint.hand];
    stroke(g, [joint.shoulder, elbow, hand], limbWidth, c.skin);
    stroke(g, [joint.shoulder, { x: (joint.shoulder.x + elbow.x) / 2, y: (joint.shoulder.y + elbow.y) / 2 }], limbWidth + 5, c.shirt);
    const handMode = carrying ? 'grip' :
      action === 'point' && side === 'right' ? 'point' :
      ['wave', 'talk', 'celebrate', 'open-hand', 'hand-to-face'].includes(action) && side === 'right' ? 'open' :
      (action === 'fist' && side === 'right') || locomotion === 'walk' || locomotion === 'run' ? 'fist' : 'relaxed';
    drawIllustratedHand(g, hand.x, hand.y, limbWidth, c.skin, handMode, side === 'right' ? 1 : -1);
    // Gentle curved sleeve-cuff instead of a rigid straight seam.
    segment(g, (joint.shoulder.x + elbow.x) / 2 - 3, (joint.shoulder.y + elbow.y) / 2, (joint.shoulder.x + elbow.x) / 2 + 3, (joint.shoulder.y + elbow.y) / 2 + 2, shade(c.shirt, -.27), 1.5);
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
    if (moving) [knee, foot] = gaitLeg(joint.upper, c.legs * c.height, gaitTime, locomotion, side, forward, lift, velocity);
    stroke(g, [joint.upper, knee, foot], limbWidth + 1, c.pants);
    const shoeDir = moving || (view !== 'front' && view !== 'back') ? forward * 6 : (side === 'left' ? -4 : 4);
    const toe = Math.sign(shoeDir);
    ellipse(g, foot.x + shoeDir, foot.y + 1, 12 * c.thickness, 6.5, c.shoes, 2.7);
    segment(g, foot.x - 7 * toe + shoeDir, foot.y + 4, foot.x + 9 * toe + shoeDir, foot.y + 4, shade(c.shoes, -.27), 1.7);
    segment(g, foot.x + shoeDir - 5 * toe, foot.y - 2, foot.x + shoeDir + 2 * toe, foot.y - 3, shade(c.shoes, .36), 1.2);
  };
  leg('left'); leg('right'); arm('left');
  drawIllustratedTorso(g, c, art, r.neck, r.hip);
  const top = r.neck.y + 8, midX = r.neck.x;
  if (c.accessory === 'chain' && !art.rear) {
    line(g, [{ x: midX - 12, y: top }, { x: midX, y: top + 17 }, { x: midX + 12, y: top }], '#f3ca65', 3);
    ellipse(g, midX, top + 17, 3.6, 3.6, '#f3ca65', 1.2);
  } else if (c.accessory === 'scarf') {
    rect(g, midX - 20, top - 15, 39, 11, '#edb76e', 5, 2);
    rect(g, midX + 9, top - 10, 11, 26, '#edb76e', 3, 2);
  }
  arm('right', Boolean(held));
  face.position.set(r.head.x, r.head.y);
  face.angle = r.angle;
  face.scale.set(c.head);
  const mood = facialPerformance(time, actorId, action, expression, speaking ? Math.max(amplitude, .15 + .62 * Math.abs(Math.sin(time * 13.7 + actorId.length))) : amplitude, viseme, focus);
  if (action === 'blink' && actionTime < .22) mood.blink = Math.max(mood.blink, 1 - Math.abs(actionTime - .11) / .11);
  drawFace(face, c, art, mood);
}
function drawFace(g: Graphics, c: Character, art: typeof viewArt[View], mood: FacialPerformance) {
  const { face, rear, profile, far } = art;
  const { expression, blink, gazeX, gazeY, mouthOpen } = mood;
  const width = c.shape === 'round' ? 47 : c.shape === 'square' ? 45 : 42;
  const w = width * (profile ? .82 : .94 + art.width * .06);
  const h = c.shape === 'round' ? 42 : 46;
  const earWidth = c.ears === 'small' ? 6 : c.ears === 'wide' ? 10 : 8;
  const ear = (x: number, y: number, visibleEarring: boolean) => {
    ellipse(g, x, y, earWidth, 9, c.skin, 3.2);
    g.moveTo(x - 3, y + 1).quadraticCurveTo(x + 2, y - 2, x + 3, y + 5).stroke({ color: shade(c.skin, -.22), width: 1.4 });
    if (c.earrings && visibleEarring) {
      ellipse(g, x, y + 9, 4.3, 6, '#f4cb65', 1.8);
      ellipse(g, x, y + 7.1, 1.8, 2.5, c.skin);
    }
  };
  if (!profile) ear(w - 1, 8, false);
  drawIllustratedHead(g, c, art);
  ear(profile ? -w + 3 : -w + 2, 8, true);
  drawIllustratedHair(g, c, art, w, h);
  if (c.hat === 'beanie') {
    ellipse(g, 0, -h + 3, w + 2, 25, c.shirt, 3);
    rect(g, -w - 2, -h + 2, w * 2 + 4, 13, c.shirt, 4, 3);
  } else if (c.hat === 'cap') {
    ellipse(g, 0, -h + 5, w + 1, 21, c.shirt, 3);
    rect(g, -w + 2, -h + 6, w * 2 + (rear ? -2 : 20), 10, c.shirt, 4, 2.5);
  }
  if (rear) return;
  // Constrain cheek shading inside the actual head silhouette, including Sbu's
  // shifted 3/4 face. These are subtle color planes, never detached circles.
  const faceCenter = Math.max(-w * .12, Math.min(w * .16, face));
  if (!profile && (expression === 'happy' || expression === 'excited' || expression === 'sad')) {
    for (const offset of [-24, 24]) {
      const x = Math.max(-w + 12, Math.min(w - 12, faceCenter + offset));
      g.ellipse(x, 15, 7, 3.7).fill({ color: expression === 'happy' || expression === 'excited' ? '#d17b6f' : '#9d6f83', alpha: .19 });
    }
  }
  const eyeX = profile ? face - 3 : face - 13 * c.eyeSpacing;
  const secondX = face + (art.face ? 10 : 14) * c.eyeSpacing;
  const eyeY = -5;
  const eye = (x: number, narrow: boolean, isLeft: boolean) => {
    const baseHeight = expression === 'surprised' || expression === 'excited' ? 11.5 : expression === 'angry' ? 5.5 :
      expression === 'sleepy' ? 3 : expression === 'smug' ? 5.5 :
      expression === 'happy' ? 6.6 : c.eyes === 'relaxed' ? 5.5 : c.eyes === 'wide' ? 9.2 : 7.7;
    const halfW = narrow ? 5.1 : 7.4;
    const open = Math.max(.06, 1 - blink);
    const eyeHeight = baseHeight * open;
    const pupilX = x + Math.max(-halfW + 2.8, Math.min(halfW - 2.8, gazeX + (art.face ? 1.2 : 0)));
    const pupilY = eyeY + Math.max(-eyeHeight + 2.5, Math.min(eyeHeight - 2.5, gazeY + .8));
    if (eyeHeight < 1.4) {
      g.moveTo(x - halfW, eyeY).quadraticCurveTo(x, eyeY + 1.7, x + halfW, eyeY)
        .stroke({ color: INK, width: 2.6, cap: 'round' });
    } else {
      ellipse(g, x, eyeY, halfW, eyeHeight, '#fff5e9', 1.55);
      ellipse(g, pupilX, pupilY, 2.8, Math.min(3.3, eyeHeight * .66), '#27213a');
      if (eyeHeight > 3.4) ellipse(g, pupilX - 1.15, pupilY - 1.3, 1.1, 1.2, '#ffffff');
      if (expression === 'happy' || expression === 'excited') {
        g.moveTo(x - halfW, eyeY + eyeHeight * .57).quadraticCurveTo(x, eyeY + eyeHeight + 1.2, x + halfW, eyeY + eyeHeight * .57)
          .stroke({ color: shade(c.skin, -.17), width: 1.15 });
      }
    }
    const slant = expression === 'angry' ? (isLeft ? -4.5 : 4.5) :
      expression === 'sad' ? (isLeft ? 4 : -4) : expression === 'confused' ? (isLeft ? 5 : -5) :
      expression === 'smug' ? (isLeft ? -2 : 4) : expression === 'thinking' ? (isLeft ? -3 : 2) : 0;
    const browY = eyeY - baseHeight - (expression === 'surprised' || expression === 'excited' ? 10 : expression === 'angry' ? 2.3 : 5);
    g.moveTo(x - halfW - 1, browY + slant).quadraticCurveTo(x, browY - (c.brows === 'arched' ? 6 : 1.5), x + halfW + 1, browY - slant)
      .stroke({ color: INK, width: c.brows === 'bold' ? 4.1 : 2.6, cap: 'round' });
    if (c.glasses) rect(g, x - halfW - 4, eyeY - baseHeight - 4, (halfW + 4) * 2, (baseHeight + 4) * 2, '#ffffff00', 4, 2, '#45344e');
  };
  eye(eyeX, false, true);
  if (far) eye(secondX, Boolean(art.face), false);
  if (c.glasses && far) segment(g, eyeX + 9, eyeY - 2, secondX - 8, eyeY - 2, INK, 2);
  const noseX = profile ? w - 1 : face + 1;
  const noseWidth = c.nose === 'long' ? 7 : c.nose === 'flat' ? 6 : 4;
  ellipse(g, noseX, 8, noseWidth, c.nose === 'long' ? 6 : 3.4, c.skin, 1.7);
  const mouthX = profile ? face + 3 : face;
  drawIllustratedFacialHair(g, c, art, mouthX, w);
  drawExpressionMouth(g, c, mood, mouthX);
}
