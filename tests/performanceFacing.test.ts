import assert from 'node:assert/strict';
import test from 'node:test';
import { performanceFacingOptions, performanceFacingView, initialPerformanceFacing, performanceFacesCamera } from '../src/engine/performanceFacing.ts';
import { livePerformanceScene, LIVE_PREVIEW_TIME } from '../src/engine/livePerformanceScene.ts';
import { makeProject } from '../src/engine/presets.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { ProjectDocument, type Clip } from '../src/engine/schema.ts';
import { splitTimelineClips, trimTimelineClip } from '../src/engine/timelineEditing.ts';

test('front, left and right use front or mirrored three-quarter front rigs, never full side profiles',()=>{
  assert.deepEqual(performanceFacingOptions,['front','left','right']);
  assert.deepEqual(performanceFacingView('front'),{view:'front',flip:false});
  assert.deepEqual(performanceFacingView('left'),{view:'three-quarter',flip:true});
  assert.deepEqual(performanceFacingView('right'),{view:'three-quarter',flip:false});
  assert(performanceFacesCamera('front'));
  assert(!performanceFacesCamera('left')&&!performanceFacesCamera('right'));
  assert.equal(initialPerformanceFacing({view:'side',flip:true}),'left');
  assert.equal(initialPerformanceFacing({view:'side',flip:false}),'right');
  assert.equal(initialPerformanceFacing({view:'three-quarter',flip:true}),'left');
  assert.equal(initialPerformanceFacing({view:'three-quarter',flip:false}),'right');
  assert.equal(initialPerformanceFacing({view:'front',flip:true}),'front');
});

test('live studio preview honors the director facing while reusing the same captured pose',()=>{
  const project=makeProject(true);
  const scene=project.scenes[0], actor=scene.actors[0];
  const key={time:.35,pose:{head:12,leftShoulder:-95,rightShoulder:105},focus:{x:.4,y:-.2}};
  for(const facing of performanceFacingOptions){
    const live=livePerformanceScene(scene,actor.id,key,facing);
    const view=performanceFacingView(facing);
    assert.equal(live.actors[0].view,view.view);
    assert.equal(live.actors[0].flip,view.flip);
    assert.equal(live.actors[0].gazeTarget,facing==='front'?'camera':undefined);
    assert.equal(live.clips.length,1);
    const clip=live.clips[0];
    assert.equal(clip.track,'performance');
    if(clip.track==='performance'){
      assert.equal(clip.facing,facing);
      assert.deepEqual(clip.performance[0].pose,key.pose);
    }
    const state=evaluate(live,LIVE_PREVIEW_TIME,new Map(project.characters.map(c=>[c.id,c]))).actors[0];
    assert.equal(state.view,view.view);
    assert.equal(state.flip,view.flip);
    assert.equal(state.capturedFacing,facing);
    // Captured gaze is screen-relative; the local rig is mirrored for left
    // facing, so compensate exactly once when comparing screen direction.
    assert.deepEqual(state.focus,{x:view.flip?-key.focus.x:key.focus.x,y:key.focus.y});
    assert.equal((state.flip?-1:1)*state.focus!.x,key.focus.x);
  }
  // Never mutate the actual actor's scene orientation when recording.
  assert.deepEqual(scene.actors.find(a=>a.id===actor.id),actor);
});

test('opposing dialogue performances own facing only within their clip intervals',()=>{
  const project=makeProject(true),base=project.scenes[0],actor=base.actors[0];
  const keys=[{time:0,pose:{head:3}},{time:1,pose:{head:9}}];
  const left:Extract<Clip,{track:'performance'}>={
    id:'left-take',track:'performance',actor:actor.id,
    name:'Talk to character on the left',start:1,length:2,
    facing:'left',performance:keys,performanceOrigin:'mocap'
  };
  const right:Extract<Clip,{track:'performance'}>={
    ...left,id:'right-take',name:'Reply looking right',start:3,facing:'right'
  };
  const scene={...base,clips:[left,right]};
  const parsed=ProjectDocument.parse({...project,scenes:[scene,...project.scenes.slice(1)]});
  const names=new Map(parsed.characters.map(c=>[c.id,c]));
  const evaluated=(at:number)=>evaluate(parsed.scenes[0],at,names).actors.find(a=>a.id===actor.id)!;
  const before=evaluated(.5),a=evaluated(1.5),b=evaluated(3.5),after=evaluated(6);
  assert.equal(a.view,'three-quarter');assert.equal(a.flip,true);
  assert.equal(a.capturedFacing,'left');
  assert.equal(b.view,'three-quarter');assert.equal(b.flip,false);
  assert.equal(b.capturedFacing,'right');
  assert.equal(before.view,actor.view);
  assert.equal(after.view,actor.view);
  assert.equal(after.flip,actor.flip);
  assert.equal(after.capturedFacing,undefined);
  assert.equal(base.actors[0].view,actor.view);
});

test('facing survives trim/split while old recordings without facing remain valid',()=>{
  const project=makeProject(true),base=project.scenes[0],actor=base.actors[0];
  const take:Extract<Clip,{track:'performance'}>={
    id:'stage-direction',track:'performance',actor:actor.id,
    start:1,length:2,name:'Looking left',facing:'left',
    performance:[{time:0,pose:{head:0}},{time:.5,pose:{head:8},presence:0},{time:1,pose:{head:12}}]
  };
  const scene={...base,clips:[take]};
  const split=splitTimelineClips(scene,[take.id],2);
  const one=split.scene.clips.find(c=>c.id===take.id);
  const two=split.scene.clips.find(c=>c.id===split.added[0]);
  assert(one?.track==='performance'&&two?.track==='performance');
  assert.equal(one.facing,'left');assert.equal(two.facing,'left');
  const trimmed=trimTimelineClip(scene,take.id,'out',2.5).clips.find(c=>c.id===take.id);
  assert(trimmed?.track==='performance');
  assert.equal(trimmed.facing,'left');
  const {facing:_removed,...legacy}=take;
  const legacyParsed=ProjectDocument.parse({...project,scenes:[{...scene,clips:[legacy]}]});
  const old=legacyParsed.scenes[0].clips[0];
  assert(old.track==='performance'&&old.facing===undefined);
  // Legacy take inherits actor's existing orientation.
  const backwards={...legacyParsed.scenes[0],actors:[{...actor,view:'side' as const,flip:true}]};
  const state=evaluate(backwards,1.5,new Map(project.characters.map(c=>[c.id,c]))).actors[0];
  assert.equal(state.view,'side');assert.equal(state.flip,true);
  assert.equal(state.capturedFacing,undefined);
});

test('tracking gaps preserve the staged direction without inventing a gesture',()=>{
  const project=makeProject(true),scene=project.scenes[0],actor=scene.actors[0];
  const take:Extract<Clip,{track:'performance'}>={
    id:'lost-and-found',track:'performance',actor:actor.id,start:0,length:3,
    facing:'right',
    performance:[
      {time:0,pose:{leftShoulder:42},presence:1},
      {time:.35,pose:{},presence:0},
      {time:.65,pose:{},presence:0},
      {time:1,pose:{rightShoulder:40},presence:1}
    ]
  };
  const frame=evaluate({...scene,clips:[take]},1.5,new Map(project.characters.map(c=>[c.id,c]))).actors[0];
  assert.equal(frame.view,'three-quarter');
  assert.equal(frame.flip,false);
  assert.equal(frame.capturedFacing,'right');
  assert.equal(frame.capturedFocus,undefined);
  assert.equal(frame.capturedArms?.left,false);
  assert.equal(frame.capturedArms?.right,false);
});
