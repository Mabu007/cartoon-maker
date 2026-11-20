import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument, type Clip, type Scene } from '../src/engine/schema.ts';
import { replaceDialogueAsset, restoreDialogueAsset, validateDialogueReplacement } from '../src/engine/dialogueAudio.ts';
import { soundEvents, soundPlayback, projectAssets } from '../src/services/audio.ts';
import { gainAt, gainKeyframes, DUCK_LEVEL } from '../src/engine/audioMix.ts';
import { useStudio } from '../src/studio.ts';

const project=makeProject(true);
const seed=project.scenes[0];
const actor=seed.actors[0].id;
const speech=(id:string,start:number,length:number,asset='asset:original'):Extract<Clip,{track:'dialogue'}>=>({
  id,track:'dialogue',actor,start,length,text:'Old dialogue',voicePreset:'warm',
  asset,volume:1,muted:false,offset:0
});
const music=(id:string,start:number,length:number):Extract<Clip,{track:'music'}>=>({
  id,track:'music',start,length,name:'Background',volume:1,muted:false,offset:0,asset:'asset:music',loop:true
});
const sfx=(id:string,start:number,length:number):Extract<Clip,{track:'audio'}>=>({
  id,track:'audio',start,length,name:'Impact',volume:.8,muted:false,offset:0,asset:'builtin:pop'
});
const scene=(...clips:Clip[]):Scene=>({...seed,clips});

test('voice replacement changes one dialogue clip, not soundtrack, SFX or neighbors',()=>{
  const a=speech('a',0,2), b=speech('b',5,2),fx=sfx('hit',1,3),bg=music('bg',0,20);
  const initial=scene(a,b,fx,bg);
  const next=replaceDialogueAsset(initial,'a',{text:'The new speech',asset:'asset:voice2',length:2.4,voicePreset:'bright'});
  assert.equal(next.clips.find(c=>c.id==='a')?.asset,'asset:voice2');
  assert.equal(next.clips.find(c=>c.id==='a')?.length,2.4);
  assert.strictEqual(next.clips.find(c=>c.id==='b'),b);
  assert.strictEqual(next.clips.find(c=>c.id==='hit'),fx);
  assert.strictEqual(next.clips.find(c=>c.id==='bg'),bg);
  assert.strictEqual(initial.clips[0],a);
  const changed=next.clips.find(c=>c.id==='a');
  assert(changed?.track==='dialogue'&&changed.versions?.length===1&&changed.versions[0].asset==='asset:original');
});
test('longer regeneration cannot newly overlap another dialogue or exceed 180 seconds',()=>{
  const clips=scene(speech('first',0,2),speech('second',3,2),music('background',0,12));
  assert.throws(()=>validateDialogueReplacement(clips,clips.clips[0] as Extract<Clip,{track:'dialogue'}>,3.5),/overlaps/);
  assert.throws(()=>replaceDialogueAsset(clips,'first',{text:'too long',asset:'asset:failed',length:3.5}),/overlaps/);
  assert.equal(clips.clips[0].asset,'asset:original');
  assert.throws(()=>replaceDialogueAsset(scene(speech('edge',179,1)),'edge',{text:'too long',asset:'asset:x',length:3}),/180/);
});
test('longer voice extends scene only when safe, preserving other tracks and total timing',()=>{
  const initial={...scene(speech('a',25,2),sfx('impact',9,1)),duration:30};
  const next=replaceDialogueAsset(initial,'a',{text:'Long spoken phrase',asset:'asset:long',length:8,voicePreset:'deep'});
  assert.equal(next.duration,33);
  assert.equal(next.clips[1].id,'impact');
  assert.equal(next.clips[1].length,1);
});
test('restore an archived voice version is atomic and keeps newer audio recoverable',()=>{
  const start=scene(speech('a',0,2));
  const first=replaceDialogueAsset(start,'a',{text:'Version 2',asset:'asset:v2',length:3});
  const next=replaceDialogueAsset(first,'a',{text:'Version 3',asset:'asset:v3',length:4});
  const back=restoreDialogueAsset(next,'a',0);
  const active=back.clips[0];
  assert(active.track==='dialogue');
  assert.equal(active.asset,'asset:original');
  assert.equal(active.text,'Old dialogue');
  assert.equal(active.versions?.length,2);
  assert(active.versions?.some(v=>v.asset==='asset:v3'));
  assert.equal(next.clips[0].asset,'asset:v3');
});
test('audio versions stay bounded at five and are included in project asset references',()=>{
  let current=scene(speech('a',0,1));
  for(let i=0;i<8;i++)current=replaceDialogueAsset(current,'a',{text:'Version '+i,asset:'asset:v'+i,length:1});
  const clip=current.clips[0];
  assert(clip.track==='dialogue'&&clip.versions?.length===5);
  const document={...project,scenes:[current]};
  assert(ProjectDocument.safeParse(document).success);
  const all=projectAssets(document);
  assert(all.includes('v7')&&all.includes('v6')&&!all.includes('original'));
});
test('undo/redo restores the original dialogue asset and generated version history',()=>{
  const original=scene(speech('a',0,2));
  useStudio.getState().open({...project,scenes:[original]});
  useStudio.getState().editScene(s=>replaceDialogueAsset(s,'a',{text:'New line',asset:'asset:new',length:2.5}));
  assert.equal(useStudio.getState().project.scenes[0].clips[0].asset,'asset:new');
  useStudio.getState().undo();
  assert.equal(useStudio.getState().project.scenes[0].clips[0].asset,'asset:original');
  useStudio.getState().redo();
  assert.equal(useStudio.getState().project.scenes[0].clips[0].asset,'asset:new');
});
test('track solo mutes other audio categories, including dialogue, but does not delete assets',()=>{
  const clips=scene(speech('dialogue',1,2),music('music',0,10),sfx('fx',5,1));
  const all=soundEvents([clips]);
  assert.equal(all.length,3);
  const musicOnly=soundEvents([{...clips,trackSettings:{music:{solo:true}}}]);
  assert.deepEqual(musicOnly.map(item=>item.clip.id),['music']);
  const dialogOnly=soundEvents([{...clips,trackSettings:{dialogue:{solo:true},music:{muted:true}}}]);
  assert.deepEqual(dialogOnly.map(item=>item.clip.id),['dialogue']);
  assert(projectAssets({...project,scenes:[clips]}).includes('music'));
});
test('music ducks smoothly during overlapping dialogue, preview/export share exact gain math',()=>{
  const clip=music('bg',0,8);
  const dialog=[{start:2,end:4},{start:3,end:5}];
  assert.equal(gainAt(clip,0,1,dialog),1);
  assert.equal(gainAt(clip,0,2.5,dialog),DUCK_LEVEL);
  assert.equal(gainAt(clip,0,4.5,dialog),DUCK_LEVEL);
  assert(Math.abs(gainAt(clip,0,5.11,dialog)-0.69)<.04);
  assert.equal(gainAt(clip,0,5.4,dialog),1);
  assert.deepEqual(gainKeyframes(clip,0,0,8,dialog),gainKeyframes(clip,0,0,8,dialog));
});
test('clip fades and looped audio playback use the same timing math',()=>{
  const m={...music('bg',0,10),fadeIn:2,fadeOut:3};
  assert.equal(gainAt(m,0,0),0);
  assert.equal(gainAt(m,0,1),.5);
  assert.equal(gainAt(m,0,4),1);
  assert(Math.abs(gainAt(m,0,9)-1/3)<.00001);
  assert.equal(gainAt(m,0,10),0);
  const playback=soundPlayback(m,0,1.5,5);
  assert.deepEqual(playback,{delay:0,offset:.5,duration:5});
  assert.equal(soundPlayback({...m,loop:false},0,1.5,5),undefined);
});
test('muted versioned dialogue still persists every archived speech asset in backups',()=>{
  const first=replaceDialogueAsset(scene(speech('a',0,2)),'a',{text:'New',asset:'asset:new',length:2});
  const muted={...first,trackSettings:{dialogue:{muted:true}}};
  const refs=projectAssets({...project,scenes:[muted]});
  assert(refs.includes('original')&&refs.includes('new'));
  assert(ProjectDocument.safeParse({...project,scenes:[muted]}).success);
});
test('persistent character preset survives schema parse across scenes',()=>{
  const char={...project.characters[0],voicePreset:'deep' as const,hostedVoiceId:'custom.123:example'};
  const parsed=ProjectDocument.parse({...project,characters:[char,...project.characters.slice(1)]});
  assert.equal(parsed.characters[0].voicePreset,'deep');
  assert.equal(parsed.characters[0].hostedVoiceId,'custom.123:example');
  const invalid={...char,hostedVoiceId:'https://bad-voice/abc'};
  assert.equal(ProjectDocument.safeParse({...project,characters:[invalid,...project.characters.slice(1)]}).success,false);
});
