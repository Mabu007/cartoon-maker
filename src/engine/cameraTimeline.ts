import type { Clip, Scene } from './schema.ts';

/** A cinematic scene has exactly one camera image at a given frame.
 * Treat timeline segments as half-open intervals [start, end).
 */
export type CameraClip = Extract<Clip, { track: 'camera' }>;
export const MIN_CAMERA_LENGTH = 0.1;
const EPS = 0.000001;
const endOf = (clip: CameraClip) => clip.start + clip.length;
export function cameraConflicts(clips: Clip[]): string[] {
  const cameras = clips.filter((clip): clip is CameraClip => clip.track === 'camera')
    .sort((a, b) => a.start - b.start || endOf(a) - endOf(b));
  const issues: string[] = [];
  for (let i = 0; i < cameras.length; i++) {
    const first = cameras[i];
    for (let j = i + 1; j < cameras.length && cameras[j].start < endOf(first) - EPS; j++) {
      issues.push('Camera shots "' + first.id + '" and "' + cameras[j].id + '" overlap. Only one camera can be active at a time.');
    }
  }
  return issues;
}

/** Deterministic overwrite editing. Remove just the covered interval while
 * retaining valid portions of older shots, splitting a surrounding shot when needed.
 * Replacing an existing shot never retains its superseded duration.
 */
export function insertCameraShot(clips: Clip[], incoming: CameraClip, reservedIds: string[] = []): Clip[] {
  if (!Number.isFinite(incoming.start) || !Number.isFinite(incoming.length) || incoming.length < MIN_CAMERA_LENGTH - EPS)
    throw new Error('Camera shots must have a valid start and at least 0.1 seconds of duration.');
  const start = incoming.start, end = endOf(incoming);
  const reserved = new Set([...reservedIds, ...clips.map(clip => clip.id), incoming.id]);
  const allocate = (base: string) => {
    let index = 1;
    let value = '';
    do {
      const suffix = '-after-' + index++;
      value = base.slice(0, Math.max(1, 100 - suffix.length)) + suffix;
    } while (reserved.has(value));
    reserved.add(value);
    return value;
  };
  const result: Clip[] = [];
  let replacementIndex = -1;
  for (const clip of clips) {
    if (clip.id === incoming.id) {
      replacementIndex = result.length;
      continue;
    }
    if (clip.track !== 'camera') { result.push(clip); continue; }
    const clipEnd = endOf(clip);
    if (clipEnd <= start + EPS || clip.start >= end - EPS) { result.push(clip); continue; }
    const before = start - clip.start, after = clipEnd - end;
    const keepBefore = before >= MIN_CAMERA_LENGTH - EPS;
    const keepAfter = after >= MIN_CAMERA_LENGTH - EPS;
    if (keepBefore) result.push({ ...clip, length: before });
    if (keepAfter) result.push({
      ...clip, id: keepBefore ? allocate(clip.id) : clip.id,
      start: end, length: after
    });
  }
  if (replacementIndex >= 0) result.splice(Math.min(replacementIndex, result.length), 0, incoming);
  else result.push(incoming);
  return result;
}

/** For persisted pre-enforcement projects only: later camera clips win, like
 * the previous renderer's implicit "latest" rule. Preserve all visible regions.
 * Fresh editing and code imports must validate and reject raw overlaps instead.
 */
export function normalizeCameraTimeline(scene: Scene): Scene {
  if (!cameraConflicts(scene.clips).length) return scene;
  const resolved: Clip[] = [];
  for (const clip of scene.clips) {
    if (clip.track === 'camera') {
      const next = insertCameraShot(resolved, clip, [...scene.actors, ...scene.objects].map(item => item.id));
      resolved.splice(0, resolved.length, ...next);
    } else resolved.push(clip);
  }
  return { ...scene, clips: resolved };
}
