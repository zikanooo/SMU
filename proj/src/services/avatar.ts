import { useSyncExternalStore } from 'react';

/**
 * Foto profil buatan sendiri. Gambar dipangkas persegi, dikecilkan (160x160 JPEG ≈ 6-10 KB)
 * dan disimpan di perangkat. Saat sudah login, foto yang sama ikut dikirim ke leaderboard.
 */
const keyOf = (uid?: string) => (uid ? `auralys_avatar:${uid}` : 'auralys_avatar');
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const getAvatar = (uid?: string): string => {
  try { return localStorage.getItem(keyOf(uid)) || ''; } catch { return ''; }
};

export function setAvatar(uid: string | undefined, dataUrl: string) {
  if (dataUrl) localStorage.setItem(keyOf(uid), dataUrl); // lempar error jika penyimpanan penuh
  else localStorage.removeItem(keyOf(uid));
  emit();
}

export function useAvatar(uid?: string): string {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); window.addEventListener('storage', cb); return () => { subs.delete(cb); window.removeEventListener('storage', cb); }; },
    () => getAvatar(uid),
    () => '',
  );
}

const MAX_INPUT = 20 * 1024 * 1024;

/** Pangkas tengah jadi persegi lalu kecilkan ke `size` px (JPEG). */
export async function fileToAvatar(file: File, size = 160): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pilih file gambar (JPG, PNG, WebP)');
  if (file.size > MAX_INPUT) throw new Error('Gambar terlalu besar (maks 20 MB)');

  let source: CanvasImageSource & { width: number; height: number };
  let cleanup = () => {};
  try {
    source = (await createImageBitmap(file, { imageOrientation: 'from-image' } as any)) as any;
    cleanup = () => (source as ImageBitmap).close?.();
  } catch {
    const url = URL.createObjectURL(file);
    source = await new Promise<HTMLImageElement>((ok, no) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => no(new Error('Gambar tidak bisa dibaca (format tidak didukung)'));
      img.src = url;
    });
    cleanup = () => URL.revokeObjectURL(url);
  }

  try {
    const w = (source as any).naturalWidth || source.width;
    const h = (source as any).naturalHeight || source.height;
    const side = Math.min(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0d0b0c';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    cleanup();
  }
}
