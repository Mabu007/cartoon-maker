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

/** Distinct upper-lip moustache and cheek/jaw beard, leaving the mouth visible. */
export function drawIllustratedFacialHair(g: Graphics, c: Character, art: IllustratedView, center: number, w: number) {
  if (c.beard === 'none' || art.rear) return;
  const hair = c.hairColor, highlight = shade(hair, .28);
  const x = Math.max(-w*.19, Math.min(w*.21, center));
  const side = art.profile ? .78 : 1;
  // Two tapered, independently outlined moustache lobes sit above (not on) the mouth.
  part(g, 'M ' + (x-1) + ' 17 Q ' + (x-7*side) + ' 12 ' + (x-16*side) + ' 16 Q ' + (x-12*side) + ' 23 ' + (x-3) + ' 20 Q ' + x + ' 19 ' + (x-1) + ' 17 Z', hair, 'none', 0);
  if (!art.profile) part(g, 'M ' + (x+1) + ' 17 Q ' + (x+8) + ' 12 ' + (x+16) + ' 16 Q ' + (x+12) + ' 23 ' + (x+3) + ' 20 Q ' + x + ' 19 ' + (x+1) + ' 17 Z', hair, 'none', 0);
  detail(g, 'M ' + (x-12*side) + ' 17 Q ' + (x-6*side) + ' 14 ' + (x-3) + ' 18', highlight, 1.1);
  if (c.beard === 'goatee') {
    // Vertical chin tuft, separated from both moustache and speaking mouth.
    part(g, 'M ' + (x-9*side) + ' 32 Q ' + (x-12*side) + ' 41 ' + x + ' 45 Q ' + (x+12*side) + ' 41 ' + (x+9*side) + ' 32 Q ' + (x+2) + ' 37 ' + (x-9*side) + ' 32 Z', hair, 'none', 0);
    detail(g, 'M ' + (x-4) + ' 37 Q ' + (x-1) + ' 40 ' + (x+1) + ' 38', highlight, 1.2);
  } else {
    // Sideburns follow the cheeks and form a connected U-shaped jawline.
    // The skin around the lips stays clear so facial speech remains legible.
    const outer = 'M ' + (-w+4) + ' 13 Q ' + (-w+2) + ' 32 ' + (-w*.53) + ' 39 Q 0 54 ' + (w*.54) + ' 39 Q ' + (w-3) + ' 31 ' + (w-4) + ' 13' +
      ' L ' + (w-11) + ' 23 Q ' + (w*.46) + ' 43 0 45 Q ' + (-w*.46) + ' 43 ' + (-w+11) + ' 23 Z';
    part(g, outer, hair, 'none', 0);
    detail(g, 'M ' + (-w*.52) + ' 38 Q 0 50 ' + (w*.52) + ' 38', highlight, 1.5);
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
