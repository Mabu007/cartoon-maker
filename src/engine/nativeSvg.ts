import {parseNativePackage,nativeGeometryLimits,type NativeAssetPack,type NativePackage} from './nativeAssetPackage.ts';
import {vectorArtworkLimits,type VectorCommand} from './vectorArtwork.ts';
import type {CharacterVisualData,NativeSlot,NativeVectorComponentData} from './visualAssets.ts';

export const svgImportSlots=['head-base','hair','top','head-accessory'] as const satisfies readonly NativeSlot[];
export type SvgImportSlot=typeof svgImportSlots[number];
export const nativeSvgByteLimit=128_000;
const svgNamespace='http://www.w3.org/2000/svg';
const numberToken='[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
const parseNumber=new RegExp(numberToken,'y');
const color=/^#[0-9a-f]{6}$/i;
const arities={M:2,L:2,Q:4,C:6,Z:0} as const;
const categories={hair:'hair',top:'clothing','head-base':'character','head-accessory':'accessory'} as const;
const allowedSvgAttributes=new Set(['xmlns','viewBox','width','height']);
const allowedPathAttributes=new Set(['d','fill','stroke','stroke-width','fill-rule']);

type SvgImportOptions={
 id:string;name:string;license:string;provenance:string;slot:SvgImportSlot;
 style:CharacterVisualData['style'];profile:CharacterVisualData['profile'];
 view:NativeVectorComponentData['view'];
};

/** Grammar for the native editable SVG subset. One explicit command token
 * per segment keeps the imported path consistent with the native schema. */
export function normalizeSvgPath(path:string):VectorCommand[]{
 const commands:VectorCommand[]=[];
 let position=0;
 const skipSpace=()=>{while(position<path.length&&/[\t\n\r ,]/.test(path[position]))position++;};
 const readNumber=()=>{
  skipSpace();
  parseNumber.lastIndex=position;
  const match=parseNumber.exec(path);
  if(!match)throw Error('Every SVG command requires explicit numeric coordinates.');
  position=parseNumber.lastIndex;
  const value=Number(match[0]);
  if(!Number.isFinite(value)||Math.abs(value)>nativeGeometryLimits.rig)throw Error('SVG coordinate exceeds the rig bounds.');
  return value;
 };
 skipSpace();
 while(position<path.length){
  const token=path[position++];
  if(!Object.hasOwn(arities,token))throw Error('SVG paths support absolute M, L, Q, C and Z commands.');
  const command=token as keyof typeof arities;
  commands.push([command,...Array.from({length:arities[command]},readNumber)] as VectorCommand);
  if(commands.length>vectorArtworkLimits.commandsPerPath)throw Error('SVG path has too many commands.');
  skipSpace();
 }
 return commands;
}

function verifyElement(element:Element,tag:string,allowed:ReadonlySet<string>){
 if(element.namespaceURI!==svgNamespace||element.localName!==tag)throw Error(`Expected SVG ${tag} element.`);
 for(const attribute of element.attributes){
  if(!allowed.has(attribute.name))throw Error(`Unsupported SVG attribute ${attribute.name}.`);
 }
}
function readPaint(value:string|null,defaultColor?:string){
 const paint=value??defaultColor;
 if(paint===undefined||paint==='none')return;
 if(!color.test(paint))throw Error('SVG paint must be a six-digit hex color or none.');
 return {kind:'solid' as const,color:paint};
}

/** Import drawings as native path data. The parsed SVG document is never
 * attached to the page, rendered as SVG, or used as an external reference. */
export function normalizeNativeSvg(text:string,options:SvgImportOptions){
 if(text.length>nativeSvgByteLimit||new TextEncoder().encode(text).length>nativeSvgByteLimit)throw Error('SVG exceeds the 128 KB import limit.');
 if(/<!|<\?|&/.test(text))throw Error('SVG declarations, entities and processing instructions are unsupported.');
 const svg=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
 verifyElement(svg,'svg',allowedSvgAttributes);
 const viewBox=svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
 if(viewBox?.length!==4||viewBox.some(n=>!Number.isFinite(n))||viewBox[2]<=0||viewBox[3]<=0)
  throw Error('Provide a viewBox with four finite rig-space numbers.');
 const [x,y,width,height]=viewBox;
 if(svg.childElementCount<1||svg.childElementCount>vectorArtworkLimits.regions)throw Error('SVG must contain 1–24 path elements.');
 if(Array.from(svg.childNodes).some(node=>node.nodeType===3&&node.textContent?.trim()))throw Error('SVG text content is unsupported.');
 const regions=Array.from(svg.children,(path,layer)=>{
  verifyElement(path,'path',allowedPathAttributes);
  if(path.children.length||path.textContent?.trim())throw Error('SVG paths cannot contain nested content.');
  const commands=normalizeSvgPath(path.getAttribute('d')??'');
  const fillRule=path.getAttribute('fill-rule');
  if(fillRule&&fillRule!=='nonzero'&&fillRule!=='evenodd')throw Error('Use a nonzero or evenodd SVG fill rule.');
  const fill=readPaint(path.getAttribute('fill'),'#000000'),stroke=readPaint(path.getAttribute('stroke'));
  const strokeWidth=Number(path.getAttribute('stroke-width')??1);
  return {id:`path-${layer+1}`,layer,commands,fillRule:fillRule==='evenodd'?'evenodd' as const:'nonzero' as const,
   ...(fill?{fill}:{}),...(stroke?{stroke:{paint:stroke,width:strokeWidth}}:{})};
 });
 const pack:NativeAssetPack={format:'sirvibe-native-vector',version:1,id:options.id,revision:1,name:options.name,
  category:categories[options.slot],style:options.style,rig:'sirvibe-native-v1',coordinates:'local-x-right-y-down',
  license:options.license,provenance:options.provenance,dependencies:[],coverage:[options.view],components:[{
   id:'svg-art',slot:options.slot,view:options.view,profiles:[options.profile],facing:'normal',artwork:{
    version:1,units:'rig',bounds:[x,y,x+width,y+height],pivot:[0,0],anchors:[],palette:{},materials:[],
    controlGroups:[],collisionProxies:[],regions,poses:[],compatibility:{rig:'sirvibe-native-v1',mirrorSafe:false}
   }
  }]};
 return parseNativePackage(JSON.stringify({format:'sirvibe-assets',version:2,packs:[pack]} satisfies NativePackage));
}
