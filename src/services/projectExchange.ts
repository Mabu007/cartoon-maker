import { z } from 'zod';
import { ProjectDocument, parseStoredProject, uid, type Project } from '../engine/schema.ts';
import { getOrFetchAudio, projectAssets, putAudio } from './audio.ts';

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const fileName = (name: string) => name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-|-$/g, '') || 'Toonroom';

const backup = z.strictObject({
  format: z.literal('toonroom-backup-1'), project: z.unknown(),
  audio: z.record(z.string().regex(/^[a-zA-Z0-9-]+$/), z.strictObject({ type: z.string().max(100), data: z.string() }))
});
function asData(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
export async function backupMovie(project: Project) {
  const audio: z.infer<typeof backup>['audio'] = {};
  for (const id of projectAssets(project)) {
    const file = await getOrFetchAudio(id);
    if (!file) throw new Error(`Missing audio ${id}. Reopen the original project to restore it first.`);
    audio[id] = { type: file.type, data: await asData(file) };
  }
  download(`${fileName(project.name)}.toonroom.json`, new Blob([JSON.stringify({ format: 'toonroom-backup-1', project, audio })], { type: 'application/json' }));
}
export async function restoreMovie(file: File) {
  if (file.size > 160_000_000) throw new Error('This backup is larger than 160 MB.');
  const document = backup.parse(JSON.parse(await file.text()));
  const project = parseStoredProject(document.project);
  for (const id of projectAssets(project)) if (!Object.hasOwn(document.audio, id)) throw new Error('The project backup is missing audio.');
  const mapping = new Map<string, string>();
  const files = projectAssets(project).map(id => {
    const { type, data } = document.audio[id];
    const bytes = Uint8Array.from(atob(data), value => value.charCodeAt(0));
    const fresh = uid();
    mapping.set(id, fresh);
    return [fresh, new Blob([bytes], { type })] as const;
  });
  for (const [id, blob] of files) await putAudio(id, blob);
  const remap = (asset: string) => mapping.has(asset.slice(6)) && asset.startsWith('asset:') ? `asset:${mapping.get(asset.slice(6))}` : asset;
  return ProjectDocument.parse({ ...project, id: uid(), scenes: project.scenes.map(scene => ({ ...scene,
    clips: scene.clips.map(clip => 'asset' in clip ? { ...clip, asset: remap(clip.asset) } : clip) })),
    ...(project.production ? { production: { ...project.production, graph: project.production.graph.map(record => ({ ...record,
      events: Object.fromEntries(Object.entries(record.events).map(([id, event]) => {
        const clip = JSON.parse(event.signature);
        if (typeof clip.asset === 'string') clip.asset = remap(clip.asset);
        return [id, { ...event, signature: JSON.stringify(clip) }];
      })) })) } } : {}) });
}
