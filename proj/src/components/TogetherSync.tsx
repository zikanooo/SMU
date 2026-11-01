import { useEffect, useRef } from 'react';
import { useMusic, useMusicTime } from '../context/MusicContext';
import { together, useTogether, myId, Msg } from '../services/together';
import { Song } from '../types/music';

// Hanya kirim field yang dibutuhkan (relay cadangan membatasi ukuran pesan)
const slim = (s: Song): Song => ({
  id: s.id, videoId: s.videoId, title: s.title, artists: s.artists.slice(0, 2).map((a) => ({ name: a.name, id: a.id })),
  thumbnail: s.thumbnail, durationSeconds: s.durationSeconds, duration: s.duration, accentColor: s.accentColor,
});

type Target = { song: Song; queue: Song[]; playing: boolean; time: number; at: number };

/**
 * Mesin sinkronisasi: selalu aktif (tidak ikut tertutup saat pindah halaman).
 * Host menyiarkan lagu/putar-jeda/posisi; tamu menyamakan diri, termasuk koreksi drift.
 */
export const TogetherSync: React.FC = () => {
  const { currentSong, isPlaying, queue, playSong, pause, resume, seek, showToast } = useMusic();
  const { currentTime } = useMusicTime();
  const { session, status, mode } = useTogether();

  const latest = useRef({ song: currentSong, playing: isPlaying, queue, time: currentTime });
  latest.current = { song: currentSong, playing: isPlaying, queue, time: currentTime };
  const api = useRef({ playSong, pause, resume, seek });
  api.current = { playSong, pause, resume, seek };

  const online = status === 'online';
  const isHost = !!session?.host;
  const code = session?.code;

  // ---------- HOST: siarkan perubahan + detak berkala ----------
  useEffect(() => {
    if (!code || !isHost || !online) return;
    const heartbeat = mode === 'server' ? 3000 : 9000;
    const maxQueue = mode === 'server' ? 15 : 5;
    const last = { id: '', playing: false, time: 0, at: 0 };

    const broadcast = () => {
      const L = latest.current;
      const now = performance.now();
      const msg: Msg = { t: 'state', from: myId, song: L.song ? slim(L.song) : null, queue: L.queue.slice(0, maxQueue).map(slim), playing: L.playing, time: L.time };
      together.send(msg);
      last.id = L.song?.id ?? ''; last.playing = L.playing; last.time = L.time; last.at = now;
    };

    const tick = () => {
      const L = latest.current;
      const now = performance.now();
      const id = L.song?.id ?? '';
      let changed = id !== last.id || L.playing !== last.playing;
      if (!changed) {
        const expected = last.playing ? last.time + (now - last.at) / 1000 : last.time;
        if (Math.abs(L.time - expected) > 1.6) changed = true; // host melompat (seek)
      }
      if (changed || now - last.at >= heartbeat) broadcast();
    };

    let reqT: ReturnType<typeof setTimeout> | null = null;
    const off = together.onMessage((m) => {
      if (m.t === 'req' && !reqT) reqT = setTimeout(() => { reqT = null; broadcast(); }, 300);
    });
    broadcast();
    const iv = setInterval(tick, 500);
    return () => { clearInterval(iv); off(); if (reqT) clearTimeout(reqT); };
  }, [code, isHost, online, mode]);

  // ---------- TAMU: ikuti host ----------
  const target = useRef<Target | null>(null);
  const applied = useRef({ playing: null as boolean | null, songId: '' });
  const lastSwitch = useRef(0);
  const lastSeek = useRef(0);
  const hostSeen = useRef(false);

  useEffect(() => {
    if (!code || isHost) { target.current = null; applied.current = { playing: null, songId: '' }; hostSeen.current = false; return; }

    const reconcile = () => {
      const T = target.current; if (!T) return;
      const L = latest.current;
      const now = performance.now();
      const A = api.current;
      if (L.song?.id !== T.song.id) {
        if (now - lastSwitch.current > 1800) {
          lastSwitch.current = now;
          applied.current = { playing: null, songId: T.song.id };
          A.playSong(T.song, T.queue.length ? T.queue : [T.song]);
        }
        return;
      }
      // Putar/jeda hanya mengikuti host saat statusnya berubah (tamu masih bisa jeda sendiri)
      if (applied.current.playing !== T.playing) {
        applied.current.playing = T.playing;
        if (T.playing && !L.playing) A.resume();
        else if (!T.playing && L.playing) A.pause();
      }
      const expected = T.playing ? T.time + (now - T.at) / 1000 : T.time;
      if ((T.playing ? L.playing : true) && Math.abs(L.time - expected) > 1.5 && now - lastSeek.current > 2000) {
        lastSeek.current = now;
        A.seek(Math.max(0, expected));
      }
    };

    const off = together.onMessage((m) => {
      if (m.t !== 'state' || !m.song) return;
      if (!hostSeen.current) { hostSeen.current = true; showToast('Tersambung ke host'); }
      target.current = { song: m.song, queue: m.queue, playing: m.playing, time: m.time, at: performance.now() };
      reconcile();
    });
    const iv = setInterval(reconcile, 1000);
    return () => { clearInterval(iv); off(); };
  }, [code, isHost, showToast]);

  return null;
};
