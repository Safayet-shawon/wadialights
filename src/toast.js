let timer = 0;
/** brief, polite, screen-reader-announced notification */
export function toast(message, kind = 'info', ms = 4200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('is-on');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('is-on'), ms);
}
