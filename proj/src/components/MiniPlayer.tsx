import React from 'react';
import { motion } from 'motion/react';
import { Play, Pause, SkipForward, Heart, Music } from 'lucide-react';
import { useMusic, useMusicTime } from '../context/MusicContext';

const R = 22;
const C = 2 * Math.PI * R;

export const MiniPlayer: React.FC = () => {
  const {
    currentSong, isPlaying, togglePlay, nextSong,
    setIsPlayerExpanded, toggleFavorite, isFavorite, activeTab, glassSettings,
  } = useMusic();
  const compact = glassSettings.newMiniPlayer;
  const { currentTime, duration } = useMusicTime();
  const noTabs = activeTab === 'profile' || activeTab === 'together';

  if (!currentSong) return null;
  const total = duration > 0 ? duration : currentSong.durationSeconds || 0;
  const progress = total > 0 ? Math.min(100, (currentTime / total) * 100) : 0;
  const fav = isFavorite(currentSong.id);

  return (
    <div className={`fixed ${noTabs ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]' : 'bottom-[86px]'} left-0 right-0 z-30 flex justify-center px-4 pointer-events-none`}>
      <div className={`w-full max-w-[440px] `}>
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => setIsPlayerExpanded(true)}
          className={`pointer-events-auto relative glass-pill mini-pill flex items-center cursor-pointer overflow-hidden ${compact ? 'rounded-[26px] p-1.5 pr-2 gap-2.5' : 'rounded-[28px] p-2 pr-3 gap-3'}`}
        >
          <div className={`${compact ? 'w-10 h-10 rounded-xl' : 'w-11 h-11 rounded-[14px]'} overflow-hidden shrink-0 bg-white/10`}>
            {currentSong.thumbnail ? (
              <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted"><Music size={18} /></div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-[14.5px] font-semibold text-[#f4eceb] truncate leading-[1.3]">{currentSong.title}</h4>
            <p className="text-[12px] leading-[1.3] text-muted truncate mt-0.5">{currentSong.artists.map((a) => a.name).join(', ')}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => toggleFavorite(currentSong)}
              className="w-9 h-9 flex items-center justify-center active:scale-90 transition-transform"
              aria-label={fav ? 'Hapus favorit' : 'Tambah favorit'}
            >
              <Heart size={20} className={fav ? 'text-accent fill-accent' : 'text-[#e9dfde]'} />
            </button>
            <button
              onClick={togglePlay}
              className="relative w-[50px] h-[50px] flex items-center justify-center active:scale-90 transition-transform"
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
            >
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 50 50" aria-hidden="true">
                <circle cx="25" cy="25" r={R} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
                <circle cx="25" cy="25" r={R} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - progress / 100)}
                  style={{ transition: 'stroke-dashoffset 0.3s linear', filter: 'drop-shadow(0 0 4px var(--accent))' }} />
              </svg>
              <span className="w-[38px] h-[38px] rounded-full bg-white/15 border border-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] flex items-center justify-center">
                {isPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current ml-0.5" />}
              </span>
            </button>
            <button onClick={nextSong} className="w-9 h-9 flex items-center justify-center text-[#f0e6e5] active:scale-90 transition-transform" aria-label="Berikutnya">
              <SkipForward size={20} className="fill-current" />
            </button>
          </div>

        </motion.div>
      </div>
    </div>
  );
};
