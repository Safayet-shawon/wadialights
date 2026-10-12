// Bootstrap shared by every inner page (shop, product, cart, checkout, order, planner, contact, admin).
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '../styles.css';
import '../wadia.css';
import '../features.css';
import '../light.css';
import '../shop.css';
import { initButtonStyles } from '../buttons.js';
import { mountHeader, mountFooter } from '../shell.js';
import { applyButtonStyle } from '../buttons.js';

export function boot(active) {
  const html = document.documentElement;
  html.classList.remove('is-intro', 'is-locked');
  html.classList.add('is-ready');
  mountHeader(active);
  mountFooter();
  initButtonStyles();
  applyButtonStyle(html.dataset.btn);       // footer is injected after the first style pass
  document.getElementById('top')?.setAttribute('tabindex', '-1');
}

/** set the document title and meta description for a page */
export function setMeta(title, description) {
  document.title = title;
  if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
}
