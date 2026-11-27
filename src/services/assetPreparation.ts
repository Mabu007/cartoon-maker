import { applySelectionAlpha, applyBrushStroke, type MaskStroke } from '../engine/selectionMask.ts';
import { AssetManifest, type VisualAssetPack } from '../engine/visualAssets.ts';
import { uid, type Character } from '../engine/schema.ts';
import { parseAssetPackage } from '../engine/visualAssets.ts';
export type Preparation={crop:{x:number;y:number;width:number;height:number};polygon:{x:number;y:number}[];eraseColor?:string;tolerance:number;strokes?:MaskStroke[]};
/** Read raster dimensions before asking the browser to allocate decoded pixels. */
export function rasterDimensions(bytes:Uint8Array):{width:number;height:number}{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  if(bytes.length>=24&&ascii(1,4)==='PNG'&&view.getUint32(0)===0x89504e47&&ascii(12,16)==='IHDR')return {width:view.getUint32(16),height:view.getUint32(20)};
  if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'){
    const kind=ascii(12,16);
    if(kind==='VP8X')return {width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
    if(kind==='VP8 '&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return {width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff};
    if(kind==='VP8L'&&bytes[20]===0x2f){const bits=view.getUint32(21,true);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
  }
  throw Error('Artwork is not a supported PNG or WebP raster.');
}
function verifyDimensions({width,height}:{width:number;height:number},max=2048){if(!width||!height||width>max||height>max)throw Error(`Artwork must be between 1 and ${max} pixels per edge.`);}
export function sanitiseSvg(source:string){
  if(source.length>1_000_000||/<!DOCTYPE|<!ENTITY/i.test(source))throw Error('SVG must be passive artwork under 1 MB without XML entities.');
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  const tags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath','title','desc']);
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Invalid SVG artwork.');
  for(const node of Array.from(doc.querySelectorAll('*'))){
    if(!tags.has(node.localName))throw Error(`SVG element ${node.localName} is not supported. Use paths and shapes.`);
    for(const attribute of Array.from(node.attributes)){
      if(/^on/i.test(attribute.name)||/href|src|style/i.test(attribute.name))throw Error('SVG links, event handlers and CSS must be removed.');
      if(/url\s*\(/i.test(attribute.value)&&!/^url\(#[a-zA-Z0-9_-]+\)$/.test(attribute.value))throw Error('External SVG resources are not allowed.');
    }
  }
  const root=doc.documentElement,box=root.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
  const width=Number(root.getAttribute('width'))||(box?.[2]??512),height=Number(root.getAttribute('height'))||(box?.[3]??512);
  verifyDimensions({width,height});root.setAttribute('width',String(width));root.setAttribute('height',String(height));
  return new XMLSerializer().serializeToString(doc);
}
export async function decodeArtwork(file:File):Promise<HTMLImageElement>{
  if(file.size>12*1024*1024)throw Error('Choose artwork under 12 MB.');
  let blob:Blob=file;
  if(file.type==='image/svg+xml'||file.name.toLowerCase().endsWith('.svg'))blob=new Blob([sanitiseSvg(await file.text())],{type:'image/svg+xml'});
  else {const bytes=new Uint8Array(await file.arrayBuffer());verifyDimensions(rasterDimensions(bytes));blob=new Blob([bytes],{type:bytes[0]===0x89?'image/png':'image/webp'});}
  const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Artwork could not be decoded.'));image.src=url;});
}
export function preparePixels(image:HTMLImageElement,settings:Preparation){
  const {crop}=settings;
  if(![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)||crop.x<0||crop.y<0||crop.width<1||crop.height<1||crop.x+crop.width>image.naturalWidth||crop.y+crop.height>image.naturalHeight)throw Error('Crop must fit inside the source image.');
  const ratio=Math.min(1,1024/Math.max(crop.width,crop.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(crop.width*ratio));canvas.height=Math.max(1,Math.round(crop.height*ratio));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Image preparation is unavailable.');
  ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  const maskCanvas=document.createElement('canvas');maskCanvas.width=canvas.width;maskCanvas.height=canvas.height;
  const maskContext=maskCanvas.getContext('2d',{willReadFrequently:true});if(!maskContext)throw Error('Mask preparation is unavailable.');
  maskContext.fillStyle='#ffffff';
  if(settings.polygon.length>=3){maskContext.beginPath();settings.polygon.forEach((p,i)=>{const x=(p.x*image.naturalWidth-crop.x)*ratio,y=(p.y*image.naturalHeight-crop.y)*ratio;if(i===0)maskContext.moveTo(x,y);else maskContext.lineTo(x,y);});maskContext.closePath();maskContext.fill();}
  else maskContext.fillRect(0,0,canvas.width,canvas.height);
  const maskPixels=maskContext.getImageData(0,0,canvas.width,canvas.height).data,alpha=new Uint8ClampedArray(canvas.width*canvas.height);
  for(let i=0;i<alpha.length;i++)alpha[i]=maskPixels[i*4+3];
  if((settings.strokes?.length??0)>128)throw Error('Mask history is full. Save this part before adding more strokes.');
  for(const stroke of settings.strokes??[]){
    if(!Number.isFinite(stroke.radius)||stroke.radius<.001||stroke.radius>.25||stroke.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('Invalid brush stroke.');
    applyBrushStroke(alpha,canvas.width,canvas.height,stroke.points.map(p=>({x:(p.x*image.naturalWidth-crop.x)*ratio,y:(p.y*image.naturalHeight-crop.y)*ratio})),stroke.radius*Math.min(image.naturalWidth,image.naturalHeight)*ratio,stroke.operation);
  }
  applySelectionAlpha(pixels.data,alpha);
  if(settings.eraseColor){
    const reference=[1,3,5].map(i=>parseInt(settings.eraseColor!.slice(i,i+2),16));
    for(let i=0;i<pixels.data.length;i+=4){const d=Math.hypot(pixels.data[i]-reference[0],pixels.data[i+1]-reference[1],pixels.data[i+2]-reference[2]);if(d<=settings.tolerance)pixels.data[i+3]=0;}
  }
  ctx.putImageData(pixels,0,0);
  if(!pixels.data.some((value,index)=>index%4===3&&value>0))throw Error('Selection contains no visible artwork. Adjust the polygon or background removal.');
  const hasAlpha=pixels.data.some((value,index)=>index%4===3&&value<255);
  let data='';for(const quality of [.88,.74,.6,.45]){data=canvas.toDataURL('image/webp',quality);if(data.length<=95_000)break;}
  if(!data.startsWith('data:image/webp;base64,')||data.length>95_000)throw Error('Artwork is too detailed. Crop it more closely or reduce its dimensions.');
  return {data,width:canvas.width,height:canvas.height,alpha:hasAlpha};
}
export async function verifyPackageImages(text:string){
  const pack=parseAssetPackage(text);
  for(const asset of pack.packs)for(const file of asset.files){
    const raw=file.data.slice(file.data.indexOf(',')+1),bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
    const dimensions=rasterDimensions(bytes);verifyDimensions(dimensions);
    if(dimensions.width!==file.width||dimensions.height!==file.height)throw Error(`Dimensions do not match ${file.path}.`);
    const response=await fetch(file.data),image=await createImageBitmap(await response.blob());
    try{
      if(image.width!==file.width||image.height!==file.height)throw Error(`Decoded dimensions do not match ${file.path}.`);
      if(asset.category==='hair'||asset.category==='clothing'||asset.category==='character'){
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Cannot verify artwork transparency.');ctx.drawImage(image,0,0);
        const alpha=ctx.getImageData(0,0,image.width,image.height).data;
        if(!alpha.some((v,i)=>i%4===3&&v>0))throw Error(`${file.path} is fully transparent.`);
        if(!alpha.some((v,i)=>i%4===3&&v<255))throw Error(`${file.path} needs real transparency.`);
      }
    }finally{image.close();}
  }
  return pack;
}
export function downloadText(name:string,text:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function exportCharacterArtwork(character:Character):VisualAssetPack{
  const components=character.visual?.components;if(!components?.length)throw Error('This character has no imported body artwork.');
  const images=[...new Set(components.map(part=>part.image))];
  const files=images.map((image,index)=>{const data=Uint8Array.from(atob(image.slice(image.indexOf(',')+1)),c=>c.charCodeAt(0));const dimensions=rasterDimensions(data);return {path:`art-${index}.${image.startsWith('data:image/png')?'png':'webp'}`,data:image,...dimensions};});
  return AssetManifest.parse({format:'sirvibe-visual-assets',version:1,id:'character-'+uid(),name:character.name,revision:1,category:'character',style:character.visual!.style,rig:'sirvibe-native-v1',license:'See per-part licence records',provenance:'Compiled from embedded artwork with per-part provenance',tags:['character-artwork'],dependencies:[],files,parts:components.map((part,index)=>({id:'part-'+index,license:part.license,provenance:part.source,file:files[images.indexOf(part.image)].path,slot:part.slot,view:part.view,pivot:part.pivot,end:part.end,width:part.width,height:part.height,offsetX:part.offsetX,offsetY:part.offsetY,fit:part.fit,profiles:part.profiles,symmetrical:part.symmetrical}))});
}
