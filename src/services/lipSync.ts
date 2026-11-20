import { textVisemes, type VisemeCue, type Viseme } from '../engine/visemes.ts';

/** Rhubarb produces timed visual mouth CUES, not IPA phonemes. */
export type Analysis = { cues: VisemeCue[]; source: 'rhubarb' | 'estimated'; reason?: string };
type Rhubarb = { mouthCues?: { start: number; end: number; value: string }[] };
const map: Record<string, Viseme> = {
  A: 'closed', B: 'open', C: 'open', D: 'wide', E: 'round', F: 'pucker',
  G: 'bite', H: 'tongue', X: 'rest'
};
export function parseRhubarbOutput(value: unknown, duration: number): VisemeCue[] {
  const parsed = value as Rhubarb | null;
  if (!parsed || !Array.isArray(parsed.mouthCues)) throw new Error('Invalid Rhubarb JSON: mouthCues array missing.');
  const cues: VisemeCue[] = [];
  for (const item of parsed.mouthCues) {
    if (!item || !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end <= item.start || item.end > duration + .2 || !map[item.value])
      throw new Error('Invalid Rhubarb cue: times or mouth shape are unsupported.');
    if (cues.length && item.start < cues[cues.length - 1].end - .025) throw new Error('Overlapping Rhubarb mouth cues.');
    cues.push({ start: item.start, end: Math.min(item.end, duration), shape: map[item.value] });
  }
  if (!cues.length) throw new Error('Rhubarb returned no mouth cues.');
  return cues;
}

function wav(buffer: AudioBuffer): Blob {
  const data = new ArrayBuffer(44 + buffer.length * 2), view = new DataView(data);
  const chars = (position: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(position + i, value.charCodeAt(i)); };
  chars(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true);
  chars(8, 'WAVE'); chars(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  chars(36, 'data'); view.setUint32(40, buffer.length * 2, true);
  const pcm = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Blob([data], { type: 'audio/wav' });
}
async function compatibleWave(audio: Blob): Promise<Blob> {
  const context = new OfflineAudioContext(1, 1, 16000);
  const decoded = await context.decodeAudioData(await audio.arrayBuffer());
  if (decoded.duration > 120) throw new Error('Lip-sync analysis is limited to two minutes per recording.');
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const source = offline.createBufferSource(); source.buffer = decoded;
  source.connect(offline.destination); source.start();
  return wav(await offline.startRendering());
}
/** Uses Rhubarb if the service is installed. Always labels the text-based fallback
 * accurately; never presents estimated cues as acoustic alignment. */
export async function analyzeLipSync(audio: Blob, text: string, duration: number): Promise<Analysis> {
  try {
    const wave = await compatibleWave(audio);
    const body = new FormData(); body.set('audio', wave, 'dialogue.wav'); body.set('text', text);
    const response = await fetch('/api/lipsync', { method: 'POST', body });
    if (!response.ok) throw new Error(response.status === 503 ? 'Rhubarb service is not configured.' : 'Audio analysis unavailable.');
    const cues = parseRhubarbOutput(await response.json(), duration);
    return { cues, source: 'rhubarb' };
  } catch (error) {
    return { cues: textVisemes(text, duration), source: 'estimated',
      reason: error instanceof Error ? error.message : 'Audio analysis unavailable.' };
  }
}
