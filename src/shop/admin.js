// Owner's admin: orders, product prices/stock, enquiries. Protected by ADMIN_TOKEN (sent as a Bearer token).
import { $, $$, esc } from '../util.js';
import { toast } from '../toast.js';
import { fmtBdt, CATEGORY_LABELS } from './format.js';

const KEY = 'wl-admin';
const STATUSES = ['received', 'confirmed', 'shipped', 'delivered', 'cancelled'];
let token = '';
try { token = sessionStorage.getItem(KEY) || ''; } catch { /* ignore */ }

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(`/api/${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  return { ok: r.ok, status: r.status, data };
}

const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function problem(res) {
  if (res.status === 401) return 'That token is not correct.';
  if (res.status === 503) return res.data?.error === 'admin_disabled' ? 'The admin area is switched off: set ADMIN_TOKEN on the server.' : 'The database is not connected yet.';
  if (res.status === 429) return 'Too many attempts. Please wait a few minutes.';
  return 'Something went wrong.';
}

/* ----------------------------------------------------------------- orders */
async function loadOrders() {
  const box = $('#tab-orders');
  const status = $('#order-filter').value;
  box.setAttribute('aria-busy', 'true');
  const res = await api(`admin-orders${status ? `?status=${status}` : ''}`);
  box.setAttribute('aria-busy', 'false');
  if (!res.ok) { $('#orders-list').innerHTML = `<p class="form-msg" data-kind="error">${esc(problem(res))}</p>`; return; }
  const { orders, total } = res.data;
  $('#orders-count').textContent = `${total} order${total === 1 ? '' : 's'}`;
  $('#orders-list').innerHTML = orders.length ? orders.map((o) => `
    <article class="adm-card" data-code="${esc(o.code)}">
      <header><strong>${esc(o.code)}</strong><span class="adm-status" data-s="${esc(o.status)}">${esc(o.status)}</span><time>${esc(when(o.created_at))}</time></header>
      <p><b>${esc(o.customer_name)}</b> · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>${o.email ? ' · ' + esc(o.email) : ''}</p>
      <p>${esc(o.address)}${o.area ? ', ' + esc(o.area) : ''}, ${esc(o.city)}</p>
      <ul>${o.items.map((l) => `<li>${esc(l.name)} × ${esc(l.qty)} <span>${l.line_total_bdt == null ? 'on request' : esc(fmtBdt(l.line_total_bdt))}</span></li>`).join('')}</ul>
      <p><b>Subtotal:</b> ${o.subtotal_bdt == null ? 'to confirm' : esc(fmtBdt(o.subtotal_bdt))} · ${o.payment_method === 'arrange' ? 'payment to arrange' : 'cash on delivery'}</p>
      ${o.notes ? `<p><b>Customer note:</b> ${esc(o.notes)}</p>` : ''}
      <div class="adm-row">
        <label class="field"><span>Status</span><select data-f="status">${STATUSES.map((s) => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="field grow"><span>Your note</span><input data-f="admin_note" value="${esc(o.admin_note || '')}" maxlength="1000" /></label>
        <button class="btn btn--sm btn--solid" type="button" data-save-order>Save</button>
      </div>
    </article>`).join('') : '<p>No orders yet.</p>';
}

/* ---------------------------------------------------------------- products */
async function loadProducts() {
  const res = await api('admin-products');
  if (!res.ok) { $('#products-list').innerHTML = `<p class="form-msg" data-kind="error">${esc(problem(res))}</p>`; return; }
  const note = res.data.source === 'demo' ? '<p class="form-msg">No database connected: prices and stock can be edited once it is.</p>' : '';
  $('#products-list').innerHTML = note + `<div class="adm-table" role="table">
    <div class="adm-thead" role="row"><span>Product</span><span>Price (৳)</span><span>Stock</span><span>Active</span><span>Featured</span><span></span></div>
    ${res.data.products.map((p) => `
    <div class="adm-trow" role="row" data-slug="${esc(p.slug)}">
      <span><b>${esc(p.name)}</b><small>${esc(CATEGORY_LABELS[p.category] || p.category)}</small></span>
      <input data-f="price_bdt" type="number" min="0" inputmode="numeric" placeholder="on request" value="${p.price_bdt ?? ''}" aria-label="Price of ${esc(p.name)}" />
      <input data-f="stock" type="number" min="0" inputmode="numeric" placeholder="made to order" value="${p.stock ?? ''}" aria-label="Stock of ${esc(p.name)}" />
      <label class="adm-check"><input data-f="active" type="checkbox" ${p.active === false ? '' : 'checked'} /><span class="sr-only">Active</span></label>
      <label class="adm-check"><input data-f="featured" type="checkbox" ${p.featured ? 'checked' : ''} /><span class="sr-only">Featured</span></label>
      <button class="btn btn--sm" type="button" data-save-product ${res.data.source === 'demo' ? 'disabled' : ''}>Save</button>
    </div>`).join('')}</div>`;
}

/* --------------------------------------------------------------- enquiries */
async function loadInquiries() {
  const res = await api('admin-inquiries');
  if (!res.ok) { $('#inq-list').innerHTML = `<p class="form-msg" data-kind="error">${esc(problem(res))}</p>`; return; }
  $('#inq-list').innerHTML = res.data.inquiries.length ? res.data.inquiries.map((q) => `
    <article class="adm-card"><header><strong>${esc(q.name)}</strong><span class="adm-status" data-s="${esc(q.status)}">${esc(q.status)}</span><time>${esc(when(q.created_at))}</time></header>
      <p><a href="mailto:${esc(q.email)}">${esc(q.email)}</a>${q.phone ? ' · <a href="tel:' + esc(q.phone) + '">' + esc(q.phone) + '</a>' : ''}${q.room ? ' · ' + esc(q.room) : ''}${q.product_slug ? ' · about ' + esc(q.product_slug) : ''}</p>
      <p>${esc(q.message)}</p>${q.plan ? `<p><small>Lighting plan attached: ${esc(q.plan.fixtures)} fixtures, ${esc(q.plan.avgLux)} lux.</small></p>` : ''}</article>`).join('') : '<p>No enquiries yet.</p>';
}

function show(tab) {
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.adm-pane').forEach((p) => { p.hidden = p.id !== `tab-${tab}`; });
  if (tab === 'orders') loadOrders(); if (tab === 'products') loadProducts(); if (tab === 'inquiries') loadInquiries();
}

function enter() {
  $('#login').hidden = true; $('#panel').hidden = false;
  show('orders');
}

export function initAdmin() {
  const form = $('#login-form'), msg = $('#login-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    token = $('#token').value.trim();
    msg.textContent = 'Checking…'; msg.dataset.kind = '';
    const res = await api('admin-orders');
    if (res.status === 401 || res.status === 503 && res.data?.error === 'admin_disabled' || res.status === 429) { msg.textContent = problem(res); msg.dataset.kind = 'error'; return; }
    try { sessionStorage.setItem(KEY, token); } catch { /* ignore */ }
    enter();
  });
  $('#logout').addEventListener('click', () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } token = ''; location.reload(); });
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  $('#order-filter').addEventListener('change', loadOrders);

  $('#tab-orders').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save-order]'); if (!b) return;
    const card = b.closest('[data-code]');
    const res = await api('admin-orders', { method: 'PATCH', body: { code: card.dataset.code, status: $('[data-f=status]', card).value, admin_note: $('[data-f=admin_note]', card).value } });
    toast(res.ok ? 'Order updated' : problem(res), res.ok ? 'ok' : 'error');
    if (res.ok) loadOrders();
  });
  $('#tab-products').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save-product]'); if (!b) return;
    const row = b.closest('[data-slug]');
    const val = (f) => $(`[data-f=${f}]`, row);
    const res = await api('admin-products', { method: 'PATCH', body: { slug: row.dataset.slug, price_bdt: val('price_bdt').value === '' ? null : Number(val('price_bdt').value), stock: val('stock').value === '' ? null : Number(val('stock').value), active: val('active').checked, featured: val('featured').checked } });
    toast(res.ok ? 'Product saved' : (res.data?.fields ? Object.values(res.data.fields)[0] : problem(res)), res.ok ? 'ok' : 'error');
  });

  if (token) { api('admin-orders').then((r) => { if (r.ok || r.status === 503 && r.data?.error !== 'admin_disabled') enter(); else { token = ''; } }); }
}
