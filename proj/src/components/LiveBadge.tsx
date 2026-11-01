import React, { memo, useEffect, useState } from 'react';

/** Penanda data real-time: titik berdenyut + "x dtk lalu". Berhenti menghitung saat tab tersembunyi. */
export const LiveBadge = memo<{ updatedAt?: number; syncing?: boolean; className?: string }>(({ updatedAt, syncing, className = '' }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') tick((n) => n + 1); }, 5000);
    return () => clearInterval(t);
  }, []);
  if (!updatedAt) return null;
  const s = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  const label = syncing ? 'memperbarui…' : s < 10 ? 'baru saja' : s < 60 ? `${s} dtk lalu` : `${Math.floor(s / 60)} mnt lalu`;
  return (
    <span className={`live-pill ${className}`} title="Data langsung dari YouTube Music">
      <i className={`live-dot ${syncing ? 'is-sync' : ''}`} />
      LIVE<em>{label}</em>
    </span>
  );
});
