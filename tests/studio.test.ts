import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate, locate, MOVIE_FRAME_RATE } from '../src/engine/evaluate.ts';
import { makeProject, makeScene } from '../src/engine/presets.ts';
import { ProjectDocument, type Clip } from '../src/engine/schema.ts';
import { dialogueAmplitude, soundPlayback } from '../src/services/audio.ts';
import { listLocal, mergeLocal, removeLocal, saveLocal } from '../src/services/projects.ts';
import { changeClipTiming, copyClip, currentScene, removeEntity, useStudio } from '../src/studio.ts';

test('failed project and scene commands leave the live document, selection and history untouched', () => {
  useStudio.getState().open(makeProject(true));
  const clip = currentScene(useStudio.getState()).clips[0];
  useStudio.getState().select({ kind: 'clip', id: clip.id });
  useStudio.getState().edit(project => ({ ...project, name: 'Edited' }));
  useStudio.getState().undo();
  const before = useStudio.getState();
  assert.throws(() => before.edit(draft => {
    draft.scenes[0].clips[0].length = 180;
    draft.name = 'Invalid update';
    return draft;
  }), /outside the scene/);
  assert.throws(() => before.editScene(draft => {
    draft.clips.pop();
    throw new Error('Cancelled');
  }), /Cancelled/);
  assert.throws(() => before.editScene(draft => ({ ...draft, id: 'another-scene' })), /original ID/);
  assert.throws(() => before.edit(draft => ({ ...draft, id: 'another-project' })), /original ID/);
  assert.equal(useStudio.getState(), before);
  assert.equal(before.project.name, 'Who Ate My Food?');
  assert.equal(before.project.scenes[0].clips[0].length, 30);
  before.editScene(draft => ({ ...draft }));
  assert.equal(useStudio.getState(), before);
  before.redo();
  assert.equal(useStudio.getState().project.name, 'Edited');
});

test('scene changes and history keep selection and identifiers attached to existing entities', () => {
  const first = makeProject(true);
  const second = { ...makeScene(), clips: [...first.scenes[0].clips], actors: first.scenes[0].actors };
  useStudio.getState().open({ ...first, scenes: [...first.scenes, second] });
  useStudio.getState().setScene(second.id);
  const value = second.clips[0];
  useStudio.getState().select({ id: value.id, kind: 'clip' });
  const captured = useStudio.getState();
  captured.setScene('missing');
  assert.equal(useStudio.getState(), captured);
  captured.editScene(scene => removeEntity(scene, value.id));
  assert.equal(useStudio.getState().selection, null);
  captured.undo();
  assert.equal(useStudio.getState().selection?.id, value.id);
  captured.edit(project => ({ ...project, scenes: project.scenes.filter(scene => scene.id !== second.id) }));
  assert.equal(useStudio.getState().sceneId, first.scenes[0].id);
  captured.undo();
  assert.equal(useStudio.getState().sceneId, second.id);
  captured.redo();
  assert.equal(useStudio.getState().sceneId, first.scenes[0].id);
});

test('an async edit cannot write to another scene or a reopened project with the same IDs', () => {
  const movie = makeProject();
  movie.scenes.push(makeScene('Classroom'));
  useStudio.getState().open(movie);
  const target = useStudio.getState();
  const rename = (scene: typeof movie.scenes[number]) => ({ ...scene, name: 'Async edit' });
  target.setScene(movie.scenes[1].id);
  assert.throws(() => target.editScene(rename, target), /active scene changed/);
  target.open(movie);
  assert.throws(() => target.editScene(rename, target), /active scene changed/);
  assert.deepEqual(useStudio.getState().project, movie);
});

test('saving an older revision does not clear a pending edit', () => {
  useStudio.getState().open(makeProject(), true);
  const first = useStudio.getState();
  first.edit(project => ({ ...project, name: 'New edit' }));
  first.markSaved(first.project);
  const current = useStudio.getState();
  assert.equal(current.dirty, true);
  current.markSaved(current.project);
  assert.equal(useStudio.getState().dirty, false);
  current.undo();
  assert.equal(useStudio.getState().dirty, true);
});

test('music left trims preserve the source offset for preview and export', () => {
  const music = { id: 'music', track: 'music', start: 1, length: 7, offset: 2,
    asset: 'builtin:ding', volume: 1, muted: false, name: 'Test music' } as const;
  const trim = changeClipTiming(music, 3, 5, 30, true);
  assert.equal(trim.track, 'music');
  if (trim.track !== 'music') throw new Error('Expected music');
  assert.equal(trim.offset, 4);
  assert.deepEqual(soundPlayback(trim, 13, 10), { delay: 13, offset: 4, duration: 5 });
  assert.deepEqual(soundPlayback(trim, 13, 10, 15), { delay: 0, offset: 6, duration: 3 });
  assert.equal(soundPlayback(trim, 13, 10, 18), undefined);
  assert.equal(soundPlayback(trim, 13, 4), undefined);
});

test('camera duplication leaves the original intact and rejects a full track', () => {
  const shot: Clip = { id: 'wide', track: 'camera', shot: 'wide', transition: 'cut', start: 0, length: 4 };
  const later = { ...shot, id: 'later', start: 4, length: 1 };
  assert.throws(() => copyClip(shot, 8, [shot, later]), /make room/);
  const next = copyClip(shot, 9, [shot, later]);
  assert.equal(next.start, 5);
  assert.equal(next.length, 4);
  assert.notEqual(next.id, shot.id);
  assert.equal(shot.start, 0);
});

test('local saves, cloud merges and removals retain unreadable sibling snapshots', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const legacy = { updated: 12, project: { id: 'from-newer-version', version: 2, scenes: ['preserve'] } };
  const key = 'toonroom.projects.v1.test';
  const storage = new Map([[key, JSON.stringify([legacy])]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }
  });
  try {
    const project = makeProject();
    saveLocal('test', project, 20);
    assert.equal(saveLocal('test', { ...project, name: 'Local edit' }, 20), 21);
    assert.equal(mergeLocal('test', [{ project, updated: 20 }])[0].project.name, 'Local edit');
    assert.equal(mergeLocal('test', [{ project, updated: 22 }])[0].project.name, project.name);
    removeLocal('test', project.id);
    assert.deepEqual(listLocal('test'), []);
    assert.deepEqual(JSON.parse(storage.get(key)!), [legacy]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('the saved movie and editor evaluate the same state across a timed scene cut', () => {
  const project = makeProject(true);
  const second = { ...project.scenes[0], id: 'next', name: 'Second scene' };
  useStudio.getState().open({ ...project, scenes: [...project.scenes, second] });
  useStudio.getState().setScene(second.id);
  useStudio.getState().editScene(scene => ({ ...scene, clips: [...scene.clips, {
    id: 'opening-fade', track: 'transition', start: 0, length: 1, effect: 'fade-in'
  }] }));
  const editing = useStudio.getState();
  const saved = ProjectDocument.parse(JSON.parse(JSON.stringify(editing.project)));
  const cut = editing.project.scenes[0].duration;
  assert.equal(locate(saved.scenes, cut - 1 / MOVIE_FRAME_RATE).scene.id, project.scenes[0].id);
  for (const frame of [0, 1, 12, 30, 389, 899]) {
    const { scene, local } = locate(saved.scenes, cut + frame / MOVIE_FRAME_RATE);
    assert.equal(scene.id, second.id);
    assert.deepEqual(evaluate(scene, local), evaluate(currentScene(editing), local));
  }
  assert.equal(evaluate(locate(saved.scenes, cut).scene, 0).fade, 1);
});


test('preview and export sample dialogue emphasis at the same trimmed media position', () => {
  const project = makeProject(true);
  const scene = project.scenes[0];
  const clip = scene.clips.find(item => item.track === 'dialogue')!;
  if (clip.track !== 'dialogue') throw new Error('Expected dialogue');
  const buffer = new Float32Array(100);
  buffer[50] = .75;
  const trimmed = { ...scene, clips: [{ ...clip, offset: .5, volume: .5 }] };
  const read = () => buffer;
  assert.equal(dialogueAmplitude(trimmed, clip.actor, clip.start + .5, read), .375);
  assert.equal(dialogueAmplitude(trimmed, clip.actor, clip.start - .1, read), 0);
  assert.equal(dialogueAmplitude(trimmed, clip.actor, clip.start + clip.length, read), 0);
});

test('duplicating dialogue moves forward into free space without overlapping the original speaker',()=>{
  const voice:Clip={id:'original',track:'dialogue',actor:'actor-sbu',
    text:'Hello',asset:'builtin:sbu-food',start:1,length:2,offset:0,volume:1,muted:false};
  const other:Clip={...voice,id:'later',start:3,length:3};
  const result=copyClip(voice,12,[voice,other]);
  assert.equal(result.start,6);
  assert.equal(result.length,2);
  assert.notEqual(result.id,voice.id);
  assert.equal(voice.start,1);
});
test('duplicating audio with no remaining space rejects instead of silently overlapping its source',()=>{
  const music:Clip={id:'song',track:'music',name:'Ending',asset:'builtin:sting',
    start:15,length:15,offset:0,volume:1,muted:false};
  assert.throws(()=>copyClip(music,30,[music]),/make room/);
});

test('editing one scene keeps the other scene data and undo history intact', () => {
  const movie = makeProject(true);
  movie.scenes.push(makeScene('Classroom'));
  useStudio.getState().open(movie);
  const before = useStudio.getState();
  const unchanged = before.project.scenes[1];
  before.editScene(scene => ({ ...scene, name:'Opening shot' }));
  assert.equal(useStudio.getState().project.scenes[1], unchanged);
  assert.throws(() => useStudio.getState().editScene(scene => ({
    ...scene, actors: scene.actors.map(actor => ({...actor, characterId:'missing-character'}))
  })), /missing character/);
  useStudio.getState().undo();
  assert.equal(useStudio.getState().project, before.project);
});

test('a local movie can store individually valid high-resolution backgrounds across several scenes', () => {
  const movie = makeProject();
  const bitmap = 'data:image/webp;base64,' + 'A'.repeat(240_000);
  movie.scenes = Array.from({length:5},(_, index) => ({
    ...makeScene(), name:'Scene '+(index+1), backgroundImage: bitmap.slice(0,-4)+String(index).repeat(4)
  }));
  useStudio.getState().open(ProjectDocument.parse(movie));
  assert.equal(useStudio.getState().project.scenes.length,5);
  useStudio.getState().editScene(scene=>({...scene, name:'Changed opening'}));
  assert.equal(useStudio.getState().project.scenes[4].backgroundImage,movie.scenes[4].backgroundImage);
});
