// The opening experience: one continuous scene, driven by a small state machine.
//
//   loading → dark → (dragging) → triggered → flicker → descent → illuminate → hero → free
//                 ╰────────────── skip (crossfade straight to hero) ──────────────╯
//
// Everything on screen is one WebGL scene. There is no video and no scene swap.
import * as THREE from 'three';
import gsap from 'gsap';
import { createMaterials } from './scene/materials.js';
import { buildRoom } from './scene/room.js';
import { PullCord } from './scene/cord.js';
import { unlock, playClick } from './audio.js';
import { poses } from './scene/path.js';

export const STATE = {
  LOADING: 'loading', DARK: 'dark', DRAGGING: 'dragging', TRIGGERED: 'triggered',
  FLICKER: 'flicker', DESCENT: 'descent', ILLUMINATE: 'illuminate', HERO: 'hero', FREE: 'free',
};

const ease = (t) => t * t * (3 - 2 * t);

const yieldToPaint = () => new Promise((r) => setTimeout(r, 24));   // keeps the loader animation moving between heavy steps

export async function createExperience({ canvas, dom, onState }) {
  const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const lite = coarse || Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  const qp = new URLSearchParams(location.search);
  const dprCap = Number(qp.get('dpr')) || (lite ? 1.5 : 2);   // ?dpr=0.5 is handy on software renderers

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  await yieldToPaint();
  const M = createMaterials({ lite });
  await yieldToPaint();
  const room = buildRoom(renderer, M, { lite });
  await yieldToPaint();
  const { scene } = room;

  const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.05, 30);
  const cordAnchor = room.cordAnchor();
  const cord = new PullCord(M, cordAnchor);
  scene.add(cord.group);

  /* ---------- camera state ---------- */
  const cam = { t: 0, push: 0 };
  let path = poses(innerWidth / innerHeight);
  let posCurve, lookCurve;
  const buildCurves = () => {
    path = poses(camera.aspect);
    posCurve = new THREE.CatmullRomCurve3(path.pos, false, 'centripetal');
    lookCurve = new THREE.CatmullRomCurve3(path.look, false, 'centripetal');
  };
  buildCurves();

  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3(), right = new THREE.Vector3();

  function poseCamera(time) {
    posCurve.getPoint(cam.t, tmpP);
    lookCurve.getPoint(cam.t, tmpL);
    const s = ease(cam.t);
    camera.fov = path.fov0 + (path.fov1 - path.fov0) * s;
    camera.updateProjectionMatrix();
    if (!reducedMQ.matches) {
      // breathing / handheld hint, strongest while the camera is still
      tmpP.y += Math.sin(time * 0.7) * 0.004 * (1 - s);
      tmpP.x += Math.sin(time * 0.43) * 0.004 * (1 - s);
    }
    tmpP.z -= cam.push * 1.15;
    tmpL.z -= cam.push * 0.4;
    camera.position.copy(tmpP);
    camera.lookAt(tmpL);
    if (par.x || par.y) {
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(right, par.x * 0.16 * s).addScaledVector(camera.up, par.y * 0.07 * s);
      camera.lookAt(tmpL);
    }
  }

  /* ---------- light power proxies (what GSAP tweens) ---------- */
  const pw = { ceiling: 0, sconce: 0, table: 0, picture: 0, floor: 0, pilot: 1 };
  let lightsDirty = true;
  const applyPower = () => {
    for (const k of ['ceiling', 'sconce', 'table', 'picture', 'floor']) room.setPower(k, pw[k]);
    room.setPilot(pw.pilot);
  };

  /* ---------- state ---------- */
  let state = STATE.LOADING;
  let tl = null;
  let sequenceStarted = false;
  const setState = (s) => { state = s; document.documentElement.dataset.stage = s; onState?.(s); };

  const items = [...dom.heroItems];

  function heroReveal(reduced) {
    const t = gsap.timeline();
    t.fromTo(items, { autoAlpha: 0, y: reduced ? 0 : 26 }, { autoAlpha: 1, y: 0, duration: reduced ? 0.8 : 1.15, stagger: reduced ? 0.08 : 0.2, ease: 'power2.out' });
    return t;
  }

  function buildSequence({ reduced }) {
    const t = gsap.timeline({ paused: true, onComplete: finish });
    t.call(() => setState(STATE.FLICKER), null, reduced ? 0.1 : 0.4);
    t.to([dom.invite, dom.skip], { autoAlpha: 0, duration: 0.5, ease: 'power1.out' }, 0.1);
    t.to(dom.cordBtn, { autoAlpha: 0, duration: 0.4 }, 0.6);

    if (reduced) {
      // no flicker, no long camera move: one calm fade-up
      t.to(pw, { ceiling: 1, duration: 1.2, ease: 'power1.inOut' }, 0.2);
      t.to(cam, { t: 1, duration: 1.4, ease: 'power1.inOut' }, 0.2);
      t.to(pw, { sconce: 1, table: 1, picture: 1, floor: 1, duration: 1.4, ease: 'power1.inOut' }, 0.5);
      t.call(() => setState(STATE.ILLUMINATE), null, 0.8);
      t.add(heroReveal(true), 1.6);
      t.to(pw, { pilot: 0, duration: 1 }, 0.2);
      return t;
    }

    // Act 03 – the filament catches. Irregular, soft-edged, three weak pulses (<3 per second), then it settles.
    const f = [
      [0.4, 0.34, 0.05], [0.47, 0.03, 0.12],
      [0.78, 0.58, 0.06], [0.88, 0.1, 0.18],
      [1.32, 0.82, 0.07], [1.42, 0.5, 0.12],
    ];
    f.forEach(([at, v, d]) => t.to(pw, { ceiling: v, duration: d, ease: 'sine.inOut' }, at));
    t.to(pw, { ceiling: 1, duration: 0.75, ease: 'power2.out' }, 1.58);
    t.to(pw, { pilot: 0, duration: 1.4, ease: 'power1.in' }, 1.6);

    // Act 04 – camera descends from the fixture into the room
    t.call(() => setState(STATE.DESCENT), null, 1.9);
    t.to(cam, { t: 1, duration: 5.6, ease: 'power2.inOut' }, 1.9);

    // Act 05 – the room comes alive, one source at a time
    t.call(() => setState(STATE.ILLUMINATE), null, 3.6);
    t.to(pw, { sconce: 0.55, duration: 0.35, ease: 'sine.in' }, 3.7);
    t.to(pw, { sconce: 0.25, duration: 0.14, ease: 'sine.inOut' }, 4.05);
    t.to(pw, { sconce: 1, duration: 1.1, ease: 'power2.out' }, 4.2);
    t.to(pw, { table: 1, duration: 1.8, ease: 'power2.inOut' }, 4.9);
    t.to(pw, { picture: 1, duration: 1.3, ease: 'power2.inOut' }, 5.7);
    t.to(pw, { floor: 1, duration: 1.8, ease: 'power2.inOut' }, 6.3);

    // Act 06 – only now does the brand speak
    t.add(heroReveal(false), 6.7);
    return t;
  }

  function finish() {
    setState(STATE.HERO);
    document.documentElement.classList.remove('is-intro', 'is-locked');
    document.documentElement.classList.add('is-ready');
    gsap.set(dom.intro, { display: 'none' });
    onState?.(STATE.FREE);
    state = STATE.FREE;
    document.documentElement.dataset.stage = 'free';
    lightsDirty = true;
    wake();
  }

  function begin({ silent = false } = {}) {
    if (sequenceStarted) return;
    sequenceStarted = true;
    setState(STATE.TRIGGERED);
    if (!silent) playClick();
    tl = buildSequence({ reduced: reducedMQ.matches });
    tl.play(0);
    wake();
  }

  cord.onFire = () => begin();

  /** Skip: crossfade through black straight to the finished hero. No flashing, ever. */
  function skip() {
    if (state === STATE.FREE || state === STATE.LOADING || skipping) return;
    skipping = true;
    cord.locked = true; cord.dragging = false;
    gsap.to(dom.cover, {
      autoAlpha: 1, duration: 0.35, ease: 'power1.in',
      onComplete: () => {
        sequenceStarted = true;
        if (!tl) tl = buildSequence({ reduced: reducedMQ.matches });
        tl.progress(1);       // jump every tween & callback to its end state
        gsap.set(dom.intro, { display: 'none' });
        gsap.to(dom.cover, { autoAlpha: 0, duration: 0.9, ease: 'power1.out', onComplete: () => { skipping = false; } });
        wake();
      },
    });
  }
  let skipping = false;

  /* ---------- input: cord drag via an accessible DOM button ---------- */
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3(), hit0 = new THREE.Vector3(), world = new THREE.Vector3();
  const flat = new THREE.Vector3();
  let down = null;

  const pointerWorld = (e, out) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    camera.getWorldDirection(flat); flat.y = 0; flat.normalize();
    plane.setFromNormalAndCoplanarPoint(flat.negate(), cord.rest);
    return raycaster.ray.intersectPlane(plane, out);
  };

  dom.cordBtn.addEventListener('pointerdown', (e) => {
    if (state !== STATE.DARK || !cord.grab()) return;
    e.preventDefault();
    unlock();
    dom.cordBtn.setPointerCapture(e.pointerId);
    pointerWorld(e, hit0);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    setState(STATE.DRAGGING);
    dom.cordBtn.classList.add('is-grabbed');
    wake();
  });
  dom.cordBtn.addEventListener('pointermove', (e) => {
    if (!down || !pointerWorld(e, hit)) return;
    down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    world.copy(cord.rest).add(hit).sub(hit0);
    cord.drag(world);
  });
  const endDrag = (e) => {
    if (!down) return;
    const wasTap = down.moved < 7 && performance.now() - down.t < 450;
    down = null;
    dom.cordBtn.classList.remove('is-grabbed');
    if (state === STATE.DRAGGING) setState(STATE.DARK);
    if (cord.locked) return;
    if (wasTap) cord.autoPull(); else cord.release();
  };
  dom.cordBtn.addEventListener('pointerup', endDrag);
  dom.cordBtn.addEventListener('pointercancel', endDrag);
  // keyboard: Enter / Space arrive as a click with detail === 0
  dom.cordBtn.addEventListener('click', (e) => {
    if (e.detail === 0 && state === STATE.DARK) { unlock(); cord.autoPull(); wake(); }
  });
  dom.skip.addEventListener('click', skip);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state !== STATE.FREE) skip();
  });

  // pointer parallax once the room is revealed
  if (!coarse) {
    window.addEventListener('pointermove', (e) => {
      if (state !== STATE.FREE || reducedMQ.matches) return;
      par.tx = (e.clientX / innerWidth) * 2 - 1;
      par.ty = -((e.clientY / innerHeight) * 2 - 1);
      wake();
    }, { passive: true });
  }

  /* ---------- render loop ---------- */
  let raf = 0, last = 0, clock = 0, visible = true, heroInView = true, perfFrames = 0, perfSum = 0;

  const projected = new THREE.Vector3();
  function placeCordButton() {
    projected.copy(cord.knob); projected.y -= 0.05;
    projected.project(camera);
    const x = (projected.x * 0.5 + 0.5) * innerWidth, y = (-projected.y * 0.5 + 0.5) * innerHeight;
    dom.cordBtn.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  }

  function shouldRun() {
    return visible && (heroInView || state !== STATE.FREE);
  }

  function frame(now) {
    raf = 0;
    if (!shouldRun()) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now; clock += dt;

    let busy = false;
    if (tl && tl.isActive()) { busy = true; lightsDirty = true; }
    if (state === STATE.DARK || state === STATE.DRAGGING || state === STATE.TRIGGERED || state === STATE.FLICKER ||
        state === STATE.DESCENT || state === STATE.ILLUMINATE || skipping) busy = true;

    const cordMoving = cord.dragging || cord.vel.lengthSq() > 1e-6 || cord._script != null || cord._hold > 0 || state === STATE.DARK;
    if (cordMoving || !cord.fired) cord.update(dt);
    cord.group.visible = cam.t < 0.55;

    if (lightsDirty) { applyPower(); lightsDirty = false; }

    // switch + fixture react to the pull
    room.switchBody.position.y = -0.31 + cord.pull * 0.012;
    room.fixtureBody.rotation.z = -cord.pull * 0.004 + (cord.knob.x - cord.rest.x) * 0.02;
    room.fixtureBody.rotation.x = cord.pull * 0.004;

    par.x += (par.tx - par.x) * Math.min(1, dt * 2.4);
    par.y += (par.ty - par.y) * Math.min(1, dt * 2.4);
    const parMoving = Math.abs(par.tx - par.x) + Math.abs(par.ty - par.y) > 0.0008;
    if (parMoving) busy = true;
    if (state === STATE.FREE && Math.abs(cam.push) > 0) busy = true;

    poseCamera(clock);
    if (cord.group.visible && (state === STATE.DARK || state === STATE.DRAGGING || state === STATE.TRIGGERED)) placeCordButton();

    // adaptive quality: if the cinematic move runs slow, drop the pixel ratio once
    if (state === STATE.DESCENT && perfFrames < 90) {
      perfFrames++; perfSum += dt;
      if (perfFrames === 90 && perfSum / 90 > 0.03 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.75));
        renderer.setSize(innerWidth, innerHeight, false);
      }
    }

    renderer.render(scene, camera);
    if (busy || parMoving || state === STATE.FREE && sceneNeedsFrame()) raf = requestAnimationFrame(frame);
  }
  const sceneNeedsFrame = () => false;

  function wake() {
    if (!raf && shouldRun()) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) wake(); });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    renderer.setSize(innerWidth, innerHeight, false);
    buildCurves();
    camera.updateProjectionMatrix();
    wake();
  });
  camera.aspect = innerWidth / innerHeight;
  buildCurves();

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dom.onContextLost?.(); });

  /* ---------- first frame ---------- */
  applyPower();
  poseCamera(0);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  setState(STATE.DARK);
  wake();
  if (reducedMQ.matches) document.documentElement.classList.add('reduced-motion');

  /* ---------- API used by the page ---------- */
  return {
    renderer, scene, camera, room, cord, M,
    get state() { return state; },
    skip,
    setHeroInView(v) { heroInView = v; if (v) wake(); },
    setPush(p) { cam.push = p; wake(); },
    /** test hook: freeze the opening timeline at a given second (starts it if needed). */
    debugSeek(sec) {
      if (!sequenceStarted) { sequenceStarted = true; cord.locked = true; setState(STATE.TRIGGERED); tl = buildSequence({ reduced: reducedMQ.matches }); }
      tl.pause(); tl.time(sec); lightsDirty = true; wake();
    },
    /** the finished hero view with lights fully on / room dim, as images for the before/after control. */
    captureStills(w = 1440, h = 900, quality = 0.84) {
      const saved = { size: renderer.getSize(new THREE.Vector2()), pr: renderer.getPixelRatio(), aspect: camera.aspect, t: cam.t, push: cam.push, par: [par.x, par.y] };
      const savedPw = { ...pw };
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      camera.aspect = w / h; cam.t = 1; cam.push = 0; par.x = par.y = 0;
      buildCurves(); poseCamera(0);
      cord.group.visible = false;
      const shot = () => { renderer.render(scene, camera); return canvas.toDataURL('image/jpeg', quality); };
      for (const k of ['ceiling', 'sconce', 'table', 'picture', 'floor']) room.setPower(k, 0);
      room.setDuskLook(true);
      const dark = shot();
      room.setDuskLook(false);
      applyPowerFrom({ ceiling: 1, sconce: 1, table: 1, picture: 1, floor: 1 });
      const lit = shot();
      // restore
      Object.assign(pw, savedPw);
      renderer.setPixelRatio(saved.pr); renderer.setSize(saved.size.x, saved.size.y, false);
      camera.aspect = saved.aspect; cam.t = saved.t; cam.push = saved.push; par.x = saved.par[0]; par.y = saved.par[1];
      buildCurves(); lightsDirty = true;
      wake();
      return { dark, lit };
    },
  };

  function applyPowerFrom(p) { for (const k in p) room.setPower(k, p[k]); room.setPilot(0); }
}
