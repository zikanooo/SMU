import React from 'react';
import { Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './Avatar';

const LoginCard: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { user, configured, busy, error, signIn, signOut, loading } = useAuth();
  if (user) {
    return (
      <div className="glass-panel rounded-3xl p-4 flex items-center gap-3">
        <Avatar src={user.photo} name={user.name} size={46} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{user.name}</p>
          <p className="text-[12px] text-muted truncate">{user.email}</p>
        </div>
        <button onClick={signOut} disabled={busy} className="px-3.5 py-2 rounded-xl bg-white/10 text-[13px] font-semibold active:scale-95 disabled:opacity-50">Keluar</button>
      </div>
    );
  }
  return (
    <div className="glass-panel rounded-3xl p-5 text-center space-y-3">
      {!compact && <Trophy size={30} className="mx-auto text-accent" />}
      <p className="text-[15px] font-semibold">Masuk untuk ikut leaderboard</p>
      <p className="text-[12.5px] text-muted leading-relaxed">
        Waktu dengarmu akan disinkronkan dan nama + foto Googlemu tampil di peringkat.
      </p>
      <button onClick={signIn} disabled={!configured || busy || loading}
        className="w-full py-3 rounded-2xl bg-white text-[#1f1f1f] font-semibold text-[14.5px] flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-50">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        {busy ? 'Membuka Google...' : 'Masuk dengan Google'}
      </button>
      {!configured && <p className="text-[11.5px] text-amber-300/90">Login belum dikonfigurasi (isi VITE_FIREBASE_* di .env — lihat README).</p>}
      {error && <p className="text-[12px] text-rose-300">{error}</p>}
    </div>
  );
};

export { LoginCard };
