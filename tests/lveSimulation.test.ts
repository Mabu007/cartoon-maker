import test from 'node:test';
import assert from 'node:assert/strict';
import {LveSimulation,LveConfig,LveDefinition,lveDefaultConfig,lveRegionCommands,type LveSampler} from '../src/engine/lveSimulation.ts';
import {lveFixtures} from '../src/engine/lveFixtures.ts';
import {forearmVectorFixture} from '../src/engine/vectorArtworkFixture.ts';
const forces={gravity:{x:0,y:30},wind:{x:15,y:0},turbulence:8};
const sampler:LveSampler=(tick)=>({transform:[1,0,0,1,Math.sin(tick*.03)*3,0],forces});
const zero:LveSampler=()=>({transform:[1,0,0,1,0,0],forces:{gravity:{x:0,y:0},wind:{x:0,y:0},turbulence:0}});
test('LVE zero force, pins and rest fallback are exact',()=>{
 const fixtures=lveFixtures(),s=new LveSimulation(fixtures);assert(s.seek(120,zero).every(e=>e.nodes.every(n=>Math.abs(n.dx)<1e-9&&Math.abs(n.dy)<1e-9)));
 const small=new LveSimulation(fixtures,{...lveDefaultConfig,maxSceneNodes:1});assert(small.instrumentation().fallbackEntities>0);assert(small.seek(60,sampler).every(e=>e.nodes.every(n=>Number.isFinite(n.dx+n.dy))));
 assert(!LveConfig.safeParse({...lveDefaultConfig,hz:1000}).success);assert(!LveDefinition.safeParse({...fixtures[0],nodes:[fixtures[0].nodes[0],fixtures[0].nodes[0]]}).success);
});
test('LVE deterministic fixed ticks, checkpoint roundtrip, random seek and bounded substeps',()=>{
 const f=lveFixtures(),a=new LveSimulation(f),b=new LveSimulation([...f].reverse());
 const expected=a.seek(240,sampler);assert.deepEqual(b.seek(240,sampler),expected);
 a.seek(73,sampler);assert.deepEqual(a.seek(240,sampler),expected);
 const cp=a.checkpoint();b.restore(JSON.parse(JSON.stringify(cp)));assert.deepEqual(a.seek(300,sampler),b.seek(300,sampler));
 const c=new LveSimulation(f);c.advance(60,sampler,4);assert.equal(c.instrumentation().tick,4);
 c.invalidate(f,'edit');assert.throws(()=>c.restore(cp));c.dispose();assert.throws(()=>c.seek(1,sampler));
});
test('LVE high forces and capsule collision remain bounded; cut and sleep reset',()=>{
 const f=lveFixtures(),s=new LveSimulation(f);
 const high:LveSampler=t=>({transform:[1,0,0,1,0,0],forces:{gravity:{x:10000,y:10000},wind:{x:-10000,y:10000},turbulence:80,impulse:{x:10000,y:10000}},cut:t===201,sleep:t===203});
 for(const e of s.seek(200,high))for(const p of e.nodes){const node=f.find(d=>d.id===e.id)!.nodes.find(n=>n.id===p.id)!;assert(Math.hypot(p.dx,p.dy)<=node.material.maxDisplacement*(1-node.pin)+1e-7);}
 assert(s.seek(201,high).every(e=>e.nodes.every(n=>n.dx===0&&n.dy===0)));
 assert(s.seek(203,high).every(e=>e.nodes.every(n=>n.dx===0&&n.dy===0)));
 const c=new LveSimulation(f);c.seek(90,sampler);assert(c.instrumentation().nodes===11);
});
test('LVE canonical adapter does not mutate source geometry',()=>{
 const region=forearmVectorFixture.regions[0],original=JSON.stringify(region);
 const result=lveRegionCommands(region,{dx:100,dy:100});assert.equal(result.length,region.commands.length);assert.equal(JSON.stringify(region),original);
});
