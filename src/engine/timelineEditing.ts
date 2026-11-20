import { movementPosition } from './evaluate.ts';
import { insertCameraShot } from './timelineCode.ts';
import { uid, type Clip, type Scene, type Track } from './schema.ts';

const MIN = .1;
const rounding = (n: number) => Math.round(n * 1000) / 1000;
export const trackIsLocked = (scene: Scene, track: Track) => !!scene.trackSettings?.[track]?.locked;
export const compatibleTrack = (source: Track, target: Track) => source === target ||
  ((source === 'audio' || source === 'music') && (target === 'audio' || target === 'music'));

export function selectableClips(scene: Scene, ids: string[]): Clip[] {
  const requested = new Set(ids);
  return scene.clips.filter(clip => requested.has(clip.id));
}
export function selectClipRange(scene: Scene, existing: string[], anchor: string | undefined, clicked: string, shift = false, toggle = false): string[] {
  const ordered = [...scene.clips].sort((a,b) => a.start - b.start || a.id.localeCompare(b.id)).map(clip => clip.id);
  if (!ordered.includes(clicked)) return existing;
  if (shift && anchor && ordered.includes(anchor)) {
    const a = ordered.indexOf(anchor), b = ordered.indexOf(clicked);
    return [...new Set([...existing, ...ordered.slice(Math.min(a,b), Math.max(a,b)+1)])];
  }
  return toggle ? (existing.includes(clicked) ? existing.filter(id => id !== clicked) : [...existing, clicked]) : [clicked];
}
export function snapTime(time: number, guides: number[], pixelsPerSecond: number, enabled = true, thresholdPx = 9) {
  if (!enabled || pixelsPerSecond <= 0) return rounding(time);
  let closest = time, distance = thresholdPx / pixelsPerSecond;
  for (const guide of guides) {
    const delta = Math.abs(time - guide);
    if (delta <= distance) { closest = guide; distance = delta; }
  }
  return rounding(closest);
}
export function snapGuides(scene: Scene, playhead: number, exclude: string[] = []) {
  const skip = new Set(exclude);
  return [0, scene.duration, playhead, ...(scene.markers ?? []).map(marker => marker.time), ...scene.clips.filter(c => !skip.has(c.id)).flatMap(clip => [clip.start, clip.start + clip.length])];
}
export function resizeSceneTimeline(scene: Scene, duration: number): Scene {
  if (!Number.isFinite(duration) || duration < 1 || duration > 180) throw new Error('Scene duration must be between 1 and 180 seconds.');
  const length = rounding(duration);
  return { ...scene, duration: length,
    clips: scene.clips.flatMap(clip => {
      if (clip.start >= length - MIN + 1e-8) return [];
      const trimmed = Math.min(clip.length, length - clip.start);
      return trimmed >= MIN - 1e-8 ? [{ ...clip, length: rounding(trimmed) }] : [];
    }),
    markers: scene.markers?.filter(marker => marker.time <= length)
  };
}
export function assertTracksUnlocked(scene: Scene, ids: string[], destination?: Track) {
  const selected = selectableClips(scene, ids);
  if (selected.some(clip => trackIsLocked(scene, clip.track)) || (destination && trackIsLocked(scene, destination)))
    throw new Error('Unlock the track before editing its clips.');
}
function segmentedKeys(clip: Extract<Clip, { track: 'movement' }>, a: number, b: number) {
  if (!clip.keyframes) return undefined;
  const keys = [a, ...clip.keyframes.map(key=>key.time).filter(t=>t>a+1e-8 && t<b-1e-8), b];
  return keys.map(t => ({time: rounding((t-a)/(b-a)), ...movementPosition(clip,t)}));
}
function splitOne(clip: Clip, at: number): [Clip,Clip] {
  const leftLength = rounding(at - clip.start), rightLength = rounding(clip.start + clip.length - at);
  const left: Clip = { ...clip, length: leftLength };
  let right: Clip = { ...clip, id: uid(), start: rounding(at), length: rightLength };
  if ('offset' in right) right = { ...right, offset: Math.min(180, rounding(right.offset + leftLength)) };
  if (clip.track === 'movement' && right.track === 'movement') {
    const alpha = leftLength / clip.length;
    const middle = movementPosition(clip, alpha);
    const initial = movementPosition(clip, 0), finish = movementPosition(clip, 1);
    return [
      { ...clip, length: leftLength, fromX: initial.x, fromY: initial.y, toX: middle.x, toY: middle.y, keyframes: segmentedKeys(clip, 0, alpha) },
      { ...right, fromX: middle.x, fromY: middle.y, toX: finish.x, toY: finish.y, keyframes: segmentedKeys(clip, alpha, 1) }
    ];
  }
  return [left,right];
}
export function splitTimelineClips(scene: Scene, ids: string[], at: number): { scene: Scene; added: string[] } {
  assertTracksUnlocked(scene, ids);
  const chosen = new Set(ids);
  const added: string[] = [];
  const clips = scene.clips.flatMap(clip => {
    if (!chosen.has(clip.id) || at <= clip.start + MIN - 1e-8 || at >= clip.start + clip.length - MIN + 1e-8) return [clip];
    const [left,right] = splitOne(clip, at);
    added.push(right.id); return [left,right];
  });
  return { scene: { ...scene, clips }, added };
}
export function deleteTimelineClips(scene: Scene, ids: string[]) {
  assertTracksUnlocked(scene, ids);
  const chosen = new Set(ids);
  return { ...scene, clips: scene.clips.filter(clip => !chosen.has(clip.id)) };
}
export function deleteMovementKeyframe(scene: Scene, target: {clipId: string; index: number}) {
  const clip = scene.clips.find(clip=>clip.id === target.clipId);
  if (!clip || clip.track !== 'movement' || !clip.keyframes) throw new Error('Keyframe no longer exists.');
  assertTracksUnlocked(scene,[clip.id]);
  if (target.index === 0 || target.index === clip.keyframes.length-1) throw new Error('The first and last keyframes are required. Delete the movement clip instead.');
  if (clip.keyframes.length <= 2) throw new Error('Movement requires two keyframes.');
  return { ...scene, clips: scene.clips.map(c=>c.id===clip.id ? { ...clip, keyframes: clip.keyframes!.filter((_,i)=>i!==target.index) } : c) };
}
export function moveTimelineClips(scene: Scene, ids: string[], delta: number, destination?: Track): Scene {
  const chosen = selectableClips(scene, ids);
  if (!chosen.length) return scene;
  assertTracksUnlocked(scene, ids, destination);
  if (destination && chosen.some(clip=>!compatibleTrack(clip.track, destination))) throw new Error('Clips can only move to compatible tracks.');
  const minStart = Math.min(...chosen.map(clip=>clip.start));
  const maxEnd = Math.max(...chosen.map(clip=>clip.start+clip.length));
  const bounded = Math.max(-minStart, Math.min(scene.duration-maxEnd, delta));
  const selected = new Set(ids);
  let clips: Clip[] = scene.clips.filter(c=>!selected.has(c.id));
  for (const clip of chosen) {
    const start = rounding(clip.start + bounded);
    const moved: Clip = { ...clip, start, ...(destination && clip.track !== destination ? {track: destination} : {}) } as Clip;
    if (moved.track === 'camera') clips = insertCameraShot(clips, moved);
    else clips.push(moved);
  }
  return { ...scene, clips };
}
export function trimTimelineClip(scene: Scene, id: string, edge: 'in'|'out', nextTime: number): Scene {
  const clip = scene.clips.find(c=>c.id===id);
  if (!clip) return scene;
  assertTracksUnlocked(scene,[id]);
  const beginning = edge === 'in' ? Math.min(clip.start+clip.length-MIN, Math.max(0, nextTime)) : clip.start;
  const ending = edge === 'out' ? Math.min(scene.duration, Math.max(clip.start+MIN, nextTime)) : clip.start+clip.length;
  const length = rounding(ending-beginning);
  const start = rounding(beginning);
  let edited: Clip = { ...clip, start, length };
  if ('offset' in edited && edge==='in') edited = {...edited, offset: Math.min(180,rounding(edited.offset+start-clip.start))};
  if (clip.track === 'movement' && edited.track === 'movement') {
    const a=(start-clip.start)/clip.length,b=(ending-clip.start)/clip.length;
    const from=movementPosition(clip,a),to=movementPosition(clip,b);
    edited={ ...edited, fromX:from.x,fromY:from.y,toX:to.x,toY:to.y,keyframes:segmentedKeys(clip,a,b) };
  }
  const clips=scene.clips.filter(c=>c.id!==id);
  return {...scene, clips: edited.track==='camera' ? insertCameraShot(clips,edited) : [...clips,edited]};
}
export function pasteTimelineClips(scene: Scene, source: Clip[], position: number): {scene:Scene;ids:string[]} {
  if (!source.length) return {scene,ids:[]};
  const earliest=Math.min(...source.map(c=>c.start));
  const length=Math.max(...source.map(c=>c.start+c.length))-earliest;
  if (length>scene.duration) throw new Error('Copied clips are longer than the scene.');
  const origin=Math.max(0, Math.min(scene.duration-length, position));
  let clips=[...scene.clips];const ids:string[]=[];
  const reserved=[...scene.actors,...scene.objects].map(item=>item.id);
  for(const clip of source){
    const fresh={...clip,id:uid(),start:rounding(origin+clip.start-earliest)} as Clip;
    if (trackIsLocked(scene,fresh.track)) throw new Error('Unlock the destination track to paste.');
    clips=fresh.track==='camera' ? insertCameraShot(clips,fresh,reserved) : [...clips,fresh];
    ids.push(fresh.id);
  }
  return {scene:{...scene,clips},ids};
}
export function duplicateTimelineClips(scene: Scene, ids: string[]): {scene:Scene;ids:string[]} {
  const chosen=selectableClips(scene,ids);
  assertTracksUnlocked(scene,ids);
  const origin=Math.max(...chosen.map(c=>c.start+c.length),0);
  return pasteTimelineClips(scene,chosen,origin);
}
