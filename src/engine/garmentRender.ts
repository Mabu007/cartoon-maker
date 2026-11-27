import type {Graphics} from 'pixi.js';
import type {Character} from './schema.ts';
import type {GarmentPath} from './garmentGeometry.ts';
import {drawFabric,vector,decal,type CostumeTexture} from './wardrobeArt.ts';
export function drawGarmentPaths(g:Graphics,c:Character,paths:readonly GarmentPath[],texture?:CostumeTexture){
 const d=c.garmentDesign;if(!d)return;
 for(const item of paths){
  if(item.image&&item.imageBox){const b=item.imageBox;decal(g,item.image,b.x+b.width/2,b.y+b.height/2,b.width,b.height,texture);continue;}
  if(item.fabric&&d.pattern!=='solid'&&d.patternOpacity>0){
   drawFabric(g,item.d,item.fill,{pattern:d.pattern==='checks'?'plaid':d.pattern,trim:d.accent,patternScale:d.patternScale,patternOpacity:d.patternOpacity});
  }else vector(g,item.d,item.fill,item.stroke,item.strokeWidth);
 }
}
