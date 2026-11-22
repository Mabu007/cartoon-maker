import { removeLocalMedia } from './localMedia.ts';
import { z } from 'zod';
import { ProjectDocument, parseStoredProject, uid, type Project } from '../engine/schema.ts';
import { getOrFetchAudio, projectAssets, putAudio } from './audio.ts';
import { isR2MediaRef, mediaUrl } from './media.ts';

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const fileName = (name: string) => name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-|-$/g, '') || 'SIRVIBE';

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
async function portableImage(source:string|undefined) {
  if(!source || !isR2MediaRef(source))return source;
  const url=await mediaUrl(source);
  const response=await fetch(url);
  if(!response.ok)throw Error('Could not include an image in the offline backup.');
  const blob=await response.blob();
  if(blob.type!=='image/webp')throw Error('Cloud artwork has an unexpected format.');
  return 'data:image/webp;base64,'+await asData(blob);
}
export async function portableProject(project: Project):Promise<Project> {
  const scenes=await Promise.all(project.scenes.map(async scene=>({
    ...scene,
    ...(scene.backgroundImage?{backgroundImage:await portableImage(scene.backgroundImage)}:{}),
    objects:await Promise.all(scene.objects.map(async object=>object.imageData
      ? {...object,imageData:await portableImage(object.imageData)} : object))
  })));
  return ProjectDocument.parse({...project,scenes});
}
const MAGIC='SIRVIBE2\n';
const binaryHeader=z.strictObject({
  format:z.literal('sirvibe-backup-2'),project:z.unknown(),
  audio:z.record(z.string().regex(/^[a-zA-Z0-9-]+$/),z.strictObject({
    type:z.string().max(100),size:z.number().int().min(1).max(20*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)
  }))
});
const checksum=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
/** Blob parts keep large media binary rather than expanding the whole movie to
 * base64 strings. Restoring reads just the header and one asset at a time. */
export async function createMovieBackup(project:Project):Promise<Blob>{
  const offline=await portableProject(project);
  const audio:z.infer<typeof binaryHeader>['audio']={};
  const parts:Blob[]=[];
  for(const id of projectAssets(offline)){
    const file=await getOrFetchAudio(id);
    if(!file)throw Error(`Missing audio ${id}. Restore or reattach the original before backing up.`);
    audio[id]={type:file.type,size:file.size,sha256:await checksum(file)};
    parts.push(file);
  }
  const header=new TextEncoder().encode(JSON.stringify(binaryHeader.parse({format:'sirvibe-backup-2',project:offline,audio})));
  if(header.byteLength>4*1024*1024)throw Error('The project metadata is too large to back up.');
  const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,header.byteLength,true);
  return new Blob([MAGIC,size,header,...parts],{type:'application/octet-stream'});
}
export async function backupMovie(project:Project){
  download(`${fileName(project.name)}.sirvibe`,await createMovieBackup(project));
}
export async function restoreMovie(file: File) {
  if(file.size>2_000_000_000)throw Error('This backup is larger than the supported 2 GB limit.');
  const mapping=new Map<string,string>();
  let project:Project;
  const audioFiles=new Map<string,Blob>();
  if(await file.slice(0,MAGIC.length).text()===MAGIC){
    if(file.size<MAGIC.length+4)throw Error('The backup header is incomplete.');
    const size=new DataView(await file.slice(MAGIC.length,MAGIC.length+4).arrayBuffer()).getUint32(0,true);
    const start=MAGIC.length+4;
    if(!size||size>4*1024*1024||start+size>file.size)throw Error('The backup header is invalid or incomplete.');
    const document=binaryHeader.parse(JSON.parse(await file.slice(start,start+size).text()));
    project=parseStoredProject(document.project);
    const assets=projectAssets(project);
    for(const id of assets)if(!Object.hasOwn(document.audio,id))throw Error('The project backup is missing audio.');
    let offset=start+size;
    const files=new Map<string,Blob>();
    for(const [id,meta] of Object.entries(document.audio)){
      if(offset+meta.size>file.size)throw Error('The backup is incomplete. No existing cartoon has been changed.');
      files.set(id,file.slice(offset,offset+meta.size,meta.type));offset+=meta.size;
    }
    if(offset!==file.size)throw Error('The backup has unexpected trailing data.');
    for(const id of assets){
      const blob=files.get(id)!;
      if(await checksum(blob)!==document.audio[id].sha256)throw Error('A backup audio file is damaged. No existing cartoon has been changed.');
      mapping.set(id,uid());audioFiles.set(id,blob);
    }
  } else {
    // Read all earlier JSON backups; source IDs are never reused on import.
    if(file.size>160_000_000)throw Error('Legacy JSON backups are limited to 160 MB. Re-export in the current SIRVIBE format.');
    const document=backup.parse(JSON.parse(await file.text()));
    project=parseStoredProject(document.project);
    for(const id of projectAssets(project))if(!Object.hasOwn(document.audio,id))throw Error('The project backup is missing audio.');
    for(const id of projectAssets(project)){
      const {type,data}=document.audio[id];
      const bytes=Uint8Array.from(atob(data),value=>value.charCodeAt(0));
      if(!bytes.length||bytes.length>20*1024*1024)throw Error('A backup audio file is empty or exceeds 20 MB.');
      mapping.set(id,uid());audioFiles.set(id,new Blob([bytes],{type}));
    }
  }
  const remap = (asset: string) => mapping.has(asset.slice(6)) && asset.startsWith('asset:') ? `asset:${mapping.get(asset.slice(6))}` : asset;
  const remapClip=(clip:Record<string,unknown>):Record<string,unknown>=>{
    if(typeof clip.asset!=='string')return clip;
    return {...clip,asset:remap(clip.asset),...(Array.isArray(clip.versions)?{versions:clip.versions.map(version=>remapClip(version))}:{})};
  };
  const restored=ProjectDocument.parse({ ...project, id: uid(), scenes: project.scenes.map(scene => ({ ...scene,
    clips: scene.clips.map(clip => 'asset' in clip ? { ...clip, asset: remap(clip.asset),
      ...(clip.track === 'dialogue' && clip.versions ? { versions: clip.versions.map(version => ({...version,asset:remap(version.asset)})) } : {})
    } : clip) })),
    ...(project.production ? { production: { ...project.production, graph: project.production.graph.map(record => ({ ...record,
      events: Object.fromEntries(Object.entries(record.events).map(([id, event]) => {
        const clip = JSON.parse(event.signature);
        return [id, { ...event, signature: JSON.stringify(remapClip(clip)) }];
      })) })) } } : {}) });
  const written:string[]=[];
  try {
    for(const [old,blob] of audioFiles){const fresh=mapping.get(old)!;await putAudio(fresh,blob);written.push(fresh);}
  } catch(error){
    await Promise.allSettled(written.map(id=>removeLocalMedia('audio:'+id)));
    throw error;
  }
  return restored;
}
