import React, { Suspense, lazy, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MusicProvider, useMusic } from './context/MusicContext';
import { AuthProvider } from './context/AuthContext';
import { LiquidMeshBackground } from './components/LiquidMeshBackground';
import { LiquidGlassTabBar } from './components/LiquidGlassTabBar';
import { MiniPlayer } from './components/MiniPlayer';
const FullPlayer = lazy(() => import('./components/FullPlayer').then((m) => ({ default: m.FullPlayer })));
import { HomePage } from './pages/HomePage';
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const TogetherPage = lazy(() => import('./pages/TogetherPage').then((m) => ({ default: m.TogetherPage })));
const SongMenu = lazy(() => import('./components/SongMenu').then((m) => ({ default: m.SongMenu })));
const ArtistPage = lazy(() => import('./components/ArtistPage').then((m) => ({ default: m.ArtistPage })));
const UserProfile = lazy(() => import('./components/UserProfile').then((m) => ({ default: m.UserProfile })));
const AccountSheet = lazy(() => import('./components/AccountSheet').then((m) => ({ default: m.AccountSheet })));
import { DynamicTheme } from './components/DynamicTheme';
import { useProfileView, profileView } from './services/profileView';
const TogetherSync = lazy(() => import('./components/TogetherSync').then((m) => ({ default: m.TogetherSync })));
import { CheckCircle2 } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { activeTab, currentSong, toastMessage, glassSettings } = useMusic();
  const pv = useProfileView();
  const [pvMounted, setPvMounted] = React.useState(false);
  useEffect(() => { if (pv) setPvMounted(true); }, [pv]);
  useEffect(() => { profileView.close(); }, [activeTab]); // pindah tab menutup profil

  // Muat halaman lain saat browser sedang menganggur -> pindah tab terasa instan
  useEffect(() => {
    const warm = () => { import('./pages/SearchPage'); import('./pages/ExplorePage'); import('./pages/LibraryPage'); import('./components/FullPlayer'); import('./components/UserProfile'); };
    const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => number);
    const id = ric ? ric(warm) : window.setTimeout(warm, 2500);
    return () => { if (!ric) clearTimeout(id); };
  }, []);

  return (
    <div className="relative min-h-screen text-[#f4eceb] flex flex-col items-center overflow-x-hidden">
      {/* Dynamic Ambient Liquid Mesh Background */}
      <DynamicTheme />
      <LiquidMeshBackground />

      {/* Floating Liquid Glass Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 450, damping: 25 }}
            className="fixed left-0 right-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 pointer-events-none px-4 flex justify-center"
            role="status" aria-live="polite"
          >
            <div className="max-w-[420px] px-4 py-2.5 rounded-2xl glass-pill specular-border flex items-center gap-2.5 text-[13px] leading-snug font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
              <CheckCircle2 size={15} className="text-accent shrink-0" />
              <span>{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area with Spring Transitions */}
      <main className={`relative z-10 w-full ${glassSettings.landscape ? 'max-w-4xl' : 'max-w-xl'} flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))]`}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="w-full"
          >
            <Suspense fallback={<div className="h-[60vh]" />}>
              {activeTab === 'home' && <HomePage />}
              {activeTab === 'explore' && <ExplorePage />}
              {activeTab === 'search' && <SearchPage />}
              {activeTab === 'library' && <LibraryPage />}
              {activeTab === 'profile' && <ProfilePage />}
              {activeTab === 'together' && <TogetherPage />}
            </Suspense>
          </motion.div>
      </main>

      {activeTab !== 'profile' && activeTab !== 'together' && (
        <div className="nav-scrim fixed inset-x-0 bottom-0 z-20 pointer-events-none" aria-hidden />
      )}

      {pvMounted && <Suspense fallback={null}><UserProfile /></Suspense>}

      {/* Floating Glass Mini Player */}
      <MiniPlayer />

      {/* Floating Liquid Glass Tab Bar with Draggable Refraction Bubble */}
      <LiquidGlassTabBar />

      {/* Fullscreen Modal Player with Synchronized Lyrics & Queue */}
      <Suspense fallback={null}>
        <FullPlayer />
        <TogetherSync />

        {/* Profil artis & menu lagu (bottom sheet) */}
        <ArtistPage />
        <SongMenu />
        <AccountSheet />
      </Suspense>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MusicProvider>
        <MainLayout />
      </MusicProvider>
    </AuthProvider>
  );
}
