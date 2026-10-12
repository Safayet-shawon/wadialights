// Shared header + footer for every page (the home page keeps its own cinematic header but uses this footer).
import { BUSINESS } from '../server/lib/business.js';
import { CATEGORY_LABELS } from '../server/lib/seed.js';
import { onCartChange } from './shop/cart.js';
import { esc } from './util.js';

export const BULB = (cls) => `<svg class="${cls}" viewBox="0 0 80 124" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M62 18C34 2 6 22 12 50c3 14 14 20 16 32h22c2-12 12-18 16-32"/><path d="M46 30C32 24 24 38 30 48c4 7 10 8 10 18"/><path d="M28 92l28-6"/><path d="M30 102l26-6"/><path d="M34 112l18-4"/></g></svg>`;

export const LOGO = (cls = '') => `<span class="logo ${cls}" role="img" aria-label="WADIA Lights and Automation">${BULB('logo__bulb')}<i class="logo__dots" aria-hidden="true"></i><span class="logo__text"><b>WA<em>D</em>IA</b><small>Lights &amp; Automation</small></span></span>`;

const CART_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 8h12l-1 12H7L6 8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export const cartLinkHTML = () => `<a class="nav__cart" href="/cart" aria-label="Shopping cart">${CART_ICON}<span class="cart-badge" id="cart-badge" hidden>0</span></a>`;

export function mountHeader(active = '') {
  const el = document.getElementById('shell-header');
  if (!el) return;
  const link = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  el.outerHTML = `<header class="nav is-solid" id="nav">
    <a class="nav__brand" href="/" aria-label="WADIA, home">${LOGO('logo--nav')}</a>
    <nav class="nav__links" aria-label="Primary">
      ${link('/shop', 'Shop', 'shop')}${link('/planner', 'Planner', 'planner')}${link('/#craft', 'Craft', 'craft')}${link('/contact', 'Contact', 'contact')}
    </nav>
    ${cartLinkHTML()}
    <button id="nav-style" class="nav__style" type="button" aria-label="Change button style" title="Change button style"><span aria-hidden="true">Aa</span></button>
  </header>`;
  bindCartBadge();
}

export function bindCartBadge() {
  onCartChange((n) => {
    const b = document.getElementById('cart-badge');
    if (!b) return;
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n === 0;
  });
}

export function mountFooter() {
  const el = document.getElementById('shell-footer');
  if (!el) return;
  el.outerHTML = `<footer class="footer" id="site-footer">
    <div class="wrap footer__grid">
      <div class="footer__brand">
        <div class="footer__mark">${LOGO('logo--lg')}</div>
        <p class="footer__tag">${esc(BUSINESS.description)}</p>
      </div>
      <nav aria-label="Shop"><h3>Shop</h3>
        <ul>${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<li><a href="/shop?category=${k}">${esc(v)}</a></li>`).join('')}<li><a href="/shop">All products</a></li></ul>
      </nav>
      <nav aria-label="Help"><h3>Help</h3>
        <ul><li><a href="/planner">Lighting planner</a></li><li><a href="/order">Track an order</a></li><li><a href="/contact">Contact us</a></li><li><a href="/cart">Your cart</a></li></ul>
      </nav>
      <div><h3>Visit &amp; contact</h3>
        <address>${esc(BUSINESS.address)}<br /><a href="tel:${BUSINESS.phoneTel}">${esc(BUSINESS.phoneDisplay)}</a></address>
        <ul>
          <li><a href="https://wa.me/${BUSINESS.whatsapp}" rel="noopener">WhatsApp</a></li>
          <li><a href="${BUSINESS.messenger}" rel="noopener">Messenger</a></li>
          <li><a href="${BUSINESS.facebook}" rel="noopener">Facebook</a></li>
          <li><a href="${BUSINESS.map}" rel="noopener">Map</a></li>
        </ul>
      </div>
    </div>
    <div class="wrap footer__style">
      <span id="btn-style-label">Button style</span>
      <div class="style-switch" role="group" aria-labelledby="btn-style-label" id="style-switch">
        <button type="button" data-btn="clay" aria-pressed="true">Clay</button>
        <button type="button" data-btn="glass" aria-pressed="false">Glass</button>
        <button type="button" data-btn="fabric" aria-pressed="false">Fabric</button>
        <button type="button" data-btn="cut" aria-pressed="false">Cut</button>
      </div>
    </div>
    <div class="wrap footer__base">
      <span>&copy; ${new Date().getFullYear()} WADIA lighting &middot; Dhaka</span>
      <a href="#top" class="footer__top">Back to top &uarr;</a>
    </div>
  </footer>`;
}
