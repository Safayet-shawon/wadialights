import { BUSINESS } from '../../server/lib/business.js';
import { CATEGORY_LABELS } from '../../server/lib/seed.js';

export { BUSINESS, CATEGORY_LABELS };
export const fmtBdt = (n) => `৳${Number(n).toLocaleString('en-US')}`;
export const priceText = (p) => (p.price_bdt == null ? 'Price on request' : fmtBdt(p.price_bdt));
export const stockText = (p) => (p.stock == null ? 'Made to order' : p.stock === 0 ? 'Out of stock' : p.stock <= 5 ? `Only ${p.stock} left` : 'In stock');
export const waLink = (text) => `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(text)}`;
export const telLink = `tel:${BUSINESS.phoneTel}`;

/** a product card shared by the shop, the home page and the product page */
export function cardHTML(p, esc) {
  const out = p.stock === 0;
  return `<li class="cat-card">
    <a class="cat-card__img" href="/product/${esc(p.slug)}" aria-label="${esc(p.name)}"><img src="${esc(p.images[0])}" alt="${esc(p.name)}" width="480" height="600" loading="lazy" decoding="async" /></a>
    <div class="cat-card__body">
      <p class="cat-card__cat">${esc(CATEGORY_LABELS[p.category] || p.category)}</p>
      <h3><a href="/product/${esc(p.slug)}">${esc(p.name)}</a></h3>
      <p class="cat-card__desc">${esc(p.description)}</p>
      <p class="cat-card__price${p.price_bdt == null ? ' is-ask' : ''}">${esc(priceText(p))}</p>
      <div class="cat-card__actions">
        <button class="btn btn--sm btn--solid" type="button" data-add="${esc(p.slug)}" ${out ? 'disabled' : ''}>${out ? 'Out of stock' : 'Add to cart'}</button>
        <a class="btn btn--sm" href="/product/${esc(p.slug)}">Details</a>
      </div>
    </div>
  </li>`;
}
