import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate, locate, movementPosition, projectDuration } from '../src/engine/evaluate.ts';
import { makeProject, makeScene } from '../src/engine/presets.ts';
import { ProjectDocument, parseStoredProject, type Clip } from '../src/engine/schema.ts';
import { sceneToCode, parseSceneCode } from '../src/engine/timelineCode.ts';
import { movieToCode, parseMovieCode, sceneBuildingContext, movieBuildingContext } from '../src/engine/movieTimeline.ts';
import { useStudio } from '../src/studio.ts';
import { listLocal, saveLocal } from '../src/services/projects.ts';

const demo = makeProject(true);

test('versioned movie JSON round trips without losing scene ordering, clips or assets', () => {
  const code = movieToCode(demo);
  const parsed = parseMovieCode(code, demo);
  assert.deepEqual(parsed, ProjectDocument.parse(demo));
  assert.deepEqual(JSON.parse(code).project.scenes.map((s: { id: string }) => s.id), demo.scenes.map(s => s.id));
  assert.deepEqual(parseMovieCode(JSON.stringify(demo), demo), parsed);
});

test('whole-movie JSON can reorder executable scenes without changing individual scene data', () => {
  const second = { ...makeScene('Classroom'), id: 'new-classroom', name: 'The lesson' };
  const prior = { ...demo, scenes: [...demo.scenes, second] };
  const imported = parseMovieCode(movieToCode({ ...prior, scenes: [second, demo.scenes[0]] }), prior);
  assert.deepEqual(imported.scenes.map(item => item.id), [second.id, demo.scenes[0].id]);
  assert.equal(projectDuration(imported.scenes), second.duration + demo.scenes[0].duration);
  assert.equal(locate(imported.scenes, 0).scene.id, second.id);
  assert.equal(locate(imported.scenes, second.duration + 1).scene.id, demo.scenes[0].id);
});

test('unversioned and version-zero historical project documents migrate only the version', () => {
  const { version: _version, ...legacy } = demo;
  assert.deepEqual(parseStoredProject(legacy), demo);
  assert.deepEqual(parseStoredProject({ ...legacy, version: 0 }), demo);
  assert.deepEqual(parseMovieCode(JSON.stringify(legacy), demo), demo);
  assert.throws(() => parseStoredProject({ ...demo, version: 42 }), /version|Invalid input/i);
  assert.throws(() => parseMovieCode(JSON.stringify({ format: 'toonroom-timeline', schemaVersion: 9, project: demo }), demo), /Unsupported movie timeline schema version/);
});

test('movie JSON rejects malformed clips, unknown assets and identity changes atomically', () => {
  const before = structuredClone(demo.scenes[0].clips);
  const invalid = structuredClone(demo);
  invalid.scenes[0].clips.push({ id: 'new-music', track: 'music', start: 2, length: 2, name: 'No audio', asset: 'asset:unavailable', volume: 1, offset: 0, muted: false });
  assert.throws(() => parseMovieCode(movieToCode(invalid), demo), /unknown audio asset/);
  const bad = structuredClone(demo);
  bad.scenes[0].clips.push({ id: 'bad', track: 'camera', shot: 'wide', transition: 'cut', start: 29, length: 8 });
  assert.throws(() => parseMovieCode(movieToCode(bad), demo), /outside the scene/);
  assert.throws(() => parseMovieCode(movieToCode({ ...demo, id: 'different' }), demo), /Movie ID cannot change/);
  assert.throws(() => parseMovieCode('{ not json', demo), /Invalid JSON/);
  assert.deepEqual(demo.scenes[0].clips, before);
});

test('imported movement keyframes sample deterministically in the actual scene evaluator', () => {
  const next = structuredClone(demo);
  const old = next.scenes[0].clips.find(c => c.track === 'movement' && c.actor === 'actor-sbu' && c.start === 0)!;
  if (old.track !== 'movement') throw new Error('Expected movement');
  const change: Clip = { ...old, keyframes: [
    { time: 0, x: 300, y: 454 },
    { time: 0.5, x: 475, y: 360 },
    { time: 1, x: 446, y: 454 }
  ] };
  next.scenes[0].clips = next.scenes[0].clips.map(c => c.id === change.id ? change : c);
  const imported = parseSceneCode(sceneToCode(next.scenes[0]), demo, demo.scenes[0].id);
  const sampled = evaluate(imported, old.start + old.length / 2).actors.find(a => a.id === 'actor-sbu')!;
  assert.equal(sampled.x, 475);
  assert.equal(sampled.y, 360);
  assert.deepEqual(movementPosition(change, 1), { x: 446, y: 454 });
  const invalid = { ...change, keyframes: [{time:0,x:300,y:454},{time:0.9,x:475,y:360}] };
  assert.throws(() => parseSceneCode(sceneToCode({ ...imported, clips: imported.clips.map(c => c.id === invalid.id ? invalid : c) }), demo, imported.id), /keyframes must begin/);
});

test('visual edits and movie Code Mode write the same Zustand document, with one-step undo/redo', () => {
  useStudio.getState().open(demo);
  const desired = structuredClone(demo);
  desired.scenes[0].name = 'Edited from JSON';
  const imported = parseMovieCode(movieToCode(desired), useStudio.getState().project);
  useStudio.getState().edit(() => imported);
  assert.equal(useStudio.getState().project.scenes[0].name, 'Edited from JSON');
  assert.equal(useStudio.getState().past.length, 1);
  useStudio.getState().undo();
  assert.equal(useStudio.getState().project.scenes[0].name, demo.scenes[0].name);
  useStudio.getState().redo();
  assert.equal(useStudio.getState().project.scenes[0].name, 'Edited from JSON');
  useStudio.getState().editScene(s => ({ ...s, name: 'Edited visually' }));
  assert.equal(parseMovieCode(movieToCode(useStudio.getState().project), useStudio.getState().project).scenes[0].name, 'Edited visually');
});

test('AI Scene-Building Context contains real runtime JSON schema and actual project asset IDs', () => {
  const scene = demo.scenes[0];
  const context = sceneBuildingContext(demo, scene);
  assert.match(context, /Actual Toonroom clip schema/);
  assert.ok(context.includes(scene.id));
  assert.ok(context.includes('actor-sbu'));
  assert.ok(context.includes('builtin:sbu-food'));
  assert.ok(context.includes('keyframes'));
  const movie = movieBuildingContext(demo);
  assert.ok(movie.includes(demo.id));
  assert.ok(movie.includes('toonroom-timeline'));
});

test('migrated timeline documents persist and reload from local project storage', () => {
  const values = new Map<string,string>();
  const fake = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key,value); },
    removeItem: (key: string) => { values.delete(key); }
  };
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: fake });
  try {
    const scope = 'part2-test';
    const { version: _version, ...legacy } = demo;
    values.set('toonroom.projects.v1.' + scope, JSON.stringify([{project:legacy,updated:10}]));
    assert.equal(listLocal(scope)[0].project.version, 1);
    const next = parseMovieCode(movieToCode(demo), demo);
    const updated = saveLocal(scope, next, 11);
    assert.equal(listLocal(scope)[0].project.id, demo.id);
    assert.equal(listLocal(scope)[0].updated, updated);
  } finally {
    if (old) Object.defineProperty(globalThis, 'localStorage', old);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
