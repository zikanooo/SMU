import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ListMusic, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  /** Nama bawaan (mis. judul lagu yang sedang ditambahkan) */
  defaultName?: string;
  /** Teks info di bawah kolom, mis. lagu yang akan langsung dimasukkan */
  hint?: string;
}

/** Popup tengah layar untuk membuat playlist: ada kolom nama, tombol Batal & Buat. */
export const CreatePlaylistDialog: React.FC<Props> = ({ open, onClose, onCreate, defaultName = '', hint }) => {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 120);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { inputRef.current?.focus(); return; }
    onCreate(n);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
          <motion.div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Buat playlist baru"
            className="relative w-full max-w-[360px] rounded-[28px] p-5 border border-white/12 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
            style={{ background: 'linear-gradient(180deg, rgba(46,38,43,.98), rgba(24,20,22,.99))' }}
            initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <button type="button" onClick={onClose} className="absolute right-3 top-3 w-9 h-9 rounded-full flex items-center justify-center text-white/70 active:scale-90" aria-label="Tutup"><X size={19} /></button>
            <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center mb-3">
              <ListMusic size={22} className="text-accent" />
            </div>
            <h3 className="text-[20px] font-bold tracking-tight">Playlist baru</h3>
            <p className="text-[13px] text-muted mt-0.5">Beri nama playlist kamu.</p>

            <label className="block mt-4">
              <span className="sr-only">Nama playlist</span>
              <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                placeholder="Contoh: Santai Malam"
                className="w-full h-12 px-4 rounded-2xl bg-white/[0.07] border border-white/15 focus:border-accent outline-none text-[15.5px] placeholder:text-white/35 transition-colors" />
            </label>
            {hint && <p className="text-[12px] text-muted mt-2 truncate">{hint}</p>}

            <div className="grid grid-cols-2 gap-2.5 mt-5">
              <button type="button" onClick={onClose} className="h-12 rounded-full bg-white/10 border border-white/12 text-[14.5px] font-semibold active:scale-95 transition-transform">Batal</button>
              <button type="submit" disabled={!name.trim()}
                className="h-12 rounded-full bg-accent text-ink text-[14.5px] font-bold active:scale-95 transition-transform disabled:opacity-40">Buat</button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
};
