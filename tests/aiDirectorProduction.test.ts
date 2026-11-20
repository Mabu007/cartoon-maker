import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { generateCreative, type CreativeModel } from '../src/engine/creativeModel.ts';
import { applyTimelineEdits,prepareDirectorSpeech,type TimelineEditProposal } from '../src/engine/timelineAI.ts';
import { cameraConflicts,sceneToCode,parseSceneCode } from '../src/engine/timelineCode.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { useStudio,currentScene } from '../src/studio.ts';
import type { Scene,Project,Clip } from '../src/engine/schema.ts';

function setup(){
  const movie=makeProject(true),scene={...movie.scenes[0],clips:[]};
  return {project:{...movie,scenes:[scene]},scene,
    sbu:scene.actors.find(a=>a.characterId==='sbu')!.id,
    zee:scene.actors.find(a=>a.characterId==='zee')!.id};
}
function dialogue(actor:string,id='speech'):Extract<Clip,{track:'dialogue'}>{
  return {id,track:'dialogue',actor,text:'Original speech',asset:'builtin:sbu-food',
    start:2,length:3,offset:0,volume:1,muted:false};
}
async function ask(project:Project,scene:Scene,prompt:string,result:TimelineEditProposal){
  const model:CreativeModel={complete:async ({user})=>{
    assert.equal(JSON.parse(user).prompt,prompt);
    return JSON.stringify(result);
  }};
  const proposal=await generateCreative('timeline',model,'test-director',{prompt,context:{
    actors:scene.actors,scene,characters:project.characters.map(c=>({id:c.id,name:c.name}))}});
  return applyTimelineEdits(project,scene,proposal,{deferSpeech:true});
}
test('conversation 1: Zee watches talking Sbu then an angry close-up',async()=>{
  const {project,scene,sbu,zee}=setup();
  const opening={...scene,clips:[dialogue(sbu)]},movie={...project,scenes:[opening]};
  const next=await ask(movie,opening,'Zee looks at Sbu while he talks, then cut close to annoyed Zee.',{
    message:'Stage the reaction.',edits:[
      {op:'insert',clip:{id:'zee-gaze',track:'gaze',actor:zee,target:sbu,start:2,length:4}},
      {op:'insert',clip:{id:'zee-annoyed',track:'face',actor:zee,expression:'angry',start:6,length:3}},
      {op:'insert',clip:{id:'wide',track:'camera',shot:'wide',start:0,length:6,transition:'cut'}},
      {op:'insert',clip:{id:'reaction',track:'camera',shot:'close-up',focus:zee,start:6,length:3,transition:'cut'}}
    ]});
  assert.equal(opening.clips.length,1);
  assert.equal(cameraConflicts(next.clips).length,0);
  assert.equal(evaluate(next,3).actors.find(a=>a.id===zee)?.gazeTarget,sbu);
  assert.equal(evaluate(next,7).actors.find(a=>a.id===zee)?.expression,'angry');
  assert(evaluate(next,7).camera.zoom>1);
  assert.deepEqual(parseSceneCode(sceneToCode(next),movie,opening.id),next);
});
test('conversation 2: walking to a new mark with a waving gesture',async()=>{
  const {project,scene,zee}=setup(),actor=scene.actors.find(a=>a.id===zee)!;
  const next=await ask(project,scene,'Make Zee walk to the right and wave.',{
    message:'Walk and wave.',edits:[
      {op:'insert',clip:{id:'walk-right',track:'movement',actor:zee,
        fromX:actor.x,fromY:actor.y,toX:actor.x+100,toY:actor.y,start:1,length:4,gait:'walk'}},
      {op:'insert',clip:{id:'wave',track:'body',actor:zee,start:3,length:2,action:'wave',layer:'gesture'}}
    ]});
  assert(evaluate(next,3).actors.find(a=>a.id===zee)!.x>actor.x);
  assert.equal(evaluate(next,3.5).actors.find(a=>a.id===zee)?.action,'wave');
  assert.equal(evaluate(next,5).actors.find(a=>a.id===zee)?.x,actor.x+100);
});
test('conversation 3: nervous emotion with directed eyes and a pointed hand',async()=>{
  const {project,scene,sbu}=setup(),prop=scene.objects[0];
  assert(prop);
  const next=await ask(project,scene,'Sbu looks nervous at the door, then points at it.',{
    message:'Nervous prop-focused gesture.',edits:[
      {op:'insert',clip:{id:'nervous',track:'face',actor:sbu,expression:'nervous',start:1,length:5}},
      {op:'insert',clip:{id:'eyes',track:'gaze',actor:sbu,target:prop.id,start:1,length:5}},
      {op:'insert',clip:{id:'point',track:'body',actor:sbu,action:'point',layer:'gesture',start:3,length:2}}
    ]});
  assert.equal(evaluate(next,2).actors.find(a=>a.id===sbu)?.expression,'nervous');
  assert.equal(evaluate(next,2).actors.find(a=>a.id===sbu)?.gazeTarget,prop.id);
  assert.equal(evaluate(next,3.5).actors.find(a=>a.id===sbu)?.action,'point');
});
test('conversation 4: new dialogue generated only after Apply, with one-clip replacement and Undo',async()=>{
  const {project,scene,sbu}=setup(),opening={...scene,clips:[dialogue(sbu),
    {...dialogue(sbu,'other-line'),start:9}]},movie={...project,scenes:[opening]};
  const proposal:TimelineEditProposal={message:'Replace one voice.',edits:[
    {op:'speak',actor:sbu,clipId:'speech',start:2,voice:'deep',text:'We need to get going now.'}
  ]};
  let created=0;
  const preview=await ask(movie,opening,'Make Sbu say we need to get going now.',proposal);
  assert.equal(preview.clips[0].asset,'builtin:sbu-food');
  assert.equal(created,0);
  const prepared=await prepareDirectorSpeech(movie,opening,proposal,async()=>{
    created++;return {asset:'asset:director-demo',length:2.5,
      visemes:[{start:0,end:2.5,shape:'open'}],
      lipSync:{source:'estimated',engine:'unit-test',analyzedDuration:2.5}};
  });
  assert.equal(created,1);
  assert.equal(prepared.next.clips[0].asset,'asset:director-demo');
  const line=prepared.next.clips[0];assert(line.track==='dialogue');
  assert.equal(line.versions?.[0].asset,'builtin:sbu-food');
  assert.deepEqual(prepared.next.clips[1],opening.clips[1]);
  useStudio.getState().open(movie);
  useStudio.getState().editScene(()=>prepared.next);
  assert.equal(currentScene(useStudio.getState()).clips[0].asset,'asset:director-demo');
  useStudio.getState().undo();
  assert.equal(currentScene(useStudio.getState()).clips[0].asset,'builtin:sbu-food');
});
test('conversation 5: place props, change world, schedule SFX and music',async()=>{
  const {project,scene}=setup(),prop=scene.objects[0];
  const next=await ask(project,scene,'Move the prop to the left, add a ding and a music cue.',{
    message:'Recompose with cues.',edits:[
      {op:'place_prop',propId:prop.id,changes:{x:310,y:390}},
      {op:'place_scene',changes:{environment:'Classroom'}},
      {op:'insert',clip:{id:'ding-cue',track:'audio',name:'Ding',asset:'builtin:ding',
        start:3,length:.6,offset:0,volume:.7,muted:false}},
      {op:'insert',clip:{id:'song-cue',track:'music',name:'Sting',asset:'builtin:sting',
        start:1,length:5,offset:0,volume:.4,muted:false,loop:true}}
    ]});
  assert.equal(next.objects.find(p=>p.id===prop.id)?.x,310);
  assert.equal(next.environment,'Classroom');
  assert.equal(next.clips.length,2);
  assert.deepEqual(parseSceneCode(sceneToCode(next),project,scene.id),next);
});
test('invalid actor/prop, camera overlap, unknown asset and locked tracks are rejected atomically',()=>{
  const {project,scene,sbu}=setup();
  const proposal=(edits:TimelineEditProposal['edits']):TimelineEditProposal=>({message:'Unsafe.',edits});
  assert.throws(()=>applyTimelineEdits(project,scene,proposal([
    {op:'insert',clip:{id:'x',track:'face',actor:'unknown',expression:'happy',start:0,length:1}}
  ])),/validate|reference|actor/i);
  assert.throws(()=>applyTimelineEdits(project,scene,proposal([
    {op:'place_prop',propId:'non-existent',changes:{x:3}}
  ])),/does not exist/);
  assert.throws(()=>applyTimelineEdits(project,scene,proposal([
    {op:'insert',clip:{id:'fake',track:'audio',name:'Sound',asset:'asset:not-real',start:0,length:1,offset:0,volume:1,muted:false}}
  ])),/unknown audio/i);
  const withShot={...scene,clips:[{id:'shot',track:'camera' as const,shot:'wide' as const,transition:'cut' as const,start:0,length:10}]};
  assert.throws(()=>applyTimelineEdits({...project,scenes:[withShot]},withShot,proposal([
    {op:'insert',clip:{id:'overlap',track:'camera',shot:'close-up',start:4,length:3,transition:'cut'}}
  ])),/camera|overlap/i);
  assert.throws(()=>applyTimelineEdits(project,{...scene,trackSettings:{face:{locked:true}}},proposal([
    {op:'insert',clip:{id:'face',track:'face',actor:sbu,expression:'angry',start:1,length:1}}
  ])),/locked/i);
  assert.equal(scene.clips.length,0);
});
test('unsupported clip fields and dialogue text substitution without new voice are prohibited',()=>{
  const {project,scene,sbu}=setup(),opening={...scene,clips:[dialogue(sbu)]};
  const movie={...project,scenes:[opening]};
  const proposal=(edits:TimelineEditProposal['edits']):TimelineEditProposal=>({message:'Unsafe.',edits});
  assert.throws(()=>applyTimelineEdits(movie,opening,proposal([
    {op:'update_clip',clipId:'speech',changes:{injected:'value'}}
  ])),/field|validate|unrecognized|invalid/i);
  assert.throws(()=>applyTimelineEdits(movie,opening,proposal([
    {op:'replace',clipId:'speech',clip:{...dialogue(sbu),text:'Wrong voice'}}
  ])),/voice/i);
  assert.equal(opening.clips[0].text,'Original speech');
});
test('generated dialogue cannot overlap an existing line or exceed the scene duration',async()=>{
  const {project,scene,sbu}=setup(),opening={...scene,clips:[dialogue(sbu)]},movie={...project,scenes:[opening]};
  const create=async()=>({asset:'asset:test-voice' as const,length:2});
  await assert.rejects(prepareDirectorSpeech(movie,opening,{
    message:'Unsafe line.',edits:[{op:'speak',actor:sbu,text:'Hello',start:3}]
  },create),/overlap/i);
  await assert.rejects(prepareDirectorSpeech(movie,opening,{
    message:'Too long.',edits:[{op:'speak',actor:sbu,text:'Hello',start:29.5}]
  },create),/too long/i);
});
