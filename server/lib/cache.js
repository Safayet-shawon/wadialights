// Tiny in-process TTL cache with LRU eviction and in-flight de-duplication (so a burst of identical requests
// computes once). Per-instance only; the CDN (Cache-Control headers) is the shared layer.
export class TTLCache {
  constructor({ max = 500, ttl = 60_000 } = {}) {
    this.max = max; this.ttl = ttl; this.map = new Map(); this.inflight = new Map();
    this.hits = 0; this.misses = 0;
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) { this.misses++; return undefined; }
    if (e.exp < Date.now()) { this.map.delete(key); this.misses++; return undefined; }
    this.map.delete(key); this.map.set(key, e);            // refresh recency
    this.hits++;
    return e.value;
  }

  set(key, value, ttl = this.ttl) {
    this.map.delete(key);
    this.map.set(key, { value, exp: Date.now() + ttl });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return value;
  }

  /** return the cached value or compute it once, even under concurrent callers */
  async wrap(key, fn, ttl) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = Promise.resolve().then(fn).then((v) => { this.set(key, v, ttl); return v; }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  clear() { this.map.clear(); }
  get size() { return this.map.size; }
  stats() { return { size: this.map.size, hits: this.hits, misses: this.misses }; }
}
