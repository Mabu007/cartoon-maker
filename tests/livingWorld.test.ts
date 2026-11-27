import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorldSet,worldSetNames,nativeWorldProp,decorativeArtwork} from '../src/engine/worldCatalog.ts';
import {WorldArtwork,WorldSet,nativeWorldPropKinds,worldPropCompatible} from '../src/engine/worldArtworkSchema.ts';
import {parseWorldPackage,exportWorldSet,exportWorldProp} from '../src/engine/worldPackage.ts';
import {livingWorldAudition} from '../src/engine/livingWorldAudition.ts';
import {sceneForces} from '../src/engine/sceneForces.ts';
import {sceneSecondaryDefaults} from '../src/engine/secondaryMotionSchema.ts';
import {WorldDynamics,worldDrawList,layerKey,propKey,worldTransform} from '../src/engine/worldDynamics.ts';
import {CharacterDynamics} from '../src/engine/characterDynamics.ts';
import {evaluate} from '../src/engine/evaluate.ts';
import {renderDepth} from '../src/engine/cameraTransform.ts';
import {perspectiveScale,inWalkable} from '../src/engine/environmentVisuals.ts';
import {ProjectDocument,SceneDefinition} from '../src/engine/schema.ts';
import {createMovieBackup,restoreMovie} from '../src/services/projectExchange.ts';
test('four vector sets and six native props validate with shared native package budgets',()=>{
 for(const name of worldSetNames){const set=makeWorldSet(name);assert(WorldSet.safeParse(set).success);const pkg=parseWorldPackage(exportWorldSet(set));const pack=pkg.worldPacks[0];assert(pack.category==='environment');assert.deepEqual(pack.set,set);assert(set.layers.some(l=>l.art.dynamics?.length));assert(inWalkable({x:480,y:450},set.walkable));}
 for(const kind of nativeWorldPropKinds){const a=nativeWorldProp(kind);assert(worldPropCompatible(kind,a));const p=parseWorldPackage(exportWorldProp(kind,a)).worldPacks[0];assert(p.category==='prop');assert.deepEqual(p.art,a);}
 for(const k of ['curtain','flag','branch','hanging-sign','hanging-light'] as const){const a=decorativeArtwork(k),rest=worldDrawList(a),moved=worldDrawList(a,{sway:[3,0]});assert.notDeepEqual(rest,moved);const r=a.artwork.regions.find(r=>r.material)!;const d=moved.find(x=>x.id===r.id)!;let j=0;for(let i=0;i<r.commands.length;i++){const c=r.commands[i];for(let k=1;k<c.length;k+=2){if(r.material!.weights[j].pin===1){assert.equal(c[k],d.commands[i][k]);assert.equal(c[k+1],d.commands[i][k+1]);}j++;}}}
});
test('world package rejects malformed/oversized/unsafe or mismatched geometry',()=>{
 const valid=JSON.parse(exportWorldProp('cup',nativeWorldProp('cup')));
 for(const input of ['<svg onload="alert(1)"/>','PK../../file','{'+ ' '.repeat(2_000_001)+'}'])assert.throws(()=>parseWorldPackage(input));
 for(const mutate of [(v:any)=>v.worldPacks[0].art.artwork.regions[0].maskRegionId='bad',(v:any)=>v.worldPacks[0].art.artwork.palette.base='url(http://example.invalid)',(v:any)=>v.worldPacks[0].kind='phone',(v:any)=>v.worldPacks.push(v.worldPacks[0]),(v:any)=>v.worldPacks[0].id='../bad']){const copy=structuredClone(valid);mutate(copy);assert.throws(()=>parseWorldPackage(JSON.stringify(copy)));}
 const bad=decorativeArtwork('flag');bad.dynamics![0].material.stiffness=1e6;assert(!WorldArtwork.safeParse(bad).success);
});
test('shared forces are world-coordinate, smooth at boundaries, deterministic and independent of camera',()=>{
 const q={...sceneSecondaryDefaults,enabled:true,windX:20,gravity:8,regions:[{id:'local',x:100,y:100,radius:50,windX:30,windY:5}],gusts:[{time:1,x:40,y:0,duration:1}]};
 assert.equal(sceneForces(q,0,100,100).wind.x,50);assert.equal(sceneForces(q,0,150,100).wind.x,20);assert.equal(sceneForces(q,1.5,100,100).wind.x,90);assert.equal(sceneForces(q,0,0,0).gravity.y,8);assert.deepEqual(worldTransform(10,20,2,0,true),[-2,-0,-0,2,10,20]);
 const p=livingWorldAudition(),s=p.scenes[0],noCamera={...s,clips:s.clips.filter(c=>c.track!=='camera')},a=new WorldDynamics(),b=new WorldDynamics(),c=new CharacterDynamics(),d=new CharacterDynamics();
 assert.deepEqual(a.sample(s,p.characters,7.5),b.sample(noCamera,p.characters,7.5));assert.deepEqual(c.sample(s,p.characters,7.5),d.sample(noCamera,p.characters,7.5));a.dispose();b.dispose();c.dispose();d.dispose();
});
test('shared wind, actual custody, seating, depth and deterministic world motion preserve primary state',t=>{
 const p=livingWorldAudition(),s=p.scenes[0],cast=new Map(p.characters.map(c=>[c.id,c])),before=JSON.stringify(p),a=new WorldDynamics(),b=new CharacterDynamics();
 const frame=evaluate(s,1,cast);assert(frame.actors[0].heldItems?.left?.id==='book');assert(frame.actors[1].sitting);
 assert.equal(evaluate(s,5.5,cast).actors[0].heldItems?.left,undefined);
 assert(renderDepth(1,400)>renderDepth(0,500));assert(perspectiveScale(480,s.visual?.perspective)>perspectiveScale(395,s.visual?.perspective));
 const offsets=a.sample(s,p.characters,1.5),actors=b.sample(s,p.characters,1.5);
 assert(Object.values(offsets.get(layerKey('curtain-left'))??{}).some(q=>Math.hypot(...q)>.01));assert([...actors.values()].some(x=>Object.values(x.hair).some(q=>Math.hypot(...q)>.01)));assert([...actors.values()].some(x=>Math.hypot(...x.cloth)>.01));
 a.sample(s,p.characters,7);assert.deepEqual(a.sample(s,p.characters,1.5),offsets);assert.deepEqual(evaluate(s,1,cast),frame);assert.equal(JSON.stringify(p),before);
 const off={...s,visual:{...s.visual!,world:{...s.visual!.world!,layers:s.visual!.world!.layers.map(l=>l.id==='curtain-left'?{...l,art:{...l.art,enabled:false}}:l)}}};
 assert(!a.sample(off,p.characters,1.5).has(layerKey('curtain-left')));
 const times:number[]=[];for(let i=0;i<90;i++){const start=performance.now();a.sample(s,p.characters,i/30);b.sample(s,p.characters,i/30);times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);t.diagnostic('WORLD_CPU '+JSON.stringify({samples:90,p50Ms:times[45],p95Ms:times[85],world:a.instrumentation(),characters:b.instrumentation()}));assert(a.instrumentation()!.nodes<=24);a.dispose();b.dispose();
});
test('world geometry embeds in portable backups without external assets',async()=>{
 const p=livingWorldAudition(),s=p.scenes[0];assert(ProjectDocument.safeParse(p).success);assert(SceneDefinition.safeParse(s).success);
 const restored=await restoreMovie(new File([await createMovieBackup(p)],'living-world.sirvibe'));assert.deepEqual(restored.scenes[0].visual?.world,s.visual?.world);assert.deepEqual(restored.scenes[0].objects.map(o=>o.worldArtwork),s.objects.map(o=>o.worldArtwork));
});
