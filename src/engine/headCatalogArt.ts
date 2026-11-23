import { Graphics, type Container } from 'pixi.js';
import { ellipse, INK, segment } from './art.ts';
import { shade, type IllustratedView } from './illustration.ts';
import { at, positionedPath, vector } from './wardrobeArt.ts';
import type { Character } from './schema.ts';
import type { FacialPerformance } from './facialAnimation.ts';

export const headShapes: Record<Character['shape'], [number,number,number,number,number]> = {
  oval:[.82,1,.78,.4,1], round:[.89,1.1,1,.55,.94], square:[1,1,1,.75,1],
  heart:[1.05,1.08,.72,.12,1], diamond:[.64,1.12,.62,.15,1.04], pear:[.68,.93,1.08,.64,1],
  'inverted-triangle':[1.08,.93,.65,.18,.96], oblong:[.91,.92,.94,.66,1.14], bean:[.82,.91,1,.48,1.03],
  egg:[.66,.97,1,.65,1.04], trapezoid:[.79,1,1.04,.8,1], capsule:[.86,.94,.94,.57,1.16], pentagon:[1.01,1.03,.78,.33,1]
};

export function headMetrics(c:Character,a:IllustratedView) {
  const [crown,cheek,jaw,chin,stretch]=headShapes[c.shape];
  const w=(c.shape==='round'?45:42)*(a.profile?.81:.95+a.width*.05);
  const q=c.wardrobe;
  return {w:w*cheek*(q?.cheekWidth??1),h:45*stretch*(q?.headStretch??1),
    crown:w*crown*(q?.crownWidth??1),jaw:w*jaw*(q?.jawWidth??1),chin:w*chin*(q?.chinWidth??1)};
}
export function headOutline(c: Character,a:IllustratedView) {
  const {w,h,crown,jaw,chin}=headMetrics(c,a);
  const top=-h, end=h, asym=c.shape==='bean'?7:0;
  if(a.profile) {
    const brow=w*.91, chinX=Math.min(w*.83,jaw+.5);
    return `M ${-w*.21} ${top} C ${-crown} ${top-1} ${-w-6} ${top*.55} ${-w} -3 Q ${-w-1} ${end*.66} ${-jaw*.35} ${end*.83}
      Q ${chinX-4} ${end+8} ${chinX} ${end*.69} Q ${w*.73} ${end*.48} ${w*.88} ${end*.36}
      L ${w-1} 7 Q ${brow-4} 1 ${brow} -9 Q ${w-1} ${top*.88} ${-w*.21} ${top}Z`;
  }
  const sharp=['square','oblong','diamond','pentagon','inverted-triangle','trapezoid'].includes(c.shape);
  const skew=asym+(a.face*.25);
  const radius=sharp?.22:.72;
  return `M ${-crown*radius+skew} ${top} Q ${skew} ${top-3} ${crown*radius+skew} ${top}
    C ${crown+skew} ${top} ${w+skew} ${-h*.52} ${w} ${-h*.09}
    Q ${jaw+2} ${end*.44} ${jaw} ${end*.62} Q ${jaw-1} ${end*.91} ${chin+skew} ${end}
    Q ${skew} ${end+(sharp?1:4)} ${-chin+skew} ${end} Q ${-jaw} ${end*.91} ${-jaw} ${end*.62}
    Q ${-w-1} ${end*.36} ${-w} ${-h*.09} C ${-w+asym} ${-h*.52} ${-crown+skew} ${top} ${-crown*radius+skew} ${top}Z`;
}

export const hairPaths: Partial<Record<Character['hair'],string>> = {
  pompadour:'M-41 -8Q-50 -35 -33 -46Q-20 -80 10 -73Q46 -76 41 -50Q43 -34 33 -20Q18 -35 -12 -26Q-35 -22 -41 -8Z',
  'spiky-crop':'M-41 -10L-49 -40L-34 -38L-29 -62L-17 -51L-8 -71L3 -53L21 -69L24 -52L44 -63L36 -45L49 -47L39 -14Q20 -29 -12 -21Z',
  'man-bun':'M-41 -7Q-51 -39 -27 -50L-23 -56Q-42 -78 -20 -82Q2 -86 1 -62Q43 -66 43 -16Q27 -35 5 -35Q-23 -28 -41 -7Z',
  'slicked-back':'M-42 -8Q-47 -35 -35 -48Q2 -66 40 -59Q48 -55 38 -37L36 -12Q18 -39 -2 -34Q-26 -27 -42 -8Z',
  'curtain-bangs':'M-42 20Q-56 -14 -38 -44Q-13 -67 3 -53Q36 -63 45 -39Q55 -8 39 24Q41 -21 6 -38Q-23 -14 -42 20Z',
  mullet:'M-43 37Q-49 17 -46 -16Q-50 -44 -28 -55Q-7 -65 15 -55Q44 -67 43 -39Q44 -25 35 -19Q21 -30 5 -32Q-12 -25 -30 -20L-24 33Q-32 46 -43 37Z',
  'side-part':'M-43 -8Q-53 -39 -29 -56Q3 -76 39 -55Q50 -47 39 -22Q19 -39 7 -44Q-7 -24 -31 -18L-39 3Z',
  bob:'M-47 27Q-52 -9 -44 -32Q-39 -61 -7 -59Q34 -68 47 -35Q52 -18 46 28L32 31Q39 9 30 -23Q6 -20 -8 -35Q-22 -13 -25 25Z',
  ponytail:'M-44 -10Q-47 -41 -27 -53Q-37 -73 -56 -54Q-81 -31 -64 34Q-62 57 -80 64Q-54 69 -47 39L-45 -21Q-21 -66 4 -56Q40 -61 44 -16Q20 -40 -9 -25Z',
  'space-buns':'M-41 -13Q-52 -24 -44 -43Q-67 -36 -67 -56Q-68 -79 -46 -80Q-24 -82 -25 -59Q0 -68 24 -59Q21 -81 44 -81Q67 -80 65 -58Q66 -40 48 -41Q47 -28 40 -14Q23 -40 2 -46Q-19 -37 -41 -13Z',
  pixie:'M-42 -8Q-50 -42 -28 -55Q-7 -71 22 -56Q45 -58 49 -44L34 -45L42 -22L23 -30L11 -19L-4 -26L-25 -13L-34 -23Z',
  waves:'M-52 63Q-65 50 -56 25Q-65 11 -56 -17Q-55 -56 -20 -61Q16 -69 41 -49Q61 -20 52 3Q62 29 53 48Q61 68 47 78L29 73Q38 48 31 35Q26 20 33 5Q36 -18 13 -37Q14 -20 -24 -9Q-34 7 -29 24Q-39 49 -30 71Z',
  'afro-puffs':'M-42 -13Q-53 -21 -47 -34Q-70 -25 -76 -44Q-91 -56 -76 -70Q-88 -88 -67 -92Q-59 -107 -43 -95Q-23 -95 -20 -67Q-9 -73 17 -65Q17 -91 37 -96Q58 -108 69 -90Q89 -83 76 -70Q88 -51 72 -45Q69 -26 47 -35Q49 -23 40 -12Q20 -44 2 -44Q-18 -37 -42 -13Z',
  'wolf-cut':'M-47 33L-48 17L-57 18L-51 -1L-54 -19Q-54 -50 -33 -54Q-23 -68 -7 -58Q21 -70 39 -52Q59 -35 49 -11L57 10L44 27L52 42L31 37Q40 4 25 -25L7 -20L1 -35L-18 -16L-21 -25Q-32 -8 -32 33Z',
  hime:'M-48 62L-47 -21Q-45 -56 -20 -59Q12 -67 37 -51Q49 -37 49 62H36L34 26H22V-19Q0 -15 -23 -18V26H-34V62Z',
  'top-knot':'M-42 -8Q-48 -37 -23 -52Q-35 -71 -17 -84Q-3 -90 9 -78Q29 -83 30 -67Q33 -58 20 -52Q40 -47 42 -19Q19 -32 -4 -30Q-23 -18 -42 -8Z'
};
export const hatPaths: Record<Exclude<Character['hat'],'none'>,string> = {
  cap:'M-41 0Q-38 -30 -6 -32Q23 -32 37 -6L48 -3Q63 0 58 6Q34 11 -41 5Z',
  beanie:'M-42 5Q-46 -39 -3 -42Q39 -45 43 5Z M-42 -5H43V7H-42Z',
  fedora:'M-48 3Q-54 -3 -35 -7L-25 -28Q-18 -38 1 -27Q23 -42 27 -24L35 -7Q58 -3 47 4Q4 17 -48 3Z',
  bucket:'M-48 8L-35 -8L-27 -32Q0 -40 27 -32L36 -8L49 9Q0 20 -48 8Z',
  cowboy:'M-58 -5Q-50 6 -29 -5L-23 -31Q-12 -39 -1 -30Q13 -41 25 -31L31 -6Q52 6 58 -7Q64 7 45 12Q0 22 -47 11Q-62 8 -58 -5Z',
  'flat-cap':'M-41 4Q-38 -24 2 -26Q39 -23 40 -4L52 1Q45 9 34 7Z',
  'top-hat':'M-46 1Q-51 -5 -27 -7L-31 -57Q0 -64 31 -57L27 -7Q52 -6 47 3Q0 15 -46 1Z',
  snapback:'M-41 2Q-42 -29 -15 -35H12Q35 -31 39 -5L61 -1V6H-41Z',
  ushanka:'M-46 25L-47 -1Q-46 -33 -12 -38Q41 -45 46 -4L46 25H31L28 5H-29L-31 25Z',
  visor:'M-42 -5Q0 -15 40 -5L56 0Q64 8 47 10Q8 -1 -42 3Z',
  'sun-hat':'M-66 10Q-71 1 -35 -10Q-31 -38 0 -40Q29 -39 37 -10Q78 -6 66 7Q45 18 10 11Q-30 28 -66 10Z',
  beret:'M-43 4Q-56 -5 -43 -20Q-30 -36 10 -33Q43 -31 44 -12Q43 4 24 7Z M1 -32l5 -8',
  cloche:'M-47 13Q-49 -21 -28 -33Q4 -50 32 -29Q48 -12 47 13Q30 3 -3 7Q-31 6 -47 13Z',
  'sun-visor':'M-42 -6Q0 -16 39 -7Q58 -1 63 10Q48 23 24 12Q4 0 -42 3Z',
  pillbox:'M-30 3V-21Q0 -34 30 -21V3Q0 13 -30 3Z',
  witch:'M-58 6Q-63 -1 -29 -8L-7 -69L17 -60L8 -49L35 -7Q61 -4 59 6Q0 22 -58 6Z',
  boater:'M-56 3Q-58 -4 -31 -8L-32 -28Q0 -39 32 -28L32 -8Q60 -6 55 5Q0 15 -56 3Z',
  headwrap:'M-44 14Q-52 -27 -22 -39Q-30 -57 -13 -61Q1 -61 11 -47Q41 -57 45 -24L44 13Q15 -4 -1 10Q-24 1 -44 14Z',
  fascinator:'M-26 3Q-57 -9 -42 -21Q-29 -30 -8 -15Q-19 -44 7 -44Q11 -25 0 -14Q34 -37 36 -19Q24 -6 -4 0Z',
  'slouch-beanie':'M-43 6Q-57 -17 -54 -36Q-54 -56 -28 -54Q18 -52 38 -30Q47 -17 45 6Z M-43 -4H45V8H-43Z'
};

export function drawCatalogHair(g:Graphics,c:Character,a:IllustratedView,w:number,h:number) {
  const path=hairPaths[c.hair];
  if(!path)return false;
  const sx=w/42, sy=h/45;
  const t=at(0,0,sx*(a.profile?.95:1),sy);
  vector(g,path,c.hairColor,INK,2.7,t);
  const lines=c.hair==='spiky-crop'?'M-35 -39l-6 23 M-7 -51l-8 18 M25 -48l-6 16':
    a.rear?'M-30 -39Q-4 -55 24 -40 M-25 -23q22 11 47 -1':'M-33 -32Q-13 -53 16 -51 M-26 -27Q-6 -42 26 -42';
  if(lines)vector(g,lines,'none',shade(c.hairColor,.27),1.65,t);
  if(a.rear) {
    const hairline=`M ${-w*.87} -20 Q ${-w*.92} 10 0 ${h*.56} Q ${w*.92} 10 ${w*.87} -20`;
    vector(g,`${hairline} L ${w*.66} ${-h*.91} Q 0 ${-h*1.1} ${-w*.66} ${-h*.91} Z`,c.hairColor,INK,0);
    vector(g,hairline,'none',shade(c.hairColor,-.22),1.3);
    vector(g,`M ${-w*.58} -25 Q 0 ${-h*.97} ${w*.57} -21 M ${-w*.62} -12 Q 0 ${-h*.61} ${w*.48} -10`,'none',shade(c.hairColor,.25),1.25);
  }
  return true;
}

export function drawHat(g:Graphics,c:Character,a:IllustratedView,w:number,h:number) {
  if(c.hat==='none')return;
  const color=c.wardrobe?.accessoryColor??c.shirt, trim=c.wardrobe?.trim??shade(color,.26);
  const wear=c.wardrobe?.hatWear??'forward';
  const directional=['cap','snapback','flat-cap','visor','sun-visor'].includes(c.hat);
  const brimAngle=directional&&wear==='sideways'?-18:0;
  const t=at(a.profile?3:0,-h+19,w/42*(a.profile&&wear==='backward'?-1:1),1,(c.wardrobe?.hatTilt??0)+brimAngle);
  const backBrim=directional&&!a.profile&&(a.rear!==(wear==='backward'));
  vector(g,backBrim ? 'M-41 5Q-40 -29 0 -32Q34 -31 41 5H14Q14 -8 0 -8Q-14 -8 -14 5Z':hatPaths[c.hat],color,INK,2.8,t);
  if (backBrim) vector(g,'M-16 3H16','none',trim,2.5,t);
  else if(c.hat==='headwrap')vector(g,'M-37 1Q-13 -9 11 -47 M-33 -20Q-3 -10 28 -28 M-15 2Q10 -15 36 -13','none',trim,2,t);
  else if(c.hat!=='fascinator')vector(g,'M-33 -5Q0 -11 33 -5','none',trim,2,t);
}

const eyePaths = {
  almond:'M-8 0Q-4 -7 1 -7Q6 -7 8 0Q5 7 0 7Q-5 7 -8 0Z',
  round:'M-7 0a7 7 0 1 0 14 0 7 7 0 1 0 -14 0Z',
  upturned:'M-8 2Q-4 -5 8 -6Q8 4 0 6Q-6 7 -8 2Z',
  downturned:'M-8 -4Q3 -6 8 4Q4 9 -2 5Q-7 2 -8 -4Z',
  hooded:'M-8 0Q0 -5 8 0Q7 6 0 7Q-7 6 -8 0Z',
  monolid:'M-8 1Q-2 -5 8 0Q4 5 -8 1Z',
  wide:'M-8 0a8 9 0 1 0 16 0 8 9 0 1 0 -16 0Z',
  squint:'M-8 0Q0 -5 8 -1Q4 3 -3 3Q-6 3 -8 0Z',
  bead:'M-4 0a4 4 0 1 0 8 0 4 4 0 1 0 -8 0Z',
  triangle:'M-8 -6L8 0L-2 7Z', relaxed:'M-8 0Q0 -6 8 0Q5 6 0 6Q-5 6 -8 0Z'
} satisfies Record<Character['eyes'],string>;
const pupils = {
  round:'M-2.3 0a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0 -4.6 0Z',
  slit:'M0 -3.2Q2 0 0 3.2Q-2 0 0 -3.2Z',
  heart:'M0 3Q-5 -1 -3 -3Q-1 -4 0 -2Q1 -4 3 -3Q5 -1 0 3Z',
  star:'M0 -4L1 -1L4 -1L2 1L2 4L0 2L-3 4L-2 1L-4 -1L-1 -1Z',
  cross:'M-3 -2l1 -1 2 2 2 -2 1 1 -2 2 2 2 -1 1 -2 -2 -2 2 -1 -1 2 -2Z'
};
type EyeLayer = { interior:Graphics; aperture:Graphics };
const eyesByFace=new WeakMap<Container,{eyes:EyeLayer[];eyewear:Graphics}>();
export function resetEyeLayers(face:Container) {
  let layers=eyesByFace.get(face);
  if(!layers){
    const eyes=Array.from({length:2},()=>{
      const interior=new Graphics(),aperture=new Graphics();
      face.addChild(interior,aperture);interior.mask=aperture;
      return {interior,aperture};
    });
    const eyewear=new Graphics();
    face.addChild(eyewear);layers={eyes,eyewear};eyesByFace.set(face,layers);
  }
  for(const layer of layers.eyes){layer.interior.clear();layer.aperture.clear();}
  layers.eyewear.clear();
  return layers;
}
const eyeAttitude:Partial<Record<FacialPerformance['expression'],number>>={surprised:1.44,excited:1.36,angry:.71,sleepy:.51,nervous:1.3,smug:.78,happy:.9};
export function drawEye(g:Graphics,layer:EyeLayer,c:Character,m:FacialPerformance,x:number,y:number,side:number,narrow:boolean,camera:boolean,faceShift:number) {
  const w=c.wardrobe, kind=c.eyes;
  const attitude=eyeAttitude[m.expression]??1;
  const left=side<0;
  const narrowControl=left?m.controls?.eyeNarrowLeft??0:m.controls?.eyeNarrowRight??0;
  const wideControl=left?m.controls?.eyeWideLeft??0:m.controls?.eyeWideRight??0;
  const eyeScale=Math.max(.16,Math.min(1.55,attitude+wideControl*.39-narrowControl*.40));
  const capturedBlink=left?m.controls?.blinkLeft??0:m.controls?.blinkRight??0;
  const sx=narrow?.72:1, sy=Math.max(.05,(1-Math.max(m.blink,capturedBlink))*(1-(w?.eyelid??0))*eyeScale);
  const t=at(x,y,sx*side,sy);
  if(kind==='bead') {
    if(sy>.15)vector(g,eyePaths.bead,w?.iris??INK,INK,0,t);
  } else if(sy>.18) {
    const {interior,aperture}=layer;
    aperture.path(positionedPath(eyePaths[kind],t)).fill('#ffffff');
    const compact=['squint','monolid','triangle'].includes(kind);
    vector(g,eyePaths[kind],w?.sclera??'#fff5e9',INK,1.35,t);
    const radius=Math.min(3.45,4.1*sy)*(compact?.68:1)*(narrow?.86:1);
    const pupilX=x+Math.max(-3.2*sx,Math.min(3.2*sx,m.gazeX+(camera?-faceShift*.105:faceShift*.035)))*(compact?.7:1);
    const pupilY=y+Math.max(-2,Math.min(2,m.gazeY))*sy*(compact?.35:.96)+(kind==='hooded'?.44:0);
    const iris=w?.iris??'#79564b';
    if(radius>.5) {
      ellipse(interior,pupilX,pupilY,radius,radius,shade(iris,-(w?.ring??.36)));
      ellipse(interior,pupilX,pupilY,radius*.76,radius*.76,iris);
      const pupilScale=Math.min(radius/2.25,(w?.pupilSize??1)*radius/3.7);
      vector(interior,pupils[w?.pupil??'round'],INK,INK,0,at(pupilX,pupilY,pupilScale));
      if(radius>2)ellipse(interior,pupilX-1,pupilY-1,.78,.72,'#ffffff');
    }
    if ((w?.veins??0)>.01) {
      interior.moveTo(x-6*sx,y).lineTo(x-4*sx,y+.5*sy).lineTo(x-5*sx,y+2*sy)
        .stroke({color:'#d56575',alpha:w?.veins,width:.65});
    }
  } else vector(g,'M-7 0Q0 2 7 0','none',INK,2,at(x,y));
  if((w?.undereye??0)>0) g.moveTo(x-6*sx,y+6*sy+1).quadraticCurveTo(x,y+9*sy+2,x+6*sx,y+6*sy+1)
    .stroke({color:'#78576d',alpha:w?.undereye,width:1.4,cap:'round'});
  const tilt=m.expression==='angry'?-4:m.expression==='sad'?3.8:m.expression==='nervous'?(side<0?-6.5:4.5):m.expression==='smug'?side*2:0;
  const browLift=left?m.controls?.browLeft??0:m.controls?.browRight??0;
  const browTilt=left?m.controls?.browTiltLeft??0:m.controls?.browTiltRight??0;
  const ox=x+side*(w?.browSpacing??0), oy=y-12+(w?.browOffset??0)-(attitude-1)*3.5-(m.expression==='nervous'?2:0)-browLift*5;
  const iy=tilt+browTilt*4+Math.tan((w?.browInner??0)*Math.PI/180)*5;
  const ey=-tilt-browTilt*4+Math.tan((w?.browOuter??0)*Math.PI/180)*5;
  const bend=(w?.browBend??0)*6;
  const trace=c.brows==='angled'?`M-9 ${ey}L-1 ${-6-bend}L9 ${iy}`:
    `M-9 ${ey}Q0 ${-(c.brows==='arched'?6:c.brows==='bold'?3:0)-bend} 9 ${iy}`;
  vector(g,trace,'none',shade(c.hairColor,-.09),(c.brows==='bold'?3.8:2.15)*(w?.browThickness??1),at(ox,oy,-side*sx,1));
}

export function drawEar(g:Graphics,c:Character,x:number,y:number,side:number) {
  const w=c.wardrobe, t=at(x,y,side,w?.earScale??1,side*(w?.earTilt??0));
  const tip=(w?.earTip??0)*8, lobe=(w?.earlobe??1)*8;
  const paths:Record<Character['ears'],string>={
    round:`M0 -7Q${-12-tip} -15 -10 0Q-10 ${lobe} 0 ${lobe}Z`,
    pointed:`M0 -5Q-7 -7 ${-16-tip} ${-17-tip}Q-17 4 -7 ${lobe}L0 6Z`,
    wide:`M0 -7Q${-12-tip} -12 -14 -7L-13 3Q-9 ${lobe} 0 ${lobe}Z`,
    small:`M0 -4Q-9 -8 -8 0Q-8 ${lobe*.6} 0 ${lobe*.6}Z`
  };
  vector(g,paths[c.ears],c.skin,INK,2.65,t);
  vector(g,'M-8 -1q4 -5 5 3','none',shade(c.skin,-.22),1.1,t);
}
export function drawNose(g:Graphics,c:Character,a:IllustratedView,x:number) {
  const q=c.wardrobe, h=q?.noseLength??1, width=q?.noseWidth??1, tint=shade(c.skin,-.26);
  const t=at(x,8,width,h,q?.noseTilt??0);
  const paths:Record<Character['nose'],string>={
    minimal:'M1 -6l-4 9 6 1',button:'M-5 1Q-5 -4 1 -4Q7 -3 6 1Q4 5 -4 3Z',
    wedge:'M0 -6L-5 3L6 3Z',long:'M0 -8Q-4 -3 -4 3Q-6 5 -1 6Q6 7 5 2',
    flat:'M-7 2Q-7 -2 -3 -1Q0 -5 4 -1Q9 -2 8 3Q5 5 -6 4Z'
  };
  const profilePaths:Record<Character['nose'],string>={
    minimal:'M-4 -5L5 1L-4 4',button:'M-4 -5Q9 -2 8 2Q5 6 -4 4',
    wedge:'M-4 -6L9 2L-4 5',long:'M-4 -8Q2 -4 7 1Q11 5 5 7L-5 5',
    flat:'M-6 -5Q7 -3 9 1Q9 6 -7 4'
  };
  vector(g,a.profile?profilePaths[c.nose]:paths[c.nose],c.nose==='minimal'?'none':c.skin,tint,a.profile?1.85:1.45,t);
  const flare=(q?.noseFlare??0)*2;
  if(c.nose!=='minimal')ellipse(g,x+(a.profile?1.5:-2.4-flare*.48),10.6,(.78+flare*.5)*width,.76,tint);
  if((q?.noseBlush??0)>.01)g.ellipse(x+(a.profile?3:0),9,4.6*width,2.1*h).fill({color:'#db7876',alpha:(q?.noseBlush??0)*.68});
}

const mustaches = {
  pencil:'M-13 18Q-6 14 -1 17M1 17Q6 14 13 18',
  chevron:'M-16 16Q-6 10 0 15Q7 10 16 16L13 21Q4 18 0 19Q-5 17 -13 21Z',
  handlebar:'M-21 12Q-21 18 -13 15Q-4 9 0 15Q5 9 13 15Q21 18 21 12Q27 20 16 22Q8 21 0 19Q-8 21 -16 22Q-27 20 -21 12Z',
  walrus:'M-17 14Q0 8 17 14L18 23L10 21L7 23L0 19L-7 23L-10 21L-18 23Z'
};
const chins = {
  'soul-patch':'M-5 35Q0 33 5 35L0 40Z',
  goatee:'M-10 36Q0 40 10 36Q12 43 0 48Q-12 43 -10 36Z',
  pointed:'M-11 36Q0 41 11 36Q11 48 0 55Q-11 48 -11 36Z',
  braided:'M-16 35Q0 43 16 35Q16 52 9 57Q12 64 5 70Q8 78 0 82Q-8 78 -5 70Q-12 64 -9 57Q-16 51 -16 35Z'
};
const beardProfiles = {
  none:['none','none','none'],stubble:['none','none','stubble'],full:['chevron','none','full'],
  goatee:['none','goatee','none'],'van-dyke':['pencil','pointed','none'],'circle-beard':['chevron','goatee','none'],
  'mutton-chops':['none','none','mutton-chops'],'chin-strap':['none','none','chin-strap'],
  handlebar:['handlebar','none','none'],'soul-patch':['none','soul-patch','none'],'braided-beard':['walrus','braided','full']
} as const;
export function drawBeard(g:Graphics,c:Character,a:IllustratedView,center:number,w:number,h:number) {
  if(a.rear)return;
  const options=c.wardrobe, [upper,lower,jaw]=beardProfiles[c.beard], hair=c.hairColor;
  const top=options?.mustache&&options.mustache!=='auto'?options.mustache:upper;
  const chin=options?.chinHair&&options.chinHair!=='auto'?options.chinHair:lower;
  const cheek=options?.jawHair&&options.jawHair!=='auto'?options.jawHair:jaw;
  const length=options?.beardLength??1, width=options?.beardWidth??1, fullness=options?.beardFullness??1;
  const scale=a.profile?.66:1;
  const topT=at(center-(a.profile?3:0),18*(1-fullness),scale*width,fullness);
  if(top!=='none')vector(g,mustaches[top],top==='pencil'?'none':hair,hair,top==='pencil'?2.15:0,topT);
  if(chin!=='none'){
    vector(g,chins[chin],hair,shade(hair,-.2),1.25,at(center,35*(1-length),scale*width,length));
    if(chin==='braided')vector(g,'M-8 52q8 7 16 0 M-5 63q5 5 10 0 M-4 73h8','none',shade(hair,.28),1.4,at(center,35*(1-length),scale*width,length));
  }
  if(c.beard==='circle-beard'&&!a.profile&&options?.chinHair!== 'none'){
    for(const sign of [-1,1])vector(g,'M13 18Q18 29 8 39','none',hair,2.6,at(center,0,sign*width,1));
  }
  if(cheek==='none')return;
  const edge=w*.87, y=h*.88, jawTop=cheek==='chin-strap'?25:10;
  if(cheek==='stubble') {
    const edgeX=a.profile?center-6:0;
    for(let i=0;i<27;i++){
      const x=edgeX+(i%9-4)*w*.17, py=y+(Math.floor(i/9)-1)*3-Math.abs(i%9-4)*2.6;
      g.circle(x,py,.66+(i%3)*.24).fill({color:hair,alpha:.32*fullness});
    }
  } else if(a.profile){
    const join=Math.min(w*.86,center+4), low=Math.max(y,37)+(length-1)*12;
    vector(g,`M ${-w*.47} ${jawTop} Q ${-w*.34} 26 ${-w*.14} 30 Q ${center-10} 37 ${join} 34
      Q ${join-2} ${low+5} ${join-9} ${low+7} Q ${-w*.4} ${low} ${-w*.47} ${jawTop} Z`,hair,shade(hair,-.24),1.1);
  } else if(cheek==='mutton-chops'){
    for(const sign of [-1,1])vector(g,`M ${edge} 10 Q ${edge+2} 36 ${edge*.57} ${y} L ${edge*.5} ${y-12*fullness} Q ${edge*.91} 25 ${edge} 10Z`,hair,INK,0,at(0,0,sign*width,1));
  } else {
    const low=y+(cheek==='full'?8*fullness:2)+(length-1)*10;
    vector(g,`M ${-edge} ${jawTop} Q ${-edge} ${low*.89} 0 ${low} Q ${edge} ${low*.89} ${edge} ${jawTop}
      L ${edge-7} ${jawTop+7} Q ${edge*.52} ${low-8} 0 ${Math.min(low-3,39)} Q ${-edge*.52} ${low-8} ${-edge+7} ${jawTop+7}Z`,hair,INK,0);
    vector(g,`M ${-edge*.52} ${low-7} Q0 ${low+3} ${edge*.52} ${low-7}`,'none',shade(hair,.24),1.2);
  }
}

export const eyewearPaths = {
  wayfarer:'M-12 -7L12 -7L10 8Q0 11 -10 8Z',
  wireframe:'M-10 0a10 10 0 1 0 20 0 10 10 0 1 0 -20 0Z',
  aviator:'M-12 -5Q0 -10 12 -5Q10 12 1 12Q-10 10 -12 -5Z',
  'cat-eye':'M-13 -10Q0 -6 12 -5Q11 8 1 9Q-9 10 -13 -10Z',
  browline:'M-12 -7H12V4Q12 9 7 9H-7Q-12 9 -12 4Z',
  oversized:'M-13 0a13 12 0 1 0 26 0 13 12 0 1 0 -26 0Z',
  visor:'M-13 -7Q0 -11 14 -5L12 8Q0 12 -12 5Z',
  monocle:'M-9 0a9 9 0 1 0 18 0 9 9 0 1 0 -18 0Z',
  'eye-patch':'M-12 -6Q0 -12 11 -5L5 9Q-8 13 -12 -6Z',
  shutters:'M-12 -8H12L10 7Q0 11 -10 7Z',
  novelty:'M0 11Q-18 -2 -11 -8Q-5 -13 0 -6Q5 -13 11 -8Q18 -2 0 11Z',
  goggles:'M-13 -9H10Q14 -8 14 -3V4Q11 11 1 11H-9Q-15 8 -15 0Z',
  cinema:'M-12 -8H12V8H-12Z',taped:'M-12 -7H10Q12 -7 12 -4V8H-12Z'
};
type Closet = NonNullable<Character['wardrobe']>;
export function drawEyewear(g:Graphics,c:Character,view:IllustratedView,eyes:number[],y:number) {
  const w=c.wardrobe,kind=w?.eyewear??(c.glasses?'wayfarer':'none');
  if(kind==='none'||view.rear)return;
  const frame=w?.frame??'#353047',rim=w?.rim??1.7,lens=w?.lens??'#46526a',y0=kind==='goggles'?y-2:y;
  const single=kind==='monocle'||kind==='eye-patch';
  const widths=eyes.map((_,i)=>i&&view.face?.81:1);
  if(kind==='visor'&&eyes.length>1){
    const middle=(eyes[0]+eyes[1])/2;
    const shape=eyewearPaths.visor, t=at(middle,y0,(eyes[1]-eyes[0]+22)/27,1);
    const opacity=w?.lensOpacity??.52;
    if(opacity)g.path(positionedPath(shape,t)).fill({color:lens,alpha:opacity});
    vector(g,shape,'none',frame,rim,t);
    if(w?.glint!==false)vector(g,'M-9 -3l5 -3','none','#fcf8ed',.8,t);
    return;
  }
  if(!single&&eyes.length>1) {
    segment(g,eyes[0]+10,y0-3,eyes[1]-8,y0-3,kind==='taped'?'#fbf4dd':frame,kind==='taped'?3.9:rim);
    if(kind==='aviator')segment(g,eyes[0]+9,y0-6,eyes[1]-7,y0-6,frame,1);
  }
  eyes.forEach((x,i)=>{
    if(single&&i)return;
    const t=at(x,y0,widths[i]*(kind==='cat-eye'&&i?-1:1),1);
    const d=eyewearPaths[kind], dark=kind==='eye-patch';
    const tint=kind==='cinema'?(i?'#4bcbe5':'#f66566'):lens;
    const opacity=dark?1:kind==='cinema'?.6:w?.lensOpacity??.19;
    if (opacity>0) {
      // Separate color from frame so a clear lens keeps the outline.
      const shape=positionedPath(d,t);
      g.path(shape).fill({color:dark?frame:tint,alpha:opacity});
    }
    vector(g,d,'none',frame,rim,t);
    if(kind==='shutters')vector(g,'M-11 -4H11 M-10 0H10 M-9 4H9','none',frame,rim,t);
    if(kind==='browline')vector(g,'M-12 -7H12','none',frame,rim+1.6,t);
    if(kind==='taped')vector(g,'M-3 -6L-1 -1L4 -1L-1 1L2 6','none','#fff9ec',.85,t);
    if(kind==='monocle')vector(g,'M7 7Q11 12 9 23','none',frame,1,t);
    if(w?.glint!==false&&!dark&&kind!=='shutters')vector(g,'M-6 -3l5 -3','none','#fcf8ed',.85,t);
  });
  if(view.profile||kind==='eye-patch')segment(g,eyes[0]-11,y0-3,-20,y0-1,frame,rim);
}

const piercingPaths = {
  stud:'M-2 0l2 -2 2 2 -2 2Z',huggie:'M-3 2a3 4 0 1 0 6 0 3 4 0 1 0 -6 0Z',
  'large-hoop':'M-5 7a5 8 0 1 0 10 0 5 8 0 1 0 -10 0Z',
  drop:'M0 0V8M0 8Q-6 15 0 17Q6 15 0 8Z',
  gauge:'M-4 0a4 4 0 1 0 8 0 4 4 0 1 0 -8 0Z',
  cuff:'M-5 -11q4 -3 8 -1 M-6 -8q4 -3 8 -1',
  charm:'M0 0V15M-4 9H4',septum:'M-4 -2Q-5 5 0 5Q5 5 4 -2',
  nostril:'M-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0 -3 0Z',
  eyebrow:'M-1 -4L1 4 M-2 -4H0 M0 4H2',lip:'M-3 -3a3 4 0 1 0 6 0 3 4 0 1 0 -6 0Z',bridge:'M-5 0H5 M-6 -1l1 2 M6 -1l-1 2'
};
export function drawPiercing(g:Graphics,c:Character,art:IllustratedView,ears:number[],center:number) {
  const w=c.wardrobe,kind=w?.piercing??(c.earrings?'huggie':'none');
  if(kind==='none')return;
  const metal=w?.metal??'#e7ba65', scale=w?.piercingSize??1, side=w?.piercingSide??'left';
  if(['septum','nostril','eyebrow','lip','bridge'].includes(kind)){
    if(art.rear)return;
    const d=side==='right'?1:-1;
    const x=kind==='eyebrow'?center+d*16:kind==='nostril'||kind==='lip'?center+d*5:center;
    const y=kind==='eyebrow'?-17:kind==='lip'?29:kind==='bridge'?2:12;
    vector(g,piercingPaths[kind],kind==='nostril'?metal:'none',metal,1.45,at(x,y,scale));return;
  }
  for(const [i,x] of ears.entries()){
    if ((side==='left'&&i!==0)||(side==='right'&&i!==1)) continue;
    vector(g,piercingPaths[kind],['stud','gauge','drop'].includes(kind)?metal:'none',metal,1.7,at(x-2,13,scale));
  }
}

export const extraPaths:Record<Exclude<Closet['extra'],'none'|undefined>,string> = {
  headphones:'M-39 -4Q-49 -53 0 -54Q49 -53 39 -4 M-44 -10q-5 0 -5 5v16q0 4 5 4h8v-25Z M36 -10h8q5 0 5 5v16q0 4 -5 4h-8Z',
  earbuds:'M-42 1q8 -2 7 5l-3 8h-3l1 -7q-5 0 -2 -6Z M42 1q-8 -2 -7 5l3 8h3l-1 -7q5 0 2 -6Z',
  chain:'M-15 1Q0 36 15 1 M-3 22a3 4 0 1 0 6 0 3 4 0 1 0 -6 0Z',
  choker:'M-14 0Q0 5 14 0V6Q0 11 -14 6Z',scarf:'M-19 -4Q0 5 19 -4V9Q0 17 -19 9Z M7 7h11v28H7Z',
  bandana:'M-22 1Q0 8 22 1L3 29Q-12 20 -22 1Z',mask:'M-24 9Q0 16 24 9L20 32Q0 43 -20 32Z',
  tie:'M-4 0H4L6 6L2 10L5 31L0 37L-5 31L-2 10L-6 6Z',
  lanyard:'M-13 0L0 26L13 0 M-7 23H7V36H-7Z',
  sticker:'M0 -6L2 -2L6 -1L3 2L4 6L0 4L-4 6L-3 2L-6 -1L-2 -2Z',
  bandage:'M-9 -3H9V3H-9Z M-3 -2H3V2H-3Z',
  headband:'M-42 -4Q0 -16 42 -4L41 3Q0 -7 -41 3Z',
  crown:'M-25 1l-6 -19 16 8 15 -18 14 18 17 -8 -6 19Z',
  halo:'M-22 0a22 6 0 1 0 44 0 22 6 0 1 0 -44 0Z'
};
export function drawExtra(g:Graphics,c:Character,a:IllustratedView,w:number,h:number,part:'head'|'torso',x=0,y=0) {
  const q=c.wardrobe, kind=q?.extra??c.accessory;
  if(kind==='none')return;
  const head=['earbuds','headphones','mask','sticker','bandage','headband','crown','halo'].includes(kind);
  if((part==='head')!==head)return;
  if(a.rear&&['mask','sticker','bandage','tie','lanyard','chain','bandana'].includes(kind))return;
  const color=['chain','crown','halo'].includes(kind)?q?.metal??'#e7ba65':q?.accessoryColor??(kind==='scarf'?'#edb76e':'#404363');
  const dx=kind==='sticker'?(a.profile?15:23):0,dy=kind==='sticker'?16:kind==='bandage'?8:
    kind==='headband'?-h*.52:kind==='crown'?-h+5:kind==='halo'?-h-29:0;
  const t=at(x+dx,y+dy,head?w/42:a.profile?.76:1,1,kind==='bandage'?-14:0);
  const outlineOnly=['halo','chain','headphones'].includes(kind);
  vector(g,extraPaths[kind],outlineOnly?'none':color,outlineOnly?color:INK,outlineOnly?3:1.55,t);
  if(kind==='headphones')vector(g,'M-44 -10h8v25h-8Z M36 -10h8v25h-8Z',color,INK,1.4,t);
  if(kind==='mask')vector(g,'M-20 18q20 7 40 0 M-19 24q19 8 38 0','none',shade(color,-.24),1.1,t);
}
