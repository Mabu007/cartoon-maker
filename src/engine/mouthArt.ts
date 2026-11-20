import type { Graphics } from 'pixi.js';
import type { Character } from './schema.ts';
import type { FacialPerformance } from './facialAnimation.ts';
import { INK } from './art.ts';

/**
 * Analytically clipped tooth geometry: each tooth's four edges are bounded by
 * the ellipse defining the mouth interior. Teeth cannot float above the lips,
 * and every tooth has its own colour (including gold caps).
 */
function toothRow(g: Graphics, character: Character, x: number, y: number, rx: number, ry: number, bite = false) {
  if (ry < 3.7 || rx < 5.8) return;
  const left = -rx * .77, right = rx * .77, step = (right - left) / 6;
  const top = (at: number) => y - ry * Math.sqrt(Math.max(0, 1 - (at / rx) ** 2)) + .9;
  const bottom = (at: number) => Math.min(y + (bite ? .18 : .05) * ry, top(at) + Math.max(2.3, ry * (bite ? .93 : .72)));
  for (let i = 0; i < 6; i++) {
    const l = left + i * step + .5, r = left + (i + 1) * step - .5;
    if (r <= l) continue;
    const middle = (l + r) / 2, t = top(middle);
    const tl = Math.max(top(l), t), tr = Math.max(top(r), t);
    const bl = bottom(l), br = bottom(r);
    const fill = character.goldTeeth?.includes(i) ? '#eac05c' : '#fff4de';
    const border = character.goldTeeth?.includes(i) ? '#ab792b' : '#e1d4c9';
    g.moveTo(x + l, tl).quadraticCurveTo(x + middle, t, x + r, tr)
      .lineTo(x + r, br).quadraticCurveTo(x + middle, Math.min(bottom(middle), Math.min(bl,br)), x + l, bl)
      .closePath().fill(fill).stroke({ color: border, width: .55 });
    if (character.goldTeeth?.includes(i)) {
      g.moveTo(x + l + .7, tl + 1.8).lineTo(x + l + .7, Math.min(bl - 1, tl + 4))
        .stroke({ color: '#fff3b7', width: .75, cap: 'round' });
    }
  }
}
function mouthOpening(g: Graphics, c: Character, x: number, y: number, rx: number, ry: number, shape: string) {
  g.ellipse(x, y, rx, ry).fill('#352333').stroke({ color: INK, width: 1.8 });
  if (shape === 'tongue') {
    g.ellipse(x, y + ry * .44, Math.min(rx * .52, 5.3), ry * .30).fill('#c66f79');
    g.moveTo(x, y + ry * .3).lineTo(x, y + ry * .57).stroke({ color: '#e59b9a', width: .65 });
  }
  if (shape === 'pucker') return;
  toothRow(g, c, x, y, rx, ry, shape === 'bite');
  if (shape !== 'bite' && ry > 5.7) {
    g.ellipse(x, y + ry * .69, rx * .36, ry * .16).fill('#b86a75');
  }
  // Upper and lower lip follow the interior rather than covering the teeth.
  g.moveTo(x - rx * .85, y - ry * .44)
    .quadraticCurveTo(x, y - ry - 1, x + rx * .85, y - ry * .44)
    .stroke({ color: '#603746', width: 1.45, cap: 'round' });
  g.moveTo(x - rx * .8, y + ry * .54)
    .quadraticCurveTo(x, y + ry + 1, x + rx * .8, y + ry * .54)
    .stroke({ color: '#643a47', width: 1.1, cap: 'round' });
}
export function drawExpressionMouth(g: Graphics, c: Character, mood: FacialPerformance, x: number) {
  const y = 26, expression = mood.expression, w = c.mouth === 'full' ? 12 : c.mouth === 'line' ? 9 : 11;
  if (mood.speaking || mood.mouthOpen > .16) {
    if (mood.viseme === 'closed' || (mood.speaking && mood.viseme === 'rest')) {
      g.moveTo(x - w * .7, y).quadraticCurveTo(x, y + 1, x + w * .7, y)
        .stroke({ color: INK, width: 2.8, cap: 'round' });
      return;
    }
    const weight = Math.max(.18, mood.mouthOpen);
    let rx = w, ry = 2 + weight * 8;
    switch (mood.viseme) {
      case 'bite': rx = w * .94; ry = Math.max(3.9, 3.5 + weight * 3); break;
      case 'wide': rx = w * 1.33; ry = 2.2 + weight * 4.8; break;
      case 'open': rx = w * .95; ry = 3 + weight * 10; break;
      case 'round': rx = w * .77; ry = 3.4 + weight * 10.4; break;
      case 'pucker': rx = w * .48; ry = 3.8 + weight * 5.5; break;
      case 'tongue': rx = w; ry = 3 + weight * 6.6; break;
      default: rx = w; ry = 2 + weight * 7; break;
    }
    mouthOpening(g, c, x, y + 1, rx, ry, mood.viseme);
    return;
  }
  if (expression === 'surprised') {
    mouthOpening(g, c, x, y + 1, 7.2, 10.4, 'round'); return;
  }
  if (expression === 'happy' || expression === 'excited') {
    const rx = w + (expression === 'excited' ? 4 : 2);
    mouthOpening(g, c, x, y + 3.5, rx, expression === 'excited' ? 10.5 : 7.7, 'wide');
    return;
  }
  if (expression === 'smug') {
    g.moveTo(x - w, y + 2).quadraticCurveTo(x + 1, y + 5, x + w + 1, y - 4).stroke({ color: INK, width: 2.6, cap: 'round' });
  } else if (expression === 'confused') {
    g.moveTo(x - w, y + 2).quadraticCurveTo(x - 3, y - 2, x + w, y + 4).stroke({ color: INK, width: 2.6, cap: 'round' });
  } else if (expression === 'sleepy') {
    g.moveTo(x - 8, y + 1).quadraticCurveTo(x, y + 4, x + 8, y + 1).stroke({ color: INK, width: 2, cap: 'round' });
  } else if (expression === 'sad') {
    g.moveTo(x - w, y + 4).quadraticCurveTo(x, y - 6, x + w, y + 4).stroke({ color: INK, width: 2.8, cap: 'round' });
  } else if (expression === 'angry') {
    g.moveTo(x - w, y + 3).quadraticCurveTo(x, y - 4, x + w, y + 3).stroke({ color: INK, width: 3.5, cap: 'round' });
  } else if (expression === 'thinking') {
    g.ellipse(x + 3, y, 4.3, 3.3).fill('#482f41');
  } else {
    g.moveTo(x - w, y).quadraticCurveTo(x, y + .5, x + w, y).stroke({ color: INK, width: c.mouth === 'full' ? 3 : 2.25, cap: 'round' });
  }
}
