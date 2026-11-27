import {headRigHandles,type HeadRigHandle} from './headRigRecipe.ts';
import type {HeadDeformation} from './headDeformation.ts';
import type {Character} from './schema.ts';
import type {IllustratedView} from './illustration.ts';
import type {FacialPerformance} from './facialAnimation.ts';
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
export function headOutline(c: Character,a:IllustratedView,deformation?:HeadDeformation) {
  const {w,h,crown,jaw,chin}=headMetrics(c,a);
  const top=-h*(c.wardrobe?.forehead??1), end=h, asym=c.shape==='bean'?7:0;
  if(a.profile) {
    const brow=w*.91, chinX=Math.min(w*.83,jaw+.5);
    return `M ${-w*.21} ${top} C ${-crown} ${top-1} ${-w-6} ${top*.55} ${-w} -3 Q ${-w-1} ${end*.66} ${-jaw*.35} ${end*.83}
      Q ${chinX-4} ${end+8} ${chinX} ${end*.69} Q ${w*.73} ${end*.48} ${w*.88} ${end*.36}
      L ${w-1} 7 Q ${brow-4} 1 ${brow} -9 Q ${w-1} ${top*.88} ${-w*.21} ${top}Z`;
  }
  const sharp=['square','oblong','diamond','pentagon','inverted-triangle','trapezoid'].includes(c.shape);
  const skew=asym+(a.face*.25);
  const radius=sharp?.22:.72;
  const angle=c.wardrobe?.jawAngle;
  const jawCorner=angle===undefined?.62:.52+angle*.19;
  const jawCurve=angle===undefined?1:1+(angle-.5)*.13;
  const jawShift=(deformation?.yaw??0)*w*.09;
  const jawDepth=(deformation?.pitch??0)*h*.055;
  return `M ${-crown*radius+skew} ${top} Q ${skew} ${top-3} ${crown*radius+skew} ${top}
    C ${crown+skew} ${top} ${w+skew} ${-h*.52} ${w} ${-h*.09}
    Q ${jaw+2+jawShift*.3} ${end*.44} ${jaw*jawCurve+jawShift*.6} ${end*jawCorner+jawDepth*.3} Q ${jaw-1+jawShift} ${end*.91+jawDepth} ${chin+skew+jawShift} ${end+jawDepth}
    Q ${skew+jawShift} ${end+(sharp?1:4)+jawDepth} ${-chin+skew+jawShift} ${end+jawDepth} Q ${-jaw+jawShift} ${end*.91+jawDepth} ${-jaw*jawCurve+jawShift*.6} ${end*jawCorner+jawDepth*.3}
    Q ${-w-1} ${end*.36} ${-w} ${-h*.09} C ${-w+asym} ${-h*.52} ${-crown+skew} ${top} ${-crown*radius+skew} ${top}Z`;
}


export const eyePaths = {
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
export const pupils = {
  round:'M-2.3 0a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0 -4.6 0Z',
  slit:'M0 -3.2Q2 0 0 3.2Q-2 0 0 -3.2Z',
  heart:'M0 3Q-5 -1 -3 -3Q-1 -4 0 -2Q1 -4 3 -3Q5 -1 0 3Z',
  star:'M0 -4L1 -1L4 -1L2 1L2 4L0 2L-3 4L-2 1L-4 -1L-1 -1Z',
  cross:'M-3 -2l1 -1 2 2 2 -2 1 1 -2 2 2 2 -1 1 -2 -2 -2 2 -1 -1 2 -2Z'
};

const attitudeByExpression:Partial<Record<FacialPerformance['expression'],number>>={surprised:1.44,excited:1.36,angry:.71,sleepy:.51,nervous:1.3,smug:.78,happy:.9};
export function faceLandmarks(c:Character,art:IllustratedView){
  const {w,h}=headMetrics(c,art),q=c.wardrobe,center=art.profile?w*.62:art.face*w/42;
  const offset=q?.facialOffset??0,spacing=Math.min(w*.35,13*c.eyeSpacing);
  const eyes=art.rear?[]:art.profile?[center+offset]:[center-spacing+offset,Math.min(w-8,center+spacing*(art.face?.81:1)-offset)];
  return {w,h,center,eyes,eyeY:-5*h/45+(q?.eyeHeight??0),noseX:art.profile?w*.94:center,mouthX:art.profile?w*.65:center,mouthY:27+(q?.mouthHeight??0)};
}
type HandlePoint=Readonly<{x:number;y:number}>;
type CompiledHeadRig=Readonly<{
  width:number;height:number;eyeY:number;spacing:number;eyeWidth:number;offset:number;mouthY:number;
  handles:Readonly<Record<HeadRigHandle,HandlePoint>>;
}>;
const headFits=new Map<string,CompiledHeadRig>();
const ownerFits=new WeakMap<Character,WeakMap<IllustratedView,CompiledHeadRig>>();
const headFitLimit=48;
const neutralHandle=Object.freeze({x:0,y:0});
/** The family topology is shared. Only anatomy and named handle edits
 * affect this fit, so recoloring leaves the compiled coordinates reusable. */
export function compileHeadRig(c:Character,art:IllustratedView):CompiledHeadRig{
  let family=ownerFits.get(c);
  if(!family){family=new WeakMap();ownerFits.set(c,family);}
  const fitted=family.get(art);
  if(fitted)return fitted;
  const q=c.wardrobe,source=c.visual?.headRig;
  const handlePoints=headRigHandles.map(id=>source?.handles[id]??neutralHandle);
  const {w,h}=headMetrics(c,art);
  const key=JSON.stringify([source?.family??'catalog-head-v1',w,h,c.eyeSpacing,q?.facialOffset,q?.eyeWidth,
    q?.eyeHeight,q?.mouthHeight,handlePoints.map(point=>[point.x,point.y])]);
  const cached=headFits.get(key);
  if(cached){family.set(art,cached);return cached;}
  const handles=Object.fromEntries(headRigHandles.map((id,i)=>[id,Object.freeze({...handlePoints[i]})])) as Record<HeadRigHandle,HandlePoint>;
  const fit=Object.freeze({width:w,height:h,eyeY:-5*h/45+(q?.eyeHeight??0),spacing:Math.min(w*.35,13*c.eyeSpacing),
    eyeWidth:q?.eyeWidth??1,offset:q?.facialOffset??0,mouthY:27+(q?.mouthHeight??0),handles:Object.freeze(handles)});
  if(headFits.size===headFitLimit)headFits.delete(headFits.keys().next().value!);
  headFits.set(key,fit);
  family.set(art,fit);
  return fit;
}

/** Signed corrections leave the crown fixed and keep both eye apertures
 * within the face and on their respective sides of the facial center. */
export function deformFaceLandmarks(c:Character,art:IllustratedView,deformation:HeadDeformation){
  const fit=compileHeadRig(c,art),{width:w,height:h,handles}=fit,{yaw,pitch}=deformation;
  const turn=Math.abs(yaw),center=yaw*w*.21;
  const eyeY=fit.eyeY+pitch*h*.085;
  const far=yaw<0?0:1;
  const edge=Math.max(w*.45,w-12);
  const eye=(side:-1|1,index:number,handle:HandlePoint)=>{
    const width=index===far?1-.28*turn:1-.045*turn;
    const inset=Math.min(edge-side*center,8.5*width*fit.eyeWidth+1);
    const wanted=side*(fit.spacing*(index===far?1-.24*turn:1)-fit.offset+side*handle.x);
    const distance=Math.max(inset,side*wanted);
    return {x:center+side*Math.min(edge-side*center,distance),y:eyeY+handle.y,width};
  };
  const eyes=[eye(-1,0,handles['left-eye']),eye(1,1,handles['right-eye'])];
  return {center,eyes,eyeY,noseX:yaw*w*.26+handles.nose.x,noseY:8+pitch*h*.105+handles.nose.y,
    mouthX:yaw*w*.18+handles.mouth.x,mouthY:fit.mouthY+pitch*h*.10+handles.mouth.y,
    mouthWidth:1-.12*turn,earY:8*h/45-pitch*h*.055,
    farEarInset:turn*w*.18};
}

export function eyeIdentity(c:Character,m:FacialPerformance,x:number,y:number,side:number,narrow:boolean,camera:boolean,faceShift:number,yawWidth=1){
  const w=c.wardrobe,kind=c.eyes,left=side<0,attitude=attitudeByExpression[m.expression]??1;
  const narrowControl=left?m.controls?.eyeNarrowLeft??0:m.controls?.eyeNarrowRight??0;
  const wideControl=left?m.controls?.eyeWideLeft??0:m.controls?.eyeWideRight??0;
  const eyeScale=Math.max(.16,Math.min(1.55,attitude+wideControl*.39-narrowControl*.40));
  const capturedBlink=left?m.controls?.blinkLeft??0:m.controls?.blinkRight??0;
  const sx=(narrow?.72:1)*(w?.eyeWidth??1)*yawWidth,sy=Math.max(.05,(1-Math.max(m.blink,capturedBlink))*(1-(w?.eyelid??0))*eyeScale*(w?.lidCurvature??1));
  const angle=(w?.eyeTilt??0)*side,compact=['squint','monolid','triangle'].includes(kind);
  const radius=Math.min(3.45*(w?.irisSize??1),4.1*sy)*(compact?.68:1)*(narrow?.86:1);
  const pupilX=x+Math.max(-3.2*sx,Math.min(3.2*sx,m.gazeX+(camera?-faceShift*.105:faceShift*.035)))*(compact?.7:1);
  const pupilY=y+Math.max(-2,Math.min(2,m.gazeY))*sy*(compact?.35:.96)+(kind==='hooded'?.44:0);
  const tilt=m.expression==='angry'?-4:m.expression==='sad'?3.8:m.expression==='nervous'?(side<0?-6.5:4.5):m.expression==='smug'?side*2:0;
  const browLift=left?m.controls?.browLeft??0:m.controls?.browRight??0;
  const browTilt=left?m.controls?.browTiltLeft??0:m.controls?.browTiltRight??0;
  const ox=x+side*(w?.browSpacing??0),oy=y-12+(w?.browOffset??0)-(attitude-1)*3.5-(m.expression==='nervous'?2:0)-browLift*5+side*(w?.browAsymmetry??0);
  const iy=tilt+browTilt*4+Math.tan((w?.browInner??0)*Math.PI/180)*5;
  const ey=-tilt-browTilt*4+Math.tan((w?.browOuter??0)*Math.PI/180)*5,bend=(w?.browBend??0)*6;
  const browPath=c.brows==='angled'?`M-9 ${ey}L-1 ${-6-bend}L9 ${iy}`:`M-9 ${ey}Q0 ${-(c.brows==='arched'?6:c.brows==='bold'?3:0)-bend} 9 ${iy}`;
  return {x,y,sx,sy,angle,side,radius,pupilX,pupilY,pupilScale:Math.min(radius/2.25,(w?.pupilSize??1)*radius/3.7),aperture:eyePaths[kind],browPath,browX:ox,browY:oy,browScale:-side*sx*(w?.browLength??1),browWidth:(c.brows==='bold'?3.8:2.15)*(w?.browThickness??1),open:sy>.18};
}
export function faceDetailGeometry(c:Character,art:IllustratedView){
  if(art.rear)return [];
  const {w,h,center}=faceLandmarks(c,art),q=c.wardrobe,details:{id:string;x:number;y:number;rx:number;ry:number;alpha:number;color:string}[]=[];
  for(const side of art.profile?[1]:[-1,1]){
    for(let i=0;i<5;i++)if((q?.freckles??0)>i/5)details.push({id:'freckle-'+side+'-'+i,x:Math.max(-w*.75,Math.min(w*.75,center+side*(8+i*2.1))),y:8+(i%3)*2.3,rx:.65,ry:.58,alpha:.65,color:'#70402f'});
    if((q?.cheekBlush??0)>0)details.push({id:'blush-'+side,x:Math.max(-w*.65,Math.min(w*.65,center+side*19)),y:h*.31,rx:6,ry:2.7,alpha:(q?.cheekBlush??0)*.32,color:'#db887b'});
  }
  return details;
}
/** Reserved cosmetic-only Stage 9 channel. Does not alter gaze or visemes. */
export function secondaryCheekOffset(value:number){return Number.isFinite(value)?Math.max(-1.5,Math.min(1.5,value)):0;}
