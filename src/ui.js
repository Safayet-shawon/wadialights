// Page-level behaviour: scrolling, section reveals, and every pre-rendered film below the hero.
import gsap from 'gsap';
import { BRAND, PRODUCTS } from './content.js';
import { isSoundOn, setSound } from './audio.js';
import { lazyPlay, setSources, reducedMotion, suffix, isPortrait } from './media.js';

let ST = null;
/** ScrollTrigger is only needed once the intro is over, so it is fetched then (separate chunk) */
async function loadST() {
  if (ST) return ST;
  const m = await import('gsap/ScrollTrigger');
  gsap.registerPlugin(m.ScrollTrigger);
  ST = m.ScrollTrigger;
  return ST;
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

let lenis = null;

/* ----------------------------------------------------------- static content */
export function hydrateStatic() {
  $$('[data-brand]').forEach((el) => { el.textContent = BRAND.name; });
  document.title = `${BRAND.name} — The Art of Illumination`;
  $('#year').textContent = new Date().getFullYear();

  // only the table lamp has an inspector, so only its plate links to it
  $('#plates').innerHTML = PRODUCTS.map((p, i) => `
    <li class="plate plate--${i + 1}">
      <figure>
        <div class="plate__frame">
          <video class="plate__video" data-clip="lamp-${i + 1}" muted loop playsinline preload="none" aria-label="${p.title}: a slow film of the ${p.inspect.toLowerCase().replace('the ', '')}, light gently rising."></video>
          <span class="plate__wait">Loading film&hellip;</span>
        </div>
        <figcaption>
          <p class="plate__no">${p.plate}</p>
          <h3>${p.title}</h3>
          <p class="plate__blurb">${p.blurb}</p>
          ${p.kind === 'table' ? '<a class="link" href="#featured">Inspect the table lamp <span aria-hidden="true">&rarr;</span></a>' : ''}
        </figcaption>
      </figure>
    </li>`).join('');

  $('#footer-collection').innerHTML = PRODUCTS.map((p) => `<li><a href="#collection">${p.title}</a></li>`).join('');
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

export function goTo(hash) {
  scrollToTarget(hash);
}

function scrollToTarget(hash) {
  const el = $(hash);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: hash === '#hero' ? 0 : -10, duration: 1.4 });
  else el.scrollIntoView({ behavior: reducedMQ.matches ? 'auto' : 'smooth', block: 'start' });
}

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
  $$('.plate__video').forEach((v) => {
    const frame = v.closest('.plate__frame');
    v.addEventListener('loadeddata', () => frame.classList.add('is-ready'), { once: true });
    v.addEventListener('error', () => frame.classList.add('is-failed'), { once: true });
    lazyPlay(v, v.dataset.clip, { margin: '400px' });
    if (reducedMotion()) frame.classList.add('is-ready');       // poster only
  });
}

/* --------------------------------------------------------------------- craft */
export function initCraft() {
  $$('.specimen__video').forEach((v) => {
    const spec = v.closest('.specimen');
    v.addEventListener('playing', () => spec.classList.add('has-video'), { once: true });
    lazyPlay(v, v.dataset.clip, { margin: '200px' });
    if (reducedMotion()) spec.classList.add('has-video');
  });
}

/* -------------------------------------------------------- before / after light */
// A draggable wipe between two films of the same camera move: lit underneath, unlit clipped on top.
export function initCompare() {
  const stage = $('#compare-stage'), dark = $('#img-dark'), lit = $('#img-lit');
  const range = $('#dimmer'), out = $('#dimmer-out'), wait = $('#compare-wait');
  const handle = $('#compare-handle'), edge = $('#compare-edge');
  const sfx = suffix();
  if (isPortrait()) stage.style.aspectRatio = '4 / 5';

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

  // both films share one camera move: keep their clocks locked together
  let raf = 0;
  const sync = () => {
    raf = 0;
    if (!lit.paused && Math.abs(dark.currentTime - lit.currentTime) > 0.06) dark.currentTime = lit.currentTime;
    if (!lit.paused) raf = requestAnimationFrame(sync);
  };
  const ready = () => wait.classList.add('is-hidden');
  lit.addEventListener('loadeddata', ready, { once: true });
  lit.addEventListener('playing', () => { if (!raf) raf = requestAnimationFrame(sync); });
  lit.addEventListener('error', () => { wait.textContent = 'The comparison film could not be loaded.'; }, { once: true });

  let loaded = false, hinted = false;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      if (!loaded) { loaded = true; setSources(dark, `room-unlit${sfx}`); setSources(lit, `room-lit${sfx}`); }
      if (!reducedMotion()) {
        dark.play().catch(() => {}); lit.play().catch(() => {});
        if (!hinted) { hinted = true; paint(0); gsap.to({ v: 0 }, { v: 60, duration: 1.6, delay: 0.5, ease: 'power2.inOut', onUpdate() { if (!dragging) paint(this.targets()[0].v); } }); }
      } else ready();
    } else { dark.pause(); lit.pause(); }
  }, { rootMargin: '300px' }).observe($('#light'));
}

/* ----------------------------------------------------------------- turntable */
// The turntable clips are scrubbed constantly, so they are fetched whole and played from memory:
// every seek is then local (no range requests, no stalls).
async function loadWhole(video, name) {
  const ext = video.canPlayType('video/webm; codecs="vp9"') ? 'webm' : 'mp4';
  video.poster = `/videos/${name}.webp`;
  try {
    const r = await fetch(`/videos/${name}.${ext}`);
    if (!r.ok) throw new Error(r.statusText);
    video.src = URL.createObjectURL(await r.blob());
    video.load();
  } catch { setSources(video, name); }
}
// table-lamp-on / table-lamp-off share one all-intra 360° camera move: dragging scrubs currentTime.
export function initFeatured() {
  const viewer = $('#viewer'), on = $('#v-table-on'), off = $('#v-table-off'), hint = $('#viewer-hint');
  const btn = $('#toggle-light');
  let loaded = false, visible = false, raf = 0, last = 0;
  let t = 0, vel = 0, dragging = false, idleAt = 0, lit = true;
  const DUR = 12;

  const setT = (n) => {
    t = ((n % DUR) + DUR) % DUR;
    for (const v of [on, off]) if (v.readyState >= 1 && Math.abs(v.currentTime - t) > 1 / 90) v.currentTime = t;
  };

  function loop(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (!dragging) {
      vel *= Math.pow(0.04, dt);                                  // inertia
      let step = vel * dt;
      if (!reducedMQ.matches && now > idleAt) step += dt * 0.8;   // slow idle turn after the visitor lets go
      if (Math.abs(step) > 1e-5) setT(t + step);
    }
    raf = requestAnimationFrame(loop);
  }
  const wake = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  viewer.addEventListener('pointerdown', (e) => {
    dragging = true; vel = 0; hint.classList.remove('is-on');
    viewer.setPointerCapture(e.pointerId);
    viewer.dataset.x = e.clientX;
  });
  viewer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - Number(viewer.dataset.x);
    viewer.dataset.x = e.clientX;
    const dt = (dx / viewer.clientWidth) * DUR * 1.1;             // one viewer-width ≈ one revolution
    setT(t - dt);
    vel = vel * 0.6 + (-dt / 0.016) * 0.4;
  });
  const release = () => { dragging = false; idleAt = performance.now() + 3000; wake(); };
  viewer.addEventListener('pointerup', release);
  viewer.addEventListener('pointercancel', release);
  // keyboard: arrow keys turn it
  viewer.tabIndex = 0;
  viewer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { setT(t - 0.5); idleAt = performance.now() + 3000; }
    if (e.key === 'ArrowRight') { setT(t + 0.5); idleAt = performance.now() + 3000; }
  });

  btn.addEventListener('click', () => {
    lit = !lit;
    btn.setAttribute('aria-pressed', String(lit));
    btn.textContent = lit ? 'Switch off' : 'Switch on';
    gsap.to(on, { opacity: lit ? 1 : 0, duration: reducedMQ.matches ? 0.01 : 0.7, ease: 'power2.inOut' });
  });

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !loaded) {
      loaded = true;
      loadWhole(off, 'table-lamp-off'); loadWhole(on, 'table-lamp-on');
      on.addEventListener('loadeddata', () => { hint.classList.add('is-on'); idleAt = performance.now() + 1200; }, { once: true });
    }
    if (visible) wake();
  }, { rootMargin: '300px' }).observe(viewer);
}
