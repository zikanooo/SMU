/* Service worker Auralys: shell offline + cache aset. API musik & YouTube TIDAK pernah di-cache. */
const VERSION = 'auralys-v4';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                       // YouTube, gambar cover, font, Firebase: biarkan jaringan
  if (/^\/(music-api|api|together)(\/|$)/.test(url.pathname)) return;    // API & relay real-time: selalu online
  if (req.headers.has('range')) return;                                  // streaming audio

  // Navigasi: jaringan dulu, jatuh ke index.html tersimpan saat offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); return res; })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // Aset build (nama berhash) & ikon: cache dulu, perbarui di latar belakang
  e.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
