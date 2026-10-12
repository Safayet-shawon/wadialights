// Where is the cord knob in frame 0 of the intro, and how far (in px) does it travel at full pull?
// Output is written to src/knob.json and used by the video intro to place the drag handle.
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { poses } from '../src/scene/path.js';

const anchor = new THREE.Vector3(0, 3.0, -1.2).add(new THREE.Vector3(0.17, -0.345, 0.2));
const res = {};
for (const [name, aspect] of [['l', 16 / 9], ['p', 9 / 16]]) {
  const p = poses(aspect);
  const cam = new THREE.PerspectiveCamera(p.fov0, aspect, 0.05, 30);
  cam.position.copy(p.pos[0]); cam.lookAt(p.look[0]); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const proj = (y, z = 0) => {
    const v = new THREE.Vector3(anchor.x, y, anchor.z + z).project(cam);
    return [(v.x + 1) / 2, (1 - v.y) / 2];
  };
  const rest = proj(anchor.y - 0.55 - 0.05);
  const full = proj(anchor.y - 0.55 - 0.36 - 0.05, -0.036);
  res[name] = { rest, full };
}
writeFileSync('src/knob.json', JSON.stringify(res, null, 2));
console.log(res);
