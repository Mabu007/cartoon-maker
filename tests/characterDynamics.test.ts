import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProject} from '../src/engine/presets.ts';
import {flagshipCharacters} from '../src/engine/visualPresets.ts';
import {ProjectDocument,CharacterDefinition} from '../src/engine/schema.ts';
import {EnvironmentVisual} from '../src/engine/environmentVisuals.ts';
import {sceneSecondaryDefaults,characterSecondaryDefaults,CharacterSecondary,SceneSecondary} from '../src/engine/secondaryMotionSchema.ts';
import {CharacterDynamics,buildDynamics,coupledLimbOffset} from '../src/engine/characterDynamics.ts';
import {buildLayeredHair,dynamicHairPaths,hairRenderPaths} from '../src/engine/layeredHair.ts';
import {garmentDefaults} from '../src/engine/garmentDesignSchema.ts';
import {deformGarmentPanels,garmentTorso,garmentSleeve} from '../src/engine/garmentGeometry.ts';
import {rig} from '../src/engine/animation.ts';
import {evaluate} from '../src/engine/evaluate.ts';
import {deformBoneSurface,deformCheekOutline} from '../src/engine/secondarySurface.ts';
const front={width:1,face:0,far:true,rear:false,profile:false};
function fixture(){
 const project=makeProject(true),characters=project.characters.map((c,i)=>i<2?CharacterDefinition.parse({...flagshipCharacters[i],id:c.id,garmentDesign:{...garmentDefaults,outer:'jacket'},secondaryMotion:{...characterSecondaryDefaults,strength:.8}}):c);
 const scene={...project.scenes[0],visual:EnvironmentVisual.parse({version:1,quality:'balanced',secondaryMotion:{...sceneSecondaryDefaults,enabled:true,windX:40,gusts:[{time:.5,x:50,y:0,duration:.5}]}})};
 return {project,characters,scene};
}
test('secondary motion is opt-in, strictly validated and persisted without runtime state',()=>{
 const {project,characters,scene}=fixture(),dyn=new CharacterDynamics();
 assert.equal(dyn.sample({...scene,visual:undefined},characters,1).size,0);
 assert(!SceneSecondary.safeParse({...sceneSecondaryDefaults,windX:1000}).success);
 assert(!CharacterSecondary.safeParse({...characterSecondaryDefaults,strength:2}).success);
 const restored=ProjectDocument.parse({...project,characters,scenes:[scene,...project.scenes.slice(1)]});
 assert.deepEqual(restored.scenes[0].visual?.secondaryMotion,scene.visual.secondaryMotion);
 assert.deepEqual(restored.characters[0].secondaryMotion,characters[0].secondaryMotion);
 dyn.dispose();
});
test('scene adapter is deterministic across seek/replay, renderer instances, and edits; never mutates primary state',()=>{
 const {characters,scene}=fixture(),a=new CharacterDynamics(),b=new CharacterDynamics(),source=JSON.stringify([scene,characters]);
 const before=evaluate(scene,1,new Map(characters.map(c=>[c.id,c])));
 const first=a.sample(scene,characters,1);assert(first.size>0);
 assert([...first.values()].some(o=>Object.values(o.hair).some(q=>Math.hypot(...q)>.01)||Math.hypot(...o.cloth)>.01));
 a.sample(scene,characters,2);assert.deepEqual(a.sample(scene,characters,1),first);assert.deepEqual(b.sample(scene,characters,1),first);
 assert.deepEqual(evaluate(scene,1,new Map(characters.map(c=>[c.id,c]))),before);
 assert.equal(JSON.stringify([scene,characters]),source);
 const edited={...scene,visual:{...scene.visual,secondaryMotion:{...scene.visual.secondaryMotion!,strength:0}}};
 assert.equal(a.sample(edited,characters,1).size,0);
 a.dispose();b.dispose();
});
test('per actor budget, overrides, hair pin invariants and garment endpoints remain bounded',()=>{
 const {characters,scene}=fixture(),s=scene.visual.secondaryMotion!,{defs,bindings}=buildDynamics(scene,characters,s);
 for(const actor of scene.actors){const ids=new Set(bindings.filter(b=>b.actorId===actor.id).map(b=>b.id));assert(defs.filter(d=>ids.has(d.id)).reduce((n,d)=>n+d.nodes.length,0)<=24);}
 const c=characters[1],hair=buildLayeredHair(c,front)!;assert(hair);
 const offsets=Object.fromEntries(hair.groups.map(g=>[g.id,[1,1] as const]));
 for(const layer of ['background','foreground'] as const){assert.equal(dynamicHairPaths(hair,layer),hairRenderPaths(hair,layer));const paths=dynamicHairPaths(hair,layer,offsets);assert.equal(paths.length,hairRenderPaths(hair,layer).length);assert(paths.every(p=>!p.d.includes('NaN')));}
 const r=rig(c,{},1),p=garmentTorso(c,front,r.neck,r.hip,r.left.shoulder,r.right.shoulder);
 assert.equal(deformGarmentPanels(p,r.neck.y,r.hip.y,[0,0]),p);
 assert.notDeepEqual(deformGarmentPanels(p,r.neck.y+12,r.hip.y+4,[2,0]),p);
 const sleeve=garmentSleeve(c,r.left.shoulder,r.left.elbow,r.left.hand);assert.deepEqual(garmentSleeve(c,r.left.shoulder,r.left.elbow,r.left.hand,'all',false,false,[0,0]),sleeve);
 assert.equal(deformBoneSurface('M0 0 L.5 .5 L1 0 Z',.8,10),'M 0 0 L 0.5 0.58 L 1 0 Z');
 assert.equal(deformCheekOutline('M0 -45 L0 45 Z',45,[1,1]),'M 0 -45 L 0 45 Z');
});

import {secondaryMotionAudition} from '../src/engine/secondaryMotionAudition.ts';
test('two and three actor audition: fixed clock, bounds, disabled component and CPU timing',t=>{
 for(const cast of [2,3] as const){const p=secondaryMotionAudition(cast),scene=p.scenes[0],dyn=new CharacterDynamics(),times:number[]=[];
  for(let i=0;i<90;i++){const start=performance.now();const state=dyn.sample(scene,p.characters,i/30);times.push(performance.now()-start);
   for(const o of state.values()){assert(Math.hypot(...o.body)<=1.6);assert(Math.hypot(...o.cloth)<=4);assert(Math.hypot(...o.face)<=.55);assert(Object.values(o.hair).every(q=>Math.hypot(...q)<=8));}}
  const first=dyn.sample(scene,p.characters,2.5);dyn.sample(scene,p.characters,4);assert.deepEqual(dyn.sample(scene,p.characters,2.5),first);
  const metrics=dyn.instrumentation()!;assert(metrics.nodes<=96);times.sort((a,b)=>a-b);t.diagnostic('LVE_SCENE_CPU '+JSON.stringify({cast,frames:times.length,p50Ms:times[45],p95Ms:times[85],metrics}));
  for(const time of [4.65,8.3,18.9,19.9,21.3,26.8]){const frame=dyn.sample(scene,p.characters,time);assert([...frame.values()].every(o=>Object.values(o.hair).every(q=>q.every(Number.isFinite))));}
  const disabled=p.characters.map(c=>({...c,secondaryMotion:{...characterSecondaryDefaults,enabled:false}}));assert.equal(dyn.sample(scene,disabled,1).size,0);dyn.dispose();
 }
});
