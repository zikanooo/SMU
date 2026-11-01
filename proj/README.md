# 🌊 Auralys Music v4

Pemutar musik PWA bergaya **Liquid Glass (iOS 26)** — semua data **real-time langsung dari YouTube Music**,
diputar lewat **YouTube IFrame Player**. Backend kini **100% Node/TypeScript** (tanpa Python, tanpa yt-dlp).

## Yang baru di v4
- **Backend scraper baru** (`server/`): memanggil endpoint InnerTube `music.youtube.com/youtubei/v1` langsung
  (search, home, charts, album, artis, radio/"next", saran pencarian) + lirik tersinkron via LRCLIB.
- **Real-time**: beranda dimuat ulang tiap 60 dtk (hanya saat layar terlihat), badge **LIVE · x dtk lalu**,
  artis pilihan & viral TikTok tiap 3 menit, halaman artis tiap 60 dtk.
- **Lebih mulus**: cache *stale-while-revalidate* di server (respons instan, data diperbarui di latar belakang),
  penggabungan request kembar di klien, halaman & pemutar penuh di-*lazy-load*, `content-visibility`,
  blur lebih ringan di ponsel, snap carousel, skeleton shimmer.
- **Tampilan lebih rapi**: chip, kaca, fokus, gambar fade-in, tipografi seimbang (`text-wrap: balance`).

## Impor playlist Spotify
Pustaka → **Impor dari Spotify** → tempel tautan playlist **publik** → pratinjau → Impor.
Tiap lagu dicarikan padanannya di YouTube Music (judul + artis + durasi; versi live/cover/remix/karaoke dihindari
kecuali memang itu judulnya), lalu disimpan sebagai playlist lokal baru. Lagu yang tidak ketemu ditampilkan di akhir.
- Tanpa kunci API: dibaca dari halaman embed publik Spotify (±100 lagu pertama).
- Dengan `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` di `.env`: memakai Web API resmi (sampai 500 lagu).
- Playlist privat / buatan Spotify tertentu bisa ditolak Spotify; tautan pendek `spotify.link` belum didukung.

## Struktur
```
server.ts            Express: relay "Dengar bersama" + API + Vite/dist
server/ytm.ts        Scraper InnerTube + parser (deep-walk, tahan perubahan JSON)
server/spotify.ts    Impor playlist Spotify (baca daftar lagu + pencocokan ke YouTube Music)
server/router.ts     Endpoint /spotify/playlist /spotify/match, /home /search /album /artist /related /lyrics /stream ... + cache SWR
server/app.ts        App Express khusus API (dipakai lokal & Vercel)
api/index.ts         Entry Vercel (Node serverless)
src/                 Frontend React + Tailwind v4
```

## Menjalankan
```bash
npm install
npm run dev      # http://localhost:3000  (frontend + API)
npm run prod     # build + jalankan produksi
```
Opsional di `.env`: `YTM_LOCATION="ID"`, `YTM_CHART_COUNTRY="ID"` (atau `ZZ` global), `YTM_LANG="id"`.

## Deploy Vercel
Preset **Vite**. `vercel.json` sudah mengarahkan `/music-api/*` ke `api/index.ts`.
Catatan: relay "Dengar bersama" (`together-relay.ts`) butuh server Node yang terus menyala (bukan serverless).

## Catatan penting
- Ini scraping endpoint **tidak resmi** YouTube Music: struktur bisa berubah sewaktu-waktu.
  Parser dibuat toleran, tetapi jika sebuah bagian kosong, cek `server/ytm.ts`.
- Pemutaran utama memakai IFrame. `/stream/:id` (cadangan pemutaran latar belakang) memakai klien
  `ANDROID_VR` dan bisa ditolak YouTube dari IP datacenter tertentu — jika gagal, IFrame tetap jalan.
- Firebase (login/leaderboard) & PWA/TWA tidak berubah (lihat `PANDUAN-PWA-APK.md`).
