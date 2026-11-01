import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { api } from './router.js';

/** App Express berisi API saja — dipakai server.ts (lokal) dan api/index.ts (Vercel). */
export const apiApp = express();
apiApp.disable('x-powered-by');
apiApp.get(['/_status', '/music-api/_status', '/api/_status'], (_req, res) => res.json({ ok: true, engine: 'innertube' }));
apiApp.use(['/music-api', '/api'], api);
apiApp.use('/', api); // jaga-jaga bila platform sudah memotong prefix

// 404 JSON (bukan HTML) agar klien tahu API hidup tapi rute salah
apiApp.use((req, res) => res.status(404).json({ status: 'error', detail: `Rute tidak ada: ${req.path}` }));

// Penangkap error terakhir: selalu JSON, tidak membocorkan stack, dan tidak menjatuhkan proses
apiApp.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.warn('[api] error tak tertangani:', err?.message || err);
  if (res.headersSent) { try { res.end(); } catch { /* tertutup */ } return; }
  res.status(500).json({ status: 'error', detail: 'Terjadi kesalahan di server' });
});
