import { Song, Album, Artist, LyricsData, SearchItem } from '../types/music';

// Urutan basis API yang dicoba. Bisa dipaksa lewat VITE_API_BASE (mis. https://api.domain.com).
const ENV_BASE = (import.meta as any).env?.VITE_API_BASE as string | undefined;
const BASES = [ENV_BASE, '/music-api', '/api'].filter(Boolean).map((b) => (b as string).replace(/\/$/, ''));
let activeBase = BASES[0];

export interface HomeData {
  quickPicks: Song[];
  charts: Song[];
  moods: { id: string; name: string; color: string }[];
  featuredAlbums: Album[];
  trendingArtists: Artist[];
  genres: { id: string; name: string; color: string }[];
  updatedAt?: number;
}

export interface SpotifyTrack { title: string; artists: string[]; durationSeconds: number; album?: string }
export interface SpotifyPlaylist { id: string; name: string; owner?: string; cover?: string; tracks: SpotifyTrack[]; partial: boolean; source: 'api' | 'embed' }

export interface FeaturedArtist { id?: string; name: string; thumbnail?: string; subscribers?: string; songs: Song[] }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(message: string, public status = 0, public retry = true) { super(message); }
}

/** Satu percobaan ke satu basis. 404/HTML = "bukan backend kita" -> ApiError(status 404). */
async function tryBase<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(20000), ...init });
  } catch (e: any) {
    throw new ApiError(e?.message || 'Jaringan terputus', 0, true);
  }
  const type = res.headers.get('content-type') || '';
  const isJson = type.includes('json');

  if (res.ok && isJson) return res.json();
  if (res.ok) throw new ApiError('Server membalas bukan JSON (backend belum terhubung)', 404, false);

  let detail = '';
  if (isJson) {
    try { const b = await res.json(); detail = b?.detail || b?.message || ''; } catch {}
  }
  if (res.status === 404 && !isJson) {
    throw new ApiError('Endpoint backend tidak ditemukan', 404, false);
  }
  const retry = res.status >= 500 || res.status === 408 || res.status === 429;
  throw new ApiError(detail || `Server error ${res.status}`, res.status, retry);
}

/** Fetch JSON dengan auto-deteksi basis + retry saat backend masih booting. */
async function fetchJson<T = any>(path: string, init?: RequestInit, retries = 3): Promise<T> {
  let lastError = 'Backend tidak merespons';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const order = [activeBase, ...BASES.filter((b) => b !== activeBase)];
    let allMissing = true;
    for (const base of order) {
      try {
        const data = await tryBase<T>(base, path, init);
        activeBase = base;
        return data;
      } catch (e: any) {
        lastError = e?.message || lastError;
        if (init?.signal?.aborted) throw e; // dibatalkan pemanggil (mis. pengguna mengetik lagi): jangan dicoba ulang
        if (!(e instanceof ApiError) || e.status !== 404) allMissing = false;
        // Error 4xx "asli" dari backend (mis. 400) tidak perlu dicoba ulang
        if (e instanceof ApiError && !e.retry && e.status !== 404) throw e;
      }
    }
    if (allMissing && attempt >= 2) {
      throw new Error('API tidak ditemukan (404). Jalankan lewat "npm run dev" (server Node), atau set VITE_API_BASE.');
    }
    await sleep(Math.min(400 + attempt * 400, 1500));
  }
  throw new Error(lastError);
}

/** Permintaan GET identik yang sedang berjalan digabung jadi satu -> hemat jaringan, UI lebih mulus. */
const pending = new Map<string, Promise<any>>();
function getJson<T = any>(path: string, init?: RequestInit, retries?: number): Promise<T> {
  if (init) return fetchJson<T>(path, init, retries);
  let p = pending.get(path);
  if (!p) { p = fetchJson<T>(path, undefined, retries).finally(() => pending.delete(path)); pending.set(path, p); }
  return p;
}

const ACCENTS = ['#f43f5e', '#38bdf8', '#fbbf24', '#a855f7', '#10b981', '#6366f1', '#ec4899', '#06b6d4'];

function formatSongItem(raw: any): Song {
  const vid: string = raw.videoId || raw.id;
  const hash = vid.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  return {
    id: vid,
    videoId: vid,
    title: raw.title || 'Tanpa judul',
    artists: raw.artists && raw.artists.length ? raw.artists : [{ name: 'Unknown Artist' }],
    album: raw.album || undefined,
    duration: raw.duration || '',
    durationSeconds: raw.durationSeconds || 0,
    thumbnail: raw.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    accentColor: ACCENTS[hash % ACCENTS.length],
  };
}

export const MusicApi = {
  /** Beranda real-time dari YouTube Music (rekomendasi, chart, mood). */
  async getHome(genre?: string): Promise<HomeData> {
    const qs = genre && genre !== 'semua' ? `?genre=${encodeURIComponent(genre)}` : '';
    const data = await getJson(`/home${qs}`);
    return {
      quickPicks: (data.quickPicks || []).map(formatSongItem),
      charts: (data.charts || []).map(formatSongItem),
      moods: data.moods || [],
      featuredAlbums: data.featuredAlbums || [],
      trendingArtists: data.trendingArtists || [],
      genres: data.genres || [],
      updatedAt: data.updatedAt,
    };
  },

  /** Artis pilihan + lagu populernya (real-time). */
  async getFeatured(names: string[]): Promise<FeaturedArtist[]> {
    const data = await getJson(`/featured?names=${encodeURIComponent(names.join('|'))}`);
    return (data.artists || []).map((a: any) => ({ ...a, songs: (a.songs || []).map(formatSongItem) }));
  },

  /** Lagu yang sedang viral di TikTok (via playlist viral YouTube Music). */
  async getTiktok(): Promise<Song[]> {
    const data = await getJson('/tiktok');
    return (data.results || []).map(formatSongItem);
  },

  /** Satu halaman hasil pencarian + token untuk memuat halaman berikutnya (hasil lengkap). */
  async searchPage(query: string, filter?: string, cont?: string, signal?: AbortSignal): Promise<{ items: SearchItem[]; continuation: string }> {
    if (!query.trim()) return { items: [], continuation: '' };
    const params = new URLSearchParams({ q: query });
    if (filter && filter !== 'all') params.set('filter', filter);
    if (cont) params.set('cont', cont);
    const data = await getJson(`/search?${params}`, signal ? { signal } : undefined);
    const items = (data.results || []).map((r: any): SearchItem => {
      if (r.kind === 'album') return { ...r, kind: 'album' };
      if (r.kind === 'artist') return { ...r, kind: 'artist' };
      return { ...formatSongItem(r), kind: r.kind === 'video' ? 'video' : 'song' };
    });
    return { items, continuation: data.continuation || '' };
  },

  async search(query: string, filter?: string): Promise<SearchItem[]> {
    return (await MusicApi.searchPage(query, filter)).items;
  },

  async getSong(videoId: string): Promise<Song> {
    return formatSongItem(await getJson(`/song/${videoId}`));
  },

  /** Lagu serupa (radio) untuk antrean otomatis. */
  async getRelated(videoId: string): Promise<Song[]> {
    const data = await getJson(`/related/${videoId}`);
    return (data.results || []).map(formatSongItem);
  },

  getStreamUrl(videoId: string): string {
    return `${activeBase}/stream/${videoId}`;
  },

  /** Lirik tersinkron asli. Kosong jika memang tidak tersedia (tanpa lirik palsu). */
  async getLyrics(videoId: string): Promise<LyricsData> {
    try {
      const data = await getJson(`/lyrics/${videoId}`);
      return {
        isSynced: !!data.isSynced,
        plainLyrics: data.plainLyrics || '',
        syncedLyrics: data.syncedLyrics || [],
        source: data.source || '',
      };
    } catch {
      return { isSynced: false, plainLyrics: '', syncedLyrics: [], source: '' };
    }
  },

  async getAlbum(id: string): Promise<Album> {
    const data = await getJson(`/album/${id}`);
    const album = data.album;
    return { ...album, tracks: (album.tracks || []).map(formatSongItem) };
  },

  async getArtist(id: string): Promise<{ artist: Artist; songs: Song[]; albums: Album[]; singles: Album[] }> {
    const data = await getJson(`/artist/${id}`);
    return { artist: data.artist, songs: (data.songs || []).map(formatSongItem), albums: data.albums || [], singles: data.singles || [] };
  },

  /** Baca playlist Spotify publik dari tautannya (daftar lagu saja, belum dicocokkan). */
  async spotifyPlaylist(url: string, signal?: AbortSignal): Promise<SpotifyPlaylist> {
    const data = await getJson(`/spotify/playlist?url=${encodeURIComponent(url.trim())}`, signal ? { signal } : undefined, 1);
    return data.playlist;
  },

  /** Cari padanan satu lagu Spotify di YouTube Music. song = null bila tidak ketemu. */
  async spotifyMatch(t: SpotifyTrack, signal?: AbortSignal): Promise<{ song: Song | null; confidence: number }> {
    const params = new URLSearchParams({ title: t.title, artists: t.artists.join('|'), dur: String(t.durationSeconds || 0) });
    const data = await getJson(`/spotify/match?${params}`, { signal: signal ?? AbortSignal.timeout(25000) }, 1);
    return { song: data.song ? formatSongItem(data.song) : null, confidence: Number(data.confidence) || 0 };
  },
};
