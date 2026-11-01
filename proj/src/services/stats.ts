import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Song } from '../types/music';

/**
 * Statistik waktu dengar (disimpan lokal, disinkronkan ke cloud saat login).
 * - Waktu dihitung hanya saat lagu benar-benar diputar (interval 1 detik).
 * - `unsynced` = detik yang belum dikirim ke Firestore (aman bila offline / belum login).
 */

const KEY = 'auralys_stats_v1';
const MAX_SONGS = 200;
const MAX_DAYS = 120;
const PLAY_THRESHOLD = 30; // detik sebelum dihitung sebagai 1 "putaran"

export interface SongStat { id: string; title: string; artist: string; thumbnail: string; seconds: number; plays: number }
export interface StatsData {
  totalSeconds: number;
  plays: number;
  days: Record<string, number>;               // 'YYYY-MM-DD' (waktu lokal) -> detik
  songs: Record<string, SongStat>;
  artists: Record<string, { name: string; seconds: number }>;
  unsynced: { total: number; weeks: Record<string, number> }; // weeks: weekKey -> detik
}

const empty = (): StatsData => ({
  totalSeconds: 0, plays: 0, days: {}, songs: {}, artists: {}, unsynced: { total: 0, weeks: {} },
});

export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Kunci minggu (Senin, UTC) — sama untuk semua pengguna agar leaderboard mingguan adil. */
export const weekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (t.getUTCDay() + 6) % 7; // Senin = 0
  t.setUTCDate(t.getUTCDate() - dow);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

let data: StatsData = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') return { ...empty(), ...raw, unsynced: { ...empty().unsynced, ...(raw.unsynced || {}) } } as StatsData;
  } catch {}
  return empty();
})();

let version = 0;
const listeners = new Set<() => void>();
let dirty = false;
let lastSave = 0;

function save(force = false) {
  const now = Date.now();
  if (!dirty || (!force && now - lastSave < 5000)) return;
  try { localStorage.setItem(KEY, JSON.stringify(data)); dirty = false; lastSave = now; } catch {}
}
function emit() { version++; listeners.forEach((l) => l()); }

function prune() {
  const dayKeys = Object.keys(data.days).sort();
  if (dayKeys.length > MAX_DAYS) dayKeys.slice(0, dayKeys.length - MAX_DAYS).forEach((k) => delete data.days[k]);
  const ids = Object.keys(data.songs);
  if (ids.length > MAX_SONGS) {
    ids.sort((a, b) => data.songs[b].seconds - data.songs[a].seconds).slice(MAX_SONGS).forEach((id) => delete data.songs[id]);
  }
}

// --- sesi lagu saat ini (untuk menghitung "putaran") ---
let curId = '';
let curSeconds = 0;

export const StatsStore = {
  tick(song: Song, dt: number) {
    if (!song || dt <= 0) return;
    const sec = Math.min(dt, 2);
    const artistName = song.artists?.[0]?.name || 'Unknown';
    data.totalSeconds += sec;
    data.unsynced.total += sec;
    const wk = weekKey();
    data.unsynced.weeks[wk] = (data.unsynced.weeks[wk] || 0) + sec;
    const dk = dayKey();
    data.days[dk] = (data.days[dk] || 0) + sec;

    const s = data.songs[song.id] || (data.songs[song.id] = {
      id: song.id, title: song.title, artist: artistName, thumbnail: song.thumbnail, seconds: 0, plays: 0,
    });
    s.seconds += sec;
    const a = data.artists[artistName] || (data.artists[artistName] = { name: artistName, seconds: 0 });
    a.seconds += sec;

    if (curId !== song.id) { curId = song.id; curSeconds = 0; }
    const before = curSeconds;
    curSeconds += sec;
    if (before < PLAY_THRESHOLD && curSeconds >= PLAY_THRESHOLD) { s.plays += 1; data.plays += 1; }

    dirty = true;
    if (Math.floor(data.totalSeconds) % 20 === 0) prune();
    save();
    if (listeners.size) emit();
  },
  flushToDisk() { save(true); },
  get(): StatsData { return data; },
  /** Ambil semua detik yang belum disinkronkan (dan kosongkan). */
  takeUnsynced() {
    const u = data.unsynced;
    data = { ...data, unsynced: { total: 0, weeks: {} } };
    dirty = true; save(true);
    return { total: Math.round(u.total), weeks: Object.fromEntries(Object.entries(u.weeks).map(([k, v]) => [k, Math.round(v)])) };
  },
  /** Kembalikan bila pengiriman gagal. */
  restoreUnsynced(u: { total: number; weeks: Record<string, number> }) {
    data.unsynced.total += u.total;
    for (const [k, v] of Object.entries(u.weeks)) data.unsynced.weeks[k] = (data.unsynced.weeks[k] || 0) + v;
    dirty = true; save(true);
  },
  hasUnsynced: () => data.unsynced.total >= 1,
  reset() { data = empty(); dirty = true; save(true); emit(); },
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
};

/** Hook baca statistik (render ulang ~1x/detik saat musik diputar). */
export function useStats(): StatsData {
  useSyncExternalStore(StatsStore.subscribe, () => version);
  return data;
}

/** Pasang di MusicProvider: menghitung detik mendengarkan selama isPlaying. */
export function useListeningTracker(song: Song | null, isPlaying: boolean) {
  const songRef = useRef(song);
  songRef.current = song;
  useEffect(() => {
    if (!isPlaying) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (songRef.current) StatsStore.tick(songRef.current, dt);
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    const flush = () => StatsStore.flushToDisk();
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); flush(); };
  }, []);
}

// ---------- helper format & turunan ----------
export function formatDuration(sec: number, long = false): string {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return long ? `${h} jam ${m} menit` : `${h}j ${m}m`;
  if (m > 0) return long ? `${m} menit ${s} detik` : `${m}m ${pad(s)}d`;
  return `${s} detik`;
}

export function last7Days(d: StatsData) {
  const out: { key: string; label: string; seconds: number; today: boolean }[] = [];
  const names = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const key = dayKey(dt);
    out.push({ key, label: names[dt.getDay()], seconds: d.days[key] || 0, today: i === 0 });
  }
  return out;
}

export function streakDays(d: StatsData): number {
  let n = 0;
  const dt = new Date();
  if (!(d.days[dayKey(dt)] > 0)) dt.setDate(dt.getDate() - 1); // hari ini belum mendengar -> mulai dari kemarin
  while (d.days[dayKey(dt)] > 0) { n++; dt.setDate(dt.getDate() - 1); }
  return n;
}

export const topSongs = (d: StatsData, n = 5) => Object.values(d.songs).sort((a, b) => b.seconds - a.seconds).slice(0, n);
export const topArtists = (d: StatsData, n = 5) => Object.values(d.artists).sort((a, b) => b.seconds - a.seconds).slice(0, n);
