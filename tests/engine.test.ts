import assert from 'node:assert/strict';
import { Graphics, GraphicsPath } from 'pixi.js';
import { illustratedPath } from '../src/engine/illustration.ts';
import { facialPerformance } from '../src/engine/facialAnimation.ts';
import { sampleViseme, textVisemes } from '../src/engine/visemes.ts';
import { footContactAt } from '../src/engine/animation.ts';
import { anchorFor, compatibleObjects, nearestObject, objectDependencies, removeObjectWithDecisions, repairOrphanedObjectActions, replaceWorldObjects } from '../src/engine/interactions.ts';
import { fitCharacterPreview, PREVIEW_FOOT_PADDING, PREVIEW_GROUND_Y, PREVIEW_TOP_PADDING } from '../src/engine/previewLayout.ts';
import { drawActor } from '../src/engine/actorArt.ts';
import test from 'node:test';
import { animations, armIK, blend, rig, sample, skeleton } from '../src/engine/animation.ts';
import { directorJSONSchema, directorSchema } from '../src/engine/directorSchema.ts';
import { evaluate, locate, projectDuration } from '../src/engine/evaluate.ts';
import { characters, makeProject, makeScene, makeProp } from '../src/engine/presets.ts';
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
  const copy = copyClip({ ...voice, start: 24, length: 3 }, 30);
  assert.equal(copy.start, 27);
  assert.equal(copy.length, 3);
  assert.throws(() => copyClip({ ...voice, start: 27, length: 3 }, 30), /make room/);
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


test('all illustrated hair and beard variants render in every camera view with neutral and strong facial expressions', () => {
  for (const style of ['fade', 'puff', 'locs', 'buzz', 'bald', 'afro', 'braids', 'curls'] as const) {
    for (const beard of ['none', 'goatee', 'full'] as const) {
      const character = { ...characters[0], hair: style, beard };
      for (const view of views) {
        for (const expression of ['neutral', 'happy', 'excited', 'smug', 'confused', 'sleepy', 'angry', 'surprised', 'sad', 'thinking'] as const) {
          const body = new Graphics(), face = new Graphics();
          assert.doesNotThrow(() => drawActor(body, face, character, view, {}, expression, .4, undefined, 1.3, 'talk', 'actor-sbu'), style + ' / ' + beard + ' / ' + view + ' / ' + expression);
          assert(face.context.instructions.length > 3);
          body.destroy(); face.destroy();
        }
      }
    }
  }
});

test('facial performances blink, move eyes and mouths, do not synchronize actors, and are reproducible', () => {
  const times = Array.from({ length: 700 }, (_, index) => index * .02);
  const sbu = times.map(time => facialPerformance(time, 'actor-sbu', 'idle', 'neutral'));
  const zee = times.map(time => facialPerformance(time, 'actor-zee', 'idle', 'neutral'));
  assert(sbu.some(face => face.blink > .9), 'Sbu closes eyes');
  assert(sbu.some(face => face.blink === 0), 'Sbu reopens eyes');
  assert(sbu.some((face, index) => Math.abs(face.gazeX - sbu[0].gazeX) > .5 && index > 10), 'gaze moves');
  assert(sbu.some((face, index) => Math.abs(face.blink - zee[index].blink) > .5), 'actors blink independently');
  assert.deepEqual(facialPerformance(2.75, 'actor-zee', 'talk', 'neutral'), facialPerformance(2.75, 'actor-zee', 'talk', 'neutral'));
  // Talk is a gesture, not a time-driven mouth oscillator: audio cues
  // exclusively control the speaking jaw.
  assert.equal(facialPerformance(1.5, 'actor-zee', 'talk', 'neutral').mouthOpen, 0);
  assert(facialPerformance(1.5, 'actor-zee', 'talk', 'neutral', .5, { shape: 'open', weight: 1 }).mouthOpen > .2);
  assert.equal(facialPerformance(1.5, 'actor-zee', 'idle', 'neutral').mouthOpen, 0);
  assert.equal(facialPerformance(1.5, 'actor-zee', 'cry', 'neutral').expression, 'sad');
  assert.equal(facialPerformance(1.5, 'actor-zee', 'laugh', 'neutral').expression, 'happy');
  assert.equal(facialPerformance(1.5, 'actor-zee', 'shrug', 'neutral').expression, 'confused');
  assert.equal(facialPerformance(1.5, 'actor-zee', 'celebrate', 'neutral').expression, 'excited');
});

test('removing furniture preserves independent sitting and supports optional seat reassignment', () => {
  const extra = { id: 'alternate-chair', name: 'Alternative chair', kind: 'chair' as const,
    x: 590, y: 420, scale: 1, rotation: 0, depth: 0, color: '#cc8877' };
  const withChair = { ...scene, objects: [...scene.objects, extra] };
  const deps = objectDependencies(withChair, 'sofa', { 'actor-zee': 'Zee' });
  assert.equal(deps.length, 1);
  assert.equal(deps[0].clip.action, 'sit');
  assert.equal(deps[0].actorName, 'Zee');
  assert(deps[0].alternatives.some(item => item.id === extra.id));
  assert(compatibleObjects(withChair, 'sit').some(item => item.id === 'alternate-chair'));
  assert.equal(nearestObject(withChair, 'actor-zee', 'sit')?.id, 'sofa');

  const withoutSofa = removeObjectWithDecisions(withChair, 'sofa');
  const safeClip = withoutSofa.clips.find(item => item.id === deps[0].clip.id);
  assert.equal(safeClip?.track, 'body');
  assert.equal(safeClip?.track === 'body' && safeClip.action, 'sit');
  assert.equal(safeClip?.track === 'body' && safeClip.target, undefined);
  const stillSitting = evaluate(withoutSofa, 2).actors.find(item => item.id === 'actor-zee')!;
  assert.equal(stillSitting.lift,-49,'Removing a seat must not delete an authored Sit performance');
  const before = evaluate(withChair,2).actors.find(item=>item.id==='actor-zee')!;
  assert.equal(stillSitting.x,before.x,'Sitting never snaps between object anchors');
  assert.equal(stillSitting.y,before.y,'Sitting never floats to the object anchor');
  assert(ProjectDocument.safeParse({ ...demo, scenes: [withoutSofa] }).success);

  const reassigned = removeObjectWithDecisions(withChair, 'sofa', { [deps[0].clip.id]: 'object:alternate-chair' });
  const seated = reassigned.clips.find(item => item.id === deps[0].clip.id);
  assert.equal(seated?.track === 'body' && seated.target, 'alternate-chair');
  assert.equal(seated?.track === 'body' && seated.action, 'sit');
  assert.equal(evaluate(reassigned, 2).actors.find(item => item.id === 'actor-zee')?.lift, -49);
  assert(ProjectDocument.safeParse({ ...demo, scenes: [reassigned] }).success);
});

test('holding props and whole-world replacement never preserve missing targets', () => {
  const cupDependencies = objectDependencies(scene, 'cup');
  assert.equal(cupDependencies.length, 1);
  const withoutCup = removeObjectWithDecisions(scene, 'cup', { [cupDependencies[0].clip.id]: 'action:think' });
  const think = withoutCup.clips.find(item => item.id === cupDependencies[0].clip.id);
  assert(think?.track === 'body' && think.action === 'think');
  assert(think?.track === 'body' && think.target === undefined);
  assert.equal(evaluate(withoutCup, 1.6).actors.find(item => item.id === 'actor-zee')?.held, undefined);
  const newWorld = replaceWorldObjects(scene, makeScene('Classroom').objects);
  assert(newWorld.clips.every(item => item.track !== 'body' || !item.target || newWorld.objects.some(object => object.id === item.target)));
  assert(newWorld.clips.some(item => item.track === 'body' && item.action === 'sit' && !item.target));
  assert(ProjectDocument.safeParse({ ...demo, scenes: [newWorld] }).success);
});

test('unanchored sit clips remain valid and executable during legacy project loading', () => {
  const sit = scene.clips.find(clip => clip.track === 'body' && clip.action === 'sit')!;
  const oldScene = { ...scene, clips: scene.clips.map(clip => clip.id === sit.id ? { ...sit, target: undefined } : clip) };
  const fixed = repairOrphanedObjectActions(oldScene);
  assert(fixed.clips.some(item => item.id === sit.id && item.track === 'body' && item.action === 'sit'));
  assert(ProjectDocument.safeParse({ ...demo, scenes: [fixed] }).success);
  const badFrame = evaluate(oldScene, 2).actors.find(item => item.id === 'actor-zee')!;
  assert.equal(badFrame.lift,-49,'An unanchored Sit animation plays without missing-prop failures');
});


test('object deletion + undo/redo preserves the original object/action graph', () => {
  useStudio.getState().open(demo);
  useStudio.getState().editScene(current => removeObjectWithDecisions(current, 'sofa'));
  const afterDelete = currentScene(useStudio.getState());
  assert.equal(afterDelete.objects.some(item => item.id === 'sofa'), false);
  assert(afterDelete.clips.some(clip => clip.track === 'body' && clip.actor === 'actor-zee' && clip.action === 'sit' && !clip.target));
  useStudio.getState().undo();
  const restored = currentScene(useStudio.getState());
  assert(restored.objects.some(item => item.id === 'sofa'));
  assert(restored.clips.some(clip => clip.track === 'body' && clip.target === 'sofa' && clip.action === 'sit'));
  useStudio.getState().redo();
  assert(!currentScene(useStudio.getState()).objects.some(item => item.id === 'sofa'));
});


test('mouth cue timings follow phoneme families and survive random timeline seeking', () => {
  const cues = textVisemes('Mama sees food! Oh, wow.', 3.4);
  assert(cues.length >= 10);
  assert.equal(cues[0].shape, 'closed');
  assert(cues.some(item => item.shape === 'wide'));
  assert(cues.some(item => item.shape === 'pucker'));
  assert(cues.some(item => item.shape === 'round'));
  assert.equal(cues[0].start, 0);
  assert(Math.abs(cues.at(-1)!.end - 3.4) < .0001);
  assert.deepEqual(textVisemes('Mama sees food! Oh, wow.', 3.4), cues);
  const at = sampleViseme('Mama sees food!', 1.3, .14);
  assert.notEqual(at.shape, 'rest');
  assert.deepEqual(at, sampleViseme('Mama sees food!', 1.3, .14));
  assert.equal(sampleViseme('Hello', 1, 2).shape, 'rest');
  assert.equal(sampleViseme('', 2, 1).weight, 0);
});

test('lip sync is viseme-specific and eye contact overrides wandering pupils', () => {
  const m = facialPerformance(1.1, 'sbu', 'talk', 'neutral', .7, { shape: 'closed', weight: 1 });
  const wide = facialPerformance(1.1, 'sbu', 'talk', 'neutral', .7, { shape: 'wide', weight: 1 });
  assert.equal(m.mouthOpen, 0, 'M/B/P phonemes must close the mouth even with audible audio');
  assert(wide.mouthOpen > .5);
  assert.equal(wide.viseme, 'wide');
  const left = facialPerformance(1.1, 'sbu', 'talk', 'neutral', 0, undefined, { x: -1, y: 0 });
  const right = facialPerformance(1.1, 'sbu', 'talk', 'neutral', 0, undefined, { x: 1, y: 0 });
  assert(left.gazeX < -2);
  assert(right.gazeX > 2);
  const at = evaluate(scene, 9.25);
  const sbu = at.actors.find(item => item.id === 'actor-sbu')!;
  const zee = at.actors.find(item => item.id === 'actor-zee')!;
  assert(sbu.speaking && sbu.viseme);
  assert(zee.focus && Math.abs(zee.focus.x) > .5, 'listener Zee must look towards Sbu, accounting for mirrored local pupils');
  const camera = evaluate({ ...scene, actors: scene.actors.map(item => item.id === 'actor-zee' ? { ...item, gazeTarget: 'camera' } : item) }, 9.25);
  assert.deepEqual(camera.actors.find(item => item.id === 'actor-zee')?.focus, { x: 0, y: -.08 });
});

test('gold tooth layout renders for all faces and every viseme without floating geometry', () => {
  const c = { ...characters[0], goldTeeth: [1, 3, 4] };
  for (const expression of ['neutral', 'happy', 'angry', 'surprised'] as const)
    for (const shape of ['rest', 'closed', 'bite', 'wide', 'open', 'round', 'pucker', 'tongue'] as const) {
      const g = new Graphics(), face = new Graphics();
      assert.doesNotThrow(() => drawActor(g, face, c, 'three-quarter', {}, expression, .7,
        undefined, 1.5, 'talk', 'sbu', true, { shape, weight: 1 }, { x: 1, y: 0 }));
      assert(face.context.instructions.length > 1);
      g.destroy(); face.destroy();
    }
});

test('grounded walk and run have opposite stance legs and airborne recovery arcs', () => {
  for (const type of ['walk', 'run'] as const) {
    const duration = animations[type].duration;
    assert.equal(footContactAt(0, type, 'left').y, 0);
    assert(footContactAt(duration * .79, type, 'left').y < -5);
    assert(footContactAt(duration * .79, type, 'right').planted);
    assert.deepEqual(footContactAt(duration, type, 'left'), footContactAt(0, type, 'left'));
    const g = new Graphics(), face = new Graphics();
    const pose = sample(animations[type], duration * .3);
    assert.doesNotThrow(() => drawActor(g, face, characters[0], 'front', pose.pose, 'neutral', 0,
      undefined, duration * .3, type, 'sbu', false, undefined, undefined, type, pose.lift));
    g.destroy(); face.destroy();
  }
});

test('image worlds and picture props round-trip without losing transparency metadata or interaction types', () => {
  const tiny = 'data:image/webp;base64,UklGRg==';
  const imported = makeProp('image', 400, 430, {
    imageData: tiny, name: 'Uploaded Sofa', imageWidth: 180, imageHeight: 120, interaction: 'sit'
  });
  const modified = { ...scene, backgroundImage: tiny, objects: [...scene.objects, imported] };
  const document = { ...demo, scenes: [modified] };
  assert(ProjectDocument.safeParse(document).success);
  const restored = ProjectDocument.parse(JSON.parse(JSON.stringify(document)));
  assert.equal(restored.scenes[0].backgroundImage, tiny);
  assert.equal(restored.scenes[0].objects.at(-1)?.imageData, tiny);
  assert.equal(anchorFor(imported)?.action, 'sit');
  assert(compatibleObjects(modified, 'sit').some(item => item.id === imported.id));
  const hold = { ...imported, interaction: 'hold' as const };
  assert.equal(anchorFor(hold)?.action, 'hold');
  assert(compatibleObjects({ ...modified, objects: [...scene.objects, hold] }, 'point').some(item => item.id === hold.id));
});

test('deleted props do not leave stale actor eye focus targets', () => {
  const withFocus = { ...scene, actors: scene.actors.map(item => item.id === 'actor-sbu' ? { ...item, gazeTarget: 'sofa' } : item) };
  const valid = runEdit({ ...demo, scenes: [withFocus] }, document => ({ ...document, scenes: [removeEntity(withFocus, 'sofa')] }));
  const actor = valid.scenes[0].actors.find(item => item.id === 'actor-sbu');
  assert.equal(actor?.gazeTarget, undefined);
});


test('Sit at a chosen position never slides to an optional distant chair',()=>{
  const fresh=makeProject(),empty={...fresh.scenes[0],objects:[]};
  const actor={id:'test-sitter',characterId:fresh.characters[0].id,x:715,y:437,scale:1,rotation:0,depth:0,view:'front' as const,expression:'neutral' as const,flip:false};
  const sit={id:'sit-alone',start:2,length:3,track:'body' as const,actor:actor.id,action:'sit' as const,layer:'body' as const};
  const noChair={...empty,actors:[actor],clips:[sit]};
  const near=evaluate(noChair,2.8).actors[0];
  assert.equal(near.action,'sit');
  assert.equal(near.x,715);
  assert.equal(near.y,437);
  assert(ProjectDocument.safeParse({...fresh,scenes:[noChair]}).success);
  const distant={...noChair,objects:[{id:'chair-for-optional-use',name:'Chair',kind:'chair' as const,x:60,y:360,scale:1,rotation:0,depth:0,color:'#b89d88'}],
    clips:[{...sit,target:'chair-for-optional-use'}]};
  const onChair=evaluate(distant,2.8).actors[0];
  assert.equal(onChair.x,715);
  assert.equal(onChair.y,437);
  assert.equal(onChair.action,'sit');
});
