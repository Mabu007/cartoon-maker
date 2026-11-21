import { Graphics } from 'pixi.js';
import { scenePalettes } from './presets.ts';
import type { Prop, Scene } from './schema.ts';
import type { Point } from './animation.ts';

export const INK = '#292437';
export const rect = (g: Graphics, x: number, y: number, w: number, h: number, c: string, r = 0, stroke = 0, outline = INK) => {
  const shape = r ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
  shape.fill(c);
  if (stroke) shape.stroke({ color: outline, width: stroke, join: 'round' });
};
export const ellipse = (g: Graphics, x: number, y: number, w: number, h: number, c: string, stroke = 0, outline = INK) => {
  const shape = g.ellipse(x, y, w, h).fill(c);
  if (stroke) shape.stroke({ color: outline, width: stroke });
};
export const line = (g: Graphics, points: Point[], c = INK, width = 3) => {
  g.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) g.lineTo(point.x, point.y);
  g.stroke({ color: c, width, cap: 'round', join: 'round' });
};
export const segment = (g: Graphics, x: number, y: number, toX: number, toY: number, color = INK, width = 3) => line(g, [{ x, y }, { x: toX, y: toY }], color, width);
export const poly = (g: Graphics, xy: number[], color: string, width = 0, outline = INK) => {
  g.poly(xy).fill(color);
  if (width) g.stroke({ color: outline, width, join: 'round' });
};
function arc(g: Graphics, x: number, y: number, cx: number, cy: number, ex: number, ey: number, color: string, width: number) {
  g.moveTo(x, y).quadraticCurveTo(cx, cy, ex, ey).stroke({ color, width, cap: 'round' });
}
function frame(g: Graphics, x: number, y: number, w: number, h: number, mode: number) {
  rect(g, x + 5, y + 7, w, h, '#819073', 3);
  rect(g, x, y, w, h, '#77544a', 3, 3, '#554b47');
  rect(g, x + 6, y + 6, w - 12, h - 12, '#f1d9a3', 1);
  ellipse(g, x + w * .65, y + h * .35, w * .13, w * .13, '#e88257');
  poly(g, [x + 6, y + h - 11, x + w * .44, y + h * .4, x + w * .72, y + h - 11], mode ? '#5b826f' : '#9a735e');
  poly(g, [x + w * .35, y + h - 7, x + w * .72, y + h * .58, x + w - 6, y + h - 7], '#b78e6a');
}
export function drawWorld(g: Graphics, environment: Scene['environment']) {
  const [wall, panel, floor, edge] = scenePalettes[environment];
  rect(g, 0, 0, 960, 540, wall);
  if (environment === 'Township street') {
    ellipse(g, 759, 115, 62, 62, '#f8d997');
    poly(g, [0, 320, 83, 211, 172, 304, 265, 183, 390, 333, 520, 235, 665, 331, 960, 203, 960, 370, 0, 370], '#bc897c');
    for (const [x, y, w, color] of [[35, 241, 174, '#a37d91'], [270, 263, 169, '#c08b77'], [523, 205, 276, '#e2ad70'], [817, 243, 165, '#ae8e9c']] as const) {
      rect(g, x, y, w, 364 - y, color, 0, 4, edge);
      poly(g, [x - 9, y + 9, x + w * .44, y - 45, x + w + 12, y + 9], '#6e5467', 4, edge);
      rect(g, x + w * .3, y + 30, 38, 48, '#e0c092', 2, 4, edge);
    }
    rect(g, 0, 363, 960, 63, panel); rect(g, 0, 426, 960, 114, '#746477');
    segment(g, 0, 423, 960, 423, '#e3bf94', 4);
    for (let i = 0; i < 7; i++) rect(g, i * 155, 494, 70, 5, '#e8bda3', 2);
    return;
  }
  for (let x = 18; x < 960; x += 52) segment(g, x, 0, x, 326, environment === 'Living room' ? '#b4c09b' : panel, 1.4);
  rect(g, 0, 325, 960, 70, panel);
  for (let x = 12; x < 970; x += 77) rect(g, x, 338, 62, 41, panel, 2, 2, environment === 'Living room' ? '#b3b08b' : wall);
  rect(g, 0, 318, 960, 7, edge);
  rect(g, 0, 384, 960, 10, edge);
  rect(g, 0, 394, 960, 146, floor);
  for (let x = -400; x < 1400; x += 123) segment(g, 480 + (x - 480) * .69, 394, x, 540, environment === 'Living room' ? '#876b5d' : edge, 1.8);
  for (const y of [414, 443, 479, 521]) segment(g, 0, y, 960, y, environment === 'Living room' ? '#876b5d' : edge, 1.8);
  if (environment === 'Living room') {
    ellipse(g, 559, 468, 311, 58, '#826b5f');
    ellipse(g, 553, 461, 303, 56, '#d7aa79', 3, '#785e57');
    ellipse(g, 553, 461, 283, 47, '#e3be89', 2, '#b88766');
    ellipse(g, 553, 461, 260, 37, '#d6a477', 2, '#f3ce98');
    frame(g, 294, 114, 84, 100, 0); frame(g, 395, 144, 58, 68, 1);
    rect(g, 25, 43, 910, 3, '#bdc5a2', 2);
    ellipse(g, 842, 128, 31, 31, '#e8d2a0', 5, '#6a6850');
    segment(g, 842, 128, 842, 112, '#6a6850', 2.5); segment(g, 842, 128, 855, 134, '#6a6850', 2.5);
  } else if (environment === 'Classroom') {
    rect(g, 153, 94, 383, 175, '#885f4f', 9, 4); rect(g, 165, 106, 359, 150, '#5c8575', 4, 3);
    for (let i = 0; i < 4; i++) segment(g, 201, 136 + i * 24, 365 - (i % 2) * 33, 136 + i * 24, '#bcce9d', 3);
    rect(g, 424, 146, 54, 56, '#5c8575', 2, 3, '#d7c7a0');
  } else {
    for (let i = 0; i < 12; i++) rect(g, 55 + i * 78, 57, 39, 233, i % 2 ? '#716d91' : '#55526f', 19);
    rect(g, 274, 103, 411, 110, '#403a56', 14, 5, '#322b46');
    for (let i = 0; i < 19; i++) { const bar = 13 + (i * 11 % 49); rect(g, 332 + i * 16, 158 - bar / 2, 6, bar, i % 2 ? '#e9a4aa' : '#bba7ef', 3); }
  }
}
export const propSize: Record<Prop['kind'], [number, number]> = { sofa: [326, 126], chair: [104, 126], table: [188, 68], desk: [185, 99], door: [128, 245], window: [215, 120], television: [145, 96], lamp: [103, 200], cup: [33, 28], book: [55, 12], phone: [25, 33], plant: [76, 113], microphone: [36, 71], streetlight: [85, 223], counter: [155, 110], image: [140, 140] };
export function drawProp(g: Graphics, { kind, color }: Pick<Prop, 'kind' | 'color'>, doorOpen = 0) {
  switch (kind) {
    case 'image':
      rect(g, -68, -135, 136, 133, '#383047', 10, 3, '#d5a8e5');
      segment(g, -49, -37, -10, -82, '#c995e2', 6);
      segment(g, -10, -82, 42, -26, '#c995e2', 6);
      ellipse(g, 29, -100, 13, 13, '#f1c475');
      break;
    case 'sofa':
      ellipse(g, 9, -1, 158, 16, '#9e785f');
      for (const x of [-124, 112]) rect(g, x, -28, 19, 28, '#654b4a', 5, 3);
      rect(g, -137, -124, 274, 105, color, 28, 4);
      rect(g, -119, -109, 119, 69, color, 17, 2, '#a85f4b'); rect(g, 0, -109, 119, 69, color, 17, 2, '#a85f4b');
      rect(g, -151, -73, 302, 53, color, 18, 4);
      rect(g, -129, -71, 257, 27, '#ed9e69', 10, 3, '#ab684f');
      for (const x of [-155, 112]) rect(g, x, -85, 44, 64, color, 15, 4);
      rect(g, -114, -40, 229, 13, '#bd694e', 5);
      poly(g, [-112, -77, -104, -112, -62, -105, -58, -70], '#e6bd71', 3, '#8b604f');
      poly(g, [68, -70, 64, -104, 106, -112, 118, -77], '#d5ab93', 3, '#8b604f');
      break;
    case 'chair':
      for (const x of [-35, 26]) rect(g, x, -59, 9, 58, '#6c514a', 3, 3);
      rect(g, -41, -127, 82, 62, color, 13, 4); rect(g, -40, -76, 80, 42, color, 10, 4); break;
    case 'table': case 'desk': case 'counter': {
      const [w, h] = propSize[kind];
      for (const x of [-w * .37, w * .32]) poly(g, [x, -h + 17, x + 13, -h + 17, x + 6, 0, x - 5, 0], '#674a49', 3);
      if (kind === 'counter') rect(g, -w / 2 + 7, -h + 12, w - 14, h - 13, color, 9, 4);
      else if (kind === 'desk') rect(g, -w / 2 + 10, -h + 16, w - 20, 35, color, 4, 3);
      rect(g, -w / 2, -h, w, 24, color, 10, 4);
      segment(g, -w * .38, -h + 7, w * .38, -h + 7, '#b88b70', 2); break;
    }
    case 'door': {
      rect(g, -66, -246, 132, 247, '#66755f', 5, 3, '#586453');
      rect(g,-55,-235,110,235,'#303b38',1);
      const panel=110*(1-doorOpen*.84),slant=doorOpen*12;
      poly(g,[-55,-235,-55+panel,-235-slant,-55+panel,-slant,-55,0],color,3,'#555c4c');
      for (const y of [-219,-105]) rect(g,-48,y,panel*.73,82,color,3,2,'#858b71');
      ellipse(g,-55+panel*.8,-116-slant/2,Math.max(2,6*(1-doorOpen*.6)),6,'#e3b97d',2,'#635a4c');break;
    }
    case 'window':
      rect(g, -104, -111, 208, 111, '#809174', 7); rect(g, -109, -121, 211, 113, '#e7cd9e', 8, 5, '#64694f');
      rect(g, -99, -111, 191, 92, color, 3, 2, '#828366');
      ellipse(g, 58, -87, 12, 12, '#f0d49d');
      poly(g, [-98, -32, -47, -79, 4, -40, 46, -69, 91, -38, 91, -20, -98, -20], '#78a38b');
      poly(g, [-98, -24, -52, -53, -5, -29, 33, -52, 92, -26, 92, -20, -98, -20], '#658777');
      segment(g, -3, -112, -3, -20, '#e7cd9e', 5); segment(g, -99, -65, 91, -65, '#e7cd9e', 4);
      rect(g, -116, -16, 225, 12, '#ead1a4', 3, 3, '#64694f'); break;
    case 'television':
      rect(g, -72, -95, 144, 78, color, 10, 4); rect(g, -63, -86, 126, 58, '#7a8592', 7, 3);
      segment(g, 0, -16, 0, -2, INK, 8); segment(g, -31, -2, 31, -2, INK, 5); break;
    case 'lamp': case 'streetlight':
      ellipse(g, 0, -3, 37, 8, '#755d56', 3); segment(g, 0, -9, 0, kind === 'lamp' ? -158 : -211, '#65544d', 8);
      if (kind === 'lamp') {
        poly(g, [-29, -197, 27, -197, 47, -144, -47, -144], color, 3, '#80614f');
        segment(g, -14, -191, -20, -151, '#e2ab64', 2); segment(g, 14, -191, 21, -151, '#e2ab64', 2);
      } else { segment(g, 0, -211, 38, -222, color, 7); ellipse(g, 39, -221, 21, 8, '#f5cb86', 3); }
      break;
    case 'cup':
      ellipse(g, 13, -14, 11, 8, '#b38b70', 3); ellipse(g, 12, -14, 5, 4, '#754e4b');
      rect(g, -12, -26, 25, 24, color, 6, 2.5); ellipse(g, .5, -24, 10, 3, '#8f6051'); segment(g, -6, -15, 7, -15, '#cd8b66', 2); break;
    case 'book': rect(g, -26, -13, 53, 12, color, 3, 2.5); segment(g, -18, -6, 23, -6, '#f4d5a5', 3); break;
    case 'phone': rect(g, -12, -33, 24, 33, color, 5, 2.5); rect(g, -8, -28, 16, 21, '#aed5bb', 2); break;
    case 'plant':
      for (const [x, y, cx, cy] of [[-4, -101, -31, -70], [23, -95, 30, -54], [-33, -70, -31, -40], [39, -71, 31, -35]]) {
        arc(g, 0, -25, cx, cy, x, y, '#415c50', 3);
        ellipse(g, x - 4, y + 5, 11, 19, color, 2.2, '#415c50');
      }
      poly(g, [-27, -43, 27, -43, 18, 0, -18, 0], '#c58063', 3, '#684e48'); rect(g, -30, -46, 60, 11, '#dc9776', 3, 3, '#684e48'); break;
    case 'microphone':
      ellipse(g, 0, -2, 15, 4, color, 2); segment(g, 0, -5, 0, -39, INK, 4);
      rect(g, -11, -70, 22, 37, color, 9, 3); for (const y of [-61, -55, -49]) segment(g, -6, y, 6, y, '#a4a0ba', 1.5); break;
  }
}
