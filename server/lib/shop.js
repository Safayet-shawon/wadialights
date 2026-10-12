// Shop logic: product detail, orders (server-side pricing, stock-safe), order tracking and the owner's admin API.
// Prices ALWAYS come from the catalogue on the server; the browser only says which products and how many.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hasDb, query, tx } from './db.js';
import { PRODUCT_SEED, defaultImage } from './seed.js';
import { ValidationError, RateLimiter } from './validate.js';

const orderLimiter = new RateLimiter({ limit: 10, windowMs: 60 * 60_000 });
const adminLimiter = new RateLimiter({ limit: 60, windowMs: 10 * 60_000 });
const respond = (status, body, headers = {}) => ({ status, body, headers: { 'Cache-Control': 'no-store', ...headers } });
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ipHash = (ip) => sha(`${process.env.IP_SALT || 'wadia'}:${ip || 'unknown'}`).slice(0, 32);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

/* ---------------------------------------------------------------- pure helpers (unit-tested) */

/** Bangladesh mobile numbers are normalised to 01XXXXXXXXX; other international numbers are kept as digits. */
export function normalisePhone(raw) {
  const s = String(raw || '').replace(/[\s().-]/g, '');
  const bd = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(s);
  if (bd) return bd[1];
  return /^\+?\d{7,15}$/.test(s) ? s : null;
}

export function validateOrder(body = {}) {
  const errors = {};
  const name = clean(body.name, 120);
  const phone = normalisePhone(body.phone);
  const email = clean(body.email, 254).toLowerCase();
  const address = clean(body.address, 400);
  const area = clean(body.area, 80);
  const city = clean(body.city, 80);
  const notes = clean(body.notes, 1000);
  const payment = body.payment === 'arrange' ? 'arrange' : 'cod';
  if (!name) errors.name = 'Please tell us your name.';
  if (!phone) errors.phone = 'Please enter a valid phone number (for example 01701-777913).';
  if (email && !EMAIL.test(email)) errors.email = 'That email address does not look right.';
  if (address.length < 8) errors.address = 'Please enter your full delivery address.';
  if (!city) errors.city = 'Please enter your city.';

  const merged = new Map();
  if (Array.isArray(body.items)) {
    for (const it of body.items.slice(0, 60)) {
      const slug = clean(it?.slug, 80);
      const qty = Math.floor(Number(it?.qty));
      if (!slug || !Number.isFinite(qty) || qty < 1) continue;
      merged.set(slug, Math.min(50, (merged.get(slug) || 0) + qty));
    }
  }
  const items = [...merged].slice(0, 30).map(([slug, qty]) => ({ slug, qty }));
  if (!items.length) errors.items = 'Your cart is empty.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { name, phone, email: email || null, address, area: area || null, city, notes: notes || null, payment, items };
}

/**
 * Price an order from the catalogue. `catalog` is a Map(slug → { name, price_bdt, stock, active }).
 * Returns { lines, subtotal } where subtotal is null if any line is "price on request".
 */
export function priceOrder(items, catalog) {
  const lines = [];
  let subtotal = 0, unpriced = false;
  for (const { slug, qty } of items) {
    const p = catalog.get(slug);
    if (!p || p.active === false) throw new ValidationError({ items: `"${slug}" is not available any more. Please remove it from your cart.` });
    if (p.stock != null && p.stock < qty) {
      throw new ValidationError({ items: p.stock === 0 ? `${p.name} is out of stock.` : `Only ${p.stock} of ${p.name} left in stock.` });
    }
    const unit = p.price_bdt ?? null;
    if (unit == null) unpriced = true; else subtotal += unit * qty;
    lines.push({ slug, name: p.name, qty, unit_price_bdt: unit, line_total_bdt: unit == null ? null : unit * qty });
  }
  return { lines, subtotal: unpriced ? null : subtotal };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newOrderCode() {
  const bytes = randomBytes(6);
  return 'WD-' + [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const safeEqual = (a, b) => {
  const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
};

/* ---------------------------------------------------------------- catalogue lookups */
export const seedMap = () => new Map(PRODUCT_SEED.map((p) => [p.slug, p]));

const publicProduct = (p) => ({
  slug: p.slug, name: p.name, category: p.category, description: p.description,
  price_bdt: p.price_bdt ?? null, stock: p.stock ?? null, featured: Boolean(p.featured),
  images: p.images && p.images.length ? p.images : [defaultImage(p.slug)], is_demo: p.is_demo !== false,
});

export async function getProduct(slug) {
  const s = clean(slug, 80);
  if (!s) return respond(404, { error: 'not_found' });
  let product, related;
  if (hasDb()) {
    const { rows } = await query('select slug, name, category, description, price_bdt, stock, images, featured, is_demo from products where slug = $1 and active', [s]);
    if (!rows.length) return respond(404, { error: 'not_found' });
    product = rows[0];
    related = (await query('select slug, name, category, description, price_bdt, stock, images, featured, is_demo from products where active and category = $1 and slug <> $2 order by sort limit 4', [product.category, s])).rows;
  } else {
    product = seedMap().get(s);
    if (!product) return respond(404, { error: 'not_found' });
    related = PRODUCT_SEED.filter((p) => p.category === product.category && p.slug !== s).slice(0, 4);
  }
  return respond(200, { product: publicProduct(product), related: related.map(publicProduct) }, { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600' });
}

/* ---------------------------------------------------------------- orders */
async function loadCatalog(slugs, client) {
  if (!hasDb()) return seedMap();
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(`select slug, name, price_bdt, stock, active from products where slug = any($1)${client ? ' for update' : ''}`, [slugs]);
  return new Map(rows.map((r) => [r.slug, r]));
}

export async function createOrder(body, ip, safely) {
  return safely(async () => {
    const rl = orderLimiter.check(ipHash(ip));
    if (!rl.ok) return respond(429, { error: 'rate_limited', retryAfter: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) });
    const v = validateOrder(body);
    if (!hasDb()) throw Object.assign(new Error('no db'), { code: 'NO_DB' });

    const token = randomBytes(16).toString('hex');
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newOrderCode();
      try {
        const out = await tx(async (client) => {
          const catalog = await loadCatalog(v.items.map((i) => i.slug), client);
          const { lines, subtotal } = priceOrder(v.items, catalog);
          for (const l of lines) {                       // stock-safe: the check and the decrement happen under a row lock
            await client.query('update products set stock = stock - $2 where slug = $1 and stock is not null', [l.slug, l.qty]);
          }
          await client.query(
            `insert into orders (code, token_hash, customer_name, phone, email, address, area, city, notes, payment_method, items, subtotal_bdt, ip_hash)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)`,
            [code, sha(token), v.name, v.phone, v.email, v.address, v.area, v.city, v.notes, v.payment, JSON.stringify(lines), subtotal, ipHash(ip)],
          );
          return { lines, subtotal };
        });
        return respond(201, { ok: true, code, token, status: 'received', lines: out.lines, subtotal_bdt: out.subtotal });
      } catch (err) {
        if (err && err.code === '23505' && /orders_code_key|code/.test(String(err.constraint || err.detail || ''))) continue;   // code collision: try another
        throw err;
      }
    }
    throw new Error('could not allocate an order code');
  });
}

const publicOrder = (o) => ({
  code: o.code, status: o.status, created_at: o.created_at, city: o.city, payment_method: o.payment_method,
  items: o.items, subtotal_bdt: o.subtotal_bdt, customer_first_name: String(o.customer_name).split(' ')[0],
});

export async function trackOrder(q, safely) {
  return safely(async () => {
    const code = clean(q.code, 20).toUpperCase();
    const token = clean(q.token, 64);
    const phone = normalisePhone(q.phone);
    if (!/^WD-[A-Z2-9]{6}$/.test(code) || (!token && !phone)) throw new ValidationError({ code: 'Enter your order number and the phone number you ordered with.' });
    if (!hasDb()) throw Object.assign(new Error('no db'), { code: 'NO_DB' });
    const { rows } = await query('select * from orders where code = $1', [code]);
    const o = rows[0];
    const ok = o && ((token && safeEqual(sha(token), o.token_hash)) || (phone && o.phone === phone));
    if (!ok) return respond(404, { error: 'not_found', message: 'We could not find an order with those details.' });
    return respond(200, { order: publicOrder(o) });
  });
}

/* ---------------------------------------------------------------- admin (owner) */
/** Returns null when authorised, otherwise the error response. */
export function adminGate(headers, ip) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return respond(503, { error: 'admin_disabled', message: 'Set ADMIN_TOKEN to enable the admin area.' });
  const rl = adminLimiter.check(ipHash(ip));
  if (!rl.ok) return respond(429, { error: 'rate_limited', retryAfter: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) });
  const m = /^Bearer (.+)$/.exec(String(headers?.authorization || headers?.Authorization || ''));
  if (!m || !safeEqual(m[1], expected)) return respond(401, { error: 'unauthorized' });
  return null;
}

const STATUSES = ['received', 'confirmed', 'shipped', 'delivered', 'cancelled'];

export async function adminListOrders(q, safely) {
  return safely(async () => {
    const page = Math.max(1, parseInt(q.page, 10) || 1), limit = 25;
    const status = STATUSES.includes(q.status) ? q.status : null;
    const params = status ? [status, limit, (page - 1) * limit] : [limit, (page - 1) * limit];
    const sql = `select id, code, customer_name, phone, email, address, area, city, notes, payment_method, items, subtotal_bdt, status, admin_note, created_at, count(*) over() as total
                 from orders ${status ? 'where status = $1' : ''} order by created_at desc limit $${params.length - 1} offset $${params.length}`;
    const { rows } = await query(sql, params);
    return respond(200, { orders: rows.map(({ total: _t, ...r }) => r), total: rows.length ? Number(rows[0].total) : 0, page, limit });
  });
}

export async function adminUpdateOrder(body, safely) {
  return safely(async () => {
    const code = clean(body?.code, 20).toUpperCase();
    const sets = [], params = [code];
    if (body?.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new ValidationError({ status: 'Unknown status.' });
      params.push(body.status); sets.push(`status = $${params.length}`);
    }
    if (body?.admin_note !== undefined) { params.push(clean(String(body.admin_note), 1000) || null); sets.push(`admin_note = $${params.length}`); }
    if (!sets.length) throw new ValidationError({ status: 'Nothing to update.' });
    const { rows } = await query(`update orders set ${sets.join(', ')}, updated_at = now() where code = $1 returning code, status, admin_note`, params);
    if (!rows.length) return respond(404, { error: 'not_found' });
    return respond(200, { ok: true, order: rows[0] });
  });
}

export async function adminListProducts(safely) {
  return safely(async () => {
    if (!hasDb()) return respond(200, { products: PRODUCT_SEED.map((p) => ({ ...publicProduct(p), active: true })), source: 'demo' });
    const { rows } = await query('select slug, name, category, price_bdt, stock, images, active, featured from products order by sort, name');
    return respond(200, { products: rows, source: 'database' });
  });
}

export async function adminUpdateProduct(body, safely) {
  return safely(async () => {
    const slug = clean(body?.slug, 80);
    const sets = [], params = [slug];
    const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (body?.price_bdt !== undefined) {
      const v = body.price_bdt === null || body.price_bdt === '' ? null : Math.round(Number(body.price_bdt));
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 100_000_000)) throw new ValidationError({ price_bdt: 'Enter a price in taka, or leave it empty for "price on request".' });
      add('price_bdt', v);
    }
    if (body?.stock !== undefined) {
      const v = body.stock === null || body.stock === '' ? null : Math.round(Number(body.stock));
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1_000_000)) throw new ValidationError({ stock: 'Enter a stock count, or leave it empty if you make to order.' });
      add('stock', v);
    }
    if (body?.active !== undefined) add('active', Boolean(body.active));
    if (body?.featured !== undefined) add('featured', Boolean(body.featured));
    if (Array.isArray(body?.images)) add('images', body.images.map((u) => clean(u, 400)).filter((u) => /^(\/|https:\/\/)/.test(u)).slice(0, 8));
    if (!sets.length) throw new ValidationError({ price_bdt: 'Nothing to update.' });
    const { rows } = await query(`update products set ${sets.join(', ')} where slug = $1 returning slug, price_bdt, stock, active, featured, images`, params);
    if (!rows.length) return respond(404, { error: 'not_found' });
    return respond(200, { ok: true, product: rows[0] });
  });
}

export async function adminListInquiries(q, safely) {
  return safely(async () => {
    const page = Math.max(1, parseInt(q.page, 10) || 1), limit = 25;
    const { rows } = await query(
      `select id, name, email, phone, message, room, product_slug, plan, status, created_at, count(*) over() as total
       from inquiries order by created_at desc limit $1 offset $2`, [limit, (page - 1) * limit]);
    return respond(200, { inquiries: rows.map(({ total: _t, ...r }) => r), total: rows.length ? Number(rows[0].total) : 0, page, limit });
  });
}
