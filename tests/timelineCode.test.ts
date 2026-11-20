import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTimelineEdits } from '../src/engine/timelineAI.ts';
import { makeProject } from '../src/engine/presets.ts';
import { cameraConflicts, insertCameraShot, parseSceneCode, sceneContext, sceneToCode } from '../src/engine/timelineCode.ts';
import { parseRhubarbOutput } from '../src/services/lipSync.ts';
import { useStudio } from '../src/studio.ts';
import { sampleTimedViseme } from '../src/engine/visemes.ts';
import { TimelineClip, type Clip } from '../src/engine/schema.ts';

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
  assert.deepEqual(inserted.filter(c => c.track === 'camera').sort((a, b) => a.start - b.start).map(c => [c.start, c.length]), [[0, 3], [3, 4], [7, 5]]);
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


test('scene code rejects duplicate IDs, invalid interactions and unresolved audio before apply', () => {
  const invalid: Array<[Clip, RegExp]> = [
    [camera(scene.clips[0].id, 0, 1), /Duplicate IDs/],
    [camera('too-late', 29, 2), /outside the scene/],
    [{ id: 'cant-sit', track: 'body', action: 'sit', actor: scene.actors[0].id, layer: 'body', target: 'cup', start: 1, length: 1 }, /compatible props/],
    [{ id: 'no-file', track: 'music', name: 'Unknown', asset: 'asset:not-in-project', start: 1, length: 1, offset: 0, muted: false, volume: 1 }, /unknown audio/]
  ];
  for (const [clip, problem] of invalid) {
    assert.throws(() => parseSceneCode(sceneToCode({ ...scene, clips: [...scene.clips, clip] }), demo, scene.id), problem);
  }
});

test('AI batches are atomic and preserve priority for same-time cues on replacement', () => {
  const actor = scene.actors[0].id;
  const face = { id: 'face-a', track: 'face', actor, start: 1, length: 1, expression: 'thinking' } as const;
  const updated = { ...scene, clips: [...scene.clips, face, { ...face, id: 'face-b', expression: 'happy' as const }] };
  const project = { ...demo, scenes: [updated] };
  assert.throws(() => applyTimelineEdits(project, updated, { message: 'Reblock the scene', edits: [
    { op: 'remove', clipId: 'face-a' },
    { op: 'insert', clip: { ...face, id: 'bad-face', actor: 'unknown' } }
  ] }), /missing actor/);
  assert.equal(updated.clips.at(-2)?.id, 'face-a');
  const next = applyTimelineEdits(project, updated, { message: 'Change the first cue', edits: [
    { op: 'replace', clipId: face.id, clip: { ...face, expression: 'sad' } }
  ] });
  assert.deepEqual(next.clips.slice(-2).map(clip => clip.id), ['face-a', 'face-b']);
});

test('legacy camera overlaps migrate to one active shot while unsafe new overlaps are rejected', () => {
  const legacy = { ...scene, clips: [camera('old-wide', 0, 15), camera('old-close', 7, 3)] };
  useStudio.getState().open({ ...demo, scenes: [legacy] });
  const normalized = useStudio.getState().project.scenes[0];
  assert.equal(cameraConflicts(normalized.clips).length, 0);
  assert.deepEqual(normalized.clips.filter(c => c.track === 'camera').map(c => [c.start, c.length]).sort((a,b) => a[0] - b[0]), [[0,7],[7,3],[10,5]]);
  useStudio.getState().editScene(current => ({ ...current, name: 'Renamed' }));
  assert.throws(() => useStudio.getState().editScene(current => ({
    ...current, clips: [...current.clips, camera('new-shot', 12, 2)]
  })), /overlap/);
  assert.deepEqual(useStudio.getState().project.scenes[0].clips, normalized.clips);
});

test('fractional camera splits preserve boundaries and allocate valid unique IDs', () => {
  const id = 'w'.repeat(100);
  const entered = camera('incoming', 2.123, 1.234);
  const boundary = entered.start + entered.length;
  const reserved = id.slice(0, 89) + '-after-3_36';
  const shots = insertCameraShot([camera(id, 0, 5.456)], entered, [reserved]);
  assert.equal(cameraConflicts(shots).length, 0);
  const segment = shots.find(clip => clip.start === boundary)!;
  assert.equal(segment.start + segment.length, 5.456);
  assert.notEqual(segment.id, reserved);
  assert.equal(new Set(shots.map(clip => clip.id)).size, 3);
  assert(shots.every(clip => TimelineClip.safeParse(clip).success));
});
