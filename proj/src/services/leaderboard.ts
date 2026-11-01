import { getFirebase } from './firebase';
import { StatsStore, weekKey } from './stats';

export interface LbEntry { uid: string; name: string; photo?: string; seconds: number }
export type LbScope = 'week' | 'all';

/** Batas rules: kenaikan maks 21600 dtk per penulisan. Kirim per potongan agar tumpukan waktu offline tidak macet selamanya. */
const CHUNK = 20000;
type Unsynced = { total: number; weeks: Record<string, number> };

function takeChunk(rest: Unsynced): Unsynced {
  const part: Unsynced = { total: Math.min(rest.total, CHUNK), weeks: {} };
  for (const [wk, sec] of Object.entries(rest.weeks)) {
    const n = Math.min(sec, CHUNK);
    if (n >= 1) part.weeks[wk] = n;
  }
  rest.total -= part.total;
  for (const [wk, n] of Object.entries(part.weeks)) {
    rest.weeks[wk] -= n;
    if (rest.weeks[wk] < 1) delete rest.weeks[wk];
  }
  return part;
}

/** Kirim detik yang belum tersinkron ke Firestore (increment, aman multi-perangkat). */
export async function syncStats(user: { uid: string; name: string; photo?: string }): Promise<boolean> {
  if (!StatsStore.hasUnsynced()) return true;
  const rest: Unsynced = StatsStore.takeUnsynced();
  if (rest.total < 1) return true;
  let inflight: Unsynced | null = null; // potongan yang sedang dikirim
  try {
    const { db } = await getFirebase();
    const { doc, writeBatch, increment, serverTimestamp } = await import('firebase/firestore');
    // hanya 2 minggu terakhir yang masuk leaderboard mingguan
    const keep = new Set([weekKey(), weekKey(new Date(Date.now() - 7 * 864e5))]);
    for (const wk of Object.keys(rest.weeks)) if (!keep.has(wk)) delete rest.weeks[wk];
    while (rest.total >= 1 || Object.keys(rest.weeks).length) {
      const part = takeChunk(rest);
      inflight = part;
      const batch = writeBatch(db);
      if (part.total >= 1) {
        batch.set(doc(db, 'users', user.uid), { totalSeconds: increment(part.total), updatedAt: serverTimestamp() }, { merge: true });
      }
      for (const [wk, sec] of Object.entries(part.weeks)) {
        batch.set(doc(db, 'weeks', wk, 'users', user.uid), {
          name: user.name, photo: user.photo || '', seconds: increment(sec), updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
      inflight = null;
      if (rest.total < 1 && !Object.keys(rest.weeks).length) break;
    }
    return true;
  } catch (e) {
    // kembalikan sisa yang belum dikirim + potongan yang gagal
    StatsStore.restoreUnsynced(rest);
    if (inflight) StatsStore.restoreUnsynced(inflight);
    console.warn('[sync] gagal, akan dicoba lagi', e);
    return false;
  }
}

export async function fetchLeaderboard(scope: LbScope, max = 50): Promise<LbEntry[]> {
  const { db } = await getFirebase();
  const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
  const col = scope === 'all' ? collection(db, 'users') : collection(db, 'weeks', weekKey(), 'users');
  const field = scope === 'all' ? 'totalSeconds' : 'seconds';
  const snap = await getDocs(query(col, orderBy(field, 'desc'), limit(max)));
  return snap.docs
    .map((d) => {
      const v: any = d.data();
      return { uid: d.id, name: v.name || 'Pengguna', photo: v.photo || '', seconds: Number(v[field]) || 0 };
    })
    .filter((e) => e.seconds >= 1);
}

/** Perbarui foto di leaderboard segera setelah diganti (diam-diam gagal bila dokumen belum ada; foto ikut terkirim di sinkron berikutnya). */
export async function pushPhoto(uid: string, photo: string): Promise<void> {
  try {
    const { db } = await getFirebase();
    const { doc, updateDoc } = await import('firebase/firestore');
    await Promise.allSettled([
      updateDoc(doc(db, 'users', uid), { photo }),
      updateDoc(doc(db, 'weeks', weekKey(), 'users', uid), { photo }),
    ]);
  } catch {}
}
