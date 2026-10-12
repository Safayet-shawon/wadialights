// Procedural textures. Nothing here is fetched: every surface in the room is generated
// on a canvas at start-up so the site has no remote or binary asset dependencies.
import * as THREE from 'three';

/* ---------- tileable value noise ---------- */
const hash = (x, y, s) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};

function vnoise(x, y, perX, perY, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % perX) + perX) % perX, x1 = (x0 + 1) % perX;
  const y0 = ((yi % perY) + perY) % perY, y1 = (y0 + 1) % perY;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fractal noise over a 0..1 tile, repeats seamlessly. */
export function fbm(u, v, base, oct, seed) {
  let a = 0.5, f = base, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * vnoise(u * f, v * f, f, f, seed + o * 7);
    norm += a; f *= 2; a *= 0.5;
  }
  return sum / norm;
}

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

function toTexture(canvas, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

/** cheap clone-with-different-repeat (shares the uploaded image) */
export function tiled(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

/* ---------- plaster: colour + bump ---------- */
export function plasterTextures(size = 512, base = [204, 186, 152]) {
  const col = makeCanvas(size, size), bmp = makeCanvas(size, size);
  const ci = col.getContext('2d').createImageData(size, size);
  const bi = bmp.getContext('2d').createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = (y * size + x) * 4;
      const cloud = fbm(u, v, 3, 5, 11);
      const grit = fbm(u, v, 48, 2, 23);
      const trowel = fbm(u, v, 5, 2, 5);
      const m = 0.8 + 0.34 * cloud + 0.12 * (grit - 0.5) + 0.16 * (trowel - 0.5);
      ci.data[i] = base[0] * m; ci.data[i + 1] = base[1] * m * 0.99; ci.data[i + 2] = base[2] * m * 0.96; ci.data[i + 3] = 255;
      const h = 255 * (0.35 * cloud + 0.45 * grit + 0.2 * trowel);
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = h; bi.data[i + 3] = 255;
    }
  }
  col.getContext('2d').putImageData(ci, 0, 0);
  bmp.getContext('2d').putImageData(bi, 0, 0);
  return { map: toTexture(col), bump: toTexture(bmp, { srgb: false }) };
}

/* ---------- plank floor: planks run along V (towards the back wall) ---------- */
export function floorTexture(size = 1024, planks = 8) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = (y * size + x) * 4;
      const pi = Math.floor(u * planks), within = u * planks - pi;
      const vv = (v + hash(pi, 1, 3)) % 1;
      const piece = vv < 0.55 ? 0 : 1;
      const tone = hash(pi, piece, 9);
      const grain =
        0.55 * vnoise(within * 3 + pi * 5, vv * 36, 64, 36, 31 + piece) +
        0.3 * vnoise(within * 9 + pi * 5, vv * 90, 144, 90, 41 + piece) +
        0.15 * vnoise(within * 20, vv * 12, 160, 12, 5);
      let m = (0.62 + 0.55 * tone) * (0.68 + 0.6 * grain);
      const edge = Math.min(within, 1 - within);
      if (edge < 0.025) m *= 0.28 + edge * 28;
      const joint = Math.min(Math.abs(vv - 0.55), vv, 1 - vv);
      if (joint < 0.004) m *= 0.3;
      img.data[i] = 112 * m; img.data[i + 1] = 70 * m; img.data[i + 2] = 40 * m; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/* ---------- walnut (panelling, furniture): grain runs along U ---------- */
export function walnutTexture(size = 512) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = (y * size + x) * 4;
      const warp = vnoise(u * 3, v * 6, 3, 6, 71) * 0.5;
      const g = 0.5 * vnoise(u * 4, v * 70 + warp * 8, 4, 70, 72) + 0.3 * vnoise(u * 8, v * 150, 8, 150, 73) + 0.2 * fbm(u, v, 3, 3, 74);
      const m = 0.55 + 0.9 * g;
      img.data[i] = 86 * m; img.data[i + 1] = 52 * m; img.data[i + 2] = 34 * m; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/* ---------- woven braid for the pull cord ---------- */
export function braidTexture() {
  const c = makeCanvas(32, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9b48a'; ctx.fillRect(0, 0, 32, 128);
  ctx.strokeStyle = '#6d5436'; ctx.lineWidth = 5;
  for (let y = -32; y < 160; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y + 16); ctx.lineTo(32, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,240,205,.35)'; ctx.lineWidth = 2;
  for (let y = -32; y < 160; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y + 12); ctx.lineTo(32, y - 4); ctx.stroke();
  }
  const t = toTexture(c);
  return t;
}

/* ---------- linen lamp-shade ---------- */
export function linenTexture() {
  const s = 256, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const warp = (Math.sin(x * 1.57) * 0.5 + 0.5) * 0.12 + (Math.sin(y * 1.57) * 0.5 + 0.5) * 0.12;
      const n = fbm(x / s, y / s, 16, 3, 91);
      const m = 0.82 + warp + 0.2 * (n - 0.5);
      img.data[i] = 238 * m; img.data[i + 1] = 222 * m; img.data[i + 2] = 190 * m; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/* ---------- rug ---------- */
export function rugTexture() {
  const w = 512, h = 768, c = makeCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#4a2024'; ctx.fillRect(0, 0, w, h);
  const band = (inset, width, color) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
  band(18, 10, '#2b1316'); band(40, 3, '#a7834e'); band(52, 14, '#6b3a2c'); band(78, 2, '#a7834e'); band(86, 2, '#d6c4a5');
  // field medallion
  ctx.save(); ctx.translate(w / 2, h / 2);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    const r = 150 - k * 34;
    ctx.moveTo(0, -r * 1.35); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.35); ctx.lineTo(-r, 0); ctx.closePath();
    ctx.lineWidth = k % 2 ? 2 : 5;
    ctx.strokeStyle = ['#a7834e', '#2b1316', '#d6c4a5', '#6b3a2c'][k];
    ctx.stroke();
  }
  ctx.restore();
  for (let y = 100; y < h - 100; y += 44) for (let x = 100; x < w - 100; x += 44) {
    if (Math.abs(x - w / 2) + Math.abs(y - h / 2) * 0.55 < 210) continue;
    ctx.fillStyle = 'rgba(167,131,78,.55)';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }
  // wool pile noise
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 0.86 + Math.random() * 0.28;
    img.data[i] *= n; img.data[i + 1] *= n; img.data[i + 2] *= n;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/* ---------- abstract oil painting (a stand-in canvas, clearly not a real artwork) ---------- */
export function paintingTexture() {
  const w = 384, h = 480, c = makeCanvas(w, h), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1b2a28'); g.addColorStop(0.55, '#3b3a28'); g.addColorStop(1, '#2b1a14');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const blob = (x, y, r, color) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  };
  blob(120, 150, 200, 'rgba(214,160,86,.75)');
  blob(280, 330, 160, 'rgba(120,52,44,.7)');
  blob(60, 400, 140, 'rgba(70,86,60,.6)');
  blob(300, 90, 110, 'rgba(231,206,160,.45)');
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const m = 0.78 + 0.45 * fbm(x / w, y / h, 8, 4, 123) + 0.2 * vnoise(x / 3, y / 40, 128, 12, 5) * 0.5;
    img.data[i] *= m; img.data[i + 1] *= m; img.data[i + 2] *= m;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/* ---------- radial glow used for bulb halos ---------- */
export function haloTexture() {
  const s = 128, c = makeCanvas(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
