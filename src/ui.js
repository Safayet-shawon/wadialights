// Page-level behaviour: scrolling, section reveals, and the photographs below the hero.
import gsap from 'gsap';
import { BRAND, PRODUCTS } from './content.js';
import { isSoundOn, setSound } from './audio.js';
import { reducedMotion } from './media.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

let lenis = null;
let ST = null;
/** ScrollTrigger is only needed once the intro is over, so it is fetched then (separate chunk) */
async function loadST() {
  if (ST) return ST;
  const m = await import('gsap/ScrollTrigger');
  gsap.registerPlugin(m.ScrollTrigger);
  ST = m.ScrollTrigger;
  return ST;
}

/* ----------------------------------------------------------- static content */
export function hydrateStatic() {
  $$('[data-brand]').forEach((el) => { el.textContent = BRAND.name; });
  document.title = 'WADIA — Lights & Automation';

  // only the table lamp has an inspector, so only its plate links to it
  $('#plates').innerHTML = PRODUCTS.map((p, i) => `
    <li class="plate plate--${i + 1}">
      <figure>
        <div class="plate__frame">
          <img class="plate__img" src="/photos/plate-${i + 1}.webp" alt="${p.title}: ${p.inspect.toLowerCase().replace('the ', '')} lit in a bright room." width="1080" height="1350" loading="lazy" decoding="async" />
        </div>
        <figcaption>
          <p class="plate__no">${p.plate}</p>
          <h3>${p.title}</h3>
          <p class="plate__blurb">${p.blurb}</p>
          <a class="link" href="/shop?category=${p.kind}">Shop ${p.title.toLowerCase()} <span aria-hidden="true">&rarr;</span></a>
        </figcaption>
      </figure>
    </li>`).join('');

}

/* ------------------------------------------------------------- sound toggle */
export function initSoundToggle() {
  const btn = $('#sound');
  const paint = () => {
    const on = isSoundOn();
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Switch sound off' : 'Switch sound on');
    $('.nav__sound-text', btn).textContent = on ? 'Sound on' : 'Sound off';
    btn.classList.toggle('is-off', !on);
  };
  btn.addEventListener('click', () => { setSound(!isSoundOn()); paint(); });
  paint();
}

/* ------------------------------------------------------------------ scrolling */
export async function startScrolling() {
  const ScrollTrigger = await loadST();
  if (!reducedMQ.matches && !lenis) {
    const { default: Lenis } = await import('lenis');
    lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  ScrollTrigger.refresh();
}

function scrollToTarget(hash) {
  const el = $(hash);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: hash === '#hero' ? 0 : -10, duration: 1.4 });
  else el.scrollIntoView({ behavior: reducedMQ.matches ? 'auto' : 'smooth', block: 'start' });
}
export const goTo = scrollToTarget;

export function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href');
    if (hash.length < 2) return;
    e.preventDefault();
    scrollToTarget(hash);
    history.replaceState(null, '', hash);
  });
}

/* ----------------------------------------------------------- scroll storytelling */
export async function initScroll(exp) {
  const ScrollTrigger = await loadST();
  ScrollTrigger.create({
    trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true,
    onUpdate: (self) => exp?.setPush(self.progress),
    onToggle: (self) => exp?.setHeroInView(self.isActive),
  });
  gsap.to('.hero__inner', {
    opacity: 0, y: reducedMQ.matches ? 0 : -50, ease: 'none',
    scrollTrigger: { trigger: '#hero', start: '8% top', end: '65% top', scrub: true },
  });
  gsap.to('.hero__cue', { opacity: 0, scrollTrigger: { trigger: '#hero', start: 'top top', end: '15% top', scrub: true } });

  ScrollTrigger.create({ trigger: '.page', start: 'top 80px', end: 'max', onToggle: (s) => $('#nav').classList.toggle('is-solid', s.isActive) });

  $$('.chapter').forEach((el) => ScrollTrigger.create({
    trigger: el, start: 'top 72%', end: 'bottom 28%', toggleClass: { targets: el, className: 'is-lit' },
  }));

  if (reducedMQ.matches) return;
  const reveal = (targets, vars = {}) => $$(targets).forEach((el) => gsap.from(el, {
    autoAlpha: 0, y: 34, duration: 1.1, ease: 'power2.out', ...vars,
    scrollTrigger: { trigger: el, start: 'top 88%', once: true },
  }));
  reveal('.section-head > *');
  reveal('.plate', { y: 60 });
  reveal('.chapter', { y: 40 });
  reveal('.craft__lead > *', { y: 26 });
  reveal('.craft__quote');
  reveal('.compare');
  reveal('.featured__copy > *', { y: 24 });
  reveal('.viewer', { y: 40 });
  reveal('.footer__grid > *', { y: 24 });
}

/* -------------------------------------------------------------------- plates */
export function initPlates() {
  $$('.plate__img').forEach((img) => {
    const frame = img.closest('.plate__frame');
    const ready = () => frame.classList.add('is-ready');
    if (img.complete && img.naturalWidth) ready(); else { img.addEventListener('load', ready, { once: true }); img.addEventListener('error', ready, { once: true }); }
  });
}

/* -------------------------------------------------------- before / after light */
// A draggable wipe between two photographs of the same room: lit underneath, unlit clipped on top.
export function initCompare() {
  const stage = $('#compare-stage'), dark = $('#img-dark'), lit = $('#img-lit');
  const range = $('#dimmer'), out = $('#dimmer-out'), wait = $('#compare-wait');
  const handle = $('#compare-handle'), edge = $('#compare-edge');

  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-valuemin', '0'); handle.setAttribute('aria-valuemax', '100');
  handle.setAttribute('aria-valuetext', 'Light level');

  let value = Number(range.value) || 0;
  const paint = (v) => {
    value = Math.min(100, Math.max(0, v));
    range.value = String(Math.round(value));
    out.textContent = `${Math.round(value)}%`;
    dark.style.clipPath = `inset(0 0 0 ${value}%)`;
    handle.style.left = edge.style.left = `${value}%`;
    range.style.setProperty('--fill', `${value}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(value)));
    $('.compare__tag--l').style.opacity = value > 14 ? 1 : 0;
    $('.compare__tag--r').style.opacity = value < 86 ? 1 : 0;
  };
  paint(value);

  range.addEventListener('input', () => paint(Number(range.value)));
  const fromPointer = (e) => { const r = stage.getBoundingClientRect(); paint(((e.clientX - r.left) / r.width) * 100); };
  let dragging = false;
  stage.addEventListener('pointerdown', (e) => {
    dragging = true; stage.setPointerCapture(e.pointerId); stage.classList.add('is-dragging'); fromPointer(e);
  });
  stage.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  const stop = () => { dragging = false; stage.classList.remove('is-dragging'); };
  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 20 : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { paint(value - step); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { paint(value + step); e.preventDefault(); }
    if (e.key === 'Home') { paint(0); e.preventDefault(); }
    if (e.key === 'End') { paint(100); e.preventDefault(); }
  });

  const tweenTo = (to) => {
    const o = { v: value };
    if (reducedMotion()) return paint(to);
    gsap.to(o, { v: to, duration: 0.9, ease: 'power2.inOut', onUpdate: () => paint(o.v) });
  };
  $('#lights-on').addEventListener('click', () => tweenTo(100));
  $('#lights-off').addEventListener('click', () => tweenTo(0));

  const ready = () => wait.classList.add('is-hidden');
  let n = 0;
  for (const img of [dark, lit]) {
    const done = () => { if (++n === 2) ready(); };
    if (img.complete && img.naturalWidth) done(); else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', () => { wait.textContent = 'The comparison could not be loaded.'; }, { once: true }); }
  }

  // sweep once when it scrolls into view, as a hint that it can be dragged
  let hinted = false;
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || hinted || reducedMotion()) return;
    hinted = true;
    paint(0);
    gsap.to({ v: 0 }, { v: 60, duration: 1.6, delay: 0.4, ease: 'power2.inOut', onUpdate() { if (!dragging) paint(this.targets()[0].v); } });
  }, { threshold: 0.4 }).observe($('#compare-stage'));
}

/* ------------------------------------------------------------- featured lamp */
// Two photographs of the same lamp: lit and unlit. The switch crossfades between them.
export function initFeatured() {
  const on = $('#v-table-on'), btn = $('#toggle-light');
  let lit = true;
  btn.addEventListener('click', () => {
    lit = !lit;
    btn.setAttribute('aria-pressed', String(lit));
    btn.textContent = lit ? 'Switch off' : 'Switch on';
    gsap.to(on, { opacity: lit ? 1 : 0, duration: reducedMQ.matches ? 0.01 : 0.8, ease: 'power2.inOut' });
  });
}
