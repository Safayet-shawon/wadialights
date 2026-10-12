/** run `fn` once input has been quiet for `ms` (search boxes, planner fields). Returns a cancellable function. */
export function debounce(fn, ms = 250) {
  let t = 0;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

/** call `fn` at most once per animation frame with the latest arguments */
export function rafThrottle(fn) {
  let raf = 0, last;
  return (...args) => { last = args; if (!raf) raf = requestAnimationFrame(() => { raf = 0; fn(...last); }); };
}

/** run `load()` the first time `el` comes within `margin` of the viewport (code-splitting by scroll position) */
export function whenNear(el, load, margin = '600px') {
  if (!el) return;
  if (!('IntersectionObserver' in window)) { load(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: margin });
  io.observe(el);
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
