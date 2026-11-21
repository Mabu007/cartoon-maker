import assert from 'node:assert/strict';
import test from 'node:test';
import { locate } from '../src/engine/evaluate.ts';
import { movieTicks, movieTiming } from '../src/engine/movieTime.ts';
import { makeScene } from '../src/engine/presets.ts';

test('the scene strip and playback use the same half-open movie times after reordering and resizing', () => {
  const scenes=[{...makeScene(),duration:2.5},{...makeScene(),duration:7},{...makeScene(),duration:3}];
  const order=[scenes[2],{...scenes[0],duration:1.25},scenes[1]];
  const timing=movieTiming(order);
  assert.deepEqual(timing.spans.map(span=>[span.start,span.end]),[[0,3],[3,4.25],[4.25,11.25]]);
  for(const span of timing.spans){
    assert.equal(locate(order,span.start).scene.id,span.scene.id);
    assert.equal(timing.byId.get(span.scene.id),span);
  }
  assert.equal(locate(order,timing.duration).local,7);
});

test('zoomed movie ticks cover the visible window without drawing offscreen minutes', () => {
  const ticks=movieTicks(3600,60,500,515);
  assert(ticks.length<=20);
  assert.equal(ticks[0],500);
  assert(ticks.at(-1)!>=515);
});
