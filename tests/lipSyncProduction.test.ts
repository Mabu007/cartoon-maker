import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument, type Clip, type Scene } from '../src/engine/schema.ts';
import { evaluate, locate, MOVIE_FRAME_RATE } from '../src/engine/evaluate.ts';
import { sampleTimedViseme } from '../src/engine/visemes.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';
import { moveTimelineClips, trimTimelineClip } from '../src/engine/timelineEditing.ts';
import { replaceDialogueAsset,restoreDialogueAsset } from '../src/engine/dialogueAudio.ts';
import { parseRhubarbOutput, createLipSyncAnalyzer, alignmentKey, RHUBARB_ENGINE,
  type Analysis, validStoredAlignment } from '../src/services/lipSync.ts';

const film=makeProject(true),template=film.scenes[0],actor=template.actors[0].id;
const fixture={
 metadata:{duration:0.47},
 mouthCues:[
  {start:0,end:.05,value:'X'},
  {start:.05,end:.27,value:'D'},
  {start:.27,end:.31,value:'C'},
  {start:.31,end:.43,value:'B'},
  {start:.43,end:.47,value:'X'}
 ]
};
const clip=(id='speech',start=3,length=1,offset=0):Extract<Clip,{track:'dialogue'}>=>({
 id,track:'dialogue',actor,start,length,offset,
 asset:'asset:demo-voice',muted:false,volume:1,text:'Hello',voicePreset:'warm'
});
const withSpeech=(...clips:Clip[]):Scene=>({...template,clips,duration:12});
const alignment=(seconds:number)=>({source:'rhubarb' as const,engine:RHUBARB_ENGINE,analyzedDuration:seconds,
 cacheKey:'e'.repeat(64)});

test('real Rhubarb JSON parses official sample with correct A-H/X mapping',()=>{
 const cues=parseRhubarbOutput(fixture,.47);
 assert.deepEqual(cues.map(item=>item.shape),['rest','open','open','wide','rest']);
 assert.equal(cues[0].start,0);
 assert.equal(cues[3].end,.43);
 const additions=parseRhubarbOutput({metadata:{duration:1},mouthCues:[
  {start:0,end:.11,value:'A'},{start:.11,end:.23,value:'E'},
  {start:.23,end:.36,value:'F'},{start:.36,end:.55,value:'G'},
  {start:.55,end:.73,value:'H'},{start:.73,end:1,value:'X'}]},1);
 assert.deepEqual(additions.map(c=>c.shape),['closed','round','pucker','bite','tongue','rest']);
 assert.equal(sampleTimedViseme(additions,.05).shape,'closed');
 assert.equal(sampleTimedViseme(additions,.05).weight,1);
});
test('invalid or untrusted Rhubarb JSON cannot be accepted as aligned',()=>{
 for (const data of [null,{}, {mouthCues:[]},
   {metadata:{duration:20},mouthCues:fixture.mouthCues},
   {mouthCues:[{start:0,end:.2,value:'Z'}]},
   {mouthCues:[{start:.3,end:.4,value:'X'},{start:.1,end:.5,value:'A'}]},
   {mouthCues:[{start:0,end:999,value:'X'}]}])
   assert.throws(()=>parseRhubarbOutput(data,.47));
});
test('non-contiguous Rhubarb cues explicitly rest during silence and after speech',()=>{
 const cues=parseRhubarbOutput({metadata:{duration:2},mouthCues:[
  {start:.3,end:.5,value:'A'},{start:1,end:1.25,value:'D'},
  {start:1.25,end:1.5,value:'X'}]},2);
 assert.equal(sampleTimedViseme(cues,.1).shape,'rest');
 assert.equal(sampleTimedViseme(cues,.4).shape,'closed');
 assert.equal(sampleTimedViseme(cues,.7).weight,0);
 assert.equal(sampleTimedViseme(cues,1.1).shape,'open');
 assert.equal(sampleTimedViseme(cues,1.75).weight,0);
 assert.equal(sampleTimedViseme(cues,2).weight,0);
});
test('cue sampling is independent of frame rate, backward seeks, pauses and random seeks',()=>{
 const cues=parseRhubarbOutput(fixture,.47);
 const times=[.01,.05,.06,.19,.27,.30,.38,.43,.46,.47,.20,.06];
 for (const time of times) assert.deepEqual(sampleTimedViseme(cues,time),sampleTimedViseme(cues,time));
 assert.equal(sampleTimedViseme(cues,.1).shape,'open');
 assert.equal(sampleTimedViseme(cues,.1+.0001).shape,'open');
 assert.equal(sampleTimedViseme(cues,.44).shape,'rest');
});
test('scene audio source offset, left trim and seeking sample the same media time',()=>{
 const cues=parseRhubarbOutput({metadata:{duration:2},mouthCues:[
  {start:0,end:.3,value:'X'},{start:.3,end:.7,value:'A'},
  {start:.7,end:1.2,value:'D'},{start:1.2,end:2,value:'X'}]},2);
 const speech={...clip('line',4,1.4,.2),visemes:cues,lipSync:alignment(2)};
 const scene=withSpeech(speech);
 assert.equal(evaluate(scene,4.15).actors.find(a=>a.id===actor)?.viseme?.shape,'closed');
 assert.equal(evaluate(scene,4.65).actors.find(a=>a.id===actor)?.viseme?.shape,'open');
 assert.equal(evaluate(scene,5.3).actors.find(a=>a.id===actor)?.viseme?.shape,'rest');
 const trimmed=trimTimelineClip(scene,'line','in',4.4);
 const next=trimmed.clips[0];assert(next.track==='dialogue');
 assert.equal(next.offset,.6);
 assert.deepEqual(next.visemes,cues);
 assert.equal(evaluate(trimmed,4.65).actors.find(a=>a.id===actor)?.viseme?.shape,'open');
 const shifted=moveTimelineClips(trimmed,['line'],2);
 assert.deepEqual(shifted.clips[0].track==='dialogue'?shifted.clips[0].visemes:undefined,cues);
 assert.equal(evaluate(shifted,6.65).actors.find(a=>a.id===actor)?.viseme?.shape,'open');
});
test('silent or muted dialogue does not produce lip flapping or emotional oscillators',()=>{
 const cues=parseRhubarbOutput({metadata:{duration:1},mouthCues:[
  {start:0,end:.2,value:'X'},{start:.2,end:.4,value:'A'},
  {start:.4,end:1,value:'X'}]},1);
 const speech={...clip('a',2,1),visemes:cues,lipSync:alignment(1)};
 const scene=withSpeech(speech);
 assert.equal(evaluate(scene,2.1).actors.find(a=>a.id===actor)?.viseme?.weight,0);
 assert.equal(evaluate(scene,2.25).actors.find(a=>a.id===actor)?.viseme?.shape,'closed');
 assert.equal(evaluate(scene,2.8).actors.find(a=>a.id===actor)?.viseme?.shape,'rest');
 assert.equal(evaluate(withSpeech({...speech,muted:true}),2.25).actors.find(a=>a.id===actor)?.speaking,false);
 const atRest=facialPerformance(2.1,actor,'talk','happy',0,{shape:'rest',weight:0});
 assert.equal(atRest.mouthOpen,0);
 const atClose=facialPerformance(2.25,actor,'talk','happy',1,{shape:'closed',weight:1});
 assert.equal(atClose.mouthOpen,0);
 assert.equal(facialPerformance(2.1,actor,'talk','neutral').mouthOpen,0);
});
test('cache identity includes original audio, exact transcript, recognizer and engine',async()=>{
 const a=new Blob([new Uint8Array([1,2,3])]),b=new Blob([new Uint8Array([1,2,4])]);
 const key=await alignmentKey(a,'Hello'),again=await alignmentKey(a,'Hello');
 assert.equal(key,again);assert.match(key,/^[a-f0-9]{64}$/);
 assert.notEqual(key,await alignmentKey(a,'Hello!'));
 assert.notEqual(key,await alignmentKey(b,'Hello'));
 assert.notEqual(key,await alignmentKey(a,'Hello','phonetic'));
});
test('a cache hit and concurrent requests avoid repeated Rhubarb execution',async()=>{
 const store=new Map<string,Analysis>();let calls=0,normalizations=0;
 const adapter={
  normalize:async(audio:Blob)=>{normalizations++;return audio;},
  request:async()=>{calls++;return {metadata:{duration:1},mouthCues:[{start:0,end:.3,value:'X'},
   {start:.3,end:.5,value:'A'},{start:.5,end:1,value:'X'}]};},
  read:async(key:string)=>store.get(key),
  save:async(key:string,result:Analysis)=>{store.set(key,result);}
 };
 const analyze=createLipSyncAnalyzer(adapter),audio=new Blob([new Uint8Array([99,9,3])]);
 const pair=await Promise.all([analyze(audio,'Hello',1),analyze(audio,'Hello',1)]);
 assert.equal(calls,1);assert.equal(normalizations,1);
 assert.equal(pair[0].source,'rhubarb');assert.deepEqual(pair[0],pair[1]);
 const other=createLipSyncAnalyzer(adapter);
 assert.equal((await other(audio,'Hello',1)).source,'rhubarb');
 assert.equal(calls,1);
 await analyze(audio,'Different transcript',1);
 assert.equal(calls,2);
});
test('failed Rhubarb call uses an explicitly estimated fallback, never poisons cache',async()=>{
 const store=new Map<string,Analysis>();let calls=0;
 const analyzer=createLipSyncAnalyzer({
  normalize:async(audio:Blob)=>audio,
  request:async()=>{calls++;if(calls===1)throw Error('Worker unavailable');
   return {metadata:{duration:1},mouthCues:[{start:0,end:1,value:'A'}]};},
  read:async(key:string)=>store.get(key),
  save:async(key:string,result:Analysis)=>{store.set(key,result);}
 });
 const audio=new Blob([new Uint8Array([2,3,4])]);
 const unavailable=await analyzer(audio,'Mama',1);
 assert.equal(unavailable.source,'estimated');assert.match(unavailable.reason??'',/Worker/);
 assert.equal(store.size,0);
 const second=await analyzer(audio,'Mama',1);
 assert.equal(second.source,'rhubarb');assert.equal(store.size,1);assert.equal(calls,2);
});
test('audio cue provenance and reusable keys survive project schema roundtrip and voice history',()=>{
 const speech={...clip('a',0,1),visemes:parseRhubarbOutput(
   {metadata:{duration:1},mouthCues:[{start:0,end:1,value:'A'}]},1),lipSync:alignment(1)};
 const original=withSpeech(speech),next=replaceDialogueAsset(original,'a',{
  text:'New voice',asset:'asset:new-recording',length:1.2,
  visemes:parseRhubarbOutput({metadata:{duration:1.2},
   mouthCues:[{start:0,end:1.2,value:'B'}]},1.2),
  lipSync:alignment(1.2)
 });
 const project=ProjectDocument.parse({...film,scenes:[next]});
 const restored=restoreDialogueAsset(project.scenes[0],'a',0);
 const old=restored.clips[0];
 assert(old.track==='dialogue');
 assert.equal(old.lipSync?.source,'rhubarb');
 assert.equal(old.lipSync?.cacheKey,'e'.repeat(64));
 assert.equal(old.visemes?.[0].shape,'closed');
 assert(old.versions?.some(v=>v.asset==='asset:new-recording'));
});
test('export frame timestamps and preview scene clock evaluate the same viseme and cue boundaries',()=>{
 const cues=parseRhubarbOutput({metadata:{duration:3},mouthCues:[
  {start:0,end:.3,value:'X'},{start:.3,end:.7,value:'A'},
  {start:.7,end:1.2,value:'C'},{start:1.2,end:1.7,value:'G'},
  {start:1.7,end:3,value:'X'}]},3);
 const first=withSpeech({...clip('spoken',2,2.5),visemes:cues,lipSync:alignment(3)});
 const second={...first,id:'next-scene',name:'After',duration:12};
 const scenes=[first,second];
 for(const frame of [0,60,70,77,83,90,96,103,127,145,360,450]){
  const elapsed=frame/MOVIE_FRAME_RATE;
  const preview=locate(scenes,elapsed),exportFrame=locate(scenes,elapsed);
  const sampled=evaluate(preview.scene,preview.local).actors.find(a=>a.id===actor)?.viseme;
  assert.deepEqual(sampled,evaluate(exportFrame.scene,exportFrame.local).actors.find(a=>a.id===actor)?.viseme);
 }
});

test('malformed old cache entries are never accepted as verified Rhubarb output',()=>{
 const legitimate:Analysis={source:'rhubarb',engine:RHUBARB_ENGINE,cacheKey:'a'.repeat(64),
  analyzedDuration:1,cues:[{start:0,end:1,shape:'closed',strength:1}]};
 assert.equal(validStoredAlignment(legitimate,'a'.repeat(64),1),true);
 assert.equal(validStoredAlignment({...legitimate,cues:[{start:0,end:1,shape:'bogus' as 'closed'}]},'a'.repeat(64),1),false);
 assert.equal(validStoredAlignment({...legitimate,cacheKey:'b'.repeat(64)},'a'.repeat(64),1),false);
 assert.equal(validStoredAlignment({...legitimate,cues:[{start:0,end:2,shape:'closed'}]},'a'.repeat(64),1),false);
});
