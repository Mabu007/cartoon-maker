import {bodyProportions} from './bodyBuild.ts';
import type {Point} from './animation.ts';
import type {Character} from './schema.ts';
import type {IllustratedView} from './illustration.ts';
import type {GarmentDesign} from './garmentDesignSchema.ts';
export type GarmentPath={id:string;d:string;fill:string;stroke:string;strokeWidth:number;fabric?:boolean;image?:string;imageBox?:{x:number;y:number;width:number;height:number}};
export const materialProfiles={cotton:{stiffness:70,damping:12,wind:.25,displacement:4},denim:{stiffness:130,damping:17,wind:.12,displacement:2},knit:{stiffness:44,damping:9,wind:.35,displacement:5},leather:{stiffness:180,damping:22,wind:.08,displacement:1.5},linen:{stiffness:52,damping:10,wind:.45,displacement:6}} as const;
const fitEase={tight:1.04,regular:1.13,relaxed:1.25,oversized:1.4} as const;
export const garmentTemplates={
 top:{layer:'inner',coverage:['chest','waist','shoulders'],pins:['neck','leftShoulder','rightShoulder'],free:['hem'],views:['front','three-quarter','side','back-quarter','back']},
 trousers:{layer:'inner',coverage:['hips','thigh','calf'],pins:['pelvis','leftHip','rightHip','leftKnee','rightKnee'],free:['cuffs'],views:['front','three-quarter','side','back-quarter','back']},
 skirt:{layer:'inner',coverage:['hips'],pins:['pelvis','leftHip','rightHip'],free:['hem'],views:['front','three-quarter','side','back-quarter','back']},
 outer:{layer:'outer',coverage:['chest','waist','shoulders','arms'],pins:['neck','leftShoulder','rightShoulder'],free:['hem','cuffs'],views:['front','three-quarter','side','back-quarter','back']},
 footwear:{layer:'outer',coverage:['feet'],pins:['leftAnkle','rightAnkle'],free:[],views:['front','three-quarter','side','back-quarter','back']}
} as const;
const ink='#29232c',round=(v:number)=>Math.round(v*100)/100;
const p=(x:number,y:number)=>round(x)+' '+round(y);
const shade=(hex:string,f:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-Math.abs(f))+(f>0?255:0)*Math.abs(f)).toString(16).padStart(2,'0')).join('');
const path=(id:string,d:string,fill='none',stroke=ink,strokeWidth=1.3,fabric=false):GarmentPath=>({id,d,fill,stroke,strokeWidth,fabric});
const mix=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const xy=(v:Point)=>p(v.x,v.y);
export function garmentEnabled(c:Character){return Boolean(c.garmentDesign)&&c.outfit!=='shirtless'&&c.outfit!=='bikini';}
export function garmentPhysics(c:Character,anchors:Record<string,Point>){
 const d=c.garmentDesign;if(!d)return [];
 const mat=materialProfiles[d.material],keys=['top',...(d.bottom==='none'?[]:[(d.bottom==='skirt'||d.bottom==='wrap-skirt')?'skirt':'trousers']),...(d.outer==='none'?[]:['outer']),...(d.footwear==='none'?[]:['footwear'])] as (keyof typeof garmentTemplates)[];
 return keys.map(id=>{const t=garmentTemplates[id];return {id,layer:t.layer,materialId:d.material,...mat,displacement:id==='footwear'?0:mat.displacement,pins:t.pins.map(name=>({name,point:anchors[name],weight:1})),free:t.free.map(name=>{const a=name==='cuffs'?anchors.leftAnkle:anchors.pelvis,b=name==='cuffs'?anchors.rightAnkle:anchors.pelvis;return {id:id+'-'+name,weight:0,influence:1,rest:[{x:a.x-7*c.thickness,y:a.y+3},{x:(a.x+b.x)/2,y:(a.y+b.y)/2+5},{x:b.x+7*c.thickness,y:b.y+3}]};}),collisionProxies:[{id:'torso',a:anchors.neck,b:anchors.pelvis,radius:16*c.thickness},{id:'left-arm',a:anchors.leftShoulder,b:anchors.leftElbow,radius:6*c.thickness},{id:'right-arm',a:anchors.rightShoulder,b:anchors.rightElbow,radius:6*c.thickness},{id:'left-leg',a:anchors.leftHip,b:anchors.leftKnee,radius:7*c.thickness},{id:'right-leg',a:anchors.rightHip,b:anchors.rightKnee,radius:7*c.thickness}]};});
}
export function garmentTorso(c:Character,v:IllustratedView,neck:Point,hip:Point,left:Point,right:Point,compression=0):GarmentPath[]{
 const d=c.garmentDesign;if(!d)return [];
 const b=bodyProportions(c),e=fitEase[d.fit],out:GarmentPath[]=[];
 const build=(outer:boolean)=>{
  const color=outer?d.outerColor:c.shirt,tag=outer?'outer':'top',dress=!outer&&d.top==='dress',tunic=!outer&&(d.top==='tunic'||d.top==='wrap-tunic');
  const wide=e*(outer?1.09:d.top==='hoodie'?1.07:d.top==='blouse'?1.025:1),a=Math.max(Math.abs(left.x-neck.x),Math.abs(right.x-neck.x),18*v.width)*wide;
  const chest=a*(.92+b.chest*.15),waist=18*v.width*c.thickness*b.waist*d.waist*wide,hem=19*v.width*c.thickness*b.hip*d.hem*wide*(dress?1.6:1);
  const top=neck.y-3,mid=hip.y-13,bottom=hip.y+(outer?(d.outer==='coat'?28:7):dress?34:tunic?18:4)*d.length+(d.length-1)*18;
  const cx=neck.x,hx=hip.x,front=cx+(v.profile?a*.34:v.face*.15),neckW=Math.min(a*.55,10*c.thickness);
  const outline='M'+p(cx-neckW,top)+'Q'+p(left.x-a*.14,left.y-7)+' '+p(cx-a,left.y)+'Q'+p(cx-chest,top+25)+' '+p(hx-waist,mid)+'Q'+p(hx-waist*b.bell/Math.max(1,b.waist),bottom-9)+' '+p(hx-hem,bottom-2)+'Q'+p(hx,bottom+4)+' '+p(hx+hem,bottom-2)+'Q'+p(hx+waist*b.bell/Math.max(1,b.waist),bottom-9)+' '+p(hx+waist,mid)+'Q'+p(cx+chest,top+25)+' '+p(cx+a,right.y)+'Q'+p(right.x+a*.14,right.y-7)+' '+p(cx+neckW,top)+'Q'+p(cx,top+3)+' '+p(cx-neckW,top)+'Z';
  const open=outer&&d.closure==='none'&&!v.rear;
  if(open){
   const opening=Math.min(5,a*.17),split=front;
   const leftPanel='M'+p(cx-neckW,top)+'Q'+p(left.x-a*.14,left.y-7)+' '+p(cx-a,left.y)+'Q'+p(cx-chest,top+25)+' '+p(hx-waist,mid)+'Q'+p(hx-waist*b.bell/Math.max(1,b.waist),bottom-9)+' '+p(hx-hem,bottom-2)+'Q'+p(hx-hem*.5,bottom+1)+' '+p(hx-opening,bottom)+'L'+p(split-opening,top+11)+'Z';
   const rightPanel='M'+p(cx+neckW,top)+'L'+p(split+opening,top+11)+'L'+p(hx+opening,bottom)+'Q'+p(hx+hem*.5,bottom+1)+' '+p(hx+hem,bottom-2)+'Q'+p(hx+waist*b.bell/Math.max(1,b.waist),bottom-9)+' '+p(hx+waist,mid)+'Q'+p(cx+chest,top+25)+' '+p(cx+a,right.y)+'Q'+p(right.x+a*.14,right.y-7)+' '+p(cx+neckW,top)+'Z';
   out.push(path(tag+'-panel-left',leftPanel,color,ink,1.7,true),path(tag+'-panel-right',rightPanel,color,ink,1.7,true));
  }else out.push(path(tag+'-panel',outline,color,ink,1.7,true));
  const sideShadow='M'+p(cx+a*.83,right.y+3)+'Q'+p(cx+chest*.78,top+24)+' '+p(hx+waist*.82,mid)+'L'+p(hx+hem*.83,bottom-3)+'L'+p(hx+hem*.59,bottom-3)+'Q'+p(hx+waist*.59,mid)+' '+p(cx+a*.64,right.y+6)+'Z';
  out.push(path(tag+'-shade',sideShadow,shade(color,-.19),'none',0));
  const dark=shade(color,-.36),seam=(id:string,s:string,col=dark,w=1)=>out.push(path(tag+'-'+id,s,'none',col,w));
  if(d.seams&&!open){seam('hem','M'+p(hx-hem*.87,bottom-5)+'Q'+p(hx,bottom)+' '+p(hx+hem*.87,bottom-5));seam('shoulder','M'+p(cx-a*.85,left.y+2)+'Q'+p(cx-a*.5,top+7)+' '+p(cx-neckW,top+3));}
  if(!outer&&d.top==='hoodie'){out.push(path('hood','M'+p(cx-neckW*1.3,top+2)+'Q'+p(cx,top-9)+' '+p(cx+neckW*1.3,top+2)+'Q'+p(cx+neckW,top+16)+' '+p(cx,top+18)+'Q'+p(cx-neckW,top+16)+' '+p(cx-neckW*1.3,top+2)+'Z',shade(color,-.22),ink,1.2));}
  if(v.rear){seam('back-yoke','M'+p(cx-a*.75,top+15)+'Q'+p(cx,top+22)+' '+p(cx+a*.75,top+15));}
  else {
   const n=d.neckline==='v'? 'L'+p(front,top+17)+'L': 'Q'+p(front,top+12)+' ';
   seam('neck','M'+p(front-neckW,top+1)+n+p(front+neckW,top+1),d.accent,1.7);
   if(d.neckline==='collar'||outer)seam('collar','M'+p(front-neckW,top+1)+'L'+p(front-neckW*.65,top+13)+'L'+p(front,top+8)+'L'+p(front+neckW*.65,top+13)+'L'+p(front+neckW,top+1),d.accent,1.5);
   if(!open&&(outer||d.closure!=='none')){seam('closure','M'+p(front,top+12)+'L'+p(hx,bottom-3),d.closure==='zipper'?d.accent:dark,1.5);
    if(d.closure==='buttons')for(let i=0;i<4;i++){const y=top+18+i*(bottom-top-24)/4;out.push(path(tag+'-button-'+i,'M'+p(front-1,y)+'h2v2h-2Z',d.accent,'none',0));}}
   if(d.pockets){const px=hx-waist*.48,py=bottom-16;seam('pocket','M'+p(px-4,py)+'L'+p(px+4,py+1)+'L'+p(px+3,py+7)+'L'+p(px-4,py+6)+'Z');}
   if(!outer&&!v.profile&&d.top==='wrap-tunic'){seam('wrap-diagonal','M'+p(cx-neckW,top+2)+'Q'+p(cx,top+22)+' '+p(hx+waist*.7,mid),d.accent,2);seam('wrap-band','M'+p(hx-waist*.85,mid+1)+'Q'+p(hx,mid+4)+' '+p(hx+waist*.85,mid+1),d.accent,2.5);}
   if(c.wardrobe?.logoImage&&!outer&&!v.profile){const lx=front+a*.28,ly=top+20,sz=Math.min(5*d.logoScale,a*.17),box={x:lx-sz,y:ly-sz,width:sz*2,height:sz*2};out.push({...path('masked-logo','M'+p(box.x,box.y)+'L'+p(box.x+box.width,box.y)+'L'+p(box.x+box.width,box.y+box.height)+'L'+p(box.x,box.y+box.height)+'Z','none','none',0),image:c.wardrobe.logoImage,imageBox:box});}
   else if(d.logo!=='none'&&!outer&&!v.profile){const lx=front+a*.34,ly=top+19,s=3*d.logoScale;const logo=d.logo==='diamond'?'M'+p(lx,ly-s)+'L'+p(lx+s,ly)+'L'+p(lx,ly+s)+'L'+p(lx-s,ly)+'Z':'M'+p(lx-s,ly)+'Q'+p(lx,ly-s*1.8)+' '+p(lx+s,ly)+'Q'+p(lx,ly+s*1.8)+' '+p(lx-s,ly)+'Z';out.push(path('logo',logo,d.accent,'none',0));}
  }
  if(d.folds>0&&!open){const y=mid+3,amp=(1+Math.max(0,Math.min(1,compression))*3)*d.folds;seam('waist-fold','M'+p(hx-waist*.7,y)+'Q'+p(hx-waist*.3,y+amp)+' '+p(hx+waist*.22,y+amp*.4),dark,.8+d.folds*.4);}
 };
 build(false);if(d.outer!=='none')build(true);return out;
}
/** Bone geometry follows the solved chain, not an independent garment skeleton.
 * Overlap at the joint covers seams; all endpoints and wrist/foot remain unchanged. */
function bone(id:string,a:Point,b:Point,r0:number,r1:number,color:string,d:GarmentDesign,compression:number,motion?:readonly [number,number]):GarmentPath[]{
 const length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.05)return [];
 const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,nx=-uy,ny=ux;
 const at=(t:number,r:number)=>{const w=Math.sin(Math.PI*Math.max(0,Math.min(1,t/length)))**2,dx=motion?Math.max(-.8,Math.min(.8,motion[0]))*w:0,dy=motion?Math.max(-.8,Math.min(.8,motion[1]))*w:0;return p(a.x+ux*t+nx*r+dx,a.y+uy*t+ny*r+dy);};
 const overlap=Math.min(1.6,length*.1),fold=Math.max(0,Math.min(1,compression))*d.folds;
 const contour='M'+at(-overlap,-r0)+'Q'+at(length*.4,-r0*(1+fold*.07))+' '+at(length+overlap,-r1)+'Q'+at(length+overlap+1,0)+' '+at(length+overlap,r1)+'Q'+at(length*.4,r0*(1+fold*.07))+' '+at(-overlap,r0)+'Z';
 const out=[path(id+'-panel',contour,color,ink,1.45,true),path(id+'-shade','M'+at(0,r0*.7)+'Q'+at(length*.55,r0*.75)+' '+at(length,r1*.72)+'L'+at(length,r1*.32)+'Q'+at(length*.55,r0*.48)+' '+at(0,r0*.36)+'Z',shade(color,-.17),'none',0)];
 if(d.seams)out.push(path(id+'-seam','M'+at(1,-r0*.65)+'L'+at(length-1,-r1*.65),'none',shade(color,-.3),.9));
 if(fold>.07)out.push(path(id+'-fold','M'+at(length*.72,-r0*.65)+'Q'+at(length*(.76+fold*.09),0)+' '+at(length*.76,r1*.62),'none',shade(color,-.32),.8+fold*.6));
 return out;
}
const bend=(a:Point,b:Point,c:Point)=>{const ab={x:b.x-a.x,y:b.y-a.y},bc={x:c.x-b.x,y:c.y-b.y};const len=Math.hypot(ab.x,ab.y)*Math.hypot(bc.x,bc.y);return len>0?Math.acos(Math.max(-1,Math.min(1,(ab.x*bc.x+ab.y*bc.y)/len)))/Math.PI:0;};
export function garmentSleeve(c:Character,shoulder:Point,elbow:Point,hand:Point,part:'all'|'upper'|'lower'|'hand'='all',skipUpper=false,skipLower=false,motion?:readonly [number,number]):GarmentPath[]{
 const d=c.garmentDesign;if(!d||part==='hand')return [];
 const b=bodyProportions(c),e=fitEase[d.fit],fold=bend(shoulder,elbow,hand),out:GarmentPath[]=[];
 const coverage=d.outer!=='none'?Math.max(1.85,d.sleeve):d.sleeve;
 const build=(outer:boolean)=>{
 const color=outer?d.outerColor:c.shirt,tag=outer?'outer-sleeve':'sleeve',ease=e*(outer?1.12:1),cov=outer?coverage:d.sleeve;
 const upperR=7*c.thickness*b.arm*ease,lowerR=6*c.thickness*(.63+.37*b.arm)*ease,tipR=lowerR*.7*(c.visual?.wristWidth??1)*d.cuff;
 if(cov>.02&&!skipUpper&&part!=='lower')out.push(...bone(tag+'-upper',shoulder,mix(shoulder,elbow,Math.min(1,cov)),upperR,lowerR,color,d,fold,motion));
 if(cov>1.02&&!skipLower&&part!=='upper')out.push(...bone(tag+'-lower',elbow,mix(elbow,hand,Math.min(.97,cov-1)),lowerR,tipR,color,d,fold,motion));
 };
 build(false);if(d.outer!=='none')build(true);return out;
}
export function garmentLeg(c:Character,hip:Point,knee:Point,foot:Point,skipUpper=false,skipLower=false,motion?:readonly [number,number]):GarmentPath[]{
 const d=c.garmentDesign;if(!d||d.bottom==='none'||(d.bottom==='skirt'||d.bottom==='wrap-skirt')||d.top==='dress')return [];
 const b=bodyProportions(c),e=fitEase[d.fit]*(d.bottom==='leggings'?.92:1),r=7.2*c.thickness*b.leg*e,kr=5.4*c.thickness*b.leg*(c.visual?.kneeWidth??1)*e,fr=4.7*c.thickness*b.leg*b.calves*(c.visual?.ankleWidth??1)*e*d.hem,fold=bend(hip,knee,foot);
 return [...(skipUpper?[]:bone('trouser-upper',hip,d.bottom==='shorts'?mix(hip,knee,.62):knee,r,kr,c.pants,d,fold,motion)),...(skipLower||d.bottom==='shorts'?[]:bone('trouser-lower',knee,foot,kr,fr,c.pants,d,fold,motion))];
}
export function garmentSkirt(c:Character,v:IllustratedView,hip:Point,seated=false,knees?:readonly [Point,Point]):GarmentPath[]{
 const d=c.garmentDesign;if(!d||!['skirt','wrap-skirt'].includes(d.bottom)||d.top==='dress')return [];
 const w=19*c.thickness*bodyProportions(c).hip*v.width*fitEase[d.fit],h=31*d.length,x=hip.x,y=hip.y-5;
 const hem=w*1.28*d.hem;
 // Approximate supported drape over the actual resolved knees, not a
 // second leg pose. Limit shear and never extend below the standing hem.
 const kx=seated&&knees?Math.max(-hem*.7,Math.min(hem*.7,(knees[0].x+knees[1].x)/2-x)):0;
 const ky=seated&&knees?Math.max(y+h*.38,Math.min(y+h,Math.max(knees[0].y,knees[1].y)+3)):y+h*(seated?.68:1);
 const left=seated&&knees?Math.min(x+kx-hem,Math.min(knees[0].x,knees[1].x)-4):x-hem;
 const right=seated&&knees?Math.max(x+kx+hem,Math.max(knees[0].x,knees[1].x)+4):x+hem;
 const lx=Math.max(x-hem*2,left),rx=Math.min(x+hem*2,right);
 const out=[path('skirt','M'+p(x-w,y)+'Q'+p(x,y+4)+' '+p(x+w,y)+'Q'+p(x+w*.9,ky-10)+' '+p(rx,ky)+'Q'+p(x+kx,ky+6)+' '+p(lx,ky)+'Q'+p(x-w*.9,ky-10)+' '+p(x-w,y)+'Z',c.pants,ink,1.6,true)];
 const dark=shade(c.pants,-.3);
 for(const offset of [-.48,.35])out.push(path('skirt-fold-'+offset,'M'+p(x+w*offset,y+5)+'Q'+p(x+kx*.5+w*offset,ky-8)+' '+p(x+kx+hem*offset,ky-1),'none',dark,1.1));
 if(d.bottom==='wrap-skirt')out.push(path('wrap-overlap','M'+p(x+w*.5,y+1)+'Q'+p(x+kx+w*.1,(y+ky)/2)+' '+p(x+kx-hem*.45,ky+1),'none',d.accent,2));
 return out;
}
export function garmentFoot(c:Character,foot:Point,toe:number,rear=false):GarmentPath[]{
 const d=c.garmentDesign;if(!d)return [];
 if(d.footwear==='none'){const s=c.thickness*(c.visual?.footSize??1),x=foot.x,y=foot.y;return [path('bare-foot','M'+p(x-6*s,y-4*s)+'Q'+p(x+10*s,y-4*s)+' '+p(x+10*s,y+2*s)+'Q'+p(x+4*s,y+5*s)+' '+p(x-7*s,y+4*s)+'Z',c.skin,ink,1.2)];}
 const s=c.thickness*(c.visual?.footSize??1),x=foot.x,y=foot.y,dir=toe<0?-1:1;
 const at=(a:number,b:number)=>p(x+a*s*dir,y+5+(b-5)*s),sole=5,top=d.footwear==='boot'?-14:-6,tip=rear?7:14,heel=rear?-7:-10;
 const outline='M'+at(heel,sole)+'L'+at(heel,top)+'Q'+at(-2,top-2)+' '+at(2,-4)+'Q'+at(tip,-5)+' '+at(tip,2)+'L'+at(tip,sole)+'Z';
 const out=[path('shoe',outline,c.shoes,ink,1.5),path('sole','M'+at(heel,sole-d.soleThickness)+'L'+at(tip,sole-d.soleThickness)+'L'+at(tip,sole)+'L'+at(heel,sole)+'Z',d.sole,ink,.7)];
 if(!rear&&d.laceDetail&&d.footwear!=='loafer')for(let i=0;i<3;i++)out.push(path('lace-'+i,'M'+at(-3+i*2,-5+i*.6)+'L'+at(1+i*2,-4+i*.6),'none',d.laces,1));
 return out;
}

/** Bounded weighted deformation of trusted procedural garment M/L/Q/C/Z
 * paths. Fitted upper region and all logo image boxes remain fixed.
 * Shared field for silhouette, folds, seams and shadows; no bone changes. */
export function deformGarmentPanels(paths:GarmentPath[],pinY:number,hemY:number,cloth:readonly [number,number],body:readonly [number,number]=[0,0]):GarmentPath[]{
 if(![pinY,hemY,...cloth,...body].every(Number.isFinite)||hemY<=pinY||!cloth.some(Boolean)&&!body.some(Boolean))return paths;
 const limit=(v:number,n:number)=>Math.max(-n,Math.min(n,v));
 const field=(d:string)=>{
  const tokens=d.match(/[A-Za-z]|-?(?:\d+(?:\.\d*)?|\.\d+)/g);if(!tokens||tokens.some(t=>/^[A-Za-z]$/.test(t)&&!['M','L','Q','C','Z'].includes(t)))return d;
  const out:string[]=[];for(let i=0;i<tokens.length;){const command=tokens[i++];out.push(command);if(command==='Z')continue;
   const count=command==='C'?3:command==='Q'?2:1;
   for(let j=0;j<count;j++){const x=Number(tokens[i++]),y=Number(tokens[i++]);if(!Number.isFinite(x+y))return d;
    const t=Math.max(0,Math.min(1,(y-pinY)/(hemY-pinY))),w=t*t*(3-2*t),soft=Math.sin(Math.PI*t)**2;
    out.push(p(x+limit(cloth[0],4)*w+limit(body[0],1.6)*soft,y+limit(cloth[1],4)*w+limit(body[1],1.6)*soft));}
  }return out.join(' ');
 };
 return paths.map(item=>item.image?item:{...item,d:field(item.d)});
}
