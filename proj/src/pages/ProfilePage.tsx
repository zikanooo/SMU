import React, { useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft, ChevronRight, Palette, PlayCircle, Languages, ShieldCheck, HardDrive,
  DatabaseBackup, Info, Droplets, Gauge, Smartphone, PaintBucket, Paintbrush, Layers, Vibrate, Trash2,
  Download, Upload, BarChart3, Trophy, Check, MonitorSmartphone, Camera,
} from 'lucide-react';
import { useMusic } from '../context/MusicContext';
import { GlassSettings } from '../types/music';
import { StatsPage } from './StatsPage';
import { useAuth } from '../context/AuthContext';
import { THEMES } from '../themes';
import { usePWAInstall } from '../pwa';
import { lyricOffset } from '../services/lyricsSync';

type View = 'root' | 'stats' | 'appearance' | 'player' | 'privacy' | 'storage' | 'backup' | 'about';

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button role="switch" aria-checked={on} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!on); }} className="switch" />
);

const IconTile: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="w-[42px] h-[42px] rounded-[14px] bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/25 text-accent flex items-center justify-center shrink-0">{children}</span>
);

const Group: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    {label && <p className="set-group-label">{label}</p>}
    <div className="set-card glass-panel">{children}</div>
  </>
);

const NavRow: React.FC<{ icon: React.ReactNode; title: string; desc?: string; onClick: () => void }> = ({ icon, title, desc, onClick }) => (
  <button onClick={onClick} className="set-row">
    <IconTile>{icon}</IconTile>
    <span className="flex-1 min-w-0">
      <span className="block text-[15.5px] font-semibold text-[#f4eceb]">{title}</span>
      {desc && <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{desc}</span>}
    </span>
    <ChevronRight size={19} className="text-[#cfc5c7] shrink-0" />
  </button>
);

const ToggleRow: React.FC<{ icon: React.ReactNode; title: string; desc: string; on: boolean; onChange: (v: boolean) => void }> = ({ icon, title, desc, on, onChange }) => (
  <div className="set-row cursor-pointer" onClick={() => onChange(!on)}>
    <IconTile>{icon}</IconTile>
    <span className="flex-1 min-w-0">
      <span className="block text-[15.5px] font-semibold text-[#f4eceb]">{title}</span>
      <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{desc}</span>
    </span>
    <Switch on={on} onChange={onChange} label={title} />
  </div>
);

const RadioRow: React.FC<{ title: string; desc?: string; on: boolean; onClick: () => void }> = ({ title, desc, on, onClick }) => (
  <button role="radio" aria-checked={on} onClick={onClick} className="set-row">
    <span className="flex-1 min-w-0">
      <span className="block text-[15.5px] font-semibold text-[#f4eceb]">{title}</span>
      {desc && <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{desc}</span>}
    </span>
    <span className="radio-dot" data-on={on} />
  </button>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; unit: string; onChange: (n: number) => void; format?: (n: number) => string }> = ({ label, value, min, max, unit, onChange, format }) => (
  <div className="set-sub space-y-2">
    <div className="flex justify-between text-[13px]">
      <span className="text-[#e9dfde]">{label}</span>
      <span className="font-mono text-accent font-semibold">{format ? format(value) : `${value}${unit}`}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value))}
      className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/20" style={{ accentColor: 'var(--accent)' }} />
  </div>
);

export const ProfilePage: React.FC = () => {
  const { glassSettings: g, updateGlassSettings, favorites, history, clearHistory, setActiveTab, showToast } = useMusic();
  const [view, setView] = useState<View>('root');
  const [statsTab, setStatsTab] = useState<'stats' | 'leaderboard'>('stats');
  const set = (p: Partial<GlassSettings>) => updateGlassSettings(p);
  const { user } = useAuth();
  const pwa = usePWAInstall();
  const lyricOff = useSyncExternalStore(lyricOffset.subscribe, lyricOffset.get);
  const installApp = async () => {
    if (pwa.installed) return showToast('Auralys sudah terpasang');
    if (pwa.canPrompt) { const r = await pwa.install(); if (r === 'accepted') showToast('Memasang Auralys...'); return; }
    showToast(pwa.isIOS ? 'Safari: tombol Bagikan → Tambahkan ke Layar Utama' : 'Chrome: menu ⋮ → Instal aplikasi / Tambahkan ke layar utama');
  };

  const titles: Record<View, string> = {
    root: 'Pengaturan', stats: 'Statistik & Leaderboard', appearance: 'Tampilan', player: 'Pemutar dan audio', privacy: 'Privasi',
    storage: 'Penyimpanan', backup: 'Pencadangan dan Pemulihan', about: 'Tentang',
  };
  const back = () => (view === 'root' ? setActiveTab('home') : setView('root'));

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'auralys', favorites, history, settings: g }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'auralys-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Cadangan diunduh');
  };
  const importData = (file?: File) => {
    if (!file) return;
    file.text().then((txt) => {
      try {
        const d = JSON.parse(txt);
        // Hanya terima lagu yang bentuknya benar (id + title) agar data rusak tidak membuat UI crash
        const okSong = (s: any) => s && typeof s === 'object' && typeof s.id === 'string' && typeof s.title === 'string';
        const writes: [string, unknown][] = [];
        if (Array.isArray(d.favorites)) writes.push(['liquid_music_favorites', d.favorites.filter(okSong)]);
        if (Array.isArray(d.history)) writes.push(['liquid_music_history', d.history.filter(okSong).slice(0, 50)]);
        if (d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings)) writes.push(['liquid_glass_settings', d.settings]);
        if (!writes.length) { showToast('File cadangan tidak valid'); return; }
        (window as any).__auralysRestoring = true; // cegah efek persist menimpa data impor sebelum reload
        try { writes.forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v))); }
        catch { (window as any).__auralysRestoring = false; showToast('Penyimpanan penuh, gagal memulihkan'); return; }
        showToast('Dipulihkan, memuat ulang...');
        setTimeout(() => location.reload(), 700);
      } catch { showToast('File cadangan tidak valid'); }
    });
  };

  return (
    <div className="pb-32 pt-1">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={back} className="p-2 -ml-2 text-[#f4eceb] active:scale-90" aria-label="Kembali"><ArrowLeft size={24} /></button>
        <h1 className="ds-title !text-[24px]">{titles[view]}</h1>
      </div>

      {view === 'root' && (
        <>
          <Group label="Aktivitas">
            <NavRow icon={<BarChart3 size={20} />} title="Statistik waktu dengar" desc="Total, harian, lagu & artis teratas" onClick={() => { setStatsTab('stats'); setView('stats'); }} />
            <NavRow icon={<Trophy size={20} />} title="Leaderboard" desc="Peringkat pendengar mingguan & sepanjang waktu" onClick={() => { setStatsTab('leaderboard'); setView('stats'); }} />
          </Group>
          <Group label="Antarmuka">
            <NavRow icon={<Palette size={20} />} title="Tampilan & tema" desc={THEMES.find((t) => t.id === g.theme)?.name} onClick={() => setView('appearance')} />
            {!pwa.installed && <NavRow icon={<MonitorSmartphone size={20} />} title="Pasang aplikasi" desc="Tambahkan Auralys ke layar utama (PWA / APK)" onClick={installApp} />}
          </Group>
          <Group label="Pemutar">
            <NavRow icon={<PlayCircle size={20} />} title="Pemutar dan lirik" desc="Sinkron waktu lirik" onClick={() => setView('player')} />
          </Group>
          <Group label="Data & Privasi">
            <NavRow icon={<ShieldCheck size={20} />} title="Privasi" desc="Hapus riwayat putar" onClick={() => setView('privacy')} />
            <NavRow icon={<HardDrive size={20} />} title="Penyimpanan" desc={`${favorites.length} favorit · ${history.length} riwayat`} onClick={() => setView('storage')} />
            <NavRow icon={<DatabaseBackup size={20} />} title="Pencadangan dan Pemulihan" desc="Ekspor atau pulihkan data" onClick={() => setView('backup')} />
          </Group>
          <Group label="Tentang">
            <NavRow icon={<Info size={20} />} title="Tentang Auralys" desc="Versi 4.0 · YouTube Music · LRCLIB" onClick={() => setView('about')} />
          </Group>
        </>
      )}

      {view === 'stats' && <StatsPage key={statsTab} initial={statsTab} />}

      {view === 'appearance' && (
        <>
          <p className="set-group-label">Pilih tema</p>
          <div role="radiogroup" aria-label="Pilih tema" className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => {
              const on = g.theme === t.id;
              return (
                <button key={t.id} role="radio" aria-checked={on} onClick={() => { set({ theme: t.id }); showToast(`Tema ${t.name}`); }} className="theme-card">
                  <span className="theme-swatch block" style={{ background: `radial-gradient(90% 90% at 20% 15%, ${t.preview[1]}88, transparent 60%), radial-gradient(80% 80% at 90% 95%, ${t.preview[2]}aa, transparent 65%), ${t.preview[0]}` }}>
                    <span className="absolute left-2.5 bottom-2.5 h-2 w-10 rounded-full" style={{ background: t.preview[1] }} />
                    <span className="absolute left-2.5 bottom-6 h-2 w-6 rounded-full opacity-60" style={{ background: t.preview[2] }} />
                    {on && <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent text-ink flex items-center justify-center"><Check size={13} strokeWidth={3} /></span>}
                  </span>
                  <span className="block mt-2 text-[14.5px] font-semibold text-[#f4eceb]">{t.name}</span>
                  <span className="block text-[11.5px] text-muted leading-snug">{t.desc}</span>
                </button>
              );
            })}
          </div>
          <Group label="Gaya tampilan">
            <div role="radiogroup" aria-label="Gaya tampilan">
              <RadioRow title="Liquid Glass" desc="Kaca transparan, blur, dan bias yang bisa digeser" on={g.uiStyle === 'glass'} onClick={() => set({ uiStyle: 'glass' })} />
              <RadioRow title="Editorial (kertas)" desc="Permukaan kartu datar, judul serif, garis tipis" on={g.uiStyle === 'editorial'} onClick={() => set({ uiStyle: 'editorial' })} />
            </div>
          </Group>
          <Group label="Efek kaca">
            <ToggleRow icon={<Droplets size={20} />} title="Efek kaca (blur)" desc="Mengaburkan latar di bar bawah dan dialog. Matikan jika terasa berat." on={g.blurEnabled} onChange={(v) => set({ blurEnabled: v })} />
            {g.blurEnabled && <Slider label="Tingkat blur" value={g.blurIntensity} min={12} max={40} unit="px" onChange={(n) => set({ blurIntensity: n })} />}
          </Group>
          <Group label="Warna">
            <ToggleRow icon={<PaintBucket size={20} />} title="Tema dinamis" desc="Hanya tema Auralys Rose: warna mengikuti cover lagu." on={g.dynamicTheme} onChange={(v) => set({ dynamicTheme: v })} />
            <ToggleRow icon={<Paintbrush size={20} />} title="Warna ikon dinamis" desc="Warna bilah status peramban mengikuti tema." on={g.dynamicIcon} onChange={(v) => set({ dynamicIcon: v })} />
          </Group>
          <Group label="Gerak & tata letak">
            <ToggleRow icon={<Layers size={20} />} title="Latar mesh dinamis" desc="Cahaya lembut bergerak di belakang konten." on={g.dynamicMesh} onChange={(v) => set({ dynamicMesh: v })} />
            {g.dynamicMesh && <Slider label="Kecepatan mesh" value={Math.round(g.meshSpeed * 10)} min={5} max={20} unit="" format={(n) => `${(n / 10).toFixed(1)}×`} onChange={(n) => set({ meshSpeed: n / 10 })} />}
            <ToggleRow icon={<Gauge size={20} />} title="Refresh rate tinggi" desc="Animasi penuh agar lebih halus (mis. 120Hz)." on={g.highRefresh} onChange={(v) => set({ highRefresh: v })} />
            <ToggleRow icon={<Smartphone size={20} />} title="Tata letak landscape" desc="Perlebar tampilan pada mode landscape." on={g.landscape} onChange={(v) => set({ landscape: v })} />
          </Group>
          <Group label="Pemutar mini">
            <ToggleRow icon={<PlayCircle size={20} />} title="Desain mini-player baru" desc="Bentuk lebih ringkas dengan sudut membulat." on={g.newMiniPlayer} onChange={(v) => set({ newMiniPlayer: v })} />
            <ToggleRow icon={<Vibrate size={20} />} title="Getaran haptik" desc="Getar singkat saat berpindah tab (jika perangkat mendukung)." on={g.hapticFeedback} onChange={(v) => set({ hapticFeedback: v })} />
          </Group>
        </>
      )}

      {view === 'player' && (
        <Group label="Sinkron lirik">
          <div className="set-row">
            <IconTile><Languages size={20} /></IconTile>
            <span className="flex-1 min-w-0">
              <span className="block text-[15.5px] font-semibold text-[#f4eceb]">Penyesuaian waktu lirik</span>
              <span className="block text-[12.5px] text-muted leading-snug mt-0.5">Geser jika lirik terasa lebih cepat atau lebih lambat dari suara. Juga tersedia di layar lirik.</span>
            </span>
          </div>
          <Slider label="Offset" value={Math.round(lyricOff * 20)} min={-30} max={30} unit="" format={(n) => `${n > 0 ? '+' : ''}${(n / 20).toFixed(2)}s`} onChange={(n) => lyricOffset.set(n / 20)} />
          <button className="set-row" onClick={() => lyricOffset.set(0)}>
            <span className="flex-1 text-[15px] font-semibold text-accent">Setel ulang ke 0</span>
          </button>
        </Group>
      )}

      {view === 'privacy' && (
        <Group label="Data lokal">
          <button className="set-row" onClick={() => { clearHistory(); showToast('Riwayat dihapus'); }}>
            <IconTile><Trash2 size={20} /></IconTile>
            <span className="flex-1">
              <span className="block text-[15.5px] font-semibold">Hapus riwayat putar</span>
              <span className="block text-[12.5px] text-muted">{history.length} lagu tersimpan di perangkat ini</span>
            </span>
          </button>
        </Group>
      )}

      {view === 'storage' && (
        <Group label="Tersimpan di perangkat">
          <div className="set-row"><span className="flex-1 text-[15.5px] font-semibold">Lagu favorit</span><span className="font-mono text-accent">{favorites.length}</span></div>
          <div className="set-row"><span className="flex-1 text-[15.5px] font-semibold">Riwayat putar</span><span className="font-mono text-accent">{history.length}</span></div>
        </Group>
      )}

      {view === 'backup' && (
        <Group label="Cadangkan & pulihkan">
          <button className="set-row" onClick={exportData}>
            <IconTile><Download size={20} /></IconTile>
            <span className="flex-1"><span className="block text-[15.5px] font-semibold">Ekspor cadangan</span><span className="block text-[12.5px] text-muted">Favorit, riwayat, dan pengaturan (.json)</span></span>
          </button>
          <label className="set-row cursor-pointer">
            <IconTile><Upload size={20} /></IconTile>
            <span className="flex-1"><span className="block text-[15.5px] font-semibold">Pulihkan dari file</span><span className="block text-[12.5px] text-muted">Pilih file cadangan Auralys</span></span>
            <input type="file" accept="application/json" className="hidden" onChange={(e) => importData(e.target.files?.[0])} />
          </label>
        </Group>
      )}

      {view === 'about' && (
        <Group label="Auralys">
          <div className="p-5 text-[14px] text-[#e9dfde] leading-relaxed">
            Pemutar musik bergaya Liquid Glass dengan warna dinamis dari cover. Data lagu dari YouTube Music, lirik dari YouTube Music / LRCLIB.
          </div>
        </Group>
      )}
    </div>
  );
};
