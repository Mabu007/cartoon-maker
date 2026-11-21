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

const edgeCache = new WeakMap<MovieTiming, number[]>();
export function nextClipEdge(timing: MovieTiming, at: number, direction: -1|1) {
  let edges=edgeCache.get(timing);
  if(!edges){
    edges=[...new Set(timing.spans.flatMap(({scene,start,end})=>[
      start,end,...scene.clips.flatMap(clip=>[start+clip.start,start+clip.start+clip.length])
    ]))].sort((a,b)=>a-b);
    edgeCache.set(timing,edges);
  }
  const threshold=at+direction*.0001;
  let first=0, last=edges.length;
  while(first<last){
    const middle=(first+last)>>>1;
    if(direction===1?edges[middle]<=threshold:edges[middle]<threshold)first=middle+1;
    else last=middle;
  }
  return direction===1 ? edges[first]??timing.duration : edges[first-1]??0;
}
