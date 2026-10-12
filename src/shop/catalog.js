// Shop listing: filters, sort, debounced search, pagination, skeletons, cached API calls. State lives in the URL.
import { getJSON, prefetch } from '../api.js';
import { debounce, $, esc } from '../util.js';
import { addToCart } from './cart.js';
import { cardHTML, CATEGORY_LABELS } from './format.js';
import { toast } from '../toast.js';

const PAGE_SIZE = 9;
const state = { category: '', q: '', sort: 'default', page: 1 };
let ctrl = null, seq = 0;

const grid = () => $('#shop-grid');
const urlFor = (s, page = s.page) => {
  const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (s.category) p.set('category', s.category);
  if (s.q) p.set('q', s.q);
  if (s.sort !== 'default') p.set('sort', s.sort);
  return `/api/products?${p}`;
};

function syncUrl() {
  const p = new URLSearchParams();
  if (state.category) p.set('category', state.category);
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'default') p.set('sort', state.sort);
  if (state.page > 1) p.set('page', String(state.page));
  history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : ''));
}

function skeletons() {
  grid().setAttribute('aria-busy', 'true');
  grid().innerHTML = Array.from({ length: 6 }, () => `
    <li class="cat-card is-skeleton" aria-hidden="true"><div class="cat-card__img"></div>
      <div class="cat-card__body"><i class="sk sk--s"></i><i class="sk sk--l"></i><i class="sk"></i><i class="sk sk--m"></i></div></li>`).join('');
}

function pager(data) {
  const el = $('#shop-pager');
  $('#shop-count').textContent = data.total ? `${data.total} product${data.total === 1 ? '' : 's'}` : '';
  if (data.pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn btn--sm" type="button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Previous</button>
    <span class="pager__info">Page ${data.page} of ${data.pages}</span>
    <button class="btn btn--sm" type="button" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Next</button>`;
}

async function load({ scroll = false } = {}) {
  ctrl?.abort();
  ctrl = new AbortController();
  const mine = ++seq;
  skeletons();
  syncUrl();
  try {
    const data = await getJSON(urlFor(state), { signal: ctrl.signal, ttl: 60_000 });
    if (mine !== seq) return;
    grid().innerHTML = data.items.length
      ? data.items.map((p) => cardHTML(p, esc)).join('')
      : `<li class="cat-empty">Nothing matches &ldquo;${esc(state.q || CATEGORY_LABELS[state.category] || '')}&rdquo;. Try another word or clear the filter.<br /><button class="btn btn--sm" type="button" id="shop-clear">Show all lights</button></li>`;
    grid().setAttribute('aria-busy', 'false');
    $('#shop-clear')?.addEventListener('click', () => {
      state.category = ''; state.q = ''; state.page = 1; $('#shop-search').value = '';
      $('#shop-filters').querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === '')));
      load();
    });
    pager(data);
    if (data.page < data.pages) prefetch(urlFor(state, data.page + 1));
    if (scroll) $('.cat-tools').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (err) {
    if (mine !== seq || err?.name === 'AbortError') return;
    grid().setAttribute('aria-busy', 'false');
    grid().innerHTML = '<li class="cat-empty">The shop could not be loaded. <button class="btn btn--sm" type="button" id="shop-retry">Try again</button></li>';
    $('#shop-retry')?.addEventListener('click', () => load());
  }
}

export function bindAddToCart(root = document) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b || b.disabled) return;
    addToCart(b.dataset.add, 1);
    const name = b.closest('.cat-card')?.querySelector('h3')?.textContent?.trim() || 'Item';
    toast(`${name} added to your cart`, 'ok');
    const old = b.textContent; b.textContent = 'Added ✓';
    setTimeout(() => { b.textContent = old; }, 1400);
  });
}

export function initShop() {
  const q = new URLSearchParams(location.search);
  if (Object.hasOwn(CATEGORY_LABELS, q.get('category') || '')) state.category = q.get('category');
  state.q = (q.get('q') || '').slice(0, 80);
  if (['featured', 'name', 'price-asc', 'price-desc'].includes(q.get('sort'))) state.sort = q.get('sort');
  state.page = Math.max(1, parseInt(q.get('page'), 10) || 1);

  const filters = $('#shop-filters');
  filters.innerHTML = [['', 'All'], ...Object.entries(CATEGORY_LABELS)]
    .map(([v, l]) => `<button class="chip" type="button" data-cat="${v}" aria-pressed="${v === state.category}">${esc(l)}</button>`).join('');
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.category = b.dataset.cat; state.page = 1;
    filters.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    load();
  });

  const search = $('#shop-search'), sort = $('#shop-sort');
  search.value = state.q; sort.value = state.sort;
  const run = debounce((v) => { state.q = v.trim(); state.page = 1; load(); }, 280);
  search.addEventListener('input', (e) => run(e.target.value));
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run.flush(e.target.value); } });
  sort.addEventListener('change', () => { state.sort = sort.value; state.page = 1; load(); });
  $('#shop-pager').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    state.page = Math.max(1, Number(b.dataset.page));
    load({ scroll: true });
  });
  bindAddToCart(grid());
  load();
}
