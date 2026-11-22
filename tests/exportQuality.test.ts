import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outputSize } from '../src/engine/exportQuality.ts';
test('balanced exports bound the short edge to 720 and keep encoder-aligned aspect ratios',()=>{
  assert.deepEqual(outputSize('16:9','balanced'),[1280,720]);
  assert.deepEqual(outputSize('9:16','balanced'),[720,1280]);
  assert.deepEqual(outputSize('1:1','balanced'),[720,720]);
  assert.deepEqual(outputSize('16:9','full'),[1920,1080]);
});
