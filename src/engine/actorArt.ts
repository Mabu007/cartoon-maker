import type { Graphics } from 'pixi.js';
import { armIK, rig, type Point } from './animation.ts';
import { ellipse, INK, line, poly, rect, segment } from './art.ts';
import type { Character, Expression, JointPose, Prop, View } from './schema.ts';

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
export function drawActor(g: Graphics, face: Graphics, c: Character, view: View, pose: JointPose, expression: Expression, amplitude: number, held?: Prop) {
  const art = viewArt[view];
  const r = rig(c, pose, art.width);
  const limbWidth = 10 * c.thickness;
  const arm = (side: 'left' | 'right', carrying = false) => {
    const joint = r[side];
    const [elbow, hand] = carrying ? armIK(joint.shoulder, { x: r.head.x + (art.rear ? -26 : 45), y: r.head.y + 43 }, 28 * c.arms, 28 * c.arms, 1) : [joint.elbow, joint.hand];
    stroke(g, [joint.shoulder, elbow, hand], limbWidth, c.skin);
    stroke(g, [joint.shoulder, { x: (joint.shoulder.x + elbow.x) / 2, y: (joint.shoulder.y + elbow.y) / 2 }], limbWidth + 5, c.shirt);
    ellipse(g, hand.x, hand.y, limbWidth * .65, limbWidth * .74, c.skin, 2.7);
    if (carrying && held) {
      const x = hand.x + 7, y = hand.y + 9;
      if (held.kind === 'cup') {
        ellipse(g, x + 8, y - 11, 6, 5, held.color, 2);
        rect(g, x - 8, y - 17, 16, 17, held.color, 3, 2);
        ellipse(g, x, y - 16, 6, 2, '#875746');
      } else {
        rect(g, x - 8, y - 19, 16, 19, held.color, 3, 2);
      }
    }
  };
  const leg = (side: 'left' | 'right') => {
    const joint = r[side];
    stroke(g, [joint.upper, joint.knee, joint.foot], limbWidth + 1, c.pants);
    const shoeDir = view === 'front' || view === 'back' ? (side === 'left' ? -4 : 4) : (art.rear ? -5 : 5);
    ellipse(g, joint.foot.x + shoeDir, joint.foot.y + 1, 12 * c.thickness, 6.5, c.shoes, 2.7);
    segment(g, joint.foot.x - 4 + shoeDir, joint.foot.y + 4, joint.foot.x + 7 + shoeDir, joint.foot.y + 4, '#967681', 1.3);
  };
  leg('left'); leg('right'); arm('left');
  stroke(g, [r.hip, r.neck], (35 + (c.outfit !== 'tee' ? 3 : 0)) * art.width * c.thickness, c.shirt);
  const top = r.neck.y + 8, midX = r.neck.x;
  if (c.outfit === 'hoodie') {
    poly(g, [midX - 16, top - 10, midX + 16, top - 10, midX + 8, top + 8, midX - 8, top + 8], c.shirt, 2.3);
    if (!art.rear) { segment(g, midX - 5, top + 8, midX - 7, top + 23, INK, 1.8); segment(g, midX + 5, top + 8, midX + 7, top + 23, INK, 1.8); }
  } else if (c.outfit === 'jacket' && !art.rear) {
    segment(g, midX, top, r.hip.x, r.hip.y + 6, INK, 2);
    segment(g, midX + 4, top + 14, midX + 11, top + 13, '#eee0d4', 2);
  }
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
  drawFace(face, c, art, expression, amplitude);
}
function drawFace(g: Graphics, c: Character, art: typeof viewArt[View], expression: Expression, amplitude: number) {
  const { face, rear, profile, far } = art;
  const width = c.shape === 'round' ? 47 : c.shape === 'square' ? 45 : 42;
  const w = width * (profile ? .82 : .94 + art.width * .06);
  const h = c.shape === 'round' ? 42 : 46;
  const earWidth = c.ears === 'small' ? 6 : c.ears === 'wide' ? 10 : 8;
  if (c.hair === 'puff') {
    ellipse(g, -w * .62, -h * .68, 26, 27, c.hairColor, 3.5);
    ellipse(g, -w * .53, -h * 1.01, 20, 14, c.hairColor, 3.5);
    ellipse(g, -w * .25, -h * .95, 13, 12, c.hairColor);
  }
  const ear = (x: number, y: number, visibleEarring: boolean) => {
    ellipse(g, x, y, earWidth, 9, c.skin, 3.2);
    if (c.earrings && visibleEarring) { ellipse(g, x, y + 8, 4.3, 6, '#f4cb65', 1.8); ellipse(g, x, y + 7.1, 1.8, 2.5, c.skin); }
  };
  if (!profile) ear(w - 1, 8, false);
  if (c.shape === 'square') rect(g, -w, -h, w * 2, h * 2, c.skin, 26, 3.9);
  else ellipse(g, 0, 0, w, h, c.skin, 3.9);
  ear(profile ? -8 : -w + 2, 8, true);
  if (c.hair !== 'bald') {
    g.moveTo(-w + 2, -3).bezierCurveTo(-w - 6, -h * .76, -w * .64, -h - 5, 0, -h - 4).bezierCurveTo(w * .73, -h - 5, w + 5, -h * .57, w - 1, -12);
    if (rear) g.bezierCurveTo(w - 2, 38, -w + 4, 46, -w + 2, -3);
    else g.bezierCurveTo(w * .66, -h * .72, -w * .38, -h * .72, -w + 2, -3);
    g.closePath().fill(c.hairColor).stroke({ color: INK, width: 3, join: 'round' });
    if (c.hair === 'locs') for (let i = 0; i < 5; i++) rect(g, -w + 8 + i * (w * 1.42 / 5), -h + 5, 10, 28 + (i % 2) * 9, c.hairColor, 5, 2);
    if (c.hair === 'fade' && !rear) segment(g, -w + 9, -20, -w + 19, -28, '#625063', 2);
  }
  if (c.hat === 'beanie') {
    ellipse(g, 0, -h + 3, w + 2, 25, c.shirt, 3);
    rect(g, -w - 2, -h + 2, w * 2 + 4, 13, c.shirt, 4, 3);
  } else if (c.hat === 'cap') {
    ellipse(g, 0, -h + 5, w + 1, 21, c.shirt, 3);
    rect(g, -w + 2, -h + 6, w * 2 + (rear ? -2 : 20), 10, c.shirt, 4, 2.5);
  }
  if (rear) return;
  const eyeX = profile ? face - 3 : face - 13 * c.eyeSpacing;
  const secondX = face + (art.face ? 10 : 14) * c.eyeSpacing;
  const eyeY = -5;
  const eye = (x: number, narrow: boolean) => {
    const height = expression === 'surprised' ? 10 : expression === 'angry' ? 5 : c.eyes === 'relaxed' ? 5 : c.eyes === 'wide' ? 9 : 7;
    const width = narrow ? 5.2 : 7.4;
    ellipse(g, x, eyeY, width, height, '#fff1dc', 1.6);
    ellipse(g, x + (art.face ? 1.7 : 0), eyeY + 1, 2.65, Math.max(2.6, height * .54), INK);
    const slant = expression === 'angry' ? (x < face ? 5 : -5) : expression === 'sad' ? (x < face ? -4 : 4) : 0;
    const browY = eyeY - height - (expression === 'surprised' ? 7 : 4);
    g.moveTo(x - width, browY).quadraticCurveTo(x, browY - (c.brows === 'arched' ? 5 : 1), x + width, browY + slant).stroke({ color: INK, width: c.brows === 'bold' ? 3.7 : 2.6, cap: 'round' });
    if (c.glasses) rect(g, x - width - 3, eyeY - height - 3, (width + 3) * 2, (height + 3) * 2, '#ffffff00', 4, 2, '#45344e');
  };
  eye(eyeX, false); if (far) eye(secondX, Boolean(art.face));
  if (c.glasses && far) segment(g, eyeX + 9, eyeY - 2, secondX - 8, eyeY - 2, INK, 2);
  const noseX = profile ? w - 1 : face + 1;
  const noseWidth = c.nose === 'long' ? 7 : c.nose === 'flat' ? 6 : 4;
  ellipse(g, noseX, 8, noseWidth, c.nose === 'long' ? 6 : 3.4, c.skin, 1.7);
  const mouthX = profile ? face + 3 : face;
  if (c.beard === 'full') ellipse(g, mouthX, 29, 19, 12, c.hairColor, 2);
  else if (c.beard === 'goatee') ellipse(g, mouthX, 36, 10, 5.2, c.hairColor, 1.5);
  const mouthY = 24;
  if (amplitude > .08 || expression === 'surprised') {
    const rounded = expression === 'surprised' || amplitude > .7;
    ellipse(g, mouthX, mouthY, rounded ? 7 : c.mouth === 'full' ? 12 : 10, expression === 'surprised' ? 9 : 2.4 + amplitude * 8, INK, 1.1);
    if (!rounded && amplitude > .23) ellipse(g, mouthX + 1, mouthY + amplitude * 4, 4, 1.7, '#ec9588');
  } else {
    const control = expression === 'angry' || expression === 'sad' ? -7 : expression === 'happy' ? 13 : c.mouth === 'line' ? 0 : 6;
    g.moveTo(mouthX - 11, mouthY).quadraticCurveTo(mouthX, mouthY + control, mouthX + 10, mouthY - (profile ? 2 : 1)).stroke({ color: INK, width: 2.7, cap: 'round' });
  }
}
