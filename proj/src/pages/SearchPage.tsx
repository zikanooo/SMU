import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, X, MoreVertical, History, ArrowUpLeft, Mic, Disc3, User } from 'lucide-react';
import { Song, SearchItem } from '../types/music';
import { MusicApi } from '../services/api';
import { useMusic } from '../context/MusicContext';
import { SongCardSkeleton } from '../components/SkeletonLoader';

const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'songs', label: 'Lagu' },
  { id: 'videos', label: 'Video' },
  { id: 'albums', label: 'Album' },
  { id: 'artists', label: 'Artis' },
];

const RECENT_KEY = 'liquid_recent_searches';

export const SearchPage: React.FC = () => {
  const { playSong, openSongMenu, openArtist, currentSong, isPlaying, setActiveTab, showToast } = useMusic();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [cont, setCont] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [recs, setRecs] = useState<Song[]>([]);
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  });
  const timer = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setCont(''); setIsSearching(false); setError(''); return; }
    setIsSearching(true);
    clearTimeout(timer.current);
    const ac = new AbortController();
    timer.current = setTimeout(() => {
      MusicApi.searchPage(query, filter, undefined, ac.signal)
        .then((r) => { if (!ac.signal.aborted) { setResults(r.items); setCont(r.continuation); setError(''); setIsSearching(false); } })
        .catch(() => { if (!ac.signal.aborted) { setError('Pencarian gagal. Periksa koneksi lalu coba lagi.'); setIsSearching(false); } });
    }, 320);
    return () => { ac.abort(); clearTimeout(timer.current); };
  }, [query, filter]);

  // Muat halaman berikutnya (hasil lengkap) saat pengguna menggulir ke dasar daftar
  const sentinel = useRef<HTMLDivElement>(null);
  const moreRef = useRef({ cont, loadingMore, query, filter, isSearching });
  moreRef.current = { cont, loadingMore, query, filter, isSearching };
  const loadMore = () => {
    const m = moreRef.current;
    if (!m.cont || m.loadingMore || m.isSearching) return;
    setLoadingMore(true);
    MusicApi.searchPage(m.query, m.filter, m.cont)
      .then((r) => {
        if (moreRef.current.query !== m.query || moreRef.current.filter !== m.filter) return; // pencarian sudah berganti
        setResults((prev) => {
          const seen = new Set(prev.map((x) => `${x.kind === 'video' ? 'song' : x.kind}:${x.id}`));
          const add = r.items.filter((x) => !seen.has(`${x.kind === 'video' ? 'song' : x.kind}:${x.id}`));
          return add.length ? [...prev, ...add] : prev;
        });
        setCont(r.continuation);
      })
      .catch(() => setCont(''))
      .finally(() => setLoadingMore(false));
  };
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [results.length, cont]);

  const remember = (q: string) => {
    const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };
  const forget = (q: string) => {
    const next = recent.filter((r) => r !== q);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };

  // Pencarian suara (Web Speech API)
  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { showToast('Pencarian suara tidak didukung browser ini'); return; }
    const rec = new SR();
    rec.lang = 'id-ID';
    rec.interimResults = false;
    rec.onresult = (e: any) => setQuery(e.results[0][0].transcript);
    rec.onerror = () => showToast('Tidak bisa mendengar suara');
    showToast('Mendengarkan...');
    rec.start();
  };
  useEffect(() => {
    const h = () => startVoice();
    window.addEventListener('voice-search', h);
    return () => window.removeEventListener('voice-search', h);
  });

  const playItem = async (item: SearchItem, list: Song[]) => {
    remember(query.trim());
    try {
      if (item.kind === 'album') {
        const a = await MusicApi.getAlbum(item.id);
        if (a.tracks?.length) playSong(a.tracks[0], a.tracks);
      } else if (item.kind === 'artist') {
        openArtist({ id: item.id, name: item.name });
      } else {
        playSong(item, list);
      }
    } catch {
      showToast('Gagal memuat, coba lagi');
    }
  };

  // Tampilan "Semua" seperti YouTube Music: Hasil teratas, lalu bagian Lagu / Video / Album / Artis
  const sections = (() => {
    if (!results.length) return [] as { title: string; items: SearchItem[] }[];
    const [top, ...rest] = results;
    const by = (k: string) => rest.filter((r) => r.kind === k);
    return [
      { title: 'Hasil teratas', items: [top] },
      { title: 'Lagu', items: by('song') },
      { title: 'Video', items: by('video') },
      { title: 'Album', items: by('album') },
      { title: 'Artis', items: by('artist') },
    ].filter((x) => x.items.length);
  })();

  const songList = results.filter((r): r is Song & { kind: 'song' | 'video' } => r.kind === 'song' || r.kind === 'video');

  const renderResult = (item: SearchItem) => {
    const isVideo = item.kind === 'video';
    const isArtist = item.kind === 'artist';
    const current = (item.kind === 'song' || item.kind === 'video') && currentSong?.id === item.id;
    const thumb = (item as any).thumbnail as string | undefined;
    const title = item.kind === 'artist' ? item.name : item.title;
    let sub = '';
    if (item.kind === 'song' || item.kind === 'video') sub = [item.artists.map((a) => a.name).join(', '), item.duration].filter(Boolean).join(' • ');
    else if (item.kind === 'album') sub = ['Album', item.artist, item.year].filter(Boolean).join(' • ');
    else sub = ['Artis', item.subscribers].filter(Boolean).join(' • ');

    return (
      <div key={`${item.kind}-${item.id}`} onClick={() => playItem(item, songList)}
        className={`flex items-center gap-3 py-2.5 row-divider cursor-pointer transition-colors active:bg-white/[0.06] ${current ? 'row-current' : ''}`}
        aria-current={current ? 'true' : undefined}>
        <div className={`relative shrink-0 overflow-hidden bg-white/10 ${isVideo ? 'w-[88px] h-[50px] rounded-xl' : isArtist ? 'w-[54px] h-[54px] rounded-full' : 'w-[54px] h-[54px] rounded-[14px]'}`}>
          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
            : <div className="w-full h-full flex items-center justify-center text-muted">{isArtist ? <User size={20} /> : <Disc3 size={20} />}</div>}
          {current && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center" aria-hidden="true">
              <span className={`eq ${isPlaying ? '' : 'eq-paused'}`}><i /><i /><i /></span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : 'text-[#f4eceb]'}`}>{title}</p>
          <p className="text-[13px] text-muted truncate">{sub}</p>
        </div>
        {(item.kind === 'song' || item.kind === 'video') && (
          <button onClick={(e) => { e.stopPropagation(); openSongMenu(item as Song); }}
            className="p-2 text-[#e9dfde] active:scale-90" aria-label="Menu lagu">
            <MoreVertical size={20} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="pb-52 space-y-5 pt-2">
      {/* Search field */}
      <div className="flex items-center gap-1 h-14 pl-2 pr-1 rounded-full bg-white/[0.08] border border-white/12 backdrop-blur-xl">
        <button onClick={() => (query ? setQuery('') : setActiveTab('home'))} className="p-2.5 text-[#f0e6e5] active:scale-90" aria-label="Kembali">
          <ArrowLeft size={22} />
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && query.trim() && remember(query.trim())}
          placeholder="Cari lagu, artis, album"
          enterKeyHint="search"
          className="flex-1 min-w-0 bg-transparent outline-none text-[16px] text-[#f4eceb] placeholder:text-muted select-text"
        />
        {query ? (
          <button onClick={() => setQuery('')} className="p-2.5 text-[#f0e6e5] active:scale-90" aria-label="Hapus"><X size={20} /></button>
        ) : (
          <button onClick={startVoice} className="p-2.5 text-accent active:scale-90" aria-label="Suara"><Mic size={20} /></button>
        )}
      </div>

      {query.trim() && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="tablist" aria-label="Filter hasil">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`shrink-0 px-4 h-9 rounded-full text-[13.5px] font-semibold border active:scale-95 transition-colors ${filter === f.id ? 'bg-accent text-ink border-accent' : 'bg-white/[0.08] text-[#f4eceb] border-white/12'}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {!query.trim() ? null : isSearching ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((n) => <SongCardSkeleton key={n} />)}</div>
      ) : error ? (
        <p className="text-center text-sm text-rose-300 py-10">{error}</p>
      ) : results.length === 0 ? (
        <p className="text-center text-sm text-muted py-10">Tidak ada hasil untuk “{query}”</p>
      ) : (
        <div>
          {filter === 'all' ? sections.map((sec) => (
            <section key={sec.title} className="mb-2">
              <h2 className="text-[19px] font-bold tracking-tight pt-3 pb-1">{sec.title}</h2>
              {sec.items.map(renderResult)}
            </section>
          )) : results.map(renderResult)}
          <div ref={sentinel} className="h-8" aria-hidden />
          {loadingMore && <div className="space-y-2 pt-2">{[1, 2, 3].map((n) => <SongCardSkeleton key={n} />)}</div>}
          {!cont && !loadingMore && results.length > 10 && <p className="text-center text-xs text-muted py-4">Semua hasil sudah ditampilkan</p>}
        </div>
      )}
    </div>
  );
};
