// Tiny API client: per-session response cache with TTL, in-flight de-duplication, timeouts and abort support.
const cache = new Map();
const inflight = new Map();

function withTimeout(ms, outer) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), ms);
  outer?.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/** GET JSON, cached in memory for `ttl` ms. Identical concurrent calls share one request. */
export async function getJSON(url, { ttl = 60_000, timeout = 8000, signal } = {}) {
  const hit = cache.get(url);
  if (hit && hit.exp > Date.now()) return hit.data;
  if (inflight.has(url)) return inflight.get(url);
  const t = withTimeout(timeout, signal);
  const p = fetch(url, { signal: t.signal, headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
      const data = await r.json();
      cache.set(url, { data, exp: Date.now() + ttl });
      if (cache.size > 100) cache.delete(cache.keys().next().value);
      return data;
    })
    .finally(() => { t.done(); inflight.delete(url); });
  inflight.set(url, p);
  return p;
}

export const prefetch = (url, opts) => { getJSON(url, opts).catch(() => {}); };

/** POST JSON. Never throws on HTTP errors: resolves { ok, status, data } so callers can show field errors. */
export async function postJSON(url, body, { timeout = 10_000, signal } = {}) {
  const t = withTimeout(timeout, signal);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: t.signal });
    let data = null;
    try { data = await r.json(); } catch { /* empty body */ }
    return { ok: r.ok, status: r.status, data, retryAfter: Number(r.headers.get('retry-after')) || 0 };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.name === 'TimeoutError' ? 'timeout' : 'network' };
  } finally { t.done(); }
}
