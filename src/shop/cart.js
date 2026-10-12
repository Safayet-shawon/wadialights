// Cart: just { slug, qty } pairs in localStorage. Names and prices are always fetched from the server
// (so a cart can never carry a stale or tampered price).
const KEY = 'wl-cart';
const MAX_QTY = 50;

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((i) => i && typeof i.slug === 'string' && Number.isFinite(i.qty) && i.qty > 0).map((i) => ({ slug: i.slug, qty: Math.min(MAX_QTY, Math.floor(i.qty)) })) : [];
  } catch { return []; }
}

function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable: cart lives for this page only */ memory = items; }
  window.dispatchEvent(new CustomEvent('wadia:cart', { detail: items }));
}
let memory = null;

export const getCart = () => (memory && !localStorage.getItem(KEY) ? memory : read());
export const cartCount = () => getCart().reduce((n, i) => n + i.qty, 0);

export function addToCart(slug, qty = 1) {
  const items = getCart();
  const found = items.find((i) => i.slug === slug);
  if (found) found.qty = Math.min(MAX_QTY, found.qty + qty); else items.push({ slug, qty: Math.min(MAX_QTY, qty) });
  write(items);
}

export function setQty(slug, qty) {
  const items = getCart().map((i) => (i.slug === slug ? { ...i, qty: Math.min(MAX_QTY, Math.max(0, Math.floor(qty))) } : i)).filter((i) => i.qty > 0);
  write(items);
}

export const removeFromCart = (slug) => write(getCart().filter((i) => i.slug !== slug));
export const clearCart = () => write([]);

/** call `fn(count)` whenever the cart changes in this tab or another one */
export function onCartChange(fn) {
  const run = () => fn(cartCount());
  window.addEventListener('wadia:cart', run);
  window.addEventListener('storage', (e) => { if (e.key === KEY) run(); });
  run();
}
