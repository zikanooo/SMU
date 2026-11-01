import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Link2, Loader2, Check, AlertTriangle, ClipboardPaste, Music2 } from 'lucide-react';
import { MusicApi, SpotifyPlaylist, SpotifyTrack } from '../services/api';
import { Song } from '../types/music';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Dipanggil saat lagu hasil pencocokan siap disimpan sebagai playlist. */
  onImport: (name: string, songs: Song[]) => void;
}

type Phase = 'input' | 'loading' | 'preview' | 'matching' | 'done';
const CONCURRENCY = 4;

/** Popup impor playlist Spotify: tempel tautan -> pratinjau -> cocokkan ke YouTube Music -> simpan sebagai playlist. */
export const ImportSpotifyDialog: React.FC<Props> = ({ open, onClose, onImport }) => {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState('');
  const [pl, setPl] = useState<SpotifyPlaylist | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [missing, setMissing] = useState<SpotifyTrack[]>([]);
  const [found, setFound] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRef = useRef(false);
  const discardRef = useRef(false); // ditutup lewat X/Esc saat mencocokkan -> jangan simpan

  const reset = () => {
    abortRef.current?.abort();
    stopRef.current = false; discardRef.current = false;
    setUrl(''); setPhase('input'); setError(''); setPl(null); setDoneCount(0); setMissing([]); setFound(0);
  };

  useEffect(() => {
    if (!open) return;
    reset();
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = phase === 'loading' || phase === 'matching';
  const close = () => { if (phase === 'matching') { stopRef.current = true; discardRef.current = true; } abortRef.current?.abort(); onClose(); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const paste = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setUrl(t.trim()); } catch { inputRef.current?.focus(); }
  };

  const fetchList = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!url.trim() || busy) return;
    setError(''); setPhase('loading');
    const ctl = new AbortController(); abortRef.current = ctl;
    try {
      const p = await MusicApi.spotifyPlaylist(url, ctl.signal);
      if (!p?.tracks?.length) throw new Error('Playlist kosong atau tidak bisa dibaca.');
      setPl(p); setPhase('preview');
    } catch (err: any) {
      if (ctl.signal.aborted) return;
      setError(err?.message || 'Gagal membaca playlist.'); setPhase('input');
    }
  };

  const startMatch = async () => {
    if (!pl) return;
    stopRef.current = false; discardRef.current = false;
    setPhase('matching'); setDoneCount(0); setMissing([]); setFound(0);
    const ctl = new AbortController(); abortRef.current = ctl;

    const results: (Song | null)[] = new Array(pl.tracks.length).fill(null);
    const notFound: SpotifyTrack[] = [];
    let next = 0, done = 0, ok = 0;

    const worker = async () => {
      while (!stopRef.current) {
        const i = next++;
        if (i >= pl.tracks.length) return;
        const t = pl.tracks[i];
        try {
          const r = await MusicApi.spotifyMatch(t, ctl.signal);
          if (r.song) { results[i] = r.song; ok++; } else notFound.push(t);
        } catch {
          if (ctl.signal.aborted) return;
          notFound.push(t);
        }
        done++; setDoneCount(done); setFound(ok);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pl.tracks.length) }, worker));

    const songs = results.filter((s): s is Song => !!s); // urutan asli playlist terjaga
    setMissing(notFound); setFound(songs.length);
    if (discardRef.current) return;
    if (songs.length) onImport(pl.name, songs);
    setPhase('done');
  };

  const total = pl?.tracks.length || 0;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
          <motion.div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !busy && close()} />
          <motion.div role="dialog" aria-modal="true" aria-label="Impor playlist dari Spotify"
            className="relative w-full max-w-[380px] max-h-[85vh] overflow-y-auto rounded-[28px] p-5 border border-white/12 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
            style={{ background: 'linear-gradient(180deg, rgba(46,38,43,.98), rgba(24,20,22,.99))' }}
            initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <button type="button" onClick={close} className="absolute right-3 top-3 w-9 h-9 rounded-full flex items-center justify-center text-white/70 active:scale-90" aria-label="Tutup"><X size={19} /></button>

            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(29,185,84,.16)', border: '1px solid rgba(29,185,84,.4)' }}>
              <Music2 size={22} style={{ color: '#1ed760' }} />
            </div>
            <h3 className="text-[20px] font-bold tracking-tight">Impor dari Spotify</h3>

            {(phase === 'input' || phase === 'loading') && (
              <form onSubmit={fetchList}>
                <p className="text-[13px] text-muted mt-0.5">Tempel tautan playlist <b className="font-semibold text-white/80">publik</b>. Di Spotify: Bagikan → Salin tautan.</p>
                <div className="relative mt-4">
                  <Link2 size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  <input ref={inputRef} value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }} disabled={phase === 'loading'}
                    inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                    placeholder="https://open.spotify.com/playlist/…"
                    className="w-full h-12 pl-11 pr-12 rounded-2xl bg-white/[0.07] border border-white/15 focus:border-accent outline-none text-[14.5px] placeholder:text-white/35 transition-colors" />
                  <button type="button" onClick={paste} aria-label="Tempel dari papan klip" disabled={phase === 'loading'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white/70 active:scale-90"><ClipboardPaste size={17} /></button>
                </div>
                {error && <p role="alert" className="text-[12.5px] text-rose-300 mt-2.5 flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{error}</p>}
                <div className="grid grid-cols-2 gap-2.5 mt-5">
                  <button type="button" onClick={close} className="h-12 rounded-full bg-white/10 border border-white/12 text-[14.5px] font-semibold active:scale-95 transition-transform">Batal</button>
                  <button type="submit" disabled={!url.trim() || phase === 'loading'}
                    className="h-12 rounded-full bg-accent text-ink text-[14.5px] font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2">
                    {phase === 'loading' ? <><Loader2 size={17} className="animate-spin" /> Membaca…</> : 'Lanjut'}
                  </button>
                </div>
              </form>
            )}

            {phase === 'preview' && pl && (
              <div>
                <div className="flex items-center gap-3 mt-3 p-3 rounded-2xl bg-white/[0.06] border border-white/10">
                  {pl.cover
                    ? <img src={pl.cover} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/10 shrink-0" referrerPolicy="no-referrer" />
                    : <div className="w-14 h-14 rounded-xl bg-white/10 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-bold truncate">{pl.name}</p>
                    <p className="text-[12.5px] text-muted truncate">{pl.tracks.length} lagu{pl.owner ? ` · ${pl.owner}` : ''}</p>
                  </div>
                </div>
                {pl.partial && (
                  <p className="text-[12.5px] text-amber-300/90 mt-3 flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    {pl.source === 'embed'
                      ? 'Spotify hanya membagikan ±100 lagu pertama tanpa kunci API. Admin bisa mengisi SPOTIFY_CLIENT_ID/SECRET untuk playlist lebih panjang.'
                      : `Hanya ${pl.tracks.length} lagu pertama yang diimpor.`}
                  </p>
                )}
                <p className="text-[12.5px] text-muted mt-3">Tiap lagu akan dicarikan padanannya di YouTube Music, lalu disimpan sebagai playlist baru.</p>
                <div className="grid grid-cols-2 gap-2.5 mt-5">
                  <button onClick={() => { setPhase('input'); setPl(null); }} className="h-12 rounded-full bg-white/10 border border-white/12 text-[14.5px] font-semibold active:scale-95 transition-transform">Kembali</button>
                  <button onClick={startMatch} className="h-12 rounded-full bg-accent text-ink text-[14.5px] font-bold active:scale-95 transition-transform">Impor {total} lagu</button>
                </div>
              </div>
            )}

            {phase === 'matching' && pl && (
              <div>
                <p className="text-[13px] text-muted mt-0.5 truncate">Mencocokkan “{pl.name}”…</p>
                <div className="mt-5 h-2.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[12.5px] text-muted mt-2 tabular-nums">
                  <span>{doneCount} / {total} lagu</span><span>{found} cocok</span>
                </div>
                <button onClick={() => { stopRef.current = true; abortRef.current?.abort(); }}
                  className="w-full h-12 mt-5 rounded-full bg-white/10 border border-white/12 text-[14.5px] font-semibold active:scale-95 transition-transform">
                  Hentikan & simpan yang sudah cocok
                </button>
              </div>
            )}

            {phase === 'done' && pl && (
              <div>
                <div className="mt-3 flex items-start gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0"><Check size={16} /></span>
                  <p className="text-[14px] leading-snug">
                    {found > 0
                      ? <><b>{found} dari {total} lagu</b> disimpan ke playlist “{pl.name}”.</>
                      : <>Tidak ada lagu yang cocok, jadi playlist tidak dibuat.</>}
                  </p>
                </div>
                {missing.length > 0 && (
                  <details className="mt-3 rounded-2xl bg-white/[0.05] border border-white/10 px-3.5 py-2.5">
                    <summary className="text-[13px] text-muted cursor-pointer">{missing.length} lagu tidak ditemukan</summary>
                    <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                      {missing.map((t, i) => (
                        <li key={i} className="text-[12.5px] truncate"><span className="font-semibold">{t.title}</span> <span className="text-muted">· {t.artists.join(', ')}</span></li>
                      ))}
                    </ul>
                  </details>
                )}
                <button onClick={onClose} className="w-full h-12 mt-5 rounded-full bg-accent text-ink text-[14.5px] font-bold active:scale-95 transition-transform">Selesai</button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
