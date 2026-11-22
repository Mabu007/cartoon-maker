import assert from 'node:assert/strict';
import test from 'node:test';
import { dialogueBeatAt, type DialoguePhrase } from '../src/engine/dialogueGestures.ts';
import { handPerformance, occupiedHands } from '../src/engine/handPerformance.ts';
import { fingerPath, handPoseParams, handRotation, handWidthScale, sampleHandRig, type HandPose } from '../src/engine/handRig.ts';
import { gestureAt, livingPose, type ActingContext } from '../src/engine/livingCharacter.ts';
import { makeProject } from '../src/engine/presets.ts';
import { evaluate } from '../src/engine/evaluate.ts';

const project = makeProject(true);
const base = project.characters[0];
const confident = { ...base, personality: { preset: 'confident' as const, gestureFrequency: 100 } };
const shy = { ...base, personality: { preset: 'shy' as const } };
const phrase: DialoguePhrase = { start: 1, duration: 3, text: 'Could you help with this?' };
const context: ActingContext = { time: 3.05, actorId: 'a', action: 'talk', locomotion: 'idle', expression: 'neutral', speaking: true, phrase };

test('relaxed fingers stay close and flex without splaying or crossing', () => {
  const rest = handPoseParams('relaxed');
  assert.deepEqual(rest.curl, [.45, .35, .42, .52, .62]);
  assert.equal(rest.spread, .08);
  const poses: HandPose[] = ['relaxed', 'loose-open', 'open', 'point', 'count-one', 'count-two', 'count-three',
    'pinch', 'fist', 'grip', 'palm-up', 'palm-out', 'shrug', 'self-reference', 'thumbs-up'];
  for (const pose of poses) for (const blend of [0, .2, .5, .8, 1]) {
    const rig = sampleHandRig(pose, blend);
    assert.deepEqual(rig.wrist, [0, 0]);
    for (const [i, finger] of rig.fingers.entries()) {
      assert(finger[2][1] < finger[1][1] && finger[1][1] < finger[0][1], pose);
      const next = rig.fingers[i + 1];
      if (next) for (let joint = 0; joint < 3; joint++) assert(finger[joint][0] < next[joint][0], pose);
    }
  }
  const relaxed = sampleHandRig('relaxed'), open = sampleHandRig('open');
  const span = (rig: typeof relaxed) => rig.fingers[3][2][0] - rig.fingers[0][2][0];
  assert(span(relaxed) < span(open) * .72);
  assert(relaxed.fingers[3][2][1] > open.fingers[3][2][1]);
  assert.deepEqual(sampleHandRig('palm-out', 0), relaxed);
});

test('point leads with an aligned index and wave opens only its active palm', () => {
  const index = sampleHandRig('point').fingers[0];
  assert.equal(index[0][0], index[2][0]);
  for (const side of ['left', 'right'] as const) {
    for (const angle of [-1.2, 0, 1.9]) {
      const rotation = handRotation(angle, 0, 'point', 1, side);
      assert(Math.abs(Math.sin(rotation) - Math.cos(angle)) < 1e-8);
      assert(Math.abs(-Math.cos(rotation) - Math.sin(angle)) < 1e-8);
    }
  }
  const wave = { action: 'wave', locomotion: 'idle', carrying: false } as const;
  assert.equal(handPerformance({ ...wave, side: 'right' }).pose, 'open');
  assert.equal(handPerformance({ ...wave, side: 'left' }).pose, 'relaxed');
});

test('renderer geometry and wrist projections share one sample across views and hands', () => {
  const rig = sampleHandRig('count-three', .72);
  assert.equal(fingerPath(rig.fingers[0]), fingerPath(sampleHandRig('count-three', .72).fingers[0]));
  assert.equal(typeof rig.palm, 'string');
  for (const view of ['front', 'three-quarter', 'side', 'back-quarter', 'back'] as const) {
    assert.equal(handWidthScale(view, 'left', rig.params.wristTwist), -handWidthScale(view, 'right', rig.params.wristTwist));
  }
  assert(Math.abs(handWidthScale('side', 'right', 0)) < handWidthScale('front', 'right', 0));
  const neutral = handRotation(1);
  assert.equal(handRotation(1, 0, 'palm-up', 0, 'left'), neutral);
  assert(Math.abs(handRotation(1, 0, 'palm-up', .5, 'left') + handRotation(1, 0, 'palm-up', .5, 'right') - 2 * neutral) < 1e-8);
});

test('clauses produce sparse semantic accents, and directed points require a target', () => {
  const parts = [
    ['First we plan.', 'count-one'], ['Second we prepare.', 'count-two'], ['Third we go.', 'count-three'],
    ['This is my idea.', 'self-reference'], ['Can we talk?', 'question'], ['Maybe later.', 'shrug'],
    ['Look over there!', 'beat']
  ] as const;
  for (const [text, kind] of parts) {
    const phrase = { start: 0, duration: 3, text };
    const samples = Array.from({ length: 75 }, (_, i) => gestureAt(confident, { ...context, time: i * .04, phrase }));
    assert(samples.some(sample => sample.kind === kind && sample.weight > .2), text);
    assert(samples.filter(sample => sample.kind === 'rest').length > 45, text);
  }
  const pointing = { ...context, phrase: { ...phrase, text: 'Look over there!' }, pointToward: { x: -100, y: 0 }, time: 2.68 };
  const aim = gestureAt(confident, pointing);
  assert.equal(aim.kind, 'point');
  assert.equal(aim.side, 'left');
  assert.equal(aim.pointAngle, -90);
  assert.equal(gestureAt(confident, { ...pointing, occupiedHands: 'left' }).kind, 'beat');
  const many = { start: 0, duration: 7, text: 'Yes. Go. Stop. Run. Move. Wait. Ready. Now. First. Next.' };
  let previousSlot = -1;
  const starts = [];
  for (let t = 0; t < many.duration; t += .01) {
    const beat = dialogueBeatAt(many, t);
    if (beat && beat.slot !== previousSlot) {
      previousSlot = beat.slot;
      starts.push(t);
    }
  }
  assert(starts.length >= 2);
  assert(starts.every((start, i) => i === 0 || start - starts[i - 1] >= 1.50));
});

test('audio-only acting uses stored peaks and respects clipping, pauses and silence', () => {
  const phrase: DialoguePhrase = { start: 8, duration: 4, text: '', offset: 1, cues: [
    { start: 0, end: .3, shape: 'wide', strength: .9 },
    { start: 1.2, end: 1.4, shape: 'rest', strength: 0 },
    { start: 3, end: 3.16, shape: 'wide', strength: .82 }
  ] };
  assert.equal(gestureAt(confident, { ...context, time: 8.1, phrase }).kind, 'rest');
  const audible = gestureAt(confident, { ...context, time: 10.08, phrase });
  assert.equal(audible.kind, 'beat');
  assert(audible.weight > 0 && audible.weight < .55);
  assert.equal(gestureAt(confident, { ...context, time: 10.5, phrase }).kind, 'rest');
  assert.equal(gestureAt(confident, { ...context, time: 10.08, phrase: { ...phrase, cues: undefined } }).kind, 'rest');
  assert.equal(gestureAt(confident, { ...context, time: 10.08, phrase, speaking: false }).kind, 'rest');
});

test('the same beat drives arms and one hand, with personality, grip and manual priorities', () => {
  const clear = gestureAt(confident, context);
  const restrained = gestureAt(shy, context);
  assert.equal(clear.kind, 'question');
  assert.equal(clear.kind, restrained.kind);
  assert(clear.weight > restrained.weight * 1.8);
  const handInput = { action: 'talk', locomotion: 'idle', side: clear.side, carrying: false, gesture: clear } as const;
  assert.deepEqual(handPerformance(handInput), { pose: 'palm-up', blend: clear.weight });
  assert.equal(handPerformance({ ...handInput, side: clear.side === 'left' ? 'right' : 'left' }).pose, 'relaxed');
  assert.equal(handPerformance({ ...handInput, carrying: true, action: 'wave' }).pose, 'grip');
  assert.equal(handPerformance({ ...handInput, side: 'right', action: 'wave', actionWeight: .3 }).blend, .3);
  assert.equal(gestureAt(confident, { ...context, manualGesture: true }).kind, 'rest');
  assert.equal(gestureAt(confident, { ...context, occupiedHands: 'both' }).kind, 'rest');
  assert.notEqual(gestureAt(confident, { ...context, occupiedHands: clear.side }).side, clear.side);
  assert.equal(occupiedHands(confident, true, 'drive'), 'both');
  assert.equal(gestureAt(confident, { ...context, time: 4, speaking: false }).kind, 'rest');
  assert.equal(gestureAt(confident, { ...context, time: 4, speaking: false, listening: true }).kind, 'rest');
  const still = livingPose(confident, context, {}, { ...clear, kind: 'rest', weight: 0 });
  const acting = livingPose(confident, context, {}, clear);
  assert.notEqual(still[`${clear.side}Shoulder`], acting[`${clear.side}Shoulder`]);
});

test('scene evaluation carries one deterministic gesture through scrubbing and silence', () => {
  const source = project.scenes[0];
  const actor = { ...source.actors[0], characterId: confident.id };
  const scene = { ...source, actors: [actor], clips: [{
    id: 'dialogue-fixture', track: 'dialogue' as const, actor: actor.id, asset: 'builtin:sbu-food',
    text: phrase.text, start: phrase.start, length: phrase.duration, offset: 0, volume: 1, muted: false
  }] };
  const characters = new Map([[confident.id, confident]]);
  const sample = (t: number) => evaluate(scene, t, characters).actors[0];
  const first = sample(context.time);
  assert.equal(first.handGesture?.kind, 'question');
  assert.equal(sample(4.5).handGesture?.kind, 'rest');
  sample(2.7);
  assert.deepEqual(sample(context.time), first);
});
