export type MaskPoint={x:number;y:number};
export type MaskStroke={operation:'add'|'subtract';radius:number;points:MaskPoint[]};
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
/** Edits a bounded alpha plane. Repeated stamps are idempotent, preserving source alpha separately. */
export function paintMask(alpha:Uint8ClampedArray,width:number,height:number,x:number,y:number,radius:number,operation:MaskStroke['operation']){
  if(alpha.length!==width*height||![x,y,radius].every(Number.isFinite)||radius<=0)throw Error('Invalid mask brush geometry.');
  const left=Math.max(0,Math.floor(x-radius)),right=Math.min(width-1,Math.ceil(x+radius)),top=Math.max(0,Math.floor(y-radius)),bottom=Math.min(height-1,Math.ceil(y+radius));
  for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++){
    const coverage=Math.round(255*clamp(radius+.5-Math.hypot(px+.5-x,py+.5-y))),i=py*width+px;
    alpha[i]=operation==='add'?Math.max(alpha[i],coverage):Math.min(alpha[i],255-coverage);
  }
}
export function applyBrushStroke(alpha:Uint8ClampedArray,width:number,height:number,points:MaskPoint[],radius:number,operation:MaskStroke['operation']){
  if(!points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y))||!Number.isFinite(radius)||radius<=0)throw Error('Invalid brush coordinates.');
  if(points.length>512)throw Error('Brush stroke is too long; start another stroke.');
  for(let i=0;i<points.length;i++){
    const point=points[i],previous=points[i-1]??point,distance=Math.hypot(point.x-previous.x,point.y-previous.y),steps=Math.max(1,Math.ceil(distance/Math.max(.5,radius*.4)));
    for(let step=0;step<=steps;step++)paintMask(alpha,width,height,previous.x+(point.x-previous.x)*step/steps,previous.y+(point.y-previous.y)*step/steps,radius,operation);
  }
}
export function maskSelectionBounds(points:MaskPoint[],width:number,height:number){
  if(points.length<3)throw Error('Select at least three polygon points.');
  const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))*width)),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))*height));
  return {x:left,y:top,width:Math.max(1,Math.min(width-left,Math.ceil(Math.max(...points.map(p=>p.x))*width)-left)),height:Math.max(1,Math.min(height-top,Math.ceil(Math.max(...points.map(p=>p.y))*height)-top))};
}

/** Selection editing can never invent alpha for a transparent source pixel. */
export function applySelectionAlpha(rgba:Uint8ClampedArray,selection:Uint8ClampedArray){
  if(rgba.length!==selection.length*4)throw Error('Source and selection dimensions do not match.');
  for(let i=0;i<selection.length;i++)rgba[i*4+3]=Math.round(rgba[i*4+3]*selection[i]/255);
}
