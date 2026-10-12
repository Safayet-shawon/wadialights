// Lighting design maths for the planner: the lumen method for a first estimate, then a point-by-point
// illuminance model solved with matrix least squares so every fixture's output is tuned to a uniform target.
//
//   lumen method:   N = E · A / (Φ · UF · MF)                         (how many fixtures)
//   point source:   E(p) = Σ Φ_i / (4π) · cosθ / d²  = Σ A[p][i] · Φ_i,   A[p][i] = h / (4π d³)
//   tuning:         minimise ||A Φ − E_target||²  subject to Φ ≥ 0           (matrix.nnls)
import { zeros, nnls, matVec } from './matrix.js';

/** Typical maintained illuminance on the task plane, lux (EN 12464-1 style values; the user can override). */
export const PURPOSES = {
  hallway: { label: 'Hallway / stairs', lux: 100 },
  living: { label: 'Living room', lux: 150 },
  bedroom: { label: 'Bedroom', lux: 100 },
  bathroom: { label: 'Bathroom', lux: 200 },
  dining: { label: 'Dining room', lux: 200 },
  kitchen: { label: 'Kitchen', lux: 300 },
  office: { label: 'Home office', lux: 500 },
  retail: { label: 'Showroom / shop', lux: 500 },
};

// Utilisation factor by room index K (rows) and reflectance class (columns): typical diffuse-luminaire values.
// class 0: light surfaces (ceiling 0.7 / walls 0.5 / floor 0.2), 1: medium (0.5/0.3/0.2), 2: dark (0.3/0.1/0.1)
const K_TABLE = [0.6, 0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
const UF_TABLE = [
  [0.28, 0.23, 0.18], [0.35, 0.29, 0.24], [0.41, 0.35, 0.29], [0.46, 0.40, 0.34], [0.50, 0.44, 0.38],
  [0.56, 0.50, 0.44], [0.60, 0.54, 0.48], [0.63, 0.57, 0.51], [0.67, 0.61, 0.56], [0.69, 0.64, 0.59],
];

export const roomIndex = (L, W, hm) => (L * W) / (hm * (L + W));

export function utilisationFactor(K, reflClass = 1) {
  const c = Math.min(2, Math.max(0, reflClass));
  if (K <= K_TABLE[0]) return UF_TABLE[0][c];
  if (K >= K_TABLE[K_TABLE.length - 1]) return UF_TABLE[K_TABLE.length - 1][c];
  let i = 1;
  while (K_TABLE[i] < K) i++;
  const t = (K - K_TABLE[i - 1]) / (K_TABLE[i] - K_TABLE[i - 1]);
  return UF_TABLE[i - 1][c] + (UF_TABLE[i][c] - UF_TABLE[i - 1][c]) * t;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : d);

/** Validate and normalise user input (out-of-range values are clamped, never trusted). */
export function normalise(raw = {}) {
  const purpose = typeof raw.purpose === 'string' && Object.hasOwn(PURPOSES, raw.purpose) ? raw.purpose : 'living';
  return {
    length: clamp(num(raw.length, 5), 1.5, 30),
    width: clamp(num(raw.width, 4), 1.5, 30),
    height: clamp(num(raw.height, 2.6), 2, 6),
    purpose,
    targetLux: clamp(num(raw.targetLux, PURPOSES[purpose].lux), 20, 1000),
    reflectance: clamp(Math.round(num(raw.reflectance, 1)), 0, 2),
    fixtureLumens: clamp(num(raw.fixtureLumens, 800), 100, 10000),
    efficacy: clamp(num(raw.efficacy, 100), 20, 200),               // lm/W of the new LED lamp
    hours: clamp(num(raw.hours, 5), 0.5, 24),                       // hours of use per day
    tariff: clamp(num(raw.tariff, 0.15), 0, 5),                     // currency per kWh
    automationSaving: clamp(num(raw.automationSaving, 30), 0, 70),  // % saved by sensors / dimming (an assumption)
    co2: clamp(num(raw.co2, 0.4), 0, 1.5),                          // kg CO2 per kWh
  };
}

/** Place `n` fixtures on a near-square grid that follows the room's aspect ratio. */
export function layout(n, L, W) {
  let best = { rows: 1, cols: n, score: Infinity };
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const score = Math.abs(L / cols - W / rows) + (rows * cols - n) * 0.05;
    if (score < best.score) best = { rows, cols, score };
  }
  const pts = [];
  for (let r = 0; r < best.rows && pts.length < n; r++) {
    for (let c = 0; c < best.cols && pts.length < n; c++) {
      pts.push({ x: (L / best.cols) * (c + 0.5), y: (W / best.rows) * (r + 0.5) });
    }
  }
  return pts;
}

/** The illuminance matrix: A[p][i] = lux at sample p per lumen emitted by fixture i (point source, task plane). */
export function illuminanceMatrix(samples, fixtures, mountH) {
  const A = zeros(samples.length, fixtures.length);
  for (let p = 0; p < samples.length; p++) {
    for (let i = 0; i < fixtures.length; i++) {
      const dx = samples[p].x - fixtures[i].x, dy = samples[p].y - fixtures[i].y;
      const d2 = dx * dx + dy * dy + mountH * mountH;
      A[p][i] = mountH / (4 * Math.PI * d2 * Math.sqrt(d2));
    }
  }
  return A;
}

const WORK_PLANE = 0.8;
const MAINTENANCE = 0.8;
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function plan(input) {
  const o = normalise(input);
  const mountH = Math.max(1, o.height - WORK_PLANE);
  const area = o.length * o.width;
  const K = roomIndex(o.length, o.width, mountH);
  const UF = utilisationFactor(K, o.reflectance);

  // 1. lumen method
  const nExact = (o.targetLux * area) / (o.fixtureLumens * UF * MAINTENANCE);
  const capped = Math.ceil(nExact) > 64;
  const n = clamp(Math.ceil(nExact), 1, 64);
  const fixtures = layout(n, o.length, o.width);

  // 2. point-by-point model on a sample grid (inset 0.25 m from the walls)
  const gx = clamp(Math.round(o.length * 3), 8, 40), gy = clamp(Math.round(o.width * 3), 8, 40);
  const samples = [];
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      samples.push({ x: 0.25 + ((o.length - 0.5) * (i + 0.5)) / gx, y: 0.25 + ((o.width - 0.5) * (j + 0.5)) / gy });
    }
  }
  const A = illuminanceMatrix(samples, fixtures, mountH);

  // A point-source matrix gives the direct component only. The lumen method says the room reaches the
  // target when direct output is scaled by 1/(UF·MF) of what the fixtures emit, so we ask the matrix for the
  // direct share of the target and report E = direct / share.
  const directShare = clamp(UF * MAINTENANCE / 0.8, 0.35, 0.9);
  const b = new Array(samples.length).fill(o.targetLux * directShare);
  const tuned = nnls(A, b, 1e-9);
  const equal = new Array(fixtures.length).fill(o.fixtureLumens);

  const stats = (phi) => {
    const E = matVec(A, phi).map((v) => v / directShare);
    const min = Math.min(...E), max = Math.max(...E), avg = E.reduce((s, v) => s + v, 0) / E.length;
    return { E, min, max, avg, uniformity: avg ? min / avg : 0 };
  };
  const sEqual = stats(equal), sTuned = stats(tuned);

  // 3. energy
  const totalLm = tuned.reduce((s, v) => s + v, 0);
  const watts = totalLm / o.efficacy;
  const oldWatts = totalLm / 15;                       // incandescent ≈ 15 lm/W
  const kwhYear = (watts * o.hours * 365) / 1000;
  const kwhOld = (oldWatts * o.hours * 365) / 1000;
  const kwhAuto = kwhYear * (1 - o.automationSaving / 100);

  return {
    input: o,
    room: { area: round(area), roomIndex: round(K, 2), utilisation: round(UF, 2), maintenance: MAINTENANCE, mountingHeight: round(mountH, 2) },
    lumenMethod: { fixturesExact: round(nExact, 2), fixtures: n, totalLumens: Math.round(n * o.fixtureLumens) },
    layout: fixtures.map((f) => ({ x: round(f.x, 2), y: round(f.y, 2) })),
    tunedLumens: tuned.map((v) => Math.round(v)),
    grid: { cols: gx, rows: gy, lux: sTuned.E.map((v) => Math.round(v)) },
    result: {
      equal: { avgLux: Math.round(sEqual.avg), minLux: Math.round(sEqual.min), maxLux: Math.round(sEqual.max), uniformity: round(sEqual.uniformity, 2) },
      tuned: { avgLux: Math.round(sTuned.avg), minLux: Math.round(sTuned.min), maxLux: Math.round(sTuned.max), uniformity: round(sTuned.uniformity, 2) },
    },
    energy: {
      watts: Math.round(watts), incandescentWatts: Math.round(oldWatts),
      kwhPerYear: Math.round(kwhYear), withAutomationKwh: Math.round(kwhAuto),
      costPerYear: round(kwhYear * o.tariff, 2), costWithAutomation: round(kwhAuto * o.tariff, 2),
      savedVsIncandescentKwh: Math.round(kwhOld - kwhYear),
      savedWithAutomationKwh: Math.round(kwhYear - kwhAuto),
      co2SavedKg: Math.round((kwhOld - kwhAuto) * o.co2),
    },
    capped,
    notes: [
      ...(capped ? [`This room needs about ${Math.ceil(nExact)} lamps of ${Math.round(o.fixtureLumens)} lm. The plan is capped at 64, so choose a lamp with a higher lumen output.`] : []),
      'Point-source model of the task plane at 0.8 m; reflected light is approximated through the utilisation factor.',
      'Utilisation factors are typical values for diffuse luminaires. Use a manufacturer photometric file for a certified design.',
      'The automation saving is an assumption you can edit, not a measured figure.',
    ],
  };
}
