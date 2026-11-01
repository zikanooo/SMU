/**
 * Offset sinkron lirik (detik). Positif = lirik tampil lebih cepat, negatif = lebih lambat.
 * Dipakai untuk mengimbangi latensi pemutar (iframe YouTube / stream) pada perangkat tertentu.
 */
const KEY = 'auralys_lyric_offset';
export const OFFSET_MIN = -1.5;
export const OFFSET_MAX = 1.5;

const read = (): number => {
  try {
    const v = parseFloat(localStorage.getItem(KEY) || '0');
    return Number.isFinite(v) ? Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, v)) : 0;
  } catch { return 0; }
};

let offset = read();
const listeners = new Set<() => void>();

export const lyricOffset = {
  get: () => offset,
  set: (v: number) => {
    offset = Math.round(Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, v)) * 20) / 20;
    try { localStorage.setItem(KEY, String(offset)); } catch { /* abaikan */ }
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
