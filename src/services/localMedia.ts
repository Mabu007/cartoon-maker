/** Immutable OPFS files with an IndexedDB commit record. A failed write never
 * replaces the previous asset. IndexedDB blobs are the cross-browser fallback. */
type Entry = { blob?: Blob; path?: string; type: string; size: number };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('sirvibe-media',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('files');
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();database=undefined;};resolve(req.result);};
    req.onerror=()=>{database=undefined;reject(req.error);};
    req.onblocked=()=>{database=undefined;reject(Error('Close other SIRVIBE tabs to finish upgrading device storage.'));};
  });
}
async function entry(key:string):Promise<Entry|undefined>{
  const storage=await db();
  return new Promise((resolve,reject)=>{const r=storage.transaction('files').objectStore('files').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
async function commit(key:string,value:Entry){
  const storage=await db();
  return new Promise<void>((resolve,reject)=>{
    const tx=storage.transaction('files','readwrite');tx.objectStore('files').put(value,key);
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error??Error('Media could not be saved on this device.'));
  });
}
export async function putLocalMedia(key:string,blob:Blob){
  if(!blob.size)throw Error('The media file is empty.');
  if(blob.size>=1024*1024 && typeof navigator.storage?.getDirectory==='function') {
    let directory:FileSystemDirectoryHandle|undefined,path:string|undefined;
    try {
      directory=await (await navigator.storage.getDirectory()).getDirectoryHandle('sirvibe-media',{create:true});
      path=crypto.randomUUID();
      const file=await directory.getFileHandle(path,{create:true});
      const writer=await file.createWritable();
      try {await writer.write(blob);await writer.close();} catch(error){await writer.abort().catch(()=>{});throw error;}
      await commit(key,{path,type:blob.type,size:blob.size});
      return;
    } catch {
      if(directory&&path)await directory.removeEntry(path).catch(()=>{});
      // Unsupported OPFS, quota, or restricted mode: try transactional blobs.
    }
  }
  await commit(key,{blob,type:blob.type,size:blob.size});
}
export async function getLocalMedia(key:string):Promise<Blob|undefined>{
  const row=await entry(key);if(!row)return;
  if(row.blob)return row.blob;
  if(row.path) {
    try {
      const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('sirvibe-media');
      const file=await (await dir.getFileHandle(row.path)).getFile();
      if(file.size!==row.size)throw Error('Incomplete file');
      return file.type===row.type?file:new Blob([file],{type:row.type});
    } catch {throw Error('A saved media file is missing. Restore a project backup or reattach the original file.');}
  }
}
export function storageError(error:unknown):string {
  if(error instanceof DOMException && error.name==='QuotaExceededError')return 'Device storage is full. Download a project backup, free browser storage, then save again.';
  return error instanceof Error?error.message:'Device storage is unavailable. Download a project backup before leaving.';
}
export async function requestDurableStorage(){
  // Persistence reduces eviction. Browsers may decline; backups remain portable.
  try {return await navigator.storage?.persist?.()??false;}catch{return false;}
}
