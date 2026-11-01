import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { handleTogether } from './together-relay';
import { apiApp } from './server/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Node 22 menutup proses pada promise tak tertangani; cukup dicatat agar server tetap hidup
process.on('unhandledRejection', (e) => console.warn('[server] unhandledRejection:', (e as any)?.message || e));
process.on('uncaughtException', (e) => console.error('[server] uncaughtException:', e?.message || e));

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Relay "Dengar bersama" (real-time antar-perangkat) — harus sebelum Vite
app.use((req, res, next) => { if (!handleTogether(req, res)) next(); });

// API: scraper YouTube Music (InnerTube) langsung di proses Node — tanpa Python
app.use(['/music-api', '/api'], apiApp);

async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(__dirname, 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('[server] folder dist/ belum ada. Jalankan "npm run build" dulu.');
    }
    app.get('/sw.js', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.type('application/javascript').sendFile(path.join(dist, 'sw.js')); });
    app.get('/manifest.webmanifest', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.type('application/manifest+json').sendFile(path.join(dist, 'manifest.webmanifest')); });
    app.use(express.static(dist, { setHeaders: (res, file) => { if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  const srv = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Auralys running on http://0.0.0.0:${PORT}`);
  });
  srv.on('error', (e: any) => {
    console.error(e?.code === 'EADDRINUSE' ? `[server] port ${PORT} sudah dipakai. Ganti dengan PORT=3001 npm run dev` : `[server] ${e?.message || e}`);
    process.exit(1);
  });
}

startServer();
