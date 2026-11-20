import type { User } from 'firebase/auth';
import { ProjectDocument, type Project } from '../engine/schema.ts';
import { getAudio, projectAssets } from './audio.ts';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
export const cloudEnabled = Object.values(config).every(Boolean);
export type Account = Pick<User, 'uid' | 'email' | 'getIdToken'>;
const connect = async () => {
  const [{ initializeApp }, auth, db, storage] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore'), import('firebase/storage')]);
  const app = initializeApp(config);
  return { auth, db, storage, account: auth.getAuth(app), firestore: db.getFirestore(app), bucket: storage.getStorage(app) };
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
      const project = ProjectDocument.parse(JSON.parse(data.document));
      if (project.id !== item.id || typeof data.updated !== 'number') throw new Error('Invalid project');
      documents.push({ project, updated: data.updated });
    } catch { skipped++; }
  }
  return { documents, skipped };
}
const uploaded = new Set<string>();
export async function uploadProject(user: Account, project: Project, updated: number) {
  const { db, firestore, storage, bucket } = await service();
  await Promise.all(projectAssets(project).map(async id => {
    const path = `users/${user.uid}/audio/${id}`;
    if (uploaded.has(path)) return;
    const file = await getAudio(id);
    if (file) await storage.uploadBytes(storage.ref(bucket, path), file, { contentType: file.type || 'audio/wav' });
    else await storage.getMetadata(storage.ref(bucket, path));
    uploaded.add(path);
  }));
  const valid = ProjectDocument.parse(project);
  const reference = db.doc(firestore, 'users', user.uid, 'projects', project.id);
  await db.runTransaction(firestore, async transaction => {
    const remote = await transaction.get(reference);
    if (remote.exists() && Number(remote.data().updated) > updated) throw new Error('There is a newer cloud version. Reopen the project before saving again.');
    transaction.set(reference, { owner: user.uid, name: valid.name, updated, document: JSON.stringify(valid) });
  });
}
export async function cloudAudio(user: Account, id: string) {
  const { storage, bucket } = await service();
  return storage.getBlob(storage.ref(bucket, `users/${user.uid}/audio/${id}`), 20 * 1024 * 1024);
}
export async function deleteCloud(user: Account, id: string) {
  const { db, firestore } = await service();
  await db.deleteDoc(db.doc(firestore, 'users', user.uid, 'projects', id));
}
