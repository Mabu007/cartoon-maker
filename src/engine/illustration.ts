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

export type HandPose = 'relaxed'|'open'|'point'|'grip'|'fist'|'pinch'|'palm-up'|'thumbs-up'|'count';

/**
 * Five independent articulated fingers with two phalanges each.
 * Finger silhouettes are built from reusable rounded vector strokes, then
 * the palm covers their roots. Curl blends from a neutral hand to the desired
 * pose, so automatic gestures grow and recover rather than popping on/off.
 * This is a screen-readable cartoon rig, not an anatomical simulation.
 */
export function drawIllustratedHand(g:Graphics,x:number,y:number,width:number,color:string,
  pose:HandPose='relaxed',facing:-1|1=1,blend=1) {
  const u=Math.max(.35,width/10),fraction=Math.max(0,Math.min(1,blend));
  const sx=(v:number)=>x+facing*v*u,sy=(v:number)=>y+v*u;
  const handOutline=INK,shadow=shade(color,-.21),highlight=shade(color,.16);
  const path=(points:[number,number][])=>'M '+points.map(([px,py])=>sx(px)+' '+sy(py)).join(' L ');
  const finger=(points:[number,number][],thickness=3.35)=>{
    const d=path(points);
    part(g,d,'none',handOutline,(thickness+2.15)*u);
    part(g,d,'none',color,thickness*u);
  };
  const styles:Record<HandPose,{curl:[number,number,number,number];thumb:number;spread:number}>={
    relaxed:{curl:[.46,.43,.49,.56],thumb:.45,spread:.10},
    open:{curl:[0,0,0,0],thumb:0,spread:.29},
    'palm-up':{curl:[.07,.03,.05,.08],thumb:0,spread:.29},
    point:{curl:[.02,.97,.97,.96],thumb:.68,spread:.05},
    grip:{curl:[.8,.84,.85,.83],thumb:.78,spread:.03},
    fist:{curl:[1,1,1,1],thumb:.95,spread:0},
    pinch:{curl:[.24,.78,.8,.81],thumb:.28,spread:0},
    'thumbs-up':{curl:[.96,.98,.98,.95],thumb:-.55,spread:0},
    count:{curl:[.02,.02,.97,.97],thumb:.74,spread:.12}
  };
  const rest=styles.relaxed,target=styles[pose]??rest;
  const selected=[0,1,2,3] as const;
  // Draw far fingers first and thumb last for coherent overlap.
  for(const i of selected){
    const curl=rest.curl[i]+(target.curl[i]-rest.curl[i])*fraction;
    const spread=rest.spread+(target.spread-rest.spread)*fraction;
    const initial=(-1.5+i)*spread;
    const length=[13.5,16.5,16.1,12.7][i];
    const rootX=-5.6+i*3.85,rootY=-6+Math.abs(i-1.5)*.5;
    const a1=initial+curl*.85;
    const bend=initial+curl*2.15;
    const mid:[number,number]=[rootX+Math.sin(a1)*length*.57,rootY-Math.cos(a1)*length*.57];
    const tip:[number,number]=[mid[0]+Math.sin(bend)*length*.43,mid[1]-Math.cos(bend)*length*.43];
    finger([[rootX,rootY],mid,tip],i===3?2.9:3.35);
    if(curl<.72)part(g,path([[mid[0]-1,mid[1]+.1],[mid[0]+.9,mid[1]+.6]]),'none',shadow,.72*u);
  }
  part(g,`M ${sx(-8.5)} ${sy(-7)} Q ${sx(-9.7)} ${sy(-1)} ${sx(-7.4)} ${sy(5.5)}
    Q ${sx(-3.3)} ${sy(10)} ${sx(4.5)} ${sy(7.6)}
    Q ${sx(10.5)} ${sy(4.7)} ${sx(9)} ${sy(-5.7)}
    Q ${sx(3.9)} ${sy(-9.7)} ${sx(-8.5)} ${sy(-7)} Z`,color,handOutline,2.1*u);
  const thumbCurl=rest.thumb+(target.thumb-rest.thumb)*fraction;
  const thumbStart:[number,number]=[-7.8,2.1];
  const thumbMid:[number,number]=[-11.5+thumbCurl*7,-2.7-thumbCurl*1.3];
  const thumbTip:[number,number]=thumbCurl<0?[-8.7,-19]:[-14+thumbCurl*15,-8+thumbCurl*6];
  finger([thumbStart,thumbMid,thumbTip],4.1);
  // Separate the knuckles without introducing distracting line clutter.
  for(let i=0;i<3;i++){
    const kx=-4.8+i*3.9;
    part(g,path([[kx,-5.6],[kx+.8,-4.8]]),'none',shadow,.85*u);
  }
  part(g,path([[-5.3,3],[-2.3,4.1],[1.3,3.7]]),'none',highlight,1.15*u);
}
