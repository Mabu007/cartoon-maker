import type {ArtworkPoseClass} from './primaryArtworkPose.ts';
import {nativeBoneFor,boneVectorMatrix,nativePartFor,fixedVectorMatrix} from './nativeVectorBone.ts';
import {NativeBonePathCache} from './vectorArtworkRender.ts';
import { Matrix } from 'pixi.js';
import { boneArtworkTransform, type Point } from './artworkGeometry.ts';
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
  const shoe=component.slot.startsWith('shoe-')?(character.visual?.footSize??1)*character.thickness:1;
  const sx=shoe*(fit?build.shoulder:1),sy=shoe*(fit?character.torso*character.height:1);
  return {x:x+component.offsetX,y:y+component.offsetY,width:component.width*sx,height:component.height*sy,angle};
}
export function drawComponent(g:Graphics,character:Character,slot:CompiledArtwork['slot'],view:View,x:number,y:number,angle:number,texture?:CostumeTexture,vectorCache?:NativeBonePathCache,mirrored=false){
  const native=nativePartFor(character,slot,view,mirrored);
  const matrix=native&&fixedVectorMatrix(native,x,y,angle);
  if(native&&matrix&&vectorCache?.draw(g,native,matrix))return true;
  const component=componentFor(character,slot,view),image=component&&texture?.(component.image);
  if(!component||!image)return false;
  const box=componentTransform(component,character,x,y,angle);
  g.context.save().setTransform(at(box.x,box.y,1,1,angle));
  g.rect(-component.pivot.x*box.width,-component.pivot.y*box.height,box.width,box.height).fill({texture:image,textureSpace:'local'});
  g.context.restore();return true;
}

export function drawBoneComponent(g:Graphics,character:Character,slot:CompiledArtwork['slot'],view:View,start:Point,end:Point,thickness:number,texture?:CostumeTexture,vectorCache?:NativeBonePathCache,mirrored=false,pose:ArtworkPoseClass='rest'){
  const native=nativeBoneFor(character,slot,view,mirrored,pose),matrix=native&&boneVectorMatrix(start,end,thickness);
  if(native&&matrix&&vectorCache?.draw(g,native,matrix))return true;
  const part=componentFor(character,slot,view),image=part&&texture?.(part.image);
  if(!part||!image)return false;
  const transform=boneArtworkTransform(part,start,end,thickness);if(!transform)return false;
  g.context.save().setTransform(new Matrix(transform.a,transform.b,transform.c,transform.d,transform.tx,transform.ty));
  g.rect(0,0,part.width,part.height).fill({texture:image,textureSpace:'local'});g.context.restore();return true;
}
