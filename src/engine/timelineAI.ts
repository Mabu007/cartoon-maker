import type { z } from 'zod';
import { timelineEdits } from './filmmakerAI.ts';
import { insertCameraShot, parseSceneCode } from './timelineCode.ts';
import { type Scene, type Project, type Clip } from './schema.ts';

export type TimelineEditProposal = z.infer<typeof timelineEdits>;

/** Apply only validated, explicit clip operations. Never execute model-generated code. */
export function applyTimelineEdits(project: Project, scene: Scene, proposal: TimelineEditProposal): Scene {
  const edits = timelineEdits.parse(proposal);
  let clips = [...scene.clips];
  for (const edit of edits.edits) {
    if (edit.op === 'remove') {
      if (!clips.some(clip => clip.id === edit.clipId)) throw new Error(`Clip "${edit.clipId}" no longer exists.`);
      clips = clips.filter(clip => clip.id !== edit.clipId);
      continue;
    }
    if (edit.op === 'replace') {
      if (!clips.some(clip => clip.id === edit.clipId)) throw new Error(`Clip "${edit.clipId}" no longer exists.`);
      if (edit.clip.id !== edit.clipId) throw new Error('AI cannot rename an existing clip during a replacement.');
      const without = clips.filter(clip => clip.id !== edit.clipId);
      clips = edit.clip.track === 'camera' ? insertCameraShot(without, edit.clip) : [...without, edit.clip];
      continue;
    }
    if (clips.some(clip => clip.id === edit.clip.id)) throw new Error(`Clip "${edit.clip.id}" already exists.`);
    clips = edit.clip.track === 'camera' ? insertCameraShot(clips, edit.clip) : [...clips, edit.clip];
  }
  const next = { ...scene, clips: clips.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)) };
  return parseSceneCode(JSON.stringify({ schemaVersion: 1, scene: next }), project, scene.id);
}
