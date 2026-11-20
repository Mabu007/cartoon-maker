import { ProjectDocument, parseStoredProject, uid, type Project, type Scene } from '../engine/schema.ts';

export type ProjectCollection = 'ideas' | 'in-production' | 'finished';
export type ProjectOrganization = { favorite?: boolean; collection?: ProjectCollection };
export type SavedProject = { project: Project; updated: number } & ProjectOrganization;
export type EditorSession = { projectId: string; sceneId: string; workspace: 'create' | 'write' | 'direct'; playhead: number };
const key = (scope: string) => `toonroom.projects.v1.${scope}`;
const sessionKey=(scope:string)=>`toonroom.last-session.v1.${scope}`;
const projectSessionKey=(scope:string,id:string)=>`toonroom.editor-session.v1.${scope}.${id}`;
const collections:readonly ProjectCollection[]=['ideas','in-production','finished'];

function readLocal(scope: string): unknown[] {
  const value: unknown = JSON.parse(localStorage.getItem(key(scope)) ?? '[]');
  if (!Array.isArray(value)) throw new Error('Saved projects could not be read.');
  return value;
}
function parseEntry(raw: unknown): SavedProject | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { project, updated, favorite, collection } = raw as Partial<SavedProject>;
  if (typeof updated !== 'number' || !Number.isFinite(updated)) return;
  try {
    return {
      project: parseStoredProject(project), updated,
      ...(typeof favorite === 'boolean' ? { favorite } : {}),
      ...(collection && collections.includes(collection) ? { collection } : {})
    };
  } catch { /* Preserve invalid entries without deleting user data. */ }
}
export function listLocal(scope: string): SavedProject[] {
  return readLocal(scope).map(parseEntry).filter(entry => entry !== undefined).sort((a, b) => b.updated - a.updated);
}
function writeLocal(scope: string, items: unknown[]) {
  localStorage.setItem(key(scope), JSON.stringify(items));
}
/** Do not discard per-project favorites/collections each time autosave runs. */
export function saveLocal(scope: string, project: Project, updated = Date.now()) {
  const valid = ProjectDocument.parse(project);
  let organization:ProjectOrganization={};
  const entries = readLocal(scope).filter(raw => {
    const entry = parseEntry(raw);
    if (entry?.project.id !== project.id) return true;
    updated = Math.max(updated, entry.updated + 1);
    organization={favorite:entry.favorite,collection:entry.collection};
    return false;
  });
  writeLocal(scope, [{ project: valid, updated, ...organization }, ...entries]);
  return updated;
}
export function updateProjectOrganization(scope:string,id:string,change:ProjectOrganization) {
  let found=false;
  const entries=readLocal(scope).map(raw=>{
    const entry=parseEntry(raw);
    if(entry?.project.id!==id)return raw;
    found=true;
    return {...entry,
      ...(change.favorite!==undefined?{favorite:change.favorite}:{}),
      ...(change.collection!==undefined?{collection:change.collection}:{})};
  });
  if(!found)throw new Error('Project not found in your saved library.');
  writeLocal(scope,entries);
  return listLocal(scope);
}
export function renameSavedProject(scope:string,id:string,name:string) {
  const trimmed=name.trim();
  if(!trimmed||trimmed.length>100)throw new Error('Movie title must be 1–100 characters.');
  const entry=listLocal(scope).find(item=>item.project.id===id);
  if(!entry)throw new Error('Project not found in your saved library.');
  const project=ProjectDocument.parse({...entry.project,name:trimmed});
  saveLocal(scope,project);
  return project;
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
    const previous=byId.get(entry.project.id);
    if ((previous?.updated ?? -Infinity) >= entry.updated) continue;
    byId.set(entry.project.id, {
      ...entry,
      // Project organization is local UI state and must survive cloud refreshes.
      favorite:previous?.favorite??entry.favorite,
      collection:previous?.collection??entry.collection
    });
    changed = true;
  }
  const entries = [...byId.values()].sort((a, b) => b.updated - a.updated);
  if (changed) writeLocal(scope, [...entries, ...unreadable]);
  return entries;
}
export function removeLocal(scope: string, id: string) {
  writeLocal(scope, readLocal(scope).filter(raw => parseEntry(raw)?.project.id !== id));
  const session=lastEditorSession(scope);
  if(session?.projectId===id)localStorage.removeItem(sessionKey(scope));
  localStorage.removeItem(projectSessionKey(scope,id));
}
function parseEditorSession(raw:string|null):EditorSession|undefined {
  try {
    const value=JSON.parse(raw??'null') as Partial<EditorSession>|null;
    if(!value||typeof value.projectId!=='string'||typeof value.sceneId!=='string'||
      !['create','write','direct'].includes(value.workspace??'')||
      typeof value.playhead!=='number'||!Number.isFinite(value.playhead)||
      value.playhead<0||value.playhead>180)return;
    return value as EditorSession;
  }catch{return;}
}
export function lastEditorSession(scope:string):EditorSession|undefined{
  return parseEditorSession(localStorage.getItem(sessionKey(scope)));
}
export function editorSessionFor(scope:string,projectId:string):EditorSession|undefined{
  const record=parseEditorSession(localStorage.getItem(projectSessionKey(scope,projectId)));
  return record?.projectId===projectId?record:undefined;
}
export function rememberEditorSession(scope:string,value:EditorSession){
  if(!Number.isFinite(value.playhead)||value.playhead<0)return;
  const record={...value,playhead:Math.min(180,value.playhead)};
  localStorage.setItem(projectSessionKey(scope,value.projectId),JSON.stringify(record));
  localStorage.setItem(sessionKey(scope),JSON.stringify(record));
}
export function duplicateProject(project: Project): Project {
  return { ...structuredClone(project), id: uid(), name: `${project.name.slice(0, 92)} copy` };
}
export function duplicateScene(scene: Scene): Scene {
  return { ...structuredClone(scene), id: uid(), name: `${scene.name.slice(0, 64)} copy` };
}
