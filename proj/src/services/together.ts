import { useSyncExternalStore } from 'react';
import { Song } from '../types/music';

/**
 * "Dengar bersama" real-time.
 * Transport 1: relay milik server sendiri (/together/*, SSE + POST) bila ada (npm run dev / start).
 * Transport 2 (cadangan, mis. Vercel yang tanpa koneksi persisten): relay publik ntfy.sh.
 * Keduanya hanya menyiarkan pesan; presence dan sinkronisasi dikerjakan di klien.
 */

export type Member = { id: string; name: string; host: boolean; seen: number };
export type Status = 'idle' | 'connecting' | 'online' | 'reconnecting';
export type Mode = 'server' | 'relay';

export type Msg =
  | { t: 'ping'; from: string; name: string; host: boolean }
  | { t: 'bye'; from: string }
  | { t: 'req'; from: string }
  | { t: 'state'; from: string; song: Song | null; queue: Song[]; playing: boolean; time: number };

export type TogetherState = {
  session: { code: string; host: boolean; name: string } | null;
  status: Status;
  mode: Mode | null;
  members: Member[];
};

export const myId = (() => {
  // sessionStorage bisa melempar error (cookie/penyimpanan diblokir) -> pakai ID sementara di memori
  let v: string | null = null;
  try { v = sessionStorage.getItem('auralys_uid'); } catch { /* diblokir */ }
  if (!v) {
    v = Math.random().toString(36).slice(2, 10);
    try { sessionStorage.setItem('auralys_uid', v); } catch { /* diblokir */ }
  }
  return v;
})();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const PING_MS = 8000;
const EXPIRE_MS = 22000;

let state: TogetherState = { session: null, status: 'idle', mode: null, members: [] };
const listeners = new Set<() => void>();
const msgListeners = new Set<(m: Msg) => void>();
const set = (p: Partial<TogetherState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

let es: EventSource | null = null;
let timers: ReturnType<typeof setInterval>[] = [];
let reconnectT: ReturnType<typeof setTimeout> | null = null;
let gen = 0; // id percobaan sambung, agar callback usang diabaikan
const seen = new Map<string, Member>();

const endpoints = (mode: Mode, code: string) =>
  mode === 'server'
    ? { stream: `/together/stream?room=${code}`, send: `/together/send?room=${code}` }
    : { stream: `https://ntfy.sh/auralys-together-${code.toLowerCase()}-k7x/sse`, send: `https://ntfy.sh/auralys-together-${code.toLowerCase()}-k7x` };

async function probeServer(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 2500);
    const r = await fetch('/together/ping', { signal: ac.signal, cache: 'no-store' });
    clearTimeout(to);
    return r.ok && (await r.text()).trim() === 'auralys-together';
  } catch { return false; }
}

function touch(m: Member) {
  seen.set(m.id, m);
  publishMembers();
}
function publishMembers() {
  const now = Date.now();
  for (const [id, m] of seen) if (id !== myId && now - m.seen > EXPIRE_MS) seen.delete(id);
  const list = [...seen.values()].sort((a, b) => Number(b.host) - Number(a.host) || a.name.localeCompare(b.name));
  set({ members: list });
}

export const together = {
  get: () => state,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  onMessage: (l: (m: Msg) => void) => { msgListeners.add(l); return () => { msgListeners.delete(l); }; },

  send(msg: Msg) {
    const s = state.session; const mode = state.mode;
    if (!s || !mode) return;
    const url = endpoints(mode, s.code).send;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(msg), keepalive: true }).catch(() => {});
  },

  async join(code: string, host: boolean, name: string) {
    together.leave(false);
    const my = ++gen;
    seen.clear();
    seen.set(myId, { id: myId, name, host, seen: Date.now() });
    set({ session: { code, host, name }, status: 'connecting', mode: null, members: [...seen.values()] });

    const mode: Mode = (await probeServer()) ? 'server' : 'relay';
    if (my !== gen) return;
    set({ mode });

    const connect = () => {
      if (my !== gen) return;
      const ep = endpoints(mode, code);
      es?.close();
      const src = new EventSource(ep.stream);
      es = src;
      src.onopen = () => {
        if (my !== gen) return;
        set({ status: 'online' });
        together.send({ t: 'ping', from: myId, name, host });
        if (!host) together.send({ t: 'req', from: myId });
      };
      src.onerror = () => {
        if (my !== gen) return;
        set({ status: 'reconnecting' });
        if (src.readyState === EventSource.CLOSED) {
          if (reconnectT) clearTimeout(reconnectT);
          reconnectT = setTimeout(connect, 2000);
        }
      };
      src.onmessage = (ev) => {
        if (my !== gen) return;
        let msg: Msg | null = null;
        try {
          if (mode === 'server') msg = JSON.parse(ev.data);
          else { const j = JSON.parse(ev.data); if (j.event !== 'message') return; msg = JSON.parse(j.message); }
        } catch { return; }
        if (!msg || msg.from === myId) return;
        if (msg.t === 'ping') {
          const known = seen.has(msg.from);
          touch({ id: msg.from, name: msg.name, host: msg.host, seen: Date.now() });
          // anggota baru: balas segera agar daftar pendengar langsung lengkap di kedua sisi
          if (!known) together.send({ t: 'ping', from: myId, name, host });
        }
        else if (msg.t === 'bye') { seen.delete(msg.from); publishMembers(); }
        msgListeners.forEach((l) => l(msg!));
      };
    };
    connect();

    timers.push(setInterval(() => {
      if (state.status === 'online') together.send({ t: 'ping', from: myId, name, host });
      const me = seen.get(myId); if (me) me.seen = Date.now();
      publishMembers();
    }, PING_MS));

    // Peramban seluler menangguhkan koneksi saat di latar: sambung ulang & minta status saat kembali
    const onVis = () => {
      if (document.visibilityState !== 'visible' || my !== gen) return;
      if (!es || es.readyState === EventSource.CLOSED) connect();
      else if (!host) together.send({ t: 'req', from: myId });
    };
    document.addEventListener('visibilitychange', onVis);
    const onHide = () => together.send({ t: 'bye', from: myId });
    window.addEventListener('pagehide', onHide);
    cleanups.push(() => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); });
  },

  leave(announce = true) {
    if (announce && state.session) together.send({ t: 'bye', from: myId });
    gen++;
    es?.close(); es = null;
    if (reconnectT) { clearTimeout(reconnectT); reconnectT = null; }
    timers.forEach((t) => clearInterval(t as any)); timers = [];
    cleanups.forEach((c) => c()); cleanups = [];
    seen.clear();
    set({ session: null, status: 'idle', mode: null, members: [] });
  },
};
let cleanups: (() => void)[] = [];

export const useTogether = () => useSyncExternalStore(together.subscribe, together.get, together.get);
