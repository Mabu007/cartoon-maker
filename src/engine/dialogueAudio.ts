import type { Clip, Scene } from './schema.ts';

type Dialogue = Extract<Clip, { track:'dialogue' }>;
type Version = NonNullable<Dialogue['versions']>[number];
const round = (number:number)=>Math.round(number*100)/100;
function getClip(scene:Scene, id:string):Dialogue {
  const clip=scene.clips.find(value=>value.id===id);
  if(!clip || clip.track!=='dialogue') throw new Error('This dialogue clip no longer exists.');
  if(scene.trackSettings?.dialogue?.locked) throw new Error('Unlock the Dialogue track before regenerating voices.');
  return clip;
}
export function validateDialogueReplacement(scene: Scene, clip: Dialogue, length: number) {
  if(!Number.isFinite(length) || length<.1 || length>180)
    throw new Error('The generated speech duration is invalid.');
  const end=clip.start+round(length), previousEnd=clip.start+clip.length;
  if(end>180+.00001) throw new Error('This line runs past the 180-second scene limit. Shorten the text or split the scene.');
  // Preserve existing artistic overlaps, but do not silently INTRODUCE a new
  // dialogue collision by lengthening one clip. Other tracks freely overlap.
  if(end>previousEnd+.00001) {
    const collision=scene.clips.find(item=>item.track==='dialogue'&&item.id!==clip.id
      && item.start<end-.00001 && item.start+item.length>previousEnd+.00001);
    if(collision) throw new Error('The new speech overlaps a nearby dialogue clip. Move that line, shorten this text, or adjust the timeline.');
  }
  return round(end);
}
export function dialogueVersion(clip: Dialogue): Version {
  return { asset:clip.asset,text:clip.text,length:clip.length,offset:clip.offset,
    ...(clip.voicePreset?{voicePreset:clip.voicePreset}:{}),
    ...(clip.visemes?{visemes:clip.visemes}:{}) };
}
export function replaceDialogueAsset(scene:Scene, id:string, value:{
  text:string; asset:string; length:number; voicePreset?:Dialogue['voicePreset']; visemes?:Dialogue['visemes']
}):Scene {
  const clip=getClip(scene,id);
  if(!value.text.trim() || value.text.length>400)throw new Error('Enter between 1 and 400 characters of dialogue.');
  const end=validateDialogueReplacement(scene,clip,value.length);
  const history=[...(clip.versions??[]),dialogueVersion(clip)].slice(-5);
  return {...scene,duration:Math.max(scene.duration,end),clips:scene.clips.map(item=>item.id===id
    ? {...clip,text:value.text.trim(),asset:value.asset,length:round(value.length),offset:0,
      voicePreset:value.voicePreset,visemes:value.visemes,versions:history} : item)};
}
export function restoreDialogueAsset(scene:Scene,id:string,index:number):Scene {
  const clip=getClip(scene,id), history=clip.versions??[];
  if(!Number.isInteger(index)||index<0||index>=history.length)throw new Error('That audio version is no longer available.');
  const item=history[index];
  const end=validateDialogueReplacement(scene,clip,item.length);
  const next=history.filter((_,i)=>i!==index).concat(dialogueVersion(clip)).slice(-5);
  return {...scene,duration:Math.max(scene.duration,end),clips:scene.clips.map(value=>value.id===id
    ? {...clip,asset:item.asset,text:item.text,length:item.length,offset:item.offset,
      voicePreset:item.voicePreset,visemes:item.visemes,versions:next} : value)};
}
