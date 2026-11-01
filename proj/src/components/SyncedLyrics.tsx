import React, { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useMusic, useMusicTime } from '../context/MusicContext';
import { lyricOffset, OFFSET_MIN, OFFSET_MAX } from '../services/lyricsSync';

/**
 * Lirik sinkron ala Apple Music:
 *  - baris aktif besar & tebal, tiap KATA menyala bertahap (gradien lembut) + sedikit terangkat & bercahaya
 *  - baris lain meredup, mengecil, dan ter-blur sesuai jarak, dengan efek "gelombang" (stagger)
 *  - scroll memakai fisika pegas (spring) agar mengalir, bukan loncat
 *  - titik napas saat jeda instrumental
 */

const LEAD = 0.1;            // mendahului sedikit agar terasa pas
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

type Weights = { idx: number; cum: number[]; total: number; len: number[] };

const lineOpacity = (d: number) => {
  if (d === 0) return 1;
  if (d > 0) return d === 1 ? 0.55 : d === 2 ? 0.42 : d === 3 ? 0.34 : 0.28;
  return d === -1 ? 0.36 : d === -2 ? 0.28 : 0.22;
};

export const SyncedLyrics: React.FC = () => {
  const { lyrics, isPlaying, seek, glassSettings, currentSong } = useMusic();
  const { currentTime, activeLyricIndex } = useMusicTime();
  const lines = lyrics?.syncedLyrics ?? [];
  const source = lyrics?.source;
  const blurOn = glassSettings.blurEnabled;

  const boxRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const userUntil = useRef(0);
  const clock = useRef({ t: 0, at: 0 });
  const weights = useRef<Weights | null>(null);
  const spring = useRef({ pos: 0, vel: 0, target: 0, last: 0, raf: 0, running: false });

  useEffect(() => { clock.current = { t: currentTime, at: performance.now() }; }, [currentTime]);

  // ---------- scroll pegas ----------
  const targetFor = useCallback((idx: number) => {
    const c = boxRef.current;
    const el = lineRefs.current[Math.max(idx, 0)];
    if (!c || !el) return null;
    return Math.max(0, el.offsetTop - c.clientHeight * 0.26);
  }, []);

  const scrollTo = useCallback((target: number, instant = false) => {
    const c = boxRef.current;
    const s = spring.current;
    if (!c) return;
    if (instant) {
      cancelAnimationFrame(s.raf); s.running = false;
      c.scrollTop = target; s.pos = target; s.vel = 0; s.target = target;
      return;
    }
    s.target = target;
    if (s.running) return;
    s.running = true; s.pos = c.scrollTop; s.vel = 0; s.last = performance.now();
    const K = 150, D = 2 * Math.sqrt(K) * 0.97;
    const step = (now: number) => {
      const dt = Math.min(0.04, (now - s.last) / 1000); s.last = now;
      const a = K * (s.target - s.pos) - D * s.vel;
      s.vel += a * dt; s.pos += s.vel * dt;
      c.scrollTop = s.pos;
      if (Math.abs(s.target - s.pos) < 0.5 && Math.abs(s.vel) < 6) { c.scrollTop = s.target; s.running = false; return; }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, []);

  const pauseAuto = useCallback(() => {
    userUntil.current = Date.now() + 3000;
    cancelAnimationFrame(spring.current.raf); spring.current.running = false;
  }, []);

  // lagu/lirik baru atau baru dibuka -> langsung ke posisi (tanpa animasi)
  useLayoutEffect(() => {
    userUntil.current = 0;
    const t = targetFor(activeLyricIndex);
    if (t != null) scrollTo(t, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyrics, currentSong?.id]);

  // pindah baris -> scroll mengalir
  useEffect(() => {
    if (Date.now() < userUntil.current) return;
    const t = targetFor(activeLyricIndex);
    if (t != null) scrollTo(t);
  }, [activeLyricIndex, targetFor, scrollTo]);

  useEffect(() => () => cancelAnimationFrame(spring.current.raf), []);

  // ---------- animasi isi per kata (60fps) ----------
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { t, at } = clock.current;
      const now = (isPlaying ? t + (performance.now() - at) / 1000 : t) + lyricOffset.get();
      const idx = activeLyricIndex;
      const cur = lines[idx];
      if (cur) {
        const next = lines[idx + 1];
        const end = next ? next.time : cur.time + 4;
        if (!cur.text.trim()) {
          // jeda instrumental: 3 titik terisi bertahap
          const p = clamp01((now - cur.time) / Math.max(0.5, end - cur.time));
          dotRefs.current.forEach((d, i) => {
            if (!d) return;
            const f = clamp01(p * 3.2 - i * 0.9);
            d.style.opacity = String(0.28 + 0.72 * f);
            d.style.transform = `scale(${0.8 + 0.35 * f + Math.sin(now * 2.2 + i) * 0.04})`;
          });
        } else {
          let w = weights.current;
          if (!w || w.idx !== idx) {
            const len = cur.text.trim().split(/\s+/).map((x) => x.length + 1);
            const cum: number[] = []; let acc = 0;
            len.forEach((l) => { cum.push(acc); acc += l; });
            w = weights.current = { idx, cum, total: acc, len };
          }
          const span = Math.max(0.4, Math.min(end - cur.time - 0.25, 8));
          const prog = clamp01((now + LEAD - cur.time) / span);
          for (let i = 0; i < w.len.length; i++) {
            const el = wordRefs.current[i];
            if (!el) continue;
            const s = w.cum[i] / w.total, e = (w.cum[i] + w.len[i]) / w.total;
            const p = clamp01((prog - s) / (e - s));
            el.style.setProperty('--a', `${(p * 120 - 20).toFixed(1)}%`);
            // kata yang sedang dinyanyikan: terangkat + bercahaya, lalu turun lembut
            const hot = p > 0 && p < 1 ? Math.sin(p * Math.PI) : p >= 1 ? 0.0 : 0;
            el.style.transform = hot > 0.01 ? `translateY(${(-2.5 * hot).toFixed(2)}px)` : '';
            el.style.filter = hot > 0.05 ? `drop-shadow(0 0 ${(10 * hot).toFixed(1)}px rgba(255,255,255,${(0.6 * hot).toFixed(2)}))` : '';
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, activeLyricIndex, isPlaying]);

  const act = activeLyricIndex;

  return (
    <div
      ref={boxRef}
      onWheel={pauseAuto}
      onTouchStart={pauseAuto}
      onTouchMove={pauseAuto}
      className="relative flex-1 overflow-y-auto no-scrollbar lyrics-mask -mx-5 px-6"
    >
      <div className="pt-[12vh] pb-[48vh]">
        {lines.map((line, idx) => {
          const d = idx - act;                  // <0 sudah lewat, >0 akan datang
          const active = d === 0;
          const gap = !line.text.trim();
          const dist = Math.abs(d);
          const blur = blurOn && !active && dist <= 6 ? Math.min(dist * 1.1, 5) : 0;
          const delay = d > 0 ? Math.min(d, 6) * 40 : 0; // efek gelombang ke bawah
          return (
            <div
              key={idx}
              ref={(el) => { lineRefs.current[idx] = el; }}
              onClick={() => { userUntil.current = 0; seek(line.time); }}
              className="lyric-line2 cursor-pointer"
              data-active={active ? '1' : '0'}
              style={{
                opacity: lineOpacity(d),
                transform: `scale(${active ? 1 : 0.92})`,
                filter: blur ? `blur(${blur}px)` : 'none',
                transitionDelay: `${delay}ms`,
              }}
            >
              {gap ? (
                active ? (
                  <div className="flex gap-2.5 h-9 items-center">
                    {[0, 1, 2].map((i) => (
                      <span key={i} ref={(el) => { dotRefs.current[i] = el; }} className="w-3 h-3 rounded-full bg-white inline-block" style={{ opacity: 0.28 }} />
                    ))}
                  </div>
                ) : <div className="h-4" />
              ) : active ? (
                <p className="lyric-text">
                  {line.text.trim().split(/\s+/).map((w, i, arr) => (
                    <React.Fragment key={i}>
                      <span ref={(el) => { wordRefs.current[i] = el; }} className="lw">{w}</span>
                      {i < arr.length - 1 ? ' ' : ''}
                    </React.Fragment>
                  ))}
                </p>
              ) : (
                <p className="lyric-text">{line.text}</p>
              )}
            </div>
          );
        })}
        {source && <p className="text-[11px] text-white/35 pt-12">Lirik dari {source}</p>}
      </div>
    </div>
  );
};

/** Penyesuaian waktu lirik: geser lebih cepat / lebih lambat bila terasa tidak pas di perangkat ini. */
export const LyricSyncPill: React.FC = () => {
  const off = useSyncExternalStore(lyricOffset.subscribe, lyricOffset.get);
  const step = (d: number) => lyricOffset.set(off + d);
  const btn = 'w-8 h-8 rounded-full bg-white/10 text-white text-[17px] font-semibold active:scale-90 disabled:opacity-30';
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-white/70" role="group" aria-label="Penyesuaian sinkron lirik">
      <button className={btn} aria-label="Lirik lebih lambat" disabled={off <= OFFSET_MIN} onClick={() => step(-0.1)}>−</button>
      <button className="min-w-[96px] text-center font-mono" onClick={() => lyricOffset.set(0)} aria-label="Setel ulang sinkron">
        Sinkron {off > 0 ? '+' : ''}{off.toFixed(1)}s
      </button>
      <button className={btn} aria-label="Lirik lebih cepat" disabled={off >= OFFSET_MAX} onClick={() => step(0.1)}>+</button>
    </div>
  );
};
