import React, { useEffect, useState } from 'react';
import { PageHeader, HeaderIconButton } from '../components/PageHeader';
import { motion } from 'motion/react';
import { ArrowLeft, History, User, MoreVertical, Play } from 'lucide-react';
import { Song } from '../types/music';
import { MusicApi } from '../services/api';
import { useMusic } from '../context/MusicContext';
import { SongCardSkeleton } from '../components/SkeletonLoader';

// Kartu genre berwarna (gaya grid "Explore" pada video). `q` = kata kunci pencarian.
type Tile = { id: string; name: string; q: string; from: string; to: string };

const TILES: Tile[] = [
  { id: 'chill', name: 'Bersantai', q: 'chill songs', from: '#3b82f6', to: '#1e3a8a' },
  { id: 'feelgood', name: 'Bersemangat', q: 'feel good songs', from: '#fbbf24', to: '#d97706' },
  { id: 'energi', name: 'Olah Raga', q: 'workout songs', from: '#fb923c', to: '#9a3412' },
  { id: 'fokus', name: 'Fokus', q: 'focus lofi songs', from: '#a1a1aa', to: '#3f3f46' },
  { id: 'party', name: 'Pesta', q: 'party songs', from: '#a855f7', to: '#4c1d95' },
  { id: 'romance', name: 'Romantis', q: 'romantic songs', from: '#f43f5e', to: '#7f1d1d' },
  { id: 'sad', name: 'Sedih', q: 'sad songs', from: '#6366f1', to: '#1e1b4b' },
  { id: 'sleep', name: 'Tidur', q: 'sleep music', from: '#38bdf8', to: '#1e3a8a' },
  { id: 'gaming', name: 'Gaming', q: 'gaming music', from: '#22c55e', to: '#14532d' },
  { id: 'arabic', name: 'Arab', q: 'arabic songs', from: '#e11d48', to: '#166534' },
  { id: 'african', name: 'Afrika', q: 'african songs', from: '#16a34a', to: '#052e16' },
  { id: 'blues', name: 'Blues', q: 'blues songs', from: '#2563eb', to: '#0b1d4d' },
  { id: 'bollywood', name: 'Bollywood & India', q: 'bollywood songs', from: '#f97316', to: '#7e22ce' },
  { id: 'classical', name: 'Klasik', q: 'classical music', from: '#a8a29e', to: '#44403c' },
  { id: 'pop', name: 'Pop', q: 'pop hits', from: '#f472b6', to: '#9d174d' },
  { id: 'hiphop', name: 'Hip-Hop', q: 'hip hop hits', from: '#f59e0b', to: '#78350f' },
  { id: 'indo', name: 'Indonesia', q: 'lagu indonesia populer', from: '#ef4444', to: '#7c2d12' },
  { id: 'dangdut', name: 'Dangdut', q: 'dangdut populer', from: '#fb923c', to: '#831843' },
  { id: 'indie', name: 'Indie', q: 'indie songs', from: '#34d399', to: '#0f766e' },
  { id: 'lofi', name: 'Lo-fi', q: 'lofi hip hop', from: '#818cf8', to: '#312e81' },
  { id: 'edm', name: 'EDM', q: 'edm hits', from: '#22d3ee', to: '#0e7490' },
  { id: 'jazz', name: 'Jazz', q: 'jazz songs', from: '#fbbf24', to: '#78350f' },
];

const headBtn = 'w-10 h-10 rounded-full glass-pill flex items-center justify-center text-[#f0e6e5] active:scale-90 transition-transform';

export const ExplorePage: React.FC = () => {
  const { playSong, openSongMenu, setActiveTab, currentSong, isPlaying } = useMusic();
  const [picked, setPicked] = useState<Tile | null>(null);
  const [items, setItems] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!picked) return;
    let alive = true;
    setLoading(true);
    setError('');
    setItems([]);
    MusicApi.search(picked.q, 'songs')
      .then((r) => {
        if (!alive) return;
        setItems(r.filter((x): x is Song & { kind: 'song' | 'video' } => x.kind === 'song' || x.kind === 'video'));
      })
      .catch(() => { if (alive) setError('Gagal memuat. Periksa koneksi lalu coba lagi.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [picked]);

  // ---------- Tampilan hasil satu genre ----------
  if (picked) {
    return (
      <div className="pb-52 space-y-5 pt-2">
        <div className="flex items-center gap-3">
          <button onClick={() => setPicked(null)} className={headBtn} aria-label="Kembali"><ArrowLeft size={20} /></button>
          <h1 className="text-[24px] font-bold tracking-tight flex-1 truncate">{picked.name}</h1>
          {items.length > 0 && (
            <button onClick={() => playSong(items[0], items)}
              className="h-10 px-4 rounded-full bg-accent text-ink text-[13px] font-bold flex items-center gap-1.5 active:scale-95">
              <Play size={13} className="fill-current" /> Putar
            </button>
          )}
        </div>

        <div className="h-[120px] rounded-[26px] overflow-hidden relative"
          style={{ background: `linear-gradient(135deg, ${picked.from}, ${picked.to})` }}>
          <span className="absolute -right-6 -bottom-8 w-36 h-36 rounded-full bg-white/15" />
          <span className="absolute left-5 bottom-4 text-[13px] font-semibold text-white/85">{items.length} lagu</span>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((n) => <SongCardSkeleton key={n} />)}</div>
        ) : error ? (
          <p className="text-center text-sm text-rose-300 py-10">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-muted py-10">Belum ada lagu untuk {picked.name}.</p>
        ) : (
          <div>
            {items.map((song) => {
              const current = currentSong?.id === song.id;
              return (
                <div key={song.id} onClick={() => playSong(song, items)}
                  className="flex items-center gap-3 py-2.5 row-divider cursor-pointer active:opacity-70">
                  <div className="relative w-[54px] h-[54px] rounded-[14px] overflow-hidden shrink-0 bg-white/10">
                    <img src={song.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                    {current && isPlaying && <div className="absolute inset-0 bg-black/45" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : 'text-[#f4eceb]'}`}>{song.title}</p>
                    <p className="text-[13px] text-muted truncate">{song.artists.map((a) => a.name).join(', ')}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); openSongMenu(song); }} className="p-2 text-[#e9dfde] active:scale-90" aria-label="Menu lagu">
                    <MoreVertical size={20} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---------- Grid genre ----------
  return (
    <div className="pb-52 space-y-6 pt-2">
      <PageHeader eyebrow="Jelajahi" title="Explore"
        actions={<HeaderIconButton label="Riwayat" onClick={() => setActiveTab('library')}><History size={20} /></HeaderIconButton>} />

      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t, i) => (
          <motion.button key={t.id} onClick={() => setPicked(t)}
            initial={{ opacity: 0, scale: 0.9, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.035, type: 'spring', stiffness: 360, damping: 26 }}
            whileTap={{ scale: 0.95 }}
            className="tile-shine relative h-[104px] rounded-[20px] overflow-hidden text-left p-3.5 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
            <span className="relative block text-[16px] font-bold text-white leading-tight drop-shadow-md pr-2">{t.name}</span>
            <span className="absolute -right-5 -bottom-6 w-[88px] h-[88px] rounded-full bg-white/20" />
            <span className="absolute right-3 top-3 w-8 h-8 rotate-[18deg] rounded-xl bg-white/25" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};
