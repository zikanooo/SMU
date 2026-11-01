import React, { useCallback, useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { LoginCard } from '../components/LoginCard';
import { User as UserIcon } from 'lucide-react';
import { accountSheet } from '../services/accountSheet';
import { motion } from 'motion/react';
import { Clock, Flame, Headphones, Trophy, Crown, RefreshCw, LogIn, Music2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStats, formatDuration, last7Days, streakDays, topSongs, topArtists, weekKey, dayKey } from '../services/stats';
import { profileView } from '../services/profileView';
import { fetchLeaderboard, LbEntry, LbScope } from '../services/leaderboard';

type Tab = 'stats' | 'leaderboard';

const Seg: React.FC<{ value: string; options: { id: string; label: string }[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <div className="flex p-1 rounded-2xl bg-white/[0.07] border border-white/10">
    {options.map((o) => (
      <button key={o.id} onClick={() => onChange(o.id)}
        className={`flex-1 py-2 rounded-xl text-[13.5px] font-semibold transition-colors ${value === o.id ? 'bg-accent text-ink' : 'text-[#d6cdcf]'}`}>
        {o.label}
      </button>
    ))}
  </div>
);

const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="glass-panel rounded-2xl p-3.5">
    <div className="flex items-center gap-1.5 text-accent text-[12px] font-semibold">{icon}{label}</div>
    <p className="text-[20px] font-bold mt-1 tracking-tight">{value}</p>
  </div>
);

const StatsView: React.FC = () => {
  const d = useStats();
  const days = last7Days(d);
  const max = Math.max(60, ...days.map((x) => x.seconds));
  const week = days.reduce((a, b) => a + b.seconds, 0);
  const today = d.days[dayKey()] || 0;
  const songs = topSongs(d, 5);
  const artists = topArtists(d, 5);
  const topSec = songs[0]?.seconds || 1;

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-3xl p-5">
        <p className="text-[12.5px] text-accent font-semibold flex items-center gap-1.5"><Clock size={14} /> Total waktu mendengarkan</p>
        <p className="text-[34px] leading-tight font-extrabold tracking-tight mt-1">{formatDuration(d.totalSeconds)}</p>
        <p className="text-[12.5px] text-muted">{formatDuration(d.totalSeconds, true)} · {d.plays} lagu diputar</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={<Headphones size={13} />} label="Hari ini" value={formatDuration(today)} />
        <StatTile icon={<Clock size={13} />} label="7 hari" value={formatDuration(week)} />
        <StatTile icon={<Flame size={13} />} label="Beruntun" value={`${streakDays(d)} hr`} />
      </div>

      <div className="glass-panel rounded-3xl p-4">
        <p className="text-[13px] font-semibold mb-3">7 hari terakhir</p>
        <div className="flex items-end justify-between gap-2 h-32">
          {days.map((x, i) => (
            <div key={x.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
              <motion.div
                initial={{ height: 0 }} animate={{ height: `${Math.max(4, (x.seconds / max) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 18, delay: i * 0.04 }}
                className={`w-full rounded-lg ${x.today ? 'bg-accent' : 'bg-accent/40'}`} style={{ minHeight: 4 }} />
              <span className={`text-[11px] ${x.today ? 'text-accent font-semibold' : 'text-muted'}`}>{x.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-4">
        <p className="text-[13px] font-semibold mb-2">Lagu teratas</p>
        {songs.length === 0 && <p className="text-[13px] text-muted py-3">Putar lagu dulu, statistikmu muncul di sini.</p>}
        {songs.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 py-2">
            <span className="w-5 text-center text-[13px] font-bold text-accent">{i + 1}</span>
            <img src={s.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover bg-white/10" />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold truncate">{s.title}</p>
              <p className="text-[12px] text-muted truncate">{s.artist} · {s.plays}x</p>
              <div className="h-1 rounded-full bg-white/10 mt-1.5 overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${(s.seconds / topSec) * 100}%` }} /></div>
            </div>
            <span className="text-[12.5px] font-mono text-[#d6cdcf]">{formatDuration(s.seconds)}</span>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-3xl p-4">
        <p className="text-[13px] font-semibold mb-2">Artis teratas</p>
        {artists.length === 0 && <p className="text-[13px] text-muted py-3">Belum ada data.</p>}
        {artists.map((a, i) => (
          <div key={a.name} className="flex items-center gap-3 py-2">
            <span className="w-5 text-center text-[13px] font-bold text-accent">{i + 1}</span>
            <span className="w-9 h-9 rounded-full bg-accent/20 text-accent flex items-center justify-center"><Music2 size={16} /></span>
            <p className="flex-1 text-[14px] font-semibold truncate">{a.name}</p>
            <span className="text-[12.5px] font-mono text-[#d6cdcf]">{formatDuration(a.seconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RANK_STYLE = ['text-amber-300', 'text-slate-200', 'text-orange-300'];

const LeaderboardView: React.FC = () => {
  const { user, configured, loading, syncNow } = useAuth();
  const [scope, setScope] = useState<LbScope>('week');
  const [rows, setRows] = useState<LbEntry[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!configured) return;
    setBusy(true); setErr('');
    try {
      await syncNow();                       // kirim dulu waktu terbaru milikku
      setRows(await fetchLeaderboard(scope));
    } catch (e: any) {
      setErr('Gagal memuat leaderboard. Periksa koneksi & aturan Firestore.');
    } finally { setBusy(false); }
  }, [scope, configured, syncNow]);

  useEffect(() => { setRows(null); load(); }, [scope, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const myRank = rows && user ? rows.findIndex((r) => r.uid === user.uid) : -1;

  return (
    <div className="space-y-4">
      {!user && <button onClick={accountSheet.open} className="ds-btn ds-btn-primary w-full"><UserIcon size={18} /> Masuk untuk ikut leaderboard</button>}
      <Seg value={scope} onChange={(v) => setScope(v as LbScope)} options={[{ id: 'week', label: 'Minggu ini' }, { id: 'all', label: 'Sepanjang waktu' }]} />
      <div className="flex items-center justify-between px-1">
        <p className="text-[12px] text-muted">{scope === 'week' ? `Mulai ${weekKey()} (reset tiap Senin)` : 'Total seluruh waktu dengar'}</p>
        <button onClick={load} disabled={busy || !configured} className="p-1.5 text-accent active:scale-90 disabled:opacity-40" aria-label="Muat ulang">
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      {!configured && <p className="text-center text-[13px] text-muted py-8">Leaderboard butuh konfigurasi Firebase (lihat README).</p>}
      {configured && err && <p className="text-center text-[13px] text-rose-300 py-6">{err}</p>}
      {configured && !err && (rows === null || loading) && (
        <div className="space-y-2.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[60px] rounded-2xl bg-white/[0.06] animate-pulse" />)}</div>
      )}
      {configured && !err && rows && rows.length === 0 && (
        <p className="text-center text-[13px] text-muted py-8">Belum ada peringkat. Jadilah yang pertama!</p>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2.5">
          {myRank >= 0 && <p className="text-[12.5px] text-accent font-semibold px-1">Peringkatmu: #{myRank + 1}</p>}
          {rows.map((r, i) => {
            const me = user?.uid === r.uid;
            return (
              <motion.div key={r.uid} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
                onClick={() => profileView.open(r.uid)} role="button"
                className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl cursor-pointer active:scale-[0.99] transition-transform ${me ? 'bg-accent/20 border border-accent/60' : 'glass-panel'}`}>
                <span className={`w-7 text-center font-extrabold ${i < 3 ? RANK_STYLE[i] : 'text-muted'}`}>
                  {i === 0 ? <Crown size={20} className="mx-auto" /> : i + 1}
                </span>
                <Avatar src={r.photo} name={r.name} />
                <p className="flex-1 min-w-0 font-semibold truncate">{r.name}{me && <span className="ml-1.5 text-[11px] text-accent">(kamu)</span>}</p>
                <span className="font-mono text-[13px] font-semibold text-[#f4eceb]">{formatDuration(r.seconds)}</span>
              </motion.div>
            );
          })}
        </div>
      )}
      {!user && configured && (
        <p className="text-center text-[12px] text-muted flex items-center justify-center gap-1.5 pt-1"><LogIn size={13} /> Masuk agar waktumu ikut tercatat.</p>
      )}
    </div>
  );
};

export const StatsPage: React.FC<{ initial?: Tab }> = ({ initial = 'stats' }) => {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div className="space-y-4">
      <Seg value={tab} onChange={(v) => setTab(v as Tab)} options={[{ id: 'stats', label: 'Statistik' }, { id: 'leaderboard', label: 'Leaderboard' }]} />
      {tab === 'stats' ? <StatsView /> : <LeaderboardView />}
    </div>
  );
};

export { LoginCard, Avatar };
