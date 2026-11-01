import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getFirebase, isFirebaseConfigured } from '../services/firebase';
import { syncStats, pushPhoto } from '../services/leaderboard';
import { fileToAvatar, setAvatar, useAvatar } from '../services/avatar';
import { ensureProfile, getProfile, saveProfile as saveProfileRemote } from '../services/social';

export interface AuthUser { uid: string; name: string; email?: string; photo?: string; bio?: string }

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;            // menunggu status login awal
  configured: boolean;
  busy: boolean;               // sedang proses login/logout
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  customPhoto: boolean;        // foto profil diunggah sendiri
  setPhoto: (file: File) => Promise<void>;
  removePhoto: () => Promise<void>;
  saveProfile: (p: { name: string; bio: string }) => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: false, configured: false, busy: false, error: null,
  signIn: async () => {}, signOut: async () => {}, syncNow: async () => {},
  customPhoto: false, setPhoto: async () => {}, removePhoto: async () => {},
  saveProfile: async () => {},
});

const toUser = (u: any): AuthUser => ({
  uid: u.uid, name: u.displayName || (u.email ? u.email.split('@')[0] : 'Pengguna'), email: u.email || undefined, photo: u.photoURL || undefined,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rawUser, setUser] = useState<AuthUser | null>(null);
  const avatar = useAvatar(rawUser?.uid);
  const [prof, setProf] = useState<{ name?: string; bio?: string }>({});
  const user = useMemo<AuthUser | null>(
    () => (rawUser ? { ...rawUser, name: prof.name || rawUser.name, bio: prof.bio || '', photo: avatar || rawUser.photo } : null),
    [rawUser, avatar, prof]);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;
  const rawRef = useRef<AuthUser | null>(null);
  rawRef.current = rawUser;

  // Pantau status login
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let off = () => {};
    let cancelled = false;
    (async () => {
      try {
        const [{ auth }, { onAuthStateChanged, getRedirectResult }] = await Promise.all([getFirebase(), import('firebase/auth')]);
        getRedirectResult(auth).catch(() => {});
        off = onAuthStateChanged(auth, (u: any) => { if (!cancelled) { setUser(u ? toUser(u) : null); setLoading(false); } });
      } catch (e) {
        if (!cancelled) { setLoading(false); setError('Gagal memuat layanan login'); }
      }
    })();
    return () => { cancelled = true; off(); };
  }, []);

  // Muat profil (nama kustom & bio) dari Firestore saat login
  useEffect(() => {
    if (!rawUser) { setProf({}); return; }
    let alive = true;
    (async () => {
      try {
        await ensureProfile(rawUser);
        const p = await getProfile(rawUser.uid);
        if (alive && p) setProf({ name: p.name, bio: p.bio });
      } catch (e) { console.warn('[profil] gagal memuat', e); }
    })();
    return () => { alive = false; };
  }, [rawUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = useCallback(async (p: { name: string; bio: string }) => {
    const u = rawRef.current;
    if (!u) throw new Error('Belum masuk');
    await ensureProfile(u);
    await saveProfileRemote(u.uid, p);
    setProf({ name: p.name.trim(), bio: p.bio.trim() });
  }, []);

  const syncNow = useCallback(async () => {
    const u = userRef.current;
    if (u) await syncStats(u);
  }, []);

  // Sinkron statistik: saat login, tiap 30 dtk, dan saat tab disembunyikan
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    const run = () => { if (userRef.current) syncStats(userRef.current); };
    run();
    const id = setInterval(run, 30000);
    const onHide = () => { if (document.visibilityState === 'hidden') run(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); };
  }, [uid]);

  const signIn = useCallback(async () => {
    if (!isFirebaseConfigured) { setError('Login belum dikonfigurasi'); return; }
    setBusy(true); setError(null);
    try {
      const [{ auth }, a] = await Promise.all([getFirebase(), import('firebase/auth')]);
      const provider = new a.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await a.signInWithPopup(auth, provider);
      } catch (e: any) {
        const code = String(e?.code || '');
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          await a.signInWithRedirect(auth, provider); // fallback untuk PWA / browser in-app
          return;
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
        if (code === 'auth/unauthorized-domain') throw new Error('Domain belum diizinkan di Firebase (Authentication → Settings → Authorized domains)');
        throw e;
      }
    } catch (e: any) {
      setError(e?.message || 'Login gagal');
    } finally { setBusy(false); }
  }, []);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await syncNow();
      const [{ auth }, a] = await Promise.all([getFirebase(), import('firebase/auth')]);
      await a.signOut(auth);
    } catch (e: any) { setError(e?.message || 'Gagal keluar'); }
    finally { setBusy(false); }
  }, [syncNow]);

  const setPhoto = useCallback(async (file: File) => {
    const data = await fileToAvatar(file);
    try { setAvatar(userRef.current ? userRef.current.uid : undefined, data); }
    catch { throw new Error('Penyimpanan perangkat penuh'); }
    if (userRef.current) pushPhoto(userRef.current.uid, data);
  }, []);

  const removePhoto = useCallback(async () => {
    const u = userRef.current;
    setAvatar(u?.uid, '');
    if (u) {
      // kembali ke foto Google (atau kosong)
      const g = rawRef.current?.photo || '';
      pushPhoto(u.uid, g);
    }
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user, loading, configured: isFirebaseConfigured, busy, error, signIn, signOut, syncNow,
    customPhoto: !!avatar, setPhoto, removePhoto, saveProfile,
  }), [user, loading, busy, error, signIn, signOut, syncNow, avatar, setPhoto, removePhoto, saveProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
