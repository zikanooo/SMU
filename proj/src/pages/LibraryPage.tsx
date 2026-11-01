import React, { useState, useEffect } from 'react';
import { PageHeader, HeaderIconButton } from '../components/PageHeader';
import { motion } from 'motion/react';
import { Heart, History, ListMusic, Trash2, ArrowLeft, Play, MoreVertical, Disc3, Plus, Users, BadgeCheck, ChevronRight, User, Music2, Download } from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { useMusic } from '../context/MusicContext';
import { MusicApi } from '../services/api';
import { CreatePlaylistDialog } from '../components/CreatePlaylistDialog';
import { ImportSpotifyDialog } from '../components/ImportSpotifyDialog';

// Durasi lagu dalam detik (pakai durationSeconds bila ada, kalau tidak dari teks "m:ss"/"h:mm:ss")
const toSeconds = (s: Song): number => {
  if (s.durationSeconds) return s.durationSeconds;
  if (!s.duration) return 0;
  return s.duration.split(':').reduce((acc, part) => acc * 60 + (parseInt(part, 10) || 0), 0);
};

const topArtistOf = (songs: Song[]): string => {
  const count = new Map<string, number>();
  songs.forEach((s) => s.artists.forEach((a) => count.set(a.name, (count.get(a.name) || 0) + 1)));
  let best = ''; let n = 0;
  count.forEach((v, k) => { if (v > n) { n = v; best = k; } });
  return best;
};

// Sampul playlist: mosaik 2x2 dari 4 lagu pertama
const Mosaic: React.FC<{ songs: Song[] }> = ({ songs }) => {
  const thumbs = songs.slice(0, 4);
  if (!thumbs.length) {
    return <div className="w-full h-full flex items-center justify-center text-[#e8cfd6]"><ListMusic size={44} strokeWidth={1.4} /></div>;
  }
  return (
    <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
      {[0, 1, 2, 3].map((i) => thumbs[i]
        ? <img key={i} src={thumbs[i].thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
        : <div key={i} className="bg-white/[0.06]" />)}
    </div>
  );
};

export const LibraryPage: React.FC = () => {
  const {
    favorites, history, queue, playlists, subscriptions, playSong, currentSong, clearHistory, clearQueue, setActiveTab,
    openSongMenu, openArtist, createPlaylist, importPlaylist, deletePlaylist, removeFromPlaylist, toggleSubscribe,
  } = useMusic();
  const [view, setView] = useState<string>('grid');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [live, setLive] = useState<Record<string, string>>({});
  useEffect(() => {
    if (view !== 'subs') return;
    let alive = true;
    const tick = () => subscriptions.forEach((a) => a.id && MusicApi.getArtist(a.id)
      .then((d) => { if (alive) setLive((p) => ({ ...p, [a.id!]: d.artist.subscribers || '' })); }).catch(() => {}));
    tick();
    const t = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [view, subscriptions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const Back: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
    <div className="flex items-center gap-2">
      <button onClick={() => setView('grid')} className="p-2 -ml-2 text-[#f0e6e5] active:scale-90" aria-label="Kembali"><ArrowLeft size={22} /></button>
      <h1 className="text-[24px] font-bold tracking-tight flex-1 truncate">{title}</h1>
      {right}
    </div>
  );

  if (view === 'grid') {
    const minutes = Math.round(history.reduce((acc, s) => acc + toSeconds(s), 0) / 60);
    const topArtist = topArtistOf(history);

    return (
      <div className="pb-52 space-y-5 pt-2">
        <PageHeader eyebrow="Koleksi" title="Perpustakaanmu"
          actions={<HeaderIconButton label="Riwayat" onClick={() => setView('history')}><History size={20} /></HeaderIconButton>} />

        {/* Tab segmen */}
        <div className="seg" role="tablist">
          <button role="tab" aria-selected="true"><ListMusic size={15} /> Playlist <span className="text-[11px] opacity-70">{playlists.length}</span></button>
          <button role="tab" aria-selected="false" onClick={() => setView('subs')}><Users size={15} /> Artis <span className="text-[11px] opacity-70">{subscriptions.length}</span></button>
          <button role="tab" aria-selected="false" onClick={() => setView('favorites')}><Heart size={15} /> Disukai</button>
          <button role="tab" aria-selected="false" onClick={() => setView('queue')}><Disc3 size={15} /> Antrean</button>
        </div>

        {/* Kartu statistik ringkas dari riwayat lokal */}
        <div className="hero-card p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[34px] font-extrabold leading-none tabular-nums">{minutes}</p>
            <p className="eyebrow !text-white/70 mt-1.5">Menit didengar</p>
          </div>
          <div className="text-right min-w-0">
            <p className="text-[15px] font-bold truncate">{topArtist || 'Belum ada'}</p>
            <p className="eyebrow !text-white/70">{topArtist ? 'Pendengar setia' : 'Mulai putar lagu'}</p>
            <p className="text-[12px] text-white/75 mt-0.5">{history.length} putaran</p>
          </div>
        </div>

        {/* Buat playlist baru -> popup */}
        <button onClick={() => setCreating(true)} className="w-full glass-panel rounded-[24px] p-3.5 flex items-center gap-3 text-left active:scale-[0.985] transition-transform">
          <span className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0"><ListMusic size={22} className="text-accent" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold leading-tight">Buat playlist baru</p>
            <p className="text-[12.5px] text-muted mt-0.5">Ketuk untuk memberi nama</p>
          </div>
          <span className="w-11 h-11 rounded-full bg-accent text-ink flex items-center justify-center shrink-0"><Plus size={22} /></span>
        </button>
        <CreatePlaylistDialog open={creating} onClose={() => setCreating(false)}
          onCreate={(n) => { createPlaylist(n); setCreating(false); }} />

        {/* Impor playlist dari Spotify */}
        <button onClick={() => setImporting(true)} className="w-full glass-panel rounded-[24px] p-3.5 flex items-center gap-3 text-left active:scale-[0.985] transition-transform">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(29,185,84,.16)' }}><Music2 size={22} style={{ color: '#1ed760' }} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold leading-tight">Impor dari Spotify</p>
            <p className="text-[12.5px] text-muted mt-0.5">Tempel tautan playlist publik</p>
          </div>
          <span className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0"><Download size={20} /></span>
        </button>
        <ImportSpotifyDialog open={importing} onClose={() => setImporting(false)} onImport={(n, songs) => importPlaylist(n, songs)} />

        {/* Playlist: kisi 2 kolom, sampul mosaik */}
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-5">
          {playlists.map((p: Playlist, i: number) => (
            <motion.button key={p.id} onClick={() => setView(`pl:${p.id}`)} whileTap={{ scale: 0.96 }}
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.05 }} className="text-left min-w-0">
              <div className="aspect-square rounded-[26px] overflow-hidden bg-white/[0.08] border border-white/10 shadow-xl">
                <Mosaic songs={p.songs} />
              </div>
              <p className="mt-2 text-[15px] font-bold truncate">{p.name}</p>
              <p className="text-[12px] text-muted truncate">Playlist · {p.songs.length} lagu</p>
            </motion.button>
          ))}
        </div>
        {playlists.length === 0 && <p className="text-center text-[13px] text-muted py-6">Belum ada playlist. Buat yang pertama di atas.</p>}
      </div>
    );
  }

  if (view === 'subs') {
    return (
      <div className="pb-52 space-y-5">
        <Back title="Artis" />
        {subscriptions.length === 0 ? (
          <div className="py-20 text-center text-muted space-y-3"><Users size={40} className="mx-auto opacity-60" /><p className="text-sm">Buka profil artis lalu ketuk Subscribe.</p></div>
        ) : subscriptions.map((a) => (
          <div key={a.id || a.name} className="flex items-center gap-3 py-1.5">
            <button onClick={() => openArtist({ id: a.id, name: a.name })} className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-white/10 shrink-0">{a.thumbnail && <img src={a.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}</div>
              <div className="min-w-0"><p className="text-[15.5px] font-semibold truncate">{a.name}</p><p className="text-[12.5px] text-muted truncate">{(a.id && live[a.id]) || a.subscribers || 'Artis'}</p></div>
            </button>
            <button onClick={() => toggleSubscribe(a)} className="px-3.5 py-1.5 rounded-full border border-accent text-accent text-[13px] font-semibold flex items-center gap-1.5 active:scale-95"><BadgeCheck size={14} /> Berlangganan</button>
          </div>
        ))}
      </div>
    );
  }

  const pl = view.startsWith('pl:') ? playlists.find((p) => p.id === view.slice(3)) : undefined;
  if (view.startsWith('pl:') && !pl) { setView('grid'); return null; }
  const list: Song[] = pl ? pl.songs : view === 'favorites' ? favorites : view === 'history' ? history : queue;
  const title = pl ? pl.name : view === 'favorites' ? 'Disukai' : view === 'history' ? 'Riwayat' : 'Antrean';

  return (
    <div className="pb-52 space-y-5">
      <Back title={title} right={list.length > 0 && (
        <button onClick={() => playSong(list[0], list)} className="px-4 py-1.5 rounded-full bg-accent text-ink text-[13px] font-bold flex items-center gap-1.5 active:scale-95"><Play size={13} className="fill-current" /> Putar semua</button>
      )} />
      {(view === 'history' || view === 'queue') && list.length > 0 && (
        <button onClick={view === 'history' ? clearHistory : clearQueue} className="text-[13px] text-rose-300 flex items-center gap-1.5"><Trash2 size={14} /> {view === 'history' ? 'Hapus riwayat' : 'Bersihkan antrean'}</button>
      )}
      {pl && <button onClick={() => { deletePlaylist(pl.id); setView('grid'); }} className="text-[13px] text-rose-300 flex items-center gap-1.5"><Trash2 size={14} /> Hapus playlist</button>}
      {list.length === 0 ? (
        <div className="py-20 text-center text-muted space-y-3">
          <Disc3 size={40} className="mx-auto opacity-60" />
          <p className="text-sm">{pl ? 'Tambahkan lagu lewat menu titik tiga.' : view === 'favorites' ? 'Ketuk ikon hati pada lagu untuk menyimpannya di sini.' : view === 'history' ? 'Lagu yang kamu putar akan muncul di sini.' : 'Antrean kosong.'}</p>
        </div>
      ) : (
        <div>
          {list.map((song, idx) => {
            const current = currentSong?.id === song.id;
            return (
              <div key={`${song.id}-${idx}`} onClick={() => playSong(song, list)} className="flex items-center gap-3 py-2.5 row-divider cursor-pointer active:opacity-70">
                <img src={song.thumbnail} alt="" className="w-[54px] h-[54px] rounded-[14px] object-cover bg-white/10" referrerPolicy="no-referrer" loading="lazy" />
                <div className="flex-1 min-w-0">
                  <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : ''}`}>{song.title}</p>
                  <p className="text-[13px] text-muted truncate">{song.artists.map((a) => a.name).join(', ')}</p>
                </div>
                {pl && <button onClick={(e) => { e.stopPropagation(); removeFromPlaylist(pl.id, song.id); }} className="p-2 text-muted active:scale-90" aria-label="Hapus dari playlist"><Trash2 size={17} /></button>}
                <button onClick={(e) => { e.stopPropagation(); openSongMenu(song); }} className="p-2 text-[#e9dfde] active:scale-90" aria-label="Menu"><MoreVertical size={20} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
