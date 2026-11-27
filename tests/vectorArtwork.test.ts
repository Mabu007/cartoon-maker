import test from 'node:test';
import assert from 'node:assert/strict';
import {VectorArtworkV1,VectorArtworkCache,deformRegion,vectorDrawList,svgPath,springDemo,localPoint,worldPoint,type VectorRuntimeState} from '../src/engine/vectorArtwork.ts';
import {forearmVectorFixture as fixture} from '../src/engine/vectorArtworkFixture.ts';
import {nativeVectorPreview} from '../src/engine/vectorArtworkRender.ts';

test('native fixture validates and round trips with palette and deformation metadata',()=>{
  const a=VectorArtworkV1.parse(fixture);
  assert.deepEqual(VectorArtworkV1.parse(JSON.parse(JSON.stringify(a))),a);
  const draw=vectorDrawList(a,{skin:'#123456'})!;
  assert.equal(draw[0].fill,'#123456');
  assert.equal(a.palette.skin,'#9c5b43');
  assert.equal(nativeVectorPreview(draw)[0].d,svgPath(draw[0].commands));
});
test('malformed commands, references, pose topology and weights fail validation',()=>{
  const invalid=(edit:(a:any)=>void)=>{const a=structuredClone(fixture);edit(a);assert.equal(VectorArtworkV1.safeParse(a).success,false);};
  invalid(a=>a.version=2);
  invalid(a=>a.regions[0].commands[0]=['L',0,0]);
  invalid(a=>a.regions[0].commands[1][1]=Infinity);
  invalid(a=>a.regions[0].commands[1][1]=100);
  invalid(a=>a.regions[0].fill.key='unknown');
  invalid(a=>a.regions[0].material.weights.pop());
  invalid(a=>a.regions[0].material.materialId='unknown');
  invalid(a=>a.regions[0].clipRegionId='forearm');
  invalid(a=>a.poses=[{id:'bad',regionId:'forearm',commands:[['M',0,0],['L',1,0]]}]);
});
test('rest art remains immutable, endpoints pinned, displacement bounded',()=>{
  const a=VectorArtworkV1.parse(fixture),r=a.regions[0];
  const before=JSON.stringify(r);
  const result=deformRegion(r,[100,0]);
  assert.deepEqual(result[0],r.commands[0]);
  assert.equal(result[1][5],r.commands[1][5]);
  assert.equal(result[1][6],r.commands[1][6]);
  assert(Math.abs(Number(result[1][1])-Number(r.commands[1][1])-.08)<1e-9);
  assert.equal(JSON.stringify(r),before);
});
test('cache invalidates on replacement or explicit eviction and has a capacity',()=>{
  const cache=new VectorArtworkCache(1);
  const a=cache.prepare('actor/forearm',fixture);
  assert.equal(cache.prepare('actor/forearm',fixture),a);
  assert(Object.isFrozen(a.regions[0].commands));
  const edited=structuredClone(fixture);edited.palette.skin='#abcdef';
  assert.notEqual(cache.prepare('actor/forearm',edited),a);
  cache.prepare('other',fixture);assert.equal(cache.size,1);
  cache.invalidate('other');assert.equal(cache.size,0);
  cache.dispose();
});
test('unsupported compound rendering fails closed',()=>{
  const a=structuredClone(fixture);a.regions[0].fillRule='evenodd';
  assert(VectorArtworkV1.safeParse(a).success);
  assert.equal(vectorDrawList(a),undefined);
});
test('world/local transforms and bounded spring runtime are deterministic',()=>{
  const m=[2,1,-1,3,12,8] as const;
  const [x,y]=localPoint(m,...worldPoint(m,.5,-.25));
  assert(Math.abs(x-.5)<1e-9&&Math.abs(y+.25)<1e-9);
  let s:VectorRuntimeState={ownerId:'actor-1',regionId:'forearm',localToWorld:m,displacement:[0,0],velocity:[0,0]};
  for(let i=0;i<300;i++)s=springDemo(s,[20,10],fixture.materials[0],.08);
  assert(Math.hypot(...s.displacement)<=.0800000001);
  assert.equal(s.ownerId,'actor-1');
  assert.notDeepEqual(vectorDrawList(fixture,{},s),vectorDrawList(fixture));
});
