import type { Action, Expression } from './schema.ts';
import { clamp } from './animation.ts';

export type FacialPerformance = {
  blink: number; gazeX: number; gazeY: number; mouthOpen: number; expression: Expression;
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
  audioAmplitude = 0
): FacialPerformance {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const seed = seedFrom(actorId);
  const period = 2.75 + seed * 1.25;
  const phase = ((t + seed * period) % period) / period;
  const blink = clamp(1 - Math.abs(phase - .73) / .046);
  const gazeX = Math.sin(t * .94 + seed * 11) * 2.0 + Math.sin(t * .29 + seed * 4) * 1.05;
  const gazeY = Math.sin(t * .71 + seed * 8) * 1.25;
  const expressive: Partial<Record<Action, Expression>> = {
    laugh: 'happy', cry: 'sad', angry: 'angry', surprise: 'surprised',
    think: 'thinking', shrug: 'confused', celebrate: 'excited'
  };
  const resolved: Expression = expression === 'neutral' ? expressive[action] ?? 'neutral' : expression;
  const animationSpeech = action === 'talk'
    ? .36 + .45 * (Math.sin(t * 15.1 + seed * 7) ** 2)
    : action === 'laugh' ? .22 + .32 * (Math.sin(t * 10.2) ** 2) : 0;
  const mouthOpen = clamp(Math.max(Number.isFinite(audioAmplitude) ? audioAmplitude : 0, animationSpeech));
  return { blink, gazeX, gazeY, mouthOpen, expression: resolved };
}
