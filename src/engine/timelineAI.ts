import type { z } from 'zod';
import { timelineEdits } from './filmmakerAI.ts';
import { insertCameraShot, validateSceneReplacement } from './timelineCode.ts';
import { type Scene, type Project, type Clip } from './schema.ts';

export type TimelineEditProposal = z.infer<typeof timelineEdits>;

/** Apply only validated, explicit clip operations. Never execute model-generated code. */
export function applyTimelineEdits(project: Project, scene: Scene, proposal: TimelineEditProposal): Scene {
  const edits = timelineEdits.parse(proposal);
  let clips = [...scene.clips];
  const reserved = [...scene.actors, ...scene.objects].map(item => item.id);
  for (const edit of edits.edits) {
    if (edit.op === 'remove') {
      if (!clips.some(clip => clip.id === edit.clipId)) throw new Error(`Clip "${edit.clipId}" no longer exists.`);
      clips = clips.filter(clip => clip.id !== edit.clipId);
      continue;
    }
    if (edit.op === 'replace') {
      if (!clips.some(clip => clip.id === edit.clipId)) throw new Error(`Clip "${edit.clipId}" no longer exists.`);
      if (edit.clip.id !== edit.clipId) throw new Error('AI cannot rename an existing clip during a replacement.');
      const clip = edit.clip;
      clips = clip.track === 'camera' ? insertCameraShot(clips, clip, reserved) : clips.map(item => item.id === clip.id ? clip : item);
      continue;
    }
    if (clips.some(clip => clip.id === edit.clip.id)) throw new Error(`Clip "${edit.clip.id}" already exists.`);
    clips = edit.clip.track === 'camera' ? insertCameraShot(clips, edit.clip, reserved) : [...clips, edit.clip];
  }
  return validateSceneReplacement(project, scene.id, { ...scene, clips });
}
