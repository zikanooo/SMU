import * as Y from './ytm.js';

/**
 * Impor playlist Spotify -> Auralys.
 *
 * Sumber data (otomatis, berurutan):
 *  1. Spotify Web API resmi (client credentials) — bila SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET diisi. Sampai 500 lagu.
 *  2. Halaman embed publik open.spotify.com/embed/playlist/<id> — tanpa kunci API, tapi biasanya hanya ±100 lagu pertama.
 * Hanya playlist PUBLIK yang bisa dibaca. Lagu lalu dicocokkan satu per satu ke YouTube Music (judul + artis + durasi).
 */

type Any = any;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_TRACKS = 500;

export interface SpTrack { title: string; artists: string[]; durationSeconds: number; album?: string }
export interface SpPlaylist { id: string; name: string; owner?: string; cover?: string; tracks: SpTrack[]; partial: boolean; source: 'api' | 'embed' }

/** Galat yang pesannya aman ditampilkan ke pengguna (bukan error jaringan/internal). */
export class SpotifyUserError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

// ---------------------------------------------------------------------------
// Parsing tautan
// ---------------------------------------------------------------------------
export function parsePlaylistId(input: string): string {
  const s = String(input || '').trim();
  if (!s) throw new SpotifyUserError('Tempel tautan playlist Spotify dulu.', 400);
  let m = s.match(/^spotify:playlist:([A-Za-z0-9]{22})$/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{22}$/.test(s)) return s;
  m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?playlist\/([A-Za-z0-9]{22})/i);
  if (m) return m[1];
  if (/spotify\.link|spotify\.app\.link/i.test(s)) {
    throw new SpotifyUserError('Tautan pendek (spotify.link) belum didukung. Buka playlist di Spotify → Bagikan → Salin tautan playlist.', 400);
  }
  if (/open\.spotify\.com\/(album|track|artist)\//i.test(s)) {
    throw new SpotifyUserError('Itu bukan tautan playlist. Pilih playlist, lalu Bagikan → Salin tautan.', 400);
  }
  throw new SpotifyUserError('Tautan tidak dikenali. Contoh: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 400);
}

// ---------------------------------------------------------------------------
// Sumber 1: API resmi (opsional)
// ---------------------------------------------------------------------------
let tokenCache: { token: string; exp: number } | null = null;

async function appToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (tokenCache && tokenCache.exp > Date.now() + 30_000) return tokenCache.token;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`token Spotify ditolak (${res.status})`);
  const j: Any = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

async function viaApi(id: string): Promise<SpPlaylist | null> {
  const token = await appToken();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const get = async (url: string): Promise<Any> => {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!r.ok) { const e: Any = new Error(`Spotify API ${r.status}`); e.status = r.status; throw e; }
    return r.json();
  };

  const meta = await get(`https://api.spotify.com/v1/playlists/${id}?fields=name,owner(display_name),images(url)`);
  const tracks: SpTrack[] = [];
  // Endpoint daftar lagu: coba /items (skema baru), lalu /tracks (skema lama)
  let base = `https://api.spotify.com/v1/playlists/${id}/items`;
  let next: string | null = `${base}?limit=100`;
  let total = 0;
  while (next && tracks.length < MAX_TRACKS) {
    let page: Any;
    try { page = await get(next); }
    catch (e: any) {
      if (tracks.length === 0 && base.endsWith('/items') && (e.status === 404 || e.status === 400)) {
        base = `https://api.spotify.com/v1/playlists/${id}/tracks`;
        next = `${base}?limit=100`;
        continue;
      }
      throw e;
    }
    total = Number(page.total) || total;
    for (const it of page.items || []) {
      const t = it?.item || it?.track;
      if (!t || t.is_local || (t.type && t.type !== 'track') || !t.name) continue;
      tracks.push({
        title: String(t.name),
        artists: (t.artists || []).map((a: Any) => String(a.name)).filter(Boolean),
        durationSeconds: Math.round((Number(t.duration_ms) || 0) / 1000),
        album: t.album?.name,
      });
    }
    next = page.next || null;
  }
  return {
    id, name: meta.name || 'Playlist Spotify', owner: meta.owner?.display_name, cover: meta.images?.[0]?.url,
    tracks: tracks.slice(0, MAX_TRACKS), partial: total > tracks.length, source: 'api',
  };
}

// ---------------------------------------------------------------------------
// Sumber 2: halaman embed publik (tanpa kunci)
// ---------------------------------------------------------------------------
/** Cari objek berisi `trackList` di mana pun dalam JSON (tahan perubahan struktur). */
function findEntity(node: Any, depth = 0): Any {
  if (!node || typeof node !== 'object' || depth > 12) return undefined;
  if (Array.isArray(node.trackList)) return node;
  for (const k of Object.keys(node)) {
    const r = findEntity(node[k], depth + 1);
    if (r) return r;
  }
  return undefined;
}

export function parseEmbedHtml(id: string, html: string): SpPlaylist {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('struktur halaman embed berubah (tidak ada __NEXT_DATA__)');
  let data: Any;
  try { data = JSON.parse(m[1]); } catch { throw new Error('data embed Spotify tidak terbaca'); }
  const ent = findEntity(data);
  if (!ent) throw new SpotifyUserError('Playlist tidak bisa dibaca. Pastikan playlist bersifat Publik (bukan privat).');

  const tracks: SpTrack[] = [];
  for (const t of ent.trackList as Any[]) {
    const title = String(t?.title || '').trim();
    if (!title || String(t?.uri || '').startsWith('spotify:local:')) continue;
    const artists = String(t?.subtitle || '').split(/,\s*|\u00a0/).map((a) => a.trim()).filter(Boolean);
    tracks.push({ title, artists, durationSeconds: Math.round((Number(t?.duration) || 0) / 1000) });
  }
  const cover: string | undefined = ent.coverArt?.sources?.[0]?.url || ent.visualIdentity?.image?.[0]?.url;
  return {
    id, name: String(ent.name || ent.title || 'Playlist Spotify'), owner: ent.subtitle ? String(ent.subtitle) : undefined,
    cover, tracks: tracks.slice(0, MAX_TRACKS),
    // Embed memotong di ±100 lagu; jika persis di batas, kemungkinan masih ada sisanya
    partial: tracks.length >= 100, source: 'embed',
  };
}

async function viaEmbed(id: string): Promise<SpPlaylist> {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 404) throw new SpotifyUserError('Playlist tidak ditemukan atau bersifat privat. Ubah jadi Publik lalu coba lagi.');
  if (!res.ok) throw new Error(`Spotify membalas ${res.status}`);
  return parseEmbedHtml(id, await res.text());
}

export async function fetchPlaylist(input: string): Promise<SpPlaylist> {
  const id = parsePlaylistId(input);
  let apiErr = '';
  try {
    const p = await viaApi(id);
    if (p && p.tracks.length) return p;
  } catch (e: any) {
    apiErr = e?.message || '';
    console.warn('[spotify] API resmi gagal, pakai embed:', apiErr);
  }
  let p: SpPlaylist;
  try { p = await viaEmbed(id); }
  catch (e: any) {
    if (e instanceof SpotifyUserError) throw e;
    throw new Error(`Gagal membaca playlist Spotify${apiErr ? ` (${apiErr})` : ''}: ${e?.message || 'jaringan'}`);
  }
  if (!p.tracks.length) throw new SpotifyUserError('Playlist kosong atau tidak bisa dibaca (mungkin privat).');
  return p;
}

// ---------------------------------------------------------------------------
// Pencocokan lagu -> YouTube Music
// ---------------------------------------------------------------------------
const VERSION_WORDS = ['live', 'cover', 'karaoke', 'remix', 'instrumental', 'sped up', 'slowed', 'nightcore', '8d', 'reverb', 'acoustic', 'remastered'];

export const norm = (s: string): string =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[([](?:feat|ft|with)\b[^)\]]*[)\]]/g, ' ')
    .replace(/\s(?:feat|ft)\.?\s.*$/, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u00c0-\uffff]+/g, ' ').trim();

const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));

function titleSim(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((t) => { if (B.has(t)) inter++; });
  const jac = inter / (A.size + B.size - inter);
  const contain = inter / Math.min(A.size, B.size);
  return Math.max(jac, contain * 0.9);
}

export function scoreCandidate(want: SpTrack, c: Any): number {
  const cTitle = String(c.title || '');
  const cArtists: string[] = (c.artists || []).map((a: Any) => String(a?.name || ''));
  const t = titleSim(want.title, cTitle);

  const haystack = norm(`${cArtists.join(' ')} ${cTitle}`);
  let hit = 0;
  for (const a of want.artists) { const na = norm(a); if (na && haystack.includes(na)) hit++; }
  const artist = want.artists.length ? Math.min(1, hit / Math.min(want.artists.length, 2)) : 0.5;

  let dur = 0.1;
  const cd = Number(c.durationSeconds) || 0;
  if (want.durationSeconds && cd) {
    const d = Math.abs(want.durationSeconds - cd);
    dur = d <= 3 ? 0.2 : d <= 8 ? 0.12 : d <= 15 ? 0.04 : -0.1;
  }

  const wantRaw = want.title.toLowerCase(), candRaw = cTitle.toLowerCase();
  let penalty = 0;
  for (const w of VERSION_WORDS) if (candRaw.includes(w) && !wantRaw.includes(w)) penalty -= 0.25;

  return 0.5 * t + 0.3 * artist + dur + penalty;
}

const ACCEPT = 0.55;

export async function matchTrack(want: SpTrack): Promise<{ song: ReturnType<typeof Y.toSong> | null; confidence: number }> {
  const pick = (results: Any[]) => {
    let best: Any = null, bestScore = -1;
    for (const r of results) {
      if (r.kind !== 'song' && r.kind !== 'video') continue;
      const s = scoreCandidate(want, r) + (r.kind === 'song' ? 0.03 : 0);
      if (s > bestScore) { best = r; bestScore = s; }
    }
    return { best, score: bestScore };
  };
  const strip = (r: Any) => { const { kind: _k, ...rest } = r; return rest as any; };

  const main = want.artists[0] || '';
  const first = await Y.searchPage(`${want.title} ${main}`.trim(), 'songs');
  let { best, score } = pick(first.results);
  if (best && score >= ACCEPT) return { song: strip(best), confidence: Math.min(1, score) };

  // Cadangan: pencarian umum dengan semua artis (bisa menemukan video musik resmi)
  const second = await Y.searchPage(`${want.artists.join(' ')} ${want.title}`.trim());
  const alt = pick(second.results);
  if (alt.best && alt.score > score) { best = alt.best; score = alt.score; }
  if (best && score >= ACCEPT) return { song: strip(best), confidence: Math.min(1, score) };
  return { song: null, confidence: Math.max(0, score) };
}
