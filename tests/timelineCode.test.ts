import assert from 'node:assert/strict';
import test from 'node:test';
import { makeProject } from '../src/engine/presets.ts';
import { cameraConflicts, insertCameraShot, parseSceneCode, sceneContext, sceneToCode } from '../src/engine/timelineCode.ts';
import { parseRhubarbOutput } from '../src/services/lipSync.ts';
import { sampleTimedViseme } from '../src/engine/visemes.ts';
import type { Clip } from '../src/engine/schema.ts';

const demo = makeProject(true);
const scene = demo.scenes[0];
const camera = (id: string, start: number, length: number): Extract<Clip, { track: 'camera' }> =>
  ({ id, start, length, track: 'camera', shot: 'wide', transition: 'cut' });

test('canonical scene JSON round trips through the same runtime schema', () => {
  const code = sceneToCode(scene);
  const restored = parseSceneCode(code, demo, scene.id);
  assert.deepEqual(restored, scene);
  assert.match(sceneContext(demo, scene), /Current canonical scene JSON/);
});
test('invalid pasted scene data does not modify existing project', () => {
  const broken = JSON.stringify({ schemaVersion: 1, scene: { ...scene, clips: [{ ...camera('invalid', 0, 5), focus: 'not-an-actor' }] } });
  assert.throws(() => parseSceneCode(broken, demo, scene.id), /unknown focus/);
  assert.throws(() => parseSceneCode('{ bad', demo, scene.id), /Invalid JSON/);
  assert.equal(scene.clips.length, demo.scenes[0].clips.length);
});
test('camera shot edits trim competing full frame shots to prevent overlap', () => {
  const old = camera('original', 0, 12);
  const inserted = insertCameraShot([old], camera('closer', 3, 4));
  assert.deepEqual(inserted.filter(c => c.track === 'camera').map(c => [c.start, c.length]), [[0, 3], [3, 4], [7, 5]]);
  assert.equal(cameraConflicts(inserted).length, 0);
  assert.equal(cameraConflicts([old, camera('overlap', 5, 5)]).length, 1);
});
test('audio-derived viseme timestamps are deterministic and silence remains silent', () => {
  const cues = parseRhubarbOutput({ mouthCues: [{ start: 0, end: .2, value: 'A' }, { start: .2, end: .6, value: 'D' }, { start: .6, end: .8, value: 'X' }] }, 1);
  assert.equal(sampleTimedViseme(cues, .1).shape, 'closed');
  assert.equal(sampleTimedViseme(cues, .41).shape, 'wide');
  assert.equal(sampleTimedViseme(cues, .75).weight, 0);
  assert.equal(sampleTimedViseme(cues, 2).shape, 'rest');
  assert.throws(() => parseRhubarbOutput({ mouthCues: [{ start: -1, end: 1, value: 'A' }] }, 1), /Invalid Rhubarb cue/);
});
