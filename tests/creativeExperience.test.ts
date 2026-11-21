import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import { addMovieScene,duplicateMovieScene,renameMovieScene,reorderMovieScene,removeMovieScene } from '../src/engine/sceneWorkflow.ts';
import { characterUsage,removeCharacterFromProject,propUsage,audioUsage } from '../src/engine/assetSafety.ts';
import { projectPreviewInfo } from '../src/engine/projectPreview.ts';
import { startProduction,makeStoryScene,fromOutline,makeLine,approveScript,compileMovie } from '../src/engine/production.ts';
import { evaluate,locate } from '../src/engine/evaluate.ts';
import { useStudio,currentScene } from '../src/studio.ts';
import { listLocal,saveLocal,mergeLocal,removeLocal,duplicateProject,
  renameSavedProject,updateProjectOrganization,rememberEditorSession,lastEditorSession,editorSessionFor } from '../src/services/projects.ts';

function localStorageFixture(){
  const data=new Map<string,string>();
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{data.set(key,value);},
    removeItem:(key:string)=>{data.delete(key);}
  }});
  return {data,restore:()=>{
    if(previous)Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }};
}
function prepared(){
  const project=makeProject(true),first=project.scenes[0];
  const cast=project.characters.slice(0,2).map(c=>c.id);
  const outline={...makeStoryScene('Scene one',cast),
    id:first.id,environment:first.environment,location:first.environment};
  const production=startProduction(project);
  production.bible.scenes=[outline];
  production.screenplay.scenes=[fromOutline(outline)];
  return ProjectDocument.parse({...project,production});
}
test('local autosave retains favorites and collections across a renamed edit',()=>{
  const local=localStorageFixture();
  try{
    const scope='experience',movie=makeProject();
    saveLocal(scope,movie,100);
    updateProjectOrganization(scope,movie.id,{favorite:true,collection:'in-production'});
    saveLocal(scope,{...movie,name:'Second draft'},101);
    const [entry]=listLocal(scope);
    assert.equal(entry.project.name,'Second draft');
    assert.equal(entry.favorite,true);
    assert.equal(entry.collection,'in-production');
    assert.equal(entry.updated,101);
    assert.equal(entry.project.scenes.length,movie.scenes.length);
  }finally{local.restore();}
});
test('cloud refresh can update saved movie without clearing local organizing choices',()=>{
  const local=localStorageFixture();
  try{
    const movie=makeProject();
    saveLocal('cloud',movie,20);
    updateProjectOrganization('cloud',movie.id,{favorite:true,collection:'ideas'});
    const remote={project:{...movie,name:'From another device'},updated:50};
    const [result]=mergeLocal('cloud',[remote]);
    assert.equal(result.project.name,'From another device');
    assert.equal(result.favorite,true);
    assert.equal(result.collection,'ideas');
  }finally{local.restore();}
});
test('rename, duplicate, search-ready metadata and delete preserve unrelated projects',()=>{
  const local=localStorageFixture();
  try{
    const first=makeProject(),second=makeProject(true);
    saveLocal('library',first,2);saveLocal('library',second,3);
    const renamed=renameSavedProject('library',first.id,' A new title  ');
    assert.equal(renamed.name,'A new title');
    const copy=duplicateProject(renamed);
    assert.notEqual(copy.id,renamed.id);
    assert.deepEqual(copy.scenes,renamed.scenes);
    saveLocal('library',copy,4);
    assert.equal(listLocal('library').length,3);
    removeLocal('library',copy.id);
    assert.equal(listLocal('library').length,2);
    assert(listLocal('library').some(item=>item.project.id===second.id));
  }finally{local.restore();}
});
test('each movie remembers its own workspace, scene and playhead and deletes stale sessions',()=>{
  const local=localStorageFixture();
  try{
    const a=makeProject(),b=makeProject();
    saveLocal('resume',a);saveLocal('resume',b);
    rememberEditorSession('resume',{projectId:a.id,sceneId:a.scenes[0].id,workspace:'write',playhead:7.25});
    rememberEditorSession('resume',{projectId:b.id,sceneId:b.scenes[0].id,workspace:'direct',playhead:15.2});
    assert.equal(editorSessionFor('resume',a.id)?.workspace,'write');
    assert.equal(editorSessionFor('resume',a.id)?.playhead,7.25);
    assert.equal(editorSessionFor('resume',b.id)?.playhead,15.2);
    assert.equal(lastEditorSession('resume')?.projectId,b.id);
    removeLocal('resume',b.id);
    assert.equal(editorSessionFor('resume',b.id),undefined);
    assert.equal(lastEditorSession('resume'),undefined);
    assert.equal(editorSessionFor('resume',a.id)?.playhead,7.25);
  }finally{local.restore();}
});
test('invalid stored session data is ignored rather than crashing project recovery',()=>{
  const local=localStorageFixture();
  try{
    local.data.set('toonroom.last-session.v1.fault','{bad json');
    assert.equal(lastEditorSession('fault'),undefined);
    local.data.set('toonroom.editor-session.v1.fault.some-id',
      JSON.stringify({projectId:'different',sceneId:'x',workspace:'direct',playhead:25}));
    assert.equal(editorSessionFor('fault','some-id'),undefined);
  }finally{local.restore();}
});
test('adding a scene links it to screenplay and Story Bible automatically',()=>{
  const movie=prepared();
  const result=addMovieScene(movie);
  assert.equal(result.project.scenes.length,2);
  assert(result.project.scenes.some(scene=>scene.id===result.scene.id));
  assert(result.project.production?.screenplay.scenes.some(scene=>scene.id===result.scene.id));
  assert(result.project.production?.bible.scenes.some(scene=>scene.id===result.scene.id));
  assert.equal(result.project.scenes[0].id,movie.scenes[0].id);
});
test('duplicating an animated scene retains world, cast and camera but regenerates script line IDs',()=>{
  const movie=prepared();
  const {project:updated,scene:copy}=duplicateMovieScene(movie,movie.scenes[0].id);
  const original=movie.scenes[0],script=updated.production!.screenplay.scenes;
  assert.notEqual(copy.id,original.id);
  assert.equal(updated.scenes[1].id,copy.id);
  assert.deepEqual(copy.actors,original.actors);
  assert.deepEqual(copy.clips,original.clips);
  assert.equal(copy.environment,original.environment);
  const a=script.find(scene=>scene.id===original.id)!;
  const b=script.find(scene=>scene.id===copy.id)!;
  assert.notEqual(a.elements[0].id,b.elements[0].id);
  assert.equal(updated.production?.scriptStatus,'draft');
});
test('renaming a scene updates timeline, screenplay and unlocked outline without affecting others',()=>{
  const original=prepared();
  const {project:withSecond}=addMovieScene(original);
  const changed=renameMovieScene(withSecond,withSecond.scenes[0].id,'New opening scene');
  assert.equal(changed.scenes[0].name,'New opening scene');
  assert.equal(changed.production?.screenplay.scenes.find(scene=>scene.id===changed.scenes[0].id)?.title,'New opening scene');
  assert.equal(changed.production?.bible.scenes.find(scene=>scene.id===changed.scenes[0].id)?.title,'New opening scene');
  assert.equal(changed.scenes[1].name,withSecond.scenes[1].name);
});
test('scene reorder changes sequential movie playback without losing per-scene worlds and timelines',()=>{
  const original=prepared();
  const {project:second}=addMovieScene(original);
  const id=second.scenes[1].id;
  const altered=ProjectDocument.parse({...second,scenes:second.scenes.map(scene=>
    scene.id===id?{...scene,environment:'Classroom' as const,duration:11}:scene)});
  const moved=reorderMovieScene(altered,id,-1);
  assert.equal(moved.scenes[0].id,id);
  assert.equal(moved.scenes[0].environment,'Classroom');
  assert.equal(moved.scenes[0].duration,11);
  assert.equal(moved.production!.screenplay.scenes[0].id,id);
  assert.equal(moved.production!.bible.scenes[0].id,id);
  assert.equal(locate(moved.scenes,5).scene.id,id);
  assert.equal(locate(moved.scenes,12).scene.id,altered.scenes[0].id);
  assert.equal(moved.scenes[1].clips.length,altered.scenes[0].clips.length);
});
test('removing a scene removes its script/outline links and prevents deleting the final scene',()=>{
  const withSecond=addMovieScene(prepared()).project;
  const removed=removeMovieScene(withSecond,withSecond.scenes[0].id);
  assert.equal(removed.scenes.length,1);
  assert.equal(removed.production?.screenplay.scenes.length,1);
  assert.equal(removed.production?.bible.scenes.length,1);
  assert.throws(()=>removeMovieScene(removed,removed.scenes[0].id),/one movie scene/i);
  assert.throws(()=>renameMovieScene(removed,removed.scenes[0].id,''),/scene name/i);
});
test('character deletion reports dependencies and leaves valid scene/script references',()=>{
  const movie=prepared(),actor=movie.scenes[0].actors.find(a=>a.characterId==='sbu')!;
  const production=movie.production!;
  const script=production.screenplay.scenes[0];
  const spoken={...makeLine('dialogue','I am still here'),characterId:'sbu'};
  const withSpeech=ProjectDocument.parse({...movie,production:{
    ...production,screenplay:{scenes:[{...script,elements:[...script.elements,spoken]}]}
  }});
  const counts=characterUsage(withSpeech,'sbu');
  assert(counts.sceneActors>0);
  assert(counts.actorClips>0);
  assert(counts.screenplay>0);
  const cleaned=removeCharacterFromProject(withSpeech,'sbu');
  assert(!cleaned.characters.some(c=>c.id==='sbu'));
  assert(cleaned.scenes.every(scene=>scene.actors.every(a=>a.characterId!=='sbu')));
  assert(cleaned.scenes.every(scene=>scene.clips.every(c=>!('actor' in c)||c.actor!==actor.id)));
  assert(cleaned.production?.screenplay.scenes.every(s=>s.elements.every(line=>line.characterId!=='sbu')));
  assert(cleaned.production?.bible.scenes.every(scene=>!scene.cast.includes('sbu')));
  assert.deepEqual(ProjectDocument.parse(cleaned),cleaned);
});
test('prop and audio usage reflect timeline references without deleting shared recordings',()=>{
  const movie=makeProject(true),first=movie.scenes[0];
  const object=first.objects.find(item=>first.clips.some(c=>'target' in c&&c.target===item.id))!;
  assert(object);
  const refs=propUsage(first,object.id);
  assert(refs.total>0);
  const sound=first.clips.find(clip=>clip.track==='dialogue')!;
  assert('asset' in sound);
  const use=audioUsage(movie,sound.asset);
  assert(use.active>0);
  const copy=duplicateProject(movie);
  assert.equal(audioUsage(copy,sound.asset).active,use.active);
});
test('movie cards summarize real scenes, running time, character usage and timeline activity',()=>{
  const movie=makeProject(true);
  const info=projectPreviewInfo(movie);
  assert.equal(info.sceneCount,movie.scenes.length);
  assert.equal(info.seconds,movie.scenes.reduce((sum,item)=>sum+item.duration,0));
  assert.equal(info.clipCount,movie.scenes.reduce((sum,item)=>sum+item.clips.length,0));
  assert(info.characterCount>=2);
});
test('beginner new blank flow can compile and enter directing without pre-existing approval',async()=>{
  const original=makeProject(),first=original.scenes[0];
  const outline={...makeStoryScene('My first scene',original.characters.slice(0,2).map(c=>c.id)),
    id:first.id,environment:first.environment,location:first.environment};
  const production=startProduction(original);
  production.bible.scenes=[outline];production.screenplay.scenes=[fromOutline(outline)];
  const beginning=ProjectDocument.parse({...original,production});
  assert.equal(beginning.production!.scriptStatus,'draft');
  assert.equal(beginning.production!.screenplay.scenes.length,1);
  const approved=approveScript(beginning.production!);
  const finished=await compileMovie({...beginning,production:approved},
    async()=>({asset:'builtin:sbu-food' as const,seconds:1.2}));
  assert.equal(finished.scenes.length,1);
  assert.equal(finished.id,beginning.id);
  assert.deepEqual(ProjectDocument.parse(finished),finished);
});
test('saved and reopened project retains a scene edit, scene-specific world and Undo history',()=>{
  const local=localStorageFixture();
  try{
    const first=prepared(),withSecond=addMovieScene(first).project;
    useStudio.getState().open(withSecond);
    useStudio.getState().setScene(withSecond.scenes[1].id);
    useStudio.getState().editScene(scene=>({...scene,environment:'Podcast studio'}));
    const edited=useStudio.getState().project;
    assert.equal(currentScene(useStudio.getState()).environment,'Podcast studio');
    useStudio.getState().undo();
    assert.notEqual(currentScene(useStudio.getState()).environment,'Podcast studio');
    useStudio.getState().redo();
    assert.equal(currentScene(useStudio.getState()).environment,'Podcast studio');
    saveLocal('trip',useStudio.getState().project,123);
    const [saved]=listLocal('trip');
    useStudio.getState().open(saved.project);
    useStudio.getState().setScene(edited.scenes[1].id);
    assert.equal(currentScene(useStudio.getState()).environment,'Podcast studio');
  }finally{local.restore();}
});
