// Catalogue: filter, debounced search, pagination, skeletons and cached API calls (/api/products).
import { getJSON, prefetch } from './api.js';
import { debounce, $, esc } from './util.js';
import { openQuote } from './forms.js';

const LABELS = { pendant: 'Pendant lights', sconce: 'Wall sconces', table: 'Table lamps', floor: 'Floor lamps', ceiling: 'Ceiling fixtures' };
const THUMB = { pendant: 'pendant', sconce: 'sconce', table: 'table', floor: 'floor', ceiling: 'ceiling' };
const PAGE_SIZE = 6;

const state = { category: '', q: '', page: 1 };
let ctrl = null, seq = 0;

const grid = () => $('#cat-grid');
const urlFor = (s, page = s.page) => {
  const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (s.category) p.set('category', s.category);
  if (s.q) p.set('q', s.q);
  return `/api/products?${p}`;
};

function skeletons() {
  grid().setAttribute('aria-busy', 'true');
  grid().innerHTML = Array.from({ length: PAGE_SIZE }, () => `
    <li class="cat-card is-skeleton" aria-hidden="true">
      <div class="cat-card__img"></div>
      <div class="cat-card__body"><i class="sk sk--s"></i><i class="sk sk--l"></i><i class="sk"></i><i class="sk sk--m"></i></div>
    </li>`).join('');
}

function card(p) {
  return `<li class="cat-card">
    <div class="cat-card__img"><img src="/img/cat-${THUMB[p.category] || 'table'}.webp" alt="" width="480" height="600" loading="lazy" decoding="async" /></div>
    <div class="cat-card__body">
      <p class="cat-card__cat">${esc(LABELS[p.category] || p.category)}</p>
      <h3>${esc(p.name)}</h3>
      <p class="cat-card__desc">${esc(p.description)}</p>
      <button class="btn btn--sm" type="button" data-quote="${esc(p.slug)}" data-name="${esc(p.name)}">Request a quote</button>
    </div>
  </li>`;
}

function pager(data) {
  const el = $('#cat-pager');
  if (data.pages <= 1) { el.innerHTML = data.total ? `<span class="pager__info">${data.total} item${data.total === 1 ? '' : 's'}</span>` : ''; return; }
  el.innerHTML = `
    <button class="btn btn--sm" type="button" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Previous</button>
    <span class="pager__info">Page ${data.page} of ${data.pages} &middot; ${data.total} items</span>
    <button class="btn btn--sm" type="button" data-page="${data.page + 1}" ${data.page >= data.pages ? 'disabled' : ''}>Next</button>`;
}

async function load({ scroll = false } = {}) {
  ctrl?.abort();
  ctrl = new AbortController();
  const mine = ++seq;
  skeletons();
  try {
    const data = await getJSON(urlFor(state), { signal: ctrl.signal, ttl: 60_000 });
    if (mine !== seq) return;
    grid().innerHTML = data.items.length
      ? data.items.map(card).join('')
      : `<li class="cat-empty">Nothing matches &ldquo;${esc(state.q || LABELS[state.category] || '')}&rdquo;. Try another word or clear the filter.</li>`;
    grid().setAttribute('aria-busy', 'false');
    pager(data);
    if (data.page < data.pages) prefetch(urlFor(state, data.page + 1));            // warm the next page
    if (scroll) $('#catalogue .cat-tools').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (err) {
    if (mine !== seq || err?.name === 'AbortError') return;
    grid().setAttribute('aria-busy', 'false');
    grid().innerHTML = `<li class="cat-empty">The catalogue could not be loaded. <button class="btn btn--sm" type="button" id="cat-retry">Try again</button></li>`;
    $('#cat-retry')?.addEventListener('click', () => load());
  }
}

function filters() {
  const el = $('#cat-filters');
  const items = [['', 'All'], ...Object.entries(LABELS)];
  el.innerHTML = items.map(([v, l]) => `<button class="chip" type="button" data-cat="${v}" aria-pressed="${v === state.category}">${esc(l)}</button>`).join('');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.category = b.dataset.cat; state.page = 1;
    el.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    load();
  });
}

export function initCatalog() {
  filters();
  const search = debounce((v) => { state.q = v.trim(); state.page = 1; load(); }, 280);
  $('#cat-search').addEventListener('input', (e) => search(e.target.value));
  $('#cat-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search.flush(e.target.value); } });
  $('#cat-pager').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b || b.disabled) return;
    state.page = Math.max(1, Number(b.dataset.page));
    load({ scroll: true });
  });
  grid().addEventListener('click', (e) => {
    const b = e.target.closest('[data-quote]');
    if (!b) return;
    openQuote({ product: { slug: b.dataset.quote, name: b.dataset.name } });
  });
  load();
}
