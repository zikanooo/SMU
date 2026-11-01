import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useVelocity } from 'motion/react';
import { Home, Search, Library, Users } from 'lucide-react';
import { TabType } from '../types/music';
import { useMusic } from '../context/MusicContext';

const TABS: { id: TabType; label: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }> }[] = [
  { id: 'home', label: 'Beranda', icon: Home },
  { id: 'search', label: 'Cari', icon: Search },
  { id: 'library', label: 'Pustaka', icon: Library },
];
const PAD = 6;            // padding bar (px)
const BAR_H = 64;         // tinggi bar
const BUBBLE_H = BAR_H - PAD * 2;

// Peta pergeseran untuk efek lensa (R = geser X, G = geser Y)
const LENS_MAP = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><defs>' +
  '<linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#f00"/></linearGradient>' +
  '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#0f0"/></linearGradient></defs>' +
  '<rect width="200" height="80" fill="url(#r)"/><rect width="200" height="80" fill="url(#g)" style="mix-blend-mode:screen"/></svg>'
)}`;

/**
 * Tab bar ala iOS 26: gelembung kaca membesar saat ditekan, mengikuti jari dengan fisika pegas,
 * memanjang mengikuti kecepatan geser, membiaskan isi di belakangnya, lalu snap ke tab terdekat.
 */
export const LiquidGlassTabBar: React.FC = () => {
  const { activeTab, setActiveTab, glassSettings } = useMusic();
  const hidden = activeTab === 'profile' || activeTab === 'together';
  // -1 bila tab aktif bukan bagian bar (mis. 'search' yang punya tombol sendiri)
  const activeIdx = TABS.findIndex((t) => t.id === activeTab);

  const barRef = useRef<HTMLDivElement>(null);
  const [tw, setTw] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(activeIdx);
  const draggingRef = useRef(false);
  const hoverRef = useRef(activeIdx);

  const raw = useMotionValue(0);
  const x = useSpring(raw, { stiffness: 430, damping: 38, mass: 0.85 });
  const vel = useVelocity(x);
  const press = useSpring(0, { stiffness: 300, damping: 26 });
  const scaleX = useTransform([press, vel], ([p, v]: number[]) => (1 + 0.16 * p) * (1 + Math.min(Math.abs(v) / 3200, 0.22)));
  const scaleY = useTransform([press, vel], ([p, v]: number[]) => (1 + 0.22 * p) * (1 - Math.min(Math.abs(v) / 9000, 0.08)));

  // Ukur lebar tab (tetap terpasang walau bar disembunyikan)
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => { const w = el.clientWidth - PAD * 2; if (w > 0) setTw(w / TABS.length); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sinkron posisi gelembung dengan tab aktif (saat tidak sedang digeser)
  const first = useRef(true);
  useEffect(() => {
    if (!tw || draggingRef.current) return;
    if (activeIdx < 0) return; // biarkan gelembung di posisi terakhir
    const v = activeIdx * tw;
    if (first.current) { raw.jump(v); x.jump(v); first.current = false; } else raw.set(v);
    hoverRef.current = activeIdx;
    setHoverIdx(activeIdx);
  }, [activeIdx, tw]); // eslint-disable-line react-hooks/exhaustive-deps

  const buzz = (ms = 8) => {
    if (glassSettings.hapticFeedback && 'vibrate' in navigator) { try { navigator.vibrate(ms); } catch {} }
  };
  const clampIdx = (v: number) => Math.max(0, Math.min(TABS.length - 1, v));

  // Posisi target gelembung dari jari, dengan karet di kedua ujung
  const targetFromPointer = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    const t = clientX - rect.left - PAD - tw / 2;
    const max = tw * (TABS.length - 1);
    if (t < 0) return t * 0.28;
    if (t > max) return max + (t - max) * 0.28;
    return t;
  };
  const track = (clientX: number) => {
    const t = targetFromPointer(clientX);
    raw.set(t);
    const idx = clampIdx(Math.round(t / tw));
    if (idx !== hoverRef.current) { hoverRef.current = idx; setHoverIdx(idx); buzz(6); }
  };

  const onDown = (e: React.PointerEvent) => {
    if (!tw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setPressed(true);
    press.set(1);
    track(e.clientX);
    buzz(5);
  };
  const onMove = (e: React.PointerEvent) => { if (draggingRef.current) track(e.clientX); };
  const onUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    // lemparan ringan: perhitungkan kecepatan saat dilepas
    const predicted = x.get() + x.getVelocity() * 0.09;
    const idx = clampIdx(Math.round(predicted / tw));
    raw.set(idx * tw);
    hoverRef.current = idx;
    setHoverIdx(idx);
    setPressed(false);
    press.set(0);
    if (TABS[idx].id !== activeTab) { setActiveTab(TABS[idx].id); buzz(10); }
  };

  const shown = pressed ? hoverIdx : activeIdx;
  const strength = glassSettings.refractionStrength;

  return (
    <nav className={`fixed bottom-4 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none`} style={hidden ? { display: 'none' } : undefined} aria-label="Navigasi utama">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <filter id="auralys-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={LENS_MAP} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={Math.max(0, strength) * 1.6} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className="relative w-full max-w-[440px] flex items-center gap-2.5 pointer-events-none">
      <div className="relative flex-1 min-w-0 pointer-events-none">
        {/* 1) latar kaca bar  2) gelembung kaca  3) ikon & teks di paling atas (tajam, tidak ikut blur/bias) */}
        <div className="glass-pill absolute inset-0 rounded-full pointer-events-none" />

        {tw > 0 && (
          <motion.div
            aria-hidden="true"
            data-pressed={pressed}
            className="glass-lens absolute rounded-full pointer-events-none"
            style={{ left: PAD, top: PAD, width: tw, height: BUBBLE_H, x, scaleX, scaleY, opacity: activeIdx < 0 && !pressed ? 0 : 1, ['--lens' as any]: 'url(#auralys-lens)' }}
          />
        )}

        <div
          ref={barRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="pointer-events-auto relative z-10 flex p-1.5 rounded-full touch-none select-none"
          style={{ height: BAR_H }}
          role="tablist"
        >
          {TABS.map((tab, i) => {
            const Icon = tab.icon;
            const on = shown === i;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeIdx === i}
                aria-label={tab.label}
                onClick={(e) => { if (e.detail === 0) setActiveTab(tab.id); }}
                className="relative flex-1 h-full flex flex-col items-center justify-center rounded-full focus-visible:outline-none"
              >
                <Icon size={22} strokeWidth={on ? 2.4 : 1.8}
                  className={`transition-colors duration-200 ${on ? 'text-accent' : 'text-[#d6cdcf]'}`} />
                <span className={`text-[11px] mt-0.5 font-semibold tracking-[0.01em] transition-colors duration-200 ${on ? 'text-accent' : 'text-[#c9bfc2]'}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={() => setActiveTab('together')} aria-label="Dengar bersama"
        className="pointer-events-auto glass-pill shrink-0 rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform"
        style={{ width: BAR_H, height: BAR_H }}>
        <Users size={22} strokeWidth={1.9} className="text-[#d6cdcf]" />
        <span className="text-[11px] mt-0.5 font-semibold text-[#c9bfc2]">Bersama</span>
      </button>

      </div>
    </nav>
  );
};
