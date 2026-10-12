import test from 'node:test';
import assert from 'node:assert/strict';
import { multiply, transpose, solve, leastSquares, nnls, identity, matVec } from '../lib/matrix.js';
import { plan, roomIndex, utilisationFactor, layout, illuminanceMatrix, normalise } from '../lib/lighting.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

test('multiply / transpose / identity', () => {
  const A = [[1, 2], [3, 4]], B = [[0, 1], [1, 0]];
  assert.deepEqual(multiply(A, B), [[2, 1], [4, 3]]);
  assert.deepEqual(multiply(A, identity(2)), A);
  assert.deepEqual(transpose([[1, 2, 3]]), [[1], [2], [3]]);
  assert.throws(() => multiply([[1, 2]], [[1, 2]]), /shape mismatch/);
});

test('solve: 3x3 system with a known answer', () => {
  const x = solve([[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], [8, -11, -3]);
  close(x[0], 2); close(x[1], 3); close(x[2], -1);
});

test('solve: singular matrix throws', () => {
  assert.throws(() => solve([[1, 2], [2, 4]], [1, 2]), /singular/);
});

test('leastSquares recovers a line fit', () => {
  // y = 2x + 1 sampled at 5 points
  const A = [0, 1, 2, 3, 4].map((x) => [x, 1]);
  const [m, c] = leastSquares(A, [1, 3, 5, 7, 9], 0);
  close(m, 2, 1e-6); close(c, 1, 1e-6);
});

test('nnls never returns negatives and matches LS when the solution is positive', () => {
  const A = [[1, 0], [0, 1], [1, 1]];
  const x = nnls(A, [2, 3, 5], 0);
  close(x[0], 2, 1e-6); close(x[1], 3, 1e-6);
  const y = nnls([[1, 0], [0, 1]], [-4, 3], 0);
  assert.ok(y.every((v) => v >= 0));
  close(y[0], 0); close(y[1], 3);
});

test('room index and utilisation factor behave', () => {
  close(roomIndex(5, 4, 1.8), (5 * 4) / (1.8 * 9), 1e-9);
  assert.ok(utilisationFactor(2) > utilisationFactor(1));            // bigger rooms use light better
  assert.ok(utilisationFactor(2, 0) > utilisationFactor(2, 2));      // light surfaces beat dark ones
  close(utilisationFactor(100), utilisationFactor(5));                // clamps beyond the table
});

test('layout returns exactly n points inside the room', () => {
  for (const n of [1, 2, 5, 9, 12]) {
    const pts = layout(n, 6, 4);
    assert.equal(pts.length, n);
    assert.ok(pts.every((p) => p.x > 0 && p.x < 6 && p.y > 0 && p.y < 4));
  }
});

test('illuminance matrix: directly under the source is brightest and follows the inverse-square law', () => {
  const A = illuminanceMatrix([{ x: 0, y: 0 }, { x: 2, y: 0 }], [{ x: 0, y: 0 }], 2);
  close(A[0][0], 1 / (4 * Math.PI * 4), 1e-9);                        // E = Φ / (4π h²) below the lamp
  assert.ok(A[1][0] < A[0][0]);
});

test('normalise clamps hostile input', () => {
  const o = normalise({ length: -5, width: 1e9, height: 'abc', targetLux: 1e9, fixtureLumens: 0, purpose: '__proto__' });
  assert.equal(o.length, 1.5); assert.equal(o.width, 30); assert.equal(o.height, 2.6);
  assert.equal(o.targetLux, 1000); assert.equal(o.fixtureLumens, 100); assert.equal(o.purpose, 'living');
});

test('plan: a living room lands near its target and matrix tuning improves uniformity', () => {
  const r = plan({ length: 5, width: 4, height: 2.6, purpose: 'living' });
  assert.ok(r.lumenMethod.fixtures >= 1);
  assert.equal(r.layout.length, r.lumenMethod.fixtures);
  assert.equal(r.grid.lux.length, r.grid.cols * r.grid.rows);
  assert.ok(r.tunedLumens.every((v) => v >= 0));
  assert.ok(r.result.tuned.uniformity >= r.result.equal.uniformity - 1e-9, 'tuning must not make it worse');
  const off = Math.abs(r.result.tuned.avgLux - r.input.targetLux) / r.input.targetLux;
  assert.ok(off < 0.35, `average ${r.result.tuned.avgLux} lux vs target ${r.input.targetLux}`);
});

test('plan: energy figures are consistent', () => {
  const r = plan({ length: 4, width: 4, purpose: 'kitchen', hours: 6, tariff: 0.2, automationSaving: 25 });
  assert.ok(r.energy.incandescentWatts > r.energy.watts * 5);        // LED 100 lm/W vs 15 lm/W
  close(r.energy.withAutomationKwh, r.energy.kwhPerYear * 0.75, 1.5);
  assert.ok(r.energy.co2SavedKg > 0);
});

test('plan: more light needed for a bigger room', () => {
  const small = plan({ length: 3, width: 3, purpose: 'office' }), big = plan({ length: 8, width: 6, purpose: 'office' });
  assert.ok(big.lumenMethod.fixtures > small.lumenMethod.fixtures);
});

test('matVec', () => assert.deepEqual(matVec([[1, 2], [3, 4]], [1, 1]), [3, 7]));
