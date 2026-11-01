# Auralys: PWA & APK

## 1. Jalankan / deploy
```
npm install
npm run build
npm run start        # atau deploy ke Vercel seperti sebelumnya
```
PWA **wajib HTTPS** (Vercel otomatis; `localhost` juga boleh untuk uji).

## 2. Pasang sebagai PWA (tanpa APK)
- **Android (Chrome):** buka situs → menu ⋮ → *Instal aplikasi* (atau Pengaturan Auralys → Tampilan → *Pasang aplikasi*). Chrome membuat WebAPK sungguhan, ikut muncul di laci aplikasi.
- **iPhone (Safari):** Bagikan → *Tambahkan ke Layar Utama*.
- **Desktop (Chrome/Edge):** ikon pasang di address bar.

## 3. Jadi file .APK
Cara termudah (tanpa Android Studio): **https://www.pwabuilder.com**
1. Masukkan URL situs yang sudah di-deploy → *Package for stores* → *Android*.
2. Unduh paket; di dalamnya ada `.apk` (uji) dan `.aab` (Play Store) + `assetlinks.json`.
3. Taruh `assetlinks.json` di `public/.well-known/assetlinks.json` lalu deploy ulang, supaya bar alamat Chrome hilang (mode TWA penuh).

Alternatif CLI (Bubblewrap): ganti `GANTI-DENGAN-DOMAINMU` di `twa-manifest.json`, lalu
```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://DOMAINMU/manifest.webmanifest
bubblewrap build
```

## 4. Catatan
- Musik & lirik tetap butuh internet (API YouTube Music); yang di-cache hanya tampilan aplikasi.
- Setelah update, service worker baru aktif saat aplikasi dibuka ulang. Naikkan `VERSION` di `public/sw.js` bila perlu memaksa refresh cache.

## 5. Musik di latar belakang & foto profil
- **Musik tetap menyala** saat kamu pindah app, kunci layar, atau minimize web/APK: begitu app disembunyikan, Auralys otomatis pindah dari pemutar YouTube ke stream audio server di posisi lagu yang sama, lalu lagu berikutnya ikut lanjut. Kontrol di notifikasi / lockscreen (play, pause, next, prev, geser) aktif lewat Media Session.
  - Syarat: **endpoint `/stream` harus jalan** (scraper Node). Tanpa itu, YouTube tetap berhenti saat di latar belakang.
  - Jika app **di-swipe tutup** dari daftar recent, musik berhenti (batasan PWA/TWA).
- **Foto profil**: Pengaturan → kartu profil di atas → *Upload foto* (atau ketuk avatarnya). Foto dipangkas persegi 160px dan disimpan di perangkat; jika sudah login, ikut tampil di leaderboard.
  - Setelah update, **deploy ulang `firestore.rules`** (ada batas ukuran foto 40 KB).
