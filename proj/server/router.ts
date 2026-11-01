import { Router } from 'express';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import * as Y from './ytm.js';
import * as Sp from './spotify.js';

export const api = Router();

// ---------------------------------------------------------------------------
// Cache: stale-while-revalidate + anti-stampede (semua permintaan sama berbagi 1 fetch)
// ---------------------------------------------------------------------------
interface Entry { at: number; value: any }
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<any>>();

const TTL = { home: 60, charts: 120, mood: 180, search: 60, meta: 1800, lyrics: 86400, artist: 60, stream: 900 };

async function cached<T>(key: string, ttl: number, producer: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  const age = hit ? (Date.now() - hit.at) / 1000 : Infinity;
  if (hit && age < ttl) return hit.value;

  const refresh = () => {
    let p = inflight.get(key);
    if (!p) {
      p = producer()
        .then((value) => {
          cache.set(key, { at: Date.now(), value });
          if (cache.size > 800) for (const k of [...cache.keys()].slice(0, 150)) cache.delete(k);
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p as Promise<T>;
  };

  // Data agak lama (< 10x TTL): kirim langsung, perbarui di latar belakang -> terasa instan
  if (hit && age < ttl * 10) { refresh().catch(() => {}); return hit.value; }
  try {
    return await refresh();
  } catch (e) {
    if (hit) return hit.value; // lebih baik data lama daripada error
    throw e;
  }
}

const now = () => Math.floor(Date.now() / 1000);
const fail = (res: Response, msg: string, code = 503) => res.status(code).json({ status: 'error', detail: msg });
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response) =>
  fn(req, res).catch((e: Error) => { console.warn('[api]', req.path, e.message); fail(res, e.message || 'Gagal mengambil data YouTube Music'); });

api.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// ---------------------------------------------------------------------------
// Konstanta
// ---------------------------------------------------------------------------
const MOODS = [
  { id: 'chill', name: 'Bersantai', color: '#10b981' }, { id: 'travel', name: 'Perjalanan', color: '#38bdf8' },
  { id: 'sleep', name: 'Tidur', color: '#6366f1' }, { id: 'sad', name: 'Sedih', color: '#60a5fa' },
  { id: 'feelgood', name: 'Bersemangat', color: '#fbbf24' }, { id: 'energi', name: 'Olah Raga', color: '#f97316' },
  { id: 'romance', name: 'Romantis', color: '#f472b6' }, { id: 'fokus', name: 'Fokus', color: '#a855f7' },
  { id: 'party', name: 'Pesta', color: '#ec4899' },
];
const MOOD_QUERY: Record<string, string> = {
  feelgood: 'feel good hits', sad: 'lagu sedih galau', energi: 'workout energy music', chill: 'chill relax music',
  romance: 'lagu romantis love songs', fokus: 'focus study music', party: 'party music', travel: 'road trip travel music', sleep: 'sleep music calm',
};
const GENRES = [
  { id: 'pop', name: 'Pop', color: '#f472b6', q: ['pop hits', 'new pop songs'] },
  { id: 'hiphop', name: 'Hip-Hop', color: '#f59e0b', q: ['hip hop rap hits', 'new rap songs'] },
  { id: 'rnb', name: 'R&B', color: '#a78bfa', q: ['r&b hits', 'new r&b songs'] },
  { id: 'indo', name: 'Indonesia', color: '#ef4444', q: ['lagu indonesia terbaru', 'pop indonesia hits'] },
  { id: 'indie', name: 'Indie', color: '#34d399', q: ['indie songs', 'indie pop new'] },
  { id: 'rock', name: 'Rock', color: '#94a3b8', q: ['rock hits', 'new rock songs'] },
  { id: 'kpop', name: 'K-Pop', color: '#ec4899', q: ['kpop hits', 'new kpop songs'] },
  { id: 'edm', name: 'EDM', color: '#22d3ee', q: ['edm hits', 'dance electronic new'] },
  { id: 'dangdut', name: 'Dangdut', color: '#fb923c', q: ['dangdut terbaru', 'dangdut hits'] },
  { id: 'jazz', name: 'Jazz', color: '#fbbf24', q: ['jazz songs', 'smooth jazz'] },
  { id: 'lofi', name: 'Lo-fi', color: '#818cf8', q: ['lofi hip hop', 'lofi chill beats'] },
  { id: 'latin', name: 'Latin', color: '#f97316', q: ['latin hits', 'reggaeton new'] },
];
const DEFAULT_FEATURED = ['Drake', 'Frank Ocean', 'Ariana Grande', 'Justin Bieber', 'Hindia', 'Hijau Daun'];

const dedupe = <T extends { id: string }>(a: T[]) => { const s = new Set<string>(); return a.filter((x) => (s.has(x.id) ? false : (s.add(x.id), true))); };
const songsOnly = (r: any[]) => r.filter((x) => x.kind === 'song' || x.kind === 'video');

async function moodTracks(mood: string) {
  const q = MOOD_QUERY[mood] || `${mood} music`;
  try {
    const pls = await Y.searchPlaylists(q);
    for (const p of pls.slice(0, 3)) {
      const t = await Y.playlistTracks(p.id, 30);
      if (t.length) return t;
    }
  } catch { /* fallback */ }
  return songsOnly(await Y.search(q, 'songs')).slice(0, 20);
}

async function genreTracks(gid: string) {
  const g = GENRES.find((x) => x.id === gid)!;
  const year = new Date().getUTCFullYear();
  const lists = await Promise.allSettled(g.q.map((q) => Y.search(`${q} ${year}`, 'songs')));
  return dedupe(lists.flatMap((l) => (l.status === 'fulfilled' ? songsOnly(l.value) : [])) as any[]);
}

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------
api.get('/', (_req, res) => res.json({ status: 'online', name: 'Auralys API', source: 'YouTube Music (scrape langsung, real-time)', location: Y.cfg.LOCATION }));
api.get('/health', (_req, res) => res.json({ status: 'ok', app: 'liquid-music', engine: 'innertube', time: now() }));

api.get('/home', wrap(async (req, res) => {
  const mood = String(req.query.genre || 'semua').toLowerCase();
  const isMood = mood in MOOD_QUERY;
  const isGenre = GENRES.some((g) => g.id === mood);

  const data = await cached(`home:${mood}`, isMood || isGenre ? TTL.mood : TTL.home, async () => {
    const [h, c, extra] = await Promise.allSettled([
      Y.homeFeed(), Y.charts(),
      isMood ? moodTracks(mood) : isGenre ? genreTracks(mood) : Promise.resolve([]),
    ]);
    const home = h.status === 'fulfilled' ? h.value : { quick: [], extra: [], albums: [], artists: [], shelves: [] };
    const ch = c.status === 'fulfilled' ? c.value : { songs: [], artists: [], albums: [] };
    const picked = extra.status === 'fulfilled' ? (extra.value as any[]) : [];

    let songs = ch.songs; let albums = [...ch.albums, ...home.albums]; let artists = [...ch.artists, ...home.artists];
    if (!songs.length && !home.quick.length && !picked.length) {
      // cadangan: pencarian YouTube Music (tetap data asli)
      const [s, a, r] = await Promise.allSettled([Y.search('top hits', 'songs'), Y.search('new albums', 'albums'), Y.search('top artists', 'artists')]);
      songs = s.status === 'fulfilled' ? (s.value as any[]) : [];
      albums = a.status === 'fulfilled' ? (a.value as any[]) : albums;
      artists = r.status === 'fulfilled' ? (r.value as any[]) : artists;
      if (!songs.length) throw new Error('YouTube Music tidak mengembalikan data');
    }
    if (!albums.length) { try { albums = await Y.newReleases(); } catch { /* opsional */ } }

    const quick = picked.length ? picked : mood === 'trending' ? songs : home.quick.length ? home.quick : songs;
    return {
      status: 'success', updatedAt: now(), location: Y.cfg.LOCATION, chartCountry: Y.cfg.CHART_COUNTRY,
      moods: MOODS, genres: GENRES.map(({ id, name, color }) => ({ id, name, color })),
      quickPicks: quick.slice(0, 16),
      charts: (isGenre ? picked : songs.length ? songs : home.extra).slice(0, 20),
      featuredAlbums: dedupe(albums as any[]).slice(0, 10),
      trendingArtists: dedupe(artists as any[]).slice(0, 12),
    };
  });
  res.json(data);
}));

api.get('/featured', wrap(async (req, res) => {
  const wanted = String(req.query.names || '').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const names = wanted.length ? wanted : DEFAULT_FEATURED;
  const one = async (name: string) => {
    try {
      return await cached(`featured:${name.toLowerCase()}`, TTL.charts, async () => {
        const found: any[] = (await Y.search(name, 'artists')).filter((r: any) => r.id);
        const pick = found.find((r) => r.name.toLowerCase() === name.toLowerCase()) || found[0];
        let songs: any[] = [];
        let info = { id: null as any, name, thumbnail: undefined as any, subscribers: '' };
        if (pick) {
          info = { id: pick.id, name: pick.name || name, thumbnail: pick.thumbnail, subscribers: pick.subscribers || '' };
          try { const a = await Y.artist(pick.id); songs = a.songs; info.subscribers = a.artist.subscribers || info.subscribers; } catch { /* fallback */ }
        }
        if (songs.length < 6) {
          const key = name.toLowerCase().split(' ')[0];
          const extra = songsOnly(await Y.search(`${name} top songs`, 'songs')).filter((s: any) => s.artists.some((a: any) => a.name.toLowerCase().includes(key)));
          songs = dedupe([...songs, ...extra]);
        }
        return { ...info, songs: songs.slice(0, 15) };
      });
    } catch { return null; }
  };
  const artists = (await Promise.all(names.map(one))).filter((r) => r && r.songs.length);
  if (!artists.length) throw new Error('Rekomendasi artis gagal dimuat');
  res.json({ status: 'success', updatedAt: now(), artists });
}));

api.get('/tiktok', wrap(async (_req, res) => {
  const results = await cached('tiktok', TTL.charts, async () => {
    let out: any[] = [];
    for (const q of ['viral tiktok indonesia', 'lagu viral tiktok', 'tiktok viral songs']) {
      try {
        const pls = await Y.searchPlaylists(q);
        for (const p of pls.slice(0, 2)) out = out.concat(await Y.playlistTracks(p.id, 20).catch(() => []));
      } catch { /* lanjut */ }
      if (out.length >= 30) break;
    }
    if (out.length < 10) {
      for (const q of ['viral tiktok 2026', 'lagu viral tiktok terbaru']) out = out.concat(songsOnly(await Y.search(q, 'songs').catch(() => [])));
    }
    out = dedupe(out).slice(0, 30);
    if (!out.length) throw new Error('tidak ada hasil');
    return out;
  });
  res.json({ status: 'success', results });
}));

api.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ status: 'success', query: q, results: [] });
  const f = String(req.query.filter || '');
  const filter = ['songs', 'albums', 'artists', 'videos'].includes(f) ? f : undefined;
  const cont = String(req.query.cont || '').slice(0, 4000);
  const page = await cached(`search:${filter}:${cont}:${q.toLowerCase()}`, TTL.search, async () => {
    if (cont || filter) return Y.searchPage(q, filter, cont || undefined);
    // "Semua": rak campuran (top result, album, artis, video) + daftar LAGU lengkap dengan halaman lanjutan
    const [mixed, songs] = await Promise.allSettled([Y.searchPage(q), Y.searchPage(q, 'songs')]);
    const a = mixed.status === 'fulfilled' ? mixed.value.results : [];
    const s = songs.status === 'fulfilled' ? songs.value : { results: [] as any[], continuation: '' };
    if (mixed.status === 'rejected' && songs.status === 'rejected') throw new Error('Pencarian gagal');
    const seen = new Set<string>();
    const results = [...a, ...s.results].filter((x: any) => {
      const k = x.kind === 'song' || x.kind === 'video' ? `v:${x.id}` : `${x.kind}:${x.id}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
    return { results, continuation: s.continuation };
  });
  res.json({ status: 'success', query: q, filter: filter || null, results: page.results, continuation: page.continuation || '' });
}));

// ---------------------------------------------------------------------------
// Impor playlist Spotify (daftar lagu + pencocokan ke YouTube Music)
// ---------------------------------------------------------------------------
const userErr = (res: Response, e: any) => {
  if (e instanceof Sp.SpotifyUserError) { fail(res, e.message, e.status); return true; }
  return false;
};

api.get('/spotify/playlist', async (req, res) => {
  try {
    const url = String(req.query.url || '').slice(0, 300);
    const id = Sp.parsePlaylistId(url);
    const pl = await cached(`sp:pl:${id}`, 300, () => Sp.fetchPlaylist(id));
    res.json({ status: 'success', playlist: pl });
  } catch (e: any) {
    if (userErr(res, e)) return;
    console.warn('[api] /spotify/playlist', e?.message);
    fail(res, e?.message || 'Gagal membaca playlist Spotify', 502);
  }
});

api.get('/spotify/match', wrap(async (req, res) => {
  const title = String(req.query.title || '').slice(0, 200).trim();
  if (!title) return fail(res, 'Judul kosong', 400);
  const artists = String(req.query.artists || '').slice(0, 300).split('|').map((a) => a.trim()).filter(Boolean).slice(0, 6);
  const dur = Math.max(0, Math.min(Number(req.query.dur) || 0, 7200));
  const key = `sp:m:${title.toLowerCase()}|${artists.join(',').toLowerCase()}|${Math.round(dur / 5)}`;
  const r = await cached(key, 86400, () => Sp.matchTrack({ title, artists, durationSeconds: dur }));
  res.json({ status: 'success', song: r.song, confidence: Number(r.confidence.toFixed(2)) });
}));

api.get('/suggest', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const suggestions = q ? await cached(`suggest:${q.toLowerCase()}`, TTL.search, () => Y.suggest(q)).catch(() => []) : [];
  res.json({ status: 'success', suggestions });
}));

api.get('/album/:id', wrap(async (req, res) => {
  const id = req.params.id;
  res.json({ status: 'success', album: await cached(`album:${id}`, TTL.meta, () => Y.album(id)) });
}));

api.get('/artist/:id', wrap(async (req, res) => {
  const id = req.params.id;
  res.json({ status: 'success', ...(await cached(`artist:${id}`, TTL.artist, () => Y.artist(id))) });
}));

api.get('/song/:id', wrap(async (req, res) => {
  const id = req.params.id;
  const s = await cached(`song:${id}`, TTL.meta, async () => {
    const { tracks } = await Y.next(id, false, 1);
    const t = tracks.find((x: any) => x.id === id) || tracks[0];
    if (!t) throw new Error('lagu tidak ditemukan');
    return { ...t, id, videoId: id };
  });
  res.json(s);
}));

api.get('/related/:id', wrap(async (req, res) => {
  const id = req.params.id;
  const results = await cached(`related:${id}`, TTL.home, async () => (await Y.next(id, true, 25)).tracks);
  res.json({ status: 'success', results });
}));

api.get('/lyrics/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const data = await cached(`lyrics:${id}`, TTL.lyrics, async () => {
      const { tracks, lyricsId } = await Y.next(id, false, 1);
      const t: any = tracks.find((x: any) => x.id === id) || tracks[0] || {};
      let plain = '';
      let synced: { time: number; text: string }[] = [];
      let source = '';
      const title = Y.cleanTitle(t.title || '');
      const artist = t.artists?.[0]?.name || '';
      if (title && artist) {
        try {
          const l = await Y.lrclib(title, artist, t.album?.name, t.durationSeconds || undefined);
          if (l.synced.length) { synced = l.synced; source = 'LRCLIB'; }
          plain = l.plain;
        } catch { /* lanjut */ }
      }
      if (!plain && lyricsId) {
        try { plain = await Y.lyricsText(lyricsId); if (plain) source = source || 'YouTube Music'; } catch { /* kosong */ }
      }
      if (synced.length && !plain) plain = synced.map((l) => l.text).join('\n');
      return { status: 'success', videoId: id, isSynced: synced.length > 0, plainLyrics: plain, syncedLyrics: synced, source };
    });
    // Hasil kosong sering karena gangguan sementara -> jangan simpan 24 jam (dulu: lirik hilang seharian)
    if (!data.plainLyrics && !data.syncedLyrics?.length) cache.delete(`lyrics:${id}`);
    res.json(data);
  } catch {
    res.json({ status: 'success', videoId: id, isSynced: false, plainLyrics: '', syncedLyrics: [], source: '' });
  }
});

// Proxy audio (Range) — cadangan saat iframe dijeda browser di latar belakang
api.get('/stream/:id', async (req, res) => {
  const id = req.params.id;
  if (!/^[\w-]{11}$/.test(id)) return fail(res, 'videoId tidak valid', 400);

  const tried: string[] = [];          // klien YouTube yang terbukti ditolak
  const rejects: string[] = [];        // alasan penolakan, untuk pesan error yang bisa didiagnosis
  let lastErr = 'Stream tidak tersedia';
  let closed = false;                  // pemutar menutup koneksi
  let current: AbortController | null = null;
  req.on('close', () => { closed = true; current?.abort(); });

  // Sampai 4 percobaan: URL cache yang kedaluwarsa dicoba ulang segar, klien yang ditolak (403/410/dll) dilewati
  for (let attempt = 0; attempt < 4 && !closed; attempt++) {
    let src: Y.AudioSrc | null = null;
    const fromCache = attempt === 0 && cache.has(`stream:${id}`);
    try {
      try {
        src = attempt === 0
          ? await cached(`stream:${id}`, TTL.stream, () => Y.audioSource(id))
          : await Y.audioSource(id, tried);
      } catch (e: any) {
        lastErr = rejects.length ? `Semua klien ditolak YouTube (${rejects.join(' | ')})` : e?.message || lastErr;
        cache.delete(`stream:${id}`);
        break; // semua klien sudah dicoba di audioSource
      }

      const headers: Record<string, string> = { 'User-Agent': src.ua, 'Accept-Encoding': 'identity' };
      if (req.headers.range) headers.Range = String(req.headers.range);

      // Batas waktu hanya untuk MENUNGGU header; badan audio boleh mengalir selama pemutar membacanya
      const ctl = new AbortController();
      current = ctl;
      const headerTimer = setTimeout(() => ctl.abort(), 10000);
      let up: globalThis.Response;
      try {
        up = await fetch(src.url, { headers, redirect: 'follow', signal: ctl.signal });
      } finally { clearTimeout(headerTimer); }

      if (!up.ok && up.status !== 206) {
        up.body?.cancel().catch(() => {});
        cache.delete(`stream:${id}`);
        // URL dari cache bisa saja kedaluwarsa: coba klien yang sama dengan URL baru sekali, jangan langsung dicoret
        if (!fromCache) tried.push(src.client);
        lastErr = `Stream ditolak (${up.status}) oleh klien ${src.client}`;
        rejects.push(`${src.client} ${up.status}`);
        continue;
      }

      if (attempt > 0) cache.set(`stream:${id}`, { at: Date.now(), value: src }); // simpan klien yang berhasil
      res.status(up.status);
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const v = up.headers.get(h); if (v) res.setHeader(h, v); }
      if (!res.getHeader('content-type')) res.setHeader('content-type', src.mime);
      if (!res.getHeader('accept-ranges')) res.setHeader('accept-ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=600');
      if (!up.body) return res.end();
      const body = Readable.fromWeb(up.body as any);
      body.on('error', () => { try { res.end(); } catch { /* sudah tertutup */ } });
      res.on('error', () => body.destroy());
      res.on('close', () => { body.destroy(); ctl.abort(); });
      body.pipe(res);
      return;
    } catch (e: any) {
      cache.delete(`stream:${id}`);
      lastErr = e?.name === 'AbortError' ? 'YouTube tidak merespons (timeout)' : e?.message || lastErr;
      if (src && !fromCache && !tried.includes(src.client)) tried.push(src.client);
    }
  }
  if (!res.headersSent && !closed) fail(res, `Gagal mengambil stream: ${lastErr}`);
});
