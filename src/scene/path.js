// Shared choreography: camera path + the intro's light timeline as pure functions of time.
// Used by the live site and by the offline video renderer (src/render), so both stay identical.
import * as THREE from 'three';

const v3 = (a) => new THREE.Vector3(...a);
export const smoothstep = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
const power2InOut = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

/** camera path, adapted to screen shape */
export function poses(aspect) {
  const portrait = aspect < 0.85;
  const pos = [[0.04, 1.92, 0.5], [0.12, 1.9, 1.15], [0.2, 1.72, 2.0], portrait ? [0.3, 1.55, 3.3] : [0.05, 1.52, 2.95]];
  const look = [[0.0, 2.36, -1.2], [0.0, 2.3, -1.8], [0.1, 1.85, -3.0], portrait ? [0.62, 0.55, -3.5] : [-0.22, 1.66, -3.5]];
  const fov0 = portrait ? 66 : 54;
  const hFov = 62 * Math.PI / 180;
  const fov1 = portrait ? Math.min(74, 2 * Math.atan(Math.tan(hFov / 2) / aspect) * 180 / Math.PI) : 43;
  return { pos: pos.map(v3), look: look.map(v3), fov0, fov1: portrait ? Math.max(58, fov1) : fov1 };
}

/** piecewise smoothstep through [time, value] keys */
export function keys(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1], [t1, v1] = k[i];
      return v0 + (v1 - v0) * smoothstep((t - t0) / (t1 - t0));
    }
  }
  return k[k.length - 1][1];
}

// seconds after the switch fires (mirrors the GSAP timeline in experience.js)
const CEILING = [[0, 0], [0.4, 0], [0.45, 0.34], [0.47, 0.34], [0.59, 0.03], [0.78, 0.03], [0.84, 0.58], [0.88, 0.58], [1.06, 0.1], [1.32, 0.1], [1.39, 0.82], [1.42, 0.82], [1.54, 0.5], [1.58, 0.5], [2.33, 1]];
const SCONCE = [[0, 0], [3.7, 0], [4.05, 0.55], [4.05, 0.55], [4.19, 0.25], [4.2, 0.25], [5.3, 1]];

/** intro state `s` seconds after the switch fires. */
export function introAt(s) {
  const camP = clamp01((s - 1.9) / 5.6);
  return {
    camT: power2InOut(camP),
    ceiling: keys(CEILING, s),
    sconce: keys(SCONCE, s),
    table: keys([[0, 0], [4.9, 0], [6.7, 1]], s),
    picture: keys([[0, 0], [5.7, 0], [7.0, 1]], s),
    floor: keys([[0, 0], [6.3, 0], [8.1, 1]], s),
    pilot: 1 - keys([[0, 0], [1.6, 0], [3.0, 1]], s),
  };
}

/** camera along the path for t in 0..1 (no parallax/handheld: renders must be deterministic). */
export function makeRig(aspect) {
  const p = poses(aspect);
  const posCurve = new THREE.CatmullRomCurve3(p.pos, false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(p.look, false, 'centripetal');
  const a = new THREE.Vector3(), l = new THREE.Vector3();
  return {
    poses: p,
    apply(camera, t, { dolly = 0, side = 0, lookSide = 0 } = {}) {
      posCurve.getPoint(t, a); lookCurve.getPoint(t, l);
      camera.fov = p.fov0 + (p.fov1 - p.fov0) * smoothstep(t);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      a.z -= dolly; a.x += side; l.x += lookSide;
      camera.position.copy(a);
      camera.lookAt(l);
    },
  };
}
