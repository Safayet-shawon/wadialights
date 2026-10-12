// Small dense-matrix toolkit (row-major arrays of arrays). No dependencies, so the same code runs in the
// browser (instant planner results), in Vercel functions and in the Docker server.

export const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
export const identity = (n) => { const m = zeros(n, n); for (let i = 0; i < n; i++) m[i][i] = 1; return m; };
export const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));

export function multiply(A, B) {
  if (A[0].length !== B.length) throw new Error(`shape mismatch ${A.length}x${A[0].length} · ${B.length}x${B[0].length}`);
  const out = zeros(A.length, B[0].length);
  for (let i = 0; i < A.length; i++) {
    for (let k = 0; k < B.length; k++) {
      const a = A[i][k];
      if (a === 0) continue;
      for (let j = 0; j < B[0].length; j++) out[i][j] += a * B[k][j];
    }
  }
  return out;
}

export const matVec = (A, x) => A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));

/** Solve A x = b by Gaussian elimination with partial pivoting. Throws on a singular matrix. */
export function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('singular matrix');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/** Ridge-regularised least squares: argmin ||A x - b||² + λ||x||², via the normal equations. */
export function leastSquares(A, b, lambda = 1e-9) {
  const At = transpose(A);
  const N = multiply(At, A);
  for (let i = 0; i < N.length; i++) N[i][i] += lambda;
  return solve(N, matVec(At, b));
}

/**
 * Non-negative least squares (a light cannot emit negative lumens): active-set iteration.
 * Solve on the free set, clamp anything that goes negative to zero, repeat.
 */
export function nnls(A, b, lambda = 1e-9, maxIter = 40) {
  const n = A[0].length;
  let free = Array.from({ length: n }, (_, i) => i);
  let x = new Array(n).fill(0);
  for (let it = 0; it < maxIter && free.length; it++) {
    const sub = A.map((row) => free.map((j) => row[j]));
    const xs = leastSquares(sub, b, lambda);
    const neg = xs.map((v, k) => (v < 0 ? k : -1)).filter((k) => k >= 0);
    x = new Array(n).fill(0);
    free.forEach((j, k) => { x[j] = Math.max(0, xs[k]); });
    if (!neg.length) break;
    free = free.filter((_, k) => !neg.includes(k));
  }
  return x;
}
