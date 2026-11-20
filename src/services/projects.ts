import { ProjectDocument, uid, type Project, type Scene } from '../engine/schema.ts';

export type SavedProject = { project: Project; updated: number };
const key = (scope: string) => `toonroom.projects.v1.${scope}`;
export function listLocal(scope: string): SavedProject[] {
  const value: unknown = JSON.parse(localStorage.getItem(key(scope)) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Saved projects could not be read.');
  const items: SavedProject[] = [];
  for (const entry of value) {
    const parsed = ProjectDocument.safeParse(entry?.project);
    if (parsed.success && Number.isFinite(entry?.updated)) items.push({ project: parsed.data, updated: entry.updated });
  }
  return items.sort((a, b) => b.updated - a.updated);
}
export function writeLocal(scope: string, items: SavedProject[]) { localStorage.setItem(key(scope), JSON.stringify(items)); }
export function saveLocal(scope: string, project: Project, updated = Date.now()) {
  const entries = listLocal(scope).filter(entry => entry.project.id !== project.id);
  const valid = ProjectDocument.parse(project);
  writeLocal(scope, [{ project: valid, updated }, ...entries]);
  return updated;
}
export function removeLocal(scope: string, id: string) { writeLocal(scope, listLocal(scope).filter(entry => entry.project.id !== id)); }
export function duplicateProject(project: Project): Project { return { ...structuredClone(project), id: uid(), name: `${project.name.slice(0, 92)} copy` }; }
export function duplicateScene(scene: Scene): Scene { return { ...structuredClone(scene), id: uid(), name: `${scene.name.slice(0, 64)} copy` }; }
