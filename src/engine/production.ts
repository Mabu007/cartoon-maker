import { normalizeCameraTimeline, cameraConflicts } from './cameraTimeline.ts';
import { gaitSpeeds } from './animation.ts';
import { evaluate } from './evaluate.ts';
import { anchorFor } from './interactions.ts';
import { makeProject, makeScene } from './presets.ts';
import { ProjectDocument, TimelineClip, uid, type ActorData, type Clip, type DirectionData, type Production, type Project, type Scene, type ScriptLine, type ScriptSceneData, type StoryScene } from './schema.ts';

type GraphScene = Production['graph'][number];
type Dialogue = Extract<Clip, { track: 'dialogue' }>;
type Voice = Production['bible']['characters'][number]['voice'];
type Speech = (text: string, voice: Voice) => Promise<{ asset: Dialogue['asset']; seconds: number;
  visemes?: Dialogue['visemes']; lipSync?: Dialogue['lipSync'] }>;
type Continuity = {
  actors: Record<string, Pick<ActorData, 'x' | 'y' | 'view' | 'flip'> & { held?: string; visible: boolean }>;
  objects: Record<string, { x: number; y: number }>;
};

export const makeLine = (type: ScriptLine['type'], text = '', directions: DirectionData[] = []): ScriptLine =>
  ({ id: uid(), type, text, directions: directions.map(cue => ({ ...cue, id: cue.id ?? uid() })) });

export const makeStoryScene = (title: string, cast: string[] = []): StoryScene => ({
  id: uid(), title, location: 'Living room', environment: 'Living room', cast, summary: '',
  purpose: '', seconds: 30, continuity: '', requirements: '', act: '', sequence: '', status: 'proposed'
});

export function startProduction(project: Project): Production {
  return {
    bible: {
      profile: { title: project.name, logline: '', synopsis: '', genre: '', tone: '', theme: '', audience: '', visualStyle: '', targetMinutes: 5 },
      status: 'proposed',
      characters: [],
      worlds: [],
      scenes: []
    },
    screenplay: { scenes: [] }, scriptStatus: 'draft', versions: [], conversation: [], graph: []
  };
}

export function fromOutline(scene: StoryScene): ScriptSceneData {
  return {
    id: scene.id, title: scene.title, environment: scene.environment, cast: scene.cast, continues: false,
    elements: [makeLine('scene-heading', `INT. ${(scene.location || scene.environment).toUpperCase()} - DAY`),
      makeLine('action', scene.summary.slice(0, 400))]
  };
}

export function reviseScript(production: Production, scenes: ScriptSceneData[]): Production {
  return { ...production, screenplay: { scenes }, scriptStatus: 'draft' };
}

export function approveScript(production: Production): Production {
  if (!production.screenplay.scenes.length) throw new Error('Write a scene before approving the screenplay.');
  return { ...production, scriptStatus: 'approved', versions: [...production.versions.slice(-2), {
    id: uid(), date: Date.now(), screenplay: production.screenplay
  }] };
}

// Including the input length and two independent accumulators keeps fingerprints
// compact enough to save with large timelines and stable across runtimes.
export function fingerprint(value: unknown) {
  const input = JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a === b ? 0 : 1));
  });
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < input.length; i++) {
    a = Math.imul(a ^ input.charCodeAt(i), 16777619);
    b = Math.imul(b ^ input.charCodeAt(i), 1597334677);
  }
  return `${input.length}:${a >>> 0}:${b >>> 0}`;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const eventId = (lineId: string, slot: string | number) => `cue-${fingerprint(lineId)}-${slot}`;
function keyOf(clip: Clip) {
  // The graph identifies authored timing and the recording. Derived cues and
  // voice history already live on the canonical clip and can be much larger.
  if (clip.track === 'dialogue') {
    const {visemes, lipSync, versions, ...source} = clip;
    return JSON.stringify(TimelineClip.parse(source));
  }
  return JSON.stringify(TimelineClip.parse(clip));
}
const overlaps = (a: Clip, b: Clip) => a.start < b.start + b.length - .001 && b.start < a.start + a.length - .001;
const lane = (clip: Clip) => [clip.track, 'actor' in clip ? clip.actor : '', clip.track === 'body' ? clip.layer : ''].join(':');
const exclusive = new Set<Clip['track']>(['movement', 'body', 'face', 'gaze', 'dialogue', 'camera', 'transition']);

function exitOf(scene: Scene): Continuity {
  const frame = evaluate(scene, scene.duration);
  return {
    actors: Object.fromEntries(frame.actors.map(actor => [actor.characterId, {
      x: round(actor.x), y: round(actor.y), view: actor.view, flip: actor.flip, visible: actor.visible, ...(actor.held ? { held: actor.held.id } : {})
    }])),
    objects: Object.fromEntries(frame.objects.map(({ id, x, y }) => [id, { x: round(x), y: round(y) }]))
  };
}

function sceneSetup(project: Project, source: ScriptSceneData, previous: Scene | undefined, continuity: Continuity, issues: string[]): Scene {
  const existing = project.scenes.find(scene => scene.id === source.id);
  const world = source.setsFrom && project.scenes.find(scene => scene.id === source.setsFrom);
  const inherited = source.continues && previous?.environment === source.environment ? previous : undefined;
  const preset = makeScene(source.environment);
  if (source.setsFrom && !world) issues.push('The linked world is missing. Using the environment preset.');
  if (source.continues && !inherited) issues.push('Continuity needs a preceding scene in the same environment.');
  const set = world || (existing?.environment === source.environment ? existing : inherited) || preset;
  const layout = set === preset ? preset.objects.map((object, index) => ({ ...object, id: preset.objects.findIndex(item => item.kind === object.kind) === index ? object.kind : `${object.kind}-${index + 1}` })) : set.objects;
  const objects = inherited && !world ? layout.map(object => ({ ...object, ...continuity.objects[object.id] })) : layout;
  const actors = (existing?.actors ?? []).filter(actor => actor.id !== `cast-${fingerprint(actor.characterId)}` || source.cast.includes(actor.characterId));
  for (const [index, characterId] of [...new Set(source.cast)].entries()) {
    if (!project.characters.some(character => character.id === characterId)) { issues.push(`Missing character ${characterId}. Replace it using the Cast panel.`); continue; }
    const last = inherited && continuity.actors[characterId];
    const found = actors.find(actor => actor.characterId === characterId);
    const position = last ? { x: last.x, y: last.y, view: last.view, flip: last.flip } : undefined;
    if (found && position) actors[actors.indexOf(found)] = { ...found, ...position };
    if (!found) actors.push({
      id: `cast-${fingerprint(characterId)}`, characterId, x: 210 + index % 5 * 135, y: 453 + Math.floor(index / 5) * 13,
      view: 'three-quarter', flip: index % 2 === 1, scale: 1, depth: 0, rotation: 0, expression: 'neutral', ...position
    });
  }
  return {
    id: source.id, name: source.title.slice(0, 70), environment: source.environment,
    ...(set.backgroundImage ? { backgroundImage: set.backgroundImage } : {}), actors, objects, clips: [], duration: 1
  };
}

async function compileScene(project: Project, source: ScriptSceneData, previous: Scene | undefined, continuity: Continuity,
  signature: string, entry: string, record: GraphScene | undefined, speak: Speech) {
  const old = project.scenes.find(scene => scene.id === source.id);
  const diagnostics: string[] = [];
  const scene = sceneSetup(project, source, previous, continuity, diagnostics);
  const sources: GraphScene['events'] = {};
  const manual = (old?.clips ?? []).filter(clip => !record?.events[clip.id]);
  const existingClips = new Map(old?.clips.map(clip => [clip.id, clip]));
  const generated: Clip[] = [];
  const actorById = (id: string) => scene.actors.find(actor => actor.characterId === id || actor.id === id);
  const objectById = (id: string) => scene.objects.find(object => object.id === id);
  const locks = new Set(record?.locked ?? []);
  const positions = new Map(scene.actors.map(actor => [actor.id, { x: actor.x, y: actor.y }]));
  const held = new Map<string, string>();
  let currentShot: string | undefined;
  let beat = source.elements[0].id;
  let cursor = 0;
  let speaker: string | undefined;
  const issue = (line: ScriptLine, message: string) => diagnostics.push(`${line.text.slice(0, 55) || source.title} — ${message}`.slice(0, 500));
  function schedule(clip: Clip, line: ScriptLine) {
    if (!Number.isFinite(clip.start + clip.length) || clip.start + clip.length > 180) { issue(line, 'The scene exceeds 180 seconds. Split the scene.'); return undefined; }
    const oldSource = record?.events[clip.id], oldClip = existingClips.get(clip.id);
    if (oldSource && !oldClip) {
      sources[clip.id] = oldSource;
      if (oldSource.signature !== keyOf(clip)) issue(line, 'A manual deletion overrides this cue.');
      return undefined;
    }
    const overridden = oldClip && oldSource && (locks.has(clip.id) || oldSource.signature !== keyOf(oldClip));
    let result = clip;
    if (overridden) {
      if (keyOf(clip) !== oldSource.signature && (clip.track !== 'dialogue' || locks.has(clip.id))) issue(line, 'A manual timeline edit overrides the new timing or direction.');
      result = oldClip;
      if (clip.track === 'dialogue' && oldClip.track === 'dialogue' && !locks.has(clip.id)) {
        const original = JSON.parse(oldSource.signature) as Dialogue;
        const sameRecording = clip.asset === oldClip.asset && clip.text === original.text;
        const { visemes, lipSync, ...previous } = oldClip;
        const cues = sameRecording ? visemes : clip.visemes;
        const alignment = sameRecording ? lipSync : clip.lipSync;
        result = { ...previous, text: sameRecording ? oldClip.text : clip.text, asset: clip.asset,
          offset: sameRecording ? oldClip.offset : 0,
          length: oldClip.length === original.length ? clip.length : oldClip.length,
          ...(cues ? {visemes: cues} : {}), ...(alignment ? {lipSync: alignment} : {}) };
      }
    }
    if (exclusive.has(result.track) && [...generated, ...manual].some(prev => lane(prev) === lane(result) && overlaps(prev, result))) {
      issue(line, `Overlapping ${result.track} cues. Adjust the delay or clip timing.`);
      if (!overridden) return undefined;
    }
    if (generated.length + manual.length >= 600) { issue(line, 'The scene has reached 600 timeline cues. Split the scene.'); return undefined; }
    sources[result.id] = { line: line.id, beat, ...(currentShot ? { shot: currentShot } : {}), signature: keyOf(clip) };
    generated.push(result);
    return result;
  }
  for (const actor of scene.actors) {
    const inherited = source.continues && previous?.environment === source.environment ? continuity.actors[actor.characterId] : undefined;
    if (!inherited) continue;
    const line = source.elements[0];
    if (!inherited.visible) schedule({ id: eventId(line.id, `presence-${actor.id}`), track: 'actors', actor: actor.id, start: 0, length: .1, visible: false }, line);
    if (inherited.held && objectById(inherited.held)) {
      held.set(inherited.held, actor.id);
      schedule({ id: eventId(line.id, `hold-${actor.id}`), track: 'props', actor: actor.id, target: inherited.held, start: 0, length: .1, interaction: 'equip', inherited:true }, line);
    }
  }
  for (const line of source.elements) {
    if (line.type === 'action' || line.type === 'section' || line.type === 'scene-heading') beat = line.id;
    if (line.type === 'character') speaker = line.characterId ?? project.characters.find(character => character.name.toLowerCase() === line.text.trim().toLowerCase())?.id;
    const onset = cursor;
    let end = cursor;
    const slots = new Map<string, number>();
    for (const direction of line.directions) {
      let start = round((direction.parallel ? onset : end) + direction.delay);
      let length = direction.seconds;
      const key = direction.id ?? direction.kind + ('actor' in direction ? ':' + direction.actor : '');
      const duplicate = slots.get(key) ?? 0;
      slots.set(key, duplicate + 1);
      const id = eventId(line.id, fingerprint([key, duplicate]));
      const actor = 'actor' in direction && direction.actor ? actorById(direction.actor) : undefined;
      if ('actor' in direction && direction.actor && !actor) { issue(line, `Cast member ${direction.actor} is missing from this scene.`); continue; }
      const base = { id, start, length };
      const performer = { actor: actor?.id ?? '' };
      let clip: Clip | undefined;
      switch (direction.kind) {
        case 'move': {
          const from = positions.get(performer.actor)!;
          const toY = direction.y ?? from.y;
          length = Math.max(.1, round(Math.hypot(direction.x - from.x, toY - from.y) / (gaitSpeeds[direction.gait] * (actor?.scale ?? 1))));
          clip = { ...base, ...performer, length, track: 'movement', fromX: from.x, fromY: from.y, toX: direction.x, toY, gait: direction.gait };
          break;
        }
        case 'action': {
          const target = direction.target ? objectById(direction.target) : undefined;
          if ((direction.target && !target) || (direction.action === 'sit' && target && anchorFor(target)?.action !== 'sit')) {
            issue(line, `Missing or incompatible interaction prop ${direction.target}.`);
            continue;
          }
          clip = { ...base, ...performer, track: 'body', action: direction.action, layer: direction.layer, ...(target ? { target: target.id } : {}) };
          break;
        }
        case 'expression': clip = { ...base, ...performer, track: 'face', expression: direction.expression }; break;
        case 'gaze': {
          const target = actorById(direction.target)?.id ?? objectById(direction.target)?.id ?? (direction.target === 'camera' ? 'camera' : undefined);
          if (!target) { issue(line, `Gaze target ${direction.target} is missing.`); continue; }
          clip = { ...base, ...performer, track: 'gaze', target };
          break;
        }
        case 'prop': {
          const target = objectById(direction.target);
          if (!target || anchorFor(target)?.action !== 'hold') { issue(line, `Prop ${direction.target} is missing or cannot be held.`); continue; }
          if (direction.interaction === 'equip' && [...held.values()].includes(performer.actor)) { issue(line, 'The character is already holding a prop. Release it first.'); continue; }
          if (held.get(target.id) !== (direction.interaction === 'release' ? performer.actor : undefined)) { issue(line, 'Prop ownership conflicts with this cue. Check the preceding pickup or release.'); continue; }
          if(direction.interaction==='equip'&&actor){
            const from=positions.get(actor.id)??{x:actor.x,y:actor.y};
            const distance=Math.abs(from.x-target.x);
            const limit=95*actor.scale;
            if(Math.abs(from.y-target.y)>100*actor.scale){
              issue(line,'Move this prop closer vertically before the character can reach it.');
              continue;
            }
            if(distance>limit){
              // Screenplay directions may request an object before the actor
              // has approached it. Insert a walk to arm's-reach rather than
              // teleporting it through the scene or silently failing.
              const sign=Math.sign(target.x-from.x)||1;
              const nearX=target.x-sign*Math.min(75*actor.scale,limit*.8);
              const seconds=Math.max(.1,round(Math.abs(nearX-from.x)/
                (gaitSpeeds.walk*actor.scale)));
              const approach:Clip={
                id:eventId(line.id,'approach-'+id),track:'movement',
                actor:actor.id,start,length:seconds,
                fromX:from.x,fromY:from.y,toX:nearX,toY:from.y,
                gait:'walk'
              };
              if(!schedule(approach,line)){
                issue(line,'Walk closer to '+target.name+' before picking it up.');
                continue;
              }
              positions.set(actor.id,{x:nearX,y:from.y});
              start=round(start+seconds);
            }
          }
          clip = { ...base, start, ...performer, track: 'props',
            target: target.id, interaction: direction.interaction };
          break;
        }
        case 'presence': clip = { ...base, ...performer, track: 'actors', visible: direction.visible }; break;
        case 'camera': {
          currentShot = id;
          clip = { ...base, track: 'camera', shot: direction.shot, ...(actor ? { focus: actor.id } : {}), transition: direction.transition };
          break;
        }
        case 'sound': clip = { ...base, track: 'audio', asset: `builtin:${direction.sound}`, name: direction.sound, muted: false, volume: .6, offset: 0 }; break;
        case 'transition':
          if (direction.effect === 'dissolve') { issue(line, 'Dissolve is unavailable. Choose fade-in or fade-out.'); continue; }
          clip = { ...base, track: 'transition', effect: direction.effect }; break;
        case 'pause': break;
      }
      if (clip) {
        const applied = schedule(clip, line);
        if (applied?.track === 'movement') positions.set(applied.actor, { x: applied.toX, y: applied.toY });
        if (applied?.track === 'props') {
          if (applied.interaction === 'equip') held.set(applied.target, applied.actor);
          else held.delete(applied.target);
        }
      }
      // Parallel performance cues can continue beneath dialogue and subsequent beats.
      if (!direction.parallel || direction.kind === 'pause') end = Math.max(end, start + length);
    }
    if (line.type === 'dialogue' && line.text.trim()) {
      const actor = actorById(line.characterId ?? speaker ?? '');
      if (!actor) { issue(line, 'Dialogue needs a speaker from the scene cast.'); continue; }
      const voice = project.characters.find(character => character.id === actor.characterId)?.voicePreset
        ?? project.production!.bible.characters.find(character => character.characterId === actor.characterId)?.voice
        ?? (actor.characterId === 'zee' ? 'bright' : 'deep');
      const id = eventId(line.id, 'voice');
      const prior = existingClips.get(id);
      const priorSignature = record?.events[id]?.signature;
      const priorSource = priorSignature ? JSON.parse(priorSignature) as Dialogue : undefined;
      const unchanged = prior?.track === 'dialogue' && priorSource?.text === line.text && priorSource.actor === actor.id
        && record?.events[id]?.voice === voice;
      let sound: Awaited<ReturnType<Speech>>;
      if (unchanged && prior?.track==='dialogue' && priorSource)
        sound = {asset:prior.asset,seconds:priorSource.length,
          ...(prior.visemes?{visemes:prior.visemes}:{}),
          ...(prior.lipSync?{lipSync:prior.lipSync}:{})};
      else {
        try { sound = await speak(line.text, voice); }
        catch (error) { throw new Error(`Voice generation failed for “${line.text.slice(0, 48)}”. ${error instanceof Error ? error.message : ''}`); }
      }
      // Voice is part of the source signature, without adding engine-only metadata to the clip.
      const clip: Dialogue = { id, start: round(end), length: Math.max(.1, round(sound.seconds)), track: 'dialogue',
        actor: actor.id, text: line.text, asset: sound.asset, offset: 0, volume: 1, muted: false, voicePreset:voice,
        ...(sound.visemes?{visemes:sound.visemes}:{}),
        ...(sound.lipSync?{lipSync:sound.lipSync}:{}) };
      const applied = schedule(clip, line);
      if (applied) {
        end = Math.max(end, applied.start + applied.length + .18);
        sources[id].voice = voice;
      }
    }
    if (line.type === 'action' && line.text.trim() && !line.directions.length)
      issue(line, 'Action text has no animation direction. Add a cue in the direction inspector.');
    cursor = Math.min(180, round(end));
  }
  for (const [id, sourceEvent] of Object.entries(record?.events ?? {})) {
    const prior = existingClips.get(id);
    if (!sources[id] && prior && (locks.has(id) || sourceEvent.signature !== keyOf(prior))) {
      generated.push(prior);
      sources[id] = sourceEvent;
      diagnostics.push('A removed screenplay cue has a manual override. Its timeline clip was preserved.');
    }
  }
  const validClips = [...manual, ...generated].filter(clip => {
    const target = 'target' in clip && clip.target;
    const valid = (!('actor' in clip) || scene.actors.some(actor => actor.id === clip.actor))
      && (clip.track !== 'camera' || !clip.focus || scene.actors.some(actor => actor.id === clip.focus))
      && (!target || Boolean(objectById(target)) || clip.track === 'gaze' && (target === 'camera' || Boolean(actorById(target))));
    if (!valid) diagnostics.push('A timeline cue refers to a removed asset and was excluded from playback.');
    return valid;
  });
  scene.clips = validClips;
  if (cameraConflicts(scene.clips).length) {
    // Legacy/manual camera overrides must never produce two simultaneous images.
    // Later authored cues take precedence, retaining uncovered earlier footage.
    scene.clips = normalizeCameraTimeline(scene).clips;
    diagnostics.push('Overlapping camera overrides were consolidated into a single camera track.');
  }
  if (!scene.clips.some(clip => clip.track === 'camera') && scene.clips.length < 600) {
    const line = source.elements[0];
    const id = eventId(line.id, 'wide');
    schedule({ id, start: 0, length: Math.max(1, cursor), track: 'camera', shot: 'wide', transition: 'cut' }, line);
    const camera = generated.find(clip => clip.id === id);
    if (camera) scene.clips.push(camera);
  }
  scene.duration = Math.min(180, Math.max(1, cursor, ...scene.clips.map(clip => clip.start + clip.length)));
  return { scene, diagnostics: diagnostics.slice(0, 150), events: sources, locked: [...locks], signature, entry, sceneId: source.id, exit: JSON.stringify(exitOf(scene)) };
}

export async function compileMovie(project: Project, speak: Speech): Promise<Project> {
  const production = project.production;
  if (!production?.screenplay.scenes.length) throw new Error('Write a scene before generating a cartoon.');
  if (production.scriptStatus !== 'approved') throw new Error('Approve this screenplay revision before compiling.');
  const scenes: Scene[] = [];
  const graph: GraphScene[] = [];
  const actors = production.bible.characters.map(character => [character.characterId, character.voice]);
  const ids = new Set(production.screenplay.scenes.map(scene => scene.id));
  for (const source of production.screenplay.scenes) {
    const existing = project.scenes.find(scene => scene.id === source.id);
    const previous = scenes.at(-1);
    const continuity = source.continues && previous?.environment === source.environment ? exitOf(previous) : { actors: {}, objects: {} };
    const entry = fingerprint(continuity);
    const set = source.setsFrom ? project.scenes.find(scene => scene.id === source.setsFrom) : undefined;
    const signature = fingerprint([source, actors.filter(([id]) => source.cast.includes(id)), project.characters.filter(character => source.cast.includes(character.id)).map(character => [character.id, character.voicePreset]),
      set ? [set.objects, set.backgroundImage] : null]);
    const record = production.graph.find(scene => scene.sceneId === source.id);
    if (existing && record?.signature === signature && record.entry === entry) {
      scenes.push(existing);
      graph.push({ ...record, exit: JSON.stringify(exitOf(existing)) });
    } else {
      const { scene, ...compiled } = await compileScene(project, source, previous, continuity, signature, entry, record, speak);
      scenes.push(scene);
      graph.push(compiled);
    }
  }
  const extras = project.scenes.filter(scene => {
    if (ids.has(scene.id)) return false;
    const old = production.graph.find(item => item.sceneId === scene.id);
    if (!old) {
      const layout = (value: Scene) => value.objects.map(({ id: _, ...prop }) => prop);
      return Boolean(scene.actors.length || scene.clips.length || scene.backgroundImage || scene.name !== scene.environment ||
        fingerprint(layout(scene)) !== fingerprint(layout(makeScene(scene.environment))) || production.screenplay.scenes.some(source => source.setsFrom === scene.id));
    }
    return scene.clips.some(clip => old.events[clip.id]?.signature !== keyOf(clip)) || old.locked.length > 0;
  });
  return ProjectDocument.parse({ ...project, name: production.bible.profile.title,
    scenes: [...scenes, ...extras], production: { ...production, graph } });
}

export function missingRentMovie(): Project {
  const project = makeProject();
  project.name = 'The Missing Rent Money';
  const production = startProduction(project);
  production.bible.status = 'approved';
  Object.assign(production.bible.profile, {
    logline: 'Two Soweto flatmates have until sunset to replace their landlord’s rent money.',
    synopsis: 'Sbu discovers that Zee used the rent envelope to buy stock for a food stall. They race to sell enough plates before the landlord arrives and learn that an honest pitch works better than a cover story.',
    genre: 'Kasi comedy', tone: 'Fast, affectionate and awkward', theme: 'Accountability between friends',
    audience: 'Teen and adult', visualStyle: 'Warm illustrated township interiors', targetMinutes: 5
  });
  project.characters = project.characters.map(character => character.id === 'bra-j' ? { ...character, name: 'Landlord' } : character);
  production.bible.characters = [
    ['sbu', 'Sbu keeps the budget.', 'Practical and tightly wound', 'Keep their flat', 'Zee is his flatmate', 'Dry and precise', 'deep', 'Counts on fingers'],
    ['zee', 'Zee bought a food stall’s worth of stock.', 'Optimistic and evasive', 'Make the money back', 'Sbu is his closest friend', 'Fast and playful', 'bright', 'Gestures at the exit'],
    ['bra-j', 'The landlord does his rounds at sunset.', 'Patient and observant', 'Collect rent', 'Knows both flatmates', 'Unhurried', 'warm', 'Pauses before a question']
  ].map(([characterId, description, personality, motivation, relationships, speakingStyle, voice, mannerisms]) =>
    ({ characterId, description, personality, motivation, relationships, speakingStyle, voice: voice as Voice, mannerisms, status: 'approved' }));
  const cast = ['sbu', 'zee', 'bra-j'];
  const scenes = [
    ['The empty envelope', 'Sbu discovers the rent is gone, just as the landlord knocks.', 'Reveal the money is missing.', 75],
    ['The lunch rush', 'The friends sell plates on the street and argue over the last order.', 'Show their efforts to recover the rent.', 100],
    ['An honest pitch', 'Zee explains the plan, and the landlord turns out to know their first customer.', 'Resolve the conflict between the friends.', 125]
  ] as const;
  production.bible.scenes = scenes.map(([title, summary, purpose, seconds], i) => ({
    ...makeStoryScene(title, cast), environment: i === 1 ? 'Township street' : 'Living room',
    location: i === 1 ? 'Soweto street corner' : 'Sbu and Zee’s flat', summary, purpose, seconds,
    act: String(i + 1), sequence: title, status: 'approved'
  }));
  production.bible.worlds = [
    { id: 'flat', name: 'Sbu and Zee’s flat', environment: 'Living room', description: 'A well-lived-in lounge.', atmosphere: 'Late-afternoon warmth', layout: 'Sofa, door and low table.', status: 'approved' },
    { id: 'corner', name: 'Street corner', environment: 'Township street', description: 'The first food stall opens.', atmosphere: 'After-school rush', layout: 'Counter beside a streetlight.', status: 'approved' }
  ];
  const [first] = production.bible.scenes;
  const line = (characterId: string, text: string, directions: DirectionData[] = []) => [
    { ...makeLine('character', project.characters.find(character => character.id === characterId)!.name.toUpperCase()), characterId },
    { ...makeLine('dialogue', text, directions), characterId }
  ];
  production.screenplay.scenes = [{ ...fromOutline(first), elements: [
    makeLine('scene-heading', 'INT. SBU AND ZEE’S FLAT - LATE AFTERNOON', [{ kind: 'camera', shot: 'establishing', seconds: 5, delay: 0, parallel: true, transition: 'cut' }]),
    makeLine('action', 'Sbu walks over to Zee, searching for the missing envelope.', [
      { kind: 'presence', actor: 'bra-j', visible: false, seconds: .1, delay: 0, parallel: true },
      { kind: 'move', actor: 'sbu', gait: 'walk', x: 300, seconds: 1, delay: 0, parallel: false }
    ]),
    ...line('sbu', 'Zee. Where is the rent money?'),
    ...line('zee', 'Technically, it is in the kitchen. In the form of chicken.', [
      { kind: 'expression', actor: 'zee', expression: 'thinking', seconds: 2, delay: 0, parallel: true },
      { kind: 'gaze', actor: 'zee', target: 'door', seconds: 1.8, delay: 0, parallel: true }
    ]),
    makeLine('action', 'The doorbell rings. Zee runs for the door.', [
      { kind: 'sound', sound: 'ding', seconds: .5, delay: 0, parallel: true },
      { kind: 'move', actor: 'zee', gait: 'run', x: 137, seconds: 1, delay: 0, parallel: false }
    ]),
    ...line('sbu', 'Please tell me the chicken can pay rent.'),
    ...line('zee', 'It can, if we sell it before sunset.'),
    makeLine('action', 'The landlord appears in the doorway.', [
      { kind: 'presence', actor: 'bra-j', visible: true, seconds: .1, delay: 0, parallel: true },
      { kind: 'camera', actor: 'bra-j', shot: 'reaction', seconds: 2, delay: 0, parallel: false, transition: 'cut' }
    ]),
    ...line('bra-j', 'I could smell that business plan from outside.')
  ] }];
  return { ...project, production };
}
