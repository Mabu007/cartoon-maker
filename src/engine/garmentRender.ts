import type {Graphics} from 'pixi.js';
import type {Character} from './schema.ts';
import type {GarmentPath} from './garmentGeometry.ts';
import {drawFabric,vector} from './wardrobeArt.ts';
export function drawGarmentPaths(g:Graphics,c:Character,paths:readonly GarmentPath[]){
 const d=c.garmentDesign;if(!d)return;
 for(const item of paths){
  if(item.fabric&&d.pattern!=='solid'&&d.patternOpacity>0){
   drawFabric(g,item.d,item.fill,{pattern:d.pattern==='checks'?'plaid':d.pattern,trim:d.accent,patternScale:d.patternScale,patternOpacity:d.patternOpacity});
  }else vector(g,item.d,item.fill,item.stroke,item.strokeWidth);
 }
}
