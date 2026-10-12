// Order confirmation + tracking: /order?code=WD-XXXXXX&t=<private token>   or look up with code + phone.
import { getJSON } from '../api.js';
import { $, esc } from '../util.js';
import { fmtBdt, waLink, telLink, BUSINESS } from './format.js';

const STEPS = [['received', 'Order received'], ['confirmed', 'Confirmed'], ['shipped', 'On its way'], ['delivered', 'Delivered']];

function render(o, justPlaced) {
  const idx = STEPS.findIndex(([k]) => k === o.status);
  const cancelled = o.status === 'cancelled';
  const items = Array.isArray(o.items) ? o.items : [];
  $('#order').innerHTML = `
    <div class="order-card">
      ${justPlaced ? `<p class="order-thanks">Thank you${o.customer_first_name ? ', ' + esc(o.customer_first_name) : ''}! Your order has been placed.</p>` : ''}
      <p class="eyebrow">Order number</p>
      <h1 class="order-code">${esc(o.code)}</h1>
      <p class="order-hint">${justPlaced ? 'Save this number. We will call to confirm your order and the delivery details.' : ''}</p>
      ${cancelled ? '<p class="order-cancel">This order was cancelled.</p>' : `
      <ol class="steps" aria-label="Order progress">${STEPS.map(([k, label], i) => `<li class="${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}"${i === idx ? ' aria-current="step"' : ''}><span>${i < idx ? '✓' : i + 1}</span>${esc(label)}</li>`).join('')}</ol>`}
      <h2>Items</h2>
      <ul class="sum-list">${items.map((l) => `<li><span class="sum-list__name">${esc(l.name)} <small>× ${esc(l.qty)}</small></span><span>${l.line_total_bdt == null ? 'On request' : esc(fmtBdt(l.line_total_bdt))}</span></li>`).join('')}</ul>
      <dl class="cart-sum__totals"><div><dt>Subtotal</dt><dd>${o.subtotal_bdt == null ? 'Confirmed by phone' : esc(fmtBdt(o.subtotal_bdt))}</dd></div>
        <div><dt>Payment</dt><dd>${o.payment_method === 'arrange' ? 'To be arranged' : 'Cash on delivery'}</dd></div><div><dt>Delivering to</dt><dd>${esc(o.city)}</dd></div></dl>
      <div class="order-actions">
        <a class="btn btn--solid" href="${waLink(`Hello WADIA, about my order ${o.code}.`)}" rel="noopener">Message us on WhatsApp</a>
        <a class="btn" href="${telLink}">Call ${esc(BUSINESS.phoneDisplay)}</a>
        <a class="linkbtn" href="/shop">Keep shopping</a>
      </div>
    </div>`;
}

export async function initOrder() {
  const q = new URLSearchParams(location.search);
  const code = (q.get('code') || '').toUpperCase(), token = q.get('t') || '';
  const form = $('#track-form'), msg = $('#track-msg');

  async function lookup(params, justPlaced) {
    const url = `/api/orders?${new URLSearchParams(params)}`;
    try {
      const data = await getJSON(url, { ttl: 0 });
      $('#track').hidden = true;
      render(data.order, justPlaced);
    } catch (err) {
      $('#order').innerHTML = '';
      $('#track').hidden = false;
      msg.dataset.kind = 'error';
      msg.textContent = err?.status === 404 ? 'We could not find an order with those details.' : err?.status === 503 ? 'Order tracking is not available right now. Please call us.' : 'Something went wrong. Please try again.';
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    msg.textContent = 'Looking…'; msg.dataset.kind = '';
    lookup({ code: String(fd.code).trim(), phone: String(fd.phone).trim() }, false);
  });

  if (code && token) { $('#track').hidden = true; lookup({ code, token }, q.has('new')); }
}
