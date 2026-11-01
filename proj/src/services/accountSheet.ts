import { useSyncExternalStore } from 'react';

/** Status buka/tutup sheet Akun (login & profil). Tombol akun 👤 di header halaman mana pun cukup memanggil accountSheet.open(). */
let isOpen = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const accountSheet = {
  open: () => { isOpen = true; emit(); },
  close: () => { isOpen = false; emit(); },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  get: () => isOpen,
};
export const useAccountSheet = () => useSyncExternalStore(accountSheet.subscribe, accountSheet.get, () => false);
