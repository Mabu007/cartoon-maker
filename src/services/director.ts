import { directorSchema } from '../engine/directorSchema.ts';
import { ProjectDocument, uid, type Clip, type Project, type Scene } from '../engine/schema.ts';
import { makeProject, makeScene } from '../engine/presets.ts';
import type { Account } from './cloud.ts';
import { audioLength, putAudio } from './audio.ts';
import type { SpeechProvider } from './speech.ts';

export interface Director { example(): Project; generate?(story: string): Promise<Project>; }
export const exampleDirector: Director = { example: () => ProjectDocument.parse(makeProject(true)) };

export function hostedDirector(account: Account, speech: SpeechProvider): Director {
  return { ...exampleDirector, async generate(story) {
    const response = await fetch('/api/director', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await account.getIdToken()}` }, body: JSON.stringify({ story }) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'The director service is unavailable.');
    const plan = directorSchema.parse(await response.json());
    const project = makeProject();
    const scene = makeScene(plan.world);
    scene.actors = plan.cast.map(item => ({ id: item.character, characterId: item.character, x: item.x, y: item.y, flip: item.mirror, view: 'three-quarter', scale: 1, expression: 'neutral', rotation: 0, depth: 0 }));
    const clips: Clip[] = [];
    for (const event of plan.events) {
      const base = { id: uid(), start: event.start, length: event.length };
      const performer = { actor: event.actor };
      if (event.type === 'action') clips.push({ ...base, ...performer, track: 'body', action: event.action, layer: 'body' });
      if (event.type === 'expression') clips.push({ ...base, ...performer, track: 'face', expression: event.expression });
      if (event.type === 'camera') clips.push({ ...base, track: 'camera', shot: event.shot, focus: event.actor, transition: 'cut' });
      if (event.type === 'move') {
        const y = scene.actors.find(item => item.id === event.actor)!.y;
        clips.push({ ...base, ...performer, track: 'movement', fromX: event.from, toX: event.to, fromY: y, toY: y });
      }
      if (event.type === 'dialogue') {
        const blob = await speech.synthesize(event.line, event.actor === 'zee' || event.actor === 'tumi' ? 'bright' : 'deep');
        const asset = uid();
        await putAudio(asset, blob);
        const length = Math.max(.1, Math.min(30 - base.start, Math.max(await audioLength(blob), base.length)));
        clips.push({ ...base, ...performer, length, track: 'dialogue', text: event.line, asset: `asset:${asset}`, offset: 0, volume: 1, muted: false });
      }
    }
    return ProjectDocument.parse({ ...project, name: plan.title, scenes: [{ ...scene, clips } satisfies Scene] });
  } };
}
