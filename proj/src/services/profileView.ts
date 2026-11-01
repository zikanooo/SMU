import { useSyncExternalStore } from 'react';

/** Tumpukan profil yang sedang dibuka (profil saya -> pengikut -> profil teman ...). Tombol kembali membuka profil sebelumnya. */
let stack: string[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const profileView = {
  open: (uid: string) => { if (stack[stack.length - 1] !== uid) { stack = [...stack, uid]; emit(); } },
  back: () => { stack = stack.slice(0, -1); emit(); },
  close: () => { stack = []; emit(); },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  top: (): string | null => (stack.length ? stack[stack.length - 1] : null),
  depth: () => stack.length,
};

export const useProfileView = () => useSyncExternalStore(profileView.subscribe, profileView.top, () => null);
