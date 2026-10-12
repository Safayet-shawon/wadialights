// Product page: /product/<slug>
import { getJSON } from '../api.js';
import { $, esc } from '../util.js';
import { addToCart } from './cart.js';
import { cardHTML, priceText, stockText, waLink, telLink, BUSINESS, CATEGORY_LABELS } from './format.js';
import { bindAddToCart } from './catalog.js';
import { toast } from '../toast.js';
import { setMeta } from '../pages/common.js';

export async function initProduct() {
  const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const root = $('#product');
  let data;
  try { data = await getJSON(`/api/product?slug=${encodeURIComponent(slug)}`, { ttl: 60_000 }); } catch (err) {
    root.innerHTML = `<div class="notfound"><h1>${err?.status === 404 ? 'We could not find that product' : 'The product could not be loaded'}</h1>
      <p>${err?.status === 404 ? 'It may have been removed.' : 'Please check your connection and try again.'}</p>
      <a class="btn btn--solid" href="/shop">Back to the shop</a></div>`;
    setMeta('Product not found | WADIA');
    return;
  }
  const { product: p, related } = data;
  const out = p.stock === 0;
  setMeta(`${p.name} | WADIA`, p.description);
  const askText = `Hello WADIA, I would like to order: ${p.name} (${location.origin}/product/${p.slug}).`;

  root.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/shop">Shop</a> / <a href="/shop?category=${esc(p.category)}">${esc(CATEGORY_LABELS[p.category] || p.category)}</a> / <span aria-current="page">${esc(p.name)}</span></nav>
    <div class="pdp">
      <div class="pdp__gallery">
        <div class="pdp__main"><img id="pdp-img" src="${esc(p.images[0])}" alt="${esc(p.name)}" width="1080" height="1350" decoding="async" fetchpriority="high" /></div>
        ${p.images.length > 1 ? `<div class="pdp__thumbs">${p.images.map((u, i) => `<button type="button" data-img="${esc(u)}" aria-label="Photo ${i + 1}"><img src="${esc(u)}" alt="" width="96" height="120" loading="lazy" /></button>`).join('')}</div>` : ''}
      </div>
      <div class="pdp__info">
        <p class="eyebrow">${esc(CATEGORY_LABELS[p.category] || p.category)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="pdp__price${p.price_bdt == null ? ' is-ask' : ''}">${esc(priceText(p))}</p>
        <p class="pdp__stock" data-state="${out ? 'out' : p.stock == null ? 'order' : 'in'}">${esc(stockText(p))}</p>
        <p class="pdp__desc">${esc(p.description)}</p>
        ${p.price_bdt == null ? '<p class="pdp__note">The price is confirmed by phone before anything is dispatched, so you can place an order request now at no cost.</p>' : ''}
        <div class="pdp__buy">
          <div class="qty" role="group" aria-label="Quantity">
            <button type="button" data-q="-1" aria-label="Decrease quantity">−</button>
            <input id="qty" type="number" inputmode="numeric" min="1" max="${p.stock ? Math.min(50, p.stock) : 50}" value="1" aria-label="Quantity" />
            <button type="button" data-q="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn btn--solid" type="button" id="pdp-add" ${out ? 'disabled' : ''}>Add to cart</button>
          <button class="btn" type="button" id="pdp-now" ${out ? 'disabled' : ''}>Order now</button>
        </div>
        <ul class="pdp__help">
          <li><a href="${waLink(askText)}" rel="noopener">Order on WhatsApp</a></li>
          <li><a href="${telLink}">Call ${esc(BUSINESS.phoneDisplay)}</a></li>
          <li><a href="/contact?product=${esc(p.slug)}">Ask a question</a></li>
        </ul>
        
      </div>
    </div>
    ${related.length ? `<section class="related" aria-labelledby="rel-h"><h2 id="rel-h">You may also like</h2><ul class="cat-grid" id="related-grid">${related.map((r) => cardHTML(r, esc)).join('')}</ul></section>` : ''}`;

  const qty = $('#qty');
  const clampQty = () => { qty.value = String(Math.min(Number(qty.max) || 50, Math.max(1, Math.floor(Number(qty.value)) || 1))); return Number(qty.value); };
  root.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]');
    if (q) { qty.value = String(Number(qty.value) + Number(q.dataset.q)); clampQty(); }
    const t = e.target.closest('[data-img]');
    if (t) $('#pdp-img').src = t.dataset.img;
  });
  qty.addEventListener('change', clampQty);
  $('#pdp-add').addEventListener('click', () => { addToCart(p.slug, clampQty()); toast(`${p.name} added to your cart`, 'ok'); });
  $('#pdp-now').addEventListener('click', () => { addToCart(p.slug, clampQty()); location.href = '/checkout'; });
  if ($('#related-grid')) bindAddToCart($('#related-grid'));

  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description, image: new URL(p.images[0], location.origin).href, category: CATEGORY_LABELS[p.category], brand: { '@type': 'Brand', name: 'WADIA' } };
  if (p.price_bdt != null) ld.offers = { '@type': 'Offer', priceCurrency: 'BDT', price: p.price_bdt, availability: out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', url: location.href };
  const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
}
