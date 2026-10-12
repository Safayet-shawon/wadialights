// Production Node server for Docker / any VM: serves the built site (dist/) and the /api routes.
// Brotli/gzip compression, long-lived caching for hashed assets, security headers, graceful shutdown.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { brotliCompress, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dispatch } from './lib/routes.js';
import { pageFor } from './lib/pages.js';
import { closePool } from './lib/db.js';

const br = promisify(brotliCompress), gz = promisify(gzip);
const PORT = Number(process.env.PORT) || 3000;
const DIST = resolve(process.env.DIST_DIR || 'dist');
const MAX_BODY = 128 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolveBody(undefined);
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function send(req, res, status, buf, headers) {
  const accept = String(req.headers['accept-encoding'] || '');
  const type = String(headers['Content-Type'] || '');
  const compressible = buf.length > 1024 && /json|text|javascript|xml|svg/.test(type);
  let body = buf;
  if (compressible) {
    if (/\bbr\b/.test(accept)) { body = await br(buf); headers['Content-Encoding'] = 'br'; }
    else if (/\bgzip\b/.test(accept)) { body = await gz(buf); headers['Content-Encoding'] = 'gzip'; }
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function handleApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  let body;
  if (req.method === 'POST' || req.method === 'PATCH') {
    try { body = await readBody(req); } catch (e) {
      return send(req, res, e.status || 400, Buffer.from(JSON.stringify({ error: 'bad_request' })), { ...SECURITY, 'Content-Type': 'application/json' });
    }
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const out = await dispatch(name, { method: req.method, query: Object.fromEntries(url.searchParams), body, ip, headers: req.headers });
  return send(req, res, out.status, Buffer.from(JSON.stringify(out.body)), { ...SECURITY, ...out.headers, 'Content-Type': 'application/json; charset=utf-8' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let file = normalize(join(DIST, rel));
  if (file !== DIST && !file.startsWith(DIST + sep)) return send(req, res, 403, Buffer.from('forbidden'), { ...SECURITY, 'Content-Type': 'text/plain' });
  let status = 200;
  const page = pageFor(url.pathname);
  if (page) file = join(DIST, page);
  else if (!existsSync(file) || statSync(file).isDirectory()) { file = join(DIST, '404.html'); status = 404; if (!existsSync(file)) file = join(DIST, 'index.html'); }
  const ext = extname(file);
  const st = statSync(file);
  const hashed = /\/assets\//.test(file.replace(/\\/g, '/'));
  const headers = {
    ...SECURITY,
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=604800, stale-while-revalidate=86400',
    'Last-Modified': st.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
  };
  if (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']) >= new Date(st.mtime.toUTCString())) { res.writeHead(304, headers); return res.end(); }

  // byte ranges: required for <video> seeking
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (range && !COMPRESSIBLE.has(ext)) {
    const start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
    const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    return req.method === 'HEAD' ? res.end() : createReadStream(file, { start, end }).pipe(res);
  }
  if (COMPRESSIBLE.has(ext)) {
    return import('node:fs/promises').then(({ readFile }) => readFile(file)).then((buf) => send(req, res, status, buf, headers));
  }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  return req.method === 'HEAD' ? res.end() : createReadStream(file).pipe(res);
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, Buffer.from('method not allowed'), { ...SECURITY, 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
    return serveStatic(req, res, url);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/plain' }); }
    res.end('server error');
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  server.keepAliveTimeout = 65_000;                        // longer than typical load-balancer idle timeouts
  server.listen(PORT, '0.0.0.0', () => console.log(`wadia listening on :${PORT} (dist: ${DIST})`));
  const stop = (sig) => {
    console.log(`${sig}: shutting down`);
    server.close(async () => { await closePool(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
