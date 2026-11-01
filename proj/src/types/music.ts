export interface Artist {
  id?: string;
  name: string;
  subscribers?: string;
  thumbnail?: string;
  banner?: string;
  bio?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  year?: string;
  thumbnail?: string;
  tracksCount?: number;
  description?: string;
  tracks?: Song[];
}

export interface Song {
  id: string;
  videoId?: string;
  title: string;
  artists: { name: string; id?: string }[];
  album?: { name: string; id?: string };
  duration?: string;
  durationSeconds?: number;
  thumbnail: string;
  streamUrl?: string;
  accentColor?: string;
  liked?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
  createdAt: number;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  isSynced: boolean;
  plainLyrics: string;
  syncedLyrics: LyricLine[];
  source?: string;
}

export type TabType = 'home' | 'explore' | 'search' | 'library' | 'profile' | 'together';

export type RepeatMode = 'off' | 'all' | 'one';

export interface GlassSettings {
  theme: 'auralys' | 'aurora' | 'sunset' | 'nebula'; // pilihan tema warna
  blurIntensity: number; // 10 to 40
  refractionStrength: number; // 0 to 40
  meshSpeed: number; // 0.5 to 2
  dynamicMesh: boolean;
  hapticFeedback: boolean;
  audioQuality: 'high' | 'normal' | 'lossless';
  blurEnabled: boolean;      // efek kaca (blur)
  dynamicTheme: boolean;     // warna aplikasi mengikuti cover
  dynamicIcon: boolean;      // warna ikon/theme-color mengikuti cover
  highRefresh: boolean;      // animasi 120Hz (mengaktifkan animasi lebih halus)
  landscape: boolean;        // tata letak lebar saat landscape
  uiStyle: 'glass' | 'editorial'; // gaya tampilan
  newMiniPlayer: boolean;    // desain mini-player baru
}

export type SearchItem =
  | (Song & { kind: 'song' | 'video' })
  | (Album & { kind: 'album' })
  | (Artist & { kind: 'artist' });
