// Delta–Notch lateral inhibition on a sheet of hexagonal cells: the Collier et al. (1996)
// model. Pure model code (no DOM), so it can be run in Node to check the task answers.
//
//   dn/dt = (1 − γ) · f(d̄) − n             Notch activity, from the mean Delta d̄ of the neighbours
//   dd/dt = v · (g(n) · (1 + η) − d)        Delta, made less when Notch is active
//   f(x) = x² / (a + x²),  g(n) = 1 / (1 + b·n²),  a = 0.01, b = 100, v = 1   (Collier's values)
//
// b: feedback strength, how strongly Notch activity switches off Delta (100 = Collier).
// γ: fraction of Notch cleavage blocked by a γ-secretase inhibitor. η: slow random
// fluctuation of Delta production in each cell (gene-expression noise; Ornstein–Uhlenbeck,
// correlation time 1), standard deviation set by the noise level (0.05 = 5 %).
// Start: every cell at the uniform steady state, Delta varied by the same noise level.
// Notch-knockout cells have n = 0 (no receptor), but still make Delta and signal to others.
// Time unit τ = the lifetime of Notch activity and Delta (illustrative: about 30 min).
// Cells on the edge of the sheet average over the neighbours they have.
import { rng } from "../lib/ui";

export const A = 0.01, V = 1;
export const TAU_MIN = 30;                 // minutes of tissue time per model time unit
export const HIGH = 0.5;                   // Delta above this = "Delta-high" cell

export interface Params { b: number; noise: number; gsi: number; ko: boolean }
export const DEFAULTS: Params = { b: 100, noise: 0.05, gsi: 0, ko: false };

export const f = (x: number) => x * x / (A + x * x);
export const g = (n: number, b: number) => 1 / (1 + b * n * n);

export class Sheet {
  readonly cols: number; readonly rows: number; readonly N: number;
  readonly n: Float64Array; readonly d: Float64Array; readonly eta: Float64Array;
  /** neighbour lists (flattened), start index per cell */
  readonly nb: Int32Array; readonly nbStart: Int32Array;
  /** cells inside the knockout patch */
  readonly patch: Uint8Array;
  t = 0;
  p: Params;
  private r: ReturnType<typeof rng>;

  constructor(cols: number, rows: number, seed: number, p: Params = { ...DEFAULTS }, patchR = 2.6) {
    this.cols = cols; this.rows = rows; this.N = cols * rows; this.p = p;
    this.n = new Float64Array(this.N); this.d = new Float64Array(this.N); this.eta = new Float64Array(this.N);
    const list: number[] = [], start: number[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      start.push(list.length);
      for (const [dc, dr] of Sheet.offsets(r)) {
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) list.push(rr * cols + cc);
      }
    }
    start.push(list.length);
    this.nb = Int32Array.from(list); this.nbStart = Int32Array.from(start);
    this.patch = new Uint8Array(this.N);
    const [cx, cy] = this.centre(Math.floor(rows / 2) * cols + Math.floor(cols / 2));
    for (let i = 0; i < this.N; i++) {
      const [x, y] = this.centre(i);
      if (Math.hypot(x - cx, y - cy) <= patchR) this.patch[i] = 1;
    }
    this.r = rng(seed);
    this.reset(seed);
  }

  /** Neighbour offsets for "odd-r" rows (odd rows shifted half a cell to the right). */
  static offsets(r: number): [number, number][] {
    return r % 2
      ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
      : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  }

  /** Centre of cell i in units of the cell spacing (hexagons, pointy top). */
  centre(i: number): [number, number] {
    const r = Math.floor(i / this.cols), c = i % this.cols;
    return [c + (r % 2 ? 0.5 : 0), r * Math.sqrt(3) / 2];
  }

  /** Nearly uniform start: every cell at the uniform steady state, plus small random differences. */
  reset(seed: number) {
    this.r = rng(seed);
    this.t = 0;
    const [n0, d0] = uniformState(this.p.b, this.p.gsi);
    for (let i = 0; i < this.N; i++) {
      this.eta[i] = this.p.noise * this.r.norm();
      this.d[i] = Math.max(0, d0 * (1 + this.p.noise * this.r.norm()));
      this.n[i] = this.isKO(i) ? 0 : n0;
    }
  }

  isKO(i: number) { return this.p.ko && this.patch[i] === 1; }

  /** Advance by time h (model units) with Euler steps of at most 0.02. */
  advance(h: number) {
    const steps = Math.max(1, Math.ceil(h / 0.02)), dt = h / steps;
    const { N, n, d, nb, nbStart } = this;
    const { b: bb, gsi, noise } = this.p;
    const nn = new Float64Array(N);
    const sq = Math.sqrt(2 * dt);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < N; i++) {
        let sum = 0;
        const a = nbStart[i], b = nbStart[i + 1];
        for (let k = a; k < b; k++) sum += d[nb[k]];
        const dbar = sum / (b - a);
        nn[i] = this.isKO(i) ? 0 : n[i] + dt * ((1 - gsi) * f(dbar) - n[i]);
      }
      for (let i = 0; i < N; i++) {
        // OU noise, correlation time 1: stationary SD = noise
        this.eta[i] += -this.eta[i] * dt + noise * sq * this.r.norm();
        d[i] = Math.max(0, d[i] + dt * V * (g(n[i], bb) * Math.max(0, 1 + this.eta[i]) - d[i]));
        n[i] = nn[i];
      }
      this.t += dt;
    }
  }

  /** Fraction of cells that are Delta-high. */
  fracHigh(): number {
    let k = 0;
    for (let i = 0; i < this.N; i++) if (this.d[i] > HIGH) k++;
    return k / this.N;
  }

  /** Fraction of Delta-high cells that touch another Delta-high cell. */
  fracHighTouching(): number {
    let hi = 0, touch = 0;
    for (let i = 0; i < this.N; i++) {
      if (this.d[i] <= HIGH) continue;
      hi++;
      for (let k = this.nbStart[i]; k < this.nbStart[i + 1]; k++) if (this.d[this.nb[k]] > HIGH) { touch++; break; }
    }
    return hi ? touch / hi : 0;
  }
}

/** The uniform steady state (all cells equal): n = (1−γ) f(d), d = g(n). Solved by bisection on d. */
export function uniformState(b: number, gsi: number): [number, number] {
  let lo = 0, hi = 1;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    const n = (1 - gsi) * f(m);
    if (g(n, b) - m > 0) lo = m; else hi = m;
  }
  const d = (lo + hi) / 2;
  return [(1 - gsi) * f(d), d];
}
