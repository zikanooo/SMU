import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'motion/react';
import {
  ChevronDown, Heart, Shuffle, Repeat, Repeat1, SkipBack, SkipForward, Play, Pause,
  MoreVertical, MicVocal, ListMusic, Share2, Moon, Trash2, Music2, ExternalLink, Link2,
} from 'lucide-react';
import { useMusic, useMusicTime } from '../context/MusicContext';
import { SyncedLyrics, LyricSyncPill } from './SyncedLyrics';
import { useTogether } from '../services/together';

type View = 'cover' | 'lyrics' | 'queue';
const SLEEP_STEPS = [0, 15, 30, 60];

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '0:00';
  return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
};


type Clock = { current: { t: number; at: number } };

/**
 * Progress bar pemutar: digambar langsung ke DOM tiap frame (tanpa re-render),
 * bisa digeser (pointer/touch), dan mendukung keyboard (panah ±5 detik).
 */
const Progress: React.FC<{
  duration: number; clock: Clock; playing: boolean; visible: boolean; onSeek: (t: number) => void;
}> = ({ duration, clock, playing, visible, onSeek }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLSpanElement>(null);
  const remRef = useRef<HTMLSpanElement>(null);
  const durRef = useRef(duration);
  const playRef = useRef(playing);
  const drag = useRef({ on: false, t: 0 });
  const [active, setActive] = useState(false);
  durRef.current = duration;
  playRef.current = playing;

  const paint = (t: number) => {
    const d = durRef.current;
    const tt = d > 0 ? Math.min(Math.max(t, 0), d) : Math.max(t, 0);
    const r = d > 0 ? tt / d : 0;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${r})`;
    if (thumbRef.current) thumbRef.current.style.left = `${r * 100}%`;
    if (elRef.current) elRef.current.textContent = formatTime(tt);
    if (remRef.current) remRef.current.textContent = d > 0 ? `-${formatTime(d - tt)}` : '--:--';
  };
  const now = () => {
    const { t, at } = clock.current;
    return playRef.current ? t + (performance.now() - at) / 1000 : t;
  };

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      if (!drag.current.on) paint(now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const timeAt = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
    return r * durRef.current;
  };
  const commit = (t: number) => {
    clock.current = { t, at: performance.now() }; // cegah kedip ke posisi lama sebelum state ter-update
    paint(t);
    onSeek(t);
  };

  const onDown = (e: React.PointerEvent) => {
    if (durRef.current <= 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { on: true, t: timeAt(e.clientX) };
    setActive(true);
    paint(drag.current.t);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    drag.current.t = timeAt(e.clientX);
    paint(drag.current.t);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    drag.current.on = false;
    setActive(false);
    commit(timeAt(e.clientX));
  };
  const onCancel = () => { drag.current.on = false; setActive(false); };
  const onKey = (e: React.KeyboardEvent) => {
    const d = durRef.current;
    if (d <= 0) return;
    const cur = now();
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + 5;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = cur - 5;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = d - 0.5;
    if (next === null) return;
    e.preventDefault();
    commit(Math.min(Math.max(next, 0), d));
  };

  return (
    <div>
      <div ref={barRef} className="pbar" data-active={active} role="slider" tabIndex={0}
        aria-label="Posisi lagu" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(clock.current.t)}
        aria-valuetext={`${formatTime(clock.current.t)} dari ${formatTime(duration)}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onKeyDown={onKey}>
        <div className="pbar-track">
          <div ref={fillRef} className="pbar-fill" />
          <div ref={thumbRef} className="pbar-thumb" />
        </div>
      </div>
      <div className="flex justify-between text-[12.5px] leading-none pbar-time text-white/75 font-medium mt-1">
        <span ref={elRef}>0:00</span><span ref={remRef}>--:--</span>
      </div>
    </div>
  );
};

export const FullPlayer: React.FC = () => {
  const {
    currentSong, isPlaying, queue, queueIndex, repeatMode, isShuffle,
    lyrics, isPlayerExpanded, togglePlay, pause, seek, nextSong, prevSong,
    toggleFavorite, isFavorite, toggleRepeat, toggleShuffle, playSong, removeFromQueue,
    clearQueue, setIsPlayerExpanded, showToast, openSongMenu, openArtist, glassSettings,
  } = useMusic();
  const { currentTime, duration, activeLyricIndex } = useMusicTime();

  const [view, setView] = useState<View>('cover');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sleepMin, setSleepMin] = useState(0);
  const dragControls = useDragControls();
  const { session: tSession } = useTogether();

  const blurOn = glassSettings.blurEnabled;

  const lines = lyrics?.syncedLyrics ?? [];
  const lyricsSource = lyrics?.source;
  const hasSynced = lines.length > 0;
  const plain = lyrics?.plainLyrics ?? '';

  // Lirik penuh dikelompokkan per bait (dipisah baris kosong)
  const stanzas = useMemo(() => {
    const out: { text: string; idx: number }[][] = [];
    let cur: { text: string; idx: number }[] = [];
    const flush = () => { if (cur.length) out.push(cur); cur = []; };
    if (hasSynced) {
      lines.forEach((l, idx) => { if (!l.text.trim()) flush(); else cur.push({ text: l.text.trim(), idx }); });
    } else {
      plain.split(/\r?\n/).forEach((t) => { if (!t.trim()) flush(); else cur.push({ text: t.trim(), idx: -1 }); });
    }
    flush();
    return out;
  }, [lines, hasSynced, plain]);

  // Sleep timer
  useEffect(() => {
    if (!sleepMin) return;
    const t = setTimeout(() => {
      pause();
      setSleepMin(0);
      showToast('Waktu tidur: musik dihentikan');
    }, sleepMin * 60 * 1000);
    return () => clearTimeout(t);
  }, [sleepMin, pause, showToast]);

  // Reset view per lagu baru? tetap di view yang sama; tutup menu saat pemutar ditutup
  useEffect(() => { if (!isPlayerExpanded) setMenuOpen(false); }, [isPlayerExpanded]);

  // Jam yang diekstrapolasi antar update pemutar, dipakai bar progres (Progress)
  const clock = useRef({ t: 0, at: 0 });
  useEffect(() => { clock.current = { t: currentTime, at: performance.now() }; }, [currentTime]);

  if (!currentSong) return null;

  const totalDur = duration > 0 ? duration : currentSong.durationSeconds || 0;
  const fav = isFavorite(currentSong.id);
  const artistNames = currentSong.artists.map((a) => a.name).join(', ');
  const ytLink = `https://music.youtube.com/watch?v=${currentSong.videoId || currentSong.id}`;

  const onDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) setIsPlayerExpanded(false);
  };

  const share = async () => {
    const data = { title: currentSong.title, text: `${currentSong.title} – ${artistNames}`, url: ytLink };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(ytLink); showToast('Tautan disalin'); }
    } catch {}
  };
  const cycleSleep = () => {
    const next = SLEEP_STEPS[(SLEEP_STEPS.indexOf(sleepMin) + 1) % SLEEP_STEPS.length];
    setSleepMin(next);
    showToast(next ? `Waktu tidur ${next} menit` : 'Waktu tidur mati');
  };
  const toggleView = (v: View) => setView((cur) => (cur === v ? 'cover' : v));

  const bottomBtn = (id: string, label: string, icon: React.ReactNode, onClick: () => void, active = false) => (
    <button key={id} onClick={onClick} className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
      <span className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
        active ? 'bg-accent text-ink border-accent' : 'bg-white/10 text-white border-white/15'
      }`}>{icon}</span>
      <span className="text-[11px] font-medium text-white/75 tracking-wide">{label}</span>
    </button>
  );

  return (
    <AnimatePresence>
      {isPlayerExpanded && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 300 }}
          drag="y"
          dragListener={false}
          dragControls={dragControls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.02, bottom: 0.6 }}
          onDragEnd={onDragEnd}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--bg)] text-[#f4eceb]"
        >
          {/* Backdrop: warna cover di atas, memudar ke hitam di bawah */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 transition-colors duration-1000"
              style={{ background: 'linear-gradient(180deg, hsl(var(--hue) 78% 46% / 0.98) 0%, hsl(calc(var(--hue) + var(--hue-shift)) 70% 34% / 0.95) 45%, hsl(calc(var(--hue) + var(--hue-shift)) 55% 16% / 0.96) 100%)' }} />
            <div className="absolute -left-24 top-[14%] w-80 h-80 rounded-full opacity-45" style={{ background: 'radial-gradient(circle, hsl(var(--hue) 70% 50%) 0%, transparent 68%)' }} />
          </div>

          {/* Header */}
          <div className={`relative z-10 px-5 pb-1 shrink-0 touch-none ${view === 'lyrics' ? 'pt-2' : 'pt-3'}`} onPointerDown={(e) => dragControls.start(e)}>
            <div className="mx-auto w-10 h-1 bg-white/30 rounded-full mb-2" />
            <div className={`flex items-center gap-3 ${view === 'lyrics' ? 'h-8' : 'h-11'}`}>
              <button onClick={() => setIsPlayerExpanded(false)} onPointerDown={(e) => e.stopPropagation()}
                className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-[#f0e6e5] active:scale-90" aria-label="Tutup">
                <ChevronDown size={26} />
              </button>
              {view !== 'lyrics' && (
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase mb-0.5">{tSession ? (tSession.host ? 'Hosting listen together' : 'Listening together') : 'Memutar dari'}</p>
                  <p className="text-[15px] font-semibold truncate leading-[1.3] text-accent">Mix {currentSong.title}</p>
                </div>
              )}
            </div>
          </div>

          {/* Center */}
          <div className={`relative z-10 flex-1 min-h-0 w-full max-w-lg md:max-w-xl mx-auto ${view === 'lyrics' ? 'px-3' : 'px-5'}`}>
            <AnimatePresence mode="wait" initial={false}>
              {view === 'cover' && (
                <motion.div key="cover" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
                  className="h-full flex flex-col items-center justify-center">
                  <div className="relative w-full flex justify-center pb-5">
                    <div
                      className="relative w-[min(86vw,380px,44dvh)] aspect-square">
                      <div className="w-full h-full">
                        <div className="absolute -inset-4 rounded-[42px] opacity-40" style={{ background: 'radial-gradient(closest-side, var(--accent) 0%, transparent 100%)' }} />
                        <div className={`relative w-full h-full rounded-[32px] overflow-hidden bg-white/10 border border-white/15 shadow-[0_30px_60px_-18px_rgba(0,0,0,0.85)] flex items-center justify-center`}>
                          <img src={currentSong.thumbnail} alt={currentSong.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" draggable={false} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full flex items-center gap-3 mt-1">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[22px] font-bold leading-[1.25] qt-clamp2">{currentSong.title}</h2>
                      <button onClick={() => openArtist({ id: currentSong.artists[0]?.id, name: currentSong.artists[0]?.name })} className="block max-w-full text-left text-[15px] leading-[1.35] font-medium text-white/65 truncate active:opacity-70 mt-1">{artistNames}</button>
                    </div>
                    <button onClick={() => toggleFavorite(currentSong)} className="w-11 h-11 shrink-0 rounded-full bg-white/[0.14] border border-white/15 flex items-center justify-center active:scale-90 transition-transform" aria-label={fav ? 'Hapus favorit' : 'Tambah favorit'}>
                      <motion.span key={String(fav)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }}>
                        <Heart size={20} className={fav ? 'text-accent fill-accent' : 'text-[#f0e6e5]'} />
                      </motion.span>
                    </button>
                    <button onClick={() => openSongMenu(currentSong)} className="w-11 h-11 shrink-0 rounded-full bg-white/[0.14] border border-white/15 flex items-center justify-center active:scale-90 transition-transform" aria-label="Menu">
                      <MoreVertical size={21} className="text-[#f0e6e5]" />
                    </button>
                  </div>
                </motion.div>
              )}

              {view === 'lyrics' && (
                <motion.div key="lyrics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="h-full flex flex-col">
                  {hasSynced ? (
                    <>
                      <SyncedLyrics />
                      <LyricSyncPill />
                    </>
                  ) : (
                  <div className="relative flex-1 overflow-y-auto no-scrollbar lyrics-mask -mx-5 px-6">
                    {stanzas.length ? (
                      <div className="pt-[10vh] pb-[30vh] space-y-8 text-center">
                        {stanzas.map((st, si) => (
                          <div key={si} className="space-y-2">
                            {st.map((l, li) => (
                              <p key={li} className="text-[clamp(22px,5.8vw,28px)] leading-[1.3] font-extrabold tracking-tight text-white/85">{l.text}</p>
                            ))}
                          </div>
                        ))}
                        {lyricsSource && <p className="text-[11px] text-white/35 pt-2">Lirik dari {lyricsSource} · tanpa sinkronisasi waktu</p>}
                      </div>
                    ) : lyrics ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-muted gap-3">
                        <Music2 size={32} />
                        <p className="text-sm">Lirik tidak tersedia untuk lagu ini</p>
                      </div>
                    ) : (
                      <div className="pt-[16vh] space-y-7 flex flex-col items-center" aria-label="Memuat lirik">
                        {[70, 88, 56, 78].map((w, i) => (
                          <div key={i} className="lyric-skel" style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    )}
                  </div>
                  )}
                </motion.div>
              )}

              {view === 'queue' && (
                <motion.div key="queue" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="h-full flex flex-col">
                  <div className="flex items-center justify-between pb-2 shrink-0">
                    <span className="text-[17px] font-bold">Antrean · {queue.length}</span>
                    <button onClick={clearQueue} className="text-[12.5px] text-rose-300 flex items-center gap-1"><Trash2 size={13} /> Bersihkan</button>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar pb-3">
                    {queue.map((song, idx) => {
                      const cur = idx === queueIndex;
                      return (
                        <div key={`${song.id}-${idx}`} onClick={() => playSong(song)}
                          className={`flex items-center gap-3 p-2 rounded-2xl cursor-pointer ${cur ? 'bg-white/10' : ''}`}>
                          <img src={song.thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover bg-white/10" referrerPolicy="no-referrer" />
                          <div className="min-w-0 flex-1">
                            <p className={`text-[14.5px] font-semibold truncate ${cur ? 'text-accent' : ''}`}>{song.title}</p>
                            <p className="text-[12.5px] text-muted truncate">{song.artists.map((a) => a.name).join(', ')}</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeFromQueue(idx); }} className="p-2 text-muted active:scale-90" aria-label="Hapus"><Trash2 size={16} /></button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="relative z-10 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] w-full max-w-lg mx-auto shrink-0">
            {view === 'lyrics' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="flex items-center gap-3 mt-2 mb-3">
                <img src={currentSong.thumbnail} alt="" className="w-12 h-12 rounded-xl object-cover shadow-lg bg-white/10 shrink-0" referrerPolicy="no-referrer" />
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-bold truncate leading-[1.3]">{currentSong.title}</p>
                  <p className="text-[13.5px] text-white/65 truncate mt-0.5">{artistNames}</p>
                </div>
                <button onClick={() => toggleFavorite(currentSong)} className="w-11 h-11 rounded-full bg-white/[0.14] flex items-center justify-center active:scale-90 transition-transform" aria-label={fav ? 'Hapus favorit' : 'Tambah favorit'}>
                  <motion.span key={String(fav)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 12 }}>
                    <Heart size={20} className={fav ? 'text-accent fill-accent' : 'text-[#f0e6e5]'} />
                  </motion.span>
                </button>
                <button onClick={() => openSongMenu(currentSong)} className="w-11 h-11 rounded-full bg-white/[0.14] flex items-center justify-center active:scale-90 transition-transform" aria-label="Menu">
                  <MoreVertical size={21} className="text-[#f0e6e5]" />
                </button>
              </motion.div>
            )}

            <div className="mb-3">
              <Progress duration={totalDur} clock={clock} playing={isPlaying} visible={isPlayerExpanded} onSeek={seek} />
            </div>

            <div className="flex items-center justify-between mb-4 px-1">
              <button onClick={toggleShuffle} className={`p-2.5 ${isShuffle ? 'text-accent' : 'text-[#c9bfc2]'}`} aria-label="Acak"><Shuffle size={24} /></button>
              <button onClick={prevSong} className="p-2 text-white active:scale-90 transition-transform" aria-label="Sebelumnya"><SkipBack size={30} className="fill-current" /></button>
              <button onClick={togglePlay} className="p-1 text-white active:scale-90 transition-transform" aria-label={isPlaying ? 'Jeda' : 'Putar'}>
                <span className="w-[72px] h-[72px] rounded-full bg-white text-[#1a1416] shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)] flex items-center justify-center">
                {isPlaying ? <Pause size={30} className="fill-current" /> : <Play size={30} className="fill-current ml-1" />}
              </span>
              </button>
              <button onClick={nextSong} className="p-2 text-white active:scale-90 transition-transform" aria-label="Berikutnya"><SkipForward size={30} className="fill-current" /></button>
              <button onClick={toggleRepeat} className={`p-2.5 ${repeatMode !== 'off' ? 'text-accent' : 'text-[#c9bfc2]'}`} aria-label="Ulangi">
                {repeatMode === 'one' ? <Repeat1 size={24} /> : <Repeat size={24} />}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 px-1 pt-0.5 justify-items-center">
              {bottomBtn('lyrics', 'Lirik', <MicVocal size={22} />, () => toggleView('lyrics'), view === 'lyrics')}
              {bottomBtn('queue', 'Antrean', <ListMusic size={22} />, () => toggleView('queue'), view === 'queue')}
              {bottomBtn('share', 'Bagikan', <Share2 size={21} />, share)}
              {bottomBtn('sleep', sleepMin ? `${sleepMin} mnt` : 'Waktu tidur', <Moon size={21} />, cycleSleep, sleepMin > 0)}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
