// Quote request + newsletter forms → /api/inquiries and /api/subscribe (stored in PostgreSQL / Supabase).
import { postJSON } from './api.js';
import { $, $$, esc } from './util.js';
import { toast } from './toast.js';
import { goTo } from './ui.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const attach = { product: null, plan: null };

function setErrors(form, errors = {}) {
  $$('.err', form).forEach((el) => { el.textContent = errors[el.dataset.for] || ''; });
  $$('input, textarea, select', form).forEach((el) => el.setAttribute('aria-invalid', errors[el.name] ? 'true' : 'false'));
  const first = Object.keys(errors)[0];
  if (first) form.elements[first]?.focus();
}

function renderAttachments() {
  const el = $('#quote-attach');
  const chips = [];
  if (attach.product) chips.push(`<span class="chip-tag">Product: ${esc(attach.product.name)} <button type="button" data-clear="product" aria-label="Remove product">×</button></span>`);
  if (attach.plan) chips.push(`<span class="chip-tag">Plan: ${attach.plan.fixtures} fixtures · ${attach.plan.avgLux} lux <button type="button" data-clear="plan" aria-label="Remove plan">×</button></span>`);
  el.hidden = !chips.length;
  el.innerHTML = chips.join('');
}

const MESSAGES = {
  422: 'Please check the highlighted fields.',
  429: 'Too many requests from your connection. Please try again a little later.',
  503: 'We could not save your request: our database is not connected yet. Please try again soon.',
};

function failure(res) {
  if (res.status === 429 && res.retryAfter) return `Too many requests. Please try again in ${Math.ceil(res.retryAfter / 60)} minute(s).`;
  if (MESSAGES[res.status]) return MESSAGES[res.status];
  if (res.error === 'timeout') return 'The request timed out. Please try again.';
  if (res.status === 0) return 'You seem to be offline. Please check your connection and try again.';
  return 'Something went wrong on our side. Please try again.';
}

function initQuote() {
  const form = $('#quote-form'), msg = $('#quote-msg'), btn = $('#quote-submit');
  window.addEventListener('wadia:quote', (e) => {
    const d = e.detail || {};
    if (d.product) attach.product = d.product;
    if (d.plan) attach.plan = d.plan;
    if (d.room && !form.elements.room.value) {
      const opt = [...form.elements.room.options].find((o) => d.room.toLowerCase().startsWith(o.text.toLowerCase().split(' ')[0]));
      if (opt) form.elements.room.value = opt.value;
    }
    if (d.product && !form.elements.message.value) form.elements.message.value = `I would like a quote for the ${d.product.name}.`;
    renderAttachments();
  });
  $('#quote-attach').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear]');
    if (b) { attach[b.dataset.clear] = null; renderAttachments(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    const errors = {};
    if (!String(fd.name).trim()) errors.name = 'Please tell us your name.';
    if (!EMAIL.test(String(fd.email).trim())) errors.email = 'Please enter a valid email address.';
    if (String(fd.message).trim().length < 5) errors.message = 'Please write a few words about what you need.';
    setErrors(form, errors);
    if (Object.keys(errors).length) { msg.textContent = MESSAGES[422]; msg.dataset.kind = 'error'; return; }

    btn.disabled = true; btn.dataset.busy = '1'; msg.textContent = 'Sending…'; msg.dataset.kind = '';
    const res = await postJSON('/api/inquiries', { ...fd, product: attach.product?.slug, plan: attach.plan });
    btn.disabled = false; delete btn.dataset.busy;
    if (res.ok) {
      form.reset(); attach.product = attach.plan = null; renderAttachments(); setErrors(form);
      msg.textContent = 'Thank you. Your request has been received and we will reply by email.';
      msg.dataset.kind = 'ok';
      toast('Request sent. Thank you!', 'ok');
    } else {
      if (res.status === 422 && res.data?.fields) setErrors(form, res.data.fields);
      msg.textContent = failure(res); msg.dataset.kind = 'error';
    }
  });
}

function initNews() {
  const form = $('#news-form'), msg = $('#news-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    if (!EMAIL.test(String(fd.email).trim())) { msg.textContent = 'Please enter a valid email address.'; msg.dataset.kind = 'error'; form.elements.email.focus(); return; }
    msg.textContent = 'Subscribing…'; msg.dataset.kind = '';
    const res = await postJSON('/api/subscribe', fd);
    if (res.ok) {
      form.reset();
      msg.textContent = res.data?.already ? 'You are already on the list.' : 'You are subscribed. Thank you.';
      msg.dataset.kind = 'ok';
      toast(msg.textContent, 'ok');
    } else { msg.textContent = failure(res); msg.dataset.kind = 'error'; }
  });
}

let inited = false;
export function initForms() {
  if (inited) return;
  inited = true;
  initQuote();
  initNews();
}

/** open the quote form with something attached; safe to call before the form code has loaded */
export function openQuote(detail) {
  initForms();
  window.dispatchEvent(new CustomEvent('wadia:quote', { detail }));
  goTo('#quote');
}
