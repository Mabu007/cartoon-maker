import { clamp } from '../engine/animation.ts';
import { builtinVoiceNames, soundNames, type Project, type Scene, type SoundClip } from '../engine/schema.ts';

const builtinVoices = new Set<string>(builtinVoiceNames);
const soundTypes = new Set<string>(soundNames);
let database: Promise<IDBDatabase> | undefined;
function audioDatabase() {
  database ??= new Promise((resolve, reject) => {
    const open = indexedDB.open('toonroom-audio', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('sounds');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => { database = undefined; reject(open.error); };
  });
  return database;
}
export async function putAudio(id: string, file: Blob) {
  const db = await audioDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('sounds', 'readwrite');
    transaction.objectStore('sounds').put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Could not save audio'));
  });
}
export async function getAudio(id: string) {
  const db = await audioDatabase();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction('sounds').objectStore('sounds').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function effect(context: BaseAudioContext, name: string) {
  const duration = name === 'pop' ? .21 : name === 'whoosh' ? .55 : .47;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 17128;
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    const remaining = 1 - t / duration;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    if (name === 'whoosh') data[i] = noise * Math.sin(Math.PI * t / duration) ** 2 * .3;
    else if (name === 'rimshot') data[i] = (noise * .55 + Math.sin(t * 721) * .45) * (Math.exp(-t * 65) + (t > .12 ? .6 * Math.exp(-(t - .12) * 35) : 0));
    else {
      const hz = name === 'pop' ? 530 - t * 1600 : name === 'ding' ? 740 : t > .15 ? 275 : 410;
      data[i] = (Math.sin(t * hz * Math.PI * 2) * .43 + Math.sin(t * hz * 1.51 * Math.PI * 2) * .11) * remaining ** 3;
    }
    data[i] *= Math.min(1, t * 120);
  }
  return buffer;
}
type DecodedSound = { buffer: AudioBuffer; envelope: Float32Array };
const decoders = new Map<string, Promise<DecodedSound>>();
let decoderContext: OfflineAudioContext | undefined;
let remoteAudio: ((id: string) => Promise<Blob | undefined>) | undefined;
export function setRemoteAudio(loader?: (id: string) => Promise<Blob | undefined>) { remoteAudio = loader; }
export async function getOrFetchAudio(id: string) {
  const local = await getAudio(id);
  if (local || !remoteAudio) return local;
  const remote = await remoteAudio(id);
  if (remote) await putAudio(id, remote).catch(() => {});
  return remote;
}
function envelope(buffer: AudioBuffer) {
  const windowSize = Math.floor(buffer.sampleRate / 50);
  const result = new Float32Array(Math.ceil(buffer.length / windowSize));
  const pcm = buffer.getChannelData(0);
  let previous = 0;
  for (let i = 0; i < result.length; i++) {
    let energy = 0, count = 0;
    for (let n = i * windowSize; n < Math.min(pcm.length, (i + 1) * windowSize); n += 4) { energy += pcm[n] ** 2; count++; }
    const amplitude = clamp(Math.sqrt(energy / Math.max(count, 1)) * 5.6);
    previous = previous * .34 + amplitude * .66;
    result[i] = previous;
  }
  return result;
}
async function readSound(asset: string) {
  let pending = decoders.get(asset);
  if (!pending) {
    pending = (async () => {
      // Decode once at the movie mix rate, independent of the output device.
      const context = decoderContext ??= new OfflineAudioContext(2, 1, 48000);
      const name = asset.split(':')[1];
      let buffer: AudioBuffer;
      if (asset.startsWith('builtin:') && soundTypes.has(name)) buffer = effect(context, name);
      else if (asset.startsWith('builtin:') && builtinVoices.has(name)) {
        const response = await fetch(`/audio/${name}.mp3`);
        if (!response.ok) throw new Error(`Could not load audio “${name}”`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
      } else {
        const blob = asset.startsWith('asset:') ? await getOrFetchAudio(name) : undefined;
        if (!blob) throw new Error(`Audio file is missing (${name}). Reattach the original file.`);
        buffer = await context.decodeAudioData(await blob.arrayBuffer());
      }
      return { buffer, envelope: envelope(buffer) };
    })();
    decoders.set(asset, pending);
    if (decoders.size > 48) decoders.delete(decoders.keys().next().value!);
    pending.catch(() => { if (decoders.get(asset) === pending) decoders.delete(asset); });
  }
  return pending;
}
export const sceneSounds = (scene: Scene) => scene.clips.filter((clip): clip is SoundClip => clip.track === 'dialogue' || clip.track === 'audio' || clip.track === 'music');
export const projectAssets = (project: Project) => [...new Set(project.scenes.flatMap(scene =>
  sceneSounds(scene).flatMap(clip => [clip.asset, ...(clip.track === 'dialogue' ? (clip.versions ?? []).map(item => item.asset) : [])])
).filter(asset => asset.startsWith('asset:')).map(asset => asset.slice(6)))];
function soundEvents(scenes: Scene[]) {
  let sceneStart = 0;
  return scenes.flatMap(scene => {
    const start = sceneStart;
    sceneStart += scene.duration;
    return sceneSounds(scene).filter(clip => !clip.muted && !scene.trackSettings?.[clip.track]?.muted).map(clip => ({ clip, position: start + clip.start }));
  });
}
export function soundPlayback(clip: SoundClip, position: number, bufferDuration: number, cursor = 0) {
  const skip = Math.max(0, cursor - position);
  const offset = clip.offset + skip;
  const duration = Math.min(clip.length - skip, bufferDuration - offset);
  return duration > 0 ? { delay: Math.max(0, position - cursor), offset, duration } : undefined;
}

export function dialogueAmplitude(scene: Scene, actor: string, time: number, envelopeFor: (asset: string) => Float32Array | undefined) {
  let value = 0;
  for (const clip of scene.clips) {
    if (clip.track !== 'dialogue' || scene.trackSettings?.dialogue?.muted || clip.actor !== actor || clip.muted || time < clip.start || time >= clip.start + clip.length) continue;
    const frame = Math.floor((time - clip.start + clip.offset) * 50);
    value = Math.max(value, (envelopeFor(clip.asset)?.[frame] ?? 0) * Math.min(1, clip.volume));
  }
  return value;
}
export async function prepareDialoguePreview(scene: Scene) {
  const envelopes = new Map<string, Float32Array>();
  const assets = new Set(scene.clips.flatMap(clip => clip.track === 'dialogue' && !clip.muted ? [clip.asset] : []));
  await Promise.allSettled([...assets].map(async asset => { envelopes.set(asset, (await readSound(asset)).envelope); }));
  return (actor: string, time: number) => dialogueAmplitude(scene, actor, time, asset => envelopes.get(asset));
}

export function createAudioMixer() {
  const context = new AudioContext();
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  master.connect(limiter);
  const prepared = new Map<string, DecodedSound>();
  let sources: AudioBufferSourceNode[] = [];
  let monitoring = false;
  function monitor() { if (!monitoring) { limiter.connect(context.destination); monitoring = true; } }
  function stop() { for (const source of sources) { try { source.stop(); } catch { /* already ended */ } source.disconnect(); } sources = []; }
  async function prepare(scenes: Scene[]) {
    const assets = new Set(scenes.flatMap(scene => sceneSounds(scene).filter(clip => !clip.muted && !scene.trackSettings?.[clip.track]?.muted).map(clip => clip.asset)));
    await Promise.all([...assets].map(async asset => { prepared.set(asset, await readSound(asset)); }));
  }
  function schedule(scenes: Scene[], offset: number, when = context.currentTime) {
    stop();
    for (const { clip, position } of soundEvents(scenes)) {
      const audio = prepared.get(clip.asset);
      if (!audio) continue;
      const playback = soundPlayback(clip, position, audio.buffer.duration, offset);
      if (!playback) continue;
      const source = context.createBufferSource(), gain = context.createGain();
      gain.gain.value = clip.volume;
      source.buffer = audio.buffer; source.connect(gain); gain.connect(master);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start(when + playback.delay, playback.offset, playback.duration);
      sources.push(source);
    }
  }
  function amplitude(scene: Scene, actor: string, time: number) {
    return dialogueAmplitude(scene, actor, time, asset => prepared.get(asset)?.envelope);
  }
  return { context, master, output: limiter, monitor, prepare, schedule, amplitude, stop, close: () => { stop(); if (context.state !== 'closed') void context.close(); } };
}
export type Mixer = ReturnType<typeof createAudioMixer>;
export async function audioLength(blob: Blob) {
  const context = new OfflineAudioContext(1, 1, 24000);
  return (await context.decodeAudioData(await blob.arrayBuffer())).duration;
}

export async function mixOffline(scenes: Scene[], duration: number, signal: AbortSignal) {
  const context = new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000);
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  master.connect(limiter).connect(context.destination);
  await Promise.all(soundEvents(scenes).map(async ({ clip, position }) => {
    const { buffer } = await readSound(clip.asset);
    signal.throwIfAborted();
    const playback = soundPlayback(clip, position, buffer.duration);
    if (!playback) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = clip.volume;
    source.connect(gain).connect(master);
    source.start(playback.delay, playback.offset, playback.duration);
  }));
  signal.throwIfAborted();
  return context.startRendering();
}
