import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, ListPlus, ListMusic, SkipForward, Link2, Share2, User, ExternalLink, Radio, ChevronLeft, Plus, Check } from 'lucide-react';
import { useMusic } from '../context/MusicContext';
import { MusicApi } from '../services/api';
import { CreatePlaylistDialog } from './CreatePlaylistDialog';

/** Menu titik tiga ala Spotify: bottom sheet dengan banyak aksi + pemilih playlist. */
export const SongMenu: React.FC = () => {
  const {
    songMenu: song, closeSongMenu, toggleFavorite, isFavorite, playNext, addToQueue, playlists,
    createPlaylist, addToPlaylist, playSong, openArtist, showToast,
  } = useMusic();
  const [view, setView] = useState<'menu' | 'pl'>('menu');
  const [newOpen, setNewOpen] = useState(false);

  const close = () => { closeSongMenu(); setTimeout(() => { setView('menu'); setNewOpen(false); }, 250); };
  const link = song ? `https://music.youtube.com/watch?v=${song.videoId || song.id}` : '';
  const artist = song?.artists[0];
  const artists = song?.artists.map((a) => a.name).join(', ') || '';
  const run = (fn: () => void) => () => { fn(); close(); };

  const Item: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }> = ({ icon, label, onClick, active }) => (
    <button onClick={onClick} className="w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl active:bg-white/10 text-left">
      <span className={active ? 'text-accent' : 'text-[#e9dfde]'}>{icon}</span>
      <span className="text-[15.5px] font-medium">{label}</span>
    </button>
  );

  return (
    <>
    <AnimatePresence>
      {song && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={close} className="absolute inset-0 bg-black/60" />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 380 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 500) close(); }}
            className="relative w-full max-w-lg max-h-[86dvh] overflow-y-auto rounded-t-[28px] bg-[var(--sheet)] border-t border-white/10 px-3 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto w-10 h-1 bg-white/25 rounded-full mb-3" />
            {view === 'menu' ? (
              <>
                <div className="flex items-center gap-3 px-3 pb-3 mb-1 border-b border-white/10">
                  <img src={song.thumbnail} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/10" referrerPolicy="no-referrer" />
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold truncate">{song.title}</p>
                    <p className="text-[13px] text-muted truncate">{artists}</p>
                  </div>
                </div>
                <Item icon={<Heart size={22} className={isFavorite(song.id) ? 'fill-current' : ''} />} active={isFavorite(song.id)}
                  label={isFavorite(song.id) ? 'Hapus dari Disukai' : 'Tambahkan ke Disukai'} onClick={run(() => toggleFavorite(song))} />
                <Item icon={<ListPlus size={22} />} label="Tambahkan ke playlist" onClick={() => setView('pl')} />
                <Item icon={<SkipForward size={22} />} label="Putar berikutnya" onClick={run(() => playNext(song))} />
                <Item icon={<ListMusic size={22} />} label="Tambahkan ke antrean" onClick={run(() => addToQueue(song))} />
                <Item icon={<Radio size={22} />} label="Mulai radio dari lagu ini" onClick={run(() => {
                  MusicApi.getRelated(song.videoId || song.id)
                    .then((rel) => playSong(song, [song, ...rel.filter((r) => r.id !== song.id)]))
                    .catch(() => showToast('Radio gagal dimuat'));
                })} />
                {artist && <Item icon={<User size={22} />} label={`Lihat artis · ${artist.name}`} onClick={run(() => openArtist({ id: artist.id, name: artist.name }))} />}
                <Item icon={<Link2 size={22} />} label="Salin tautan" onClick={run(() => {
                  navigator.clipboard?.writeText(link).then(() => showToast('Tautan disalin')).catch(() => showToast('Gagal menyalin'));
                })} />
                <Item icon={<Share2 size={22} />} label="Bagikan" onClick={run(() => {
                  const d = { title: song.title, text: `${song.title} – ${artists}`, url: link };
                  if (navigator.share) navigator.share(d).catch(() => {});
                  else navigator.clipboard?.writeText(link).then(() => showToast('Tautan disalin'));
                })} />
                <a href={link} target="_blank" rel="noreferrer" onClick={close} className="w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl active:bg-white/10">
                  <span className="text-[#e9dfde]"><ExternalLink size={22} /></span>
                  <span className="text-[15.5px] font-medium">Buka di YouTube Music</span>
                </a>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 px-1 pb-2">
                  <button onClick={() => setView('menu')} className="p-2 active:scale-90" aria-label="Kembali"><ChevronLeft size={22} /></button>
                  <h3 className="text-[17px] font-bold">Tambahkan ke playlist</h3>
                </div>
                <button onClick={() => setNewOpen(true)} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl active:bg-white/10 text-left">
                  <span className="w-12 h-12 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0"><Plus size={22} className="text-accent" /></span>
                  <span className="text-[15px] font-semibold">Playlist baru</span>
                </button>
                {playlists.length === 0 && <p className="text-center text-sm text-muted py-6">Belum ada playlist. Buat yang pertama di atas.</p>}
                {playlists.map((pl) => {
                  const has = pl.songs.some((s) => s.id === song.id);
                  return (
                    <button key={pl.id} onClick={() => { if (has) showToast('Sudah ada di playlist ini'); else { addToPlaylist(pl.id, song); close(); } }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl active:bg-white/10 text-left">
                      <div className="w-12 h-12 rounded-xl bg-white/10 overflow-hidden shrink-0 flex items-center justify-center text-muted">
                        {pl.songs[0] ? <img src={pl.songs[0].thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <ListMusic size={20} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold truncate">{pl.name}</p>
                        <p className="text-[12.5px] text-muted">{pl.songs.length} lagu</p>
                      </div>
                      {has && <Check size={20} className="text-accent" />}
                    </button>
                  );
                })}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    {song && (
      <CreatePlaylistDialog open={newOpen} onClose={() => setNewOpen(false)} defaultName=""
        hint={`Lagu "${song.title}" langsung ditambahkan`}
        onCreate={(n) => { createPlaylist(n, song); setNewOpen(false); close(); }} />
    )}
    </>
  );
};
