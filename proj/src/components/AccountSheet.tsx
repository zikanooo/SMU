import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, LogOut, Settings, UserRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMusic } from '../context/MusicContext';
import { accountSheet, useAccountSheet } from '../services/accountSheet';
import { profileView } from '../services/profileView';
import { Avatar } from './Avatar';
import { LoginCard } from './LoginCard';

export const AccountSheet: React.FC = () => {
  const open = useAccountSheet();
  const { user, signOut, busy, customPhoto, setPhoto, removePhoto } = useAuth();
  const { setActiveTab, showToast } = useMusic();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') accountSheet.close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = async (file?: File) => {
    if (!file) return;
    setSaving(true);
    try { await setPhoto(file); showToast('Foto profil diperbarui'); }
    catch (e: any) { showToast(e?.message || 'Gagal memakai foto'); }
    finally { setSaving(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={accountSheet.close} />
          <motion.div key="sh" role="dialog" aria-modal="true" aria-label="Akun"
            className="ds-sheet fixed inset-x-0 bottom-0 z-[61] mx-auto w-full max-w-xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) accountSheet.close(); }}>
            <div className="ds-grabber" />
            <button onClick={accountSheet.close} className="ds-icon-btn absolute right-3 top-3" aria-label="Tutup"><X size={20} /></button>

            {user ? (
              <div className="space-y-4 pt-2">
                <div className="flex flex-col items-center text-center gap-3">
                  <label className="relative cursor-pointer active:scale-95 transition-transform" aria-label="Ubah foto profil">
                    <span className={`account-hero-ring ${saving ? 'opacity-50' : ''}`}><Avatar src={user.photo} name={user.name} size={92} /></span>
                    <span className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full bg-accent text-ink flex items-center justify-center border-2 border-[#1a1618]"><Camera size={15} strokeWidth={2.5} /></span>
                    <input type="file" accept="image/*" className="hidden" disabled={saving}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
                  </label>
                  <div className="min-w-0">
                    <p className="text-[20px] font-bold tracking-tight truncate">{user.name}</p>
                    <p className="text-[13px] text-muted truncate">{user.email}</p>
                  </div>
                  {customPhoto && <button onClick={() => { removePhoto(); showToast('Foto dihapus'); }} className="ds-btn ds-btn-ghost !min-h-9 !text-[13px]">Hapus foto kustom</button>}
                </div>
                {user.bio && <p className="text-[13.5px] text-[#d6cdcf] text-center leading-[1.5] px-2 line-clamp-3">{user.bio}</p>}
                <button onClick={() => { accountSheet.close(); profileView.open(user.uid); }} className="ds-btn ds-btn-primary w-full"><UserRound size={18} /> Lihat &amp; edit profil</button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { accountSheet.close(); setActiveTab('profile'); }} className="ds-btn ds-btn-ghost"><Settings size={18} /> Pengaturan</button>
                  <button onClick={async () => { await signOut(); accountSheet.close(); }} disabled={busy} className="ds-btn ds-btn-ghost disabled:opacity-50"><LogOut size={18} /> Keluar</button>
                </div>
              </div>
            ) : (
              <div className="pt-6"><LoginCard /></div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
