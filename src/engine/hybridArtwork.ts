import type { Graphics } from 'pixi.js';
import { at, type CostumeTexture } from './wardrobeArt.ts';
import { bodyProportions } from './bodyBuild.ts';
import type { Character, View } from './schema.ts';
import type { CompiledArtwork } from './visualAssets.ts';
export function componentFor(character:Character,slot:CompiledArtwork['slot'],view:View){
  return character.visual?.components?.find(component=>component.slot===slot&&component.view===view&&component.profiles.includes(character.visual!.profile));
}
export function componentTransform(component:CompiledArtwork,character:Character,x:number,y:number,angle=0){
  const build=bodyProportions(character),fit=component.fit==='body';
  const sx=fit?build.shoulder:1,sy=fit?character.torso*character.height:1;
  return {x:x+component.offsetX,y:y+component.offsetY,width:component.width*sx,height:component.height*sy,angle};
}
export function drawComponent(g:Graphics,character:Character,slot:CompiledArtwork['slot'],view:View,x:number,y:number,angle:number,texture?:CostumeTexture){
  const component=componentFor(character,slot,view),image=component&&texture?.(component.image);
  if(!component||!image)return false;
  const box=componentTransform(component,character,x,y,angle);
  g.context.save().setTransform(at(box.x,box.y,1,1,angle));
  g.rect(-component.pivot.x*box.width,-component.pivot.y*box.height,box.width,box.height).fill({texture:image,textureSpace:'local'});
  g.context.restore();return true;
}
