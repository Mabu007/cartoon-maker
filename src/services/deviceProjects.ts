import { ProjectDocument, type Project } from '../engine/schema.ts';
import { listLocal, forgetEditorSession, type ProjectOrganization, type SavedProject } from './projects.ts';

type ProjectRow = SavedProject & { scope:string; id:string };
let database: Promise<IDBDatabase> | undefined;

function openStore() {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('sirvibe-projects',1);
    request.onupgradeneeded=()=>{
      const store=request.result.createObjectStore('projects',{keyPath:['scope','id']});
      store.createIndex('scope','scope');
      request.result.createObjectStore('imports');
    };
    request.onsuccess=()=>{
      const store=request.result;
      store.onversionchange=()=>{store.close();database=undefined;};
      resolve(store);
    };
    request.onerror=()=>reject(request.error);
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
    const id=entry.project.id, previous=prior.get(id);
    if(previous && previous.updated>=entry.updated)continue;
    const row={...entry,id,scope,favorite:previous?.favorite??entry.favorite,collection:previous?.collection??entry.collection};
    store.put(row);prior.set(id,row);
  }
  return [...prior.values()];
}

function sortProjects(rows:ProjectRow[]):SavedProject[] {
  return rows.sort((a,b)=>b.updated-a.updated).map(({scope:_scope,id:_id,...row})=>row);
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
  await transaction(['projects'],'readwrite',async tx=>{
    const store=tx.objectStore('projects'), id=valid.id;
    const previous=await result<ProjectRow|undefined>(store.get([scope,id]));
    const row:ProjectRow={...previous,id,scope,project:valid,updated:Math.max(Date.now(),(previous?.updated??0)+1)};
    await result(store.put(row));
  });
}
export async function mergeDeviceProjects(scope:string,incoming:SavedProject[]) {
  return sortProjects(await transaction(['projects'],'readwrite',async tx=>{
    const store=tx.objectStore('projects');
    const rows=await result<ProjectRow[]>(store.index('scope').getAll(scope));
    return mergeRows(store,scope,incoming,rows);
  }));
}
async function editRow(scope:string,id:string,edit:(row:ProjectRow)=>ProjectRow) {
  return transaction(['projects'],'readwrite',async tx=>{
    const store=tx.objectStore('projects');
    const previous=await result<ProjectRow|undefined>(store.get([scope,id]));
    if(!previous)throw new Error('Project not found on this device.');
    const row=edit(previous);
    await result(store.put(row));
    return row.project;
  });
}
export const organizeDeviceProject=(scope:string,id:string,change:ProjectOrganization)=>
  editRow(scope,id,row=>({...row,...change}));
export const renameDeviceProject=(scope:string,id:string,name:string)=>
  editRow(scope,id,row=>({...row,project:ProjectDocument.parse({...row.project,name:name.trim()}),updated:Math.max(Date.now(),row.updated+1)}));
export async function removeDeviceProject(scope:string,id:string) {
  await transaction(['projects'],'readwrite',tx=>result(tx.objectStore('projects').delete([scope,id])));
  forgetEditorSession(scope,id);
}
