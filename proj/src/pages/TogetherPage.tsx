import React, { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Copy, Link2, LogOut, Plus, Settings, User, Users, X } from 'lucide-react';
import { useMusic } from '../context/MusicContext';
import { together, useTogether, makeCode, myId } from '../services/together';

const STATUS_TEXT = { idle: 'Terputus', connecting: 'Menyambung', online: 'Terhubung', reconnecting: 'Menyambung ulang' } as const;

export const TogetherPage: React.FC = () => {
  const { setActiveTab, showToast } = useMusic();
  const { session, status, mode, members } = useTogether();
  const [username, setUsername] = useState(() => { try { return localStorage.getItem('auralys_username') || ''; } catch { return ''; } });
  const [codeInput, setCodeInput] = useState(() => (location.hash.match(/join=([A-Z0-9]{4,12})/i)?.[1] || '').toUpperCase());
  const [userFocus, setUserFocus] = useState(false);

  const link = useMemo(() => (session ? `${location.origin}${location.pathname}#join=${session.code}` : ''), [session]);
  const hostHere = members.some((m) => m.host);
  const joining = codeInput.length >= 4;

  const start = () => {
    const name = username.trim();
    if (!name) { showToast('Isi username dulu'); return; }
    try { localStorage.setItem('auralys_username', name); } catch { /* abaikan */ }
    const code = joining ? codeInput : makeCode();
    showToast(joining ? 'Bergabung ke sesi...' : 'Membuat sesi...');
    together.join(code, !joining, name);
    if (!joining) setTimeout(() => showToast(`Sesi dibuat: ${code}`), 900);
  };

  const copy = async (text: string, msg: string) => {
    try { await navigator.clipboard.writeText(text); showToast(msg); } catch { showToast('Gagal menyalin'); }
  };

  const SettingsCard = (
    <button onClick={() => setActiveTab('profile')} className="w-full mt-3 glass-panel rounded-[22px] p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
      <Settings size={22} className="text-muted shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-[15.5px] font-semibold">Pengaturan</span>
        <span className="block text-[12.5px] text-muted leading-snug">Konfigurasi server, nama pengguna, dan lainnya</span>
      </span>
      <ChevronRight size={20} className="text-[#e9dfde] shrink-0" />
    </button>
  );

  return (
    <div className="pb-52 pt-1">
      {/* Bilah atas */}
      <div className="flex items-center gap-1 mb-3">
        <button onClick={() => setActiveTab('home')} className="p-2 -ml-2 active:scale-90" aria-label="Kembali"><ArrowLeft size={24} /></button>
        <h1 className="text-[18px] font-semibold tracking-tight flex-1">Bersama</h1>
        {session && (
          <span className="px-3 py-1.5 rounded-full glass-pill text-[12px] font-semibold text-accent">{STATUS_TEXT[status]}</span>
        )}
      </div>

      {!session ? (
        <>
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-16 h-16 rounded-full bg-accent/90 text-ink flex items-center justify-center mb-3"><Users size={30} /></div>
            <h2 className="text-[22px] font-bold tracking-tight">Dengar bersama</h2>
            <p className="text-[13px] text-muted leading-snug mt-1.5 max-w-[320px]">
              Dengarkan musik bersama teman Anda secara real time. Buat ruangan untuk menjadi host, atau bergabung ke ruangan yang ada dengan kode
            </p>
          </div>

          {/* Status koneksi */}
          <div className="glass-panel rounded-[22px] p-3.5 space-y-3">
            <div className="flex items-center justify-center gap-2 text-[14px] font-semibold">
              <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-emerald-400' : status === 'idle' ? 'bg-white/50' : 'bg-amber-400 animate-pulse'}`} />
              {STATUS_TEXT[status]}
            </div>
            <button onClick={start}
              className="w-full h-12 rounded-2xl bg-accent/90 text-ink font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              <Link2 size={17} /> Hubungkan
            </button>
          </div>

          {/* Username + kode sesi */}
          <div className="glass-panel rounded-[22px] p-3.5 space-y-3 mt-3">
            <label className={`flex items-center gap-3 px-3 h-14 rounded-2xl border bg-white/[0.04] transition-colors ${userFocus ? 'border-accent' : 'border-white/15'}`}>
              <User size={18} className="text-muted shrink-0" />
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" maxLength={20}
                onFocus={() => setUserFocus(true)} onBlur={() => setUserFocus(false)}
                className="flex-1 min-w-0 bg-transparent outline-none text-[16px] placeholder:text-muted" />
              {username && <button type="button" onClick={() => setUsername('')} aria-label="Hapus" className="p-1 text-muted active:scale-90"><X size={18} /></button>}
            </label>
            <label className="flex items-center gap-3 px-3 h-14 rounded-2xl border border-white/15 bg-white/[0.04]">
              <Users size={18} className="text-muted shrink-0" />
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Kode sesi" maxLength={12}
                className="flex-1 min-w-0 bg-transparent outline-none text-[16px] tracking-widest placeholder:text-muted placeholder:tracking-normal" />
            </label>
            <button onClick={start}
              className="w-full h-12 rounded-2xl bg-accent/90 text-ink font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              {joining ? 'Gabung' : <><Plus size={18} /> Buat</>}
            </button>
          </div>

          {SettingsCard}
        </>
      ) : (
        <>
          <div className="glass-panel rounded-[22px] p-5 text-center">
            <p className="text-[12.5px] text-muted">Kode sesi</p>
            <p className="text-[30px] font-extrabold tracking-[0.14em] my-1.5">{session.code}</p>
            <p className="text-[13px] text-muted mb-4">{session.host ? 'Kamu adalah host' : 'Lagu mengikuti host secara langsung'}</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => copy(link, 'Tautan disalin')} className="h-11 rounded-full border border-white/20 bg-white/[0.04] text-[#f4eceb] font-semibold text-[13.5px] flex items-center justify-center gap-2 active:scale-95"><Link2 size={15} /> Salin link</button>
              <button onClick={() => copy(session.code, 'Kode disalin')} className="h-11 rounded-full border border-white/20 bg-white/[0.04] text-[#f4eceb] font-semibold text-[13.5px] flex items-center justify-center gap-2 active:scale-95"><Copy size={15} /> Salin kode</button>
            </div>
          </div>

          {!session.host && status === 'online' && !hostHere && (
            <p className="mt-3 text-[13px] text-amber-200/90 text-center">Belum ada host di ruangan ini. Lagu akan mulai saat host memutar musik.</p>
          )}

          <div className="glass-panel rounded-[22px] p-4 mt-3">
            <p className="text-[15px] font-semibold mb-3">Pengguna tersambung ({members.length})</p>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              {members.map((m) => (
                <div key={m.id} className="flex flex-col items-center w-[64px]">
                  <div className="relative w-11 h-11 rounded-full bg-accent/90 text-ink font-bold text-[17px] flex items-center justify-center">
                    {m.name.slice(0, 1).toUpperCase()}
                    <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[var(--sheet)]" />
                  </div>
                  <p className="mt-1.5 text-[12px] font-medium truncate w-full text-center">{m.name}{m.id === myId ? ' (kamu)' : ''}</p>
                  {m.host && <p className="text-[10.5px] text-muted -mt-0.5">Host</p>}
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => together.leave()} className="w-full mt-3 h-12 rounded-2xl bg-[#f0626a] text-white font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98]">
            <LogOut size={18} /> Keluar sesi
          </button>

          {SettingsCard}
          {mode === 'relay' && <p className="text-[11.5px] text-muted text-center mt-3">Memakai relay publik karena server ini tidak mendukung koneksi langsung.</p>}
        </>
      )}
    </div>
  );
};
