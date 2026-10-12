import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// no database in tests: the API must degrade honestly (demo catalogue, 503 on writes)
delete process.env.POSTGRES_URL; delete process.env.DATABASE_URL; delete process.env.SUPABASE_DB_URL;
const dist = mkdtempSync(join(tmpdir(), 'wadia-dist-'));
mkdirSync(join(dist, 'assets')); mkdirSync(join(dist, 'videos'));
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>x</title>' + 'a'.repeat(3000));
writeFileSync(join(dist, 'assets', 'app-abc.js'), 'console.log(1);'.repeat(200));
writeFileSync(join(dist, 'videos', 'clip.mp4'), Buffer.alloc(5000, 7));
process.env.DIST_DIR = dist;

const { server } = await import('../index.js');
let base;
before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise((r) => server.close(r)));

const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('GET /api/products: demo catalogue, paginated, cacheable', async () => {
  const r = await fetch(`${base}/api/products?limit=4`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /s-maxage=300/);
  const j = await r.json();
  assert.equal(j.items.length, 4); assert.equal(j.total, 15); assert.equal(j.pages, 4); assert.equal(j.source, 'demo');
  const p4 = await (await fetch(`${base}/api/products?limit=4&page=4`)).json();
  assert.equal(p4.items.length, 3);
});

test('products: category filter, search, bad input is sanitised', async () => {
  const cat = await (await fetch(`${base}/api/products?category=floor`)).json();
  assert.equal(cat.total, 3); assert.ok(cat.items.every((p) => p.category === 'floor'));
  const q = await (await fetch(`${base}/api/products?q=linen`)).json();
  assert.ok(q.total >= 1);
  const bad = await (await fetch(`${base}/api/products?category=drop%20table&page=-5&limit=9999`)).json();
  assert.equal(bad.page, 1); assert.equal(bad.limit, 24); assert.equal(bad.total, 15);
});

test('POST /api/plan: runs the matrix model and memoises', async () => {
  const body = { length: 5, width: 4, height: 2.6, purpose: 'living' };
  const a = await post('/api/plan', body); const b = await post('/api/plan', body);
  assert.equal(a.status, 200);
  const j = await a.json();
  assert.ok(j.lumenMethod.fixtures >= 1 && j.grid.lux.length > 0);
  assert.deepEqual(await b.json(), j);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.ok(health.cache.plans.hits >= 1, 'second call should be a cache hit');
});

test('POST /api/inquiries: validation, honeypot, no-database and rate limiting', async () => {
  const bad = await post('/api/inquiries', { name: '', email: 'nope', message: 'x' });
  assert.equal(bad.status, 422);
  const fields = (await bad.json()).fields;
  assert.ok(fields.name && fields.email && fields.message);

  const bot = await post('/api/inquiries', { name: 'a', email: 'a@b.co', message: 'hello there', website: 'http://spam' });
  assert.equal(bot.status, 202);

  const ok = { name: 'Asha', email: 'asha@example.com', message: 'I need lights for a hallway', room: 'hallway' };
  const nodb = await post('/api/inquiries', ok, { 'x-forwarded-for': '9.9.9.9' });
  assert.equal(nodb.status, 503);                                     // valid, but no database is connected
  assert.equal((await nodb.json()).error, 'database_unavailable');

  let last;
  for (let i = 0; i < 6; i++) last = await post('/api/inquiries', ok, { 'x-forwarded-for': '7.7.7.7' });
  assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after'));
});

test('POST /api/subscribe validates', async () => {
  assert.equal((await post('/api/subscribe', { email: 'bad' })).status, 422);
  assert.equal((await post('/api/subscribe', { email: 'ok@example.com' }, { 'x-forwarded-for': '5.5.5.5' })).status, 503);
});

test('routing: 404, 405, bad JSON, oversized body', async () => {
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/__proto__`)).status, 404);
  const m = await fetch(`${base}/api/inquiries`); assert.equal(m.status, 405); assert.equal(m.headers.get('allow'), 'POST');
  const bj = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(bj.status, 400);
  const big = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(200_000) }) }).catch(() => ({ status: 413 }));
  assert.ok([413, 400].includes(big.status));
});

test('static: compression, immutable assets, SPA fallback, ranges, traversal blocked', async () => {
  const html = await fetch(`${base}/`, { headers: { 'accept-encoding': 'br' } });
  assert.equal(html.status, 200); assert.equal(html.headers.get('content-encoding'), 'br'); assert.equal(html.headers.get('cache-control'), 'no-cache');
  const js = await fetch(`${base}/assets/app-abc.js`);
  assert.match(js.headers.get('cache-control'), /immutable/);
  const spa = await fetch(`${base}/some/route`); assert.equal(spa.status, 404);
  const rng = await fetch(`${base}/videos/clip.mp4`, { headers: { range: 'bytes=100-199' } });
  assert.equal(rng.status, 206); assert.equal(rng.headers.get('content-range'), 'bytes 100-199/5000'); assert.equal((await rng.arrayBuffer()).byteLength, 100);
  const trav = await fetch(`${base}/..%2f..%2fpackage.json`);
  const text = await trav.text();
  assert.ok(!text.includes('"dependencies"'), 'must never serve files outside dist');
  assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
});

test('GET /api/health reports the database as not configured', async () => {
  const j = await (await fetch(`${base}/api/health`)).json();
  assert.equal(j.ok, true); assert.equal(j.db, 'not_configured');
});

test('product detail, orders and admin without a database', async () => {
  const one = await fetch(`${base}/api/product?slug=${(await (await fetch(`${base}/api/products?limit=1`)).json()).items[0].slug}`);
  assert.equal(one.status, 200);
  const p = (await one.json()).product;
  assert.ok(Array.isArray(p.images) && p.images.length && 'price_bdt' in p && 'stock' in p);
  assert.equal((await fetch(`${base}/api/product?slug=nope-nope`)).status, 404);
  const bad = await post('/api/orders', { name: '', phone: '1', items: [] });
  assert.equal(bad.status, 422);
  const ok = await post('/api/orders', { name: 'Asha', phone: '01701777913', address: 'House 1, Road 2, Dhaka', city: 'Dhaka', items: [{ slug: p.slug, qty: 1 }] }, { 'x-forwarded-for': '4.4.4.4' });
  assert.equal(ok.status, 503);
  const adm = await fetch(`${base}/api/admin-orders`);
  assert.ok([401, 503].includes(adm.status));
});
