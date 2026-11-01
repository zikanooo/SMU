import { LiveBadge } from '../components/LiveBadge';
import { PageHeader, HeaderIconButton } from '../components/PageHeader';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  History, BarChart3, Settings, Users, ChevronRight, Play, MoreVertical, Mic, Shuffle,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Song, Album, Artist } from '../types/music';
import { MusicApi, FeaturedArtist } from '../services/api';
import { useMusic } from '../context/MusicContext';
import { useAuth } from '../context/AuthContext';
import { SongCardSkeleton, AlbumCardSkeleton, ArtistCardSkeleton, SpeedDialSkeleton } from '../components/SkeletonLoader';


// Animasi muncul saat section masuk layar (sekali saja)
const REVEAL = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] },
};

type Mood = { id: string; name: string; color: string };

const DEFAULT_MOODS: Mood[] = [
  { id: 'chill', name: 'Bersantai', color: '#10b981' },
  { id: 'travel', name: 'Perjalanan', color: '#38bdf8' },
  { id: 'sleep', name: 'Tidur', color: '#6366f1' },
  { id: 'sad', name: 'Sedih', color: '#60a5fa' },
  { id: 'feelgood', name: 'Bersemangat', color: '#fbbf24' },
  { id: 'energi', name: 'Olah Raga', color: '#f97316' },
  { id: 'romance', name: 'Romantis', color: '#f472b6' },
  { id: 'fokus', name: 'Fokus', color: '#a855f7' },
  { id: 'party', name: 'Pesta', color: '#ec4899' },
];

const FEATURED_NAMES = ['Drake', 'Frank Ocean', 'Ariana Grande', 'Justin Bieber', 'Hindia', 'Hijau Daun'];
const DEFAULT_GENRES: Mood[] = [
  { id: 'pop', name: 'Pop', color: '#f472b6' }, { id: 'hiphop', name: 'Hip-Hop', color: '#f59e0b' },
  { id: 'rnb', name: 'R&B', color: '#a78bfa' }, { id: 'indo', name: 'Indonesia', color: '#ef4444' },
  { id: 'indie', name: 'Indie', color: '#34d399' }, { id: 'rock', name: 'Rock', color: '#94a3b8' },
  { id: 'kpop', name: 'K-Pop', color: '#ec4899' }, { id: 'edm', name: 'EDM', color: '#22d3ee' },
  { id: 'dangdut', name: 'Dangdut', color: '#fb923c' }, { id: 'jazz', name: 'Jazz', color: '#fbbf24' },
  { id: 'lofi', name: 'Lo-fi', color: '#818cf8' }, { id: 'latin', name: 'Latin', color: '#f97316' },
];

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const names = (s: Song) => s.artists.map((a) => a.name).join(', ');
const DiceFive: React.FC = () => (
  <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
    {[[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="5.2" fill="var(--accent)" opacity="0.92" />
    ))}
  </svg>
);

// ---------- Komponen stabil (di luar HomePage, supaya tidak dibuat ulang tiap render) ----------

const SectionHeader: React.FC<{ title: string; onPlayAll?: () => void }> = ({ title, onPlayAll }) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-[20px] font-extrabold text-[#f4eceb] tracking-tight truncate flex items-center gap-2.5"><span className="w-1 h-5 rounded-full bg-accent shrink-0" />{title}</h2>
    {onPlayAll && (
      <button onClick={onPlayAll} className="shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold text-accent bg-accent/15 active:scale-95 transition-transform">
        Putar semua
      </button>
    )}
  </div>
);

const SongRow = memo<{ song: Song; list: Song[]; current: boolean; playing: boolean; onPlay: (s: Song, l: Song[]) => void; onMenu: (s: Song) => void }>(
  ({ song, list, current, playing, onPlay, onMenu }) => (
    <div onClick={() => onPlay(song, list)}
      className={`flex items-center gap-3 py-2 px-2 -mx-2 rounded-2xl cursor-pointer active:bg-white/10 transition-colors ${current ? 'bg-white/[0.08]' : ''}`}>
      <div className="relative w-[52px] h-[52px] rounded-[14px] overflow-hidden shrink-0 bg-white/10">
        <img src={song.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
        {current && playing && (
          <div className="absolute inset-0 bg-black/55 flex items-end justify-center gap-[3px] pb-3">
            {[0, 1, 2].map((i) => <span key={i} className="w-[3px] bg-accent rounded-full animate-pulse" style={{ height: 8 + i * 4, animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : 'text-[#f4eceb]'}`}>{song.title}</p>
        <p className="text-[13px] text-muted truncate">{names(song)}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onMenu(song); }} className="p-2 text-[#e9dfde] active:scale-90" aria-label="Menu lagu">
        <MoreVertical size={20} />
      </button>
    </div>
  ),
);

const SongColumns = memo<{ cols: Song[][]; list: Song[]; currentId?: string; playing: boolean; onPlay: (s: Song, l: Song[]) => void; onMenu: (s: Song) => void }>(
  ({ cols, list, currentId, playing, onPlay, onMenu }) => (
    <div className="hscroll gap-5 -mx-4 px-4 snap-x snap-proximity">
      {cols.map((col, i) => (
        <div key={i} className="snap-start w-[88%]">
          {col.map((s) => <SongRow key={s.id} song={s} list={list} current={currentId === s.id} playing={playing} onPlay={onPlay} onMenu={onMenu} />)}
        </div>
      ))}
    </div>
  ),
);

const SpeedDial = memo<{ items: (Song | 'dice')[]; currentId?: string; list: Song[]; onPlay: (s: Song, l: Song[]) => void; onDice: () => void }>(
  ({ items, currentId, list, onPlay, onDice }) => {
    const pages = useMemo(() => chunk(items, 9), [items]);
    const [page, setPage] = useState(0);
    const raf = useRef(0);
    const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const p = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
        setPage((cur) => (cur === p ? cur : p));
      });
    };
    return (
      <>
        <div className="hscroll -mx-4 snap-x snap-mandatory" onScroll={onScroll}>
          {pages.map((pg, pi) => (
            <div key={pi} className="snap-start w-full px-4 grid grid-cols-3 gap-x-3 gap-y-4 content-start" style={{ scrollSnapStop: 'always' }}>
              {pg.map((item) =>
                item === 'dice' ? (
                  <button key="dice" onClick={onDice} className="aspect-square rounded-[20px] glass-panel flex items-center justify-center card-press" aria-label="Putar acak"><DiceFive /></button>
                ) : (
                  <button key={item.id} onClick={() => onPlay(item, list)} className="text-left min-w-0 card-press">
                    <div className="relative aspect-square rounded-[20px] overflow-hidden bg-white/10 shadow-lg">
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                      {currentId === item.id && <div className="absolute inset-0 ring-2 ring-inset ring-accent rounded-[20px] bg-black/25" />}
                    </div>
                    <p className="mt-1.5 text-[13px] font-semibold text-[#f4eceb] truncate">{item.title}</p>
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
        {pages.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {pages.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === page ? 'w-4 bg-accent' : 'w-1.5 bg-white/25'}`} />)}
          </div>
        )}
      </>
    );
  },
);

const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
};

// Ubin cepat 2 kolom: sampul di kiri, judul & subjudul di kanan (gaya baru)
const QuickGrid = memo<{ items: (Song | 'dice')[]; currentId?: string; list: Song[]; onPlay: (s: Song, l: Song[]) => void; onDice: () => void }>(
  ({ items, currentId, list, onPlay, onDice }) => (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((item) =>
        item === 'dice' ? (
          <button key="dice" onClick={onDice} className="quick-tile card-press justify-center" aria-label="Putar acak">
            <Shuffle size={22} className="text-accent" />
            <span className="text-[13px] font-semibold text-accent">Acak</span>
          </button>
        ) : (
          <button key={item.id} onClick={() => onPlay(item, list)} className={`quick-tile card-press ${currentId === item.id ? 'quick-tile-on' : ''}`}>
            <img src={item.thumbnail} alt="" className="w-[60px] h-[60px] object-cover shrink-0 bg-white/10" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
            <span className="min-w-0 flex-1 px-3 text-left flex flex-col justify-center gap-[3px]">
              <span className="qt-title">{item.title}</span>
              <span className="text-[11px] leading-[1.2] text-muted truncate">{names(item)}</span>
            </span>
          </button>
        ),
      )}
    </div>
  ),
);

// Kartu rekomendasi besar dengan tombol putar melayang di sampul
const RecCard = memo<{ song: Song; list: Song[]; current: boolean; onPlay: (s: Song, l: Song[]) => void }>(({ song, list, current, onPlay }) => (
  <button onClick={() => onPlay(song, list)} className="w-[188px] text-left card-press">
    <div className="relative aspect-square rounded-[28px] overflow-hidden bg-white/10 shadow-xl">
      <img src={song.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
      <span className="absolute right-3 bottom-3 w-11 h-11 rounded-full glass-pill flex items-center justify-center text-white">
        <Play size={18} className="fill-current ml-0.5" />
      </span>
      {current && <div className="absolute inset-0 ring-2 ring-inset ring-accent rounded-[28px]" />}
    </div>
    <p className={`mt-2.5 text-[15px] font-bold truncate ${current ? 'text-accent' : 'text-[#f4eceb]'}`}>{song.title}</p>
    <p className="text-[12px] text-muted truncate uppercase tracking-wide">{names(song)}</p>
  </button>
));

const SquareCard = memo<{ song: Song; list: Song[]; rank: number; current: boolean; onPlay: (s: Song, l: Song[]) => void }>(
  ({ song, list, rank, current, onPlay }) => (
    <button onClick={() => onPlay(song, list)} className="w-[164px] text-left card-press">
      <div className="relative aspect-square rounded-[26px] overflow-hidden bg-white/10 shadow-xl">
        <img src={song.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
        <span className="absolute left-2 top-2 min-w-7 h-7 px-2 rounded-full glass-pill text-[12.5px] font-bold flex items-center justify-center">{rank}</span>
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
        {current && <div className="absolute inset-0 ring-2 ring-inset ring-accent rounded-[26px] bg-black/25" />}
      </div>
      <p className="mt-2 text-[14px] font-semibold truncate">{song.title}</p>
      <p className="text-[12.5px] text-muted truncate">{names(song)}</p>
    </button>
  ),
);

const AlbumCard = memo<{ al: Album; onPlay: (a: Album) => void }>(({ al, onPlay }) => (
  <button onClick={() => onPlay(al)} className="w-[164px] text-left card-press">
    <div className="relative aspect-square rounded-[26px] overflow-hidden bg-white/10 shadow-xl">
      {al.thumbnail && <img src={al.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />}
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
      <span className="absolute right-2.5 bottom-2.5 w-10 h-10 rounded-full bg-accent text-ink flex items-center justify-center shadow-lg">
        <Play size={17} className="fill-current ml-0.5" />
      </span>
    </div>
    <p className="mt-2 text-[14.5px] font-semibold text-[#f4eceb] truncate">{al.title}</p>
    <p className="text-[12.5px] text-muted truncate">{al.artist}</p>
  </button>
));

const ArtistBubble = memo<{ name: string; thumb?: string; size: number; active?: boolean; sub?: string; onClick: () => void }>(
  ({ name, thumb, size, active, sub, onClick }) => (
    <button onClick={onClick} className="flex flex-col items-center text-center card-press" style={{ width: size + 12 }}>
      <div className={`rounded-full overflow-hidden bg-white/10 border-2 ${active ? 'border-accent' : 'border-transparent'}`} style={{ width: size, height: size }}>
        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />}
      </div>
      <p className={`mt-2 text-[13px] font-semibold truncate w-full ${active ? 'text-accent' : 'text-[#f4eceb]'}`}>{name}</p>
      {sub && <p className="text-[11.5px] text-muted truncate w-full">{sub}</p>}
    </button>
  ),
);

// ---------- Halaman ----------

export const HomePage: React.FC = () => {
  const { playSong, currentSong, isPlaying, openSongMenu, openArtist, showToast, setActiveTab } = useMusic();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [activeMood, setActiveMood] = useState('semua');
  const [moods, setMoods] = useState<Mood[]>(DEFAULT_MOODS);
  const [quickPicks, setQuickPicks] = useState<Song[]>([]);
  const [charts, setCharts] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [tiktok, setTiktok] = useState<Song[]>([]);
  const [tiktokLoading, setTiktokLoading] = useState(true);
  const [genres, setGenres] = useState<Mood[]>(DEFAULT_GENRES);
  const lastRef = useRef(Date.now());
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuth();
  const firstName = (user?.name || '').split(' ')[0];

  // Data diperbarui tiap 5 menit & saat tab aktif kembali
  useEffect(() => {
    let alive = true;
    const load = (silent: boolean) => {
      if (!silent) setLoading(true); else setSyncing(true);
      MusicApi.getHome(activeMood)
        .then((d) => {
          if (!alive) return;
          setQuickPicks(d.quickPicks);
          setCharts(d.charts);
          setAlbums(d.featuredAlbums);
          setArtists(d.trendingArtists);
          if (d.genres?.length) setGenres(d.genres);
          if (d.moods?.length) setMoods(d.moods.filter((m) => m.id !== 'semua' && m.id !== 'trending'));
          setError('');
          setLoading(false);
          setSyncing(false);
          setUpdatedAt(Date.now());
          lastRef.current = Date.now();
        })
        .catch((e: Error) => {
          if (!alive) return;
          if (!silent) setError(e.message || 'Gagal memuat YouTube Music');
          setLoading(false);
          setSyncing(false);
        });
    };
    load(false);
    // Real-time: segarkan tiap 60 dtk selama layar terlihat; langsung saat tab aktif kembali
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRef.current > 45 * 1000) load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [activeMood, reloadKey]);

  useEffect(() => {
    let alive = true;
    const load = () => MusicApi.getTiktok().then((l) => { if (alive) setTiktok(l); }).catch(() => {}).finally(() => { if (alive) setTiktokLoading(false); });
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 3 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [reloadKey]);

  const speedItems = useMemo(() => quickPicks.slice(0, 8), [quickPicks]);
  const dialItems = useMemo<(Song | 'dice')[]>(() => [...speedItems], [speedItems]);
  const recommended = useMemo(() => (quickPicks.slice(8).length ? quickPicks.slice(8) : charts.slice(0, 8)), [quickPicks, charts]);
  const chartColumns = useMemo(() => chunk(charts.slice(0, 12), 4), [charts]);

  const play = useCallback((s: Song, l: Song[]) => playSong(s, l), [playSong]);
  const playAll = (list: Song[]) => { if (list.length) playSong(list[0], list); };
  const randomPlay = useCallback(() => {
    const pool = [...quickPicks, ...charts];
    if (!pool.length) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled);
  }, [quickPicks, charts, playSong]);

  const playAlbum = useCallback(async (album: Album) => {
    try {
      const full = album.tracks?.length ? album : await MusicApi.getAlbum(album.id);
      if (full.tracks?.length) playSong(full.tracks[0], full.tracks);
    } catch { showToast('Album gagal dimuat'); }
  }, [playSong, showToast]);

  const startVoice = () => {
    setActiveTab('search');
    setTimeout(() => window.dispatchEvent(new Event('voice-search')), 250);
  };

  const currentId = currentSong?.id;
  const title = activeMood === 'semua' ? 'Putar cepat' : [...genres, ...moods].find((m) => m.id === activeMood)?.name || 'Putar cepat';
  const headBtn = 'w-10 h-10 rounded-full flex items-center justify-center text-[#f0e6e5] active:scale-90 active:bg-white/10 transition';
  const tiles = useMemo(() => [...moods, ...genres].slice(0, 12), [moods, genres]);

  return (
    <div className="space-y-8 pb-56">
      {/* Header + chip mood */}
      <div className="space-y-4">
      <PageHeader title={`${greeting()}${firstName ? `, ${firstName}` : ''}`} sub={<LiveBadge updatedAt={updatedAt} syncing={syncing} />}
        actions={<>
          <HeaderIconButton label="Riwayat" onClick={() => setActiveTab('library')}><History size={20} /></HeaderIconButton>
          <HeaderIconButton label="Pengaturan" onClick={() => setActiveTab('profile')}><Settings size={20} /></HeaderIconButton>
        </>} />

      {/* Chip mood */}
      <div className="hscroll gap-2 -mx-4 px-4 pb-0.5">
        {moods.slice(0, 8).map((m) => (
          <button key={m.id} onClick={() => setActiveMood((cur) => (cur === m.id ? 'semua' : m.id))}
            className={`chip ${activeMood === m.id ? 'chip-active' : ''}`}>{m.name}</button>
        ))}
      </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl glass-panel">
          <div className="flex items-center gap-2 text-[13px] text-rose-200 min-w-0">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          <button onClick={() => { setError(''); setReloadKey((k) => k + 1); }}
            className="shrink-0 px-3 py-1.5 rounded-full bg-accent text-ink text-xs font-bold flex items-center gap-1.5 active:scale-95">
            <RefreshCw size={12} /> Coba lagi
          </button>
        </div>
      )}

      {/* Putar cepat */}
      <motion.section {...REVEAL}>
        <SectionHeader title={title} onPlayAll={randomPlay} />
        {loading ? <SpeedDialSkeleton /> : <QuickGrid items={dialItems} currentId={currentId} list={speedItems} onPlay={play} onDice={randomPlay} />}
      </motion.section>

      {/* Direkomendasikan untukmu */}
      {recommended.length > 0 && (
        <motion.section {...REVEAL}>
          <h2 className="text-[20px] font-extrabold text-[#f4eceb] tracking-tight leading-tight flex items-center gap-2.5"><span className="w-1 h-5 rounded-full bg-accent" />Direkomendasikan untukmu</h2>
          <p className="text-[12.5px] text-muted mb-3 ml-[14px]">Berdasarkan {recommended[0].artists[0]?.name || 'lagu populer'}{recommended[1]?.artists[0] ? `, ${recommended[1].artists[0].name}` : ''}</p>
          <div className="hscroll gap-3.5 -mx-4 px-4">
            {recommended.slice(0, 12).map((song) => <RecCard key={song.id} song={song} list={recommended} current={currentId === song.id} onPlay={play} />)}
          </div>
        </motion.section>
      )}

      {/* Pilihan cepat */}
      <motion.section {...REVEAL}>
        <SectionHeader title="Pilihan cepat" onPlayAll={() => playAll(charts)} />
        {loading
          ? <div className="space-y-2">{[1, 2, 3].map((n) => <SongCardSkeleton key={n} />)}</div>
          : <SongColumns cols={chartColumns} list={charts} currentId={currentId} playing={isPlaying} onPlay={play} onMenu={openSongMenu} />}
      </motion.section>

      {/* Mood dan Genre */}
      <motion.section {...REVEAL}>
        <button onClick={() => setActiveTab('explore')} className="w-full flex items-center justify-between mb-3 active:opacity-70" aria-label="Buka Jelajahi">
          <h2 className="text-[20px] font-extrabold text-[#f4eceb] tracking-tight flex items-center gap-2.5"><span className="w-1 h-5 rounded-full bg-accent" />Mood dan Genre</h2>
          <ChevronRight size={24} className="text-[#e9dfde]" />
        </button>
        <div className="hscroll gap-2.5 -mx-4 px-4 snap-x">
          {chunk(tiles, 2).map((pair, i) => (
            <div key={i} className="snap-start flex flex-col gap-2.5">
              {pair.map((t) => (
                <button key={t.id} onClick={() => setActiveTab('explore')}
                  className="relative h-[60px] w-[148px] px-4 rounded-[18px] overflow-hidden text-left text-[14px] font-bold text-white flex items-center card-press"
                  style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}66)`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3)' }}>
                  <span className="relative z-10 truncate drop-shadow">{t.name}</span>
                  <span className="absolute -right-3 -bottom-4 w-14 h-14 rounded-full bg-white/20" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </motion.section>

      {/* Viral di TikTok */}
      {(tiktokLoading || tiktok.length > 0) && (
        <motion.section {...REVEAL}>
          <SectionHeader title="Viral di TikTok" onPlayAll={tiktok.length ? () => playAll(tiktok) : undefined} />
          {tiktokLoading ? (
            <div className="flex gap-4 overflow-hidden">{[1, 2, 3].map((n) => <AlbumCardSkeleton key={n} />)}</div>
          ) : (
            <div className="hscroll gap-4 -mx-4 px-4">
              {tiktok.slice(0, 20).map((song, i) => <SquareCard key={song.id} song={song} list={tiktok} rank={i + 1} current={currentId === song.id} onPlay={play} />)}
            </div>
          )}
        </motion.section>
      )}

      {/* Rilisan baru */}
      {(loading || albums.length > 0) && (
        <motion.section {...REVEAL}>
          <SectionHeader title="Rilisan baru" />
          {loading ? (
            <div className="flex gap-4 overflow-hidden">{[1, 2, 3].map((n) => <AlbumCardSkeleton key={n} />)}</div>
          ) : (
            <div className="hscroll gap-4 -mx-4 px-4">
              {albums.map((al) => <AlbumCard key={al.id} al={al} onPlay={playAlbum} />)}
            </div>
          )}
        </motion.section>
      )}

      {/* Artis tren */}
      {(loading || artists.length > 0) && (
        <motion.section {...REVEAL}>
          <SectionHeader title="Artis tren" />
          {loading ? (
            <div className="flex gap-3 overflow-hidden">{[1, 2, 3, 4].map((n) => <ArtistCardSkeleton key={n} />)}</div>
          ) : (
            <div className="hscroll gap-3 -mx-4 px-4">
              {artists.map((ar) => <ArtistBubble key={ar.id || ar.name} name={ar.name} thumb={ar.thumbnail} size={92} sub={ar.subscribers} onClick={() => openArtist({ id: ar.id, name: ar.name })} />)}
            </div>
          )}
        </motion.section>
      )}

    </div>
  );
};
