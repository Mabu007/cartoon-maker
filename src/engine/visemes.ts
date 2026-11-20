import { clamp } from './animation.ts';

/** Lightweight, deterministic 2D visemes. Speech sounds share mouth artwork;
 * this is a text-aligned approximation, not a claimed forced-alignment model.
 * Optional real phoneme timings can replace these cues without changing the rig.
 */
export const visemeNames = ['rest', 'closed', 'bite', 'wide', 'open', 'round', 'pucker', 'tongue'] as const;
export type Viseme = typeof visemeNames[number];
export type VisemeCue = { start: number; end: number; shape: Viseme };
const cache = new Map<string, VisemeCue[]>();
const MAX_CACHE = 100;
const groups: { test: RegExp; shape: Viseme; weight: number }[] = [
  { test: /^(?:sh|ch|zh|th|dh)/, shape: 'tongue', weight: .8 },
  { test: /^(?:oo|ou|ew|ue|ui)/, shape: 'pucker', weight: 1.1 },
  { test: /^(?:ow|oa|oh|aw|au)/, shape: 'round', weight: 1.25 },
  { test: /^(?:ee|ea|ei|ie|ey)/, shape: 'wide', weight: 1.25 },
  { test: /^(?:ai|ay|ae|aa)/, shape: 'open', weight: 1.35 },
  { test: /^(?:ph|ff)/, shape: 'bite', weight: .68 },
  { test: /^(?:mb|mp|bb|pp)/, shape: 'closed', weight: .68 },
  { test: /^[bmp]/, shape: 'closed', weight: .52 },
  { test: /^[fv]/, shape: 'bite', weight: .58 },
  { test: /^[lrtdn]/, shape: 'tongue', weight: .58 },
  { test: /^[ae]/, shape: 'wide', weight: 1.08 },
  { test: /^[iy]/, shape: 'wide', weight: .98 },
  { test: /^[ou]/, shape: 'round', weight: 1.12 },
  { test: /^[wq]/, shape: 'pucker', weight: .65 },
  { test: /^[ckgszhj]/, shape: 'open', weight: .52 }
];
export function textVisemes(text: string, duration: number): VisemeCue[] {
  const length = Math.max(.1, Number.isFinite(duration) ? duration : .1);
  const key = length.toFixed(3) + ':' + text;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw: { shape: Viseme; weight: number }[] = [];
  for (const token of text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[.,!?;:]|\s+/g) ?? []) {
    if (/^\s+$/.test(token)) { raw.push({ shape: 'rest', weight: .13 }); continue; }
    if (/^[.,!?;:]$/.test(token)) { raw.push({ shape: 'rest', weight: /[.!?]/.test(token) ? 1.1 : .52 }); continue; }
    let word = token.replace(/'/g, '');
    while (word.length) {
      let matched = false;
      for (const group of groups) {
        const found = group.test.exec(word);
        if (found) {
          raw.push({ shape: group.shape, weight: group.weight });
          word = word.slice(found[0].length); matched = true; break;
        }
      }
      if (!matched) { raw.push({ shape: 'open', weight: .47 }); word = word.slice(1); }
    }
    raw.push({ shape: 'rest', weight: .10 });
  }
  if (!raw.length) raw.push({ shape: 'rest', weight: 1 });
  const total = raw.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;
  const cues = raw.map(({ shape, weight }) => {
    const start = cursor;
    cursor += length * weight / total;
    return { shape, start, end: Math.min(length, cursor) };
  });
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, cues);
  return cues;
}

export function sampleViseme(text: string, duration: number, localTime: number): { shape: Viseme; weight: number } {
  if (!text.trim() || !Number.isFinite(localTime) || localTime < 0 || localTime >= duration) return { shape: 'rest', weight: 0 };
  const cues = textVisemes(text, duration);
  let low = 0, high = cues.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1, cue = cues[mid];
    if (localTime < cue.start) high = mid - 1;
    else if (localTime >= cue.end) low = mid + 1;
    else {
      const edge = Math.min(localTime - cue.start, cue.end - localTime);
      const fade = clamp(edge / .035);
      return { shape: cue.shape, weight: cue.shape === 'rest' ? 0 : .50 + .50 * fade };
    }
  }
  return { shape: 'rest', weight: 0 };
}

/** Samples genuine audio-derived mouth cues by audio media time (including clip offset).
 * Independent of render frame rate, so seeking/export reproduce identical poses. */
export function sampleTimedViseme(cues: readonly VisemeCue[], audioTime: number): { shape: Viseme; weight: number } {
  if (!Number.isFinite(audioTime) || audioTime < 0 || !cues.length) return { shape: 'rest', weight: 0 };
  let left = 0, right = cues.length - 1;
  while (left <= right) {
    const middle = (left + right) >>> 1, item = cues[middle];
    if (audioTime < item.start) right = middle - 1;
    else if (audioTime >= item.end) left = middle + 1;
    else {
      if (item.shape === 'rest') return { shape: 'rest', weight: 0 };
      // Small easing at pose boundaries, never sacrificing a complete B/M/P closure.
      const fade = item.shape === 'closed' ? 1 : clamp(Math.min(audioTime - item.start, item.end - audioTime) / .022);
      return { shape: item.shape, weight: .67 + .33 * fade };
    }
  }
  return { shape: 'rest', weight: 0 };
}
