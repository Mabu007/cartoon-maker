import { ProjectDocument, parseStoredProject, uid, type Project } from '../engine/schema.ts';
import { listLocal, forgetEditorSession, type ProjectOrganization, type SavedProject } from './projects.ts';

type ProjectRow = SavedProject & { scope:string; id:string };
let database: Promise<IDBDatabase> | undefined;
const observed=new Map<string,number|null>();
const warnings=new Set<string>(),reported=new Set<string>();
function warn(message:string){if(!reported.has(message)){reported.add(message);warnings.add(message);}}
export function takeDeviceWarnings(){const messages=[...warnings];warnings.clear();return messages;}
export function observeDeviceProject(scope:string,row:SavedProject){observed.set(rowKey(scope,row.project.id),row.updated);}
const rowKey=(scope:string,id:string)=>JSON.stringify([scope,id]);
const queues=new Map<string,Promise<unknown>>();
function serial<T>(scope:string,work:()=>Promise<T>):Promise<T>{
  const next=(queues.get(scope)??Promise.resolve()).catch(()=>{}).then(work);
  queues.set(scope,next);
  void next.finally(()=>{if(queues.get(scope)===next)queues.delete(scope);}).catch(()=>{});
  return next;
}
function checkVersion(scope:string,id:string,row?:ProjectRow){
  const prior=observed.get(rowKey(scope,id));
  if(observed.has(rowKey(scope,id))&&(prior===null||!row))throw Error('This cartoon was deleted. Save your work as a new cartoon or download a backup.');
  if(row&&prior!==undefined&&row.updated!==prior)
    throw Error('This cartoon was changed in another tab. Download a recovery backup before reopening it.');
}

function openStore() {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('sirvibe-projects',2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('projects')) {
        const store=db.createObjectStore('projects',{keyPath:['scope','id']});
        store.createIndex('scope','scope');
        db.createObjectStore('imports');
      }
      if(!db.objectStoreNames.contains('recovery'))db.createObjectStore('recovery',{keyPath:['scope','id']});
    };
    request.onsuccess=()=>{
      const store=request.result;
      store.onversionchange=()=>{store.close();database=undefined;};
      resolve(store);
    };
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Close other SIRVIBE tabs to upgrade local storage. Your existing projects are safe.'));
  }).catch(error=>{database=undefined;throw error;});
  return database;
}
const result=<T>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});

async function transaction<T>(stores:string[], mode:IDBTransactionMode, work:(tx:IDBTransaction)=>Promise<T>):Promise<T> {
  const db=await openStore();
  const tx=db.transaction(stores,mode);
  const completed=new Promise<void>((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error??new Error('Device storage write was interrupted.'));
  });
  try {
    const [value]=await Promise.all([work(tx),completed]);
    return value;
  } catch(error) {
    try {tx.abort();} catch { /* Transaction already settled. */ }
    throw error;
  }
}

function mergeRows(store:IDBObjectStore,scope:string,entries:SavedProject[],current:ProjectRow[]) {
  const prior=new Map(current.map(row=>[row.id,row]));
  for(const entry of entries) {
    let id=entry.project.id;
    const previous=prior.get(id);
    if(previous&&JSON.stringify(previous.project)===JSON.stringify(entry.project))continue;
    if(previous)id=uid(); // Preserve both versions during migration.
    const row={...entry,id,scope,project:{...entry.project,id}};
    store.put(row);prior.set(id,row);
  }
  return [...prior.values()];
}

function sortProjects(rows:ProjectRow[]):SavedProject[] {
  return rows.sort((a,b)=>b.updated-a.updated).map(({scope,id,...row})=>{
    if(!observed.has(rowKey(scope,id)))observeDeviceProject(scope,row);
    return row;
  });
}
async function readableRows(scope:string,rows:ProjectRow[]):Promise<ProjectRow[]>{
  const valid:ProjectRow[]=[];
  for(const row of rows){
    try {valid.push({...row,project:parseStoredProject(row.project)});}
    catch {
      warn('A damaged saved cartoon was isolated. Its original data is retained; an earlier save is recovered as a separate copy when available.');
      const prior=await previousDeviceProject(scope,row.id).catch(()=>undefined);
      if(!prior)continue;
      const recovered=await transaction(['projects','imports'],'readwrite',async tx=>{
        const imports=tx.objectStore('imports'),key='damaged-recovery/'+rowKey(scope,row.id)+'/'+row.updated;
        if(await result(imports.get(key)))return;
        const project=ProjectDocument.parse({...prior,id:uid(),name:prior.name.slice(0,80)+' · recovered'});
        const copy:ProjectRow={scope,id:project.id,project,updated:Date.now()};
        tx.objectStore('projects').put(copy);imports.put(copy.id,key);return copy;
      });
      if(recovered)valid.push(recovered);
    }
  }
  return valid;
}
async function ensureLegacyImported(scope:string){
  const legacyKey='legacy/'+scope;
  if(await transaction(['imports'],'readonly',tx=>result(tx.objectStore('imports').get(legacyKey))))return;
  let legacy:SavedProject[];
  try {
    legacy=listLocal(scope);
    const raw=JSON.parse(localStorage.getItem('toonroom.projects.v1.'+scope)??'[]');
    if(Array.isArray(raw)&&raw.length!==legacy.length)warn('Some earlier project entries could not be read. Their original browser data has been kept.');
  } catch {warn('An earlier project library could not be read. Its original data is retained; other saved cartoons are still available.');return;}
  await transaction(['projects','imports'],'readwrite',async tx=>{
    const store=tx.objectStore('projects'),imports=tx.objectStore('imports');
    if(await result(imports.get(legacyKey)))return;
    const current=await result<ProjectRow[]>(store.index('scope').getAll(scope));
    mergeRows(store,scope,legacy,current);imports.put(true,legacyKey);
  });
}
export async function listDeviceProjects(scope:string) {
  await ensureLegacyImported(scope);
  const rows=await transaction(['projects'],'readonly',tx=>result<ProjectRow[]>(tx.objectStore('projects').index('scope').getAll(scope)));
  return sortProjects(await readableRows(scope,rows));
}
/** Reading for an explicit open does not acknowledge a version until the
 * editor has accepted that snapshot. Background listing never resets a lock. */
export async function getDeviceProject(scope:string,id:string):Promise<SavedProject>{
  const row=await transaction(['projects'],'readonly',tx=>result<ProjectRow|undefined>(tx.objectStore('projects').get([scope,id])));
  if(!row)throw Error('This cartoon was deleted in another tab. Refresh your library.');
  const {scope:_scope,id:_id,...saved}=row;
  return {...saved,project:parseStoredProject(row.project)};
}
export async function saveDeviceProject(scope:string,project:Project) {
  const valid=ProjectDocument.parse(project);
  return serial(scope,async()=>{
    let saved:SavedProject;
    await transaction(['projects','recovery'],'readwrite',async tx=>{
      const store=tx.objectStore('projects'), id=valid.id;
      const previous=await result<ProjectRow|undefined>(store.get([scope,id]));
      checkVersion(scope,id,previous);
      if(previous&&JSON.stringify(previous.project)===JSON.stringify(valid)){saved={project:valid,updated:previous.updated,favorite:previous.favorite,collection:previous.collection};return;}
      if(previous)tx.objectStore('recovery').put(previous);
      saved={project:valid,updated:Math.max(Date.now(),(previous?.updated??0)+1),favorite:previous?.favorite,collection:previous?.collection};
      await result(store.put({...saved,id,scope}));
    });
    observeDeviceProject(scope,saved!);
    return saved!;
  });
}
/** Explicit cloud downloads always create copies; local movies are never replaced. */
export async function mergeDeviceProjects(scope:string,incoming:SavedProject[]) {
  await transaction(['projects'],'readwrite',async tx=>{
    const store=tx.objectStore('projects');
    for(const entry of incoming){
      const project=ProjectDocument.parse({...entry.project,id:uid(),name:(entry.project.name.slice(0,78)+' · cloud copy')});
      store.put({...entry,id:project.id,scope,project,updated:Date.now()});
    }
  });
  return listDeviceProjects(scope);
}
export async function previousDeviceProject(scope:string,id:string):Promise<Project|undefined>{
  const row=await transaction(['recovery'],'readonly',tx=>result<ProjectRow|undefined>(tx.objectStore('recovery').get([scope,id])));
  return row?parseStoredProject(row.project):undefined;
}
/** Bring earlier account-scoped local projects into the device library once,
 * retaining source rows and creating a copy if IDs conflict. No cloud call. */
export async function migrateDeviceLibrary(scope:string){
  const legacyScopes=new Set<string>();
  try {
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key?.startsWith('toonroom.projects.v1.'))legacyScopes.add(key.slice('toonroom.projects.v1.'.length));
    }
  } catch {warn('Browser preferences are unavailable. IndexedDB cartoons remain accessible.');}
  for(const source of legacyScopes)await ensureLegacyImported(source);
  try {
  const target='toonroom.worlds.v1.'+scope;
  const marker='sirvibe.worlds-migrated.v1.'+scope;
  if(!localStorage.getItem(marker)){
    const worlds=new Map<string,unknown>();
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key?.startsWith('toonroom.worlds.v1.'))continue;
      try {
        const entries:unknown=JSON.parse(localStorage.getItem(key)??'[]');
        if(Array.isArray(entries))for(const world of entries)worlds.set(JSON.stringify(world),world);
      } catch {warn('An earlier world preset could not be read. Its original data is retained.');}
    }
    if(worlds.size)localStorage.setItem(target,JSON.stringify([...worlds.values()]));
    localStorage.setItem(marker,'1');
  }
  } catch {warn('World presets could not be migrated. Original presets and saved cartoons have been retained.');}
  await transaction(['projects','imports'],'readwrite',async tx=>{
    const store=tx.objectStore('projects'),imports=tx.objectStore('imports');
    const keys=await result<IDBValidKey[]>(store.getAllKeys());
    for(const key of keys){
      const [source,id]=key as string[];
      if(source===scope)continue;
      const marker='device-migration/'+rowKey(source,id);
      if(await result(imports.get(marker)))continue;
      const row=(await result<ProjectRow>(store.get(key)));
      const current=await result<ProjectRow|undefined>(store.get([scope,row.id]));
      if(!current||JSON.stringify(current.project)!==JSON.stringify(row.project)){
        const id=current?uid():row.id;
        store.put({...row,scope,id,project:{...row.project,id}});
      }
      imports.put(true,marker);
    }
  });
}
async function editRow(scope:string,id:string,edit:(row:ProjectRow)=>ProjectRow) {
  return serial(scope,async()=>{
    const row=await transaction(['projects','recovery'],'readwrite',async tx=>{
      const store=tx.objectStore('projects');
      const previous=await result<ProjectRow|undefined>(store.get([scope,id]));
      if(!previous)throw new Error('Project not found on this device.');
      checkVersion(scope,id,previous);
      const row=edit(previous);
      tx.objectStore('recovery').put(previous);
      await result(store.put(row));
      return row;
    });
    observed.set(rowKey(scope,id),row.updated);
    return row.project;
  });
}
export const organizeDeviceProject=(scope:string,id:string,change:ProjectOrganization)=>
  editRow(scope,id,row=>({...row,...change}));
export const renameDeviceProject=(scope:string,id:string,name:string)=>
  editRow(scope,id,row=>({...row,project:ProjectDocument.parse({...row.project,name:name.trim()}),updated:Math.max(Date.now(),row.updated+1)}));
export async function removeDeviceProject(scope:string,id:string) {
  await serial(scope,()=>transaction(['projects','recovery'],'readwrite',async tx=>{
    const previous=await result<ProjectRow|undefined>(tx.objectStore('projects').get([scope,id]));
    checkVersion(scope,id,previous);
    await result(tx.objectStore('projects').delete([scope,id]));
    await result(tx.objectStore('recovery').delete([scope,id]));
  }));
  observed.set(rowKey(scope,id),null);
  forgetEditorSession(scope,id);
}

/** Explicit local reset: remove cartoons and recovery rows across local account scopes.
 * This is never called by startup/migration. Reusable art and external backups are independent. */
export async function clearAllDeviceProjects(){
  await Promise.all([...queues.values()].map(queue=>queue.catch(()=>{})));
  const prefixes=['toonroom.projects.v1.','toonroom.last-session.v1.','toonroom.editor-session.v1.'];
  const keys:string[]=[];
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&prefixes.some(prefix=>key.startsWith(prefix)))keys.push(key);}
  // Remove migration sources too, so a deleted cartoon cannot be re-imported on restart.
  for(const key of keys)localStorage.removeItem(key);
  await transaction(['projects','recovery','imports'],'readwrite',async tx=>{
    const rows=await result<ProjectRow[]>(tx.objectStore('projects').getAll());
    await Promise.all(['projects','recovery','imports'].map(name=>result(tx.objectStore(name).clear())));
    for(const row of rows)observed.set(rowKey(row.scope,row.id),null);
  });
}
