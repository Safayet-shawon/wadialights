// Input validation and a per-client sliding-window rate limiter.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export class ValidationError extends Error {
  constructor(fields) { super('validation_failed'); this.fields = fields; }
}

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');

export function validateInquiry(body = {}) {
  const errors = {};
  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const message = clean(body.message, 4000);
  const room = clean(body.room, 60);
  const product = clean(body.product, 80);
  if (!name) errors.name = 'Please tell us your name.';
  if (!EMAIL.test(email)) errors.email = 'Please enter a valid email address.';
  if (message.length < 5) errors.message = 'Please write a few words about what you need.';
  if (phone && !/^[0-9+()\-.\s]{5,40}$/.test(phone)) errors.phone = 'Phone numbers can only contain digits, spaces and + ( ) - .';
  let plan = null;
  if (body.plan && typeof body.plan === 'object') {
    const json = JSON.stringify(body.plan);
    if (json.length <= 60_000) plan = body.plan; else errors.plan = 'The attached plan is too large.';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { name, email, phone: phone || null, message, room: room || null, product: product || null, plan };
}

export function validateEmail(body = {}) {
  const email = clean(body.email, 254).toLowerCase();
  if (!EMAIL.test(email)) throw new ValidationError({ email: 'Please enter a valid email address.' });
  return email;
}

/** `true` when a hidden "website" field is filled in: only bots do that. */
export const isHoneypot = (body) => Boolean(body && typeof body.website === 'string' && body.website.trim());

export class RateLimiter {
  constructor({ limit = 5, windowMs = 60 * 60_000 } = {}) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }

  /** returns { ok, remaining, retryAfter } */
  check(key, now = Date.now()) {
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return { ok: false, remaining: 0, retryAfter: Math.ceil((this.windowMs - (now - arr[0])) / 1000) };
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return { ok: true, remaining: this.limit - arr.length, retryAfter: 0 };
  }
}
