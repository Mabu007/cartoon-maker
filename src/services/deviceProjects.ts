import { ProjectDocument, parseStoredProject, uid, type Project } from '../engine/schema.ts';
import { listLocal, forgetEditorSession, type ProjectOrganization, type SavedProject } from './projects.ts';

type ProjectRow = SavedProject & { scope:string; id:string };
let database: Promise<IDBDatabase> | undefined;
const observed=new Map<string,number>();
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
    const project=parseStoredProject(row.project);
    if(!observed.has(rowKey(scope,id)))observed.set(rowKey(scope,id),row.updated);
    return {...row,project};
  });
}

export async function listDeviceProjects(scope:string) {
  const legacyKey='legacy/'+scope;
  const initialized=await transaction(['imports'],'readonly',tx=>result(tx.objectStore('imports').get(legacyKey)));
  if(!initialized) {
    const legacy=listLocal(scope);
    const rows=await transaction(['projects','imports'],'readwrite',async tx=>{
      const store=tx.objectStore('projects'), imports=tx.objectStore('imports');
      const [current,imported]=await Promise.all([result<ProjectRow[]>(store.index('scope').getAll(scope)),result(imports.get(legacyKey))]);
      if(imported)return current;
      imports.put(true,legacyKey);
      return mergeRows(store,scope,legacy,current);
    });
    return sortProjects(rows);
  }
  return sortProjects(await transaction(['projects'],'readonly',tx=>result<ProjectRow[]>(tx.objectStore('projects').index('scope').getAll(scope))));
}
export async function saveDeviceProject(scope:string,project:Project) {
  const valid=ProjectDocument.parse(project);
  return serial(scope,async()=>{
    let updated=0;
    await transaction(['projects','recovery'],'readwrite',async tx=>{
      const store=tx.objectStore('projects'), id=valid.id;
      const previous=await result<ProjectRow|undefined>(store.get([scope,id]));
      checkVersion(scope,id,previous);
      if(previous&&JSON.stringify(previous.project)===JSON.stringify(valid)){updated=previous.updated;return;}
      if(previous)tx.objectStore('recovery').put(previous);
      updated=Math.max(Date.now(),(previous?.updated??0)+1);
      await result(store.put({...previous,id,scope,project:valid,updated}));
    });
    observed.set(rowKey(scope,valid.id),updated);
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
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith('toonroom.projects.v1.'))legacyScopes.add(key.slice('toonroom.projects.v1.'.length));
  }
  for(const source of legacyScopes)await listDeviceProjects(source);
  const target='toonroom.worlds.v1.'+scope;
  const marker='sirvibe.worlds-migrated.v1.'+scope;
  if(!localStorage.getItem(marker)){
    const worlds=new Map<string,unknown>();
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key?.startsWith('toonroom.worlds.v1.'))continue;
      const entries:unknown=JSON.parse(localStorage.getItem(key)??'[]');
      if(Array.isArray(entries))for(const world of entries)worlds.set(JSON.stringify(world),world);
    }
    if(worlds.size)localStorage.setItem(target,JSON.stringify([...worlds.values()]));
    localStorage.setItem(marker,'1');
  }
  await transaction(['projects','imports'],'readwrite',async tx=>{
    const store=tx.objectStore('projects'),imports=tx.objectStore('imports');
    const all=await result<ProjectRow[]>(store.getAll());
    for(const row of all){
      if(row.scope===scope)continue;
      const marker='device-migration/'+rowKey(row.scope,row.id);
      if(await result(imports.get(marker)))continue;
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
  observed.delete(rowKey(scope,id));
  forgetEditorSession(scope,id);
}
