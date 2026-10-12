// Small lit stages for single fixtures: used for the catalogue plates and the 3D inspector.
// They reuse the exact procedural models from the opening room.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDERS } from './lamps.js';

const envCache = new WeakMap();
function environment(renderer) {
  if (!envCache.has(renderer)) {
    const pm = new THREE.PMREMGenerator(renderer);
    envCache.set(renderer, pm.fromScene(new RoomEnvironment(), 0.04).texture);
    pm.dispose();
  }
  return envCache.get(renderer);
}

function meshBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noFrame) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
  });
  return box;
}

/** Build a scene for one fixture kind. Returns helpers to light it and frame a camera. */
export function createStage(renderer, M, kind) {
  const scene = new THREE.Scene();
  scene.environment = environment(renderer);
  scene.environmentIntensity = 0.38;

  const lamp = BUILDERS[kind](M);
  const root = new THREE.Group();
  root.add(lamp.group);
  scene.add(root);

  // minimal context so each fixture reads as "installed", not floating
  const ctx = new THREE.Group();
  const matte = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 });
  const slab = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.userData.noFrame = kind !== 'table' && kind !== 'floor'; return m;
  };
  const wallMat = new THREE.MeshStandardMaterial({ map: M.wall.map, bumpMap: M.wall.bumpMap, bumpScale: 0.5, color: 0x6e6250, roughness: 1 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: M.ceiling.map, color: 0x7d705c, roughness: 1 });
  if (kind === 'sconce') ctx.add(slab(5, 5, 0.04, wallMat, 0, 0.05, -0.02));
  if (kind === 'ceiling' || kind === 'pendant') ctx.add(slab(6, 0.04, 6, ceilMat, 0, 0.02, 0));
  if (kind === 'table') ctx.add(slab(0.7, 0.05, 0.5, M.furniture, 0, -0.025, 0));
  if (kind === 'floor') ctx.add(slab(1.0, 0.03, 1.0, M.furniture, 0, -0.015, 0));
  root.add(ctx);

  const key = new THREE.DirectionalLight(0xffd7a0, 0.9);
  key.position.set(-2, 3, 3);
  const rim = new THREE.DirectionalLight(0x9a6a3a, 0.7);
  rim.position.set(2.5, 1.5, -2);
  scene.add(key, rim);

  const light = new THREE.PointLight(0xffbe68, 0, 0, 2);
  light.position.copy(lamp.lightLocal);
  lamp.group.add(light);

  const box = meshBox(lamp.group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // lamp-specific brightness (point lights sit very close to the shades)
  const LIGHT = { pendant: 2.2, sconce: 0.4, table: 1.6, floor: 3.4, ceiling: 1.6 }[kind];

  function setPower(p) {
    lamp.setPower(p);
    light.color.copy(lamp.color);
    light.intensity = LIGHT * p;
  }

  function frame(camera, aspect, { elev = 0.1, azim = 0.38 } = {}) {
    camera.fov = 28;
    camera.aspect = aspect;
    const vf = (camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const fit = Math.max((size.y * 1.32) / 2 / Math.tan(vf / 2), (size.x * 1.55) / 2 / Math.tan(hf / 2));
    const dir = new THREE.Vector3(Math.sin(azim), elev, Math.cos(azim)).normalize();
    if (kind === 'ceiling') dir.set(Math.sin(azim), -0.55, Math.cos(azim)).normalize();
    camera.position.copy(center).addScaledVector(dir, fit * 1.05);
    camera.near = 0.05; camera.far = 30;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    return center;
  }

  return { scene, lamp, setPower, frame, center, size, kind, dispose: () => scene.traverse((o) => o.geometry?.dispose?.()) };
}

/** Renders every kind once to a transparent image. Sequential, yields between plates. */
export async function renderPlates(M, kinds, { width = 720, height = 900 } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.PerspectiveCamera();
  const out = {};
  for (const kind of kinds) {
    await new Promise((r) => requestAnimationFrame(() => r()));
    const stage = createStage(renderer, M, kind);
    stage.setPower(1);
    stage.frame(camera, width / height, { elev: kind === 'pendant' ? 0.05 : 0.14, azim: 0.42 });
    renderer.render(stage.scene, camera);
    out[kind] = canvas.toDataURL('image/webp', 0.9);
    stage.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}

/** Interactive inspector for the featured fixture. */
export function createViewer({ canvas, M, reduced = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.PerspectiveCamera();

  let stage = null, controls = null, raf = 0, visible = false, power = 1, tween = null, resumeTimer = 0;

  function size() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    if (stage) {
      const c = stage.frame(camera, r.width / r.height);
      controls.target.copy(c);
      controls.update();
    }
  }

  function setKind(kind) {
    stage?.dispose();
    stage = createStage(renderer, M, kind);
    stage.setPower(power);
    controls?.dispose();
    controls = new OrbitControls(camera, canvas);
    canvas.style.touchAction = 'pan-y';        // vertical swipes still scroll the page
    controls.enableZoom = false; controls.enablePan = false;
    controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.7;
    const wallMounted = kind === 'sconce' || kind === 'ceiling';
    controls.minPolarAngle = Math.PI * (wallMounted ? 0.32 : 0.28);
    controls.maxPolarAngle = Math.PI * (wallMounted ? 0.62 : 0.56);
    if (wallMounted) { controls.minAzimuthAngle = -0.9; controls.maxAzimuthAngle = 0.9; }
    controls.autoRotate = !reduced && !wallMounted;
    controls.autoRotateSpeed = 1.1;
    controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
    controls.addEventListener('end', () => {
      if (reduced || wallMounted) return;
      resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 3000);
    });
    size();
    wake();
  }

  function setLit(on) {
    const to = on ? 1 : 0;
    const from = power;
    const start = performance.now();
    const dur = reduced ? 1 : on ? 900 : 450;
    tween = (now) => {
      const t = Math.min(1, (now - start) / dur);
      power = from + (to - from) * (t * t * (3 - 2 * t));
      stage?.setPower(power);
      if (t >= 1) tween = null;
    };
    wake();
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;
    tween?.(now);
    controls?.update();
    if (stage) renderer.render(stage.scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && visible) raf = requestAnimationFrame(frame); }

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }, { rootMargin: '80px' });
  io.observe(canvas);
  const ro = new ResizeObserver(size);
  ro.observe(canvas.parentElement);

  return { setKind, setLit, get lit() { return power > 0.5; }, dispose() { io.disconnect(); ro.disconnect(); renderer.dispose(); } };
}
