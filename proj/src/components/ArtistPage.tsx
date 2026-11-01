import React, { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Play, Shuffle, MoreVertical, BadgeCheck, UserPlus } from 'lucide-react';
import { Artist, Song, Album } from '../types/music';
import { MusicApi } from '../services/api';
import { useMusic } from '../context/MusicContext';

// Komponen di luar ArtistPage: bila didefinisikan di dalam render, React membuatnya ulang
// tiap render sehingga posisi geser samping kembali ke awal.
const AlbumTile = memo<{ al: Album; loading: boolean; onOpen: (a: Album) => void }>(({ al, loading, onOpen }) => (
  <button onClick={() => onOpen(al)} className="w-[140px] text-left card-press">
    <div className="relative aspect-square rounded-[18px] overflow-hidden bg-white/10 shadow-lg">
      {al.thumbnail && <img src={al.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" />}
      {loading && <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-xs font-medium">Memuat</div>}
    </div>
    <p className="mt-2 text-[14px] font-semibold truncate">{al.title}</p>
    {al.year && <p className="text-[12px] text-muted truncate">{al.year}</p>}
  </button>
));

const AlbumRow = memo<{ title: string; list: Album[]; loadingId: string; onOpen: (a: Album) => void }>(({ title, list, loadingId, onOpen }) => (
  <section className="mt-8">
    <h2 className="text-[20px] font-bold mb-3">{title}</h2>
    <div className="hscroll gap-4 -mx-4 px-4">
      {list.map((al) => <AlbumTile key={al.id} al={al} loading={loadingId === al.id} onOpen={onOpen} />)}
    </div>
  </section>
));

const Bars: React.FC = () => (
  <span className="flex items-end justify-center gap-[2px] h-4">
    {[0, 1, 2].map((i) => <span key={i} className="w-[3px] bg-accent rounded-full animate-pulse" style={{ height: 6 + i * 3, animationDelay: `${i * 0.15}s` }} />)}
  </span>
);

const TrackRow = memo<{ s: Song; index: number; current: boolean; playing: boolean; sub: string; cover?: boolean; onPlay: () => void; onMenu: (s: Song) => void }>(
  ({ s, index, current, playing, sub, cover = true, onPlay, onMenu }) => (
    <div onClick={onPlay} className="flex items-center gap-3 py-2.5 cursor-pointer active:opacity-70">
      <span className={`w-5 flex justify-center text-[14px] tabular-nums ${current ? 'text-accent' : 'text-muted'}`}>{current && playing ? <Bars /> : index}</span>
      {cover && <img src={s.thumbnail} alt="" className="w-[50px] h-[50px] rounded-xl object-cover bg-white/10" referrerPolicy="no-referrer" loading="lazy" decoding="async" />}
      <div className="flex-1 min-w-0">
        <p className={`text-[15.5px] font-semibold truncate ${current ? 'text-accent' : ''}`}>{s.title}</p>
        <p className="text-[12.5px] text-muted truncate">{sub}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onMenu(s); }} className="p-2 text-[#e9dfde] active:scale-90" aria-label="Menu"><MoreVertical size={20} /></button>
    </div>
  ),
);

const Stat: React.FC<{ value: string | number; label: string }> = ({ value, label }) => (
  <div className="text-center min-w-[72px]">
    <p className="text-[17px] font-bold leading-tight">{value}</p>
    <p className="text-[11.5px] text-muted">{label}</p>
  </div>
);

/** Profil artis: foto, statistik, tombol Berlangganan, lagu populer, album, bio. */
export const ArtistPage: React.FC = () => {
  const { artistView, closeArtist, playSong, openSongMenu, isSubscribed, toggleSubscribe, currentSong, isPlaying } = useMusic();
  const [data, setData] = useState<{ artist: Artist; songs: Song[]; albums: Album[]; singles: Album[] } | null>(null);
  const [album, setAlbum] = useState<Album | null>(null);
  const [albumLoading, setAlbumLoading] = useState('');
  const [err, setErr] = useState('');
  const [bioOpen, setBioOpen] = useState(false);

  useEffect(() => {
    if (!artistView) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    setData(null); setErr(''); setBioOpen(false); setAlbum(null);
    const fetchIt = async (id: string) => {
      const d = await MusicApi.getArtist(id);
      if (alive) setData(d);
    };
    (async () => {
      try {
        let id = artistView.id;
        if (!id) {
          const r = await MusicApi.search(artistView.name, 'artists');
          id = (r.find((x) => x.kind === 'artist') as any)?.id;
        }
        if (!id) throw new Error('Artis tidak ditemukan');
        await fetchIt(id);
        const rid = id;
        timer = setInterval(() => { fetchIt(rid).catch(() => {}); }, 5 * 60_000); // data artis diperbarui berkala
      } catch (e: any) {
        if (alive) setErr(e?.message || 'Gagal memuat artis');
      }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [artistView?.id, artistView?.name]);

  const openAlbum = React.useCallback(async (al: Album) => {
    setAlbumLoading(al.id);
    try { setAlbum(await MusicApi.getAlbum(al.id)); } catch {} finally { setAlbumLoading(''); }
  }, []);

  const albums = data?.albums || [];
  const singles = data?.singles || [];
  const songs = data?.songs || [];
  const a = data?.artist;
  const key = a?.id || a?.name || artistView?.id || artistView?.name || '';
  const subbed = isSubscribed(key);
  const currentId = currentSong?.id;
  const shuffle = () => { const s = [...songs].sort(() => Math.random() - 0.5); if (s.length) playSong(s[0], s); };

  return (
    <AnimatePresence>
      {artistView && (
        <motion.div key="artist"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed inset-0 z-20 overflow-y-auto overscroll-contain bg-[var(--bg)]"
        >
          <div className="relative w-full max-w-2xl mx-auto px-4 pb-56">
            {a?.thumbnail && (
              <img src={a.thumbnail} alt="" aria-hidden="true" className="absolute inset-x-0 top-0 w-full h-[300px] object-cover opacity-25 blur-2xl scale-110 pointer-events-none" referrerPolicy="no-referrer" />
            )}
            <div className="absolute inset-x-0 top-0 h-[300px] bg-gradient-to-b from-transparent to-[var(--bg)] pointer-events-none" />

            <div className="relative pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button onClick={closeArtist} className="w-10 h-10 rounded-full glass-pill flex items-center justify-center active:scale-90" aria-label="Kembali"><ArrowLeft size={20} /></button>

              <div className="flex flex-col items-center text-center mt-2">
                <div className="w-[36vw] max-w-[168px] aspect-square rounded-full overflow-hidden bg-white/10 border border-white/15 shadow-2xl">
                  {a?.thumbnail && <img src={a.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                </div>
                <h1 className="mt-4 text-[clamp(26px,7vw,34px)] font-extrabold tracking-tight flex items-center justify-center gap-2 max-w-full">
                  <span className="truncate">{a?.name || artistView.name}</span>
                  {a && <BadgeCheck size={21} className="text-accent shrink-0" />}
                </h1>

                {a && (
                  <div className="flex items-start justify-center gap-4 mt-3">
                    {a.subscribers && <Stat value={a.subscribers.replace(/\s*(pelanggan|subscribers?)\s*/i, '')} label="Pelanggan" />}
                    <Stat value={albums.length} label="Album" />
                    {singles.length > 0 && <Stat value={singles.length} label="Single" />}
                  </div>
                )}

                <div className="flex items-center gap-2.5 mt-5">
                  <button onClick={() => songs.length && playSong(songs[0], songs)} disabled={!songs.length}
                    className="h-12 px-6 rounded-full bg-accent text-ink font-bold text-[15px] flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-50">
                    <Play size={17} className="fill-current" /> Putar
                  </button>
                  <button onClick={shuffle} disabled={!songs.length} className="w-12 h-12 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50" aria-label="Acak"><Shuffle size={19} /></button>
                  <button onClick={() => toggleSubscribe({ id: a?.id || artistView.id, name: a?.name || artistView.name, thumbnail: a?.thumbnail, subscribers: a?.subscribers })}
                    className={`h-12 px-5 rounded-full text-[14.5px] font-semibold flex items-center gap-2 active:scale-95 border transition-colors ${subbed ? 'border-accent text-accent bg-accent/10' : 'border-white/30 text-[#f4eceb]'}`}>
                    {subbed ? <BadgeCheck size={17} /> : <UserPlus size={17} />} {subbed ? 'Berlangganan' : 'Ikuti'}
                  </button>
                </div>
              </div>
            </div>

            <div className="relative mt-9">
              {err ? (
                <p className="text-center text-sm text-rose-300 py-10">{err}</p>
              ) : !data ? (
                <div className="space-y-3">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="h-14 rounded-2xl bg-white/[0.06] animate-pulse" />)}</div>
              ) : (
                <>
                  <h2 className="text-[20px] font-bold mb-1">Populer</h2>
                  {songs.slice(0, 10).map((s, i) => (
                    <TrackRow key={s.id} s={s} index={i + 1} current={currentId === s.id} playing={isPlaying}
                      sub={s.album?.name || s.artists.map((x) => x.name).join(', ')} onPlay={() => playSong(s, songs)} onMenu={openSongMenu} />
                  ))}
                  {albums.length > 0 && <AlbumRow title="Album" list={albums} loadingId={albumLoading} onOpen={openAlbum} />}
                  {singles.length > 0 && <AlbumRow title="Single dan EP" list={singles} loadingId={albumLoading} onOpen={openAlbum} />}
                  {a?.bio && (
                    <section className="mt-8">
                      <h2 className="text-[20px] font-bold mb-2">Tentang</h2>
                      <p className={`text-[14px] leading-relaxed text-[#d6cdcf] whitespace-pre-line ${bioOpen ? '' : 'line-clamp-4'}`}>{a.bio}</p>
                      <button onClick={() => setBioOpen((o) => !o)} className="mt-1 text-[13px] text-accent font-semibold">{bioOpen ? 'Tutup' : 'Selengkapnya'}</button>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {artistView && album && (
        <motion.div key="album" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-[21] overflow-y-auto overscroll-contain bg-[var(--bg)]">
          <div className="w-full max-w-2xl mx-auto px-4 pb-56 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button onClick={() => setAlbum(null)} className="w-10 h-10 rounded-full glass-pill flex items-center justify-center active:scale-90" aria-label="Kembali"><ArrowLeft size={20} /></button>
            <div className="flex flex-col items-center text-center mt-3">
              <div className="w-[56vw] max-w-[240px] aspect-square rounded-2xl overflow-hidden bg-white/10 shadow-2xl">
                {album.thumbnail && <img src={album.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
              </div>
              <h1 className="mt-4 text-[clamp(22px,6vw,30px)] font-extrabold tracking-tight">{album.title}</h1>
              <p className="text-[14px] text-accent font-medium mt-0.5">{album.artist}</p>
              <p className="text-[12.5px] text-muted mt-0.5">{[album.year, `${album.tracks?.length || album.tracksCount || 0} lagu`].filter(Boolean).join(', ')}</p>
              <button onClick={() => album.tracks?.length && playSong(album.tracks[0], album.tracks)}
                className="mt-4 h-12 px-7 rounded-full bg-accent text-ink font-bold text-[15px] flex items-center gap-2 active:scale-95 transition-transform">
                <Play size={17} className="fill-current" /> Putar album
              </button>
            </div>
            <div className="mt-6">
              {(album.tracks || []).map((s, i) => (
                <TrackRow key={s.id} s={s} index={i + 1} cover={false} current={currentId === s.id} playing={isPlaying}
                  sub={s.duration || s.artists.map((x) => x.name).join(', ')} onPlay={() => playSong(s, album.tracks!)} onMenu={openSongMenu} />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
