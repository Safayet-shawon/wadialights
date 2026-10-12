// The opening experience, played from pre-rendered video (see tools/render.mjs).
//
//   dark ⇄ dragging → triggered → (intro video: flicker → descent → illuminate) → hero loop → free
//        ╰──────────── skip (crossfade through black straight to the hero loop) ────────────╯
//
// intro-pull.mp4 is an all-intra clip of the cord being pulled: dragging scrubs its currentTime.
// Past the threshold it plays on to its end and intro.mp4 takes over. hero.mp4 then loops.
import gsap from 'gsap';
import knob from './knob.json';
import { setSources, whenReady, reducedMotion, suffix } from './media.js';
import { unlock, playClick } from './audio.js';

const PULL_SCRUB = 0.9;       // seconds of intro-pull covered by a full pull (it holds the last 0.1 s)
const THRESHOLD = 0.6;        // fraction of a full pull that clicks the switch
const REVEAL_AT = 6.7;        // seconds into intro.mp4 when the brand copy appears
const STATE = { DARK: 'dark', DRAGGING: 'dragging', TRIGGERED: 'triggered', FLICKER: 'flicker', DESCENT: 'descent', ILLUMINATE: 'illuminate', FREE: 'free' };

export async function createVideoExperience({ dom, onState }) {
  const reduced = reducedMotion();
  const sfx = suffix();
  const k = knob[sfx ? 'p' : 'l'];
  const stage = document.getElementById('video-stage');
  const vPull = document.getElementById('v-pull'), vIntro = document.getElementById('v-intro'), vHero = document.getElementById('v-hero');
  for (const v of [vPull, vIntro, vHero]) { v.muted = true; v.playsInline = true; }

  // only the tiny pull clip is fetched up front; the 2 MB intro and hero are fetched when they are about to be needed
  const fetchClip = (video, name) => { if (video.dataset.loaded) return; video.preload = 'auto'; setSources(video, name); };
  const loadIntro = () => { if (!reduced) fetchClip(vIntro, `intro${sfx}`); };
  const loadHero = () => fetchClip(vHero, 'hero' + sfx);
  setSources(vPull, `intro-pull${sfx}`);
  setTimeout(loadIntro, 2500);          // idle time while the visitor reads the invitation
  // A media *error* sends us to the live WebGL scene. Merely not having preloaded yet (iOS never preloads
  // until the first touch) is not a failure, so don't wait longer than a moment for it.
  await Promise.race([whenReady(vPull, 20000), new Promise((r) => setTimeout(r, 3000))]);
  vPull.pause();
  try { vPull.currentTime = 0; } catch { /* not seekable yet */ }

  let state = STATE.DARK;
  const html = document.documentElement;
  const setState = (s) => { state = s; html.dataset.stage = s; onState?.(s); };
  html.dataset.stage = state;

  /* ---------- drag handle placed over the knob in frame 0 ---------- */
  let rest = [0, 0], pxMax = 200;
  function layout() {
    const W = innerWidth, H = innerHeight, vw = vPull.videoWidth || 1920, vh = vPull.videoHeight || 1080;
    const s = Math.max(W / vw, H / vh), ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
    const at = (n) => [n[0] * vw * s + ox, n[1] * vh * s + oy];
    rest = at(k.rest);
    const full = at(k.full);
    pxMax = Math.max(60, full[1] - rest[1]);
    place(0);
  }
  /** the grab strip is tall: fingers grab the cord anywhere above the knob, not just the knob itself */
  const place = (p) => { dom.cordBtn.style.transform = `translate3d(${rest[0]}px, ${rest[1] + p * pxMax - 110}px, 0) translate(-50%, -50%)`; };
  layout();
  addEventListener('resize', layout);

  /* ---------- scrubbing ---------- */
  let progress = 0, target = 0, down = null, locked = false, raf = 0;
  function scrubLoop() {
    raf = 0;
    if (state === STATE.DARK || state === STATE.DRAGGING) {
      progress += (target - progress) * 0.4;
      if (Math.abs(target - progress) < 0.002) progress = target;
      const t = progress * PULL_SCRUB;
      if (Math.abs(vPull.currentTime - t) > 0.004) vPull.currentTime = t;
      // the handle follows the cord down so the grab point never drifts from the picture
      place(progress);
      if (progress !== target || down) raf = requestAnimationFrame(scrubLoop);
    }
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(scrubLoop); };

  let primed = false;
  /** play-then-pause (muted, inline) inside a gesture makes iOS actually fetch and decode, so seeking shows frames */
  function primeVideos() {
    loadIntro();
    if (primed) return;
    primed = true;
    for (const v of [vPull, vIntro]) {
      if (!v.src && !v.querySelector('source')) continue;
      const p = v.play();
      if (p && p.then) p.then(() => { v.pause(); if (v === vPull) vPull.currentTime = progress * PULL_SCRUB; }).catch(() => {});
    }
  }
  dom.cordBtn.addEventListener('pointerdown', (e) => {
    if (locked || (state !== STATE.DARK)) return;
    e.preventDefault();
    unlock();
    primeVideos();
    dom.cordBtn.setPointerCapture(e.pointerId);
    down = { y: e.clientY, t: performance.now(), moved: 0, from: progress };
    setState(STATE.DRAGGING);
    dom.cordBtn.classList.add('is-grabbed');
    wake();
  });
  dom.cordBtn.addEventListener('pointermove', (e) => {
    if (!down) return;
    down.moved = Math.max(down.moved, Math.abs(e.clientY - down.y));
    target = Math.min(1, Math.max(0, down.from + (e.clientY - down.y) / pxMax));
    if (target >= THRESHOLD) fire();
    wake();
  });
  const end = () => {
    if (!down) return;
    const tap = down.moved < 7 && performance.now() - down.t < 450;
    down = null;
    dom.cordBtn.classList.remove('is-grabbed');
    if (locked) return;
    setState(STATE.DARK);
    if (tap) autoPull(); else { target = 0; wake(); }
  };
  dom.cordBtn.addEventListener('pointerup', end);
  dom.cordBtn.addEventListener('pointercancel', end);
  dom.cordBtn.addEventListener('click', (e) => { if (e.detail === 0 && state === STATE.DARK) { unlock(); primeVideos(); autoPull(); } });   // Enter / Space

  function autoPull() {
    if (locked) return;
    const from = progress, t0 = performance.now();
    const step = (now) => {
      if (locked) return;
      const p = Math.min(1, (now - t0) / 450);
      target = from + (1 - from) * (1 - Math.pow(1 - p, 3));
      progress = target;
      vPull.currentTime = progress * PULL_SCRUB;
      if (target >= THRESHOLD) return fire();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- the switch fires ---------- */
  let introStarted = false, revealed = false, finished = false;
  const items = [...dom.heroItems];
  const reveal = (instant = false) => {
    if (revealed) return;
    revealed = true;
    gsap.fromTo(items, { autoAlpha: 0, y: reduced || instant ? 0 : 26 }, { autoAlpha: 1, y: 0, duration: instant ? 0.01 : reduced ? 0.8 : 1.15, stagger: instant ? 0 : reduced ? 0.08 : 0.2, ease: 'power2.out' });
  };

  function fire() {
    if (locked) return;
    locked = true; down = null;
    setState(STATE.TRIGGERED);
    playClick();
    gsap.to([dom.invite, dom.skip], { autoAlpha: 0, duration: 0.5 });
    gsap.to(dom.cordBtn, { autoAlpha: 0, duration: 0.3 });
    if (reduced) { toHero(true); return; }
    // let the cord finish its travel, then hand over to the intro clip
    vPull.playbackRate = 1;
    const p = vPull.play(); if (p) p.catch(() => {});
    const watch = () => {
      if (vPull.currentTime >= 0.96 || vPull.ended) return startIntro();
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }

  async function startIntro() {
    if (introStarted) return;
    introStarted = true;
    loadHero();
    vPull.pause();
    vIntro.currentTime = 0;
    try { await vIntro.play(); } catch { /* autoplay refused: fall through, the poster still advances the story */ }
    vIntro.classList.add('is-on');
    vPull.classList.remove('is-on');
    setState(STATE.FLICKER);
    const tick = () => {
      if (finished) return;
      const t = vIntro.currentTime;
      if (t >= 1.9 && state === STATE.FLICKER) setState(STATE.DESCENT);
      if (t >= 3.6 && state === STATE.DESCENT) setState(STATE.ILLUMINATE);
      if (t >= REVEAL_AT) reveal();
      if (vIntro.ended || t >= vIntro.duration - 0.05) return toHero(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function toHero(instant) {
    if (finished) return;
    finished = true;
    reveal(instant);
    loadHero();
    vHero.currentTime = 0;
    if (!reduced) { try { await vHero.play(); } catch { /* poster only */ } }
    vHero.classList.add('is-top', 'is-on');
    vIntro.classList.remove('is-on'); vPull.classList.remove('is-on');
    setTimeout(() => { vIntro.pause(); vPull.pause(); }, 700);
    html.classList.remove('is-intro', 'is-locked');
    html.classList.add('is-ready');
    gsap.set(dom.intro, { display: 'none' });
    setState(STATE.FREE);
  }

  /** skip: crossfade through black straight to the finished hero. No flashing, ever. */
  let skipping = false;
  function skip() {
    if (finished || skipping) return;
    skipping = true; locked = true; down = null;
    gsap.to(dom.cover, {
      autoAlpha: 1, duration: 0.35, ease: 'power1.in',
      onComplete: async () => {
        await toHero(true);
        gsap.to(dom.cover, { autoAlpha: 0, duration: 0.9, ease: 'power1.out', onComplete: () => { skipping = false; } });
      },
    });
  }
  dom.skip.addEventListener('click', skip);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !finished) skip(); });

  /* ---------- page integration ---------- */
  let heroInView = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { vHero.pause(); if (introStarted && !finished) vIntro.pause(); }
    else if (finished && heroInView && !reduced) vHero.play().catch(() => {});
    else if (introStarted && !finished) vIntro.play().catch(() => {});
  });

  return {
    get state() { return state; },
    skip,
    setHeroInView(v) {
      heroInView = v;
      if (!finished || reduced) return;
      if (v) vHero.play().catch(() => {}); else vHero.pause();
    },
    /** scroll-linked dolly: the whole picture eases in as the hero leaves */
    setPush(p) { stage.style.transform = `translate3d(0, ${(-p * 40).toFixed(1)}px, 0) scale(${(1 + p * 0.1).toFixed(4)})`; },
  };
}
