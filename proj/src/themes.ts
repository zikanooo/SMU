export type ThemeId = 'auralys' | 'aurora' | 'sunset' | 'nebula';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  desc: string;
  /** null = ikuti warna cover lagu (jika "Tema dinamis" aktif) */
  hue: number | null;
  vars: Record<string, string>;
  /** untuk pratinjau kartu pemilih tema */
  preview: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  {
    id: 'auralys', name: 'Auralys Rose', desc: 'Klasik, warna mengikuti cover', hue: null,
    preview: ['#0d0b0c', '#f2b3c6', '#8a3a5e'],
    vars: { '--bg': '#0d0b0c', '--sheet': '#1a1618', '--glass-bg': 'rgba(52,46,49,0.52)', '--muted': '#b4aaae', '--acc-s': '62%', '--acc-l': '80%', '--tint-s': '30%', '--tint-l': '13%', '--glow-s': '55%', '--hue-shift': '40' },
  },
  {
    id: 'aurora', name: 'Aurora', desc: 'Hijau zamrud & biru es', hue: 165,
    preview: ['#050d0c', '#6fe3c4', '#1f6f8f'],
    vars: { '--bg': '#050d0c', '--sheet': '#0f1a19', '--glass-bg': 'rgba(20,44,42,0.5)', '--muted': '#9db5b1', '--acc-s': '62%', '--acc-l': '70%', '--tint-s': '48%', '--tint-l': '10%', '--glow-s': '65%', '--hue-shift': '45' },
  },
  {
    id: 'sunset', name: 'Sunset', desc: 'Jingga hangat & merah muda', hue: 22,
    preview: ['#0f0807', '#ffa772', '#d4406f'],
    vars: { '--bg': '#0f0807', '--sheet': '#1d1210', '--glass-bg': 'rgba(60,34,30,0.52)', '--muted': '#bfa9a2', '--acc-s': '92%', '--acc-l': '72%', '--tint-s': '52%', '--tint-l': '12%', '--glow-s': '88%', '--hue-shift': '-35' },
  },
  {
    id: 'nebula', name: 'Nebula', desc: 'Ungu malam & magenta', hue: 268,
    preview: ['#09061a', '#c6a4ff', '#b03bd1'],
    vars: { '--bg': '#09061a', '--sheet': '#150f2b', '--glass-bg': 'rgba(38,28,70,0.52)', '--muted': '#aaa3c6', '--acc-s': '88%', '--acc-l': '78%', '--tint-s': '52%', '--tint-l': '13%', '--glow-s': '80%', '--hue-shift': '60' },
  },
];

export const getTheme = (id?: string): ThemeDef => THEMES.find((t) => t.id === id) ?? THEMES[0];
