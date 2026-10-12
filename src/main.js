import './devtimers.js';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import './styles.css';
import './wadia.css';
import './features.css';
import './light.css';
import './design.css';
import gsap from 'gsap';
import { createVideoExperience } from './videoExperience.js';
import { playLoader } from './loader.js';
import * as ui from './ui.js';
import { initButtonStyles } from './buttons.js';
import { whenNear } from './util.js';
import { mountFooter, bindCartBadge, initNavMenu } from './shell.js';

const $ = (s) => document.querySelector(s);
const html = document.documentElement;
const dom = {
  canvas: $('#stage'),
  intro: $('#intro'),
  invite: $('#invite'),
  skip: $('#skip'),
  cordBtn: $('#cord-hit'),
  cover: $('#cover'),
  heroItems: document.querySelectorAll('#hero [data-reveal]'),
};

mountFooter();
bindCartBadge();
initButtonStyles();
ui.hydrateStatic();
ui.initSoundToggle();
ui.initAnchors();

let exp = null;
let loaderDone = Promise.resolve();

let belowFold = false;
/** everything under the hero is initialised only after the opening: scrolling is locked until then anyway */
function initBelowFold() {
  if (belowFold) return;
  belowFold = true;
  ui.initScroll(exp);
  ui.initPlates();
  ui.initCompare();
  ui.initFeatured();
  whenNear($('#featured-products'), () => import('./shop/featured.js').then((x) => x.initFeaturedStrip()), '800px');
}

function revealPage() {
  initBelowFold();
  ui.startScrolling();
}

/**
 * Last-resort path (no video and no WebGL): the same story in CSS. A dark page, one switch,
 * a warm glow and the same hero. The page below does not depend on it.
 */
function fallback(reason) {
  console.warn('Falling back to the static opening:', reason);
  html.classList.add('no-webgl');
  dom.canvas.style.display = 'none';
  document.getElementById('video-stage').style.display = 'none';
  dom.cordBtn.hidden = true;
  $('#invite .invite__title').textContent = 'Switch on the light';
  const sw = $('#fallback-switch');
  sw.hidden = false;
  const light = () => {
    html.classList.add('is-lit');
    gsap.to([dom.invite, dom.skip, sw], { autoAlpha: 0, duration: 0.5 });
    gsap.fromTo(dom.heroItems, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.18, delay: 0.5, ease: 'power2.out' });
    gsap.delayedCall(2, () => {
      html.classList.remove('is-intro', 'is-locked');
      html.classList.add('is-ready');
      dom.intro.style.display = 'none';
      revealPage();
    });
  };
  sw.addEventListener('click', light);
  dom.skip.addEventListener('click', light);
  finishLoader();
}

async function finishLoader() {
  await loaderDone;               // the bulb finishes drawing itself first
  const l = $('#loader');
  if (!l) return;
  l.classList.add('is-done');
  setTimeout(() => l.remove(), 900);
  // returning visitors get the skip option almost immediately
  let seen = false;
  try { seen = localStorage.getItem('wl-seen') === '1'; } catch { /* storage unavailable */ }
  setTimeout(() => dom.skip.classList.add('is-offered'), seen ? 1200 : 4500);
}

/**
 * Opening experience: pre-rendered video first. If the videos fail with an error, the live WebGL scene
 * (the same room, rendered in the browser) is loaded on demand; if that fails too, the CSS fallback runs.
 */
async function startOpening() {
  const onState = (s) => {
    if (s !== 'free') return;
    try { localStorage.setItem('wl-seen', '1'); } catch { /* ignore */ }
    revealPage();
  };
  try {
    return await createVideoExperience({ dom, onState });
  } catch (err) {
    console.warn('Videos unavailable, loading the live scene instead', err);
    document.getElementById('video-stage').style.display = 'none';
    dom.canvas.hidden = false;
    const { createExperience } = await import('./experience.js');
    return createExperience({ canvas: dom.canvas, dom: { ...dom, onContextLost: () => fallback('context lost') }, onState });
  }
}

async function boot() {
  loaderDone = playLoader();
  // (raced with a timer: rAF never fires in a background tab, and boot must not wait on it)
  await Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 150)),
  ]);
  try {
    exp = await startOpening();
    finishLoader();
    window.__wl = exp;        // handy for debugging in the console
    if (new URLSearchParams(location.search).has('skip')) exp.skip();   // ?skip jumps straight to the hero
  } catch (err) {
    fallback(err);
  }
}

boot();
