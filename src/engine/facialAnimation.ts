import type { Action, Expression } from './schema.ts';
import { clamp } from './animation.ts';
import type { Viseme } from './visemes.ts';

export type FacialPerformance = {
  blink: number; gazeX: number; gazeY: number; mouthOpen: number; expression: Expression; viseme: Viseme; speaking: boolean;
};

// Pure, time-based facial performance: every preview/export frame is repeatable,
// and different actors do not blink in sync.
function seedFrom(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 0xffffffff;
}
export function facialPerformance(
  time: number,
  actorId: string,
  action: Action,
  expression: Expression,
  audioAmplitude = 0,
  speechCue?: { shape: Viseme; weight: number },
  focus?: { x: number; y: number }
): FacialPerformance {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const seed = seedFrom(actorId);
  const period = 2.75 + seed * 1.25;
  const phase = ((t + seed * period) % period) / period;
  const blink = clamp(1 - Math.abs(phase - .73) / .046);
  // Conversational eye contact takes precedence over idle roaming.
  // A few tiny glances and emotionally driven departures prevent a stare.
  const cycle = (t + seed) % 4.3;
  const eyeBreak = focus && cycle > 3.78 && cycle < 4.09 ? .53 : 1;
  const glance = Math.sin(t * .94 + seed * 11) * (focus ? .28 : 1.6);
  const gazeX = focus ? clamp(focus.x, -1, 1) * 3.6 * eyeBreak + glance
    : Math.sin(t * .94 + seed * 11) * 1.6 + Math.sin(t * .29 + seed * 4) * .8;
  const gazeY = focus ? clamp(focus.y, -1, 1) * 2.35 * eyeBreak + Math.sin(t * .48 + seed) * .21
    : Math.sin(t * .71 + seed * 8) * 1.1;
  const expressive: Partial<Record<Action, Expression>> = {
    laugh: 'happy', cry: 'sad', angry: 'angry', surprise: 'surprised',
    think: 'thinking', shrug: 'confused', celebrate: 'excited'
  };
  const resolved: Expression = expression === 'neutral' ? expressive[action] ?? 'neutral' : expression;
  // Dialogue mouth movement is audio-driven; the Talk gesture does not flap
  // a silent character's jaw. Nonverbal Laugh may still animate expressively.
  const animationSpeech = action === 'laugh' ? .22 + .32 * (Math.sin(t * 10.2) ** 2) : 0;
  const speaking = Boolean(speechCue && speechCue.weight > 0);
  const envelope = clamp(Number.isFinite(audioAmplitude) ? audioAmplitude : 0);
  // Text supplies the viseme. Audio drives emphasis; silence closes the jaw.
  const mouthOpen = speechCue
    ? (speechCue.shape === 'rest' || speechCue.shape === 'closed' ? 0 :
      clamp(speechCue.weight * (.48 + .52 * Math.max(.32, envelope))))
    : clamp(Math.max(envelope, animationSpeech));
  return { blink, gazeX, gazeY, mouthOpen, expression: resolved,
    viseme: speechCue?.shape ?? (animationSpeech ? 'open' : 'rest'),
    speaking: Boolean(speechCue) };
}
