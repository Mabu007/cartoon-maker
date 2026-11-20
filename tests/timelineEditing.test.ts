import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument, type Clip, type Scene } from '../src/engine/schema.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { sceneSounds } from '../src/services/audio.ts';
import { useStudio } from '../src/studio.ts';
import { selectClipRange, snapTime, snapGuides, compatibleTrack, moveTimelineClips, trimTimelineClip, splitTimelineClips, deleteMovementKeyframe, deleteTimelineClips, pasteTimelineClips, duplicateTimelineClips, resizeSceneTimeline } from '../src/engine/timelineEditing.ts';

const project=makeProject(true), original=project.scenes[0], actor=original.actors[0].id;
const scene=(...clips:Clip[]):Scene=>({...original,clips});
const move=(id:string,start:number,length=4):Clip=>({id,track:'movement',actor,start,length,fromX:100,fromY:200,toX:300,toY:200});
const sound=(id:string,start:number,length=2):Clip=>({id,track:'audio',name:id,start,length,volume:1,muted:false,offset:0,asset:'builtin:ding'});

test('click selection, shift-range and ctrl-toggle are deterministic',()=>{
  const s=scene(move('a',0),move('b',5),move('c',10));
  assert.deepEqual(selectClipRange(s,[],'a','b'),['b']);
  assert.deepEqual(selectClipRange(s,['a'],'a','c',true),['a','b','c']);
  assert.deepEqual(selectClipRange(s,['a','b'],'a','b',false,true),['a']);
});
test('pixel-accurate snapping includes playhead, clip edges and markers',()=>{
  const s={...scene(move('a',3,2)),markers:[{id:'marker',name:'Beat',time:8}]};
  const guides=snapGuides(s,6);
  assert([3,5,6,8].every(n=>guides.includes(n)));
  assert.equal(snapTime(5.04,guides,100),5);
  assert.equal(snapTime(5.3,guides,100),5.3);
  assert.equal(snapTime(5.04,guides,100,false),5.04);
});
test('multi-move is clamped and compatible track changes preserve the canonical duration',()=>{
  const s=scene(move('a',1,2),move('b',7,2));
  const next=moveTimelineClips(s,['a','b'],100);
  assert.deepEqual(next.clips.map(c=>c.start),[22,28]);
  assert.equal(next.duration,s.duration);
  assert.equal(s.clips[0].start,1);
  assert(compatibleTrack('audio','music'));
  assert(!compatibleTrack('face','body'));
  assert.equal(moveTimelineClips(scene(sound('x',0)),['x'],1,'music').clips[0].track,'music');
  assert.throws(()=>moveTimelineClips(s,['a'],1,'music'),/compatible tracks/);
});
test('trimmed audio advances its source offset and keyed movement retains endpoints',()=>{
  const trimmed=trimTimelineClip(scene(sound('sfx',3,5)),'sfx','in',5).clips[0];
  assert.equal(trimmed.start,5);
  assert.equal(trimmed.length,3);
  assert('offset' in trimmed && trimmed.offset===2);
  const key=move('key',0,4);
  if(key.track!=='movement')throw Error('expected movement');
  const withKeys:Clip={...key,keyframes:[{time:0,x:100,y:200},{time:.5,x:200,y:100},{time:1,x:300,y:200}]};
  const result=trimTimelineClip(scene(withKeys),'key','in',2).clips[0];
  assert(result.track==='movement' && result.fromX===200 && result.keyframes?.[0].time===0 && result.keyframes?.at(-1)?.time===1);
});
test('split creates a new ID with correct playhead timing and audio source offset',()=>{
  const result=splitTimelineClips(scene(sound('bell',2,8)),['bell'],5);
  assert.equal(result.added.length,1);
  const a=result.scene.clips[0],b=result.scene.clips[1];
  assert.equal(a.id,'bell');assert.equal(a.length,3);assert.equal(b.start,5);assert.equal(b.length,5);
  assert('offset' in b && b.offset===3);
  assert.equal(splitTimelineClips(scene(sound('x',2,4)),['x'],2.05).added.length,0);
});
test('interior movement keyframe deletion works and endpoint deletion is blocked',()=>{
  const clip=move('k',0);
  if(clip.track!=='movement')throw Error('expected movement');
  const keyed:Clip={...clip,keyframes:[{time:0,x:100,y:200},{time:.5,x:200,y:100},{time:1,x:300,y:200}]};
  const revised=deleteMovementKeyframe(scene(keyed),{clipId:'k',index:1}).clips[0];
  assert(revised.track==='movement'&&revised.keyframes?.length===2);
  assert.throws(()=>deleteMovementKeyframe(scene(keyed),{clipId:'k',index:0}),/first and last/);
});
test('deleting multiple selected clips and Undo/Redo restores the exact state',()=>{
  const input={...project,scenes:[scene(move('a',0,2),move('b',4,2))]};
  useStudio.getState().open(input);
  useStudio.getState().selectClips(['a','b']);
  useStudio.getState().editScene(s=>deleteTimelineClips(s,['a','b']));
  assert.equal(useStudio.getState().project.scenes[0].clips.length,0);
  useStudio.getState().undo();
  assert.deepEqual(useStudio.getState().clipIds,['a','b']);
  assert.equal(useStudio.getState().project.scenes[0].clips.length,2);
  useStudio.getState().redo();
  assert.equal(useStudio.getState().project.scenes[0].clips.length,0);
});
test('clipboard paste and duplicate give fresh unique clip IDs',()=>{
  const s=scene(sound('a',0,1),sound('b',1,1));
  const pasted=pasteTimelineClips(s,s.clips,9);
  assert.equal(pasted.ids.length,2);
  assert.equal(new Set(pasted.scene.clips.map(c=>c.id)).size,4);
  const duplicated=duplicateTimelineClips(s,['a','b']);
  assert.equal(duplicated.scene.clips.length,4);
  assert.equal(s.clips.length,2);
});
test('locked track protects edits and muted audio remains referenced for backups',()=>{
  const s={...scene(sound('a',0,2)),trackSettings:{audio:{muted:true,locked:true}}};
  assert.throws(()=>deleteTimelineClips(s,['a']),/Unlock/);
  assert.equal(sceneSounds(s).length,1);
  assert(ProjectDocument.safeParse({...project,scenes:[s]}).success);
});
test('muted expression track is excluded from actual renderer evaluation',()=>{
  const cue:Clip={id:'sad',track:'face',actor,start:1,length:4,expression:'sad'};
  const s=scene(cue);
  assert.equal(evaluate(s,2).actors[0].expression,'sad');
  assert.equal(evaluate({...s,trackSettings:{face:{muted:true}}},2).actors[0].expression,original.actors[0].expression);
});
test('duration shrink safely trims/removes past-end clips and markers',()=>{
  const s={...scene(sound('a',0,9),sound('b',9,2)),markers:[{id:'end',name:'End',time:11}]};
  const next=resizeSceneTimeline(s,8);
  assert.equal(next.duration,8);assert.equal(next.clips.length,1);assert.equal(next.clips[0].length,8);assert.equal(next.markers?.length,0);
  assert.equal(s.duration,30);
  assert.throws(()=>resizeSceneTimeline(s,181),/between 1 and 180/);
});
