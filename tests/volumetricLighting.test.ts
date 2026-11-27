import test from 'node:test';
import assert from 'node:assert/strict';
import {EnvironmentVisual,lightAt} from '../src/engine/environmentVisuals.ts';
import {cinematicPresets} from '../src/engine/vvlePresets.ts';
import {sampleVolumeFrame,pseudoNormal,volumeColor,surfaceMaterials} from '../src/engine/volumetricLighting.ts';
test('cinematic presets are strict and opt-in; legacy lighting stays unchanged',()=>{
 for(const setup of Object.values(cinematicPresets)){const scene=EnvironmentVisual.parse({version:1,quality:'balanced',...setup});assert(sampleVolumeFrame(scene,0));const old={...scene,volume:undefined};assert.equal(sampleVolumeFrame(old,0),undefined);assert.equal(lightAt(480,270,old),lightAt(480,270,scene));}
});
test('analytic normals and material response are finite, directional and bounded',()=>{
 const frame=sampleVolumeFrame(EnvironmentVisual.parse({version:1,quality:'balanced',...cinematicPresets.portrait}),0)!;
 for(const x of [-1,-.4,0,.4,1])for(const y of [-1,0,1]){const n=pseudoNormal(x,y);assert(Math.abs(Math.hypot(...n)-1)<1e-8);for(const m of Object.keys(surfaceMaterials) as (keyof typeof surfaceMaterials)[])assert(/^#[0-9a-f]{6}$/.test(volumeColor(frame,{x:450,y:250},n,'#b97856',m)));}
 const front=volumeColor(frame,{x:450,y:250},pseudoNormal(-.8,0),'#b97856','skin'),back=volumeColor(frame,{x:450,y:250},pseudoNormal(.8,0),'#b97856','skin');assert.notEqual(front,back);
 assert.notEqual(volumeColor(frame,{x:450,y:250},[0,0,1],'#bbbbbb','metal'),volumeColor(frame,{x:450,y:250},[0,0,1],'#bbbbbb','fabric'));
});
test('moving light samples are deterministic, bounded by quality and seek clock',()=>{
 const source=structuredClone(cinematicPresets.portrait);source.lighting!.lights[0].keys=[{time:0,x:200,y:150,intensity:1},{time:2,x:800,y:150,intensity:.8}];
 const scene=EnvironmentVisual.parse({version:1,quality:'eco',...source}),a=sampleVolumeFrame(scene,1)!;
 assert.equal(a.lights.length,2);assert.equal(a.lights[0].x,500);assert.deepEqual(a,sampleVolumeFrame(scene,1));assert.equal(sampleVolumeFrame(scene,0)!.lights[0].x,200);
 assert.notDeepEqual(a,sampleVolumeFrame(scene,2));assert(!EnvironmentVisual.safeParse({...scene,volume:{...scene.volume,exposure:100}}).success);
});
