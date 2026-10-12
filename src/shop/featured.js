// Home page: a strip of featured products from /api/products.
import { getJSON } from '../api.js';
import { $, esc } from '../util.js';
import { cardHTML } from './format.js';
import { bindAddToCart } from './catalog.js';

export async function initFeaturedStrip() {
  const grid = $('#home-grid');
  if (!grid) return;
  try {
    const data = await getJSON('/api/products?sort=featured&limit=4', { ttl: 120_000 });
    grid.innerHTML = data.items.map((p) => cardHTML(p, esc)).join('');
    grid.setAttribute('aria-busy', 'false');
    bindAddToCart(grid);
  } catch {
    grid.innerHTML = '<li class="cat-empty">Products could not be loaded. <a class="link" href="/shop">Open the shop</a></li>';
    grid.setAttribute('aria-busy', 'false');
  }
}
