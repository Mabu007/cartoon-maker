import type { VisemeCue, Viseme } from './visemes.ts';

export const DSP_ENGINE = 'toonroom-dsp-2';
export type DspAnalysis = { cues: VisemeCue[]; waveform: number[]; duration: number; noiseFloor: number };
const bound = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}
/** In-place radix-2 FFT. No recognition or language model: these are visual
 * speech textures, based on energy, spectral balance and temporal changes. */
function spectrum(input: Float32Array, offset: number, size: number) {
  const real = new Float64Array(size), imag = new Float64Array(size);
  for (let i = 0; i < size; i++) real[i] = (input[offset + i] ?? 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1)));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let len = 2; len <= size; len <<= 1) {
    const angle = -2 * Math.PI / len;
    for (let start = 0; start < size; start += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(angle * k), s = Math.sin(angle * k), a = start + k, b = a + len / 2;
        const r = real[b] * c - imag[b] * s, im = real[b] * s + imag[b] * c;
        real[b] = real[a] - r; imag[b] = imag[a] - im; real[a] += r; imag[a] += im;
      }
    }
  }
  let low = 0, middle = 0, high = 0, weighted = 0, total = 0;
  for (let i = 3; i < size / 2; i++) {
    const energy = real[i] ** 2 + imag[i] ** 2;
    if (i < 22) low += energy; else if (i < 80) middle += energy; else high += energy;
    total += energy; weighted += energy * i;
  }
  return { low: low / (total || 1), high: high / (total || 1), centroid: weighted / (total || 1) };
}
export function analyzePCM(pcm: Float32Array, sampleRate: number): DspAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || !pcm.length) throw Error('The recording contains no readable audio.');
  const duration = pcm.length / sampleRate;
  if (duration < .1 || duration > 180) throw Error('Choose a recording between 0.1 and 180 seconds.');
  // Normalize to 16 kHz for reproducible spectral bins on every output device.
  const data = sampleRate === 16000 ? pcm : Float32Array.from({ length: Math.ceil(duration * 16000) }, (_, i) => {
    const at = i * sampleRate / 16000, a = Math.floor(at), fraction = at - a;
    return (pcm[a] ?? 0) * (1 - fraction) + (pcm[a + 1] ?? 0) * fraction;
  });
  const hop = 320, window = 512, rms: number[] = [], waveform: number[] = [];
  for (let at = 0; at < data.length; at += hop) {
    let energy = 0, peak = 0, count = Math.min(hop, data.length - at);
    for (let i = 0; i < count; i++) { const x = Number.isFinite(data[at + i]) ? data[at + i] : 0; energy += x * x; peak = Math.max(peak, Math.abs(x)); }
    rms.push(Math.sqrt(energy / count)); waveform.push(peak);
  }
  const noiseFloor = percentile(rms, .18), ceiling = percentile(rms, .94);
  // Cap the noise estimate relative to speech peaks: continuous speech must
  // still animate, while low hiss and room noise should leave a closed mouth.
  const threshold = Math.max(.004, Math.min(noiseFloor * 2.2, ceiling * .26));
  const cues: VisemeCue[] = [];
  let envelope = 0, previousRms = 0, lastChange = -10;
  for (let i = 0; i < rms.length; i++) {
    const at = i * .02, end = Math.min(duration, at + .02), energy = rms[i];
    const active = ceiling > .006 && energy > threshold;
    const level = active ? bound((energy - threshold) / Math.max(.015, ceiling - threshold)) : 0;
    envelope += (level - envelope) * (level > envelope ? .78 : .6);
    let shape: Viseme = 'rest';
    if (active) {
      const spectral = spectrum(data, i * hop, window);
      shape = spectral.high > .48 ? 'pucker' : level > .62 ? 'open' : spectral.centroid > 19 || level > .32 ? 'wide' : spectral.low > .72 ? 'round' : 'open';
      if (energy < previousRms * .43 && at - lastChange > .065) shape = 'closed';
    }
    const prior = cues.at(-1);
    // Silence is immediate. Hold speech textures at least 60 ms to avoid jitter.
    if (prior && shape !== 'rest' && prior.shape !== 'rest' && at - lastChange < .06) shape = prior.shape;
    const strength = shape === 'rest' ? 0 : shape === 'closed' ? 1 : bound(.28 + envelope * .72);
    if (prior && prior.shape === shape && Math.abs((prior.strength ?? 0) - strength) < .19 && prior.end - prior.start < .18) prior.end = end;
    else { cues.push({ start: at, end, shape, strength }); lastChange = at; }
    previousRms = energy;
  }
  // Bound stored data to the canonical cue budget on long, rapidly varying
  // recordings. Each bucket keeps the dominant observed texture, not a guess
  // about a spoken syllable. Ordinary recordings retain full 20 ms detail.
  if(cues.length>3000){
    const limited:VisemeCue[]=[];let cursor=0;
    for(let i=0;i<3000;i++){
      const start=i*duration/3000,end=(i+1)*duration/3000,weights=new Map<Viseme,number>();let strength=0;
      while(cursor<cues.length&&cues[cursor].end<=start)cursor++;
      for(let j=cursor;j<cues.length&&cues[j].start<end;j++){
        const span=Math.max(0,Math.min(end,cues[j].end)-Math.max(start,cues[j].start));
        weights.set(cues[j].shape,(weights.get(cues[j].shape)??0)+span);strength+=(cues[j].strength??0)*span;
      }
      const shape=[...weights].sort((a,b)=>b[1]-a[1])[0]?.[0]??'rest';
      limited.push({start,end,shape,strength:shape==='rest'?0:bound(strength/(end-start))});
    }
    return {cues:limited,waveform,duration,noiseFloor};
  }
  return { cues, waveform, duration, noiseFloor };
}

/** Manual regions are independent of automatic cues, in source-audio time.
 * Regeneration can replace the automatic layer without touching corrections. */
export function overrideRegion(cues: VisemeCue[], start: number, end: number, shape?: Viseme): VisemeCue[] {
  const result = cues.flatMap(cue => cue.end <= start || cue.start >= end ? [cue] : [
    ...(cue.start < start ? [{ ...cue, end: start }] : []),
    ...(cue.end > end ? [{ ...cue, start: end }] : [])
  ]);
  if (shape) result.push({ start, end, shape, strength: shape === 'rest' ? 0 : 1 });
  return result.sort((a, b) => a.start - b.start).filter(cue => cue.end - cue.start > .001);
}
const effectiveCache = new WeakMap<VisemeCue[], WeakMap<VisemeCue[], VisemeCue[]>>();
export function effectiveCues(auto: VisemeCue[], manual: VisemeCue[] = []): VisemeCue[] {
  if (!manual.length) return auto;
  const found=effectiveCache.get(auto)?.get(manual); if(found)return found;
  let result = auto;
  for (const cue of manual) result = overrideRegion(result, cue.start, cue.end, cue.shape).map(item =>
    item.start === cue.start && item.end === cue.end ? { ...item, strength: cue.strength ?? 1 } : item);
  const entries=effectiveCache.get(auto)??new WeakMap<VisemeCue[],VisemeCue[]>();entries.set(manual,result);effectiveCache.set(auto,entries);
  return result;
}
