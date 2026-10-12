// Checkout: validates, sends the order to /api/orders (prices are recomputed on the server), then shows the tracking page.
import { postJSON } from '../api.js';
import { $, $$, esc } from '../util.js';
import { getCart, clearCart } from './cart.js';
import { loadLines, totals, subtotalText, summaryHTML } from './cart-page.js';
import { waLink, telLink, BUSINESS } from './format.js';

const PHONE_BD = /^(?:\+?88)?01[3-9]\d{8}$/;
const phoneOk = (v) => PHONE_BD.test(String(v).replace(/[\s().-]/g, '')) || /^\+?\d{7,15}$/.test(String(v).replace(/[\s().-]/g, ''));

function setErrors(form, errors = {}) {
  $$('.err', form).forEach((el) => { el.textContent = errors[el.dataset.for] || ''; });
  $$('input, textarea, select', form).forEach((el) => el.setAttribute('aria-invalid', errors[el.name] ? 'true' : 'false'));
  const first = Object.keys(errors).find((k) => form.elements[k]);
  if (first) form.elements[first].focus();
}

function orderText(lines, fd, t) {
  const rows = lines.filter((l) => l.p).map((l) => `• ${l.p.name} × ${l.qty}`).join('\n');
  return `Hello WADIA, I would like to place an order.\n\n${rows}\n\nTotal: ${subtotalText(t)}\n\nName: ${fd.name}\nPhone: ${fd.phone}\nAddress: ${fd.address}${fd.area ? ', ' + fd.area : ''}, ${fd.city}${fd.notes ? '\nNote: ' + fd.notes : ''}`;
}

export async function initCheckout() {
  const form = $('#checkout-form'), msg = $('#checkout-msg'), btn = $('#place-order');
  const lines = await loadLines();
  const valid = lines.filter((l) => l.p);
  if (!valid.length) {
    $('#checkout').innerHTML = '<div class="empty"><h2>Your cart is empty</h2><p>Add something from the shop first.</p><a class="btn btn--solid" href="/shop">Go to the shop</a></div>';
    return;
  }
  const t = totals(lines);
  $('#checkout-summary').innerHTML = `<h2>Your order</h2>${summaryHTML(lines)}
    <dl class="cart-sum__totals"><div><dt>Subtotal</dt><dd>${esc(subtotalText(t))}</dd></div><div><dt>Delivery</dt><dd>Confirmed by phone</dd></div></dl>
    ${t.unpriced ? '<p class="cart-sum__note">Some items are priced on request. We will call you to confirm the total before dispatch. Nothing is charged online.</p>' : ''}
    <a class="linkbtn" href="/cart">Edit cart</a>`;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    const errors = {};
    if (!String(fd.name).trim()) errors.name = 'Please tell us your name.';
    if (!phoneOk(fd.phone)) errors.phone = 'Please enter a valid phone number (for example 01701-777913).';
    if (fd.email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(fd.email).trim())) errors.email = 'That email address does not look right.';
    if (String(fd.address).trim().length < 8) errors.address = 'Please enter your full delivery address.';
    if (!String(fd.city).trim()) errors.city = 'Please enter your city.';
    setErrors(form, errors);
    if (Object.keys(errors).length) { msg.textContent = 'Please check the highlighted fields.'; msg.dataset.kind = 'error'; return; }

    btn.disabled = true; btn.dataset.busy = '1'; msg.textContent = 'Placing your order…'; msg.dataset.kind = '';
    const res = await postJSON('/api/orders', { ...fd, items: getCart() }, { timeout: 15000 });
    btn.disabled = false; delete btn.dataset.busy;

    if (res.ok && res.data?.code) {
      clearCart();
      location.href = `/order?code=${encodeURIComponent(res.data.code)}&t=${encodeURIComponent(res.data.token)}&new=1`;
      return;
    }
    if (res.status === 422 && res.data?.fields) {
      setErrors(form, res.data.fields);
      msg.textContent = res.data.fields.items || 'Please check the highlighted fields.'; msg.dataset.kind = 'error';
      return;
    }
    if (res.status === 429) { msg.textContent = 'Too many orders from your connection. Please try again a little later, or call us.'; msg.dataset.kind = 'error'; return; }
    // The order could not be saved online. Ordering must still work: hand it over by WhatsApp or phone.
    msg.dataset.kind = 'error';
    msg.innerHTML = `We could not save your order online right now. You can send it to us directly instead:
      <span class="fallback"><a class="btn btn--solid" href="${waLink(orderText(lines, fd, t))}" rel="noopener">Send order on WhatsApp</a>
      <a class="btn" href="${telLink}">Call ${esc(BUSINESS.phoneDisplay)}</a></span>`;
  });
}
