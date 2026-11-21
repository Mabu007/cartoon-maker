import assert from 'node:assert/strict';
import test from 'node:test';
import { gaitLeg, gaitSpeeds, viewForward } from '../src/engine/animation.ts';
import { generateCreative } from '../src/engine/creativeModel.ts';
import { evaluate } from '../src/engine/evaluate.ts';
import { acceptBibleProposal, applyDirectorEdits, directionEdits } from '../src/engine/filmmakerAI.ts';
import { approveScript, compileMovie, fromOutline, makeLine, makeStoryScene, missingRentMovie, reviseScript } from '../src/engine/production.ts';
import { Direction, ProjectDocument, type Clip, type Project } from '../src/engine/schema.ts';
import { useStudio } from '../src/studio.ts';

const speak = async () => ({ asset: 'builtin:zee-safe' as const, seconds: 1.5 });
function approved(project = missingRentMovie()): Project {
  return { ...project, production: approveScript(project.production!) };
}
function rewrite(project: Project, sceneIndex: number, fn: (scene: NonNullable<Project['production']>['screenplay']['scenes'][number]) => NonNullable<Project['production']>['screenplay']['scenes'][number]) {
  const production = project.production!;
  return { ...project, production: approveScript(reviseScript(production, production.screenplay.scenes.map((scene, index) => index === sceneIndex ? fn(scene) : scene))) };
}

test('knees and toes point with the gait and running covers the same distance faster', async () => {
  const move = { kind: 'move', actor: 'sbu', x: 420, gait: 'walk', seconds: 1, delay: 0, parallel: false } as const;
  const make = (gait: 'walk' | 'run') => rewrite(approved(), 0, scene => ({ ...scene, elements: [scene.elements[0], makeLine('action', 'Travel across the room.', [{ ...move, gait }])] }));
  const walking = await compileMovie(make('walk'), speak);
  const running = await compileMovie(make('run'), speak);
  const [walk, run] = [walking, running].map(project => project.scenes[0].clips.find(clip => clip.track === 'movement')!);
  assert.ok(run.length < walk.length / 2);
  assert.equal(walk.toX, run.toX);
  assert.equal(run.length, Math.round(210 / gaitSpeeds.run * 1000) / 1000);
  for (const view of ['side', 'three-quarter', 'back-quarter'] as const) {
    const forward = viewForward(view);
    const [knee, foot] = gaitLeg({ x: 0, y: -76 }, 1, .77, 'walk', 'left', forward, 0);
    assert.ok((knee.x - foot.x) * forward > 0);
    for (const direction of [-1, 1]) {
      const scene = running.scenes[0];
      const actor = { ...scene.actors[0], view };
      const travel = { ...run, fromX: 420, toX: 420 + direction * 210 };
      const frame = evaluate({ ...scene, actors: [actor], clips: [travel] }, travel.start + .2);
      assert.equal(viewForward(frame.actors[0].view) * (frame.actors[0].flip ? -1 : 1), direction);
    }
  }
});

test('screenplay approval is separate from timeline compilation and every generated clip maps to a stable script element', async () => {
  const draft = missingRentMovie();
  assert.equal(draft.scenes[0].clips.length, 0);
  await assert.rejects(compileMovie(draft, speak), /Approve/);
  const compiled = await compileMovie(approved(draft), speak);
  const record = compiled.production!.graph[0];
  const script = compiled.production!.screenplay.scenes[0];
  assert.ok(compiled.scenes[0].clips.length > 12);
  assert.equal(record.diagnostics.length, 0, record.diagnostics.join('\n'));
  assert.ok(compiled.scenes[0].clips.every(clip => script.elements.some(line => line.id === record.events[clip.id].line)));
  assert.deepEqual(await compileMovie(compiled, () => Promise.reject(new Error('Voice should be reused'))), compiled);
  assert.deepEqual(ProjectDocument.parse(JSON.parse(JSON.stringify(compiled))), compiled);
});

test('a reviewed director edit changes the targeted dialogue scene, reuses unmodified speech, and preserves a manual gesture', async () => {
  const project = approved();
  const production = project.production!;
  const next = fromOutline(makeStoryScene('Another room', ['sbu']));
  next.elements[1] = { ...makeLine('dialogue', 'One other line.'), characterId: 'sbu' };
  production.screenplay.scenes.push(next);
  const first = await compileMovie(project, speak);
  const scene = first.scenes[0];
  const actor = scene.actors.find(item => item.characterId === 'zee')!;
  const override: Clip = { id: 'manual-wave', track: 'body', action: 'wave', actor: actor.id, layer: 'gesture', start: .5, length: 1 };
  first.scenes[0] = { ...scene, clips: [...scene.clips, override] };
  const old = first.production!.screenplay.scenes[0].elements.find(line => line.type === 'dialogue' && line.characterId === 'zee')!;
  const adjusted = { ...old, text: 'Let me think about that.', directions: [
    Direction.parse({ kind: 'gaze', actor: 'zee', target: 'door', parallel: true, seconds: 1.8 }),
    Direction.parse({ kind: 'pause', seconds: 2 })
  ] };
  const result = directionEdits.parse({ message: 'Give Zee time to glance at the door.', edits: [{ op: 'replace', lineId: old.id, element: { type: adjusted.type, text: adjusted.text, characterId: adjusted.characterId, directions: adjusted.directions } }] });
  const modified = rewrite(first, 0, source => applyDirectorEdits(source, result, () => 'new'));
  let requests = 0;
  const updated = await compileMovie(modified, async () => { requests++; return speak(); });
  assert.equal(requests, 1);
  const newScene = updated.scenes[0];
  assert.deepEqual(newScene.clips.find(clip => clip.id === override.id), override);
  assert.deepEqual(updated.scenes[1], first.scenes[1]);
  const lineClip = newScene.clips.find(clip => clip.track === 'dialogue' && clip.text === adjusted.text)!;
  const gaze = newScene.clips.find(clip => clip.track === 'gaze' && clip.actor === actor.id)!;
  assert.equal(lineClip.id, scene.clips.find(clip => clip.track === 'dialogue' && clip.text === old.text)?.id);
  assert.ok(Math.abs(lineClip.start - gaze.start - 2) < .001);
  assert.equal(evaluate(newScene, gaze.start + .1).actors.find(a => a.id === actor.id)?.gazeTarget, 'door');
});

test('inherited scene state keeps movement, visibility, and a held prop across shots until released', async () => {
  const project = approved();
  const source = fromOutline(makeStoryScene('First', ['sbu']));
  source.elements[1] = makeLine('action', 'Pick up the cup and run to the door.', [
    Direction.parse({ kind: 'prop', actor: 'sbu', target: 'cup', interaction: 'equip' }),
    Direction.parse({ kind: 'move', actor: 'sbu', x: 130, gait: 'run' })
  ]);
  const second = fromOutline(makeStoryScene('Next shot', ['sbu']));
  second.continues = true;
  second.elements[1] = makeLine('action', 'Set the cup down.', [
    Direction.parse({ kind: 'prop', actor: 'sbu', target: 'cup', interaction: 'release', delay: 2 })
  ]);
  const movie = { ...project, production: approveScript(reviseScript(project.production!, [source, second])) };
  const render = await compileMovie(movie, speak);
  assert.equal(evaluate(render.scenes[0], render.scenes[0].duration).actors[0].held?.id, 'cup');
  assert.equal(evaluate(render.scenes[1], 1).actors[0].held?.id, 'cup');
  assert.equal(evaluate(render.scenes[1], 1).actors[0].x, 130);
  assert.equal(evaluate(render.scenes[1], 2.4).actors[0].held, undefined);
  assert.equal(evaluate(render.scenes[1], 2.4).objects.find(item => item.id === 'cup')?.x, 172);
});

test('missing assets, impossible overlapping actions, invalid AI JSON and stale edit targets are handled', async () => {
  const project = rewrite(approved(), 0, source => ({ ...source, elements: [source.elements[0], makeLine('action', 'Test directions', [
    Direction.parse({ kind: 'gaze', actor: 'sbu', target: 'missing', parallel: true }),
    Direction.parse({ kind: 'action', actor: 'sbu', action: 'sit', layer: 'body' }),
    Direction.parse({ kind: 'action', actor: 'sbu', action: 'jump', layer: 'body', seconds: 2, parallel: true }),
    Direction.parse({ kind: 'action', actor: 'sbu', action: 'stand', layer: 'body', seconds: 2, parallel: true })
  ])] }));
  const compiled = await compileMovie(project, speak);
  const diagnostics = compiled.production!.graph[0].diagnostics.join('\n');
  assert.match(diagnostics, /Gaze target missing/);
  assert.doesNotMatch(diagnostics, /chair or sofa/,'Sitting no longer needs furniture');
  assert.match(diagnostics, /Overlapping body/);
  assert.equal(directionEdits.safeParse({ message: 'Wrong tool', edits: [{ op: 'run_code' }] }).success, false);
  assert.throws(() => applyDirectorEdits(project.production!.screenplay.scenes[0], { message: 'Wrong scene', edits: [{ op: 'remove', lineId: 'foreign-id' }] }, () => 'id'), /outside/);
});

test('locked creative decisions are preserved and failed speech leaves the original draft recoverable', async () => {
  const project = approved();
  const bible = project.production!.bible;
  bible.status = 'locked';
  bible.scenes[0].status = 'locked';
  const proposal = structuredClone(bible);
  proposal.profile.title = 'Overwrite';
  proposal.scenes[0].summary = 'Overwrite';
  const accepted = acceptBibleProposal(bible, proposal);
  assert.equal(accepted.profile.title, bible.profile.title);
  assert.equal(accepted.scenes[0].summary, bible.scenes[0].summary);
  const copy = structuredClone(project);
  await assert.rejects(compileMovie(project, () => Promise.reject(new Error('Voice offline'))), /Voice offline/);
  assert.deepEqual(project, copy);
  const recover = await compileMovie(project, speak);
  useStudio.getState().open(project, true);
  useStudio.getState().edit(() => recover);
  useStudio.getState().undo();
  assert.equal(useStudio.getState().project.production!.graph.length, 0);
  useStudio.getState().redo();
  assert.equal(useStudio.getState().project.production!.graph.length, 1);
});


test('creative model responses are schema validated and retried at most once', async () => {
  let calls = 0;
  const result = await generateCreative('direct', { async complete(input) {
    assert.match(input.system, /typed replacements/);
    calls++;
    return calls === 1 ? '{"message":"bad","edits":[{"op":"unknown"}]}' : '{"message":"No edit required.","edits":[]}';
  } }, 'test-model', { scene: 'sample' });
  assert.deepEqual(result, { message: 'No edit required.', edits: [] });
  assert.equal(calls, 2);
  await assert.rejects(generateCreative('direct', { async complete() { return 'invalid'; } }, 'test-model', {}), /valid structured/);
});

test('autosaved versions reopen with script and graph intact and damaged snapshots are skipped', async () => {
  const { listLocal, saveLocal } = await import('../src/services/projects.ts');
  const storage = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }
  });
  try {
    const project = await compileMovie(approved(), speak);
    saveLocal('test', project, 29);
    const key = 'toonroom.projects.v1.test';
    const entries = JSON.parse(storage.get(key)!);
    storage.set(key, JSON.stringify([...entries, { updated: 30, project: { version: 999 } }]));
    assert.deepEqual(listLocal('test'), [{ updated: 29, project }]);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});


test('recompilation preserves manual recordings and clears mouth cues when a line gets new audio', async () => {
  const first = await compileMovie(approved(), speak);
  const scene = first.scenes[0];
  const line = scene.clips.find(clip => clip.track === 'dialogue')!;
  assert.equal(line.track, 'dialogue');
  if (line.track !== 'dialogue') throw new Error('Expected dialogue');
  const replacement = { ...line, asset: 'asset:manual-recording', text: 'My take', offset: .2,
    visemes: [{ start: .2, end: 1, shape: 'open' as const }] };
  first.scenes[0] = { ...scene, clips: scene.clips.map(clip => clip.id === line.id ? replacement : clip) };
  const fresh = rewrite(first, 0, source => ({ ...source, title: source.title + ' alternate' }));
  const recompiled = await compileMovie(fresh, () => Promise.reject(new Error('Reuse the recording')));
  assert.deepEqual(recompiled.scenes[0].clips.find(clip => clip.id === line.id), replacement);
  const sourceLine = first.production!.graph[0].events[line.id].line;
  const edited = rewrite(recompiled, 0, source => ({ ...source, elements: source.elements.map(element =>
    element.id === sourceLine ? { ...element, text: 'A new spoken line' } : element) }));
  const rendered = await compileMovie(edited, async () => ({ asset: 'asset:new-recording', seconds: line.length }));
  const updated = rendered.scenes[0].clips.find(clip => clip.id === line.id)!;
  assert.equal(updated.track, 'dialogue');
  if (updated.track !== 'dialogue') throw new Error('Expected dialogue');
  assert.equal(updated.asset, 'asset:new-recording');
  assert.equal(updated.offset, 0);
  assert.equal(updated.visemes, undefined);
});

test('long alignment stays on the dialogue and fits the screenplay edit history', async () => {
  const visemes = Array.from({length: 95}, (_, i) => ({start:i/100, end:(i+1)/100, shape:'open' as const}));
  const movie = await compileMovie(approved(), async () => ({...await speak(), visemes}));
  const line = movie.scenes[0].clips.find(c => c.track === 'dialogue')!;
  assert.deepEqual(line.visemes, visemes);
  const signature = movie.production!.graph[0].events[line.id].signature;
  assert.ok(signature.length < 2500);
  assert.equal(JSON.parse(signature).asset, line.asset);
});
