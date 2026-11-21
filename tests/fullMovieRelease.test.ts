import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject,makeScene } from '../src/engine/presets.ts';
import { cameraConflicts } from '../src/engine/cameraTimeline.ts';
import { ProjectDocument, type Clip, type Project, type Scene } from '../src/engine/schema.ts';
import { evaluate,locate,projectDuration } from '../src/engine/evaluate.ts';
import { soundEvents,soundPlayback,projectAssets } from '../src/services/audio.ts';
import { parseMovieCode,movieToCode } from '../src/engine/movieTimeline.ts';
import { sceneToCode,parseSceneCode } from '../src/engine/timelineCode.ts';
import { resizeSceneTimeline } from '../src/engine/timelineEditing.ts';
import { useStudio,currentScene } from '../src/studio.ts';
import { saveLocal,listLocal } from '../src/services/projects.ts';

const actorS='actor-sbu',actorZ='actor-zee';
const VOICE_LENGTH=2.2;
const visemes=[
 {start:0,end:.12,shape:'closed' as const},
 {start:.12,end:.85,shape:'wide' as const},
 {start:.85,end:1.5,shape:'round' as const},
 {start:1.5,end:VOICE_LENGTH,shape:'rest' as const}
];
function stage(environment:Scene['environment'],number:number,actors:Scene['actors']):Scene{
 const base=makeScene(environment);
 const s={...base,id:'test-film-scene-'+number,name:'Act '+number,actors:structuredClone(actors),duration:12};
 const sbu=s.actors.find(a=>a.id===actorS)!,zee=s.actors.find(a=>a.id===actorZ)!;
 assert(sbu&&zee);
 const dialogue:Clip={id:'voice-'+number,track:'dialogue',actor:number===2?actorZ:actorS,
    asset:number===2?'builtin:zee-safe':'builtin:sbu-food',text:'We need to go now.',
    start:.3,length:VOICE_LENGTH,offset:0,volume:.9,muted:false,visemes,
    lipSync:{source:'estimated',engine:'QA fixture — no live audio alignment',analyzedDuration:VOICE_LENGTH}};
 const cameras:Clip[]=number===1?[
   {id:'wide-1',track:'camera',shot:'wide',transition:'cut',start:0,length:4},
   {id:'close-1',track:'camera',shot:'close-up',focus:actorS,transition:'cut',start:4,length:4},
   {id:'two-1',track:'camera',shot:'two-shot',transition:'cut',start:8,length:4}
 ]:number===2?[
   {id:'wide-2',track:'camera',shot:'wide',transition:'cut',start:0,length:6},
   {id:'medium-2',track:'camera',shot:'medium',focus:actorZ,transition:'cut',start:6,length:6}
 ]:[
   {id:'wide-3',track:'camera',shot:'wide',transition:'cut',start:0,length:3},
   {id:'follow-3',track:'camera',shot:'follow',focus:actorS,transition:'glide',start:3,length:4},
   {id:'close-3',track:'camera',shot:'close-up',focus:actorZ,transition:'cut',start:7,length:5}
 ];
 const clips:Clip[]=[
   ...cameras,dialogue,
   {id:'attention-'+number,track:'gaze',actor:actorZ,target:actorS,start:.3,length:5},
   {id:'gesture-'+number,track:'body',actor:actorS,action:'point',layer:'gesture',start:4.1,length:2},
   {id:'expression-'+number,track:'face',actor:actorS,expression:'happy',start:3,length:3},
   {id:'movement-'+number,track:'movement',actor:actorS,
     fromX:sbu.x,fromY:sbu.y,toX:sbu.x+120,toY:sbu.y,gait:'walk',start:1,length:3},
   {id:'fx-'+number,track:'audio',name:'Ding',asset:'builtin:ding',start:8.4,length:.4,
     offset:0,volume:.5,muted:false},
   {id:'music-'+number,track:'music',name:'Backdrop',asset:'builtin:sting',start:0,length:12,
     offset:0,volume:.25,muted:false,loop:true}
 ];
 return {...s,clips};
}
export function makeQAThreeSceneFilm():Project{
 const baseline=makeProject(true);
 const performers=baseline.scenes[0].actors;
 return ProjectDocument.parse({
   ...baseline,id:'release-qa-film',name:'The Three Scene Test',
   scenes:[
     stage('Living room',1,performers),
     stage('Classroom',2,performers),
     stage('Township street',3,performers)
   ]
 });
}
test('full three-scene movie contains real scenes, two performers, three worlds and all key clip kinds',()=>{
 const movie=makeQAThreeSceneFilm();
 assert.equal(movie.scenes.length,3);
 assert.equal(new Set(movie.scenes.map(scene=>scene.environment)).size,3);
 assert.equal(projectDuration(movie.scenes),36);
 for(const scene of movie.scenes){
   assert.equal(scene.actors.length,2);
   assert(scene.objects.length>0);
   for(const track of ['dialogue','camera','body','gaze','face','movement','audio','music']){
     assert(scene.clips.some(clip=>clip.track===track),scene.name+' missing '+track);
   }
   assert.equal(cameraConflicts(scene.clips).length,0);
 }
});
test('three scenes play in story order with independent worlds and deterministic camera/gaze/gesture',()=>{
 const movie=makeQAThreeSceneFilm(),scenes=movie.scenes;
 for(const [time,id] of [[1,scenes[0].id],[13,scenes[1].id],[26,scenes[2].id]] as const)
   assert.equal(locate(scenes,time).scene.id,id);
 const speech=evaluate(scenes[0],.36);
 assert.equal(speech.actors.find(a=>a.id===actorS)?.viseme?.shape,'closed');
 assert.equal(evaluate(scenes[0],.58).actors.find(a=>a.id===actorS)?.viseme?.shape,'wide');
 const focus=evaluate(scenes[0],1).actors.find(a=>a.id===actorZ)!;
 assert.equal(focus.gazeTarget,actorS);
 assert(focus.focus!==undefined);
 const gesture=evaluate(scenes[1],4.5).actors.find(a=>a.id===actorS)!;
 assert.equal(gesture.action,'point');
 assert(gesture.x>scenes[1].actors.find(a=>a.id===actorS)!.x);
 assert(evaluate(scenes[0],5).camera.zoom>1);
 assert(evaluate(scenes[2],8).camera.zoom>1);
 assert.equal(evaluate(scenes[1],2).actors.find(a=>a.id===actorS)?.locomotion,'walk');
});
test('scheduled audio keeps source metadata and absolute timing across all scene cuts',()=>{
 const movie=makeQAThreeSceneFilm(),events=soundEvents(movie.scenes);
 assert.equal(events.length,9);
 const each=events.filter(e=>e.clip.track==='dialogue');
 assert.equal(each.length,3);
 assert.deepEqual(each.map(e=>e.position),[.3,12.3,24.3]);
 assert.equal(soundPlayback(each[0].clip,each[0].position,3)?.duration,2.2);
 assert.equal(projectAssets(movie).length,0); // Built-in speech/music are bundled, no user blobs
});
test('movie and per-scene Code Mode JSON round-trip the identical canonical film',()=>{
 const movie=makeQAThreeSceneFilm(),text=movieToCode(movie);
 const parsed=parseMovieCode(text,movie);
 assert.deepEqual(parsed,movie);
 for(const scene of movie.scenes)
   assert.deepEqual(parseSceneCode(sceneToCode(scene),movie,scene.id),scene);
});
test('camera overlaps and unknown actor references are rejected before movie playback',()=>{
 const movie=makeQAThreeSceneFilm(),first=movie.scenes[0];
 const conflicts={...first,clips:[...first.clips,
   {id:'colliding-camera',track:'camera' as const,shot:'close-up' as const,
     focus:actorS,transition:'cut' as const,start:5,length:2}]};
 assert(cameraConflicts(conflicts.clips).length>0);
 assert.equal(ProjectDocument.safeParse({...movie,scenes:[conflicts,...movie.scenes.slice(1)]}).success,false);
 const broken={...first,clips:[...first.clips,
   {id:'missing-actor',track:'face' as const,actor:'ghost',expression:'happy' as const,
     start:2,length:1}]};
 assert.equal(ProjectDocument.safeParse({...movie,scenes:[broken,...movie.scenes.slice(1)]}).success,false);
});
test('scene shrink handles movement/audio/camera without leaving clips outside new duration',()=>{
 const original=makeQAThreeSceneFilm().scenes[0];
 const trimmed=resizeSceneTimeline(original,10);
 assert.equal(trimmed.duration,10);
 assert(trimmed.clips.every(clip=>clip.start+clip.length<=10+.0001));
 assert.equal(cameraConflicts(trimmed.clips).length,0);
});
test('finished film survives local save/reopen and Undo/Redo of an edited camera timeline',()=>{
 const store=new Map<string,string>(),previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
   getItem:(key:string)=>store.get(key)??null,
   setItem:(key:string,value:string)=>{store.set(key,value);},
   removeItem:(key:string)=>{store.delete(key);}
 }});
 try {
   const movie=makeQAThreeSceneFilm();
   useStudio.getState().open(movie);
   useStudio.getState().setScene(movie.scenes[1].id);
   const originalName=currentScene(useStudio.getState()).name;
   useStudio.getState().editScene(scene=>({...scene,name:'New middle scene'}));
   assert.equal(currentScene(useStudio.getState()).name,'New middle scene');
   useStudio.getState().undo();
   assert.equal(currentScene(useStudio.getState()).name,originalName);
   useStudio.getState().redo();
   saveLocal('film-release',useStudio.getState().project);
   const reopened=listLocal('film-release')[0].project;
   assert.equal(reopened.scenes[1].name,'New middle scene');
   assert.equal(reopened.scenes[0].name,movie.scenes[0].name);
   assert.equal(reopened.scenes[2].environment,'Township street');
   assert.equal(projectDuration(reopened.scenes),36);
   assert.deepEqual(ProjectDocument.parse(reopened),reopened);
 }finally {
   if(previous)Object.defineProperty(globalThis,'localStorage',previous);
   else Reflect.deleteProperty(globalThis,'localStorage');
 }
});
