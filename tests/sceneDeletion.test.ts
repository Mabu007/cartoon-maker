import assert from 'node:assert/strict';
import test from 'node:test';
import { removeMovieScene } from '../src/engine/sceneWorkflow.ts';
import { makeProject, makeScene } from '../src/engine/presets.ts';
import { ProjectDocument } from '../src/engine/schema.ts';
import { currentScene, useStudio } from '../src/studio.ts';

test('delete any scene in the movie without touching the surviving scene timelines', () => {
  const movie = makeProject(true);
  const first = movie.scenes[0];
  const middle = makeScene('Classroom');
  const last = { ...makeScene('Township street'), duration: 12 };
  const original = ProjectDocument.parse({ ...movie, scenes: [first, middle, last] });
  const result = removeMovieScene(original, middle.id);
  assert.deepEqual(result.scenes.map(scene => scene.id), [first.id, last.id]);
  assert.deepEqual(result.scenes[0].clips, first.clips);
  assert.deepEqual(result.scenes[1].objects, last.objects);
  assert.equal(original.scenes.length, 3);
  assert.equal(result.scenes[1].duration, 12);
  assert.throws(() => removeMovieScene(result, middle.id), /no longer exists/);
});

test('deleting the active scene keeps the project valid and supports undo and redo', () => {
  const movie = makeProject(true);
  const other = makeScene('Classroom');
  useStudio.getState().open({ ...movie, scenes: [...movie.scenes, other] });
  useStudio.getState().setScene(other.id);
  useStudio.getState().edit(project => removeMovieScene(project, other.id));
  assert.equal(useStudio.getState().project.scenes.length, 1);
  assert.equal(currentScene(useStudio.getState()).id, movie.scenes[0].id);
  assert.equal(useStudio.getState().selection, null);
  useStudio.getState().undo();
  assert.equal(currentScene(useStudio.getState()).id, other.id);
  useStudio.getState().redo();
  assert.equal(currentScene(useStudio.getState()).id, movie.scenes[0].id);
});

test('deleting the only scene resets it to an empty editable scene and undo restores everything', () => {
  const movie = makeProject(true);
  const old = movie.scenes[0];
  assert(old.clips.length > 0);
  useStudio.getState().open(movie);
  useStudio.getState().select({ kind: 'clip', id: old.clips[0].id });
  useStudio.getState().edit(project => removeMovieScene(project, old.id));
  const result = useStudio.getState().project;
  assert.equal(result.scenes.length, 1);
  assert.notEqual(result.scenes[0].id, old.id);
  assert.deepEqual(result.scenes[0].actors, []);
  assert.deepEqual(result.scenes[0].clips, []);
  assert.deepEqual(result.scenes[0].objects, []);
  assert.equal(useStudio.getState().selection, null);
  assert.deepEqual(result.characters, movie.characters);
  ProjectDocument.parse(result);
  useStudio.getState().undo();
  assert.equal(currentScene(useStudio.getState()).id, old.id);
  assert.deepEqual(currentScene(useStudio.getState()).clips, old.clips);
  useStudio.getState().redo();
  assert.deepEqual(currentScene(useStudio.getState()).clips, []);
});
