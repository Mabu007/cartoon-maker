import { AssetManifest, parseAssetPackage, type VisualAssetPack } from '../engine/visualAssets.ts';
export type AssetRow={id:string;pack:VisualAssetPack;favorite:boolean;updated:number};
let database:Promise<IDBDatabase>|undefined;
function open(){
  if(database)return database;
  database=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('sirvibe-visual-assets',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('assets',{keyPath:'id'});
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Close other SIRVIBE tabs before opening the artwork library.'));
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=undefined;};resolve(request.result);};
  }).catch(error=>{database=undefined;throw error;});return database;
}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
  const db=await open();return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('assets',mode);let value:T;
    tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error?.name==='ConstraintError'?Error('An artwork pack with this ID is already installed. Duplicate or rename the source pack before importing.'):tx.error??Error('Artwork change was cancelled: check for dependent packs or missing artwork.'));tx.onerror=()=>{};
    try{work(tx.objectStore('assets'),next=>{value=next;});}catch(error){tx.abort();reject(error);}
  });
}
export async function listVisualAssets(){return transaction<AssetRow[]>('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done((request.result as AssetRow[]).sort((a,b)=>b.updated-a.updated));});}
/** Validate the entire package before the atomic write. New imports never overwrite user artwork. */
export async function saveVisualAssets(packs:VisualAssetPack[]){
  const valid=parseAssetPackage(JSON.stringify({format:'sirvibe-assets',version:1,packs})).packs;
  return transaction<void>('readwrite',(store,done)=>{
    for(const pack of valid)store.add({id:pack.id,pack,favorite:false,updated:Date.now()} satisfies AssetRow);
    done();
  });
}
export async function updateVisualAsset(id:string,change:{name?:string;favorite?:boolean}){
  return transaction<void>('readwrite',(store,done)=>{
    const request=store.get(id);request.onsuccess=()=>{
      const row=request.result as AssetRow|undefined;
      if(!row){store.transaction.abort();return;}
      store.put({...row,favorite:change.favorite??row.favorite,pack:AssetManifest.parse({...row.pack,name:change.name??row.pack.name}),updated:Date.now()});done();
    };
  });
}
export async function deleteVisualAsset(id:string){
  return transaction<void>('readwrite',(store,done)=>{const request=store.getAll();request.onsuccess=()=>{if((request.result as AssetRow[]).some(row=>row.pack.dependencies.includes(id))){store.transaction.abort();return;}store.delete(id);done();};});
}
