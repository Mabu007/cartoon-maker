import { analyzePCM, DSP_ENGINE, type DspAnalysis } from '../engine/dspLipSync.ts';
import { getOrFetchAudio } from './audio.ts';
export type LocalAnalysis = DspAnalysis & { source: 'dsp'; engine: string; analyzedDuration: number; cacheKey: string };
const pending = new Map<string, Promise<LocalAnalysis>>();
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('toonroom-dsp', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('analysis');
    request.onsuccess = () => {request.result.onversionchange=()=>{request.result.close();database=undefined;};resolve(request.result);};
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
async function cached(key: string): Promise<LocalAnalysis | undefined> {
  const storage = await db();
  return new Promise((resolve, reject) => { const request = storage.transaction('analysis').objectStore('analysis').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function save(key: string, value: LocalAnalysis) {
  const storage = await db();
  await new Promise<void>((resolve, reject) => { const tx = storage.transaction('analysis', 'readwrite'); tx.objectStore('analysis').put(value, key); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); });
}
async function process(pcm: Float32Array, sampleRate: number): Promise<DspAnalysis> {
  if (typeof Worker === 'undefined') return analyzePCM(pcm, sampleRate);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(Error('Audio analysis took too long. Try a shorter recording.')); }, 30000);
    const done = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = event => { done(); event.data.error ? reject(Error(event.data.error)) : resolve(event.data.result); };
    worker.onerror = () => { done(); reject(Error('Audio analysis could not start. Reload and try again.')); };
    worker.postMessage({ pcm, sampleRate }, [pcm.buffer]);
  });
}
export async function analyzeLocalLipSync(audio: Blob): Promise<LocalAnalysis> {
  if (!audio.size || audio.size > 20 * 1024 * 1024) throw Error('Choose a nonempty audio file smaller than 20 MB.');
  const bytes = await audio.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const cacheKey = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
  const key = DSP_ENGINE + ':' + cacheKey;
  const running = pending.get(key); if (running) return running;
  const task = (async () => {
    const hit = await cached(key).catch(() => undefined);
    if (hit?.engine === DSP_ENGINE && hit.cues?.length && hit.waveform?.length) return hit;
    const decoder = new OfflineAudioContext(1, 1, 16000);
    let buffer: AudioBuffer;
    try { buffer = await decoder.decodeAudioData(bytes); } catch { throw Error('This audio could not be decoded. Try a WAV, MP3, M4A or WebM recording.'); }
    if (buffer.duration < .1 || buffer.duration > 180) throw Error('Recordings must be between 0.1 and 180 seconds.');
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const samples = buffer.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += samples[i] / buffer.numberOfChannels;
    }
    const result = await process(mono, buffer.sampleRate);
    const value: LocalAnalysis = { ...result, source: 'dsp', engine: DSP_ENGINE, cacheKey, analyzedDuration: result.duration };
    await save(key, value).catch(() => {}); return value;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
export async function audioBlob(asset: string): Promise<Blob> {
  if (asset.startsWith('asset:')) { const blob = await getOrFetchAudio(asset.slice(6)); if (blob) return blob; }
  if (asset.startsWith('builtin:')) { const res = await fetch('/audio/' + asset.slice(8) + '.mp3'); if (res.ok) return res.blob(); }
  throw Error('This recording is missing. Restore your project backup or reconnect cloud saving.');
}
