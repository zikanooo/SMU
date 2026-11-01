import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Camera, Check, Clock, Pencil, Search, UserPlus, UserCheck, Users, X, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMusic } from '../context/MusicContext';
import { accountSheet } from '../services/accountSheet';
import { profileView, useProfileView } from '../services/profileView';
import {
  PublicProfile, MAX_BIO, MAX_NAME, getProfile, getCounts, isFollowing, follow, unfollow,
  listFollow, listFollowIds, searchUsers,
} from '../services/social';
import { Avatar } from './Avatar';

type ListTab = 'followers' | 'following' | 'search';

const fmtMinutes = (sec: number) => {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  return h >= 100 ? `${h} jam` : `${h}j ${m % 60}m`;
};

const FollowButton: React.FC<{ on: boolean; busy?: boolean; onClick: () => void; small?: boolean }> = ({ on, busy, onClick, small }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={busy}
    className={`${small ? 'h-9 px-4 text-[13px]' : 'h-11 px-6 text-[14.5px]'} rounded-full font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60 shrink-0 ${
      on ? 'bg-white/10 border border-white/20 text-[#f4eceb]' : 'bg-accent text-ink'}`}>
    {busy ? <Loader2 size={small ? 14 : 16} className="animate-spin" /> : on ? <UserCheck size={small ? 15 : 17} /> : <UserPlus size={small ? 15 : 17} />}
    {on ? 'Mengikuti' : 'Ikuti'}
  </button>
);

export const UserProfile: React.FC = () => {
  const uid = useProfileView();
  const { user, setPhoto, saveProfile } = useAuth();
  const { showToast } = useMusic();
  const scroller = useRef<HTMLDivElement>(null);

  const [prof, setProf] = useState<PublicProfile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [edit, setEdit] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [tab, setTab] = useState<ListTab>('followers');
  const [rows, setRows] = useState<PublicProfile[] | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PublicProfile[] | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const isMe = !!user && uid === user.uid;

  // Muat profil + hitungan saat uid berubah
  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setErr('');
    try {
      const [p, c, f] = await Promise.all([
        getProfile(uid), getCounts(uid), user && user.uid !== uid ? isFollowing(user.uid, uid) : Promise.resolve(false),
      ]);
      if (!p) { setErr('Profil tidak ditemukan'); setProf(null); }
      else setProf(p);
      setCounts(c); setFollowing(f);
    } catch {
      setErr('Gagal memuat profil. Periksa koneksi dan pastikan aturan Firestore sudah diperbarui.');
    } finally { setLoading(false); }
  }, [uid, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProf(null); setEdit(false); setRows(null); setQ(''); setFound(null); setTab('followers');
    scroller.current?.scrollTo({ top: 0 });
    load();
  }, [uid, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Daftar siapa saja yang kuikuti (untuk tombol Ikuti di tiap baris)
  useEffect(() => {
    if (!uid || !user) { setMine(new Set()); return; }
    listFollowIds(user.uid, 'following', 300).then((ids) => setMine(new Set(ids))).catch(() => {});
  }, [uid, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Muat daftar pengikut/mengikuti
  useEffect(() => {
    if (!uid || tab === 'search') return;
    let alive = true;
    setRows(null);
    listFollow(uid, tab).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [uid, tab, counts.followers, counts.following]);

  // Cari pengguna (ditunda 350 ms)
  useEffect(() => {
    if (tab !== 'search') return;
    if (q.trim().length < 2) { setFound(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      searchUsers(q).then((r) => { if (alive) setFound(r.filter((x) => x.uid !== user?.uid)); }).catch(() => { if (alive) setFound([]); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [q, tab, user?.uid]);

  useEffect(() => {
    if (!uid) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') (edit ? setEdit(false) : profileView.back()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [uid, edit]);

  const needLogin = () => { showToast('Masuk dulu untuk mengikuti'); accountSheet.open(); };

  const toggleFollow = async (target: string, currentlyOn: boolean, afterMain?: boolean) => {
    if (!user) return needLogin();
    setRowBusy(target);
    try {
      if (currentlyOn) await unfollow(user.uid, target); else await follow(user.uid, target);
      setMine((s) => { const n = new Set(s); if (currentlyOn) n.delete(target); else n.add(target); return n; });
      if (afterMain) { setFollowing(!currentlyOn); setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (currentlyOn ? -1 : 1)) })); }
      else if (isMe) setCounts((c) => ({ ...c, following: Math.max(0, c.following + (currentlyOn ? -1 : 1)) }));
    } catch { showToast('Gagal, coba lagi'); }
    finally { setRowBusy(null); }
  };

  const startEdit = () => { if (!prof) return; setName(prof.name); setBio(prof.bio); setEdit(true); };
  const doSave = async () => {
    if (!name.trim()) { showToast('Nama tidak boleh kosong'); return; }
    setSaving(true);
    try {
      await saveProfile({ name, bio });
      setProf((p) => (p ? { ...p, name: name.trim(), bio: bio.trim() } : p));
      setEdit(false); showToast('Profil disimpan');
    } catch (e: any) { showToast(e?.message || 'Gagal menyimpan'); }
    finally { setSaving(false); }
  };
  const pickPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try { await setPhoto(file); showToast('Foto diperbarui'); load(); }
    catch (e: any) { showToast(e?.message || 'Gagal memakai foto'); }
    finally { setPhotoBusy(false); }
  };

  const photo = isMe ? (user?.photo || prof?.photo) : prof?.photo;
  const shownName = isMe ? (user?.name || prof?.name || '') : prof?.name || '';

  const renderRow = (p: PublicProfile) => (
    <div key={p.uid} onClick={() => profileView.open(p.uid)} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-2xl active:bg-white/10 cursor-pointer">
      <Avatar src={p.photo} name={p.name} size={46} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold truncate leading-[1.3]">{p.name}{user?.uid === p.uid && <span className="ml-1.5 text-[11px] text-accent">(kamu)</span>}</p>
        <p className="text-[12.5px] text-muted truncate leading-[1.3]">{p.bio || `${fmtMinutes(p.totalSeconds)} didengar`}</p>
      </div>
      {user?.uid !== p.uid && <FollowButton small on={mine.has(p.uid)} busy={rowBusy === p.uid} onClick={() => toggleFollow(p.uid, mine.has(p.uid))} />}
    </div>
  );

  return (
    <AnimatePresence>
      {uid && (
        <motion.div key="up" className="fixed inset-0 z-[15] bg-[var(--bg)] flex justify-center"
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
          <div ref={scroller} className="w-full max-w-xl h-full overflow-y-auto overscroll-contain no-scrollbar pb-56">
            {/* Banner */}
            <div className="relative h-[168px]" style={{ background: 'linear-gradient(135deg, hsl(var(--hue) 70% 42%) 0%, hsl(calc(var(--hue) + var(--hue-shift)) 60% 26%) 60%, var(--bg) 130%)' }}>
              <div className="absolute inset-0" style={{ background: 'radial-gradient(70% 90% at 85% 0%, rgba(255,255,255,0.22), transparent 60%)' }} />
              <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(to top, var(--bg), transparent)' }} />
              <button onClick={() => (edit ? setEdit(false) : profileView.back())}
                className="absolute left-4 top-[max(0.9rem,env(safe-area-inset-top))] w-10 h-10 rounded-full bg-black/35 border border-white/15 flex items-center justify-center active:scale-90" aria-label="Kembali">
                {edit ? <X size={20} /> : <ArrowLeft size={21} />}
              </button>
            </div>

            <div className="px-5 -mt-[58px] relative">
              {/* Avatar */}
              <div className="flex items-end justify-between gap-3">
                <div className="relative">
                  <span className="block p-[3px] rounded-full" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))' }}>
                    <span className="block p-[3px] rounded-full bg-[var(--bg)]"><Avatar src={photo} name={shownName || '?'} size={96} /></span>
                  </span>
                  {isMe && edit && (
                    <label className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-accent text-ink flex items-center justify-center border-2 border-[var(--bg)] cursor-pointer active:scale-90" aria-label="Ganti foto">
                      {photoBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} strokeWidth={2.5} />}
                      <input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickPhoto(f); }} />
                    </label>
                  )}
                </div>
                {!edit && prof && (isMe
                  ? <button onClick={startEdit} className="h-11 px-5 rounded-full bg-white/10 border border-white/20 text-[14.5px] font-bold flex items-center gap-2 active:scale-95"><Pencil size={16} /> Edit profil</button>
                  : <FollowButton on={following} busy={busy} onClick={async () => { setBusy(true); await toggleFollow(uid, following, true); setBusy(false); }} />)}
              </div>

              {loading && !prof && <div className="mt-6 space-y-3"><div className="h-7 w-48 rounded-lg bg-white/[0.08] animate-pulse" /><div className="h-4 w-64 rounded-lg bg-white/[0.06] animate-pulse" /></div>}
              {err && <p className="mt-6 text-[13.5px] text-rose-300 leading-relaxed">{err}</p>}

              {prof && !edit && (
                <>
                  <h1 className="mt-4 text-[26px] font-extrabold leading-[1.2] break-words">{shownName}</h1>
                  {isMe && user?.email && <p className="text-[13px] text-muted mt-0.5 truncate">{user.email}</p>}
                  <p className={`mt-3 text-[15px] leading-[1.5] whitespace-pre-line break-words ${(isMe ? user?.bio : prof.bio) ? 'text-[#e9dfde]' : 'text-muted italic'}`}>
                    {(isMe ? user?.bio : prof.bio) || (isMe ? 'Belum ada bio. Ketuk "Edit profil" untuk menambahkan.' : 'Belum ada bio.')}
                  </p>

                  <div className="mt-5 grid grid-cols-3 gap-2.5">
                    <button onClick={() => setTab('followers')} className="glass-panel rounded-2xl py-3 text-center active:scale-95 transition-transform">
                      <p className="text-[20px] font-extrabold leading-none tabular-nums">{counts.followers}</p>
                      <p className="text-[11.5px] text-muted mt-1.5">Pengikut</p>
                    </button>
                    <button onClick={() => setTab('following')} className="glass-panel rounded-2xl py-3 text-center active:scale-95 transition-transform">
                      <p className="text-[20px] font-extrabold leading-none tabular-nums">{counts.following}</p>
                      <p className="text-[11.5px] text-muted mt-1.5">Mengikuti</p>
                    </button>
                    <div className="glass-panel rounded-2xl py-3 text-center">
                      <p className="text-[20px] font-extrabold leading-none tabular-nums">{fmtMinutes(prof.totalSeconds)}</p>
                      <p className="text-[11.5px] text-muted mt-1.5 flex items-center justify-center gap-1"><Clock size={11} /> Didengar</p>
                    </div>
                  </div>

                  {/* Tab daftar */}
                  <div className="seg mt-6" role="tablist">
                    <button role="tab" aria-selected={tab === 'followers'} onClick={() => setTab('followers')}>Pengikut</button>
                    <button role="tab" aria-selected={tab === 'following'} onClick={() => setTab('following')}>Mengikuti</button>
                    <button role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}><Search size={14} /> Cari teman</button>
                  </div>

                  <div className="mt-3">
                    {tab === 'search' ? (
                      <>
                        <div className="flex items-center gap-2.5 h-12 px-4 rounded-full bg-white/[0.07] border border-white/12 focus-within:border-accent transition-colors">
                          <Search size={18} className="text-muted shrink-0" />
                          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama pengguna…" autoComplete="off"
                            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-muted" />
                          {q && <button onClick={() => setQ('')} className="text-muted active:scale-90" aria-label="Hapus"><X size={17} /></button>}
                        </div>
                        <div className="mt-2">
                          {q.trim().length < 2 && <p className="text-center text-[13px] text-muted py-8">Ketik minimal 2 huruf untuk mencari.</p>}
                          {q.trim().length >= 2 && found === null && <div className="space-y-2 pt-2">{[0, 1, 2].map((i) => <div key={i} className="h-[62px] rounded-2xl bg-white/[0.06] animate-pulse" />)}</div>}
                          {found && found.length === 0 && <p className="text-center text-[13px] text-muted py-8">Tidak ada pengguna bernama "{q.trim()}".</p>}
                          {found?.map(renderRow)}
                        </div>
                      </>
                    ) : rows === null ? (
                      <div className="space-y-2 pt-1">{[0, 1, 2].map((i) => <div key={i} className="h-[62px] rounded-2xl bg-white/[0.06] animate-pulse" />)}</div>
                    ) : rows.length === 0 ? (
                      <div className="py-10 text-center text-muted space-y-2">
                        <Users size={34} className="mx-auto opacity-60" />
                        <p className="text-[13.5px]">{tab === 'followers' ? 'Belum ada pengikut.' : 'Belum mengikuti siapa pun.'}</p>
                        {isMe && <button onClick={() => setTab('search')} className="text-accent text-[13.5px] font-semibold">Cari teman untuk diikuti</button>}
                      </div>
                    ) : rows.map(renderRow)}
                  </div>
                </>
              )}

              {/* Edit profil */}
              {prof && edit && (
                <div className="mt-5 space-y-5">
                  <h2 className="text-[22px] font-extrabold leading-[1.25]">Edit profil</h2>
                  <label className="block">
                    <span className="text-[12.5px] font-semibold text-muted">Nama</span>
                    <input value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)}
                      className="mt-1.5 w-full h-12 px-4 rounded-2xl bg-white/[0.07] border border-white/15 focus:border-accent outline-none text-[16px]" />
                    <span className="block text-right text-[11.5px] text-muted mt-1">{name.length}/{MAX_NAME}</span>
                  </label>
                  <label className="block">
                    <span className="text-[12.5px] font-semibold text-muted">Bio</span>
                    <textarea value={bio} maxLength={MAX_BIO} rows={4} onChange={(e) => setBio(e.target.value)} placeholder="Ceritakan seleramu bermusik…"
                      className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-white/[0.07] border border-white/15 focus:border-accent outline-none text-[15.5px] leading-[1.5] resize-none placeholder:text-muted" />
                    <span className="block text-right text-[11.5px] text-muted mt-1">{bio.length}/{MAX_BIO}</span>
                  </label>
                  <p className="text-[12.5px] text-muted leading-relaxed">Nama, foto, dan bio bersifat publik — terlihat oleh pengguna lain dan di leaderboard.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setEdit(false)} className="h-12 rounded-full bg-white/10 border border-white/15 font-semibold active:scale-95">Batal</button>
                    <button onClick={doSave} disabled={saving || !name.trim()} className="h-12 rounded-full bg-accent text-ink font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.6} />} Simpan
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
