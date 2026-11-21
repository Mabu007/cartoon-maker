import type { User } from 'firebase/auth';
import { ProjectDocument, parseStoredProject, type Project } from '../engine/schema.ts';
import { getAudio, projectAssets } from './audio.ts';
import { imageToR2, readR2Media, uploadR2Media, isR2MediaRef } from './media.ts';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
export const cloudEnabled = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
export type Account = Pick<User, 'uid' | 'email' | 'getIdToken'>;
const connect = async () => {
  const [{ initializeApp }, auth, db, storage] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/storage')]);
  const app = initializeApp(config);
  return { auth, db, storage, account: auth.getAuth(app), firestore: db.getFirestore(app),
    legacyBucket: config.storageBucket ? storage.getStorage(app) : null };
};
let connection: ReturnType<typeof connect> | undefined;
const service = () => connection ??= connect();
export async function listenAccount(change: (user: Account | null) => void) {
  const { auth, account } = await service();
  return auth.onAuthStateChanged(account, change);
}
export async function login(email: string, password: string, register: boolean) {
  const { auth, account } = await service();
  if (register) await auth.createUserWithEmailAndPassword(account, email, password);
  else await auth.signInWithEmailAndPassword(account, email, password);
}
export async function logout() { const { auth, account } = await service(); await auth.signOut(account); }
export async function cloudProjects(user: Account) {
  const { db, firestore } = await service();
  const result = await db.getDocs(db.collection(firestore, 'users', user.uid, 'projects'));
  let skipped = 0;
  const documents: { project: Project; updated: number }[] = [];
  for (const item of result.docs) {
    try {
      const data = item.data();
      const project = parseStoredProject(JSON.parse(data.document));
      if (project.id !== item.id || !Number.isFinite(data.updated)) throw new Error('Invalid project');
      documents.push({ project, updated: data.updated });
    } catch { skipped++; }
  }
  return { documents, skipped };
}
const uploaded = new Set<string>();
/** Existing image data URLs are migrated into R2 when cloud syncing; legacy
 * offline project copies remain readable until the user next opens cloud data.
 */
async function r2ProjectImages(user:Account, project:Project):Promise<Project>{
  const scenes=await Promise.all(project.scenes.map(async scene=>({
    ...scene,
    ...(scene.backgroundImage && !isR2MediaRef(scene.backgroundImage)
      ? {backgroundImage:await imageToR2(user,scene.backgroundImage)} : {}),
    objects:await Promise.all(scene.objects.map(async object=>
      object.imageData && !isR2MediaRef(object.imageData)
        ? {...object,imageData:await imageToR2(user,object.imageData)} : object))
  })));
  return {...project,scenes};
}
export async function uploadProject(user:Account, project:Project, updated:number){
  const {db,firestore}=await service();
  await Promise.all(projectAssets(project).map(async id=>{
    const path=`${user.uid}:audio:${id}`;
    if(uploaded.has(path))return;
    const file=await getAudio(id);
    if(file)await uploadR2Media(user,'audio',file,id);
    else await readR2Media(user,'audio',id);
    uploaded.add(path);
  }));
  const portable=await r2ProjectImages(user,project);
  const valid=ProjectDocument.parse(portable);
  const reference=db.doc(firestore,'users',user.uid,'projects',project.id);
  await db.runTransaction(firestore,async transaction=>{
    const remote=await transaction.get(reference);
    if(remote.exists() && Number(remote.data().updated)>updated)
      throw Error('There is a newer cloud version. Reopen the project before saving again.');
    transaction.set(reference,{owner:user.uid,name:valid.name,updated,document:JSON.stringify(valid)});
  });
}
export async function cloudAudio(user:Account,id:string){
  try { return await readR2Media(user,'audio',id); }
  catch (r2Error) {
    // Read-only migration fallback for old projects whose audio was saved in
    // Firebase Storage before the R2 release. New uploads never go to Firebase.
    const {storage,legacyBucket}=await service();
    if(!legacyBucket)throw r2Error;
    try {
      return await storage.getBlob(storage.ref(legacyBucket,`users/${user.uid}/audio/${id}`),20*1024*1024);
    } catch { throw r2Error; }
  }
}
export async function deleteCloud(user: Account, id: string) {
  const { db, firestore } = await service();
  await db.deleteDoc(db.doc(firestore, 'users', user.uid, 'projects', id));
}
