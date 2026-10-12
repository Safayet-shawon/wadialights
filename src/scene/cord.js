// A braided pull cord: Verlet chain + elastic knob.
//
//  - anchor (p0) is fixed in the fixture's pull-switch
//  - the knob is a damped spring chasing either the pointer (while dragging) or rest
//  - the cord is the chain between them; if the knob moves further than the rest
//    length the cord "pays out" of the switch, otherwise the slack buckles naturally
import * as THREE from 'three';
import { lathe } from './geo.js';

const N = 22;              // chain points
const RADIUS = 0.0065;
const SUBSTEP = 1 / 120;

export class PullCord {
  constructor(M, anchor, { restLength = 0.55, maxPull = 0.36, threshold = 0.5 } = {}) {
    this.anchor = anchor.clone();
    this.restLength = restLength;
    this.maxPull = maxPull;
    this.threshold = threshold;

    this.rest = anchor.clone().add(new THREE.Vector3(0, -restLength, 0.0));
    this.knob = this.rest.clone();
    this.vel = new THREE.Vector3();
    this.target = this.rest.clone();
    this.dragging = false;
    this.locked = false;           // after the switch fires, input is ignored
    this.fired = false;
    this.pull = 0;                 // 0..1
    this.onFire = null;
    this.time = 0;
    this._hold = 0;

    this.pts = Array.from({ length: N }, (_, i) => this.anchor.clone().lerp(this.rest, i / (N - 1)));
    this.prev = this.pts.map((p) => p.clone());

    // geometry: N rings of (radial+1) verts, updated in place
    this.radial = 7;
    const verts = N * (this.radial + 1);
    const pos = new Float32Array(verts * 3), uv = new Float32Array(verts * 2);
    const idx = [];
    for (let i = 0; i < N; i++) for (let j = 0; j <= this.radial; j++) {
      uv[(i * (this.radial + 1) + j) * 2] = j / this.radial;
      uv[(i * (this.radial + 1) + j) * 2 + 1] = (i / (N - 1)) * (restLength / 0.05);
    }
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < this.radial; j++) {
      const a = i * (this.radial + 1) + j, b = a + 1, c = a + this.radial + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, M.cord);
    this.mesh.frustumCulled = false;

    // brass acorn pull
    this.knobGroup = new THREE.Group();
    const acorn = new THREE.Mesh(lathe([
      [0, 0.0], [0.007, 0.0], [0.011, -0.012], [0.02, -0.032], [0.026, -0.058], [0.022, -0.085], [0.012, -0.103], [0.0, -0.11],
    ], 24), M.brass);
    const cap = new THREE.Mesh(lathe([[0.0, 0.012], [0.014, 0.012], [0.014, 0.0], [0.009, -0.004], [0, -0.004]], 16), M.brassAged);
    this.knobGroup.add(acorn, cap);
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.knobGroup);
    this._write();
  }

  get position() { return this.knob; }

  /** begin a drag. */
  grab() {
    if (this.locked) return false;
    this.dragging = true;
    return true;
  }

  /** world-space point under the pointer on the cord's plane. */
  drag(world) {
    if (!this.dragging || this.locked) return;
    const dy = THREE.MathUtils.clamp(world.y - this.rest.y, -this.maxPull * 1.25, 0.03);
    // rubber-band: the harder you pull the more it resists
    const k = 1 - 0.2 * Math.min(1, -dy / this.maxPull);
    const dx = THREE.MathUtils.clamp((world.x - this.rest.x) * 0.7, -0.14, 0.14);
    this.target.set(this.rest.x + dx, this.rest.y + dy * k, this.rest.z + Math.min(0, dy) * 0.12);
  }

  release() {
    this.dragging = false;
    // a quick flick can let go before the spring has caught up: judge by where the pointer had pulled to
    const intended = (this.rest.y - this.target.y) / this.maxPull;
    if (!this.locked && intended >= this.threshold) { this._fire(); return; }
    this.target.copy(this.rest);
  }

  /** scripted pull (keyboard, tap or skip): same physics, driven target. */
  autoPull() {
    if (this.locked) return;
    this.dragging = false;
    this._script = 0;
  }

  _fire() {
    if (this.fired) return;
    this.fired = true;
    this.locked = true;
    this.dragging = false;
    this._script = null;
    // the cord completes its travel, then springs home
    this.target.set(this.rest.x, this.rest.y - this.maxPull * 1.02, this.rest.z - this.maxPull * 0.1);
    this._hold = 0.11;
    this.onFire?.();
  }

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;

    // scripted pull
    if (this._script != null) {
      this._script += dt;
      const t = Math.min(1, this._script / 0.42);
      const e = 1 - Math.pow(1 - t, 3);
      this.target.set(this.rest.x, this.rest.y - this.maxPull * 0.95 * e, this.rest.z);
    }

    let steps = Math.max(1, Math.round(dt / SUBSTEP));
    const h = dt / steps;
    while (steps--) this._step(h);

    this.pull = THREE.MathUtils.clamp((this.rest.y - this.knob.y) / this.maxPull, 0, 1.2);
    if (!this.fired && this.pull >= this.threshold) this._fire();

    if (this.fired && this._hold > 0) {
      this._hold -= dt;
      if (this._hold <= 0) this.target.copy(this.rest);
    }
    this._write();
  }

  _step(h) {
    // knob spring
    const dragging = this.dragging || this._script != null || this._hold > 0;
    const k = dragging ? 520 : 150, c = dragging ? 38 : 4.6;
    const ax = (this.target.x - this.knob.x) * k - this.vel.x * c;
    const ay = (this.target.y - this.knob.y) * k - this.vel.y * c;
    const az = (this.target.z - this.knob.z) * k - this.vel.z * c;
    this.vel.x += ax * h; this.vel.y += ay * h; this.vel.z += az * h;
    this.knob.addScaledVector(this.vel, h);

    // verlet chain
    const pts = this.pts, prev = this.prev;
    const idle = Math.sin(this.time * 0.9) * 0.006 + Math.sin(this.time * 1.7 + 1) * 0.003;
    for (let i = 1; i < N - 1; i++) {
      const p = pts[i], q = prev[i];
      const vx = (p.x - q.x) * 0.985, vy = (p.y - q.y) * 0.985, vz = (p.z - q.z) * 0.985;
      q.copy(p);
      p.x += vx; p.y += vy - 6.5 * h * h; p.z += vz + idle * h * 0.9 * (i / N);
    }
    pts[0].copy(this.anchor);
    pts[N - 1].copy(this.knob);
    const dist = pts[0].distanceTo(pts[N - 1]);
    const seg = Math.max(this.restLength, dist * 1.003) / (N - 1);
    for (let it = 0; it < 10; it++) {
      for (let i = 0; i < N - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - seg) / d;
        const wa = i === 0 ? 0 : 0.5, wb = i + 1 === N - 1 ? 0 : 0.5;
        const total = wa + wb || 1;
        a.x += dx * diff * (wa / total); a.y += dy * diff * (wa / total); a.z += dz * diff * (wa / total);
        b.x -= dx * diff * (wb / total); b.y -= dy * diff * (wb / total); b.z -= dz * diff * (wb / total);
      }
    }
  }

  _write() {
    const pts = this.pts, pos = this.mesh.geometry.attributes.position.array;
    const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), ref = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(N - 1, i + 1)];
      t.subVectors(c, a).normalize();
      n.copy(ref).addScaledVector(t, -ref.dot(t)).normalize();
      b.crossVectors(t, n);
      for (let j = 0; j <= this.radial; j++) {
        const ang = (j / this.radial) * Math.PI * 2;
        const o = (i * (this.radial + 1) + j) * 3;
        const cs = Math.cos(ang) * RADIUS, sn = Math.sin(ang) * RADIUS;
        pos[o] = pts[i].x + n.x * cs + b.x * sn;
        pos[o + 1] = pts[i].y + n.y * cs + b.y * sn;
        pos[o + 2] = pts[i].z + n.z * cs + b.z * sn;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();

    // knob hangs along the last segment
    const last = pts[N - 1], before = pts[N - 3];
    const dir = t.subVectors(last, before).normalize();
    this.knobGroup.position.copy(last);
    this.knobGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}
