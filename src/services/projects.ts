import { ProjectDocument, parseStoredProject, uid, type Project, type Scene } from '../engine/schema.ts';

export type SavedProject = { project: Project; updated: number };
const key = (scope: string) => `toonroom.projects.v1.${scope}`;
function readLocal(scope: string): unknown[] {
  const value: unknown = JSON.parse(localStorage.getItem(key(scope)) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Saved projects could not be read.');
  return value;
}
function parseEntry(raw: unknown): SavedProject | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { project, updated } = raw as Partial<SavedProject>;
  if (typeof updated !== 'number' || !Number.isFinite(updated)) return;
  try { return { project: parseStoredProject(project), updated }; } catch { /* Preserve invalid entries without deleting user data. */ }
}
export function listLocal(scope: string): SavedProject[] {
  return readLocal(scope).map(parseEntry).filter(entry => entry !== undefined).sort((a, b) => b.updated - a.updated);
}
function writeLocal(scope: string, items: unknown[]) {
  localStorage.setItem(key(scope), JSON.stringify(items));
}
export function saveLocal(scope: string, project: Project, updated = Date.now()) {
  const valid = ProjectDocument.parse(project);
  const entries = readLocal(scope).filter(raw => {
    const entry = parseEntry(raw);
    if (entry?.project.id !== project.id) return true;
    updated = Math.max(updated, entry.updated + 1);
    return false;
  });
  writeLocal(scope, [{ project: valid, updated }, ...entries]);
  return updated;
}
export function mergeLocal(scope: string, remote: SavedProject[]) {
  const byId = new Map<string, SavedProject>();
  const unreadable: unknown[] = [];
  for (const raw of readLocal(scope)) {
    const entry = parseEntry(raw);
    if (entry) byId.set(entry.project.id, entry);
    else unreadable.push(raw);
  }
  let changed = false;
  for (const entry of remote) {
    if ((byId.get(entry.project.id)?.updated ?? -Infinity) >= entry.updated) continue;
    byId.set(entry.project.id, entry);
    changed = true;
  }
  const entries = [...byId.values()].sort((a, b) => b.updated - a.updated);
  if (changed) writeLocal(scope, [...entries, ...unreadable]);
  return entries;
}
export function removeLocal(scope: string, id: string) {
  writeLocal(scope, readLocal(scope).filter(raw => parseEntry(raw)?.project.id !== id));
}
export function duplicateProject(project: Project): Project { return { ...structuredClone(project), id: uid(), name: `${project.name.slice(0, 92)} copy` }; }
export function duplicateScene(scene: Scene): Scene { return { ...structuredClone(scene), id: uid(), name: `${scene.name.slice(0, 64)} copy` }; }
