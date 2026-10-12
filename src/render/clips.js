// Every video on the site, defined as a pure function of the frame number.
// Rendered offline by tools/render.mjs; nothing here depends on wall-clock time.
import * as THREE from 'three';
import { buildRoom } from '../scene/room.js';
import { PullCord } from '../scene/cord.js';
import { createStage } from '../scene/showcase.js';
import { fbm } from '../scene/textures.js';
import { makeRig, introAt, smoothstep } from '../scene/path.js';

const TAU = Math.PI * 2;
const loopWave = (u) => (1 - Math.cos(TAU * u)) / 2;          // 0 → 1 → 0, zero slope at the ends
const POWERS = ['ceiling', 'sconce', 'table', 'picture', 'floor'];

/* ---------------------------------------------------------------- room clips */
const PULL_FRAMES = 30;             // 1.0 s of cord pull, then the sequence proper

function roomBase(ctx, { cord = false } = {}) {
  const room = buildRoom(ctx.renderer, ctx.M, { lite: false });
  tameHalos(room.scene);
  const camera = new THREE.PerspectiveCamera(43, ctx.aspect, 0.05, 30);
  const rig = makeRig(ctx.aspect);
  let pull = null;
  if (cord) {
    pull = new PullCord(ctx.M, room.cordAnchor());
    pull.threshold = 99;           // the video script drives it, never auto-fires
    room.scene.add(pull.group);
  }
  return { room, camera, rig, pull };
}

/** the live site uses big additive halos; with real bloom in the offline render they need to be much smaller */
function tameHalos(scene, k = 0.45) {
  scene.traverse((o) => { if (o.isSprite) o.scale.multiplyScalar(k); });
}

const setAll = (room, v, pilot = 0) => { POWERS.forEach((k) => room.setPower(k, v)); room.setPilot(pilot); };

/** the opening: cord pull (frames 0–29) + ignition, descent, illumination. */
function introClip(ctx) {
  const { room, camera, rig, pull } = roomBase(ctx, { cord: true });
  let released = false;
  return {
    scene: room.scene, camera,
    update(frame) {
      if (frame < PULL_FRAMES) {
        const p = smoothstep(frame / 30 / 0.9);
        pull.dragging = true;
        pull.target.set(pull.rest.x, pull.rest.y - p * pull.maxPull, pull.rest.z - p * pull.maxPull * 0.1);
        setAll(room, 0, 1);
        rig.apply(camera, 0);
      } else {
        if (!released) { pull.dragging = false; pull.target.copy(pull.rest); released = true; }
        const s = (frame - PULL_FRAMES) / 30;
        const st = introAt(s);
        POWERS.forEach((k) => room.setPower(k, st[k]));
        room.setPilot(st.pilot);
        rig.apply(camera, st.camT);
        pull.group.visible = st.camT < 0.55;
      }
      pull.update(1 / 30);
      room.switchBody.position.y = -0.31 + pull.pull * 0.012;
      room.fixtureBody.rotation.z = -pull.pull * 0.004 + (pull.knob.x - pull.rest.x) * 0.02;
      room.fixtureBody.rotation.x = pull.pull * 0.004;
    },
  };
}

/** the finished room, camera breathing in a seamless loop that starts exactly where the intro ends. */
function roomLoop(ctx, { lit, frames }) {
  const { room, camera, rig } = roomBase(ctx);
  if (lit) setAll(room, 1, 0); else { setAll(room, 0, 0); room.setDuskLook(true); }
  return {
    scene: room.scene, camera,
    update(frame) {
      const u = (frame % frames) / frames;
      const w = loopWave(u);
      if (lit) POWERS.forEach((k, i) => room.setPower(k, 1 + 0.012 * Math.sin(TAU * (u * (2 + i)) + i)));
      rig.apply(camera, 1, { dolly: 0.55 * w, side: 0.22 * w, lookSide: 0.18 * w });
    },
  };
}

/* ----------------------------------------------------------- product stages */
let gradientTex = null;
function backdrop() {
  if (gradientTex) return gradientTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(256, 230, 10, 256, 260, 420);
  rg.addColorStop(0, '#5a371f'); rg.addColorStop(0.5, '#2b1a10'); rg.addColorStop(1, '#0d0705');
  g.fillStyle = rg; g.fillRect(0, 0, 512, 640);
  gradientTex = new THREE.CanvasTexture(c);
  gradientTex.colorSpace = THREE.SRGBColorSpace;
  return gradientTex;
}

function stageBase(ctx, kind) {
  const stage = createStage(ctx.renderer, ctx.M, kind);
  tameHalos(stage.scene, 0.6);
  stage.scene.background = backdrop();
  const camera = new THREE.PerspectiveCamera();
  return { stage, camera };
}

function lampClip(ctx, kind) {
  const { stage, camera } = stageBase(ctx, kind);
  return {
    scene: stage.scene, camera,
    update(frame, _t, frames = Math.round(CLIPS[`lamp-${kind}`].duration * 30)) {
      const u = (frame % frames) / frames;
      const azim = 0.42 + (10 * Math.PI / 180) * Math.sin(TAU * u);       // ±10° = a slow 20° orbit
      stage.setPower(0.5 + 0.5 * loopWave(u));                             // light gently fades on and off
      stage.frame(camera, ctx.aspect, { elev: kind === 'pendant' ? 0.05 : 0.14, azim });
    },
  };
}

function turntable(ctx, on) {
  const { stage, camera } = stageBase(ctx, 'table');
  stage.setPower(on ? 1 : 0);
  return {
    scene: stage.scene, camera,
    update(frame) {
      const u = frame / (CLIPS['table-lamp-on'].duration * 30);            // 0 → 1 over a full revolution
      stage.frame(camera, ctx.aspect, { elev: 0.12, azim: u * TAU });
    },
  };
}

/* -------------------------------------------------------------- craft macros */
function macro(ctx, kind, { look, cam, power = 1, rake = 0, setup }) {
  const { stage, camera } = stageBase(ctx, kind);
  stage.setPower(power);
  camera.fov = 26; camera.aspect = ctx.aspect; camera.near = 0.02; camera.far = 20; camera.updateProjectionMatrix();
  let raking = null;
  if (rake) {
    raking = new THREE.PointLight(0xffc27a, rake, 3, 2);
    stage.scene.add(raking);
  }
  const extra = setup?.(stage) ?? {};
  const frames = 180;
  return {
    scene: stage.scene, camera,
    update(frame) {
      const u = (frame % frames) / frames;
      const w = loopWave(u);
      cam(camera, u, w);
      camera.lookAt(look(u, w));
      if (raking) {
        const a = TAU * u;
        raking.position.set(0.32 * Math.cos(a), 0.24 + 0.05 * Math.sin(a * 2), 0.32 * Math.sin(a));
      }
      extra.update?.(u, w);
    },
  };
}

function patinaMaterial() {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4, u = x / s, v = y / s;
    const n = fbm(u, v, 4, 5, 301), m = fbm(u, v, 14, 3, 303);
    const verd = Math.max(0, Math.min(1, (n - 0.5) * 3.2));
    const shade = 0.7 + 0.5 * m;
    img.data[i] = (150 * (1 - verd) + 78 * verd) * shade;
    img.data[i + 1] = (112 * (1 - verd) + 118 * verd) * shade;
    img.data[i + 2] = (60 * (1 - verd) + 92 * verd) * shade;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 1.4, metalness: 0.85, roughness: 0.55 });
}

/* ------------------------------------------------------------------- catalogue */
const mk = (def) => def;
export const CLIPS = {
  // opening: the cord pull is its own all-intra clip so dragging can scrub it
  'intro-pull': mk({ duration: 1.0, firstFrame: 0, lastFrame: PULL_FRAMES, build: introClip }),
  intro: mk({ duration: 9.7, firstFrame: PULL_FRAMES, exposure: 0.8, build: introClip }),

  hero: mk({ duration: 8, exposure: 0.74, build: (c) => roomLoop(c, { lit: true, frames: 240 }) }),
  'room-lit': mk({ duration: 8, exposure: 0.74, build: (c) => roomLoop(c, { lit: true, frames: 240 }) }),
  'room-unlit': mk({ duration: 8, exposure: 1.05, bloom: { strength: 0.1, radius: 0.5, threshold: 1.5 }, build: (c) => roomLoop(c, { lit: false, frames: 240 }) }),

  'lamp-pendant': mk({ duration: 6, build: (c) => lampClip(c, 'pendant') }),
  'lamp-sconce': mk({ duration: 6, build: (c) => lampClip(c, 'sconce') }),
  'lamp-table': mk({ duration: 6, build: (c) => lampClip(c, 'table') }),
  'lamp-floor': mk({ duration: 6, build: (c) => lampClip(c, 'floor') }),
  'lamp-ceiling': mk({ duration: 6, build: (c) => lampClip(c, 'ceiling') }),

  'table-lamp-on': mk({ duration: 12, build: (c) => turntable(c, true) }),
  'table-lamp-off': mk({ duration: 12, build: (c) => turntable(c, false) }),

  'craft-glass': mk({ duration: 6, exposure: 0.4, bloom: { strength: 0.5, radius: 0.7, threshold: 1.6 }, build: (c) => macro(c, 'ceiling', {
    power: 0.5,
    look: () => new THREE.Vector3(0, -0.19, 0),
    cam: (cam, u, w) => cam.position.set(0.12 + 0.18 * Math.sin(TAU * u) * 0.5, -0.5 + 0.04 * w, 0.78 - 0.08 * w),
  }) }),
  'craft-brass': mk({ duration: 6, exposure: 0.55, bloom: { strength: 0.3, radius: 0.5, threshold: 1.6 }, build: (c) => macro(c, 'table', {
    power: 0.2, rake: 1.1,
    look: () => new THREE.Vector3(0, 0.05, 0),
    cam: (cam, u, w) => cam.position.set(0.24 - 0.05 * w, 0.1 + 0.02 * w, 0.27 - 0.04 * w),
  }) }),
  'craft-patina': mk({ duration: 6, exposure: 0.6, bloom: { strength: 0.3, radius: 0.5, threshold: 1.6 }, build: (c) => macro(c, 'floor', {
    power: 0.15, rake: 1.0,
    look: () => new THREE.Vector3(0, 0.035, 0),
    cam: (cam, u, w) => cam.position.set(0.34 - 0.06 * w, 0.15 + 0.02 * w, 0.4 - 0.05 * w),
    setup: (stage) => {
      // swap the base disc material for a verdigris-spotted aged brass
      const mat = patinaMaterial();
      stage.lamp.group.traverse((o) => { if (o.isMesh && o.geometry.type === 'LatheGeometry' && o.position.y === 0) o.material = mat; });
      return {};
    },
  }) }),
  'craft-walnut-linen': mk({ duration: 6, exposure: 0.36, bloom: { strength: 0.45, radius: 0.7, threshold: 1.6 }, build: (c) => macro(c, 'table', {
    power: 0.7,
    look: () => new THREE.Vector3(0.0, 0.3, 0.05),
    cam: (cam, u, w) => cam.position.set(0.66 - 0.1 * w, 0.1 + 0.03 * w, 0.66 - 0.08 * w),
  }) }),
};
