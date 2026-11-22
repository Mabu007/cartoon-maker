import type { VisemeCue } from './visemes.ts';

export const conversationAudition = {
  start: 0,
  duration: 8,
  text: 'First, hear me out. I have an idea. Can you help?'
};

export type DialoguePhrase = {
  start: number;
  duration: number;
  text: string;
  offset?: number;
  sourceDuration?: number;
  cues?: readonly VisemeCue[];
};

type Intent = 'beat' | 'explain' | 'direction' | 'question' | 'shrug' |
  'self-reference' | 'count-one' | 'count-two' | 'count-three';
type Beat = { time: number; window: number; intent: Intent };
const textPlans = new Map<string, readonly Beat[] | null>();
const audioPlans = new WeakMap<readonly VisemeCue[], readonly Beat[]>();
const ordinalIntents = { first: 'count-one', second: 'count-two', third: 'count-three' } as const;

function clauseIntent(clause: string): Intent {
  const ordinal = clause.match(/^\s*(?:and\s+)?(first|second|third)\b/i)?.[1].toLowerCase() as keyof typeof ordinalIntents | undefined;
  if (ordinal) return ordinalIntents[ordinal];
  if (/\b(?:maybe|perhaps|i guess|not sure|i don't know)\b/i.test(clause)) return 'shrug';
  if (/\?\s*$/.test(clause)) return 'question';
  if (/\b(?:over there|right there|you there|that one|look there)\b/i.test(clause)) return 'direction';
  if (/!\s*$|^\s*(?:stop|listen|look|wait|go)\b/i.test(clause)) return 'beat';
  if (/\b(?:i|me|my|mine|myself)\b/i.test(clause)) return 'self-reference';
  return clause.trim().split(/\s+/).length >= 4 ? 'explain' : 'beat';
}

function beatsFromText(text: string, duration: number, spacing: number) {
  const key = `${duration}\0${spacing}\0${text}`;
  const cached = textPlans.get(key);
  if (cached !== undefined) return cached;
  if (textPlans.size === 128) textPlans.delete(textPlans.keys().next().value!);
  if (!/\p{L}|\p{N}/u.test(text)) {
    textPlans.set(key, null);
    return null;
  }
  const clauses = (text.match(/[^.!?;,]+[.!?;,]*/g) ?? [])
    .map(clause => ({ clause, words: clause.trim().split(/\s+/).length }))
    .filter(({ clause }) => clause.trim());
  const total = clauses.reduce((sum, clause) => sum + clause.words, 0);
  const sampled: Beat[] = [];
  let start = 0;
  for (const { clause, words } of clauses) {
    const length = words / total * duration;
    // Early enumeration and questions near their turn take different accents.
    const intent = clauseIntent(clause);
    const time = start + length * (intent.startsWith('count-') ? .38 : intent === 'question' ? .68 : .56);
    const previous = sampled.at(-1);
    if (length >= .19 && (!previous || time - previous.time >= spacing)) {
      sampled.push({ time, window: Math.min(.56, length * .73), intent });
    }
    start += length;
  }
  textPlans.set(key, sampled);
  return sampled;
}

function beatsFromAudio(cues: readonly VisemeCue[]) {
  const cached = audioPlans.get(cues);
  if (cached) return cached;
  const sampled: Beat[] = [];
  let previousVowel = -1, lastBeat = -3;
  for (const cue of cues) {
    if (cue.shape === 'rest' || cue.shape === 'closed' || (cue.strength ?? 0) < .51) continue;
    const time = (cue.start + cue.end) / 2;
    // Require a second nearby strong cue (or a sustained vowel), and leave
    // long gaps between accents on recordings without a transcript.
    const sustained = cue.end - cue.start >= .09 || cue.start - previousVowel < .14;
    previousVowel = cue.end;
    if (sustained && time - lastBeat >= 2.8) {
      sampled.push({ time, window: .40, intent: 'beat' });
      lastBeat = time;
    }
  }
  audioPlans.set(cues, sampled);
  return sampled;
}

export function dialogueBeatAt(phrase: DialoguePhrase, sceneTime: number, spacing = 1.53) {
  const clipTime = sceneTime - phrase.start;
  if (clipTime < 0 || clipTime >= phrase.duration) return undefined;
  const offset = phrase.offset ?? 0;
  const sourceDuration = Math.max(phrase.duration + offset, phrase.sourceDuration ?? 0, phrase.cues?.at(-1)?.end ?? 0);
  const textPlan = phrase.text ? beatsFromText(phrase.text, sourceDuration, spacing) : null;
  const beats = textPlan ?? (phrase.cues ? beatsFromAudio(phrase.cues) : []);
  // Find the first accent close enough to contain this time. Plans are sorted
  // and the gesture windows cannot overlap.
  let lo = 0, hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (beats[mid].time < clipTime + offset - .34) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < beats.length; i++) {
    const beat = beats[i], peak = beat.time - offset;
    if (peak > clipTime + .35) break;
    if (peak < 0 || peak >= phrase.duration) continue;
    const start = Math.max(0, peak - .43 * beat.window);
    const end = Math.min(phrase.duration, peak + .57 * beat.window);
    if (clipTime >= start && clipTime < end) {
      return { intent: beat.intent, phase: (clipTime - start) / (end - start), slot: i, audioOnly: !textPlan };
    }
  }
  return undefined;
}
