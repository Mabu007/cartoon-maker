// Optional maintainer artwork compiler. Install sharp separately or set SHARP_MODULE_PATH.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)(process.env.SHARP_MODULE_PATH||'sharp');
const root=new URL('../public/visual-examples/',import.meta.url);
const designs={
  'head-base':{width:76,height:92,pivot:{x:.5,y:.5},path:'<path d="M18 4Q38-3 58 6Q72 16 71 37L67 65Q58 83 39 89Q19 85 9 67L5 37Q3 13 18 4Z" fill="#784d3c" stroke="#232433" stroke-width="2.5"/><path d="M11 35Q12 66 28 77L34 85Q18 80 12 64Z" fill="#614238"/>'},
  'upper-arm':{width:18,height:36,pivot:{x:.5,y:.1},end:{x:.5,y:.9},path:'<path d="M4 1Q0 4 1 13L3 34Q9 38 15 34L17 13Q18 3 13 1Z" fill="#303541" stroke="#202333" stroke-width="1.5"/><path d="M13 5L13 28" stroke="#64616a" stroke-width="1.2"/><path d="M4 32H14" stroke="#8e806e" stroke-width="1"/>'},
  forearm:{width:14,height:36,pivot:{x:.5,y:.1},end:{x:.5,y:.9},path:'<path d="M3 0Q7-1 12 1L11 34Q7 37 3 34L1 9Z" fill="#303541" stroke="#202333" stroke-width="1.3"/><path d="M4 30H10" stroke="#b09c7e" stroke-width="1.4"/>'},
  thigh:{width:18,height:50,pivot:{x:.5,y:.08},end:{x:.5,y:.92},path:'<path d="M3 0H15Q18 8 17 18L14 48Q9 51 3 48L1 17Z" fill="#252b3a" stroke="#1c2130" stroke-width="1.3"/><path d="M13 6L11 42" stroke="#535766" stroke-width="1"/><path d="M3 11L8 14" stroke="#66616a" stroke-width="1"/>'},
  calf:{width:16,height:50,pivot:{x:.5,y:.08},end:{x:.5,y:.92},path:'<path d="M3 0H13L15 20L12 49H3L1 20Z" fill="#252b3a" stroke="#1c2130" stroke-width="1.3"/><path d="M12 9L10 42M3 45H12" stroke="#575666" stroke-width="1"/>'},
  shoe:{width:30,height:16,pivot:{x:.5,y:.75},path:'<path d="M7 1H20L21 7L28 10Q31 13 27 15H2V10L6 7Z" fill="#363a48" stroke="#1c2331" stroke-width="1.4"/><path d="M2 13H27M11 5H18M11 8H18" stroke="#85818a" stroke-width="1"/>'}
};
const files=[],parts=[];
for(const [name,art] of Object.entries(designs)){
  const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${art.width*6}" height="${art.height*6}" viewBox="0 0 ${art.width} ${art.height}">${art.path}</svg>`;
  await fs.writeFile(new URL('modular-'+name+'.svg',root),source);
  const data=await sharp(Buffer.from(source)).webp({quality:90}).toBuffer();
  await fs.writeFile(new URL('modular-'+name+'.webp',root),data);
  files.push({path:name+'.webp',data:'data:image/webp;base64,'+data.toString('base64'),width:art.width*6,height:art.height*6});
}
const jacket=JSON.parse(await fs.readFile(new URL('noir-jacket.sirvibe-assets',root),'utf8')).packs[0];
files.push({...jacket.files[0],path:'top.webp'});
for(const view of ['front','three-quarter']){
 for(const [name,art] of Object.entries(designs))for(const side of name==='head-base'?['']:['left','right']){
  const slot=side?name+'-'+side:name;
  parts.push({id:slot+'-'+view,file:name+'.webp',slot,view,pivot:art.pivot,end:art.end,width:art.width,height:art.height,offsetX:0,offsetY:0,fit:'fixed',profiles:['mature','average','broad'],symmetrical:true});
 }
 parts.push({...jacket.parts[0],id:'top-'+view,file:'top.webp',view,slot:'top'});
}
const pack={format:'sirvibe-visual-assets',version:1,id:'example-modular-noir',name:'Modular noir body',revision:1,category:'character',style:'illustrated',rig:'sirvibe-native-v1',license:'CC0-1.0 · original SIRVIBE artwork',provenance:'Original SVG paths; calibrated native rig body; native face and hands',tags:['example','modular-body','african-noir'],dependencies:[],files,parts};
await fs.writeFile(new URL('modular-noir.sirvibe-assets',root),JSON.stringify({format:'sirvibe-assets',version:1,packs:[pack]},null,2)+'\n');
await fs.writeFile(new URL('../src/engine/modularExample.ts',import.meta.url),`// Original modular body example. Authored SVGs in public/visual-examples.\nimport { AssetManifest } from './visualAssets.ts';\nexport const modularExample=AssetManifest.parse(${JSON.stringify(pack)});\n`);
console.log('Compiled 12 calibrated body parts for each of two declared views.');
