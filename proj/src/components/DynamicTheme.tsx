import { useEffect } from 'react';
import { useMusic } from '../context/MusicContext';
import { getTheme } from '../themes';

const cache = new Map<string, number>();
const DEFAULT_HUE = 345;

function hexToHue(hex?: string): number {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return DEFAULT_HUE;
  const h = hex.replace('#', '');
  return rgbToHsl(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16))[0];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Ambil hue dominan (berbobot saturasi) dari cover. Gagal (CORS) -> null. */
function extractHue(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const bins = new Array(36).fill(0);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          const weight = s * s * (1 - Math.abs(l - 0.5) * 1.6);
          if (weight > 0) bins[Math.floor(h / 10) % 36] += weight;
        }
        const best = bins.indexOf(Math.max(...bins));
        resolve(Math.max(...bins) < 0.4 ? null : best * 10 + 5);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Mengatur CSS variable tema (accent, tint, blur) mengikuti cover lagu + pengaturan. */
export const DynamicTheme: React.FC = () => {
  const { currentSong, glassSettings } = useMusic();
  const { dynamicTheme, dynamicIcon, blurEnabled, blurIntensity, highRefresh, uiStyle } = glassSettings;
  const theme = getTheme(glassSettings.theme);
  const thumb = currentSong?.thumbnail;
  const fallback = currentSong?.accentColor;

  // Variabel warna tema (latar, kaca, saturasi aksen)
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.theme = theme.id;
    try { localStorage.setItem('auralys_theme_bg', theme.vars['--bg']); } catch {}
  }, [theme]);

  // Hue: tema berwarna tetap memakai hue sendiri; "Auralys Rose" mengikuti cover lagu
  useEffect(() => {
    const root = document.documentElement;
    let alive = true;
    const apply = (hue: number) => {
      if (!alive) return;
      root.style.setProperty('--hue', String(Math.round(hue)));
      const meta = document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', dynamicIcon ? `hsl(${Math.round(hue)} 30% 8%)` : theme.vars['--bg']);
    };
    if (theme.hue !== null) { apply(theme.hue); return () => { alive = false; }; }
    if (!dynamicTheme || !thumb) { apply(DEFAULT_HUE); return () => { alive = false; }; }
    if (cache.has(thumb)) { apply(cache.get(thumb)!); return () => { alive = false; }; }
    extractHue(thumb).then((h) => {
      const hue = h ?? hexToHue(fallback);
      cache.set(thumb, hue);
      apply(hue);
    });
    return () => { alive = false; };
  }, [thumb, fallback, dynamicTheme, dynamicIcon, theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--glass-blur', `${blurEnabled ? blurIntensity : 0}px`);
    document.documentElement.classList.toggle('no-blur', !blurEnabled);
    document.documentElement.classList.toggle('reduce-anim', !highRefresh);
    document.documentElement.dataset.ui = uiStyle || 'glass';
  }, [blurEnabled, blurIntensity, highRefresh, uiStyle]);

  return null;
};
