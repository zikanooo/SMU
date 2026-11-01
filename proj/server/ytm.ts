/**
 * Scraper YouTube Music (InnerTube / youtubei) — murni TypeScript, tanpa Python.
 * Semua data diambil langsung dari music.youtube.com, jadi selalu real-time.
 * Parser memakai "deep walk" sehingga tahan terhadap perubahan susunan JSON YouTube.
 */

const LOCATION = (process.env.YTM_LOCATION || 'ID').toUpperCase();
const CHART_COUNTRY = (process.env.YTM_CHART_COUNTRY || LOCATION).toUpperCase();
const HL = process.env.YTM_LANG || 'id';
const KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEUKyzBQ';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const cfg = { LOCATION, CHART_COUNTRY };

const clientVersion = () => {
  const d = new Date(Date.now() - 36e5 * 24);
  const p = (n: number) => String(n).padStart(2, '0');
  return `1.${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}.01.00`;
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
async function postOnce(endpoint: string, body: Record<string, any>, timeout: number, query: string): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(`https://music.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false&key=${KEY}${query}`, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'X-Origin': 'https://music.youtube.com',
        'Accept-Language': `${HL},en;q=0.8`,
        Cookie: 'SOCS=CAI; CONSENT=YES+1',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB_REMIX', clientVersion: clientVersion(), hl: HL, gl: LOCATION }, user: {} },
        ...body,
      }),
    });
    if (!res.ok) { const e: any = new Error(`YouTube Music ${res.status}`); e.status = res.status; throw e; }
    return await res.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') { const t: any = new Error('YouTube Music tidak merespons (timeout)'); t.status = 504; throw t; }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Kirim ke InnerTube; ulangi sampai 2x untuk gangguan sementara (jaringan, timeout, 429, 5xx). 4xx lain tidak diulang. */
async function post(endpoint: string, body: Record<string, any>, timeout = 12000, query = ''): Promise<any> {
  let last: any;
  for (let i = 0; i < 3; i++) {
    try { return await postOnce(endpoint, body, timeout, query); }
    catch (e: any) {
      last = e;
      const st = Number(e?.status) || 0;
      const transient = !st || st === 429 || st >= 500;
      if (!transient || i === 2) break;
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw last;
}

// ---------------------------------------------------------------------------
// Helper parsing
// ---------------------------------------------------------------------------
type Any = any;
const runsOf = (t: Any): Any[] => t?.runs || [];
const textOf = (t: Any): string => runsOf(t).map((r) => r.text).join('') || t?.simpleText || '';

/** Telusuri seluruh JSON, panggil cb untuk setiap objek yang punya salah satu key renderer. */
function walk(node: Any, keys: Set<string>, cb: (key: string, val: Any) => void) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, keys, cb); return; }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (keys.has(k)) cb(k, v);
    else walk(v, keys, cb);
  }
}

function findFirst(node: Any, key: string): Any {
  let out: Any;
  const go = (n: Any) => {
    if (out !== undefined || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) go(x); return; }
    for (const k of Object.keys(n)) {
      if (k === key) { out = n[k]; return; }
      go(n[k]);
    }
  };
  go(node);
  return out;
}

export function bestThumb(thumbs?: Any[]): string | undefined {
  if (!thumbs?.length) return undefined;
  const t = thumbs.reduce((a, b) => ((b.width || 0) * (b.height || 0) >= (a.width || 0) * (a.height || 0) ? b : a));
  let url: string = t.url;
  if (!url) return undefined;
  if (url.startsWith('//')) url = 'https:' + url;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) url = url.replace(/=(w\d+-h\d+|s\d+).*$/, '=w600-h600-l90-rj');
  return url;
}

const thumbsOf = (r: Any): Any[] | undefined =>
  r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
  r?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
  r?.thumbnail?.thumbnails ||
  findFirst(r?.thumbnail ?? r?.thumbnailRenderer ?? {}, 'thumbnails');

const DUR = /^\d{1,2}:\d{2}(:\d{2})?$/;
export const toSeconds = (s?: string): number => {
  if (!s || !DUR.test(s)) return 0;
  return s.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
};
const fmtDur = (n: number) => (n ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}` : '');

const pageType = (ep: Any): string =>
  ep?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';

export interface Parsed {
  kind: 'song' | 'video' | 'album' | 'artist' | 'playlist';
  id: string;
  title: string;
  artists: { name: string; id?: string }[];
  album?: { name: string; id?: string };
  duration?: string;
  durationSeconds?: number;
  thumbnail?: string;
  year?: string;
  subscribers?: string;
  isExplicit?: boolean;
}

/** Pecah runs "Artis • Album • 3:45" menjadi artis/album/durasi/tahun. */
function splitRuns(runs: Any[]) {
  const artists: { name: string; id?: string }[] = [];
  let album: { name: string; id?: string } | undefined;
  let duration = 0;
  let year = '';
  let label = '';
  let extra = '';
  for (const r of runs) {
    const t = (r.text || '').trim();
    if (!t || t === '•' || t === '&' || t === ',') continue;
    const bid: string = r.navigationEndpoint?.browseEndpoint?.browseId || '';
    if (bid.startsWith('MPRE')) album = { name: t, id: bid };
    else if (bid.startsWith('UC') || pageType(r.navigationEndpoint) === 'MUSIC_PAGE_TYPE_ARTIST') artists.push({ name: t, id: bid });
    else if (DUR.test(t)) duration = toSeconds(t);
    else if (/^(19|20)\d{2}$/.test(t)) year = t;
    else if (/^(Song|Video|Album|Single|EP|Artist|Playlist|Lagu|Artis|Playlist)$/i.test(t)) label = t;
    else if (/subscriber|pelanggan|penayangan|views|putar|plays/i.test(t)) extra = t;
    else if (!bid && !artists.length && !label) artists.push({ name: t });
    else if (!bid && !album && artists.length) album = { name: t };
  }
  return { artists, album, duration, year, label, extra };
}

function videoIdOf(r: Any): string {
  return (
    r.playlistItemData?.videoId ||
    r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    r.navigationEndpoint?.watchEndpoint?.videoId ||
    r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId ||
    ''
  );
}

function videoType(r: Any): string {
  const ep =
    r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint ||
    r.navigationEndpoint?.watchEndpoint ||
    r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint;
  return ep?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';
}

const explicitOf = (r: Any) => JSON.stringify(r.badges || '').includes('MUSIC_EXPLICIT_BADGE');

/** musicResponsiveListItemRenderer -> Parsed */
function parseListItem(r: Any): Parsed | null {
  const cols: Any[] = (r.flexColumns || []).map((c: Any) => c.musicResponsiveListItemFlexColumnRenderer?.text);
  const title = textOf(cols[0]);
  if (!title) return null;
  const thumb = bestThumb(thumbsOf(r));
  const vid = videoIdOf(r);
  const rest = [...runsOf(cols[1]), ...runsOf(cols[2])];
  const fixed = textOf(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text);
  const sp = splitRuns(rest);
  const dur = sp.duration || toSeconds(fixed);

  if (vid) {
    const vt = videoType(r);
    return {
      kind: vt && vt !== 'MUSIC_VIDEO_TYPE_ATV' && vt !== 'MUSIC_VIDEO_TYPE_PODCAST_EPISODE' ? 'video' : 'song',
      id: vid, title, artists: sp.artists, album: sp.album,
      duration: fmtDur(dur), durationSeconds: dur,
      thumbnail: thumb || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      isExplicit: explicitOf(r),
    };
  }
  const ep = r.navigationEndpoint;
  const bid: string = ep?.browseEndpoint?.browseId || '';
  const pt = pageType(ep);
  if (bid.startsWith('MPRE') || pt === 'MUSIC_PAGE_TYPE_ALBUM')
    return { kind: 'album', id: bid, title, artists: sp.artists, thumbnail: thumb, year: sp.year };
  if (bid.startsWith('UC') || pt === 'MUSIC_PAGE_TYPE_ARTIST')
    return { kind: 'artist', id: bid, title, artists: [], thumbnail: thumb, subscribers: sp.extra };
  if (bid.startsWith('VL') || pt === 'MUSIC_PAGE_TYPE_PLAYLIST')
    return { kind: 'playlist', id: bid, title, artists: sp.artists, thumbnail: thumb };
  return null;
}

/** musicTwoRowItemRenderer (kartu carousel) -> Parsed */
function parseTwoRow(r: Any): Parsed | null {
  const title = textOf(r.title);
  if (!title) return null;
  const thumb = bestThumb(thumbsOf(r));
  const sp = splitRuns(runsOf(r.subtitle));
  const w = r.navigationEndpoint?.watchEndpoint;
  const bid: string = r.navigationEndpoint?.browseEndpoint?.browseId || '';
  const pt = pageType(r.navigationEndpoint);
  if (w?.videoId) {
    const vt = w.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
    return {
      kind: vt && vt !== 'MUSIC_VIDEO_TYPE_ATV' ? 'video' : 'song',
      id: w.videoId, title, artists: sp.artists, album: sp.album,
      thumbnail: thumb || `https://i.ytimg.com/vi/${w.videoId}/hqdefault.jpg`, isExplicit: explicitOf(r),
    };
  }
  if (bid.startsWith('MPRE') || pt === 'MUSIC_PAGE_TYPE_ALBUM') return { kind: 'album', id: bid, title, artists: sp.artists, thumbnail: thumb, year: sp.year };
  if (bid.startsWith('UC') || pt === 'MUSIC_PAGE_TYPE_ARTIST') return { kind: 'artist', id: bid, title, artists: [], thumbnail: thumb, subscribers: sp.extra };
  if (bid.startsWith('VL') || pt === 'MUSIC_PAGE_TYPE_PLAYLIST') return { kind: 'playlist', id: bid, title, artists: sp.artists, thumbnail: thumb };
  return null;
}

/** playlistPanelVideoRenderer (antrean "next") -> Parsed */
function parsePanel(r: Any): Parsed | null {
  const vid = r.videoId;
  if (!vid) return null;
  const sp = splitRuns(runsOf(r.longBylineText));
  const dur = toSeconds(textOf(r.lengthText));
  return {
    kind: 'song', id: vid, title: textOf(r.title) || 'Tanpa judul',
    artists: sp.artists, album: sp.album, duration: fmtDur(dur), durationSeconds: dur,
    thumbnail: bestThumb(r.thumbnail?.thumbnails) || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    isExplicit: explicitOf(r),
  };
}

const ITEM_KEYS = new Set(['musicResponsiveListItemRenderer', 'musicTwoRowItemRenderer', 'playlistPanelVideoRenderer']);

/** Semua item (berurutan) dari sebuah respons. */
function collectItems(node: Any): Parsed[] {
  const out: Parsed[] = [];
  walk(node, ITEM_KEYS, (k, v) => {
    const p = k === 'musicResponsiveListItemRenderer' ? parseListItem(v) : k === 'musicTwoRowItemRenderer' ? parseTwoRow(v) : parsePanel(v);
    if (p) out.push(p);
  });
  return out;
}

export interface Shelf { title: string; more?: { browseId: string; params?: string }; items: Parsed[] }

const SHELF_KEYS = new Set(['musicCarouselShelfRenderer', 'musicShelfRenderer', 'musicPlaylistShelfRenderer', 'gridRenderer', 'musicImmersiveCarouselShelfRenderer']);

function collectShelves(node: Any): Shelf[] {
  const out: Shelf[] = [];
  walk(node, SHELF_KEYS, (k, v) => {
    const header = v.header?.musicCarouselShelfBasicHeaderRenderer || v.header?.gridHeaderRenderer || v.header?.musicImmersiveCarouselShelfBasicHeaderRenderer;
    const title = textOf(header?.title) || textOf(v.title);
    const moreEp = header?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint || v.bottomEndpoint?.browseEndpoint;
    const items = collectItems(v.contents || v.items || []);
    if (items.length) out.push({ title, items, more: moreEp ? { browseId: moreEp.browseId, params: moreEp.params } : undefined });
  });
  return out;
}

const uniq = <T extends { id: string }>(a: T[]): T[] => {
  const s = new Set<string>();
  return a.filter((x) => (s.has(x.id) ? false : (s.add(x.id), true)));
};

// ---------------------------------------------------------------------------
// Bentuk JSON yang dikonsumsi frontend (sama dengan backend lama)
// ---------------------------------------------------------------------------
export const toSong = (p: Parsed) => ({
  id: p.id, videoId: p.id, title: p.title,
  artists: p.artists.length ? p.artists : [{ name: 'Unknown Artist' }],
  album: p.album, duration: p.duration || '', durationSeconds: p.durationSeconds || 0,
  thumbnail: p.thumbnail || `https://i.ytimg.com/vi/${p.id}/hqdefault.jpg`, isExplicit: !!p.isExplicit,
});
export const toAlbum = (p: Parsed) => ({
  id: p.id, title: p.title, artist: p.artists.map((a) => a.name).join(', ') || 'Various Artists',
  year: p.year || '', thumbnail: p.thumbnail, tracksCount: 0,
});
export const toArtist = (p: Parsed) => ({ id: p.id, name: p.title, subscribers: p.subscribers || '', thumbnail: p.thumbnail });

const songsOf = (a: Parsed[]) => uniq(a.filter((p) => p.kind === 'song' || p.kind === 'video')).map(toSong);
const albumsOf = (a: Parsed[]) => uniq(a.filter((p) => p.kind === 'album')).map(toAlbum);
const artistsOf = (a: Parsed[]) => uniq(a.filter((p) => p.kind === 'artist')).map(toArtist);

// ---------------------------------------------------------------------------
// Endpoint publik
// ---------------------------------------------------------------------------
const FILTERS: Record<string, string> = {
  songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF',
  videos: 'EgWKAQIQAWoMEA4QChADEAQQCRAF',
  albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  playlists: 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU=',
};

const shapeItem = (p: Parsed): Any =>
  p.kind === 'album' ? { ...toAlbum(p), kind: 'album' } : p.kind === 'artist' ? { ...toArtist(p), kind: 'artist' } : { ...toSong(p), kind: p.kind };

/** Token halaman berikutnya (format lama nextContinuationData & format baru continuationCommand). */
function continuationOf(data: Any): string {
  const old = findFirst(data, 'nextContinuationData');
  if (old?.continuation) return String(old.continuation);
  const cmd = findFirst(data, 'continuationCommand');
  return cmd?.token ? String(cmd.token) : '';
}

/** Pencarian satu halaman + token lanjutan, supaya SEMUA hasil bisa dimuat (bukan hanya halaman pertama). */
export async function searchPage(q: string, filter?: string, cont?: string): Promise<{ results: Any[]; continuation: string }> {
  const data = cont
    ? await post('search', { continuation: cont }, 12000, `&ctoken=${encodeURIComponent(cont)}&continuation=${encodeURIComponent(cont)}&type=next`)
    : await post('search', { query: q, ...(filter && FILTERS[filter] ? { params: FILTERS[filter] } : {}) });
  const seen = new Set<string>();
  const results = collectItems(data)
    .filter((p) => p.kind !== 'playlist')
    .filter((p) => (seen.has(`${p.kind}:${p.id}`) ? false : (seen.add(`${p.kind}:${p.id}`), true)))
    .map(shapeItem);
  // Halaman pertama tanpa filter berisi beberapa rak campuran; token hanya dipercaya untuk pencarian terfilter/lanjutan
  const continuation = cont || (filter && FILTERS[filter]) ? continuationOf(data) : '';
  return { results, continuation };
}

export async function search(q: string, filter?: string) {
  const { results } = await searchPage(q, filter);
  return results.slice(0, 30);
}

export async function suggest(q: string): Promise<string[]> {
  const data = await post('music/get_search_suggestions', { input: q });
  const out: string[] = [];
  walk(data, new Set(['searchSuggestionRenderer']), (_k, v) => out.push(textOf(v.suggestion)));
  return out.filter(Boolean).slice(0, 8);
}

export async function browse(browseId: string, params?: string, extra: Any = {}) {
  return post('browse', { browseId, ...(params ? { params } : {}), ...extra });
}

export async function homeFeed() {
  const data = await browse('FEmusic_home');
  const shelves = collectShelves(data);
  const all = shelves.flatMap((s) => s.items);
  const quick = songsOf((shelves.find((s) => s.items.some((i) => i.kind === 'song')) || { items: [] }).items);
  return {
    quick,
    extra: songsOf(all),
    albums: albumsOf(all),
    artists: artistsOf(all),
    shelves: shelves.slice(0, 12).map((s) => ({ title: s.title, count: s.items.length })),
  };
}

export async function charts() {
  const data = await browse('FEmusic_charts', undefined, { formData: { selectedValues: [CHART_COUNTRY] } });
  const all = collectShelves(data).flatMap((s) => s.items);
  return { songs: songsOf(all), artists: artistsOf(all), albums: albumsOf(all) };
}

export async function newReleases() {
  const data = await browse('FEmusic_new_releases_albums');
  return albumsOf(collectShelves(data).flatMap((s) => s.items).concat(collectItems(data)));
}

export async function playlistTracks(playlistId: string, limit = 30) {
  const id = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
  const data = await browse(id);
  return songsOf(collectItems(data)).slice(0, limit);
}

export async function searchPlaylists(q: string) {
  const data = await post('search', { query: q, params: FILTERS.playlists });
  return uniq(collectItems(data).filter((p) => p.kind === 'playlist'));
}

export async function album(id: string) {
  const data = await browse(id);
  const header = findFirst(data, 'musicResponsiveHeaderRenderer') || findFirst(data, 'musicDetailHeaderRenderer') || {};
  const title = textOf(header.title);
  const sub = [...runsOf(header.subtitle), ...runsOf(header.straplineTextOne)];
  const sp = splitRuns(sub);
  const year = sp.year || (sub.map((r) => r.text).join(' ').match(/(19|20)\d{2}/)?.[0] ?? '');
  const thumb = bestThumb(thumbsOf(header)) || bestThumb(findFirst(header, 'thumbnails'));
  const desc = textOf(findFirst(data, 'musicDescriptionShelfRenderer')?.description) || textOf(header.description?.musicDescriptionShelfRenderer?.description);
  const al = { name: title, id };
  const artistsStr = sp.artists.map((a) => a.name).join(', ');
  const tracks = songsOf(
    collectShelves(data).flatMap((s) => s.items).filter((i) => i.kind === 'song' || i.kind === 'video'),
  ).map((t) => ({
    ...t,
    thumbnail: /i\.ytimg\.com/.test(t.thumbnail) ? thumb || t.thumbnail : t.thumbnail,
    album: t.album || al,
    artists: t.artists[0]?.name === 'Unknown Artist' && sp.artists.length ? sp.artists : t.artists,
  }));
  if (!title && !tracks.length) throw new Error('Album tidak ditemukan');
  return { id, title, artist: artistsStr, year, thumbnail: thumb, tracksCount: tracks.length, description: desc, tracks };
}

export async function artist(id: string) {
  const data = await browse(id);
  const header = data?.header?.musicImmersiveHeaderRenderer || data?.header?.musicVisualHeaderRenderer || findFirst(data, 'musicImmersiveHeaderRenderer') || {};
  const name = textOf(header.title);
  const sub = header.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText || header.subscriptionButton?.subscribeButtonRenderer?.longSubscriberCountText;
  const subscribers = textOf(sub);
  const thumb = bestThumb(thumbsOf(header)) || bestThumb(findFirst(header, 'thumbnails'));
  const bio = textOf(header.description) || textOf(findFirst(data, 'musicDescriptionShelfRenderer')?.description);
  const shelves = collectShelves(data);

  let songs = songsOf(shelves.filter((s) => s.items.some((i) => i.kind === 'song' || i.kind === 'video')).flatMap((s) => s.items).slice(0, 10));
  const songShelf = shelves.find((s) => s.items.some((i) => i.kind === 'song') && s.more?.browseId?.startsWith('VL'));
  if (songs.length < 5 && songShelf?.more) {
    try { songs = uniq([...songs, ...songsOf(collectItems(await browse(songShelf.more.browseId, songShelf.more.params)))] as any).slice(0, 25) as any; } catch { /* abaikan */ }
  }

  const grab = async (re: RegExp) => {
    const sh = shelves.find((s) => re.test(s.title) && s.items.some((i) => i.kind === 'album'));
    if (!sh) return [];
    let items = sh.items;
    if (sh.more?.browseId && sh.more.params) {
      try { const full = collectItems(await browse(sh.more.browseId, sh.more.params)).filter((i) => i.kind === 'album'); if (full.length) items = full; } catch { /* pakai bawaan */ }
    }
    return albumsOf(items).map((a) => ({ ...a, artist: a.artist === 'Various Artists' ? name : a.artist }));
  };
  const [albums, singles] = await Promise.all([grab(/^(albums?)$/i), grab(/single|ep/i)]);
  if (!name && !songs.length) throw new Error('Artis tidak ditemukan');
  return {
    artist: { id, name, subscribers, thumbnail: thumb, bio },
    songs, albums, singles, updatedAt: Math.floor(Date.now() / 1000),
  };
}

export async function next(videoId: string, radio = false, limit = 25) {
  const data = await post('next', {
    videoId, isAudioOnly: true, enablePersistentPlaylistPanel: true,
    ...(radio ? { playlistId: `RDAMVM${videoId}`, params: 'wAEB' } : {}),
  });
  let lyricsId = '';
  walk(data, new Set(['tabRenderer']), (_k, v) => {
    const b = v.endpoint?.browseEndpoint?.browseId;
    if (typeof b === 'string' && b.startsWith('MPLY')) lyricsId = b;
  });
  const tracks = songsOf(collectItems(data)).slice(0, limit);
  return { tracks, lyricsId };
}

export async function lyricsText(browseId: string): Promise<string> {
  const data = await browse(browseId);
  const sh = findFirst(data, 'musicDescriptionShelfRenderer');
  return textOf(sh?.description).trim();
}

// ---------------------------------------------------------------------------
// Lirik tersinkron (LRCLIB)
// ---------------------------------------------------------------------------
const LRC_TS = /\[(\d+):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
export function parseLrc(lrc: string) {
  const lines: { time: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(LRC_TS)];
    if (!stamps.length) continue;
    const text = raw.replace(LRC_TS, '').trim();
    for (const m of stamps) lines.push({ time: Math.round((Number(m[1]) * 60 + parseFloat(m[2].replace(':', '.'))) * 100) / 100, text });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines.filter((l, i) => !(!l.text && i > 0 && !lines[i - 1].text));
}

export const cleanTitle = (t: string) =>
  (t || '').replace(/[([].*?[)\]]/g, '').replace(/\s+-\s+(remaster|live|radio|single|version).*$/i, '').trim();

const norm = (t: string) =>
  (t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(feat|ft|featuring)\b.*$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cleanArtist = (a: string) => (a || '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();

/**
 * Cari lirik di LRCLIB dengan beberapa strategi (tepat -> longgar) lalu pilih kandidat terbaik:
 * lirik bertanda waktu diutamakan, durasi harus cocok, judul harus mirip. Hasil lebih banyak lagu yang
 * mendapat lirik tersinkron dibanding satu kali pencarian saja.
 */
export async function lrclib(title: string, artist: string, album?: string, duration?: number) {
  const H = { 'User-Agent': 'AuralysMusic/4.0' };
  const get = async (path: string, p: Record<string, string>): Promise<Any> => {
    try {
      const r = await fetch(`https://lrclib.net/api/${path}?${new URLSearchParams(p)}`, { headers: H, signal: AbortSignal.timeout(7000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };
  const art = cleanArtist(artist);
  const t0 = cleanTitle(title) || title;
  const wantT = norm(t0);
  const near = (d?: number) => !duration || !d || Math.abs(d - duration) <= 4;
  const pack = (d: Any) => ({ synced: d?.syncedLyrics ? parseLrc(d.syncedLyrics) : [], plain: d?.plainLyrics || '' });

  // 1) Pencocokan tepat (paralel: dengan & tanpa album)
  const exact = await Promise.all([
    get('get', { track_name: t0, artist_name: art, ...(album ? { album_name: album } : {}), ...(duration ? { duration: String(duration) } : {}) }),
    album ? get('get', { track_name: t0, artist_name: art, ...(duration ? { duration: String(duration) } : {}) }) : Promise.resolve(null),
  ]);
  const hit = exact.find((d) => d?.syncedLyrics && near(d.duration)) || null;
  if (hit) return pack(hit);

  // 2) Pencarian longgar: kumpulkan kandidat dari beberapa kueri
  const queries: Record<string, string>[] = [
    { track_name: t0, artist_name: art },
    { q: `${art} ${t0}` },
    { q: t0 },
  ];
  const seen = new Set<number>();
  let cands: Any[] = [];
  for (const q of queries) {
    const r: Any[] = (await get('search', q)) || [];
    for (const c of r) if (c && !seen.has(c.id)) { seen.add(c.id); cands.push(c); }
    if (cands.some((c) => c.syncedLyrics && near(c.duration) && norm(c.trackName || c.name) === wantT)) break;
  }
  const score = (c: Any) => {
    const ct = norm(c.trackName || c.name || '');
    let sc = 0;
    if (ct === wantT) sc += 6; else if (ct.includes(wantT) || wantT.includes(ct)) sc += 3; else sc -= 4;
    if (norm(c.artistName || '').includes(norm(art).split(' ')[0] || '~')) sc += 3;
    if (c.syncedLyrics) sc += 5;
    if (duration && c.duration) { const dd = Math.abs(c.duration - duration); sc += dd <= 2 ? 4 : dd <= 4 ? 2 : dd <= 8 ? -1 : -6; }
    return sc;
  };
  cands = cands.map((c) => ({ c, s: score(c) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
  const best = cands[0] || exact.find((d) => d?.plainLyrics) || null;
  return best ? pack(best) : { synced: [], plain: '' };
}

// ---------------------------------------------------------------------------
// Stream audio (cadangan untuk pemutaran latar belakang). Pemutar utama = YouTube IFrame.
// ---------------------------------------------------------------------------
export interface AudioSrc { url: string; mime: string; ua: string; client: string }

// Beberapa klien InnerTube berbeda: bila satu ditolak (login/bot-check/tanpa URL langsung),
// coba berikutnya. Urutan = yang paling sering memberi URL audio langsung lebih dulu.
const webEmbedVersion = () => {
  const d = new Date(Date.now() - 36e5 * 24 * 2);
  const p = (n: number) => String(n).padStart(2, '0');
  return `1.${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}.01.00`;
};

// Urutan: ANDROID_VR (tidak butuh PO Token, tapi tanpa video "khusus anak") -> WEB_EMBEDDED (penutup untuk yang ditolak VR)
// -> IOS (terakhir: sering butuh PO Token sehingga URL-nya 403). TV_EMBED dibuang: dilaporkan rusak oleh yt-dlp (Jan 2026).
const AUDIO_CLIENTS: { name: string; id: string; ua: string; embed?: boolean; ctx: () => Record<string, any> }[] = [
  {
    name: 'ANDROID_VR', id: '28',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    ctx: () => ({ clientName: 'ANDROID_VR', clientVersion: '1.62.27', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32 }),
  },
  {
    name: 'WEB_EMBEDDED', id: '56', embed: true,
    ua: UA,
    ctx: () => ({ clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: webEmbedVersion() }),
  },
  {
    name: 'IOS', id: '5',
    ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    ctx: () => ({ clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' }),
  },
];

/** `skip` = nama klien yang URL-nya sudah terbukti ditolak (mis. 403) agar tidak dicoba lagi. */
export async function audioSource(videoId: string, skip: string[] = []): Promise<AudioSrc> {
  const errors: string[] = [];
  for (const c of AUDIO_CLIENTS) {
    if (skip.includes(c.name)) continue;
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
          'X-YouTube-Client-Name': c.id,
          'X-YouTube-Client-Version': String(c.ctx().clientVersion),
        },
        body: JSON.stringify({
          context: {
            client: { ...c.ctx(), hl: 'en', gl: LOCATION },
            ...(c.embed ? { thirdParty: { embedUrl: 'https://www.youtube.com/' } } : {}),
          },
          videoId, contentCheckOk: true, racyCheckOk: true,
        }),
      });
      if (!res.ok) { errors.push(`${c.name}: HTTP ${res.status}`); continue; }
      const j: Any = await res.json();
      const fmts: Any[] = (j?.streamingData?.adaptiveFormats || []).filter((f: Any) => f.url && /^audio\//.test(f.mimeType || ''));
      const ps = j?.playabilityStatus?.status;
      if (ps && ps !== 'OK' && !fmts.length) { errors.push(`${c.name}: ${j?.playabilityStatus?.reason || ps}`); continue; }
      if (!fmts.length) { errors.push(`${c.name}: ${j?.playabilityStatus?.reason || j?.playabilityStatus?.status || 'tanpa URL audio'}`); continue; }
      fmts.sort((a, b) => (/mp4/.test(b.mimeType) ? 1 : 0) - (/mp4/.test(a.mimeType) ? 1 : 0) || (b.bitrate || 0) - (a.bitrate || 0));
      const f = fmts[0];
      return { url: f.url, mime: (f.mimeType as string).split(';')[0], ua: c.ua, client: c.name };
    } catch (e: any) {
      errors.push(`${c.name}: ${e?.message || 'gagal'}`);
    }
  }
  throw new Error(errors.length ? `Stream audio tidak tersedia (${errors.join(' | ')})` : 'Stream audio tidak tersedia');
}
