import React from 'react';
import { useMusic } from '../context/MusicContext';

/** Latar gelap dengan cahaya lembut dari warna tema/cover (mengikuti --hue & --accent2). */
export const LiquidMeshBackground: React.FC = () => {
  const { glassSettings, isPlaying } = useMusic();

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" style={{ background: 'var(--bg)' }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 50% at 50% -5%, var(--tint-glow) 0%, transparent 70%), radial-gradient(90% 40% at 50% 112%, color-mix(in srgb, var(--accent2) 20%, transparent) 0%, transparent 70%), linear-gradient(180deg, var(--tint) 0%, var(--bg) 60%)',
        }}
      />
      {glassSettings.dynamicMesh && (
        <>
          <div
            className="absolute -top-[10%] -right-[18%] w-[70vw] h-[70vw] max-w-[540px] max-h-[540px] rounded-full opacity-30 animate-blob-1"
            style={{
              background: 'radial-gradient(circle, var(--accent) 0%, transparent 68%)',
              animationDuration: `${24 / glassSettings.meshSpeed}s`,
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
          />
          <div
            className="absolute top-[55%] -left-[22%] w-[70vw] h-[70vw] max-w-[560px] max-h-[560px] rounded-full opacity-[0.18] animate-blob-2"
            style={{
              background: 'radial-gradient(circle, var(--accent2) 0%, transparent 68%)',
              animationDuration: `${28 / glassSettings.meshSpeed}s`,
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
          />
        </>
      )}
    </div>
  );
};
