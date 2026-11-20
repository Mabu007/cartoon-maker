import assert from 'node:assert/strict';
import { Graphics, GraphicsPath } from 'pixi.js';
import { illustratedPath } from '../src/engine/illustration.ts';
import { fitCharacterPreview, PREVIEW_FOOT_PADDING, PREVIEW_GROUND_Y, PREVIEW_TOP_PADDING } from '../src/engine/previewLayout.ts';
import { drawActor } from '../src/engine/actorArt.ts';
import test from 'node:test';
import { animations, armIK, blend, rig, sample, skeleton } from '../src/engine/animation.ts';
import { directorJSONSchema, directorSchema } from '../src/engine/directorSchema.ts';
import { evaluate, locate, projectDuration } from '../src/engine/evaluate.ts';
import { characters, makeProject, makeScene } from '../src/engine/presets.ts';
import { actions, AnimationClip, CharacterDefinition, ProjectDocument, SkeletonDefinition, views } from '../src/engine/schema.ts';
import { changeClipTiming, copyClip, currentScene, removeEntity, runEdit, useStudio } from '../src/studio.ts';

const demo = makeProject(true);
const scene = demo.scenes[0];
test('the shipped rig and every action match their schemas and have ordered keys', () => {
  assert(SkeletonDefinition.safeParse(skeleton).success);
  for (const name of actions) {
    const clip = AnimationClip.parse(animations[name]);
    assert.equal(clip.keys[0].time, 0);
    assert.equal(clip.keys.at(-1)?.time, 1);
    assert(clip.keys.every((key, index) => !index || key.time > clip.keys[index - 1].time));
  }
});
test('walking loops at the first key and moves real knees, elbows and hips', () => {
  const walk = animations.walk;
  assert.deepEqual(sample(walk, 0), sample(walk, walk.duration));
  assert.notEqual(sample(walk, 0).pose.leftHip, sample(walk, walk.duration / 2).pose.leftHip);
  assert.notEqual(sample(walk, 0).pose.leftKnee, sample(walk, walk.duration / 2).pose.leftKnee);
  assert.equal(sample(animations.jump, .85).lift, 0);
  assert(sample(animations.jump, .5).lift > 50);
});
test('upper-body gestures preserve the seated hips and animation lift', () => {
  const sit = sample(animations.sit, 2);
  const wave = sample(animations.wave, .4);
  const pose = blend(sit.pose, wave.pose, .8, true);
  assert.equal(pose.leftHip, sit.pose.leftHip);
  assert.notEqual(pose.rightShoulder, sit.pose.rightShoulder);
  assert.equal(sit.lift, -49);
});
test('inverse kinematics preserves limb lengths even when a cup is out of reach', () => {
  const origin = { x: 0, y: 0 };
  const target = { x: 14, y: -35 };
  const [elbow, hand] = armIK(origin, target, 28, 30, 1);
  const length = (a: typeof origin, b: typeof origin) => Math.hypot(a.x - b.x, a.y - b.y);
  assert(length(target, hand) < .00001);
  assert(Math.abs(length(origin, elbow) - 28) < .00001);
  assert(Math.abs(length(elbow, hand) - 30) < .00001);
  const [, far] = armIK(origin, { x: 900, y: 0 }, 28, 30, 1);
  assert(length(origin, far) <= 58);
});
test('scaling head and legs modifies one shared character definition across all five views', () => {
  assert.equal(views.length, 5);
  const c = CharacterDefinition.parse(characters[0]);
  for (const width of [1, .88, .57, .81, 1]) {
    const normal = rig(c, {}, width);
    const taller = rig({ ...c, legs: 1.2, head: 1.2 }, {}, width);
    assert(taller.head.y < normal.head.y);
    assert(Math.abs(taller.left.foot.y - normal.left.foot.y) < 1);
  }
});
test('scene evaluation is deterministic after random seeks and selects demo interactions', () => {
  const baseline = evaluate(scene, 1.6);
  evaluate(scene, 23);
  evaluate(scene, 11);
  assert.deepEqual(evaluate(scene, 1.6), baseline);
  assert.equal(baseline.actors.find(actor => actor.id === 'actor-zee')?.held?.kind, 'cup');
  assert.equal(baseline.actors.find(actor => actor.id === 'actor-zee')?.lift, -49);
  const close = evaluate(scene, 6);
  assert.equal(close.shot, 'close-up');
  assert(close.camera.zoom > baseline.camera.zoom);
  assert.equal(close.actors[0].characterId, baseline.actors[0].characterId);
  assert(evaluate(scene, 25).actors[1].x > baseline.actors[1].x);
  assert(evaluate(scene, 30).fade > .99);
});
test('scene boundaries have an unambiguous ordering for preview and export', () => {
  const second = { ...makeScene('Township street'), duration: 9 };
  assert.equal(projectDuration([scene, second]), 39);
  assert.equal(locate([scene, second], 30).scene.id, second.id);
  assert.equal(locate([scene, second], 30).local, 0);
  assert.equal(locate([scene, second], 100).local, 9);
});
test('demo documents round-trip and invalid asset, version, reference and timing data fail validation', () => {
  const restored = ProjectDocument.parse(JSON.parse(JSON.stringify(demo)));
  assert.equal(restored.name, 'Who Ate My Food?');
  assert.deepEqual(evaluate(restored.scenes[0], 12.9), evaluate(scene, 12.9));
  for (const invalid of [
    { ...demo, version: 2 },
    { ...demo, characters: [] },
    { ...demo, scenes: [{ ...scene, clips: [{ ...scene.clips[0], length: 40 }] }] },
    { ...demo, scenes: [{ ...scene, clips: [{ id: 'test', track: 'audio', asset: 'https://example.org/audio', name: 'Bad', start: 0, length: 1, muted: false, volume: 1 }] }] }
  ]) assert(!ProjectDocument.safeParse(invalid).success);
});
test('director rejects unknown actions, unassigned actors, overlong timing and extra keys', () => {
  const plan = { title: 'A funny plan', world: 'Classroom', cast: [{ character: 'zee', x: 400, y: 440, mirror: false }], events: [{ type: 'action', start: 0, length: 2, actor: 'zee', action: 'wave' }] };
  assert.equal(directorJSONSchema.type, 'object');
  assert(directorSchema.safeParse(plan).success);
  for (const event of [{ action: 'missing' }, { actor: 'sbu' }, { start: 29 }, { arbitrary: 'denied' }]) assert(!directorSchema.safeParse({ ...plan, events: [{ ...plan.events[0], ...event }] }).success);
});
test('immutable edits maintain referential integrity and undo/redo restores project state', () => {
  const withoutSbu = runEdit(demo, value => ({ ...value, scenes: value.scenes.map(item => removeEntity(item, 'actor-sbu')) }));
  assert.equal(scene.actors.length, 2);
  assert.equal(withoutSbu.scenes[0].actors.length, 1);
  assert(withoutSbu.scenes[0].clips.every(clip => !('actor' in clip) || clip.actor !== 'actor-sbu'));
  assert(withoutSbu.scenes[0].clips.every(clip => !('focus' in clip) || clip.focus !== 'actor-sbu'));
  useStudio.getState().open(demo);
  useStudio.getState().editScene(value => ({ ...value, name: 'Retitled' }));
  assert.equal(currentScene(useStudio.getState()).name, 'Retitled');
  useStudio.getState().undo(); assert.equal(currentScene(useStudio.getState()).name, scene.name);
  useStudio.getState().redo(); assert.equal(currentScene(useStudio.getState()).name, 'Retitled');
});
test('audio trim advances the source position and a duplicated clip fits its scene', () => {
  const voice = scene.clips.find(clip => clip.track === 'dialogue')!;
  const trimmed = changeClipTiming(voice, voice.start + .25, voice.length - .25, scene.duration, true);
  assert.equal(trimmed.track === 'dialogue' && trimmed.offset, .25);
  const copy = copyClip({ ...voice, start: 27, length: 3 }, 30);
  assert.notEqual(copy.id, voice.id);
  assert(copy.start + copy.length <= 30);
});

test('illustrated character paths render without a DOM, WebGL, or SVG document importer', () => {
  const samplePath = new GraphicsPath('M 0 0 C 6 -4 12 4 16 0 L 16 16 Z');
  assert(samplePath.instructions.length > 0);
  for (const character of characters) for (const view of views) {
    const body = new Graphics();
    const face = new Graphics();
    assert.doesNotThrow(() => drawActor(body, face, character, view, {}, 'happy', 0.2), character.name + ' / ' + view);
    assert(body.context.instructions.length > 0);
    assert(face.context.instructions.length > 0);
    body.destroy();
    face.destroy();
  }
});

test('all character presets and extreme proportions fit head, hair, and shoes in the preview', () => {
  const tall = { ...characters[0], height: 1.3, head: 1.35, torso: 1.3, arms: 1.3, legs: 1.3, hair: 'afro' as const };
  const short = { ...characters[1], height: .75, head: .75, torso: .75, arms: .75, legs: .75, hair: 'braids' as const };
  for (const character of [...characters, tall, short]) {
    for (const action of actions) {
      const fit = fitCharacterPreview(character, 1.85, action);
      assert(fit.scale > 0 && fit.scale <= 1.85);
      assert(fit.footY < 540, character.name + ' / ' + action + ' feet');
      assert.equal(fit.y, PREVIEW_GROUND_Y);
      assert(fit.maximumZoom >= fit.scale);
      const top = rig(character, {}, 1).head.y - (50 + (['afro', 'puff', 'curls'].includes(character.hair) ? 28 : ['braids', 'locs'].includes(character.hair) ? 19 : 9)) * character.head;
      assert(PREVIEW_GROUND_Y + top * fit.scale >= PREVIEW_TOP_PADDING - .01, character.name + ' / ' + action + ' hair');
    }
  }
  assert.equal(PREVIEW_FOOT_PADDING, 14);
  assert(Number.isFinite(fitCharacterPreview(characters[0], Number.NaN).scale));
});

test('illustrated SVG paths are reused without changing character geometry or rendering', () => {
  const d = 'M 0 0 L 12 0 C 12 7 5 12 0 0 Z';
  assert.strictEqual(illustratedPath(d), illustratedPath(d));
  const front = new Graphics(), face = new Graphics();
  drawActor(front, face, characters[0], 'front', {}, 'happy', 0);
  assert(front.context.instructions.length > 0 && face.context.instructions.length > 0);
  front.destroy();
  face.destroy();
});
