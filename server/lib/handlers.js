// Framework-agnostic API handlers. Each takes plain data and returns { status, body, headers }.
// The same functions power the Vercel functions in /api and the Docker server in /server/index.js.
import { createHash } from 'node:crypto';
import { hasDb, query } from './db.js';
import { TTLCache } from './cache.js';
import { PRODUCT_SEED, CATEGORIES } from './seed.js';
import { validateInquiry, validateEmail, isHoneypot, ValidationError, RateLimiter } from './validate.js';
import { plan, normalise } from './lighting.js';

const productCache = new TTLCache({ max: 500, ttl: 60_000 });
const planCache = new TTLCache({ max: 300, ttl: 10 * 60_000 });          // memoised expensive maths
const inquiryLimiter = new RateLimiter({ limit: 5, windowMs: 60 * 60_000 });
const subscribeLimiter = new RateLimiter({ limit: 10, windowMs: 60 * 60_000 });

const respond = (status, body, headers = {}) => ({ status, body, headers });
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ipHash = (ip) => sha(`${process.env.IP_SALT || 'wadia'}:${ip || 'unknown'}`).slice(0, 32);
const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const PUBLIC_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';
const NO_STORE = 'no-store';

/** Maps any error to a safe JSON response (internal details are logged, never returned). */
export async function safely(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ValidationError) return respond(422, { error: 'validation_failed', fields: err.fields }, { 'Cache-Control': NO_STORE });
    if (err && err.code === 'NO_DB') return respond(503, { error: 'database_unavailable', message: 'The database is not connected yet.' }, { 'Cache-Control': NO_STORE });
    console.error('[api] unhandled', err);
    return respond(500, { error: 'server_error' }, { 'Cache-Control': NO_STORE });
  }
}

/* ------------------------------------------------------------------ products */
function parseListQuery(q = {}) {
  const category = typeof q.category === 'string' && CATEGORIES.includes(q.category) ? q.category : '';
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 80) : '';
  const page = Math.max(1, Math.min(1000, parseInt(q.page, 10) || 1));
  const limit = Math.max(1, Math.min(24, parseInt(q.limit, 10) || 9));
  return { category, text, page, limit };
}

function listFromSeed({ category, text, page, limit }) {
  const needle = text.toLowerCase();
  const rows = PRODUCT_SEED.filter((p) => (!category || p.category === category) && (!needle || `${p.name} ${p.description}`.toLowerCase().includes(needle)));
  const total = rows.length;
  return { items: rows.slice((page - 1) * limit, page * limit), total, source: 'demo' };
}

async function listFromDb({ category, text, page, limit }) {
  const where = [], params = [];
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  if (text) {
    params.push(text); params.push(`%${escapeLike(text)}%`);
    where.push(`(search @@ websearch_to_tsquery('simple', $${params.length - 1}) or name ilike $${params.length})`);
  }
  params.push(limit, (page - 1) * limit);
  const sql = `select slug, name, category, description, is_demo, count(*) over() as total
               from products ${where.length ? 'where ' + where.join(' and ') : ''}
               order by sort, created_at desc limit $${params.length - 1} offset $${params.length}`;
  const { rows } = await query(sql, params);
  let total = rows.length ? Number(rows[0].total) : 0;
  if (!rows.length && page > 1) {                                  // page past the end: report the real total
    const c = await query(`select count(*)::int as n from products ${where.length ? 'where ' + where.join(' and ') : ''}`, params.slice(0, params.length - 2));
    total = c.rows[0].n;
  }
  return { items: rows.map(({ total: _t, ...r }) => r), total, source: 'database' };
}

export async function listProducts(rawQuery) {
  return safely(async () => {
    const q = parseListQuery(rawQuery);
    const key = `p:${q.category}|${q.text.toLowerCase()}|${q.page}|${q.limit}|${hasDb()}`;
    const data = await productCache.wrap(key, async () => {
      const base = hasDb() ? await listFromDb(q) : listFromSeed(q);
      return { ...base, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(base.total / q.limit)), categories: CATEGORIES };
    });
    return respond(200, data, { 'Cache-Control': PUBLIC_CACHE });
  });
}

/* ----------------------------------------------------------------- inquiries */
export async function createInquiry(body, ip) {
  return safely(async () => {
    if (isHoneypot(body)) return respond(202, { ok: true }, { 'Cache-Control': NO_STORE });      // silently drop bots
    const rl = inquiryLimiter.check(ipHash(ip));
    if (!rl.ok) return respond(429, { error: 'rate_limited', retryAfter: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter), 'Cache-Control': NO_STORE });
    const v = validateInquiry(body);
    if (!hasDb()) throw Object.assign(new Error('no db'), { code: 'NO_DB' });
    const { rows } = await query(
      `insert into inquiries (name, email, phone, message, room, product_slug, plan, ip_hash)
       values ($1, $2, $3, $4, $5, (select slug from products where slug = $6), $7::jsonb, $8)
       returning id`,
      [v.name, v.email, v.phone, v.message, v.room, v.product, v.plan ? JSON.stringify(v.plan) : null, ipHash(ip)],
    );
    return respond(201, { ok: true, id: rows[0].id }, { 'Cache-Control': NO_STORE });
  });
}

export async function subscribe(body, ip) {
  return safely(async () => {
    if (isHoneypot(body)) return respond(202, { ok: true }, { 'Cache-Control': NO_STORE });
    const rl = subscribeLimiter.check(ipHash(ip));
    if (!rl.ok) return respond(429, { error: 'rate_limited', retryAfter: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter), 'Cache-Control': NO_STORE });
    const email = validateEmail(body);
    if (!hasDb()) throw Object.assign(new Error('no db'), { code: 'NO_DB' });
    const { rows } = await query('insert into subscribers (email) values ($1) on conflict ((lower(email))) do nothing returning id', [email]);
    return respond(rows.length ? 201 : 200, { ok: true, already: rows.length === 0 }, { 'Cache-Control': NO_STORE });
  });
}

/* ------------------------------------------------------------------- planner */
export async function runPlan(body) {
  return safely(async () => {
    const o = normalise(body || {});
    const key = `plan:${sha(JSON.stringify(o))}`;
    const result = await planCache.wrap(key, () => plan(o));
    return respond(200, result, { 'Cache-Control': NO_STORE });
  });
}

/* -------------------------------------------------------------------- health */
export async function health() {
  let db = 'not_configured';
  if (hasDb()) {
    try { await query('select 1'); db = 'ok'; } catch { db = 'error'; }
  }
  return respond(db === 'error' ? 503 : 200, {
    ok: db !== 'error', db, uptime: Math.round(process.uptime()),
    cache: { products: productCache.stats(), plans: planCache.stats() },
  }, { 'Cache-Control': NO_STORE });
}
