// The 1920s townhouse sitting room: architecture, furniture, lamps and the light rig.
// Units are metres. Room: x -3…3, z -3.5…3.5 (back wall at -3.5), ceiling at y = 3.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ceilingFixture, wallSconce, tableLamp, floorLamp, pictureLight } from './lamps.js';
import { tiled } from './textures.js';

export const ROOM = { w: 6, d: 7, h: 3, back: -3.5, front: 3.5, wain: 1.05 };
export const CEILING_POS = new THREE.Vector3(0, ROOM.h, -1.2);

// peak intensity (candela) for each light at power = 1, tuned by eye against ACES tone mapping
const RIG = {
  ceiling: { max: 15 },
  sconce: { max: 4.2 },
  table: { max: 7.5 },
  picture: { max: 24 },
  floor: { max: 7 },
};

const rbox = (w, h, d, r, mat) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

export function buildRoom(renderer, M, { lite = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030201);
  scene.fog = new THREE.FogExp2(0x050302, 0.045);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.0;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0x8d7a66, 0x2a1b12, 0.0);
  scene.add(hemi);

  const add = (obj, { cast = false, receive = true, parent = scene } = {}) => {
    obj.traverse?.((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
    parent.add(obj);
    return obj;
  };
  const place = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; return m; };

  /* ----- shell ----- */
  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const floor = plane(ROOM.w, ROOM.d, M.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0);
  add(floor);
  const ceil = plane(ROOM.w, ROOM.d, M.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM.h, 0);
  add(ceil);

  const upperH = ROOM.h - ROOM.wain;
  const baseMat = new THREE.MeshStandardMaterial({ map: tiled(M.walnutTex, 2, 1), color: 0x7a5b46, roughness: 0.6 });
  const walls = [
    { name: 'back', pos: [0, 0, ROOM.back], ry: 0, len: ROOM.w, mat: M.wall },
    { name: 'front', pos: [0, 0, ROOM.front], ry: Math.PI, len: ROOM.w, mat: M.wall },
    { name: 'left', pos: [-ROOM.w / 2, 0, 0], ry: Math.PI / 2, len: ROOM.d, mat: M.wallSide },
    { name: 'right', pos: [ROOM.w / 2, 0, 0], ry: -Math.PI / 2, len: ROOM.d, mat: M.wallSide },
  ];
  const wallGroup = new THREE.Group();
  for (const w of walls) {
    const g = new THREE.Group();
    g.position.set(...w.pos); g.rotation.y = w.ry;
    // plaster above the dado, walnut wainscot below
    const upper = plane(w.len, upperH, w.mat); upper.position.y = ROOM.wain + upperH / 2;
    const lower = plane(w.len, ROOM.wain, baseMat); lower.position.y = ROOM.wain / 2;
    add(upper, { parent: g }); add(lower, { parent: g });
    // raised panels
    const n = Math.round(w.len / 0.95), pw = w.len / n - 0.14;
    for (let i = 0; i < n; i++) {
      const p = rbox(pw, 0.66, 0.035, 0.008, M.panel);
      p.position.set(-w.len / 2 + (i + 0.5) * (w.len / n), 0.58, 0.018);
      add(p, { parent: g });
    }
    const rail = rbox(w.len, 0.07, 0.06, 0.012, M.trim); rail.position.set(0, ROOM.wain, 0.03); add(rail, { parent: g });
    const skirt = rbox(w.len, 0.16, 0.05, 0.01, M.trim); skirt.position.set(0, 0.08, 0.025); add(skirt, { parent: g });
    const crown1 = rbox(w.len, 0.11, 0.11, 0.015, M.plasterTrim); crown1.position.set(0, ROOM.h - 0.055, 0.055); add(crown1, { parent: g });
    const crown2 = rbox(w.len, 0.05, 0.18, 0.012, M.plasterTrim); crown2.position.set(0, ROOM.h - 0.025, 0.09); add(crown2, { parent: g });
    wallGroup.add(g);
  }
  scene.add(wallGroup);

  // ceiling coffer frames round the fixture
  for (const s of [0.95, 1.7]) {
    for (const sg of [-1, 1]) {
      add(place(rbox(s * 1.9, 0.05, 0.1, 0.01, M.plasterTrim), CEILING_POS.x, ROOM.h - 0.025, CEILING_POS.z + sg * s * 0.95));
      add(place(rbox(0.1, 0.05, s * 1.9, 0.01, M.plasterTrim), CEILING_POS.x + sg * s * 0.95, ROOM.h - 0.025, CEILING_POS.z));
    }
  }

  /* ----- rug ----- */
  const rug = plane(2.8, 4.2, M.rug); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.006, -0.9);
  add(rug);

  /* ----- sideboard (back wall) ----- */
  const sb = new THREE.Group();
  sb.position.set(0.35, 0, ROOM.back + 0.27);
  const top = rbox(2.28, 0.045, 0.56, 0.01, M.furniture); top.position.y = 0.84;
  const carcass = rbox(2.16, 0.62, 0.5, 0.01, M.furniture); carcass.position.y = 0.5;
  const plinth = rbox(2.1, 0.14, 0.44, 0.01, M.patina); plinth.position.y = 0.09;
  add(top, { cast: true, parent: sb }); add(carcass, { cast: true, parent: sb }); add(plinth, { cast: true, parent: sb });
  for (let i = 0; i < 4; i++) {
    const door = rbox(0.5, 0.52, 0.025, 0.008, M.panel);
    door.position.set(-0.81 + i * 0.54, 0.5, 0.255);
    add(door, { cast: true, parent: sb });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), M.brass);
    knob.position.set(-0.81 + i * 0.54 + (i % 2 ? -0.2 : 0.2), 0.52, 0.28);
    add(knob, { parent: sb });
  }
  scene.add(sb);

  // books and a vase – props, not products
  const books = new THREE.Group();
  [[0.3, 0.045, 0.2, M.book1, 0.1], [0.27, 0.04, 0.19, M.book3, -0.08], [0.25, 0.035, 0.18, M.book2, 0.2]].reduce((y, [w, h, d, mat, ry]) => {
    const b = rbox(w, h, d, 0.004, mat); b.position.y = y + h / 2; b.rotation.y = ry; books.add(b); return y + h;
  }, 0);
  books.position.set(-0.45, 0.8625, ROOM.back + 0.28);
  add(books, { cast: true });
  const vase = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.05, 0], [0.075, 0.1], [0.04, 0.2], [0.03, 0.27], [0.045, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 28), M.ceramic);
  vase.material = M.ceramic;
  vase.position.set(-0.05, 0.8625, ROOM.back + 0.3);
  add(vase, { cast: true });

  /* ----- painting + picture light ----- */
  const PX = 0.35, PY = 1.92;
  const frame = new THREE.Group();
  frame.position.set(PX, PY, ROOM.back + 0.03);
  const fw = 1.02, fh = 1.28, ft = 0.1;
  for (const s of [-1, 1]) {
    frame.add(at(rbox(fw + ft, ft, 0.06, 0.015, M.gilt), 0, s * (fh / 2), 0));
    frame.add(at(rbox(ft, fh, 0.06, 0.015, M.gilt), s * (fw / 2), 0, 0));
  }
  const canvas = plane(fw - 0.02, fh - 0.02, M.painting); canvas.position.z = 0.005;
  frame.add(canvas);
  add(frame, { cast: false });

  const pic = pictureLight(M);
  add(place(pic.group, PX, PY + fh / 2 + ft / 2 + 0.06, ROOM.back));

  /* ----- sconce ----- */
  const sconce = wallSconce(M);
  add(place(sconce.group, -1.4, 1.85, ROOM.back));

  /* ----- table lamp ----- */
  const table = tableLamp(M);
  add(place(table.group, 1.0, 0.8625, ROOM.back + 0.29), { cast: true });

  /* ----- floor lamp ----- */
  const floorL = floorLamp(M);
  add(place(floorL.group, 2.5, 0, ROOM.back + 0.55), { cast: true });

  /* ----- armchair ----- */
  const chair = new THREE.Group();
  const seat = rbox(0.72, 0.2, 0.7, 0.07, M.leather); seat.position.y = 0.4;
  const back = rbox(0.74, 0.62, 0.18, 0.08, M.leather); back.position.set(0, 0.74, -0.3); back.rotation.x = -0.12;
  const armL = rbox(0.15, 0.34, 0.72, 0.06, M.leather); armL.position.set(-0.4, 0.58, 0);
  const armR = armL.clone(); armR.position.x = 0.4;
  const cushion = rbox(0.58, 0.12, 0.56, 0.05, M.leatherDark); cushion.position.set(0, 0.56, 0.04);
  for (const o of [seat, back, armL, armR, cushion]) add(o, { cast: true, parent: chair });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.3, 10), M.furniture);
    leg.position.set(sx * 0.31, 0.15, sz * 0.29); add(leg, { cast: true, parent: chair });
  }
  place(chair, -2.15, 0, -2.55, 0.55);
  scene.add(chair);

  /* ----- window + curtains on the right wall ----- */
  const win = new THREE.Group();
  win.position.set(ROOM.w / 2 - 0.01, 1.7, -1.6); win.rotation.y = -Math.PI / 2;
  const night = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.9), new THREE.MeshBasicMaterial({ color: 0x07090d }));
  win.add(night);
  const wf = M.trim;
  for (const s of [-1, 1]) {
    win.add(at(rbox(1.3, 0.09, 0.08, 0.01, wf), 0, s * 0.99, 0.03));
    win.add(at(rbox(0.09, 2.0, 0.08, 0.01, wf), s * 0.6, 0, 0.03));
  }
  win.add(at(rbox(1.15, 0.04, 0.05, 0.008, wf), 0, 0, 0.03));
  win.add(at(rbox(0.04, 1.9, 0.05, 0.008, wf), 0, 0, 0.03));
  const curtainMat = new THREE.MeshStandardMaterial({ color: 0x4a2024, roughness: 0.85, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.55, 12), curtainMat);
      c.position.set(side * (0.7 + i * 0.075), 0.12, 0.1 + (i % 2) * 0.03);
      win.add(c);
    }
  }
  const rod = at(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.5, 8), M.brass), 0, 1.3, 0.14);
  rod.rotation.z = Math.PI / 2;
  win.add(rod);
  add(win);

  /* ----- ceiling fixture ----- */
  const ceilingL = ceilingFixture(M);
  add(place(ceilingL.group, CEILING_POS.x, CEILING_POS.y, CEILING_POS.z));

  /* ----- lights ----- */
  const lights = {};
  const lamps = { ceiling: ceilingL, sconce, table, picture: pic, floor: floorL };

  const mkPoint = (name, lamp, { shadow = false, decay = 2, distance = 0 } = {}) => {
    const l = new THREE.PointLight(0xffbe68, 0, distance, decay);
    lamp.group.localToWorld(l.position.copy(lamp.lightLocal));
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(lite ? 512 : 1024, lite ? 512 : 1024);
      l.shadow.bias = -0.0006; l.shadow.normalBias = 0.025; l.shadow.radius = 4;
      l.shadow.camera.near = 0.15; l.shadow.camera.far = 14;
    }
    scene.add(l);
    lights[name] = { light: l, max: RIG[name].max, lamp, power: 0 };
  };
  scene.updateMatrixWorld(true);
  mkPoint('ceiling', ceilingL, { shadow: true });
  mkPoint('sconce', sconce);
  mkPoint('table', table);
  mkPoint('floor', floorL);

  // picture light: a downward spot that rakes across the plaster and canvas
  const spot = new THREE.SpotLight(0xffbe68, 0, 6, 0.75, 0.85, 2);
  pic.group.localToWorld(spot.position.set(0, 0.04, 0.22));
  spot.target.position.set(PX, PY - 0.2, ROOM.back);
  scene.add(spot, spot.target);
  lights.picture = { light: spot, max: RIG.picture.max, lamp: pic, power: 0 };

  // a faint spill from a hallway, so the fixture and cord are readable in "darkness"
  const pilot = new THREE.SpotLight(0xff9a52, 0, 9, 0.55, 1, 2);
  pilot.position.set(-1.6, 1.7, 1.6);
  pilot.target.position.set(0.1, 2.25, -0.95);
  scene.add(pilot, pilot.target);
  const PILOT_MAX = 3.2;
  let pilotLevel = 1;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const state = { level: 0 };

  function setPower(name, p) {
    const L = lights[name];
    L.power = p;
    L.lamp.setPower(p);
    L.light.color.copy(L.lamp.color);
    L.light.intensity = L.max * p;
    refresh();
  }

  function refresh() {
    const p = (n) => lights[n].power;
    const level = Math.min(1.2, p('ceiling') * 0.5 + p('sconce') * 0.12 + p('table') * 0.14 + p('picture') * 0.1 + p('floor') * 0.14);
    state.level = level;
    hemi.intensity = 0.006 + 0.05 * level;
    scene.environmentIntensity = 0.1 * level;
    scene.fog.color.setRGB(0.02 + 0.09 * level, 0.012 + 0.05 * level, 0.006 + 0.02 * level);
    scene.fog.density = 0.045 - 0.014 * Math.min(1, level);
    scene.background.setRGB(0.012 + 0.04 * level, 0.008 + 0.025 * level, 0.004 + 0.012 * level);
    pilot.intensity = PILOT_MAX * pilotLevel * (1 - Math.min(1, p('ceiling')) * 0.85);
  }
  refresh();

  /** dim "dusk" state used for the before/after stills. */
  function setDuskLook(on) {
    if (on) {
      hemi.color.set(0x7d8798); hemi.groundColor.set(0x1d1a18); hemi.intensity = 0.55;
      scene.environmentIntensity = 0.35; scene.fog.density = 0.02;
      scene.fog.color.setRGB(0.09, 0.1, 0.12); scene.background.setRGB(0.09, 0.1, 0.12);
      pilot.intensity = 0;
    } else {
      hemi.color.set(0x8d7a66); hemi.groundColor.set(0x2a1b12);
      refresh();
    }
  }

  return {
    scene, lamps, lights, state,
    setPower, refresh, setDuskLook,
    setPilot: (v) => { pilotLevel = v; refresh(); },
    cordAnchor: () => ceilingL.group.localToWorld(ceilingL.anchorLocal.clone()),
    fixtureBody: ceilingL.body,
    switchBody: ceilingL.switchBody,
  };
}
