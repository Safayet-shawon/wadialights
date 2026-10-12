// Button style option: clay · glass · fabric · cut. Remembered per visitor, applied via <html data-btn>.
const STYLES = ['clay', 'glass', 'fabric', 'cut'];
const KEY = 'wl-btn';

function read() {
  try { const v = localStorage.getItem(KEY); if (STYLES.includes(v)) return v; } catch { /* storage unavailable */ }
  return 'clay';
}

export function applyButtonStyle(style) {
  if (!STYLES.includes(style)) style = 'clay';
  document.documentElement.dataset.btn = style;
  try { localStorage.setItem(KEY, style); } catch { /* ignore */ }
  document.querySelectorAll('#style-switch [data-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.btn === style)));
}

export function initButtonStyles() {
  document.documentElement.dataset.btn = read();
  applyButtonStyle(read());
  document.getElementById('style-switch')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-btn]');
    if (b) applyButtonStyle(b.dataset.btn);
  });
  // the "Aa" button in the header cycles through the styles
  document.getElementById('nav-style')?.addEventListener('click', () => {
    const next = STYLES[(STYLES.indexOf(document.documentElement.dataset.btn) + 1) % STYLES.length];
    applyButtonStyle(next);
    import('./toast.js').then((m) => m.toast(`Button style: ${next}`));
  });
}
