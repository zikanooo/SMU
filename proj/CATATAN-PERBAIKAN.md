# Perbaikan: lagu tidak bisa diputar ("Pemilik video melarang putar di aplikasi lain")

## Akar masalah
1. Lagu resmi label (mis. Drake) sering melarang embed YouTube (error 101/150/153). Kode lama langsung
   mencari *upload lain* dulu; upload lain dari label yang sama biasanya diblokir juga, dan lagu yang sama
   persis tidak pernah dicoba lewat stream server sebelum pencarian selesai.
2. `/stream/:id` hanya memakai satu klien YouTube (ANDROID_VR). Jika ditolak, seluruh fallback mati.
3. Stream yang menggantung (tanpa error) membuat player diam selamanya.
4. `onError` iframe bisa terpicu dua kali dan menabrak stream yang sudah berjalan.

## Perubahan
- `src/context/MusicContext.tsx`: urutan fallback baru = stream server (lagu sama) -> upload identik -> versi mirip -> lewati;
  watchdog 12 dtk untuk stream; abaikan `onError` iframe saat sudah pindah ke stream; reset penghitung gagal saat berbunyi.
- `server/ytm.ts`: `audioSource` mencoba beberapa klien (ANDROID_VR, IOS, TV embed) dan mengembalikan User-Agent klien.
- `server/router.ts`: `/stream/:id` mencoba sampai 3 klien jika URL ditolak (403 dll) dan memakai UA yang cocok.

## Catatan
Stream server bergantung pada YouTube menerima IP server Anda. Di hosting datacenter (mis. Vercel) YouTube bisa
meminta login/bot-check; cek log `[api] /stream` dan pesan error di respons `/music-api/stream/<id>`.

## Upgrade UI (/upgradeui)
- Toast: dipusatkan, aman terhadap notch/status bar (`env(safe-area-inset-top)`), mendukung teks panjang, `role="status"`.
- Hasil pencarian: baris lagu aktif diberi sorotan gradien aksen + indikator equalizer di sampul (berhenti saat jeda, statis bila "reduce motion"), umpan balik sentuh `active:bg`.

## Upgrade UI v2 (/designsystem + /optimize)
- **Login dipindah dari Pengaturan** ke tombol akun 👤 (`AccountButton`) di header Beranda, Explore, dan Pustaka. Tombol membuka `AccountSheet`
  (bottom sheet, bisa digeser untuk menutup / Esc): belum masuk = tombol "Masuk dengan Google"; sudah masuk = foto, ganti/hapus foto, Pengaturan, Keluar.
- **Design system** di akhir `src/index.css`: token (spasi, radius, tipografi, surface) + kelas `ds-title`, `ds-eyebrow`, `ds-card`, `ds-btn`, `ds-icon-btn`, `ds-sheet`.
- **`PageHeader`** seragam untuk semua halaman utama; `Avatar` dan `LoginCard` dipisah ke `src/components/`.
- **Optimasi**: AccountSheet di-lazy-load; chunk `firebase` terpisah; `content-visibility:auto` pada baris daftar; `decoding="async"` pada sampul.

## Upgrade UI v3
- **Buat playlist = popup**: `CreatePlaylistDialog` (kolom nama, tombol Batal/Buat, fokus otomatis, Esc menutup). Dipakai di Pustaka dan di menu titik tiga lagu ("Playlist baru" langsung memasukkan lagu).
- **Mini player**: garis progres dihapus; progres kini berupa cincin bulat di sekeliling tombol putar/jeda.
- **Full player, mode lirik**: lirik lebih lapang; baris judul lagu + artis + tombol suka (love) + titik tiga ada di bawah lirik tepat di atas bar durasi. Tombol kecil "tutup lirik" dihapus; tutup lewat tombol Lirik.

## Upgrade UI v4 (full player)
- Judul 22px maks. 2 baris (tidak lagi terdesak tombol), artis di bawahnya; tombol Suka jadi ikon bulat + titik tiga bulat sejajar.
- Sampul sedikit lebih besar; bar durasi lebih tebal; tombol putar putih solid; tombol bawah (Lirik/Antrean/Bagikan/Waktu tidur) lebih ringkas.
- Catatan font: `Alimasag.ttf` ternyata font emoji (Apple Color Emoji, 35 MB, tanpa huruf/angka) sehingga tidak dipakai untuk teks.

## Upgrade UI v5 (teks)
- **Pilihan cepat (Beranda)**: judul panjang meluber 3-4 baris karena `block` menimpa `line-clamp-2`. Diganti kelas `.qt-title` (maks. 2 baris, artis 1 baris), tinggi kartu 64px.
- Letter-spacing judul dilonggarkan (`tracking-tight` -0.01em) dan line-height judul 1.25-1.3 agar teks tidak terlihat tinggi/rapat; label durasi diberi jarak dari bar.
- Mini player & tab bar lebih pekat, scrim bawah lebih kuat sehingga teks daftar tidak tembus ke belakangnya.

## v7 — Profil sosial + optimasi
- **Halaman profil** (`UserProfile.tsx`): banner gradien tema, foto, nama, bio, hitungan Pengikut/Mengikuti/Menit didengar. Buka dari Akun → "Lihat & edit profil", atau ketuk nama di Leaderboard.
- **Edit profil**: ganti foto, nama (maks 30), bio (maks 160). Tersimpan di Firestore `users/{uid}` (field `name`, `nameLower`, `bio`).
- **Saling follow**: Ikuti/Berhenti mengikuti, daftar Pengikut & Mengikuti, **Cari teman** (awalan nama). Data: `users/{uid}/following/{id}` dan `users/{uid}/followers/{id}` (hanya `at`).
- **WAJIB: tempel ulang `firestore.rules` ke Firebase Console → Firestore → Rules → Publish.** Tanpa itu profil/follow gagal.
- Sinkron waktu dengar tidak lagi menimpa nama/foto kustom di `users`.
- **Optimasi**: panel daftar tanpa `backdrop-filter`, blur pil dikurangi (16px), latar FullPlayer tanpa blur layar penuh, transisi halaman tanpa `mode="wait"`, `touch-action: manipulation`, lapisan GPU untuk bar bawah.

## Debug v7.1 (ZYVIBE /debug)
- `leaderboard.ts`: sinkron waktu dengar dikirim per potongan ≤ 20.000 dtk. Sebelumnya tumpukan > 21.600 dtk (mis. dengar 6+ jam sebelum login pertama) ditolak aturan Firestore dan macet selamanya.
- `social.ts` `ensureProfile`: `setDoc` + `merge` + `increment(0)` supaya tidak bentrok dengan sinkron statistik yang membuat dokumen lebih dulu (dulu: permission-denied, `nameLower` tak pernah terisi).
- `AuthContext.tsx`: efek sinkron hanya bergantung pada `uid` (dulu restart + kirim ulang tiap profil/foto berubah).
- `UserProfile.tsx`: `Row` bukan lagi komponen yang didefinisikan di dalam render (dulu semua baris dibuat ulang tiap render, berkedip dan kehilangan fokus tap).

## Debug server v7.2 (ZYVIBE /deep /debug)
Diuji dengan stub Express + server "YouTube palsu" (bukan YouTube asli); hasil sebelum vs sesudah ada di laporan chat.
- `server/router.ts` `/stream/:id`:
  - Batas waktu 15 dtk dulu berlaku untuk SELURUH badan audio, jadi lagu terputus di detik ke-15. Sekarang hanya menunggu header (10 dtk).
  - Klien yang gagal karena timeout/jaringan tidak dicatat sebagai "ditolak", sehingga klien yang sama dicoba lagi dan klien lain tidak pernah dicoba. Diperbaiki.
  - URL cache yang kedaluwarsa (403) tidak lagi mencoret klien; diambil ulang dulu dengan klien yang sama.
  - Badan respons yang ditolak dibatalkan (tidak bocor koneksi); koneksi ke YouTube ikut diputus saat pemutar menutup; `Accept-Encoding: identity`; `content-type` cadangan; pesan error memuat alasan tiap klien.
- `server/ytm.ts`:
  - `post()` mengulang sampai 2x untuk timeout/jaringan/429/5xx (dulu sekali gagal langsung error).
  - Klien audio: ANDROID_VR 1.62.27 -> WEB_EMBEDDED -> IOS. TV_EMBED dibuang (dilaporkan rusak oleh yt-dlp, Jan 2026). Timeout per klien 9 dtk -> 5 dtk.
- `server/app.ts`: `/_status` kini jalan juga di server lokal; penangkap error terakhir (JSON, tanpa bocor stack).
- `server.ts`: `unhandledRejection`/`uncaughtException` dicatat (Node 22 mematikan proses); pesan jelas bila port terpakai.
- `together-relay.ts`: URL rusak tidak melempar error; error tulis SSE ditangkap.
- `MusicContext.tsx`: watchdog stream 12 -> 18 dtk agar server sempat mencoba beberapa klien.

## Fitur baru v7.3 — Impor playlist Spotify
- `server/spotify.ts` (baru): baca playlist publik (API resmi bila `SPOTIFY_CLIENT_ID/SECRET` diisi, jika tidak/gagal -> halaman embed `open.spotify.com/embed/playlist/<id>`), lalu `matchTrack` mencocokkan ke YouTube Music dengan skor judul/artis/durasi dan penalti versi live/cover/karaoke/remix.
- `server/router.ts`: `GET /spotify/playlist?url=` dan `GET /spotify/match?title=&artists=a|b&dur=` (cache 5 menit / 1 hari). Galat pengguna (tautan salah, playlist privat) dibalas 400/422 agar klien tidak mengulang.
- `src/services/api.ts`: `MusicApi.spotifyPlaylist`, `MusicApi.spotifyMatch`.
- `src/components/ImportSpotifyDialog.tsx` (baru): tempel tautan -> pratinjau -> progres (4 permintaan paralel) -> ringkasan + daftar lagu tak ditemukan. X/Esc saat berjalan = batal tanpa menyimpan; "Hentikan & simpan" = simpan yang sudah cocok.
- `MusicContext.tsx`: `importPlaylist(name, songs)` (membuang duplikat). `LibraryPage.tsx`: tombol "Impor dari Spotify".
- Diuji: parsing tautan, parser embed, dan pemilihan kandidat dengan YouTube tiruan. BELUM diuji ke Spotify/YouTube asli (jaringan tidak tersedia saat pengembangan).

