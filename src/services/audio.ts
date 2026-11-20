import { clamp } from '../engine/animation.ts';
import type { Project, Scene, SoundClip } from '../engine/schema.ts';

const builtinVoices = new Set(['zee-spicy', 'sbu-food', 'zee-safe', 'sbu-lunch', 'sbu-receipt']);
const soundTypes = new Set(['ding', 'pop', 'sting', 'whoosh', 'rimshot']);
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
const decoders = new Map<string, Promise<{ buffer: AudioBuffer; envelope: Float32Array }>>();
let remoteAudio: ((id: string) => Promise<Blob | undefined>) | undefined;
export function setRemoteAudio(loader?: (id: string) => Promise<Blob | undefined>) { remoteAudio = loader; }
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
export async function readSound(context: BaseAudioContext, asset: string) {
  let pending = decoders.get(asset);
  if (!pending) {
    pending = (async () => {
      const name = asset.split(':')[1];
      let buffer: AudioBuffer;
      if (asset.startsWith('builtin:') && soundTypes.has(name)) buffer = effect(context, name);
      else if (asset.startsWith('builtin:') && builtinVoices.has(name)) {
        const response = await fetch(`/audio/${name}.mp3`);
        if (!response.ok) throw new Error(`Could not load audio “${name}”`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
      } else {
        let blob = asset.startsWith('asset:') ? await getAudio(name) : undefined;
        if (!blob && remoteAudio && asset.startsWith('asset:')) {
          blob = await remoteAudio(name);
          if (blob) await putAudio(name, blob).catch(() => {});
        }
        if (!blob) throw new Error(`Audio file is missing (${name}). Reattach the original file.`);
        buffer = await context.decodeAudioData(await blob.arrayBuffer());
      }
      return { buffer, envelope: envelope(buffer) };
    })();
    decoders.set(asset, pending);
    if (decoders.size > 48) decoders.delete(decoders.keys().next().value!);
    pending.catch(() => decoders.delete(asset));
  }
  return pending;
}
export const sceneSounds = (scene: Scene) => scene.clips.filter((clip): clip is SoundClip => clip.track === 'dialogue' || clip.track === 'audio');
export const projectAssets = (project: Project) => [...new Set(project.scenes.flatMap(scene => sceneSounds(scene).map(clip => clip.asset)).filter(asset => asset.startsWith('asset:')).map(asset => asset.slice(6)))];
export function createAudioMixer() {
  const context = new AudioContext();
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  master.connect(limiter);
  const prepared = new Map<string, Awaited<ReturnType<typeof readSound>>>();
  let sources: AudioBufferSourceNode[] = [];
  let monitoring = false;
  function monitor() { if (!monitoring) { limiter.connect(context.destination); monitoring = true; } }
  function stop() { for (const source of sources) { try { source.stop(); } catch { /* already ended */ } source.disconnect(); } sources = []; }
  async function prepare(scenes: Scene[]) {
    const assets = new Set(scenes.flatMap(scene => sceneSounds(scene).filter(clip => !clip.muted).map(clip => clip.asset)));
    await Promise.all([...assets].map(async asset => { prepared.set(asset, await readSound(context, asset)); }));
  }
  function schedule(scenes: Scene[], offset: number, when = context.currentTime) {
    stop();
    let sceneStart = 0;
    for (const scene of scenes) {
      for (const clip of sceneSounds(scene)) {
        if (clip.muted) continue;
        const audio = prepared.get(clip.asset);
        if (!audio) continue;
        const position = clip.start + sceneStart;
        const skip = Math.max(0, offset - position);
        const duration = Math.min(clip.length - skip, audio.buffer.duration - clip.offset - skip);
        if (duration <= 0) continue;
        const source = context.createBufferSource(), gain = context.createGain();
        gain.gain.value = clip.volume;
        source.buffer = audio.buffer; source.connect(gain); gain.connect(master);
        source.onended = () => gain.disconnect();
        source.start(when + Math.max(0, position - offset), clip.offset + skip, duration);
        sources.push(source);
      }
      sceneStart += scene.duration;
    }
  }
  function amplitude(scene: Scene, actor: string, time: number) {
    let value = 0;
    for (const clip of sceneSounds(scene)) {
      if (clip.track !== 'dialogue' || clip.actor !== actor || clip.muted || time < clip.start || time >= clip.start + clip.length) continue;
      value = Math.max(value, (prepared.get(clip.asset)?.envelope[Math.floor((time - clip.start + clip.offset) * 50)] ?? 0) * Math.min(1, clip.volume));
    }
    return value;
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
  let start = 0;
  const clips = scenes.flatMap(scene => {
    const offset = start;
    start += scene.duration;
    return sceneSounds(scene).filter(clip => !clip.muted).map(clip => ({ clip, start: offset + clip.start }));
  });
  await Promise.all(clips.map(async ({ clip, start }) => {
    const { buffer } = await readSound(context, clip.asset);
    signal.throwIfAborted();
    const length = Math.min(clip.length, buffer.duration - clip.offset);
    if (length <= 0) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = clip.volume;
    source.connect(gain).connect(master);
    source.start(start, clip.offset, length);
  }));
  signal.throwIfAborted();
  return context.startRendering();
}
