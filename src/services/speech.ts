import type { Account } from './cloud.ts';

export interface SpeechProvider { synthesize(text: string, voice: string): Promise<Blob>; }
export const voices = [{ id: 'warm', name: 'Warm' }, { id: 'bright', name: 'Bright' }, { id: 'deep', name: 'Deep' }];
let worker: Worker | undefined;
let nextRequest = 0;
const requests = new Map<number, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>();
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./flite.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ id: number; wave?: ArrayBuffer; error?: string }>) => {
      const { id, wave, error } = event.data;
      const pending = requests.get(id);
      if (!pending) return;
      requests.delete(id);
      if (wave) pending.resolve(new Blob([wave], { type: 'audio/wav' }));
      else pending.reject(new Error(error ?? 'No voice audio was produced.'));
    };
    worker.onerror = event => {
      const detail = event.message ? ` ${event.message}` : '';
      for (const pending of requests.values()) pending.reject(new Error(`The local voice engine could not start.${detail}`));
      requests.clear();
      worker?.terminate(); worker = undefined;
    };
  }
  return worker;
}
export const localSpeech: SpeechProvider = {
  async synthesize(text, voice) {
    if (!text.trim() || text.length > 400) throw new Error('Enter between 1 and 400 characters to generate a voice.');
    const preset = voice === 'bright' ? 'slt' : voice === 'deep' ? 'rms' : 'kal';
    const engine = getWorker();
    return new Promise((resolve, reject) => {
      const id = ++nextRequest;
      const timeout = setTimeout(() => { requests.delete(id); reject(new Error('The voice engine took too long. Try again or record a line.')); }, 55_000);
      requests.set(id, { resolve: data => { clearTimeout(timeout); resolve(data); }, reject: error => { clearTimeout(timeout); reject(error); } });
      engine.postMessage({ id, text: text.trim(), voice: preset });
    });
  }
};
export function speechProvider(account: Account | null): SpeechProvider {
  if (!account || import.meta.env.VITE_HOSTED_SPEECH !== 'true') return localSpeech;
  return {
    async synthesize(text, voice) {
      const token = await account.getIdToken();
      const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text, voice }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'The speech service is unavailable.');
      return response.blob();
    }
  };
}
