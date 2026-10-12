// Cart page + the shared "load the cart's products" helper.
import { getJSON } from '../api.js';
import { $, esc } from '../util.js';
import { getCart, setQty, removeFromCart, onCartChange } from './cart.js';
import { priceText, fmtBdt } from './format.js';

/** products for the cart, fetched from the server (so prices are never taken from the browser) */
export async function loadLines() {
  const cart = getCart();
  const results = await Promise.all(cart.map(async (i) => {
    try { return { ...i, p: (await getJSON(`/api/product?slug=${encodeURIComponent(i.slug)}`, { ttl: 30_000 })).product }; }
    catch { return { ...i, p: null }; }
  }));
  return results;
}

export function totals(lines) {
  let sum = 0, unpriced = false, count = 0;
  for (const l of lines) {
    if (!l.p) continue;
    count += l.qty;
    if (l.p.price_bdt == null) unpriced = true; else sum += l.p.price_bdt * l.qty;
  }
  return { subtotal: unpriced ? null : sum, unpriced, count };
}

export const subtotalText = (t) => (t.subtotal == null ? 'Price confirmed by phone' : fmtBdt(t.subtotal));

export function summaryHTML(lines) {
  return `<ul class="sum-list">${lines.filter((l) => l.p).map((l) => `
    <li><img src="${esc(l.p.images[0])}" alt="" width="56" height="70" /><span class="sum-list__name">${esc(l.p.name)} <small>× ${l.qty}</small></span>
      <span>${l.p.price_bdt == null ? 'On request' : esc(fmtBdt(l.p.price_bdt * l.qty))}</span></li>`).join('')}</ul>`;
}

async function render() {
  const root = $('#cart');
  const lines = await loadLines();
  if (!lines.length) {
    root.innerHTML = `<div class="empty"><h2>Your cart is empty</h2><p>Browse the shop and add something you like.</p><a class="btn btn--solid" href="/shop">Go to the shop</a></div>`;
    return;
  }
  const t = totals(lines);
  root.innerHTML = `
    <div class="cart-grid">
      <ul class="cart-lines">${lines.map((l) => (l.p ? `
        <li class="cart-line" data-slug="${esc(l.slug)}">
          <a href="/product/${esc(l.slug)}"><img src="${esc(l.p.images[0])}" alt="${esc(l.p.name)}" width="96" height="120" loading="lazy" /></a>
          <div class="cart-line__info">
            <a class="cart-line__name" href="/product/${esc(l.slug)}">${esc(l.p.name)}</a>
            <span class="cart-line__unit">${esc(priceText(l.p))}</span>
            <button class="linkbtn" type="button" data-remove="${esc(l.slug)}">Remove</button>
          </div>
          <div class="qty" role="group" aria-label="Quantity of ${esc(l.p.name)}">
            <button type="button" data-dec="${esc(l.slug)}" aria-label="Decrease quantity">−</button>
            <input type="number" inputmode="numeric" min="1" max="50" value="${l.qty}" data-qty="${esc(l.slug)}" aria-label="Quantity" />
            <button type="button" data-inc="${esc(l.slug)}" aria-label="Increase quantity">+</button>
          </div>
          <div class="cart-line__total">${l.p.price_bdt == null ? 'On request' : esc(fmtBdt(l.p.price_bdt * l.qty))}</div>
        </li>` : `
        <li class="cart-line is-gone"><div class="cart-line__info"><span class="cart-line__name">This product is no longer available</span></div>
          <button class="linkbtn" type="button" data-remove="${esc(l.slug)}">Remove</button></li>`)).join('')}</ul>
      <aside class="cart-sum" aria-label="Order summary">
        <h2>Summary</h2>
        <dl><div><dt>Items</dt><dd>${t.count}</dd></div><div><dt>Subtotal</dt><dd>${esc(subtotalText(t))}</dd></div><div><dt>Delivery</dt><dd>Confirmed by phone</dd></div></dl>
        ${t.unpriced ? '<p class="cart-sum__note">Some items are priced on request. Place your order and we will call to confirm the total before dispatch.</p>' : ''}
        <a class="btn btn--solid" href="/checkout" ${lines.some((l) => l.p) ? '' : 'aria-disabled="true"'}>Checkout</a>
        <a class="linkbtn" href="/shop">Continue shopping</a>
      </aside>
    </div>`;
}

export function initCartPage() {
  const root = $('#cart');
  root.addEventListener('click', (e) => {
    const t = e.target;
    const cur = (slug) => getCart().find((i) => i.slug === slug)?.qty || 1;
    if (t.closest('[data-remove]')) removeFromCart(t.closest('[data-remove]').dataset.remove);
    else if (t.closest('[data-inc]')) setQty(t.closest('[data-inc]').dataset.inc, cur(t.closest('[data-inc]').dataset.inc) + 1);
    else if (t.closest('[data-dec]')) setQty(t.closest('[data-dec]').dataset.dec, cur(t.closest('[data-dec]').dataset.dec) - 1);
  });
  root.addEventListener('change', (e) => {
    const i = e.target.closest('[data-qty]');
    if (i) setQty(i.dataset.qty, Number(i.value) || 1);
  });
  let first = true;
  onCartChange(() => { if (first) { first = false; } render(); });
  render();
}
