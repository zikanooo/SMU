import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { lyricOffset } from '../services/lyricsSync';
import { Song, LyricsData, TabType, RepeatMode, GlassSettings, Playlist, Artist } from '../types/music';
import { MusicApi } from '../services/api';
import { useListeningTracker } from '../services/stats';

/** Normalisasi judul/artis untuk membandingkan dua upload dari lagu yang sama. */
const normTitle = (t: string) =>
  (t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[([].*?[)\]]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

interface MusicContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  queue: Song[];
  queueIndex: number;
  favorites: Song[];
  history: Song[];
  repeatMode: RepeatMode;
  isShuffle: boolean;
  activeTab: TabType;
  isPlayerExpanded: boolean;
  lyrics: LyricsData | null;
  activeLyricIndex: number;
  glassSettings: GlassSettings;
  playSong: (song: Song, newQueue?: Song[]) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seek: (seconds: number) => void;
  nextSong: () => void;
  prevSong: () => void;
  toggleFavorite: (song: Song) => void;
  isFavorite: (songId: string) => boolean;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  clearHistory: () => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setActiveTab: (tab: TabType) => void;
  setIsPlayerExpanded: (open: boolean) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  updateGlassSettings: (settings: Partial<GlassSettings>) => void;
  playlists: Playlist[];
  subscriptions: Artist[];
  songMenu: Song | null;
  artistView: { id?: string; name: string } | null;
  openSongMenu: (song: Song) => void;
  closeSongMenu: () => void;
  openArtist: (a: { id?: string; name: string }) => void;
  closeArtist: () => void;
  playNext: (song: Song) => void;
  createPlaylist: (name: string, song?: Song) => string;
  importPlaylist: (name: string, songs: Song[]) => string;
  addToPlaylist: (playlistId: string, song: Song) => void;
  removeFromPlaylist: (playlistId: string, songId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  toggleSubscribe: (artist: Artist) => void;
  isSubscribed: (key: string) => boolean;
}

const DEFAULT_GLASS_SETTINGS: GlassSettings = {
  theme: 'auralys',
  blurIntensity: 28,
  refractionStrength: 18,
  meshSpeed: 1.0,
  dynamicMesh: true,
  hapticFeedback: true,
  audioQuality: 'high',
  blurEnabled: true,
  dynamicTheme: true,
  dynamicIcon: true,
  highRefresh: true,
  landscape: false,
  uiStyle: 'glass',
  newMiniPlayer: true,
};

// WAV hening 0,1 dtk untuk membuka kunci autoplay elemen <audio>
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

// Konteks dipisah: waktu lagu berubah ~4x/detik, jangan sampai seluruh aplikasi ikut render ulang.
type MusicCore = Omit<MusicContextType, 'currentTime' | 'duration' | 'activeLyricIndex'>;
type MusicTime = { currentTime: number; duration: number; activeLyricIndex: number };
const MusicContext = createContext<MusicCore | undefined>(undefined);
const MusicTimeContext = createContext<MusicTime>({ currentTime: 0, duration: 0, activeLyricIndex: -1 });

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Persistence states
  const [favorites, setFavorites] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('liquid_music_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('liquid_music_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const load = <T,>(key: string): T[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const [playlists, setPlaylists] = useState<Playlist[]>(() => load<Playlist>('auralys_playlists'));
  const [subscriptions, setSubscriptions] = useState<Artist[]>(() => load<Artist>('auralys_subs'));
  const [songMenu, setSongMenu] = useState<Song | null>(null);
  const [artistView, setArtistView] = useState<{ id?: string; name: string } | null>(null);
  useEffect(() => { try { localStorage.setItem('auralys_playlists', JSON.stringify(playlists)); } catch {} }, [playlists]);
  useEffect(() => { try { localStorage.setItem('auralys_subs', JSON.stringify(subscriptions)); } catch {} }, [subscriptions]);

  const [glassSettings, setGlassSettings] = useState<GlassSettings>(() => {
    try {
      const saved = localStorage.getItem('liquid_glass_settings');
      return saved ? { ...DEFAULT_GLASS_SETTINGS, ...JSON.parse(saved) } : DEFAULT_GLASS_SETTINGS;
    } catch {
      return DEFAULT_GLASS_SETTINGS;
    }
  });

  // Player states
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    try {
      const t = new URLSearchParams(location.search).get('tab');
      return (['home', 'explore', 'search', 'library', 'profile', 'together'] as const).find((x) => x === t) ?? 'home';
    } catch { return 'home'; }
  });
  const [isPlayerExpanded, setIsPlayerExpanded] = useState<boolean>(false);
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Hitung waktu mendengarkan (statistik & leaderboard)
  useListeningTracker(currentSong, isPlaying);

  const toastTimeoutRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);
  const isUsingYTRef = useRef<boolean>(true);
  const pendingVideoIdRef = useRef<string | null>(null);
  const currentSongRef = useRef<Song | null>(null);
  const queueRef = useRef<Song[]>([]);
  const nextRef = useRef<() => void>(() => {});
  const prevRef = useRef<() => void>(() => {});
  const endRef = useRef<() => void>(() => {});
  const streamRef = useRef<(s: Song) => void>(() => {});
  const unplayableRef = useRef<() => void>(() => {});
  const failRef = useRef(0);
  const lyricsRef = useRef<LyricsData | null>(null);
  const timeRef = useRef(0);
  const pubRef = useRef(-1);
  const triedIdsRef = useRef<Set<string>>(new Set());
  const lastYtErrRef = useRef<number | null>(null);          // kode error iframe YouTube terakhir (101/150/153 = embed dilarang)
  const altTriedRef = useRef<Set<string>>(new Set());        // lagu yang sudah dicarikan versi identik
  const looseTriedRef = useRef<Set<string>>(new Set());      // lagu yang sudah dicarikan versi mirip
  const streamWatchRef = useRef<any>(null);                    // timer: stream server tidak kunjung berbunyi -> anggap gagal
  const autoAltRef = useRef(false);                          // true = playSong dipanggil otomatis (bukan ketukan pengguna)
  // Index lirik dihitung tiap tick (presisi), state waktu dipublikasi 4x/detik (hemat render)
  const publishTime = (t: number) => {
    timeRef.current = t;
    const ls = lyricsRef.current?.syncedLyrics;
    let idx = -1;
    if (ls && ls.length) {
      // pencarian biner + offset sinkron; dipanggil ~10x/detik sehingga harus murah
      const tt = t + lyricOffset.get() + 0.05;
      let lo = 0, hi = ls.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (ls[mid].time <= tt) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    }
    setActiveLyricIndex(idx);
    if (Math.abs(t - pubRef.current) >= 0.25) { pubRef.current = t; setCurrentTime(t); }
  };
  const streamTriedRef = useRef<string | null>(null);
  const ytFailedRef = useRef(false);
  const relatedForRef = useRef<string | null>(null);
  // --- Putar di latar belakang ---
  const wantPlayRef = useRef(false);          // niat pengguna: ingin lagu berbunyi
  const handoffRef = useRef(false);           // sedang pindah YouTube -> stream audio
  const handoffFnRef = useRef<() => void>(() => {});

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  // Initialize YouTube IFrame Player
  useEffect(() => {
    const initYT = () => {
      if (window.YT && window.YT.Player && !ytPlayerRef.current) {
        try {
          ytPlayerRef.current = new window.YT.Player('yt-audio-player', {
            height: '200',
            width: '200',
            ...(currentSong?.videoId ? { videoId: currentSong.videoId } : {}),
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              rel: 0,
              playsinline: 1,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                ytReadyRef.current = true;
                if (pendingVideoIdRef.current) {
                  ytPlayerRef.current.loadVideoById(pendingVideoIdRef.current);
                  ytPlayerRef.current.playVideo();
                  pendingVideoIdRef.current = null;
                }
              },
              onStateChange: (event: any) => {
                // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
                // Setelah pindah ke stream audio (latar belakang), abaikan event dari iframe YouTube
                if (!isUsingYTRef.current) return;
                if (event.data === 2 && document.hidden && wantPlayRef.current) {
                  // Browser menjeda iframe saat app disembunyikan -> lanjutkan lewat stream audio
                  handoffFnRef.current();
                  return;
                }
                if (event.data === 1) {
                  failRef.current = 0;
                  setIsPlaying(true);
                  const dur = ytPlayerRef.current?.getDuration?.();
                  if (dur && !isNaN(dur) && dur > 1) setDuration(dur);
                } else if (event.data === 2) {
                  setIsPlaying(false);
                } else if (event.data === 0) {
                  endRef.current();
                }
              },
              // 2/5/100/101/150 = tidak bisa diputar / embed dilarang -> fallback stream server
              onError: (e: any) => { if (!isUsingYTRef.current) return; lastYtErrRef.current = typeof e?.data === 'number' ? e.data : null; unplayableRef.current(); },
            },
          });
        } catch (e) {
          console.warn('YT player initialization notice:', e);
        }
      }
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      window.onYouTubeIframeAPIReady = initYT;
    }
    // Skrip YouTube diblokir / lambat -> langsung pakai stream server
    const ytWatchdog = setTimeout(() => {
      if (ytReadyRef.current) return;
      ytFailedRef.current = true;
      if (pendingVideoIdRef.current && currentSongRef.current) {
        pendingVideoIdRef.current = null;
        streamRef.current(currentSongRef.current);
      }
    }, 5000);

    // Interval time tracker for YouTube player
    const tracker = setInterval(() => {
      // Mode stream <audio>: 'timeupdate' hanya ~4x/detik -> baca langsung tiap 100ms agar lirik tidak telat
      if (!isUsingYTRef.current) {
        const a = audioRef.current;
        if (a && !a.paused && !a.seeking) publishTime(a.currentTime);
        return;
      }
      if (isUsingYTRef.current && ytPlayerRef.current && ytReadyRef.current) {
        try {
          const want = currentSongRef.current?.videoId || currentSongRef.current?.id;
          const have = ytPlayerRef.current.getVideoData?.()?.video_id;
          const stale = !!(want && have && want !== have); // masih video sebelumnya
          const cur = ytPlayerRef.current.getCurrentTime?.();
          const dur = ytPlayerRef.current.getDuration?.();
          if (!stale && typeof cur === 'number' && !isNaN(cur)) {
            publishTime(cur);
          }
          if (!stale && typeof dur === 'number' && !isNaN(dur) && dur > 1) {
            setDuration((prev) => (Math.abs(prev - dur) > 0.5 ? dur : prev));
          }
        } catch {}
      }
    }, 100);

    return () => {
      clearTimeout(ytWatchdog);
      clearInterval(tracker);
    };
  }, []);

  // Initialize standard HTML5 Audio Element as dual fallback
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;
    audio.volume = volume;

    const onTimeUpdate = () => {
      if (!isUsingYTRef.current) publishTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      if (!isUsingYTRef.current && audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => {
      if (!isUsingYTRef.current) setIsPlaying(true);
    };
    const onPause = () => {
      if (!isUsingYTRef.current) setIsPlaying(false);
    };
    const onEnded = () => {
      if (!isUsingYTRef.current) endRef.current();
    };
    const onError = () => {
      if (handoffRef.current) {
        // Stream gagal saat pindah ke latar belakang: kembali ke YouTube, jangan lompat lagu
        handoffRef.current = false;
        isUsingYTRef.current = true;
        setIsPlaying(false);
        return;
      }
      if (!isUsingYTRef.current && audio.getAttribute('src')) unplayableRef.current();
    };
    const onPlaying = () => { handoffRef.current = false; failRef.current = 0; if (streamWatchRef.current) { clearTimeout(streamWatchRef.current); streamWatchRef.current = null; } };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('playing', onPlaying);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('playing', onPlaying);
      audio.pause();
    };
  }, []);

  // Musik tetap menyala saat keluar dari web / APK:
  // iframe YouTube dijeda browser begitu halaman tersembunyi, sedangkan <audio> + Media Session
  // boleh terus berbunyi. Jadi saat app disembunyikan kita pindah ke stream audio di detik yang sama.
  useEffect(() => {
    const onVis = () => { if (document.hidden) handoffFnRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    // Buka kunci elemen <audio> pada sentuhan pertama (iOS/Android mewajibkan gestur pengguna)
    const unlock = () => {
      const a = audioRef.current;
      if (!a) return;
      if (!a.getAttribute('src')) {
        a.src = SILENT_WAV;
        a.play().then(() => { if (a.getAttribute('src') === SILENT_WAV) { a.pause(); a.removeAttribute('src'); a.load(); } }).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
      window.removeEventListener('pointerdown', unlock, { capture: true } as any);
    };
  }, []);

  // Sync favorites & history to localStorage
  // Aman: penyimpanan bisa penuh / diblokir (mode privat) -> jangan sampai merobohkan seluruh UI.
  // Saat pemulihan cadangan berlangsung, jangan timpa data yang baru diimpor.
  const persist = (key: string, value: unknown) => {
    if ((window as any).__auralysRestoring) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* abaikan */ }
  };
  useEffect(() => { persist('liquid_music_favorites', favorites); }, [favorites]);
  useEffect(() => { persist('liquid_music_history', history); }, [history]);
  useEffect(() => { persist('liquid_glass_settings', glassSettings); }, [glassSettings]);

  // Sync lyrics when currentSong changes (lirik asli; abaikan respons usang)
  useEffect(() => {
    const vid = currentSong?.videoId || currentSong?.id;
    if (!vid) {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    setLyrics(null);
    MusicApi.getLyrics(vid).then((lyricData) => {
      if (!cancelled) setLyrics(lyricData);
    });
    return () => {
      cancelled = true;
    };
  }, [currentSong?.id]);

  useEffect(() => {
    lyricsRef.current = lyrics;
    publishTime(timeRef.current);
  }, [lyrics]);
  useEffect(() => lyricOffset.subscribe(() => publishTime(timeRef.current)), []);

  // Update Media Session API for lockscreen and peripheral controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artists.map((a) => a.name).join(', '),
        album: currentSong.album?.name || 'Liquid Glass Music',
        artwork: [
          { src: currentSong.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: currentSong.thumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: currentSong.thumbnail, sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevRef.current());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextRef.current());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          seek(details.seekTime);
        }
      });
      try { navigator.mediaSession.setActionHandler('seekbackward', (d) => seek(Math.max(0, timeRef.current - (d.seekOffset || 10)))); } catch {}
      try { navigator.mediaSession.setActionHandler('seekforward', (d) => seek(timeRef.current + (d.seekOffset || 10))); } catch {}
    }
  }, [currentSong]);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = currentSong ? (isPlaying ? 'playing' : 'paused') : 'none';
  }, [isPlaying, currentSong]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !(duration > 0)) return;
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(timeRef.current, duration) }); } catch {}
  }, [duration, currentSong, isPlaying]);

  const playSong = useCallback(
    (song: Song, newQueue?: Song[]) => {
      const activeList = newQueue || queue;
      const indexInList = activeList.findIndex((s) => s.id === song.id);

      if (newQueue) {
        setQueue(newQueue);
        setQueueIndex(indexInList !== -1 ? indexInList : 0);
      } else if (indexInList !== -1) {
        setQueueIndex(indexInList);
      } else {
        setQueue((prev) => [...prev, song]);
        setQueueIndex(activeList.length);
      }

      setCurrentSong(song);
      pubRef.current = -1;
      publishTime(0);
      setCurrentTime(0);
      setDuration(song.durationSeconds && song.durationSeconds > 0 ? song.durationSeconds : 0);

      streamTriedRef.current = null;
      if (streamWatchRef.current) { clearTimeout(streamWatchRef.current); streamWatchRef.current = null; }
      if (triedIdsRef.current.size > 30) { triedIdsRef.current.clear(); altTriedRef.current.clear(); looseTriedRef.current.clear(); }
      if (!autoAltRef.current) { triedIdsRef.current.delete(song.id); altTriedRef.current.delete(song.id); looseTriedRef.current.delete(song.id); }
      autoAltRef.current = false;
      lastYtErrRef.current = null;
      const targetVideoId = song.videoId || (song.id && !song.id.startsWith('vid_') ? song.id : null);

      wantPlayRef.current = true;
      if (targetVideoId && document.hidden) {
        // Lagu otomatis berikutnya saat app di latar belakang: iframe YouTube tidak bisa dipakai
        streamRef.current(song);
      } else if (targetVideoId) {
        isUsingYTRef.current = true;
        if (audioRef.current) audioRef.current.pause();
        if (ytPlayerRef.current && ytReadyRef.current && ytPlayerRef.current.loadVideoById) {
          try {
            ytPlayerRef.current.loadVideoById(targetVideoId);
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
          } catch (e) {
            streamRef.current(song);
          }
        } else if (ytFailedRef.current) {
          streamRef.current(song);
        } else {
          pendingVideoIdRef.current = targetVideoId;
        }
      } else {
        streamRef.current(song);
      }

      // Antrean otomatis (radio YT Music) saat lagu hampir habis
      const vid = song.videoId || song.id;
      const remaining = activeList.length - 1 - Math.max(indexInList, 0);
      if (remaining < 3 && relatedForRef.current !== vid) {
        relatedForRef.current = vid;
        MusicApi.getRelated(vid).then((rel) => {
          setQueue((prev) => {
            const ids = new Set(prev.map((x) => x.id));
            const add = rel.filter((x) => !ids.has(x.id));
            return add.length ? [...prev, ...add] : prev;
          });
        }).catch(() => {});
      }

      // Add to playback history
      setHistory((prev) => {
        const filtered = prev.filter((s) => s.id !== song.id);
        return [song, ...filtered].slice(0, 50);
      });
    },
    [queue]
  );

  const togglePlay = useCallback(() => {
    if (isUsingYTRef.current && ytPlayerRef.current?.getPlayerState) {
      try {
        const state = ytPlayerRef.current.getPlayerState();
        if (state === 1) {
          wantPlayRef.current = false;
          ytPlayerRef.current.pauseVideo();
          setIsPlaying(false);
        } else {
          wantPlayRef.current = true;
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        }
        return;
      } catch {}
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      wantPlayRef.current = false;
      audio.pause();
      setIsPlaying(false);
    } else {
      wantPlayRef.current = true;
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying]);

  const pause = useCallback(() => {
    wantPlayRef.current = false;
    if (isUsingYTRef.current && ytPlayerRef.current?.pauseVideo) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    wantPlayRef.current = true;
    if (isUsingYTRef.current && ytPlayerRef.current?.playVideo) {
      try {
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
        return;
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    if (isUsingYTRef.current && ytPlayerRef.current?.seekTo) {
      try {
        ytPlayerRef.current.seekTo(seconds, true);
        pubRef.current = -1;
        publishTime(seconds);
        return;
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      pubRef.current = -1;
      publishTime(seconds);
    }
  }, []);

  const nextSong = useCallback(() => {
    if (queue.length === 0) return;

    let nextIdx: number;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeatMode === 'off') {
          pause();
          return;
        }
        nextIdx = 0;
      }
    }
    setQueueIndex(nextIdx);
    const nextTrack = queue[nextIdx];
    if (nextTrack) {
      playSong(nextTrack);
    }
  }, [queue, queueIndex, isShuffle, repeatMode, playSong, pause]);

  const prevSong = useCallback(() => {
    if (queue.length === 0) return;

    if (timeRef.current > 3) {
      seek(0);
      return;
    }

    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      prevIdx = queue.length - 1;
    }
    setQueueIndex(prevIdx);
    const prevTrack = queue[prevIdx];
    if (prevTrack) {
      playSong(prevTrack);
    }
  }, [queue, queueIndex, seek, playSong]);

  const handleTrackEnd = useCallback(() => {
    if (repeatMode === 'one') {
      seek(0);
      resume();
    } else {
      nextSong();
    }
  }, [repeatMode, nextSong, seek, resume]);

  const toggleFavorite = useCallback((song: Song) => {
    setFavorites((prev) => {
      const exists = prev.some((s) => s.id === song.id);
      if (exists) {
        showToast('Dihapus dari Favorit');
        return prev.filter((s) => s.id !== song.id);
      } else {
        showToast('Ditambahkan ke Favorit ❤️');
        return [song, ...prev];
      }
    });
  }, [showToast]);

  const isFavorite = useCallback(
    (songId: string) => {
      return favorites.some((s) => s.id === songId);
    },
    [favorites]
  );

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => [...prev, song]);
    showToast('Ditambahkan ke Antrean');
  }, [showToast]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    if (currentSong) {
      setQueue([currentSong]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(0);
    }
  }, [currentSong]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);

    if (ytPlayerRef.current?.setVolume) {
      try {
        ytPlayerRef.current.setVolume(Math.round(clamped * 100));
      } catch {}
    }
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      if (ytPlayerRef.current?.unMute) ytPlayerRef.current.unMute();
      if (audioRef.current) audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      if (ytPlayerRef.current?.mute) ytPlayerRef.current.mute();
      if (audioRef.current) audioRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev);
  }, []);

  const updateGlassSettings = useCallback((newSettings: Partial<GlassSettings>) => {
    setGlassSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const openSongMenu = useCallback((song: Song) => setSongMenu(song), []);
  const closeSongMenu = useCallback(() => setSongMenu(null), []);
  const openArtist = useCallback((a: { id?: string; name: string }) => { setIsPlayerExpanded(false); setArtistView(a); }, []);
  const closeArtist = useCallback(() => setArtistView(null), []);
  const changeTab = useCallback((t: TabType) => { setArtistView(null); setActiveTab(t); }, []);

  const playNext = (song: Song) => {
    if (queue.length === 0) { playSong(song, [song]); return; }
    setQueue((prev) => { const n = [...prev]; n.splice(queueIndex + 1, 0, song); return n; });
    showToast('Akan diputar berikutnya');
  };
  const createPlaylist = (name: string, song?: Song) => {
    const id = Math.random().toString(36).slice(2, 9);
    setPlaylists((p) => [{ id, name: name.trim() || 'Playlist baru', songs: song ? [song] : [], createdAt: Date.now() }, ...p]);
    showToast('Playlist dibuat');
    return id;
  };
  const importPlaylist = (name: string, songs: Song[]) => {
    const id = Math.random().toString(36).slice(2, 9);
    const seen = new Set<string>();
    const unique = songs.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
    setPlaylists((p) => [{ id, name: name.trim().slice(0, 60) || 'Playlist Spotify', songs: unique, createdAt: Date.now() }, ...p]);
    showToast(`Playlist diimpor · ${unique.length} lagu`);
    return id;
  };
  const addToPlaylist = (pid: string, song: Song) => {
    setPlaylists((p) => p.map((pl) => (pl.id !== pid || pl.songs.some((s) => s.id === song.id) ? pl : { ...pl, songs: [...pl.songs, song] })));
    showToast('Ditambahkan ke playlist');
  };
  const removeFromPlaylist = (pid: string, songId: string) =>
    setPlaylists((p) => p.map((pl) => (pl.id === pid ? { ...pl, songs: pl.songs.filter((s) => s.id !== songId) } : pl)));
  const deletePlaylist = (pid: string) => setPlaylists((p) => p.filter((pl) => pl.id !== pid));
  const subKey = (a: { id?: string; name: string }) => a.id || a.name;
  const isSubscribed = (key: string) => subscriptions.some((a) => subKey(a) === key || a.name === key);
  const toggleSubscribe = (artist: Artist) => {
    const on = isSubscribed(subKey(artist));
    setSubscriptions((p) => (on ? p.filter((a) => subKey(a) !== subKey(artist) && a.name !== artist.name) : [artist, ...p]));
    showToast(on ? `Berhenti berlangganan ${artist.name}` : `Berlangganan ${artist.name}`);
  };

  const clearStreamWatch = () => { if (streamWatchRef.current) { clearTimeout(streamWatchRef.current); streamWatchRef.current = null; } };

  const playViaStream = (song: Song) => {
    isUsingYTRef.current = false;
    streamTriedRef.current = song.id;
    try { ytPlayerRef.current?.stopVideo?.(); } catch {}
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = song.streamUrl || MusicApi.getStreamUrl(song.videoId || song.id);
    audio.load();
    audio.play().then(() => setIsPlaying(true)).catch(() => {});
    // Server kadang menggantung (YouTube lambat/menolak): jangan diam selamanya
    clearStreamWatch();
    streamWatchRef.current = setTimeout(() => {
      streamWatchRef.current = null;
      const a = audioRef.current;
      if (currentSongRef.current?.id !== song.id || isUsingYTRef.current) return;
      if (a && (a.currentTime > 0 || (!a.paused && a.readyState >= 3))) return; // sudah berbunyi
      if (wantPlayRef.current) unplayableRef.current();
    }, 18000);
  };

  // Pindah dari iframe YouTube ke <audio> (stream server) di posisi yang sama, tanpa jeda panjang
  const handoffToStream = () => {
    const song = currentSongRef.current;
    const audio = audioRef.current;
    if (!song || !audio || !wantPlayRef.current || !isUsingYTRef.current) return;
    let t = timeRef.current;
    try { const c = ytPlayerRef.current?.getCurrentTime?.(); if (typeof c === 'number' && !isNaN(c)) t = c; } catch {}
    isUsingYTRef.current = false;
    handoffRef.current = true;
    streamTriedRef.current = song.id;
    try { ytPlayerRef.current?.pauseVideo?.(); } catch {}
    audio.src = song.streamUrl || MusicApi.getStreamUrl(song.videoId || song.id);
    const seekOnce = () => {
      audio.removeEventListener('loadedmetadata', seekOnce);
      try { if (t > 1) audio.currentTime = t; } catch {}
    };
    audio.addEventListener('loadedmetadata', seekOnce);
    audio.play().then(() => setIsPlaying(true)).catch(() => {
      handoffRef.current = false;
      isUsingYTRef.current = true;
    });
  };

  // Cari upload lain dari lagu yang SAMA (mis. versi audio resmi yang boleh disematkan)
  const findAlternative = async (song: Song, strict: boolean): Promise<Song | undefined> => {
    const artist = song.artists[0]?.name || '';
    const res = await MusicApi.search(`${song.title} ${artist}`.trim(), 'songs');
    const want = normTitle(song.title);
    const wantArtist = normTitle(artist);
    const cands = res.filter((r): r is Song & { kind: 'song' } => r.kind === 'song' && r.id !== song.id && !triedIdsRef.current.has(r.id));
    const okArtist = (r: Song) => !wantArtist || r.artists.some((a) => { const n = normTitle(a.name); return n.includes(wantArtist) || wantArtist.includes(n); });
    const okDur = (r: Song, tol: number) => !song.durationSeconds || !r.durationSeconds || Math.abs(r.durationSeconds - song.durationSeconds) <= tol;
    const pick = strict
      ? cands.find((r) => normTitle(r.title) === want && okArtist(r) && okDur(r, 6))
      : cands.find((r) => { const t = normTitle(r.title); return (t === want || (want.length >= 4 && (t.includes(want) || want.includes(t)))) && okArtist(r) && okDur(r, 20); });
    return pick;
  };

  const replaceAndPlay = (song: Song, alt: Song) => {
    // Ganti lagu bermasalah di tempatnya (bukan ditambah di ujung antrean) agar urutan antrean tetap benar
    const q = queueRef.current.map((x) => (x.id === song.id ? alt : x));
    const list = q.some((x) => x.id === alt.id) ? q : [...q, alt];
    autoAltRef.current = true;
    playSong(alt, list);
  };

  const tryLoose = (song: Song) => {
    if (looseTriedRef.current.has(song.id)) { skipNext(); return; }
    looseTriedRef.current.add(song.id);
    findAlternative(song, false).then((alt) => {
      if (currentSongRef.current?.id !== song.id) return;
      if (alt) { showToast('Memutar versi lain dari lagu ini'); replaceAndPlay(song, alt); } else skipNext();
    }).catch(() => skipNext());
  };

  // Urutan: (1) lagu yang SAMA lewat stream server -> (2) upload identik yang bisa disematkan -> (3) versi mirip -> (4) lewati
  // (Lagu resmi label sering melarang embed (error 101/150/153); stream server memutar lagu yang sama persis tanpa mencari ulang.)
  const handleUnplayable = () => {
    const song = currentSongRef.current;
    if (!song) { skipNext(); return; }
    clearStreamWatch();
    triedIdsRef.current.add(song.id);

    if (streamTriedRef.current !== song.id) {
      const blocked = [101, 150, 153].includes(lastYtErrRef.current ?? -1);
      showToast(blocked ? 'Pemilik video melarang embed, memutar lewat server...' : 'Memutar lewat server...');
      playViaStream(song);
      return;
    }

    if (!altTriedRef.current.has(song.id)) {
      altTriedRef.current.add(song.id);
      showToast('Mencari versi lain dari lagu ini...');
      findAlternative(song, true).then((alt) => {
        if (currentSongRef.current?.id !== song.id) return;
        if (alt) { showToast('Memutar versi lain yang tersedia'); replaceAndPlay(song, alt); }
        else tryLoose(song);
      }).catch(() => { if (currentSongRef.current?.id === song.id) tryLoose(song); });
      return;
    }
    tryLoose(song);
  };

  const skipNext = () => {
    failRef.current += 1;
    if (failRef.current > 4) {
      failRef.current = 0;
      setIsPlaying(false);
      showToast('Lagu tidak bisa diputar. Cek koneksi.');
      return;
    }
    showToast('Lagu tidak tersedia, lanjut ke berikutnya');
    nextRef.current();
  };

  currentSongRef.current = currentSong;
  queueRef.current = queue;
  streamRef.current = playViaStream;
  handoffFnRef.current = handoffToStream;
  unplayableRef.current = handleUnplayable;
  nextRef.current = nextSong;
  prevRef.current = prevSong;
  endRef.current = handleTrackEnd;

  // Fungsi dibungkus agar identitasnya stabil (selalu memanggil versi terbaru)
  const fnsLatest = {
    playSong, togglePlay, pause, resume, seek, nextSong, prevSong, toggleFavorite, isFavorite,
    addToQueue, removeFromQueue, clearQueue, clearHistory, setVolume, toggleMute, toggleRepeat, toggleShuffle,
    setIsPlayerExpanded, showToast, updateGlassSettings, openSongMenu, closeSongMenu, openArtist, closeArtist,
    playNext, createPlaylist, importPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist, toggleSubscribe, isSubscribed,
    setActiveTab: changeTab,
  };
  const fnsRef = useRef(fnsLatest);
  fnsRef.current = fnsLatest;
  const fns = useMemo(() => {
    const o: any = {};
    (Object.keys(fnsLatest) as (keyof typeof fnsLatest)[]).forEach((k) => {
      o[k] = (...a: any[]) => (fnsRef.current[k] as any)(...a);
    });
    return o as typeof fnsLatest;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const core = useMemo<MusicCore>(() => ({
    currentSong, isPlaying, volume, isMuted, queue, queueIndex, favorites, history, repeatMode, isShuffle,
    activeTab, isPlayerExpanded, lyrics, glassSettings, toastMessage, playlists, subscriptions, songMenu, artistView,
    ...fns,
  } as MusicCore), [
    currentSong, isPlaying, volume, isMuted, queue, queueIndex, favorites, history, repeatMode, isShuffle,
    activeTab, isPlayerExpanded, lyrics, glassSettings, toastMessage, playlists, subscriptions, songMenu, artistView, fns,
  ]);
  const timeValue = useMemo<MusicTime>(() => ({ currentTime, duration, activeLyricIndex }), [currentTime, duration, activeLyricIndex]);

  return (
    <MusicContext.Provider value={core}>
      <MusicTimeContext.Provider value={timeValue}>
      {/* Hidden container for YouTube audio player */}
      <div
        id="yt-audio-player"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: 200,
          height: 200,
          opacity: 0.01,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
      {children}
      </MusicTimeContext.Provider>
    </MusicContext.Provider>
  );
};

export const useMusicTime = () => useContext(MusicTimeContext);

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};
