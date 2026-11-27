import {WorldArtwork,WorldSet,type WorldArtworkData,type WorldSetData,type WorldPlacementData} from './worldArtworkSchema.ts';
import type {VectorArtwork,VectorCommand,VectorRegion} from './vectorArtwork.ts';
import {lveMaterials} from './lveSimulation.ts';
export const worldSetNames=['Living room','Township street','Shop','Podcast studio'] as const;
export type WorldSetName=typeof worldSetNames[number];
const box=(x:number,y:number,w:number,h:number):VectorCommand[]=>[['M',x,y],['L',x+w,y],['L',x+w,y+h],['L',x,y+h],['Z']];
const shape=(id:string,layer:number,key:string,commands:VectorCommand[],stroke=0):VectorRegion=>({id,layer,commands,fillRule:'nonzero',fill:{kind:'palette',key},...(stroke?{stroke:{paint:{kind:'palette',key:'ink'},width:stroke}}:{})});
const oval=(x:number,y:number,rx:number,ry:number):VectorCommand[]=>[['M',x-rx,y],['C',x-rx,y-ry,x+rx,y-ry,x+rx,y],['C',x+rx,y+ry,x-rx,y+ry,x-rx,y],['Z']];
function art(id:string,kind:WorldArtworkData['kind'],bounds:VectorArtwork['bounds'],palette:VectorArtwork['palette'],regions:VectorRegion[],dynamic?:{region:string;pinY:number;points:[number,number][];material:'fabric'|'spring'|'braid';horizontal?:boolean;reverse?:boolean}):WorldArtworkData{
 const artwork:VectorArtwork={version:1,units:'rig',bounds,pivot:[0,0],anchors:[{id:'origin',point:[0,0]}],palette:{ink:'#282632',...palette},materials:[],controlGroups:[],collisionProxies:[],regions,poses:[],compatibility:{rig:'sirvibe-native-v1',mirrorSafe:true}};
 if(!dynamic)return WorldArtwork.parse({version:1,id,kind,artwork});
 const m={...lveMaterials[dynamic.material],maxDisplacement:6,gravityScale:.04};
 artwork.materials=[{id:'soft',stiffness:m.stiffness,damping:m.damping}];artwork.controlGroups=['sway'];
 for(const r of regions.filter(r=>r.id===dynamic.region)){r.material={materialId:'soft',controlGroup:'sway',maxDisplacement:6,weights:r.commands.flatMap(c=>{const points=[];for(let i=1;i<c.length;i+=2){const coordinate=Number(c[i+(dynamic.horizontal?0:1)]),pinned=dynamic.reverse?coordinate>=dynamic.pinY:coordinate<=dynamic.pinY;points.push({pin:pinned?1:0,influence:pinned?0:1});}return points;})};}
 return WorldArtwork.parse({version:1,id,kind,artwork,dynamics:[{group:'sway',points:dynamic.points,material:m,proxyIds:[]}],strength:.65});
}
export function decorativeArtwork(kind:'curtain'|'flag'|'branch'|'hanging-sign'|'hanging-light'):WorldArtworkData{
 switch(kind){
 case 'curtain':return art('curtain','curtain',[-45,-8,45,145],{base:'#b97551',edge:'#74483d',highlight:'#d99b72'},[
 shape('rail',0,'ink',box(-42,-5,84,5)),shape('cloth',1,'base',[['M',-38,0],['L',38,0],['C',25,44,44,92,33,133],['Q',-4,142,-35,133],['C',-25,90,-45,45,-38,0],['Z']],1.5)],{region:'cloth',pinY:0,points:[[0,0],[0,68],[0,133]],material:'fabric'});
 case 'flag':return art('flag','flag',[-5,-5,112,66],{base:'#deaa55',trim:'#4e817a'},[shape('cloth',0,'base',[['M',0,0],['C',36,-2,72,14,104,5],['L',104,52],['C',69,61,33,44,0,50],['Z']],1.5),shape('pole',1,'ink',box(-4,-5,4,65))],{region:'cloth',pinY:0,points:[[0,0],[52,25],[100,26]],material:'fabric',horizontal:true});
 case 'branch':return art('branch','branch',[-12,-65,105,42],{wood:'#675047',leaf:'#526f59'},[shape('stem',0,'wood',[['M',0,0],['Q',49,-24,92,-37],['L',97,-29],['Q',48,-12,0,7],['Z']]),shape('leaves',1,'leaf',[['M',0,0],['C',21,-63,89,-62,100,-37],['C',104,-6,39,15,0,0],['Z']])],{region:'leaves',pinY:0,points:[[0,0],[48,-24],[92,-32]],material:'braid',horizontal:true});
 case 'hanging-sign':return art('sign','hanging-sign',[-65,-6,65,80],{base:'#c6a66e',trim:'#426c6a'},[shape('cord',0,'ink',box(-2,0,4,28)),shape('sign',1,'base',[['M',-2,0],['L',2,0],['L',2,27],['L',58,27],['L',58,74],['L',-58,74],['L',-58,27],['L',-2,27],['Z']],2)],{region:'sign',pinY:0,points:[[0,0],[0,28],[0,69]],material:'spring'});
 case 'hanging-light':return art('light','hanging-light',[-40,-5,40,86],{base:'#e7bd78',trim:'#72564b'},[shape('fixture',0,'base',[['M',-2,0],['L',2,0],['L',2,42],['Q',25,43,36,72],['Q',0,87,-36,72],['Q',-25,43,-2,42],['Z']],1.5)],{region:'fixture',pinY:0,points:[[0,0],[0,42],[0,72]],material:'spring'});
 }
}
const backdrop=(id:string,palette:Record<string,string>,regions:VectorRegion[])=>art(id,'architecture',[-180,-180,180,180],palette,regions);
const placement=(id:string,art:WorldArtworkData,x:number,y:number,scale=1,layer:WorldPlacementData['layer']='background',depth=-2,lighting=true):WorldPlacementData=>({id,art,x,y,scale,rotation:0,layer,depth,lighting,perspective:false,occluder:layer==='foreground'});
/** One base tile at scale 3 covers the 960x540 frame. Additional art is
 * deliberately sparse. Set overlays never replace user objects or clips. */
export function makeWorldSet(name:WorldSetName):WorldSetData{
 const indoor=name!=='Township street',shop=name==='Shop',studio=name==='Podcast studio';
 const palette=indoor?{wall:studio?'#5c5771':shop?'#d7c2a2':'#a9ad94',panel:studio?'#444054':shop?'#a68d6c':'#77816a',floor:studio?'#514855':shop?'#8d7b6c':'#8b7061',edge:'#665e5b',accent:studio?'#b4a2d3':shop?'#dba766':'#dec39b'}:{wall:'#e4b383',panel:'#a88875',floor:'#746574',edge:'#e3c29a',accent:'#af826d'};
 const regions=[shape('sky-wall',0,'wall',box(-160,-90,320,180)),shape('ground',1,'floor',box(-160,42,320,48)),shape('skirting',2,'edge',box(-160,38,320,4))];
 if(indoor){regions.push(shape('panel',3,'panel',box(-160,20,320,18)));
 for(let i=0;i<6;i++)regions.push(shape('panel-'+i,4,'accent',box(-150+i*52,23,44,11)));
 if(shop){regions.push(shape('shelf',4,'panel',box(-142,-64,104,77)),shape('shelf-2',4,'panel',box(34,-64,104,77)));for(let i=0;i<4;i++)regions.push(shape('shelf-line-'+i,5,'accent',box(-140,-53+i*17,100,3)),shape('shelf-line-b-'+i,5,'accent',box(36,-53+i*17,100,3)));}
 else if(studio){for(let i=0;i<8;i++)regions.push(shape('acoustic-'+i,4,'panel',box(-144+i*38,-70,22,76)));regions.push(shape('screen',5,'edge',box(-43,-52,86,34)));}
 else{regions.push(shape('window',4,'edge',box(18,-70,80,63)),shape('glass',5,'accent',box(22,-66,72,55)),shape('mullion',6,'panel',box(56,-66,3,55)),shape('frame',4,'panel',box(-105,-55,28,34)));}
 }else{regions.push(shape('sun',1,'accent',oval(102,-54,18,18)));
 for(let i=0;i<5;i++){const x=-154+i*63,y=-38+(i%2)*12;regions.push(shape('house-'+i,2,'panel',box(x,y,54,38-y)),shape('roof-'+i,3,'edge',[['M',x-4,y+2],['L',x+25,y-15],['L',x+58,y+2],['Z']]),shape('door-'+i,4,'wall',box(x+19,y+15,13,38-y-15)));}}
 const layers=[placement('base',backdrop('base-'+(shop?'shop':studio?'studio':indoor?'room':'street'),palette,regions),480,270,3,'background',-10,false)];
 if(name==='Living room'){layers.push(placement('curtain-left',decorativeArtwork('curtain'),548,67,1.1),placement('curtain-right',decorativeArtwork('curtain'),742,67,1.1),placement('ceiling-light',decorativeArtwork('hanging-light'),370,0,1));}
 if(name==='Township street'){layers.push(placement('tree-branch',decorativeArtwork('branch'),20,125,1.5,'foreground',8),placement('street-flag',decorativeArtwork('flag'),635,122,1.25),placement('street-sign',decorativeArtwork('hanging-sign'),435,180,.75));}
 if(shop){layers.push(placement('shop-sign',decorativeArtwork('hanging-sign'),480,24,1.3),placement('awning-flag',decorativeArtwork('flag'),160,96,.9),placement('shop-light',decorativeArtwork('hanging-light'),800,0,1.1));}
 if(studio){layers.push(placement('studio-light',decorativeArtwork('hanging-light'),480,0,1.4),placement('studio-curtain',decorativeArtwork('curtain'),90,60,1.5));}
 return WorldSet.parse({version:1,id:shop?'shop':studio?'studio':indoor?'room':'street',name,layers,walkable:[{x:24,y:400},{x:936,y:400},{x:960,y:535},{x:0,y:535}],surfaces:[{id:'floor',x:480,y:470,width:900,kind:'floor'}]});
}
export const nativeWorldPropKinds=['cup','book','phone','table','counter','plant'] as const;
export type NativeWorldPropKind=typeof nativeWorldPropKinds[number];
export function nativeWorldProp(kind:NativeWorldPropKind):WorldArtworkData{
 const palette={base:'#b77e60',trim:'#e9c69b',highlight:'#f5e4c8',leaf:'#587760'};
 switch(kind){
 case 'cup':return art('cup','household',[-16,-28,16,0],palette,[shape('handle',0,'trim',oval(10,-15,6,7)),shape('body',1,'base',[['M',-15,-26],['L',8,-26],['Q',10,-3,5,-1],['L',-12,-1],['Q',-16,-4,-15,-26],['Z']],1),shape('rim',2,'highlight',oval(-3,-25,11,3))]);
 case 'book':return art('book','household',[-27,-12,27,0],palette,[shape('cover',0,'base',box(-27,-12,54,12)),shape('pages',1,'highlight',box(-24,-9,49,6)),shape('spine',2,'trim',box(-27,-12,4,12))]);
 case 'phone':return art('phone','household',[-12,-33,12,0],palette,[shape('case',0,'base',box(-12,-33,24,33),.8),shape('screen',1,'ink',box(-9,-29,18,23)),shape('button',2,'highlight',oval(0,-3,2,1))]);
 case 'table':case 'counter':{const w=kind==='table'?90:74,h=kind==='table'?68:110;return art(kind,'furniture',[-w,-h,w,0],palette,[shape('leg-left',0,'base',box(-w+8,-h+8,12,h-8)),shape('leg-right',0,'base',box(w-20,-h+8,12,h-8)),shape('surface',1,'trim',box(-w,-h,w*2,10)),shape('apron',2,'base',box(-w+5,-h+10,w*2-10,14))]);}
 case 'plant':return art('plant','household',[-38,-113,38,0],palette,[shape('pot',0,'base',[['M',-23,-35],['L',23,-35],['L',15,0],['L',-15,0],['Z']]),shape('leaves',1,'leaf',[['M',0,-35],['C',-35,-47,-37,-93,-4,-83],['Q',2,-113,22,-102],['C',38,-70,21,-49,0,-35],['Z']])],{region:'leaves',pinY:-35,reverse:true,points:[[0,-35],[0,-70],[0,-100]],material:'braid'});
 }
}
