// Procedural lighting fixtures. Every builder returns the same small interface:
//   { kind, group, lightLocal, anchor?, setPower(p), color }
// `p` is a 0..1 (can overshoot) brightness. Lamps also tint from ember-orange to
// warm tungsten as they come up to power, like a real filament.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { glowMaterial } from './materials.js';

const COLD = new THREE.Color(0xff7424);
const WARM = new THREE.Color(0xffbe68);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function tungsten(p, out = new THREE.Color()) {
  return out.copy(COLD).lerp(WARM, smooth(0.1, 0.95, p));
}

const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const rbox = (w, h, d, r, mat, x = 0, y = 0, z = 0) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z);
const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 20) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);

const ring = (r, t, y, mat) => { const m = mesh(new THREE.TorusGeometry(r, t, 8, 56), mat, 0, y, 0); m.rotation.x = Math.PI / 2; return m; };

function makeHalo(M, size) {
  const mat = new THREE.SpriteMaterial({ map: M.haloTex, color: 0xffbe68, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = 10;
  return s;
}

function finish(lamp, glows, halo, haloMax = 0.85) {
  const c = new THREE.Color();
  lamp.color = c;
  lamp.setPower = (p) => {
    tungsten(p, c);
    for (const g of glows) { g.mat.emissive.copy(c); g.mat.emissiveIntensity = p * g.k; }
    if (halo) { halo.material.color.copy(c); halo.material.opacity = Math.min(1.2, p) * haloMax; }
  };
  lamp.setPower(0);
  return lamp;
}

function bulbParts(M, g, y, r = 0.05) {
  const bulbMat = glowMaterial(0xffbe68, { opacity: 0.92, base: 0xfff0d0, roughness: 0.3 });
  const bulb = mesh(new THREE.SphereGeometry(r, 20, 14), bulbMat, 0, y, 0);
  bulb.scale.set(1, 1.18, 1);
  g.add(bulb);
  const fil = glowMaterial(0xff9a3c, { base: 0x331a08 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.add(cyl(0.0018, 0.0018, r * 0.9, fil, Math.cos(a) * r * 0.28, y - r * 0.05, Math.sin(a) * r * 0.28, 5));
  }
  return [{ mat: bulbMat, k: 3.2 }, { mat: fil, k: 5 }];
}

/* ------------------------------------------------------------------ ceiling */
// Origin = ceiling plane directly above the fixture centre. Hangs towards -y.
export function ceilingFixture(M) {
  const g = new THREE.Group();
  g.name = 'ceilingFixture';
  const body = new THREE.Group();       // everything that nudges when the switch is pulled
  g.add(body);

  body.add(rbox(0.7, 0.03, 0.7, 0.01, M.brassAged, 0, -0.015, 0));
  body.add(rbox(0.6, 0.028, 0.6, 0.01, M.brass, 0, -0.044, 0));

  const glassMat = glowMaterial(0xffbe68, { opacity: 0.8, base: 0xf4ead3, roughness: 0.55 });
  const glass = rbox(0.5, 0.24, 0.5, 0.012, glassMat, 0, -0.178, 0);
  glass.renderOrder = 5;
  body.add(glass);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    body.add(cyl(0.013, 0.013, 0.27, M.brass, sx * 0.255, -0.185, sz * 0.255, 12));
    body.add(mesh(new THREE.SphereGeometry(0.02, 12, 8), M.brass, sx * 0.255, -0.325, sz * 0.255));
  }
  // top + bottom rims
  for (const y of [-0.062, -0.304]) {
    for (const s of [-1, 1]) {
      body.add(rbox(0.56, 0.022, 0.026, 0.008, M.brass, 0, y, s * 0.265));
      body.add(rbox(0.026, 0.022, 0.5, 0.008, M.brass, s * 0.265, y, 0));
    }
  }
  // bottom boss + finial
  body.add(mesh(lathe([[0.0, -0.31], [0.05, -0.31], [0.05, -0.32], [0.028, -0.335], [0.016, -0.37], [0.0, -0.385]], 24), M.brass));

  const inner = new THREE.Group();
  body.add(inner);
  inner.add(cyl(0.024, 0.024, 0.05, M.patina, 0, -0.095, 0, 14));
  const glows = [{ mat: glassMat, k: 1.35 }, ...bulbParts(M, inner, -0.17, 0.056)];

  // pull switch (bottom, front-right corner)
  const sw = new THREE.Group();
  sw.position.set(0.17, -0.31, 0.2);
  sw.add(rbox(0.06, 0.04, 0.06, 0.01, M.brass, 0, 0, 0));
  sw.add(cyl(0.011, 0.011, 0.03, M.patina, 0, -0.03, 0, 10));
  body.add(sw);

  const halo = makeHalo(M, 1.3);
  halo.position.set(0, -0.17, 0);
  body.add(halo);

  return finish({
    kind: 'ceiling', group: g, body, switchBody: sw,
    lightLocal: new THREE.Vector3(0, -0.17, 0),
    anchorLocal: new THREE.Vector3(0.17, -0.345, 0.2),
  }, glows, halo, 0.8);
}

/* ------------------------------------------------------------------- sconce */
// Origin = point on the wall, +z points out into the room.
export function wallSconce(M) {
  const g = new THREE.Group();
  g.add(rbox(0.1, 0.3, 0.02, 0.008, M.brass, 0, 0, 0.01));
  g.add(mesh(new THREE.SphereGeometry(0.03, 14, 10), M.brassAged, 0, 0, 0.035));
  const arm = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.035), new THREE.Vector3(0, -0.03, 0.1),
    new THREE.Vector3(0, -0.02, 0.17), new THREE.Vector3(0, 0.035, 0.2),
  ]);
  g.add(mesh(new THREE.TubeGeometry(arm, 24, 0.009, 8), M.brass));
  g.add(mesh(lathe([[0, 0.03], [0.034, 0.035], [0.03, 0.05], [0.02, 0.062], [0.0, 0.062]], 20), M.brass, 0, 0, 0.2));
  const inner = new THREE.Group();
  inner.position.set(0, 0, 0.2);
  g.add(inner);
  const glows = bulbParts(M, inner, 0.1, 0.03);
  const shadeMat = glowMaterial(0xffbe68, { opacity: 0.86, base: 0xf1e5cb, side: THREE.DoubleSide, roughness: 0.5 });
  const shade = mesh(lathe([[0.034, 0.062], [0.04, 0.09], [0.058, 0.15], [0.07, 0.2], [0.072, 0.205]], 28), shadeMat, 0, 0, 0.2);
  shade.renderOrder = 5;
  g.add(shade);
  glows.push({ mat: shadeMat, k: 1.5 });
  const halo = makeHalo(M, 0.55);
  halo.position.set(0, 0.12, 0.2);
  g.add(halo);
  return finish({ kind: 'sconce', group: g, lightLocal: new THREE.Vector3(0, 0.12, 0.2) }, glows, halo, 0.7);
}

/* -------------------------------------------------------------- table lamp */
export function tableLamp(M) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.095, 0], [0.095, 0.012], [0.078, 0.022], [0.078, 0.034], [0.045, 0.052], [0, 0.052]], 40), M.brass));
  const glassBody = M.amberGlass.clone();
  const body = mesh(lathe([[0.03, 0.05], [0.06, 0.1], [0.088, 0.17], [0.084, 0.235], [0.052, 0.3], [0.03, 0.335]], 48), glassBody);
  body.material.side = THREE.DoubleSide;
  g.add(body);
  g.add(mesh(lathe([[0.034, 0.33], [0.045, 0.345], [0.02, 0.365], [0.016, 0.42], [0.026, 0.432], [0.026, 0.45], [0, 0.45]], 24), M.brass));
  g.add(cyl(0.022, 0.022, 0.04, M.patina, 0, 0.455, 0, 14));
  const inner = new THREE.Group();
  g.add(inner);
  const glows = bulbParts(M, inner, 0.52, 0.045);
  glows.push({ mat: glassBody, k: 0.5 });

  const shadeMat = glowMaterial(0xffbe68, { map: M.linenTex, side: THREE.DoubleSide, roughness: 0.9 });
  shadeMat.map.repeat.set(4, 1.5);
  const shade = mesh(lathe([[0.2, 0.4], [0.178, 0.55], [0.15, 0.685]], 48), shadeMat);
  g.add(shade);
  glows.push({ mat: shadeMat, k: 0.95 });
  g.add(ring(0.15, 0.004, 0.685, M.brass), ring(0.2, 0.004, 0.4, M.brass));
  g.add(mesh(lathe([[0, 0.69], [0.012, 0.69], [0.008, 0.72], [0.0, 0.735]], 12), M.brass));

  const halo = makeHalo(M, 0.9);
  halo.position.set(0, 0.54, 0);
  g.add(halo);
  return finish({ kind: 'table', group: g, lightLocal: new THREE.Vector3(0, 0.54, 0) }, glows, halo, 0.55);
}

/* -------------------------------------------------------------- floor lamp */
export function floorLamp(M) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.19, 0], [0.19, 0.014], [0.15, 0.03], [0.1, 0.05], [0.03, 0.07], [0, 0.07]], 40), M.brassAged));
  g.add(cyl(0.013, 0.013, 1.42, M.brass, 0, 0.78, 0, 12));
  for (const y of [0.45, 0.95, 1.35]) g.add(ring(0.02, 0.008, y, M.brass));
  g.add(mesh(new THREE.SphereGeometry(0.035, 16, 12), M.brass, 0, 0.7, 0));
  g.add(mesh(lathe([[0.016, 1.4], [0.03, 1.42], [0.024, 1.47], [0, 1.47]], 16), M.brass));
  const inner = new THREE.Group();
  g.add(inner);
  const glows = bulbParts(M, inner, 1.56, 0.05);
  const shadeMat = glowMaterial(0xffbe68, { map: M.linenTex, side: THREE.DoubleSide, roughness: 0.9, base: 0xe9dcc0 });
  const shade = mesh(lathe([[0.27, 1.4], [0.235, 1.56], [0.2, 1.72]], 48), shadeMat);
  g.add(shade);
  glows.push({ mat: shadeMat, k: 0.95 });
  g.add(cyl(0.0035, 0.0035, 0.12, M.brass, 0.05, 1.37, 0, 5));
  g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), M.brass, 0.05, 1.3, 0));
  const halo = makeHalo(M, 1.2);
  halo.position.set(0, 1.58, 0);
  g.add(halo);
  return finish({ kind: 'floor', group: g, lightLocal: new THREE.Vector3(0, 1.58, 0) }, glows, halo, 0.5);
}

/* ----------------------------------------------------------------- pendant */
// Origin = ceiling attach point.
export function pendantLamp(M) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.075, 0], [0.075, -0.012], [0.04, -0.03], [0.012, -0.04], [0, -0.04]], 30), M.brassAged));
  g.add(cyl(0.004, 0.004, 0.9, M.cord, 0, -0.49, 0, 6));
  g.add(mesh(lathe([[0.006, -0.9], [0.03, -0.91], [0.034, -0.95], [0.05, -0.99], [0.03, -1.03], [0, -1.03]], 28), M.brass));
  const shadeMat = glowMaterial(0xffbe68, { side: THREE.DoubleSide, base: 0xf0e6cf, roughness: 0.35 });
  // dome: rim at the bottom, crown at the top (profile built top → bottom)
  const dome = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 0.5;
    dome.push([0.04 + Math.sin(a) * 0.23, -0.96 - (1 - Math.cos(a)) * 0.19]);
  }
  const shade = mesh(lathe(dome, 56), shadeMat);
  shade.renderOrder = 5;
  g.add(shade);
  g.add(ring(0.27, 0.006, -1.15, M.brass));
  const inner = new THREE.Group();
  g.add(inner);
  const glows = bulbParts(M, inner, -1.13, 0.055);
  glows.push({ mat: shadeMat, k: 1.3 });
  const halo = makeHalo(M, 1.2);
  halo.position.set(0, -1.14, 0);
  g.add(halo);
  return finish({ kind: 'pendant', group: g, lightLocal: new THREE.Vector3(0, -1.13, 0) }, glows, halo, 0.6);
}

/* ------------------------------------------------------------ picture light */
// Origin = wall point at the top of the picture frame. +z into room.
export function pictureLight(M) {
  const g = new THREE.Group();
  g.add(rbox(0.05, 0.07, 0.016, 0.005, M.brass, 0, 0.0, 0.008));
  const arm = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.016), new THREE.Vector3(0, 0.05, 0.08), new THREE.Vector3(0, 0.05, 0.19),
  ]);
  g.add(mesh(new THREE.TubeGeometry(arm, 16, 0.007, 8), M.brass));
  const m = glowMaterial(0xffbe68, { base: 0x2a1c0e, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.46, 6, 14), M.brass);
  body.rotation.z = Math.PI / 2; body.position.set(0, 0.05, 0.21);
  g.add(body);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.006, 0.02), m);
  strip.position.set(0, 0.03, 0.215);
  g.add(strip);
  return finish({ kind: 'picture', group: g, lightLocal: new THREE.Vector3(0, 0.02, 0.2) }, [{ mat: m, k: 6 }], null);
}

export const BUILDERS = {
  ceiling: ceilingFixture, sconce: wallSconce, table: tableLamp, floor: floorLamp, pendant: pendantLamp,
};
