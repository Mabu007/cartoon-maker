import { GraphicsPath, type Graphics } from 'pixi.js';
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

// Reuse stable vector outlines instead of reparsing them on every animation
// frame. The cache is bounded because posed arms/legs produce unique paths.
const pathCache = new Map<string, GraphicsPath>();
const MAX_CACHED_PATHS = 384;
export function illustratedPath(d: string): GraphicsPath {
  const cached = pathCache.get(d);
  if (cached) return cached;
  const path = new GraphicsPath(d);
  if (pathCache.size >= MAX_CACHED_PATHS) pathCache.delete(pathCache.keys().next().value!);
  pathCache.set(d, path);
  return path;
}
function part(g: Graphics, d: string, fill: string, stroke = INK, width = 3) {
  const path = illustratedPath(d);
  if (fill !== 'none') g.path(path).fill(fill);
  if (stroke !== 'none' && width > 0) g.path(path).stroke({ color: stroke, width, cap: 'round', join: 'round' });
}
function detail(g: Graphics, d: string, color: string, width = 1.8) {
  part(g, d, 'none', color, width);
}

export function drawIllustratedHair(g: Graphics, c: Character, art: IllustratedView, w: number, h: number) {
  if (c.hair === 'bald') return;
  const color = c.hairColor, light = shade(color, .35), mid = shade(color, .18), dark = shade(color, -.18);
  const profile = art.profile, back = art.rear;
  const left = -w + 2, right = w - 1;
  const crown = -h - 5;
  const scalp = 'M ' + left + ' -8 C ' + (-w - 6) + ' ' + (crown + 13) + ' ' + (-w * .72) + ' ' + (crown - 6) + ' -3 ' + (crown - 7) +
    ' C ' + (w * .55) + ' ' + (crown - 11) + ' ' + (w + 7) + ' ' + (crown + 12) + ' ' + right + ' -8';
  const closeCap = back
    ? ' Q ' + (w + 2) + ' 31 0 35 Q ' + (-w - 5) + ' 29 ' + left + ' -8 Z'
    : ' Q ' + (w - 6) + ' -20 ' + (w * .36) + ' -26 Q 0 -19 ' + (-w * .3) + ' -23 Q ' + (-w + 6) + ' -16 ' + left + ' -8 Z';
  if (c.hair === 'buzz' || c.hair === 'fade') {
    // Barbered silhouette and realistic tapered side panels, not a helmet.
    part(g, scalp + closeCap, color, INK, 2.6);
    const temple = 'M ' + left + ' -7 Q ' + (-w + 6) + ' -20 ' + (-w + 11) + ' -26 Q ' + (-w + 19) + ' -23 ' + (-w + 18) + ' -7 Q ' + (-w + 11) + ' -4 ' + left + ' -7 Z';
    part(g, temple, c.hair === 'fade' ? shade(c.skin, -.32) : dark, 'none', 0);
    detail(g, 'M ' + (-w + 5) + ' -15 Q ' + (-w + 16) + ' -27 ' + (-w + 25) + ' -25', light, 1.4);
    for (let i = 0; i < 7; i++) {
      const x = -w * .69 + i * w * .23;
      const y = crown - 3 + Math.abs(i - 3) * 1.6;
      detail(g, 'M ' + x + ' ' + y + ' q 3 -3 6 0', mid, c.hair === 'buzz' ? 1.25 : 1.65);
    }
    if (c.hair === 'fade') {
      detail(g, 'M ' + (-w + 6) + ' -14 Q ' + (-w + 11) + ' -18 ' + (-w + 15) + ' -18', shade(c.skin, .32), 2);
      detail(g, 'M ' + (-w + 3) + ' -7 Q ' + (-w + 13) + ' -10 ' + (-w + 16) + ' -9', mid, 1.4);
    }
  } else if (c.hair === 'afro') {
    // One continuous, irregular hand-illustrated outline with internal coils.
    const outline = 'M ' + (-w - 8) + ' -9 C ' + (-w - 23) + ' -17 ' + (-w - 19) + ' -35 ' + (-w - 9) + ' -40' +
      ' C ' + (-w - 23) + ' -53 ' + (-w - 8) + ' -69 ' + (-w * .65) + ' -65' +
      ' C ' + (-w * .55) + ' -83 ' + (-w * .25) + ' -85 -8 -78' +
      ' C 8 -92 30 -87 38 -73' +
      ' C ' + (w + 13) + ' -78 ' + (w + 25) + ' -62 ' + (w + 15) + ' -48' +
      ' C ' + (w + 29) + ' -39 ' + (w + 22) + ' -18 ' + (w + 10) + ' -11' +
      (back ? ' Q ' + (w + 11) + ' 25 0 34 Q ' + (-w - 13) + ' 24 ' + (-w - 8) + ' -9 Z'
        : ' Q ' + (w - 8) + ' -24 21 -26 Q 2 -17 -14 -27 Q ' + (-w + 4) + ' -28 ' + (-w - 8) + ' -9 Z');
    part(g, outline, color, INK, 3.2);
    for (const [x, y, r] of [[-31,-63,9],[-8,-73,8],[17,-71,9],[36,-57,8],[-43,-40,8],[1,-46,8],[27,-33,7]] as const) {
      detail(g, 'M ' + (x-r*.6) + ' ' + y + ' C ' + (x-r) + ' ' + (y-r) + ' ' + (x+r) + ' ' + (y-r) + ' ' + (x+r*.6) + ' ' + y, mid, 2);
      detail(g, 'M ' + (x-2) + ' ' + (y+2) + ' q 4 -4 7 0', light, 1.3);
    }
  } else if (c.hair === 'puff') {
    // Gathered base with a large asymmetrical puff and visible scrunchie.
    part(g, scalp + closeCap, color, INK, 2.8);
    const bx = profile ? -w*.3 : -w*.48, by = -h - 40;
    part(g, 'M ' + (bx-26) + ' ' + (by+14) + ' C ' + (bx-41) + ' ' + (by+2) + ' ' + (bx-36) + ' ' + (by-18) + ' ' + (bx-17) + ' ' + (by-24) +
      ' C ' + (bx-10) + ' ' + (by-41) + ' ' + (bx+13) + ' ' + (by-42) + ' ' + (bx+24) + ' ' + (by-23) +
      ' C ' + (bx+45) + ' ' + (by-20) + ' ' + (bx+40) + ' ' + (by+9) + ' ' + (bx+25) + ' ' + (by+14) +
      ' C ' + (bx+13) + ' ' + (by+29) + ' ' + (bx-16) + ' ' + (by+27) + ' ' + (bx-26) + ' ' + (by+14) + ' Z', color, INK, 3);
    part(g, 'M ' + (bx-9) + ' ' + (by+23) + ' q 10 6 21 -2', 'none', '#c9aa8d', 4);
    for (const [dx,dy] of [[-24,-6],[-8,-25],[17,-20],[26,5],[-7,2]] as const) {
      detail(g, 'M ' + (bx+dx-5) + ' ' + (by+dy) + ' q 3 -7 10 0', mid, 1.9);
    }
    detail(g, 'M ' + (-w+13) + ' -29 Q -2 -24 ' + (w-11) + ' -35', light, 1.6);
  } else if (c.hair === 'curls') {
    // Scalloped but connected curl mass; textured curled strands, not bubbles.
    const outline = 'M ' + (-w-6) + ' -8 Q ' + (-w-15) + ' -21 ' + (-w-7) + ' -37' +
      ' Q ' + (-w-18) + ' -53 ' + (-w+2) + ' -59 Q ' + (-w+3) + ' -78 -17 -69' +
      ' Q 1 -86 16 -71 Q 40 -80 ' + (w+3) + ' -58 Q ' + (w+22) + ' -52 ' + (w+10) + ' -35' +
      ' Q ' + (w+21) + ' -22 ' + (w+6) + ' -8' +
      (back ? ' Q 0 28 ' + (-w-6) + ' -8 Z' : ' Q 31 -24 22 -27 Q 0 -18 -13 -26 Q -30 -21 ' + (-w-6) + ' -8 Z');
    part(g, outline, color, INK, 3);
    for (const [x,y] of [[-34,-47],[-18,-62],[0,-56],[19,-65],[34,-49],[-38,-29],[-7,-35],[22,-32]] as const) {
      detail(g, 'M ' + (x-7) + ' ' + (y+3) + ' C ' + (x-10) + ' ' + (y-7) + ' ' + (x+6) + ' ' + (y-8) + ' ' + (x+6) + ' ' + (y+1) +
       ' Q ' + (x+4) + ' ' + (y+6) + ' ' + (x+1) + ' ' + (y+3), mid, 2);
    }
  } else {
    // Locs and braids share a closely fitted crown but have distinct hair fibres.
    part(g, scalp + closeCap, color, INK, 2.7);
    const braids = c.hair === 'braids';
    const strands = profile ? [-w+8, w-8] : [-w+8, -w+18, w-18, w-8];
    for (let i = 0; i < strands.length; i++) {
      const x = strands[i], side = x < 0 ? -1 : 1;
      const end = back ? 38 : 27 + (i % 2) * 6;
      const d = 'M ' + x + ' ' + (-h+7) + ' C ' + (x+side*7) + ' -24 ' + (x+side*5) + ' -3 ' + (x+side*4) + ' ' + end;
      detail(g, d, INK, braids ? 8.5 : 12);
      detail(g, d, color, braids ? 5.4 : 8.4);
      if (braids) {
        for (let y = -27; y < end-3; y += 8) {
          const off = side*4 + (y > 0 ? side*1 : 0);
          detail(g, 'M ' + (x+off-3) + ' ' + y + ' l 6 5 M ' + (x+off+3) + ' ' + y + ' l -6 5', light, 1.4);
        }
        part(g, 'M ' + (x+side*3-3) + ' ' + (end-1) + ' q 3 7 6 0 Z', color, dark, 1.2);
      } else {
        for (let y = -20; y < end; y += 12) detail(g, 'M ' + (x+side*4-2) + ' ' + y + ' q 3 3 5 0', light, 1.1);
      }
    }
    if (braids) {
      for (let i = 0; i < 5; i++) {
        const x = -w+15+i*(w*1.6/4);
        detail(g, 'M ' + x + ' ' + (crown-3) + ' Q ' + (x+2) + ' ' + (crown+13) + ' ' + (x+(i-2)*2) + ' -23', i%2 ? mid : light, 2);
      }
    } else {
      for (const x of [-18,0,18]) {
        detail(g, 'M ' + x + ' ' + (crown+2) + ' Q ' + (x+8) + ' -30 ' + (x+5) + ' -18', mid, 2);
      }
    }
  }
  if (back) detail(g, 'M ' + (-w*.60) + ' -8 Q 0 1 ' + (w*.60) + ' -8', mid, 1.2);
}

export type HandPose = 'relaxed' | 'open' | 'point' | 'grip' | 'fist';

/**
 * Articulated cartoon hand silhouettes: five visible digits at gesturing scale,
 * finger separation, thumb fold, and an extended index for pointing.
 */
export function drawIllustratedHand(g: Graphics, x: number, y: number, width: number, color: string, pose: HandPose = 'relaxed', facing: -1 | 1 = 1) {
  const u = width / 10, sign = facing;
  const fx = (a: number) => x + a * u * sign;
  const fy = (a: number) => y + a * u;
  const outline = (d: string, weight = 2) => part(g, d, color, INK, weight);
  const seam = (d: string, weight = 1.2) => detail(g, d, shade(color, -.24), weight);
  if (pose === 'point') {
    // Index finger is one clearly extended finger; the remaining three curl
    // into the palm, with the thumb wrapping over the knuckles.
    outline('M ' + fx(-6) + ' ' + fy(-4) + ' Q ' + fx(-8) + ' ' + fy(1) + ' ' + fx(-5) + ' ' + fy(6) +
      ' Q ' + fx(0) + ' ' + fy(9) + ' ' + fx(7) + ' ' + fy(4) +
      ' L ' + fx(9) + ' ' + fy(1) + ' Q ' + fx(12) + ' ' + fy(-1) + ' ' + fx(10) + ' ' + fy(-4) +
      ' L ' + fx(7) + ' ' + fy(-5) + ' L ' + fx(25) + ' ' + fy(-7) +
      ' Q ' + fx(29) + ' ' + fy(-9) + ' ' + fx(26) + ' ' + fy(-12) +
      ' Q ' + fx(24) + ' ' + fy(-13) + ' ' + fx(21) + ' ' + fy(-12) +
      ' L ' + fx(4) + ' ' + fy(-11) + ' Q ' + fx(-2) + ' ' + fy(-13) + ' ' + fx(-6) + ' ' + fy(-4) + ' Z', 2.35);
    seam('M ' + fx(-4) + ' ' + fy(2) + ' q ' + (8*u*sign) + ' ' + (-3*u) + ' ' + (13*u*sign) + ' ' + (2*u), 1.35);
    for (const [sx,sy] of [[2,5],[6,3],[9,1]] as const) seam('M ' + fx(sx) + ' ' + fy(sy) + ' l ' + (2*u*sign) + ' ' + (-2*u), 1.05);
    return;
  }
  if (pose === 'open') {
    // Open hand has four separated fingers and a distinct thumb.
    outline('M ' + fx(-7) + ' ' + fy(4) + ' Q ' + fx(-11) + ' ' + fy(0) + ' ' + fx(-10) + ' ' + fy(-3) +
      ' L ' + fx(-12) + ' ' + fy(-13) + ' Q ' + fx(-12) + ' ' + fy(-18) + ' ' + fx(-8) + ' ' + fy(-18) +
      ' Q ' + fx(-5) + ' ' + fy(-18) + ' ' + fx(-4) + ' ' + fy(-12) +
      ' L ' + fx(-3) + ' ' + fy(-22) + ' Q ' + fx(-2) + ' ' + fy(-26) + ' ' + fx(1) + ' ' + fy(-25) +
      ' Q ' + fx(4) + ' ' + fy(-24) + ' ' + fx(3) + ' ' + fy(-15) +
      ' L ' + fx(6) + ' ' + fy(-20) + ' Q ' + fx(9) + ' ' + fy(-24) + ' ' + fx(12) + ' ' + fy(-21) +
      ' Q ' + fx(14) + ' ' + fy(-18) + ' ' + fx(10) + ' ' + fy(-11) +
      ' L ' + fx(14) + ' ' + fy(-13) + ' Q ' + fx(17) + ' ' + fy(-13) + ' ' + fx(17) + ' ' + fy(-9) +
      ' Q ' + fx(15) + ' ' + fy(-4) + ' ' + fx(8) + ' ' + fy(3) +
      ' Q ' + fx(1) + ' ' + fy(9) + ' ' + fx(-7) + ' ' + fy(4) + ' Z');
    seam('M ' + fx(-3) + ' ' + fy(-10) + ' L ' + fx(-2) + ' ' + fy(-3));
    seam('M ' + fx(4) + ' ' + fy(-11) + ' L ' + fx(3) + ' ' + fy(-2));
    seam('M ' + fx(10) + ' ' + fy(-7) + ' L ' + fx(6) + ' ' + fy(0));
    return;
  }
  if (pose === 'grip' || pose === 'fist') {
    outline('M ' + fx(-9) + ' ' + fy(-4) + ' Q ' + fx(-9) + ' ' + fy(-10) + ' ' + fx(-3) + ' ' + fy(-11) +
      ' L ' + fx(10) + ' ' + fy(-10) + ' Q ' + fx(16) + ' ' + fy(-7) + ' ' + fx(13) + ' ' + fy(-2) +
      ' Q ' + fx(15) + ' ' + fy(5) + ' ' + fx(7) + ' ' + fy(9) +
      ' Q ' + fx(-4) + ' ' + fy(11) + ' ' + fx(-9) + ' ' + fy(3) + ' Z', 2.2);
    for (let n = 0; n < 3; n++) seam('M ' + fx(-1+n*4.2) + ' ' + fy(-8) + ' q ' + (2*u*sign) + ' ' + (5*u) + ' 0 ' + (7*u), 1.25);
    if (pose === 'grip') seam('M ' + fx(-8) + ' ' + fy(-1) + ' Q ' + fx(1) + ' ' + fy(5) + ' ' + fx(7) + ' ' + fy(1), 1.6);
    return;
  }
  // Calm relaxed hand: palm and separated finger tips, even at thumbnail size.
  outline('M ' + fx(-7) + ' ' + fy(-4) + ' Q ' + fx(-9) + ' ' + fy(0) + ' ' + fx(-6) + ' ' + fy(7) +
    ' Q ' + fx(-2) + ' ' + fy(10) + ' ' + fx(3) + ' ' + fy(8) +
    ' L ' + fx(12) + ' ' + fy(0) + ' Q ' + fx(15) + ' ' + fy(-5) + ' ' + fx(12) + ' ' + fy(-7) +
    ' Q ' + fx(10) + ' ' + fy(-10) + ' ' + fx(7) + ' ' + fy(-7) +
    ' Q ' + fx(6) + ' ' + fy(-11) + ' ' + fx(3) + ' ' + fy(-10) +
    ' Q ' + fx(1) + ' ' + fy(-11) + ' ' + fx(-2) + ' ' + fy(-9) +
    ' Q ' + fx(-5) + ' ' + fy(-9) + ' ' + fx(-7) + ' ' + fy(-4) + ' Z', 2.1);
  seam('M ' + fx(2) + ' ' + fy(-1) + ' Q ' + fx(6) + ' ' + fy(1) + ' ' + fx(9) + ' ' + fy(-2));
  seam('M ' + fx(-2) + ' ' + fy(3) + ' Q ' + fx(1) + ' ' + fy(6) + ' ' + fx(4) + ' ' + fy(3));
}
