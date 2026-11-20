import type { Account } from './cloud.ts';

export interface SpeechProvider { synthesize(text: string, voice: string, voiceId?: string): Promise<Blob>; }
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
    async synthesize(text, voice, voiceId) {
      const token = await account.getIdToken();
      let response: Response;
      try {
        response = await fetch('/api/speech', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, voice, ...(voiceId ? { voiceId } : {}) }) });
      } catch { return localSpeech.synthesize(text, voice); }
      if (!response.ok) {
        const issue = (await response.json().catch(() => ({}))) as { error?: string };
        // Hosted service can be limited or unconfigured; keep creation possible offline.
        if ([401, 403, 429, 502, 503, 504].includes(response.status)) return localSpeech.synthesize(text, voice);
        throw new Error(issue.error || 'Hosted voice is unavailable. Use the local voice engine.');
      }
      const type = response.headers.get('content-type')?.split(';')[0].toLowerCase();
      if (!type || !['audio/mpeg', 'audio/wav','audio/x-wav','audio/mp3'].includes(type))
        throw new Error('Hosted speech returned no playable audio. Switch to local voice generation.');
      const blob = await response.blob();
      if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('The voice service returned an empty or oversized audio file.');
      return blob;
    }
  };
}

/** Persistent, content-addressed cache. Explicit regeneration bypasses this
 * cache; successful generations replace only their own cache entry.
 */
export async function synthesizeCached(provider: SpeechProvider, text: string, preset: string,
  hostedVoiceId?: string, force = false) {
  const { getAudio, putAudio } = await import('./audio.ts');
  const input = new TextEncoder().encode(['toonroom-tts-v2',text.trim(),preset,hostedVoiceId ?? ''].join('\u0000'));
  const digest = await crypto.subtle.digest('SHA-256',input);
  const key = 'speech-' + [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  if (!force) {
    const cached = await getAudio(key).catch(()=>undefined);
    if (cached?.size) return cached;
  }
  const result = await provider.synthesize(text,preset,hostedVoiceId);
  if (!result.size) throw new Error('Speech engine returned empty audio.');
  await putAudio(key,result).catch(()=>{});
  return result;
}
