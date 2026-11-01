import React from 'react';

/**
 * Pelindung terakhir: error render / gagal memuat chunk (mis. setelah deploy baru) tidak lagi
 * membuat layar kosong. Untuk gagal-muat chunk, muat ulang otomatis satu kali.
 */
const RELOAD_KEY = 'auralys_chunk_reload';
const isChunkError = (e: unknown) =>
  /Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String((e as any)?.message || e));

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error) {
    console.error('[Auralys] UI error:', error);
    if (!isChunkError(error)) return;
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return; // sudah pernah dicoba, jangan berulang
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch { return; }
    // Buang cache lama agar index.html baru yang dipakai, lalu muat ulang
    (async () => {
      try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch { /* abaikan */ }
      location.reload();
    })();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', color: '#f4eceb', background: '#0d0b0c', fontFamily: 'Outfit, system-ui, sans-serif' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Terjadi kendala saat memuat Auralys</div>
        <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 320 }}>Coba muat ulang halaman. Daftar favorit dan riwayat Anda tetap tersimpan di perangkat.</div>
        <button onClick={() => location.reload()} style={{ padding: '10px 22px', borderRadius: 999, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 14, fontWeight: 600 }}>
          Muat ulang
        </button>
      </div>
    );
  }
}
