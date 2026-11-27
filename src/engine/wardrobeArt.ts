import { FillPattern, Matrix, Texture, type Graphics } from 'pixi.js';
import { ellipse, INK, rect, segment } from './art.ts';
import { illustratedPath, shade, type IllustratedView } from './illustration.ts';
import type { Point } from './animation.ts';
import { bodyProportions } from './bodyBuild.ts';
import type { Character } from './schema.ts';

type Closet = NonNullable<Character['wardrobe']>;
export type CostumeTexture = (source: string) => Texture | undefined;

export function vector(g: Graphics, path: string, fill = 'none', outline = INK, width = 1.8, matrix?: Matrix) {
  const shape = positionedPath(path,matrix);
  const use = () => g.path(shape);
  if (fill !== 'none') use().fill(fill);
  if (width) use().stroke({color:outline, width, cap:'round', join:'round'});
}

export function positionedPath(path: string, transform?: Matrix) {
  const shape = illustratedPath(path);
  // Keep the cached instructions independent of any later Graphics transform.
  // A nested addPath shares its child when Pixi clones the outer path.
  return transform ? shape.clone(true).transform(transform) : shape;
}

export function at(x: number, y: number, sx = 1, sy = sx, angle = 0) {
  const a = angle * Math.PI / 180;
  return new Matrix(sx * Math.cos(a), sx * Math.sin(a), -sy * Math.sin(a), sy * Math.cos(a), x, y);
}

export function costumeImages(character: Character) {
  const w = character.wardrobe;
  return [...(character.visual?.components??[]).map(component=>component.image),w?.patternImage, w?.logoImage, w?.bagLogo, w?.shoeLogo].filter((image): image is string => Boolean(image));
}
type PatternKey = 'stripes' | 'plaid' | 'camo' | 'dots';
const patterns = new WeakMap<Texture, Map<string,FillPattern>>();
function repeat(texture: Texture, scale: number, rotation: number) {
  let cache = patterns.get(texture);
  if (!cache) { cache = new Map(); patterns.set(texture, cache); }
  const key = scale + '/' + rotation;
  let pattern = cache.get(key);
  if (!pattern) {
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    pattern = new FillPattern(texture, 'repeat');
    const size = 17 * scale / Math.max(1,texture.width,texture.height);
    pattern.setTransform(at(0,0,size,size,rotation));
    cache.set(key,pattern);
  }
  return pattern;
}
const tileCanvases = new Map<string,HTMLCanvasElement>();
function fabricTile(kind: PatternKey, color: string) {
  const key=kind+color;
  let canvas=tileCanvases.get(key);
  if (canvas) return canvas;
  canvas=document.createElement('canvas');
  canvas.width=48; canvas.height=48;
  const ctx=canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle=color;
  if (kind==='stripes') ctx.fillRect(0,0,13,48);
  if (kind==='plaid') {
    ctx.globalAlpha=.55; ctx.fillRect(5,0,9,48); ctx.fillRect(0,7,48,9);
    ctx.fillRect(31,0,3,48); ctx.fillRect(0,34,48,3);
  }
  if (kind==='dots') {
    for (const [x,y] of [[12,12],[36,36]]) {ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();}
  }
  if (kind==='camo') {
    ctx.fill(new Path2D('M2 17Q1 7 13 8T24 17Q27 25 14 28T2 17 Z M31 2Q46 1 46 8T34 15Q27 8 31 2Z M27 36Q25 30 35 28T45 39Q43 47 32 46Z'));
    ctx.globalAlpha=.42;ctx.fill(new Path2D('M0 30Q13 29 17 38T8 48L0 48Z M26 19Q29 11 38 17T41 26Q31 29 26 19Z'));
  }
  if(tileCanvases.size>=32)tileCanvases.delete(tileCanvases.keys().next().value!);
  tileCanvases.set(key,canvas);
  return canvas;
}
const tileTextures = new WeakMap<HTMLCanvasElement, Texture>();
export function drawFabric(g: Graphics, path: string, base: string, w: Closet | undefined, texture?: CostumeTexture, transform?: Matrix) {
  vector(g,path,base,INK,0,transform);
  let image = w?.patternImage ? texture?.(w.patternImage) : undefined;
  if (!image && w?.pattern && w.pattern !== 'solid') {
    const tile = fabricTile(w.pattern, w.trim ?? '#e9d7bc');
    image = tileTextures.get(tile);
    if (!image) {image = Texture.from(tile); tileTextures.set(tile,image);}
  }
  if (image && (w?.patternOpacity ?? .65)>0) {
    g.path(positionedPath(path,transform))
      .fill({fill:repeat(image,w?.patternScale??1,w?.patternRotation??0),alpha:w?.patternOpacity??.65});
  }
  vector(g,path,'none',INK,2.35,transform);
}

export function decal(g: Graphics, image: string | undefined, x: number, y: number, width: number, height: number, texture?: CostumeTexture) {
  const graphic = image && texture?.(image);
  if (!graphic) return;
  const scale = Math.min(width / graphic.width, height / graphic.height);
  const w = graphic.width * scale, h = graphic.height * scale;
  g.rect(x-w/2,y-h/2,w,h).fill({texture:graphic,textureSpace:'local'});
}

export const topShapes = {
  tee:[24,19,0], 'oversized-tee':[29,25,8], polo:[24,20,0], 'dress-shirt':[24,20,3],
  hoodie:[27,23,5], tracksuit:[25,19,1], blazer:[27,20,5], biker:[27,21,3], tank:[17,18,0],
  sweater:[24,19,2], jacket:[25,22,3], uniform:[25,20,2], 'fitted-tee':[21,15,-5],
  blouse:[24,17,-1], camisole:[15,15,-6], 'cropped-hoodie':[26,21,-14], cardigan:[25,19,4],
  'slip-dress':[16,16,22], sundress:[20,16,28], athleisure:[18,17,-18], 'fitted-turtleneck':[21,15,0], bikini:[23,16,0], shirtless:[24,18,0]
} satisfies Record<Character['outfit'], [number,number,number]>;

export function drawTop(g: Graphics,c: Character,view: IllustratedView,neck: Point,hip: Point,texture?: CostumeTexture) {
  const w=c.wardrobe, kind=c.outfit, [shoulders,waist,hem]=topShapes[kind];
  const x=neck.x, top=neck.y+2, bx=hip.x, mid=hip.y+2;
  const dress=kind==='slip-dress'||kind==='sundress';
  const fit=w?.hem??0;
  const bottom=mid+hem+fit*(dress?(fit>0?-hip.y*.58:16):11)-(w?.tucked?5:0);
  const build=bodyProportions(c);
  const a=shoulders*view.width*c.thickness*build.shoulder, waistBase=waist*view.width*c.thickness*(w?.waist??1);
  const b=waistBase*build.waist, end=waistBase*build.hip*(dress?(kind==='sundress'?1.77:1.12):1);
  const shoulderLine=kind==='camisole'?8:12;
  const chestY=top+24, bellyY=mid-13+Math.min(0,hem), chest=a*build.chest*.32;
  const front= view.rear ? -1 : 1, profile=view.profile||Math.abs(view.face)>0;
  const leftChest=x-a-(profile?0:chest), rightChest=x+a+(view.rear?0:chest);
  const leftHip=bx-end-(view.rear||view.profile?end*(build.hip-1)*.46:0);
  const legacyPath=`M ${x-9} ${top-4} Q ${x-a} ${top} ${x-a} ${top+shoulderLine} L ${bx-b} ${mid-15+Math.min(0,hem)} L ${bx-end} ${bottom-2} Q ${bx} ${bottom+5} ${bx+end} ${bottom-2} L ${bx+b} ${mid-15+Math.min(0,hem)} L ${x+a} ${top+shoulderLine} Q ${x+a} ${top} ${x+9} ${top-4} Z`;
  const path=build.shoulder===1 && build.waist===1 && build.hip===1 && build.chest===0 && (c.visual?.abdomen??1)===1 ? legacyPath : `M ${x-9} ${top-4} Q ${x-a} ${top} ${x-a} ${top+shoulderLine} Q ${leftChest} ${chestY} ${bx-b} ${bellyY} Q ${bx-b*build.bell/Math.max(1,build.waist)} ${bottom-5} ${leftHip} ${bottom-2} Q ${bx} ${bottom+5} ${bx+end} ${bottom-2} Q ${bx+b*build.bell/Math.max(1,build.waist)} ${bottom-5} ${bx+b} ${bellyY} Q ${rightChest+(profile?front*chest:0)} ${chestY} ${x+a} ${top+shoulderLine} Q ${x+a} ${top} ${x+9} ${top-4} Z`;
  const bare=kind==='shirtless'||kind==='bikini';
  if(bare){
    vector(g,path,c.skin,INK,2.35);
    const contour=shade(c.skin,-.24);
    if(kind==='shirtless'){
      if(view.rear)vector(g,`M ${x} ${top+13} Q ${x-4} ${top+27} ${bx} ${mid-6}`,'none',contour,1.3);
      else if(c.bodyBuild?.abs){
        const center=x+(view.profile?a*.26:view.face*.16), scale=Math.min(1,a/22);
        vector(g,`M ${center-9*scale} ${top+18} Q ${center} ${top+24} ${center+10*scale} ${top+18} M ${center} ${top+25} L ${bx+(center-x)} ${mid-6}`,'none',contour,1.35);
        for(let row=0;row<3;row++){
          const y=top+26+row*Math.max(3,(mid-top-31)/3);
          const px=center+(bx-x)*row/4, radius=(8-row)*scale;
          vector(g,`M ${px-radius} ${y} q ${radius*.45} 4 ${radius*.75} 3 M ${px+radius} ${y} q ${-radius*.45} 4 ${-radius*.75} 3`,'none',contour,1.35);
        }
      }
    }else{
      const trim=w?.trim??shade(c.shirt,.22);
      const band=a*(view.rear?.86:.8)+chest*.52;
      const y=top+16, cx=x+(view.profile?a*.18:0);
      const swimTop=view.rear?
        `M ${cx-band} ${y} Q ${cx} ${y+6} ${cx+band} ${y} L ${cx+band} ${y+8} Q ${cx} ${y+13} ${cx-band} ${y+8}Z`:
        `M ${cx-band} ${y+1} Q ${cx-band*.55} ${y-11} ${cx} ${y+1} Q ${cx+band*.55} ${y-11} ${cx+band} ${y+1} L ${cx+band} ${y+11} Q ${cx} ${y+17} ${cx-band} ${y+11}Z`;
      for(const side of view.profile?[1]:[-1,1])segment(g,cx+side*band*.46,top,cx+side*band*.63,y+1,trim,2.2);
      drawFabric(g,swimTop,c.shirt,w,texture);
      const bottomWidth=Math.max(11,end*1.06), y2=mid-5;
      drawFabric(g,`M ${bx-bottomWidth} ${y2} Q ${bx} ${y2+4} ${bx+bottomWidth} ${y2} Q ${bx+bottomWidth*.8} ${y2+8} ${bx+bottomWidth*.41} ${y2+14} Q ${bx} ${y2+18} ${bx-bottomWidth*.41} ${y2+14} Q ${bx-bottomWidth*.8} ${y2+8} ${bx-bottomWidth} ${y2}Z`,c.pants,w,texture);
    }
    return;
  }
  const trim=w?.trim??shade(c.shirt,.4), dark=shade(c.shirt,-.31);
  const inside=(d:string,fill:string,stroke=dark,sw=1.4)=>vector(g,d,fill,stroke,sw);
  const seam=(d:string,color=dark,sw=1.45)=>inside(d,'none',color,sw);
  const hood=(kind==='hoodie'||kind==='cropped-hoodie')&&w?.hood!==false;
  drawFabric(g,path,c.shirt,w,texture);
  if (!view.rear && !view.profile) decal(g,w?.logoImage,x+a*.31,top+23,Math.min(a*1.15,22*(w?.logoScale??1)),15*(w?.logoScale??1),texture);
  g.path(illustratedPath(`M ${x+a-4} ${top+13} L ${bx+end-3} ${bottom-3} L ${bx+end-9} ${bottom-3} Q ${bx+b-2} ${mid-19} ${x+a-9} ${top+15} Z`))
    .fill({color:'#1a1021',alpha:.15});
  if(view.rear) {
    if(hood) inside(`M ${x-15} ${top-4} Q ${x} ${top-12} ${x+15} ${top-4} Q ${x+15} ${top+15} ${x} ${top+25} Q ${x-16} ${top+15} ${x-15} ${top-4}Z`,shade(c.shirt,-.16));
    else if(w?.neckline==='racerback')seam(`M ${x-10} ${top-1} L ${x} ${top+16} L ${x+10} ${top-1} M ${x} ${top+16}v12`,trim,2);
    else seam(`M ${x-a*.82} ${top+13} Q ${x} ${top+24} ${x+a*.82} ${top+13}`);
    if (['dress-shirt','blazer','jacket','biker','cardigan','uniform'].includes(kind)) seam(`M ${x} ${top+20} L ${bx} ${bottom-3}`,dark,1);
    return;
  }
  const f=x+(view.profile ? a*.58 : view.face*.23);
  const neckline=w?.neckline??'auto';
  if(hood) {
    inside(`M ${f-13} ${top-4} Q ${f} ${top+9} ${f+13} ${top-4} L ${f+13} ${top+7} Q ${f} ${top+19} ${f-13} ${top+7} Z`,shade(c.shirt,-.17));
    seam(`M ${f-4} ${top+9} l -1 12 M ${f+4} ${top+9} l 1 10`,trim,1.8);
    if (bottom>top+34) seam(`M ${bx-b*.63} ${bottom-14} q ${b*.63} 7 ${b*1.26} 0 l -1 7 h ${-b*1.18}Z`);
  } else if (['polo','dress-shirt','blouse','uniform'].includes(kind)) {
    inside(`M ${f-9} ${top-6} l 9 10 9 -10 4 10 -7 8 -6 -7 -6 7 -7 -8Z`,trim);
    const endY=kind==='polo'?top+23:bottom-2;
    seam(`M ${f} ${top+6} L ${kind==='polo'?f:bx+view.face*.15} ${endY}`);
    for(let y=top+13;y<endY;y+=7)ellipse(g,f+2,y,1,1,trim);
  } else if (['blazer','jacket','biker','cardigan','tracksuit'].includes(kind)) {
    const opening=w?.closure==='open'?Math.max(29,bottom-top-7):w?.closure==='closed'?14:30;
    inside(`M ${f-9} ${top-4} L ${f} ${top+opening} L ${f+8} ${top-4} Z`,trim);
    seam(kind==='biker'?`M ${f+8} ${top} L ${bx-9} ${bottom-4} M ${f+4} ${top+24} l 7 -4`:`M ${f} ${top+21} L ${bx+view.face*.2} ${bottom-3} M ${f-12} ${top+9} l 6 2 -3 5 9 9 M ${f+12} ${top+9} l -6 2 3 5 -9 9`);
    if(kind==='tracksuit')seam(`M ${x-a+3} ${top+13} L ${bx-b+3} ${bottom-7}`,trim,2.2);
  } else {
    const notch=['tank','camisole','athleisure','slip-dress','sundress'].includes(kind)?12:6;
    if (kind==='sweater'||kind==='fitted-turtleneck') {
      rect(g,f-10,top-9,20,12,shade(c.shirt,-.13),4,1.5);
      for (let i=-6;i<=6;i+=4) segment(g,f+i,top-6,f+i,top,dark,.8);
    } else seam(`M ${f-9} ${top-3} Q ${f} ${top+notch} ${f+9} ${top-3}`);
  }
  if(neckline==='bow')inside(`M ${f} ${top+10}l-9 -4v9l9 -4 9 4v-9Z`,trim);
  if(neckline==='v-neck')seam(`M ${f-11} ${top-2}l11 13 11 -13`,trim,2);
  if(neckline==='crew'||neckline==='racerback')seam(`M ${f-9} ${top-3}q9 14 18 0`,trim,2.2);
  if(neckline==='off-shoulder')seam(`M ${x-a+1} ${top+10}Q${f} ${top+18} ${x+a-1} ${top+5}`,trim,2.8);
  if (bottom>top+28) seam(`M ${bx-end+5} ${bottom-9} q 5 2 8 0`,dark,1);
}

export function sleeveCoverage(c: Character) {
  if (['tank','camisole','slip-dress','sundress','athleisure','shirtless','bikini'].includes(c.outfit)) return 0;
  if(c.wardrobe?.sleeve==='long')return 1.8;
  if(c.wardrobe?.sleeve==='rolled')return 1;
  return ['hoodie','cropped-hoodie','dress-shirt','tracksuit','blazer','biker','sweater','jacket','uniform','cardigan','blouse','fitted-turtleneck'].includes(c.outfit)?1.85:c.outfit==='oversized-tee'?.85:.56;
}

export const shoePaths = {
  classic:'M-10 -4Q-7 -9 -2 -6L5 -3Q14 -3 14 3Q13 6 -11 5Z',
  'high-top':'M-10 -14H-1L2 -8L9 -4Q15 -2 14 4L-11 5Z',
  runner:'M-11 -5L-5 -10L2 -7L8 -4Q16 -3 15 3L11 7H-10Q-15 4 -11 -5Z',
  skate:'M-11 -4Q-7 -7 -3 -6L1 -2Q16 -5 14 4L-12 5Z',
  oxford:'M-11 -6Q-4 -9 1 -5L12 -2Q17 0 14 4H-11Z',
  loafer:'M-12 -3Q-7 -8 -2 -5L4 -2Q12 -5 15 0L13 4H-12Z',
  boot:'M-11 -17H1L3 -7L12 -4Q16 -2 14 4L-12 6Z',
  chelsea:'M-9 -12H0L4 -5L12 -4Q17 -2 14 4H-11Z',
  heel:'M-10 -8Q-7 -8 0 -4L7 0L16 2L13 5L2 4L-5 0L-7 5H-9Z',
  platform:'M-11 -17H0L4 -7L13 -4Q17 -1 15 6L-12 7Z',
  slide:'M-12 0Q-3 -3 3 -2Q15 -3 15 3L13 5H-12Z',
  sandal:'M-11 -3Q0 -6 4 -3Q17 -4 14 4H-12Z',
  'flip-flops':'M-12 0Q0 -4 8 -3Q17 -2 15 3Q12 7 -11 5Z'
} satisfies Record<NonNullable<Closet['footwear']>,string>;

export function drawShoe(g:Graphics,c:Character,foot:Point,toe:number,texture?:CostumeTexture,rear=false) {
  const w=c.wardrobe, kind=w?.footwear??'classic';
  const sy=kind==='heel'?(w?.heelHeight??1):1;
  const t=at(foot.x+toe*4,foot.y,c.thickness*toe,sy);
  if(rear) {
    rect(g,foot.x-7*c.thickness,foot.y-5,14*c.thickness,11,c.shoes,4,2);
    segment(g,foot.x-5,foot.y+3,foot.x+5,foot.y+3,w?.sole??'#ddd8d1',2);
    return;
  }
  const open=['slide','sandal','flip-flops'].includes(kind);
  vector(g,shoePaths[kind],open?(w?.socks?w.trim??'#e9d7bc':c.skin):c.shoes,INK,2,t);
  vector(g,kind==='heel'?'M-8 4H-6M4 3l9 1':'M-10 4Q4 5 13 3','none',w?.sole??'#ddd8d1',kind==='platform'?4:1.7,t);
  if(kind==='slide')vector(g,'M-3 -2Q2 -9 8 -3L9 2H-2Z',c.shoes,INK,1.2,t);
  else if(kind==='sandal')vector(g,'M-9 -4h4v8h-4Z M1 -5h4v9H1Z',c.shoes,INK,1.1,t);
  else if(kind==='flip-flops')vector(g,'M-3 -3L7 0L1 4','none',c.shoes,2.2,t);
  else if(kind==='chelsea')vector(g,'M-8 -10H-2L-1 -3H-7Z',shade(c.shoes,-.34),INK,.8,t);
  else if(kind==='loafer')vector(g,'M-1 -4v3h7v-3Z',w?.metal??'#e7ba65',INK,.8,t);
  else if(kind!=='heel')vector(g,'M-2 -5l5 2M-4 -3l5 2','none',w?.laces??'#f3eadf',1,t);
  if(kind==='runner'||kind==='skate')vector(g,'M-8 -1l6 1 6 -2','none',w?.trim??'#e9d7bc',1.6,t);
  decal(g,w?.shoeLogo,foot.x+toe*9,foot.y,6,4,texture);
}

export const bagPaths = {
  crossbody:'M-13 -9Q-10 -13 6 -10L14 -6L12 6Q8 10 -11 7Z',
  tote:'M-15 -11H15L12 15H-12Z M-8 -11V-20Q0 -25 8 -20V-11',
  'shoulder-bag':'M-15 -5Q-5 -10 13 -7Q17 3 12 9Q0 13 -14 8Z M-10 -7Q-8 -22 2 -21Q9 -20 11 -8',
  backpack:'M-14 14V-9Q-14 -18 0 -19Q14 -18 14 -9V14Q0 19 -14 14Z',
  duffle:'M-21 -4Q-14 -12 11 -10Q22 -8 22 0Q23 11 13 12H-18Q-24 7 -21 -4Z M-9 -9V-15Q0 -20 9 -15V-9',
  messenger:'M-18 -11H18V13H-18Z',
  'waist-pack':'M-16 -6Q0 -11 16 -6L12 8H-12Z',
  clutch:'M-14 -6H14V7H-14Z'
} satisfies Record<Exclude<Closet['bag'],'none'|undefined>,string>;

export function drawBag(g:Graphics,c:Character,art:IllustratedView,neck:Point,hip:Point,hand?:Point,texture?:CostumeTexture) {
  const w=c.wardrobe,kind=w?.bag;
  if(!kind||kind==='none')return;
  const carry=['tote','duffle','clutch'].includes(kind);
  if(carry!==Boolean(hand))return;
  const color=w?.accessoryColor??'#404363', trim=w?.metal??'#e7ba65';
  const x=hand?.x??neck.x+(kind==='shoulder-bag'?-17:art.face*.37);
  const y=hand ? hand.y+20 : kind==='waist-pack'?hip.y-4:neck.y+(kind==='messenger'?43:29);
  const t=at(x,y,hand?1:art.profile?.74:1,1);
  if(!carry && kind!=='waist-pack') {
    const strap=w?.accessoryColor??'#404363';
    if(kind==='backpack') {
      for(const dx of [-14,14]) segment(g,neck.x+dx*art.width,neck.y+3,x+dx*.72,y+16,strap,3.6);
      if(!art.rear&&!art.profile)return;
    } else {
      segment(g,neck.x-(kind==='shoulder-bag'?12:17)*art.width,neck.y+4,x+7,y,strap,4);
      if(art.rear)return;
    }
  }
  drawFabric(g,bagPaths[kind],color,w,texture,t);
  vector(g,kind==='tote'?'M-8 -11V-20Q0 -25 8 -20V-11':kind==='messenger'?'M-17 -7l17 8 17 -8':kind==='duffle'?'M-12 -8V11M9 -9V11':'M-9 -2h18','none',trim,1.4,t);
  if(kind==='backpack')vector(g,'M-9 4h18v8h-18Z',shade(color,-.15),INK,1,t);
  decal(g,w?.bagLogo,x,y+3,14*(w?.logoScale??1),8,texture);
}

export const handheldPaths = {
  phone:'M-5 -15H5Q8 -15 8 -12V12Q8 15 5 15H-5Q-8 15 -8 12V-12Q-8 -15 -5 -15Z',
  coffee:'M-8 -10H8L5 12H-5Z M-9 -10v-3H9v3Z',
  controller:'M-15 -3Q-13 -10 -6 -7Q0 -4 6 -7Q13 -10 15 -3L19 8Q16 14 9 8L5 5H-5L-9 8Q-16 14 -19 8Z',
  microphone:'M-6 -12Q-7 -20 0 -20Q7 -20 6 -12L3 -5V13H-3V-5Z',
  'spray-can':'M-6 -10H6V14H-6Z M-3 -10v-5h6v5Z',
  skateboard:'M-5 -28Q0 -34 5 -28L7 25Q0 32 -7 25Z',
  tablet:'M-16 -10H16V11H-16Z',
  camera:'M-16 -8h10l2 -4h8l2 4h10v17h-32Z',
  clipboard:'M-10 -15h20v28h-20Z M-5 -15v-3H5v3Z',
  cash:'M-14 -8H13V7H-14Z M-12 -6H15V9H-12Z',
  drink:'M-7 -10H7L5 13H-5Z M2 -10l3 -9h4',
  sling:'M-12 -4Q-5 -12 9 -7L13 7L-9 9Z M-9 -6Q-4 -20 3 -15l7 8',
  umbrella:'M-15 -9Q0 -27 15 -9Q11 -12 7 -8Q3 -12 0 -8Q-4 -12 -8 -8Q-11 -12 -15 -9Z M0 -9V17q4 7 7 0',
  pet:'M-9 8Q-13 -2 -7 -7L-8 -15l7 5 7 -5 1 8Q13 -1 8 8Q5 14 -5 13Z'
} satisfies Record<Exclude<Closet['handheld'],'none'|undefined>,string>;
export function drawHandheld(g:Graphics,c:Character,hand:Point) {
  const w=c.wardrobe,kind=w?.handheld;
  if(!kind||kind==='none')return;
  const main=w?.accessoryColor??'#404363', screen=w?.trim??'#e9d7bc';
  const t=at(hand.x+5,hand.y-9,.85,.85,w?.propTilt??0);
  vector(g,handheldPaths[kind],main,INK,1.8,t);
  const details:Partial<Record<typeof kind,string>>={
    phone:'M-5 -11h10V9H-5Z', coffee:'M-7 -2H7L6 4H-6Z',
    controller:'M-12 -3h3v-3h3v3h3v3h-3v3h-3v-3h-3Z M8 -3h2v2H8Z M12 1h2v2h-2Z',
    microphone:'M-4 -13H4M-3 -16H3','spray-can':'M-5 -4H5V6H-5Z',
    skateboard:'M-3 -17l6 6M-3 4l6 6',tablet:'M-13 -7H13V8H-13Z',
    camera:'M-6 1a6 6 0 1 0 12 0 6 6 0 1 0 -12 0Z',clipboard:'M-7 -10H7V9H-7Z',
    cash:'M-8 -3H10V5H-8Z',drink:'M-5 2H5L4 10H-4Z',sling:'M-7 1H8',
    umbrella:'M0 -22Q-6 -16 -7 -9M0 -22Q6 -16 7 -9',pet:'M-4 -2h1m6 0h1 M-2 3q2 2 4 0'
  };
  const detail=details[kind];
  if(detail)vector(g,detail,['skateboard','microphone','sling','umbrella','pet'].includes(kind)?'none':screen,screen,.8,t);
}

export function drawWatch(g:Graphics,c:Character,hand:Point,elbow:Point) {
  const w=c.wardrobe,kind=w?.watch;
  if(!kind||kind==='none')return;
  const px=hand.x+(elbow.x-hand.x)*.14,py=hand.y+(elbow.y-hand.y)*.14;
  const angle=Math.atan2(hand.y-elbow.y,hand.x-elbow.x)*180/Math.PI-90;
  const metal=w?.metal??'#e7ba65', t=at(px,py,c.thickness,c.thickness,angle);
  vector(g,'M-6 -3H6V3H-6Z',kind==='leather-strap'?'#764936':metal,INK,1,t);
  if(kind==='bracelets') {
    vector(g,'M-6 0H6 M-6 4H6','none',w?.trim??'#e9d7bc',1.7,t);return;
  }
  const square=['digital','smartwatch'].includes(kind);
  vector(g,square?'M-4 -5H4Q6 -5 6 -3V3Q6 5 4 5H-4Q-6 5 -6 3V-3Q-6 -5 -4 -5Z':'M-5 0a5 5 0 1 0 10 0 5 5 0 1 0 -10 0Z',
    kind==='sport'?'#292437':metal,INK,1,t);
  vector(g,square?'M-3 -1h6v2h-6Z':'M0 -3V0L2 1','none',square?'#cceccf':INK,1,t);
}
