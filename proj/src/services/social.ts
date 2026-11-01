import { getFirebase } from './firebase';

export interface PublicProfile { uid: string; name: string; photo: string; bio: string; totalSeconds: number }
export const MAX_NAME = 30;
export const MAX_BIO = 160;

const toProfile = (id: string, v: any): PublicProfile => ({
  uid: id, name: v?.name || 'Pengguna', photo: v?.photo || '', bio: v?.bio || '', totalSeconds: Number(v?.totalSeconds) || 0,
});

const fs = () => import('firebase/firestore');

/** Pastikan dokumen profil ada (dan punya nameLower untuk pencarian). Dipanggil sekali per sesi login. */
const ensured = new Set<string>();
export async function ensureProfile(u: { uid: string; name: string; photo?: string }): Promise<void> {
  if (ensured.has(u.uid)) return;
  const { db } = await getFirebase();
  const { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } = await fs();
  const ref = doc(db, 'users', u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // merge + increment(0): tidak menimpa/menurunkan totalSeconds bila sinkron statistik sempat membuat dokumen lebih dulu
    await setDoc(ref, {
      name: u.name.slice(0, MAX_NAME), nameLower: u.name.slice(0, MAX_NAME).toLowerCase(),
      photo: u.photo && u.photo.length < 30000 ? u.photo : '', bio: '', totalSeconds: increment(0), updatedAt: serverTimestamp(),
    }, { merge: true });
  } else if (!snap.data().nameLower) {
    const n = String(snap.data().name || u.name).slice(0, MAX_NAME);
    await updateDoc(ref, { name: n, nameLower: n.toLowerCase() });
  }
  ensured.add(u.uid);
}

export async function getProfile(uid: string): Promise<PublicProfile | null> {
  const { db } = await getFirebase();
  const { doc, getDoc } = await fs();
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? toProfile(snap.id, snap.data()) : null;
}

export async function saveProfile(uid: string, p: { name: string; bio: string }): Promise<void> {
  const name = p.name.trim().slice(0, MAX_NAME);
  if (!name) throw new Error('Nama tidak boleh kosong');
  const { db } = await getFirebase();
  const { doc, updateDoc } = await fs();
  await updateDoc(doc(db, 'users', uid), { name, nameLower: name.toLowerCase(), bio: p.bio.trim().slice(0, MAX_BIO) });
}

export async function getCounts(uid: string): Promise<{ followers: number; following: number }> {
  const { db } = await getFirebase();
  const { collection, getCountFromServer } = await fs();
  const [a, b] = await Promise.all([
    getCountFromServer(collection(db, 'users', uid, 'followers')),
    getCountFromServer(collection(db, 'users', uid, 'following')),
  ]);
  return { followers: a.data().count, following: b.data().count };
}

export async function isFollowing(me: string, target: string): Promise<boolean> {
  const { db } = await getFirebase();
  const { doc, getDoc } = await fs();
  return (await getDoc(doc(db, 'users', me, 'following', target))).exists();
}

export async function follow(me: string, target: string): Promise<void> {
  if (me === target) return;
  const { db } = await getFirebase();
  const { doc, writeBatch, serverTimestamp } = await fs();
  const b = writeBatch(db);
  b.set(doc(db, 'users', me, 'following', target), { at: serverTimestamp() });
  b.set(doc(db, 'users', target, 'followers', me), { at: serverTimestamp() });
  await b.commit();
}

export async function unfollow(me: string, target: string): Promise<void> {
  const { db } = await getFirebase();
  const { doc, writeBatch } = await fs();
  const b = writeBatch(db);
  b.delete(doc(db, 'users', me, 'following', target));
  b.delete(doc(db, 'users', target, 'followers', me));
  await b.commit();
}

/** Ambil profil banyak uid sekaligus (maks 30 per kueri Firestore). */
async function profilesOf(ids: string[]): Promise<PublicProfile[]> {
  if (!ids.length) return [];
  const { db } = await getFirebase();
  const { collection, query, where, documentId, getDocs } = await fs();
  const out = new Map<string, PublicProfile>();
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', ids.slice(i, i + 30))));
    snap.docs.forEach((d) => out.set(d.id, toProfile(d.id, d.data())));
  }
  return ids.map((id) => out.get(id)).filter(Boolean) as PublicProfile[];
}

export async function listFollowIds(uid: string, kind: 'followers' | 'following', max = 60): Promise<string[]> {
  const { db } = await getFirebase();
  const { collection, query, orderBy, limit, getDocs } = await fs();
  const snap = await getDocs(query(collection(db, 'users', uid, kind), orderBy('at', 'desc'), limit(max)));
  return snap.docs.map((d) => d.id);
}

export async function listFollow(uid: string, kind: 'followers' | 'following', max = 60): Promise<PublicProfile[]> {
  return profilesOf(await listFollowIds(uid, kind, max));
}

/** Cari pengguna berdasarkan awalan nama (tidak peka huruf besar/kecil). */
export async function searchUsers(text: string): Promise<PublicProfile[]> {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  const { db } = await getFirebase();
  const { collection, query, where, orderBy, limit, getDocs } = await fs();
  const snap = await getDocs(query(collection(db, 'users'),
    where('nameLower', '>=', q), where('nameLower', '<=', q + '\uf8ff'), orderBy('nameLower'), limit(20)));
  return snap.docs.map((d) => toProfile(d.id, d.data()));
}
