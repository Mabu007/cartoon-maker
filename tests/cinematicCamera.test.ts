import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import {
  cameraAngles,cameraMovements,shotSizes,shotCompositions,shots,
  ProjectDocument,type Clip,type Scene
} from '../src/engine/schema.ts';
import { cameraConflicts, insertCameraShot } from '../src/engine/cameraTimeline.ts';
import { cameraFraming,directCamera,cameraDirectionHint } from '../src/engine/cameraDirector.ts';
import { cameraViewport,screenToWorld,worldToScreen } from '../src/engine/cameraTransform.ts';
import { evaluate } from '../src/engine/evaluate.ts';

type Camera=Extract<Clip,{track:'camera'}>;
const demo=makeProject(true);
const source=demo.scenes[0];
const actor=source.actors[0],partner=source.actors[1],prop=source.objects[0];
const shot=(kind:Camera['shot'],changes:Partial<Camera>={}):Camera=>({
  id:'film-shot',track:'camera',start:0,length:5,shot:kind,transition:'cut',focus:actor.id,...changes
});
const scene=(...clips:Clip[]):Scene=>({...source,clips});
const targets=[actor,partner].map(a=>({...a,visible:true,lift:0}));
test('cinematic categories cover the requested filmmaking vocabulary',()=>{
  for(const size of [
    'extreme-wide','wide','full','medium-long','cowboy','medium',
    'medium-close-up','close-up','big-close-up','extreme-close-up'
  ])assert(shotSizes.includes(size as typeof shotSizes[number]));
  for(const composition of [
    'establishing','master','two-shot','three-shot','group-shot',
    'over-shoulder','point-of-view','insert','cutaway','reaction','shot-reverse-shot'
  ])assert(shotCompositions.includes(composition as typeof shotCompositions[number]));
  for(const angle of ['eye-level','high-angle','low-angle','birds-eye','worms-eye','dutch-angle','aerial'])
    assert(cameraAngles.includes(angle as typeof cameraAngles[number]));
  for(const motion of ['pan-left','pan-right','tilt-up','tilt-down','dolly-in',
    'dolly-out','truck-left','pedestal-up','zoom-in','zoom-out','dolly-zoom',
    'whip-pan-right','crane-up','handheld','steadicam','gimbal','follow'])
    assert(cameraMovements.includes(motion as typeof cameraMovements[number]));
  assert(shots.includes('pan')&&shots.includes('hold')&&shots.includes('front'),
    'old shot IDs remain valid');
});
test('all shot sizes produce a monotonic crop without moving the actor',()=>{
  const sizes=['wide','full','medium-long','cowboy','medium',
    'medium-close-up','close-up','big-close-up','extreme-close-up'] as const;
  const zooms=sizes.map(size=>cameraFraming(shot(size),targets,source.objects,1).zoom);
  for(let i=1;i<zooms.length;i++)assert(zooms[i]>zooms[i-1],
    sizes[i]+' must be tighter than '+sizes[i-1]);
  assert.equal(cameraFraming(shot('extreme-wide'),targets,source.objects,1).zoom,1);
  assert.equal(cameraFraming(shot('master'),targets,source.objects,1).zoom,1);
});
test('two, three, and group shots keep subjects visible in deterministic compositions',()=>{
  const third={...actor,id:'third',x:470,y:430,visible:true,lift:0};
  const all=[...targets,third];
  for(const kind of ['two-shot','three-shot','group-shot'] as const){
    const frame=cameraFraming(shot(kind),all,[],2);
    assert(frame.zoom>=1&&frame.zoom<=1.55);
    assert(Number.isFinite(frame.x)&&Number.isFinite(frame.y));
  }
});
test('shot reverse shot alternates partners at clip midpoint without duplicate camera tracks',()=>{
  const reverse=shot('shot-reverse-shot',{length:6});
  const before=cameraFraming(reverse,targets,[],1);
  const after=cameraFraming(reverse,targets,[],4);
  assert(before.x<after.x,'framing should cross the action axis between performers');
  const s=scene(reverse);
  assert.equal(cameraConflicts(s.clips).length,0);
  assert(evaluate(s,1).camera.x<evaluate(s,4).camera.x);
});
test('camera can frame an object insert and the schema allows actor or prop focus',()=>{
  const insert=shot('insert',{focus:prop.id});
  const s=scene(insert);
  const document=ProjectDocument.parse({...demo,scenes:[s]});
  assert.equal((document.scenes[0].clips[0] as Camera).focus,prop.id);
  const frame=evaluate(s,2).camera;
  assert(frame.zoom>2.5);
  assert(Math.abs(frame.x-prop.x)<150);
  const invalid=shot('insert',{focus:'missing-object'});
  assert(!ProjectDocument.safeParse({...demo,scenes:[scene(invalid)]}).success);
});
test('angles use deterministic 2D reframing; Dutch angle produces true screen rotation',()=>{
  const close=shot('close-up');
  const basic=cameraFraming(close,targets,[],2);
  const high=cameraFraming({...close,angle:'high-angle'},targets,[],2);
  const low=cameraFraming({...close,angle:'low-angle'},targets,[],2);
  assert(high.y>basic.y);
  assert(low.y<basic.y);
  const dutch=cameraFraming({...close,angle:'dutch-angle',roll:-14},targets,[],2);
  assert.equal(dutch.roll,-14);
  assert.equal(cameraFraming({...shot('wide'),angle:'dutch-angle'},targets,[],2).roll,12);
  assert.equal(cameraFraming({...shot('wide'),angle:'dutch-angle'},[],[],2).roll,12);
  assert(cameraFraming({...shot('wide'),angle:'dutch-angle'},[],[],2).zoom>1);
  assert.equal(cameraFraming({...close,angle:'aerial'},targets,[],2).zoom,1);
  assert.match(cameraDirectionHint('medium','birds-eye','none'),/2D framing/);
  assert.match(cameraDirectionHint('medium','eye-level','dolly-zoom'),/2D dolly-zoom/);
});
test('all camera movements are finite, deterministic, and finish without mutable state',()=>{
  const previous=shot('wide',{id:'old',start:0,length:3,focus:undefined});
  const current=shot('medium',{id:'new',start:3,length:5});
  for(const movement of cameraMovements){
    const clip={...current,movement,transition:'glide' as const};
    const first=directCamera(clip,previous,targets,[],3);
    const a=directCamera(clip,previous,targets,[],5);
    const b=directCamera(clip,previous,targets,[],5);
    const end=directCamera(clip,previous,targets,[],8);
    assert.deepEqual(a,b,'repeatable '+movement);
    for(const output of [first,a,end])
      for(const value of [output.x,output.y,output.zoom,output.roll??0])
        assert(Number.isFinite(value),'finite '+movement);
    assert(end.zoom>0);
  }
  const staticShot=directCamera({...current,movement:'none',transition:'cut'},previous,targets,[],3);
  const zoomShot=directCamera({...current,movement:'zoom-in'},previous,targets,[],8);
  assert(zoomShot.zoom>staticShot.zoom);
});
test('camera rotation and its inverse match across portrait, square and landscape',()=>{
  for(const [format,width,height] of [
    ['16:9',960,540],['9:16',303.75,540],['1:1',540,540]
  ] as const){
    const viewport={width,height};
    const pose={x:420,y:280,zoom:2.15,roll:18};
    const center=worldToScreen({x:pose.x,y:pose.y},pose,viewport,format);
    assert(Math.abs(center.x-width/2)<.000001);
    assert(Math.abs(center.y-height/2)<.000001);
    for(const point of [{x:0,y:0},{x:800,y:510},{x:400,y:300}]){
      const projected=worldToScreen(point,pose,viewport,format);
      const restored=screenToWorld(projected,pose,viewport,format);
      assert(Math.abs(restored.x-point.x)<1e-9);
      assert(Math.abs(restored.y-point.y)<1e-9);
    }
    assert(cameraViewport(pose,viewport,format).rotation>0);
  }
});
test('older camera clips and optional new fields round trip and remain camera-exclusive',()=>{
  const old=shot('medium',{id:'classic',start:0,length:4});
  const newShot=shot('reaction',{id:'new',start:4,length:3,
    angle:'dutch-angle',roll:9,movement:'handheld',strength:.75});
  const updated=insertCameraShot([old],newShot);
  assert.equal(cameraConflicts(updated).length,0);
  const document=ProjectDocument.parse({...demo,scenes:[scene(...updated)]});
  const encoded=JSON.parse(JSON.stringify(document));
  const reloaded=ProjectDocument.parse(encoded);
  assert.deepEqual(reloaded.scenes[0].clips,document.scenes[0].clips);
  assert.equal((reloaded.scenes[0].clips[0] as Camera).angle,undefined);
  assert.equal((reloaded.scenes[0].clips[1] as Camera).roll,9);
});
