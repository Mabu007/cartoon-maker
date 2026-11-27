import {parseNativePackage,type NativePackage} from './nativeAssetPackage.ts';
import {bodyProfiles} from './visualAssets.ts';
import {lveMaterials} from './lveSimulation.ts';
/** Original passive vector examples, not generated SVG or external images.
 * Front/three-quarter only; missing views explicitly retain native defaults. */
export function nativeExample(category:'hair'|'clothing'|'accessory'):NativePackage{
 const hair=category==='hair',cloth=category==='clothing',slot=hair?'hair':cloth?'top':'head-accessory',name=hair?'Copper swept locks':cloth?'Indigo tunic panel':'Brass ear pendant',id='example-'+category;
 const commands=hair?[['M',-33,-30],['Q',-22,-58,16,-50],['Q',48,-48,38,5],['Q',28,34,15,17],['Q',32,-14,12,-25],['Q',-12,-42,-33,-30],['Z']]:cloth?[['M',-13,0],['L',-29,10],['Q',-34,37,-24,67],['Q',0,76,24,67],['Q',33,37,29,10],['L',13,0],['Q',0,12,-13,0],['Z']]:[['M',-39,9],['Q',-47,12,-44,26],['Q',-39,40,-34,26],['Q',-31,12,-39,9],['Z']];
 const pointCount=commands.reduce((n,c)=>n+(c.length-1)/2,0);
 const weights=commands.flatMap(c=>{const out=[];for(let i=1;i<c.length;i+=2){const y=Number(c[i+1]),p=hair?y<-25:cloth?y<12:y<13;out.push({pin:p?1:0,influence:p?0:1});}return out;});
 const components=['front','three-quarter'].map(view=>({id:slot+'-'+view,slot,view,profiles:[...bodyProfiles],artwork:{version:1,units:'rig',bounds:[-60,-65,60,85],pivot:[0,0],anchors:[{id:'origin',point:[0,0]}],palette:{base:hair?'#603c31':cloth?'#344d69':'#d5aa58',outline:'#29232c'},materials:[{id:'soft',stiffness:64,damping:12}],controlGroups:['swing'],collisionProxies:[],regions:[{id:'silhouette',layer:0,commands,fillRule:'nonzero',fill:{kind:'palette',key:'base'},stroke:{paint:{kind:'palette',key:'outline'},width:1.6},material:{materialId:'soft',controlGroup:'swing',maxDisplacement:4,weights}}],poses:[],compatibility:{rig:'sirvibe-native-v1',mirrorSafe:true}},dynamics:[{group:'swing',points:hair?[[15,-26],[27,18]]:cloth?[[0,10],[0,65]]:[[-39,9],[-39,28]],material:{...(cloth?lveMaterials.fabric:lveMaterials.braid),maxDisplacement:4,gravityScale:.05},proxyIds:[]}]}));
 return parseNativePackage(JSON.stringify({format:'sirvibe-assets',version:2,packs:[{format:'sirvibe-native-vector',version:1,id,revision:1,name,category,style:'illustrated',rig:'sirvibe-native-v1',coordinates:'local-x-right-y-down',license:'CC0-1.0',provenance:'Original SIRVIBE vector example',dependencies:[],coverage:['front','three-quarter'],components}]}));
}
