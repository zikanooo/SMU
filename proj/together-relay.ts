// Relay "Dengar bersama": penyiar pesan antar-perangkat lewat Server-Sent Events + POST.
// Tanpa dependensi tambahan (hanya modul http Node). Dipakai oleh server.ts.
import type { IncomingMessage, ServerResponse } from 'http';

const ROOM_RE = /^[A-Z0-9]{4,12}$/;
const MAX_BODY = 16 * 1024;
const MAX_ROOMS = 2000;
const MAX_PER_ROOM = 50;

const rooms = new Map<string, Set<ServerResponse>>();

function roomOf(url: URL): string | null {
  const r = (url.searchParams.get('room') || '').toUpperCase();
  return ROOM_RE.test(r) ? r : null;
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { resolve(null); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/** Mengembalikan true bila permintaan ditangani (milik relay). */
export function handleTogether(req: IncomingMessage, res: ServerResponse): boolean {
  let url: URL;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { return false; }
  if (!url.pathname.startsWith('/together/')) return false;

  if (url.pathname === '/together/ping' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('auralys-together');
    return true;
  }

  if (url.pathname === '/together/stream' && req.method === 'GET') {
    const room = roomOf(url);
    if (!room) { res.writeHead(400).end(); return true; }
    let set = rooms.get(room);
    if (!set) {
      if (rooms.size >= MAX_ROOMS) { res.writeHead(503).end(); return true; }
      set = new Set();
      rooms.set(room, set);
    }
    if (set.size >= MAX_PER_ROOM) { res.writeHead(429).end(); return true; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    set.add(res);
    res.on('error', () => {});
    const ka = setInterval(() => res.write(': ka\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ka);
      const cur = rooms.get(room);
      cur?.delete(res);
      if (cur && cur.size === 0) rooms.delete(room);
    });
    return true;
  }

  if (url.pathname === '/together/send' && req.method === 'POST') {
    const room = roomOf(url);
    if (!room) { res.writeHead(400).end(); return true; }
    readBody(req).then((body) => {
      if (body === null) { res.writeHead(413).end(); return; }
      let line: string;
      try { line = JSON.stringify(JSON.parse(body)); } catch { res.writeHead(400).end(); return; }
      rooms.get(room)?.forEach((r) => r.write(`data: ${line}\n\n`));
      res.writeHead(204).end();
    });
    return true;
  }

  res.writeHead(404).end();
  return true;
}
