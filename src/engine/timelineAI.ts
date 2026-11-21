import type { z } from 'zod';
import { timelineEdits } from './filmmakerAI.ts';
import { validateDialogueReplacement, replaceDialogueAsset } from './dialogueAudio.ts';
import { validateSceneReplacement } from './timelineCode.ts';
import { TimelineClip, uid, type Scene, type Project, type Clip } from './schema.ts';

export type TimelineEditProposal = z.infer<typeof timelineEdits>;
export type PreparedSpeech = {
  asset:Extract<Clip,{track:'dialogue'}>['asset']; length:number;
  visemes?:Extract<Clip,{track:'dialogue'}>['visemes'];
  lipSync?:Extract<Clip,{track:'dialogue'}>['lipSync'];
};
type Options={deferSpeech?:boolean;generatedAssets?:readonly string[]};
const allowedClipPatch:Readonly<Record<Clip['track'],readonly string[]>>={
  actors:['start','length','visible'],
  movement:['start','length','fromX','fromY','toX','toY','gait','keyframes'],
  body:['start','length','action','layer','target'],
  face:['start','length','expression'],
  gaze:['start','length','target'],
  props:['start','length','target','interaction'],
  dialogue:['start','length','offset','volume','muted','fadeIn','fadeOut','voicePreset'],
  audio:['start','length','offset','volume','muted','fadeIn','fadeOut','name','loop','asset'],
  music:['start','length','offset','volume','muted','fadeIn','fadeOut','name','loop','asset'],
  camera:['start','length','shot','focus','transition'],
  transition:['start','length','effect']
};
function locked(scene:Scene,track:Clip['track']){
  if(scene.trackSettings?.[track]?.locked)
    throw new Error(`The ${track} track is locked. Unlock it before directing.`);
}
function clipById(scene:Scene,id:string){
  const clip=scene.clips.find(item=>item.id===id);
  if(!clip)throw new Error(`Clip "${id}" no longer exists in this scene.`);
  return clip;
}
function setClip(scene:Scene,clip:Clip):Scene{
  return {...scene,clips:scene.clips.map(item=>item.id===clip.id?clip:item)};
}
function overlapping(a:{start:number;length:number},b:{start:number;length:number}){
  return a.start<b.start+b.length-.00001 && b.start<a.start+a.length-.00001;
}
function rejectNewDialogueCollision(scene:Scene,candidate:Extract<Clip,{track:'dialogue'}>,
  previous?:Extract<Clip,{track:'dialogue'}>){
  for(const other of scene.clips) {
    if(other.track!=='dialogue'||other.id===candidate.id)continue;
    if(overlapping(other,candidate)&&(!previous||!overlapping(other,previous)))
      throw new Error(`Dialogue clip "${candidate.id}" would newly overlap "${other.id}". Adjust its timing.`);
  }
}
function isDialogueTextChanged(previous:Clip|undefined,next:Clip){
  if(next.track!=='dialogue')return false;
  return previous?.track==='dialogue' && previous.text!==next.text && previous.asset===next.asset;
}
/** Apply structured commands only to the canonical Scene. The project schema
 * checks actor/prop references, timing, camera exclusivity, and stable IDs.
 * Unlike the original camera helper, AI never silently trims other shots.
 */
export function applyTimelineEdits(project:Project,scene:Scene,
  raw:TimelineEditProposal,options:Options={}):Scene{
  const proposal=timelineEdits.parse(raw);
  let next:Scene={...scene,clips:[...scene.clips],actors:[...scene.actors],objects:[...scene.objects]};
  for(const edit of proposal.edits){
    if(edit.op==='speak'){
      locked(next,'dialogue');
      if(!next.actors.some(actor=>actor.id===edit.actor))throw new Error(`Unknown speaking actor "${edit.actor}".`);
      if(edit.start>=next.duration)throw new Error('Dialogue starts outside the scene.');
      if(edit.clipId){
        const old=clipById(next,edit.clipId);
        if(old.track!=='dialogue'||old.actor!==edit.actor)throw new Error('Speech regeneration needs a dialogue clip for that actor.');
      }
      if(!options.deferSpeech)throw new Error('Speech must be generated after accepting the proposal.');
      continue;
    }
    if(edit.op==='place_scene'){
      if(!Object.keys(edit.changes).length)throw new Error('Specify a scene property to change.');
      next={...next,...edit.changes};continue;
    }
    if(edit.op==='place_actor'){
      if(!Object.keys(edit.changes).length)throw new Error('Specify an actor property to change.');
      if(!next.actors.some(actor=>actor.id===edit.actorId))throw new Error(`Actor "${edit.actorId}" does not exist.`);
      if(edit.changes.gazeTarget && edit.changes.gazeTarget!=='camera' &&
        !next.actors.some(actor=>actor.id===edit.changes.gazeTarget) &&
        !next.objects.some(prop=>prop.id===edit.changes.gazeTarget))
        throw new Error('The actor gaze target is missing.');
      next={...next,actors:next.actors.map(actor=>actor.id===edit.actorId?{...actor,...edit.changes}:actor)};
      continue;
    }
    if(edit.op==='place_prop'){
      if(!Object.keys(edit.changes).length)throw new Error('Specify a prop property to change.');
      if(!next.objects.some(prop=>prop.id===edit.propId))throw new Error(`Prop "${edit.propId}" does not exist.`);
      next={...next,objects:next.objects.map(prop=>prop.id===edit.propId?{...prop,...edit.changes}:prop)};
      continue;
    }
    if(edit.op==='add_prop'){
      if([...next.clips,...next.actors,...next.objects].some(item=>item.id===edit.prop.id))
        throw new Error(`The prop ID "${edit.prop.id}" is already in use.`);
      next={...next,objects:[...next.objects,edit.prop]};continue;
    }
    if(edit.op==='remove_prop'){
      if(!next.objects.some(prop=>prop.id===edit.propId))throw new Error(`Prop "${edit.propId}" does not exist.`);
      next={...next,objects:next.objects.filter(prop=>prop.id!==edit.propId)};
      // Linked clips must be explicitly removed/retargeted in the same proposal.
      continue;
    }
    if(edit.op==='insert'){
      locked(next,edit.clip.track);
      if([...next.clips,...next.actors,...next.objects].some(item=>item.id===edit.clip.id))
        throw new Error(`ID "${edit.clip.id}" is already in use.`);
      if(edit.clip.track==='dialogue')rejectNewDialogueCollision(next,edit.clip);
      next={...next,clips:[...next.clips,edit.clip]};continue;
    }
    const previous=clipById(next,edit.clipId);
    locked(next,previous.track);
    if(edit.op==='remove'){
      next={...next,clips:next.clips.filter(item=>item.id!==edit.clipId)};
      continue;
    }
    const candidate=edit.op==='replace'
      ? edit.clip
      : TimelineClip.parse({...previous,...edit.changes});
    if(candidate.id!==edit.clipId||candidate.track!==previous.track)
      throw new Error('An existing clip cannot change ID or track. Remove and insert explicitly.');
    if(edit.op==='update_clip')for(const field of Object.keys(edit.changes)){
      if(!allowedClipPatch[previous.track].includes(field))
        throw new Error(`Field "${field}" is not editable on the ${previous.track} track.`);
    }
    if(isDialogueTextChanged(previous,candidate))
      throw new Error('A changed dialogue line needs voice generation. Use the speak operation.');
    if(previous.track==='dialogue'&&candidate.track==='dialogue'){
      validateDialogueReplacement(next,previous,candidate.length);
      rejectNewDialogueCollision(next,candidate,previous);
    }
    next=setClip(next,candidate);
  }
  return validateSceneReplacement(project,scene.id,next,options.generatedAssets??[]);
}
export function countPendingSpeech(proposal:TimelineEditProposal){
  return proposal.edits.filter(item=>item.op==='speak').length;
}
/** Prepare audio only after explicit user approval; validates the whole
 * proposal before synthesis, then produces one atomic scene change.
 * Injectable synthesizer permits real voice+analysis or controlled QA.
 */
export async function prepareDirectorSpeech(
  project:Project,scene:Scene,proposal:TimelineEditProposal,
  generate:(text:string,voice:'warm'|'bright'|'deep',actorId:string)=>Promise<PreparedSpeech>
):Promise<{next:Scene;generatedAssets:string[]}>{
  const p=timelineEdits.parse(proposal);
  const base=applyTimelineEdits(project,scene,p,{deferSpeech:true});
  let candidate=base;
  const assets:string[]=[];
  for(const edit of p.edits){
    if(edit.op!=='speak')continue;
    const actor=candidate.actors.find(item=>item.id===edit.actor);
    if(!actor)throw new Error('The speaking actor no longer exists.');
    const character=project.characters.find(c=>c.id===actor.characterId);
    const voice=edit.voice??character?.voicePreset??'warm';
    const result=await generate(edit.text,voice,edit.actor);
    if(!result.asset.startsWith('asset:')||!Number.isFinite(result.length)||result.length<.1||result.length>180)
      throw new Error('Voice generation returned an invalid recording.');
    const end=edit.start+result.length;
    if(end>candidate.duration+.00001)
      throw new Error('Generated dialogue is too long for this scene. Extend the scene or shorten the line.');
    const previous=edit.clipId?clipById(candidate,edit.clipId):undefined;
    if(previous && (previous.track!=='dialogue'||previous.actor!==edit.actor))
      throw new Error('Regeneration must target dialogue from the same actor.');
    let newClip:Extract<Clip,{track:'dialogue'}>;
    if(previous?.track==='dialogue'){
      // If timing changed, it is explicit: update at the requested start, and
      // refuse newly introduced overlap rather than destroying neighbors.
      const staged=setClip(candidate,{...previous,start:edit.start});
      const replaced=replaceDialogueAsset(staged,previous.id,{
        text:edit.text,asset:result.asset,length:result.length,
        voicePreset:voice,visemes:result.visemes,lipSync:result.lipSync});
      newClip=clipById(replaced,previous.id) as Extract<Clip,{track:'dialogue'}>;
      rejectNewDialogueCollision(candidate,newClip,previous);
    }else{
      const collision=candidate.clips.find(item=>item.track==='dialogue' &&
        item.start<end-.00001 && item.start+item.length>edit.start+.00001);
      if(collision)throw new Error('New dialogue overlaps another line. Choose a free interval.');
      newClip={id:uid(),track:'dialogue',actor:edit.actor,text:edit.text,asset:result.asset,
        volume:1,muted:false,offset:0,start:edit.start,length:result.length,voicePreset:voice,
        ...(result.visemes?{visemes:result.visemes}:{}),
        ...(result.lipSync?{lipSync:result.lipSync}:{})};
    }
    candidate=previous
      ?setClip(candidate,newClip)
      :{...candidate,clips:[...candidate.clips,newClip]};
    assets.push(result.asset);
  }
  return {next:validateSceneReplacement(project,scene.id,candidate,assets),generatedAssets:assets};
}
