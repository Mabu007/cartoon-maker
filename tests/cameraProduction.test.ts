import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { ProjectDocument, parseStoredProject, type Clip, type Scene } from '../src/engine/schema.ts';
import { cameraConflicts, insertCameraShot, normalizeCameraTimeline, type CameraClip } from '../src/engine/cameraTimeline.ts';
import { cameraViewport, screenToWorld, worldToScreen, worldToEntity, entityToWorld, pointHitsEntity, worldEntityBounds, renderDepth, type WorldEntityRect } from '../src/engine/cameraTransform.ts';
import { evaluate, locate, projectDuration, MOVIE_FRAME_RATE } from '../src/engine/evaluate.ts';
import { heldGripPoint } from '../src/engine/actorArt.ts';
import { resizeSceneTimeline, trimTimelineClip, moveTimelineClips } from '../src/engine/timelineEditing.ts';
import { useStudio } from '../src/studio.ts';

const movie=makeProject(true);
const original=movie.scenes[0];
const shot=(id:string,start:number,length:number,kind:CameraClip['shot']='wide',focus?:string,transition:CameraClip['transition']='cut'):CameraClip=>({
  id,track:'camera',start,length,shot:kind,transition,...(focus?{focus}:{})
});
const withClips=(...clips:Clip[]):Scene=>({...original,clips});

test('canonical schema rejects overlapping camera shots but allows other tracks to overlap',()=>{
  const conflicting=withClips(shot('wide',0,20),shot('close',10,5,'close-up',original.actors[0].id));
  assert.equal(cameraConflicts(conflicting.clips).length,1);
  assert.equal(ProjectDocument.safeParse({...movie,scenes:[conflicting]}).success,false);
  const actor=original.actors[0].id;
  const parallel:Clip={id:'body-overlap',track:'body',actor,action:'talk',layer:'gesture',start:2,length:9};
  assert(ProjectDocument.safeParse({...movie,scenes:[withClips(shot('a',0,10),parallel)]}).success);
});

test('camera insert trims, splits and preserves uncovered intervals and dialogue',()=>{
  const other=original.clips.find(c=>c.track==='dialogue')!;
  const start=withClips(shot('establishing',0,20),other);
  const next=insertCameraShot(start.clips,shot('reaction',6,5,'reaction',original.actors[0].id));
  assert.equal(cameraConflicts(next).length,0);
  assert.deepEqual(next.filter(c=>c.track==='camera').sort((a,b)=>a.start-b.start).map(c=>[c.start,c.length]),[[0,6],[6,5],[11,9]]);
  assert(next.includes(other));
  assert.equal(new Set(next.map(c=>c.id)).size,next.length);
});

test('camera move and resize edit existing shots without overriding noncamera tracks',()=>{
  const initial=withClips(shot('a',0,6),shot('b',6,4),shot('c',10,6));
  const moved=moveTimelineClips(initial,['b'],3);
  assert.equal(cameraConflicts(moved.clips).length,0);
  const overlap=moved.clips.filter(c=>c.track==='camera').sort((a,b)=>a.start-b.start);
  assert.equal(overlap.some(c=>c.id==='b'&&c.start===9),true);
  const resized=trimTimelineClip(moved,'b','out',14);
  assert.equal(cameraConflicts(resized.clips).length,0);
  assert(resized.clips.some(c=>c.id==='b' && c.length===5));
  const ends=resizeSceneTimeline(resized,12);
  assert(ends.clips.every(c=>c.start+c.length<=12.000001));
  assert.equal(cameraConflicts(ends.clips).length,0);
});

test('legacy raw camera overlaps migrate on load while new edit commands remain strict',()=>{
  const legacy=withClips(shot('wide',0,18),shot('medium',4,6,'medium'),shot('close',7,4,'close-up'));
  const normalized=normalizeCameraTimeline(legacy);
  assert.equal(cameraConflicts(normalized.clips).length,0);
  assert(normalized.clips.some(c=>c.track==='camera'&&c.start===0));
  assert(normalized.clips.some(c=>c.track==='camera'&&c.start===11));
  const loaded=parseStoredProject({...movie,scenes:[legacy]});
  assert.equal(cameraConflicts(loaded.scenes[0].clips).length,0);
  useStudio.getState().open(loaded);
  const before=useStudio.getState().project;
  assert.throws(()=>useStudio.getState().editScene(s=>({...s,clips:[...s.clips,shot('invalid',2,3)]})),/overlap/i);
  assert.equal(useStudio.getState().project,before);
});

test('camera playback has one selected shot at each cut and deterministic half-open boundaries',()=>{
  const actor=original.actors[0].id;
  const s=withClips(shot('wide',0,5),shot('medium',5,5,'medium',actor),shot('close',10,5,'close-up',actor),shot('follow',15,10,'follow',actor,'glide'));
  const frames=[0,4.999,5,9.999,10,14.999,15,24.999].map(t=>evaluate(s,t));
  assert.deepEqual(frames.map(f=>f.shot),['wide','wide','medium','medium','close-up','close-up','follow','follow']);
  assert(frames[4].camera.zoom>frames[2].camera.zoom);
  assert.deepEqual(evaluate(s,8).camera,evaluate(s,8).camera);
});

test('two-shot frames selected performer and partner, follow camera tracks moving performers',()=>{
  const first=original.actors[0],second=original.actors[1];
  const s=withClips(shot('pair',0,8,'two-shot',first.id),shot('follow',8,12,'follow',first.id));
  const pair=evaluate(s,2).camera;
  assert(pair.zoom>=1 && pair.zoom<=1.55);
  assert(pair.x>=Math.min(first.x,second.x)-100 && pair.x<=Math.max(first.x,second.x)+100);
  const withMotion={...s,clips:[...s.clips,{id:'m',track:'movement' as const,actor:first.id,start:8,length:10,fromX:200,toX:700,fromY:first.y,toY:first.y}]};
  const at9=evaluate(withMotion,9).camera;
  const at14=evaluate(withMotion,14).camera;
  assert(at14.x>at9.x);
});

test('forward and inverse camera transforms round-trip all formats, zooms, pans and world coordinates',()=>{
  const sizes:[string,number,number][]=[['16:9',960,540],['9:16',303.75,540],['1:1',540,540]];
  const cameras=[{x:480,y:270,zoom:1},{x:215,y:345,zoom:2.26},{x:850,y:150,zoom:3.35},{x:520,y:300,zoom:1.18}];
  const points=[{x:11,y:44},{x:480,y:270},{x:940,y:514},{x:-125,y:610}];
  for(const [format,width,height] of sizes)for(const camera of cameras)for(const point of points){
    const size={width,height},f=format as '16:9'|'9:16'|'1:1';
    const screen=worldToScreen(point,camera,size,f);
    const recovered=screenToWorld(screen,camera,size,f);
    assert(Math.abs(recovered.x-point.x)<1e-9 && Math.abs(recovered.y-point.y)<1e-9);
  }
  const viewport=cameraViewport(cameras[1],{width:960,height:540},'16:9');
  assert.equal(viewport.zoom,2.26);
});

test('rotation-aware hit testing respects scale, mirror and prop bounds at zoom',()=>{
  const rect:WorldEntityRect={x:400,y:350,scaleX:-1.3,scaleY:1.3,angle:28,left:-60,right:45,top:-120,bottom:8};
  const local={x:22,y:-55},global=entityToWorld(local,rect);
  assert(pointHitsEntity(global,rect));
  const recovered=worldToEntity(global,rect);
  assert(Math.abs(recovered.x-local.x)<1e-9 && Math.abs(recovered.y-local.y)<1e-9);
  assert(!pointHitsEntity(entityToWorld({x:92,y:-55},rect),rect));
  const box=worldEntityBounds(rect);
  assert(global.x>=box.left&&global.x<=box.right&&global.y>=box.top&&global.y<=box.bottom);
});

test('explicit depth layers dominate foot Y ordering, with Y sorting within the layer',()=>{
  assert(renderDepth(-1,2900)<renderDepth(0,-2000));
  assert(renderDepth(1,-1500)>renderDepth(0,2900));
  assert(renderDepth(0,430)>renderDepth(0,410));
});

test('held image grip is deterministic and follows the animated pose and chosen view',()=>{
  const character=movie.characters.find(c=>c.id===original.actors[0].characterId)!;
  const idle=heldGripPoint(character,'front',{});
  const wave=heldGripPoint(character,'front',{rightShoulder:35,rightElbow:-24});
  // Carry IK holds the same hand-to-object grip while the shoulder and
  // elbow animate; otherwise a carried prop would jump during gestures.
  assert.deepEqual(idle,wave);
  assert.deepEqual(heldGripPoint(character,'front',{}),idle);
  // The grip follows animated head/neck position and changes with viewpoint.
  assert.notDeepEqual(heldGripPoint(character,'front',{neck:17}),idle);
  assert.notDeepEqual(heldGripPoint(character,'back',{}),idle);
});

test('duration changes drive whole-movie frame selection identically for preview and export evaluator',()=>{
  const first=withClips(shot('one',0,5),shot('two',5,5,'medium',original.actors[0].id));
  const short=resizeSceneTimeline(first,8);
  const second={...first,id:'scene-2',name:'Next',duration:6,clips:[shot('next',0,6,'wide')]};
  const film=[short,second],duration=projectDuration(film);
  assert.equal(duration,14);
  for(const index of [0,7,239,240,300,419]){
    const t=index/MOVIE_FRAME_RATE;
    const {scene,local}=locate(film,t);
    const preview=evaluate(scene,local);
    const exportedFrame=evaluate(locate(film,t).scene,locate(film,t).local);
    assert.deepEqual(preview.camera,exportedFrame.camera);
    assert.equal(preview.shot,exportedFrame.shot);
  }
});

test('optional prop flipping preserves old projects and round-trips through the canonical movie schema',()=>{
  const prop=original.objects[0];
  assert(prop,'a fixture object is needed');
  const mirrored={...prop,flip:true};
  const next={...movie,scenes:[{...original,objects:[mirrored,...original.objects.slice(1)]}]};
  const saved=ProjectDocument.parse(next);
  assert.equal(saved.scenes[0].objects[0].flip,true);
  const reloaded=ProjectDocument.parse(JSON.parse(JSON.stringify(saved)));
  assert.equal(reloaded.scenes[0].objects[0].flip,true);
  const legacy={...movie,scenes:[{...original,objects:[prop,...original.objects.slice(1)]}]};
  assert.equal(ProjectDocument.parse(legacy).scenes[0].objects[0].flip,undefined);
  const source:WorldEntityRect={x:mirrored.x,y:mirrored.y,scaleX:-mirrored.scale,scaleY:mirrored.scale,angle:mirrored.rotation,left:-25,right:25,top:-60,bottom:5};
  const local={x:13,y:-20};
  const roundTrip=worldToEntity(entityToWorld(local,source),source);
  assert(Math.abs(roundTrip.x-local.x)<.00001);
  assert(Math.abs(roundTrip.y-local.y)<.00001);
});
