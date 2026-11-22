import type { Action, Expression } from './schema.ts';
import { isSleep } from './performanceCatalog.ts';
import { clamp } from './animation.ts';
import type { Viseme, VisemeSample } from './visemes.ts';

export type FacialPerformance = {
  blink: number; gazeX: number; gazeY: number; mouthOpen: number; expression: Expression; viseme: Viseme; speaking: boolean;
  mouthFrom?: Viseme; mouthBlend?: number;
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
  speechCue?: VisemeSample,
  focus?: { x: number; y: number }
): FacialPerformance {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const seed = seedFrom(actorId);
  const period = expression === 'nervous' ? 2.08 + seed*.55 :
    expression === 'sleepy' ? 4.1 + seed*.5 : 2.75 + seed*1.25;
  const phase = ((t + seed*period) % period) / period;
  const baseBlink = clamp(1-Math.abs(phase-.72)/.045);
  const anxiousDouble = expression === 'nervous' ? clamp(1-Math.abs(phase-.83)/.035)*.88:0;
  const sleeping=isSleep(action);
  const blink = action==='cry'||sleeping?1:Math.max(baseBlink,anxiousDouble,action==='laugh'?.84:0);
  // Deterministic pupil microsaccades; explicit look targets always dominate.
  const micro=Math.sin(t*1.12+seed*11)*.14;
  const gazeX=focus ? clamp(focus.x,-1,1)*3.45+micro*.25 :
    Math.sin(t*.83+seed*11)*1.48+Math.sin(t*.3+seed*3)*.36;
  const gazeY=focus ? clamp(focus.y,-1,1)*2.45+
    Math.sin(t*.42+seed)*.09 : Math.sin(t*.6+seed*8)*.84;
  const expressive: Partial<Record<Action, Expression>> = {
    laugh: 'happy', cry: 'sad', angry: 'angry', surprise: 'surprised',
    think: 'thinking', shrug: 'confused', celebrate: 'excited'
  };
  const resolved: Expression = sleeping ? 'sleepy' : expression === 'neutral' ? expressive[action] ?? 'neutral' : expression;
  // Dialogue mouth movement is audio-driven; the Talk gesture does not flap
  // a silent character's jaw. Nonverbal Laugh may still animate expressively.
  const animationSpeech = action === 'laugh' ? .22 + .32 * (Math.sin(t * 10.2) ** 2) : action==='cry'?.28+.37*Math.sin(t*10.5)**2:action==='eat'?.18+.33*Math.sin(t*13)**2:sleeping?.14+.10*Math.sin(t*2):0;
  const speaking = Boolean(speechCue && speechCue.weight > 0);
  const envelope = clamp(Number.isFinite(audioAmplitude) ? audioAmplitude : 0);
  // Text supplies the viseme. Audio drives emphasis; silence closes the jaw.
  const mouthOpen = speechCue
    ? (speechCue.shape === 'rest' || speechCue.shape === 'closed' ? 0 :
      clamp(speechCue.weight * (.48 + .52 * Math.max(.32, envelope))))
    : clamp(Math.max(envelope, animationSpeech));
  return { blink, gazeX, gazeY, mouthOpen, expression: resolved,
    viseme: speechCue?.shape ?? (animationSpeech ? 'open' : 'rest'),
    mouthFrom:speechCue?.from,mouthBlend:speechCue?.blend,
    speaking: Boolean(speechCue) };
}
