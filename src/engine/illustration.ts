import type { Graphics } from 'pixi.js';
import type { Character } from './schema.ts';
import { INK } from './art.ts';

/**
 * The illustrated character kit is made of authored SVG paths, rather than
 * circles and rectangles. Paths are recoloured and proportioned at render time
 * so one curated piece works for every character and camera angle.
 *
 * Illustrator/AI-produced paths can be added here after their anchors and
 * outlines have been cleaned up; no external service is needed at runtime.
 */
export type IllustratedView = { width: number; face: number; far: boolean; rear: boolean; profile: boolean };

export function shade(hex: string, amount: number) {
  const target = amount < 0 ? 0 : 255, fraction = Math.min(1, Math.abs(amount));
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - fraction) + target * fraction).toString(16).padStart(2, '0')).join('');
}

function part(g: Graphics, d: string, fill: string, stroke = INK, width = 3) {
  g.svg('<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"/>');
}
function detail(g: Graphics, d: string, color: string, width = 1.8) {
  part(g, d, 'none', color, width);
}

export function drawIllustratedHead(g: Graphics, c: Character, art: IllustratedView) {
  const base = c.shape === 'round' ? 47 : c.shape === 'square' ? 45 : 42;
  const w = base * (art.profile ? .82 : .94 + art.width * .06);
  const h = c.shape === 'round' ? 42 : 46;
  const contour = c.shape === 'square'
    ? 'M ' + (-w + 14) + ' ' + (-h) + ' C ' + (-w - 2) + ' ' + (-h) + ' ' + (-w - 5) + ' ' + (-h + 11) + ' ' + (-w) + ' -4 C ' + (-w - 3) + ' 24 ' + (-w + 4) + ' ' + (h - 1) + ' -8 ' + h + ' C 14 ' + (h + 3) + ' ' + (w + 2) + ' 24 ' + w + ' -8 C ' + (w + 2) + ' ' + (-h + 11) + ' ' + (w - 4) + ' ' + (-h) + ' ' + (w - 15) + ' ' + (-h) + ' Z'
    : 'M 1 ' + (-h - 2) + ' C ' + (-w * .7) + ' ' + (-h - 6) + ' ' + (-w - 4) + ' ' + (-h * .52) + ' ' + (-w) + ' 3 C ' + (-w + 1) + ' ' + (h * .7) + ' ' + (-w * .38) + ' ' + (h + 5) + ' 1 ' + h + ' C ' + (w * .65) + ' ' + (h + 5) + ' ' + (w + 5) + ' ' + (h * .38) + ' ' + w + ' -7 C ' + (w - 1) + ' ' + (-h * .72) + ' ' + (w * .53) + ' ' + (-h - 3) + ' 1 ' + (-h - 2) + ' Z';
  part(g, contour, c.skin, INK, 3.8);
  // Gentle cheek / temple planes make the head feel illustrated without hard highlights.
  part(g, 'M ' + (-w + 7) + ' 2 C ' + (-w + 4) + ' 17 ' + (-w * .7) + ' 30 ' + (-w * .38) + ' 33 Q ' + (-w + 13) + ' 19 ' + (-w + 7) + ' 2 Z', shade(c.skin, -.11), 'none', 0);
  part(g, 'M ' + (w - 11) + ' -23 Q ' + (w - 3) + ' -10 ' + (w - 10) + ' 5', 'none', shade(c.skin, .19), 2);
  if (!art.rear) {
    part(g, 'M ' + (-w + 10) + ' 18 Q ' + (-w + 14) + ' 22 ' + (-w + 9) + ' 27', 'none', shade(c.skin, -.18), 1.6);
    if (!art.profile) part(g, 'M ' + (w - 15) + ' 22 Q ' + (w - 8) + ' 20 ' + (w - 11) + ' 13', 'none', shade(c.skin, -.13), 1.5);
  }
  return { w, h };
}

export function drawIllustratedHair(g: Graphics, c: Character, art: IllustratedView, w: number, h: number) {
  if (c.hair === 'bald') return;
  const color = c.hairColor, lighter = shade(color, .24);
  const hairline = 'M ' + (-w + 2) + ' -5 C ' + (-w - 7) + ' ' + (-h * .8) + ' ' + (-w * .72) + ' ' + (-h - 11) + ' -5 ' + (-h - 7) + ' C ' + (w * .44) + ' ' + (-h - 17) + ' ' + (w + 7) + ' ' + (-h * .7) + ' ' + (w - 1) + ' -10';
  const back = art.rear
    ? ' C ' + (w + 3) + ' 28 ' + (w * .52) + ' 41 0 40 C ' + (-w * .7) + ' 42 ' + (-w - 5) + ' 22 ' + (-w + 2) + ' -5 Z'
    : ' C ' + (w * .46) + ' -20 ' + (w * .16) + ' -31 -2 -24 C ' + (-w * .53) + ' -16 ' + (-w * .7) + ' -28 ' + (-w + 2) + ' -5 Z';
  part(g, hairline + back, color, INK, 3);
  if (c.hair === 'fade' || c.hair === 'buzz') {
    detail(g, 'M ' + (-w + 9) + ' -24 Q ' + (-w + 18) + ' -35 ' + (-w + 27) + ' -33', lighter, 2);
    if (c.hair === 'fade') detail(g, 'M ' + (-w + 8) + ' -14 L ' + (-w + 16) + ' -21 M ' + (-w + 17) + ' -8 L ' + (-w + 22) + ' -13', shade(color, .36), 1.6);
  }
  if (c.hair === 'afro' || c.hair === 'curls' || c.hair === 'puff') {
    const y = -h + (c.hair === 'curls' ? 5 : -3);
    const bumps = c.hair === 'curls' ? 6 : 5;
    for (let i = 0; i < bumps; i++) {
      const x = -w + 9 + i * (w * 1.67 / (bumps - 1));
      const radius = c.hair === 'curls' ? 11 : 17;
      part(g, 'M ' + (x - radius) + ' ' + y + ' A ' + radius + ' ' + radius + ' 0 1 1 ' + (x + radius) + ' ' + y + ' Z', color, INK, 2.3);
      detail(g, 'M ' + (x - 4) + ' ' + (y - radius + 6) + ' Q ' + x + ' ' + (y - radius + 1) + ' ' + (x + 4) + ' ' + (y - radius + 6), lighter, 1.3);
    }
  }
  if (c.hair === 'locs' || c.hair === 'braids') {
    const count = c.hair === 'braids' ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const x = -w + 9 + i * ((w * 1.68) / (count - 1));
      const end = c.hair === 'braids' ? 29 : 23;
      const d = 'M ' + x + ' ' + (-h + 5) + ' Q ' + (x + (i % 2 ? 5 : -4)) + ' -8 ' + (x + (i % 2 ? 3 : -2)) + ' ' + end;
      detail(g, d, INK, c.hair === 'braids' ? 7 : 10);
      detail(g, d, color, c.hair === 'braids' ? 4.5 : 7);
      if (c.hair === 'braids') for (let y = -12; y < end; y += 9) detail(g, 'M ' + (x - 3) + ' ' + y + ' L ' + (x + 3) + ' ' + (y + 4), lighter, 1.2);
    }
  }
  if (art.rear) {
    detail(g, 'M ' + (-w * .6) + ' -8 Q 0 1 ' + (w * .6) + ' -8', shade(color, .14), 1.5);
  }
}

export function drawIllustratedTorso(g: Graphics, c: Character, art: IllustratedView, neck: {x:number;y:number}, hip: {x:number;y:number}) {
  const shoulder = (c.outfit === 'hoodie' ? 26 : 24) * art.width * c.thickness;
  const waist = (19 + (c.outfit === 'jacket' ? 3 : 0)) * art.width * c.thickness;
  const top = neck.y + 2, bottom = hip.y + 7, x = neck.x, bx = hip.x;
  const silhouette = 'M ' + (x - 10) + ' ' + (top - 4) + ' C ' + (x - 22) + ' ' + (top - 1) + ' ' + (x - shoulder) + ' ' + (top + 5) + ' ' + (x - shoulder) + ' ' + (top + 14) + ' L ' + (bx - waist) + ' ' + (bottom - 4) + ' Q ' + (bx - waist) + ' ' + (bottom + 3) + ' ' + bx + ' ' + bottom + ' Q ' + (bx + waist) + ' ' + (bottom + 3) + ' ' + (bx + waist) + ' ' + (bottom - 4) + ' L ' + (x + shoulder) + ' ' + (top + 14) + ' Q ' + (x + shoulder + 2) + ' ' + (top + 2) + ' ' + (x + 10) + ' ' + (top - 4) + ' Z';
  part(g, silhouette, c.shirt, INK, 3.2);
  part(g, 'M ' + (x + shoulder - 8) + ' ' + (top + 15) + ' Q ' + (x + shoulder - 4) + ' ' + (top + 27) + ' ' + (bx + waist - 5) + ' ' + (bottom - 6) + ' L ' + (bx + waist - 11) + ' ' + (bottom - 8) + ' Z', shade(c.shirt, -.15), 'none', 0);
  if (c.outfit === 'hoodie') {
    part(g, 'M ' + (x - 13) + ' ' + (top - 5) + ' Q ' + x + ' ' + (top + 10) + ' ' + (x + 13) + ' ' + (top - 5) + ' L ' + (x + 16) + ' ' + (top + 5) + ' Q ' + x + ' ' + (top + 21) + ' ' + (x - 16) + ' ' + (top + 5) + ' Z', shade(c.shirt, -.18), INK, 2);
    detail(g, 'M ' + (x - 5) + ' ' + (top + 11) + ' L ' + (x - 6) + ' ' + (top + 25) + ' M ' + (x + 5) + ' ' + (top + 11) + ' L ' + (x + 6) + ' ' + (top + 23), '#f9e5c2', 2);
    part(g, 'M ' + (bx - 13) + ' ' + (bottom - 20) + ' Q ' + bx + ' ' + (bottom - 13) + ' ' + (bx + 13) + ' ' + (bottom - 20) + ' L ' + (bx + 13) + ' ' + (bottom - 9) + ' L ' + (bx - 13) + ' ' + (bottom - 9) + ' Z', shade(c.shirt, -.10), shade(c.shirt, -.25), 1.4);
  } else if (c.outfit === 'jacket' || c.outfit === 'uniform') {
    const trim = c.outfit === 'uniform' ? '#f5e7ce' : shade(c.shirt, .4);
    part(g, 'M ' + (x - 9) + ' ' + (top - 4) + ' L ' + (x - 1) + ' ' + (top + 13) + ' L ' + (x - 13) + ' ' + (top + 19) + ' L ' + (x - 20) + ' ' + (top + 3) + ' Z', trim, INK, 1.3);
    part(g, 'M ' + (x + 9) + ' ' + (top - 4) + ' L ' + (x + 1) + ' ' + (top + 13) + ' L ' + (x + 13) + ' ' + (top + 19) + ' L ' + (x + 20) + ' ' + (top + 3) + ' Z', trim, INK, 1.3);
    detail(g, 'M ' + x + ' ' + (top + 12) + ' L ' + bx + ' ' + (bottom - 4), shade(c.shirt, -.48), 1.8);
    for (let i=0;i<3;i++) part(g, 'M ' + (bx + 4) + ' ' + (top + 24 + i*10) + ' l 2 0', 'none', '#f5deae', 2);
  } else {
    detail(g, 'M ' + (x - 10) + ' ' + (top - 3) + ' Q ' + x + ' ' + (top + 11) + ' ' + (x + 10) + ' ' + (top - 3), shade(c.shirt, -.35), 2);
    if (c.outfit === 'sweater') for (let i=0;i<4;i++) detail(g, 'M ' + (bx - 12 + i*8) + ' ' + (bottom - 6) + ' l 0 4', shade(c.shirt, -.28), 1.5);
  }
  detail(g, 'M ' + (bx - waist + 7) + ' ' + (bottom - 15) + ' Q ' + (bx - waist + 10) + ' ' + (bottom - 11) + ' ' + (bx - waist + 7) + ' ' + (bottom - 7), shade(c.shirt, -.23), 1.3);
}

export function drawIllustratedHand(g: Graphics, x: number, y: number, width: number, color: string) {
  const u = width / 10;
  // A tiny mitten with an intentional thumb and finger separation.
  const d = 'M ' + (x - 6*u) + ' ' + (y - 5*u) + ' Q ' + (x - 9*u) + ' ' + (y + 0*u) + ' ' + (x - 4*u) + ' ' + (y + 6*u) + ' Q ' + (x - 1*u) + ' ' + (y + 8*u) + ' ' + (x + 5*u) + ' ' + (y + 4*u) + ' Q ' + (x + 8*u) + ' ' + (y + 1*u) + ' ' + (x + 6*u) + ' ' + (y - 3*u) + ' Q ' + (x + 3*u) + ' ' + (y - 4*u) + ' ' + (x + 1*u) + ' ' + (y - 1*u) + ' Q ' + (x - 2*u) + ' ' + (y - 9*u) + ' ' + (x - 6*u) + ' ' + (y - 5*u) + ' Z';
  part(g, d, color, INK, 2.1);
  detail(g, 'M ' + (x - 1*u) + ' ' + (y + 3*u) + ' Q ' + (x + 2*u) + ' ' + (y + 5*u) + ' ' + (x + 4*u) + ' ' + (y + 2*u), shade(color, -.2), 1.1);
}
