/**
 * Firebase (Auth Google + Firestore) dimuat malas (dynamic import) agar bundle awal tetap kecil.
 * Isi variabel VITE_FIREBASE_* di .env — lihat .env.example & README.
 */
const env = import.meta.env as Record<string, string | undefined>;

// Config web Firebase bersifat publik (bukan rahasia; keamanan ada di Firestore Rules & Authorized domains).
// Nilai default di bawah dipakai bila variabel VITE_FIREBASE_* tidak diisi (mis. di Vercel).
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBjcNlh5nwe894zTh1Lbsq0pb1ojYqPQsE',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'jikostudio-9c581.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'jikostudio-9c581',
  appId: env.VITE_FIREBASE_APP_ID || '1:614689771388:web:b40d10f05a81553fab5ef9',
};

export const isFirebaseConfigured = !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

let ready: Promise<{ auth: any; db: any }> | null = null;

export function getFirebase() {
  if (!isFirebaseConfigured) return Promise.reject(new Error('firebase-not-configured'));
  if (!ready) {
    ready = (async () => {
      const [{ initializeApp, getApps, getApp }, { getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
      ]);
      const app = getApps().length ? getApp() : initializeApp(cfg as any);
      return { auth: getAuth(app), db: getFirestore(app) };
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}
