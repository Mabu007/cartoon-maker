import type { Scene } from './schema.ts';

export function movieTiming(scenes: readonly Scene[]) {
  let duration = 0;
  const spans = scenes.map((scene, index) => {
    const start = duration;
    duration += scene.duration;
    return { scene, index, start, end: duration };
  });
  return { duration, spans, byId: new Map(spans.map(span => [span.scene.id, span])) };
}
export type MovieTiming = ReturnType<typeof movieTiming>;
export type MovieCursor = { at: number; reveal: boolean };

export function movieTicks(duration: number, pixelsPerSecond: number, from: number, to: number) {
  const intervals = [.25,.5,1,2,5,10,15,30,60,120,300,600,1200,1800];
  const step = intervals.find(value => value * pixelsPerSecond >= 58) ?? intervals.at(-1)!;
  const first = Math.max(0, Math.floor(from / step) * step);
  const last = Math.min(duration, to + step);
  const ticks = Array.from({ length: Math.max(0, Math.floor((last - first) / step) + 1) }, (_, i) => first + i * step);
  if (to >= duration - step && ticks.at(-1) !== duration) ticks.push(duration);
  return ticks;
}
