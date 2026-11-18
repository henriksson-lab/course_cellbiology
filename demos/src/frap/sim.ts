// FRAP and cell-fusion simulation: molecules doing 2D random walks in a membrane patch.
// Pure model code (no DOM), so it can be run in Node to check the task answers.
// Units: µm and seconds.
import { rng, } from "../lib/ui";
import { gaussPairs } from "../lib/particles";

export type MolKey = "lipid" | "small" | "large";
export interface MolType { name: string; D0: number; size: number; corral: number; speed: number }
/** D0: diffusion coefficient (µm²/s) in the default membrane at 37 °C. Typical values in a
 *  cell's plasma membrane: lipids about 1, proteins 10–100 times slower (crowding, cytoskeleton). */
export const MOLS: Record<MolKey, MolType> = {
  lipid: { name: "fluorescent lipid", D0: 1.0, size: 0.13, corral: 0.08, speed: 0.5 },
  small: { name: "small membrane protein", D0: 0.1, size: 0.22, corral: 0.12, speed: 5 },
  large: { name: "large protein complex", D0: 0.02, size: 0.32, corral: 0.15, speed: 25 },
};

export interface Fluidity { tail: number; db: number; chol: number; temp: number }
export const DEFAULT_FLUID: Fluidity = { tail: 18, db: 1, chol: 0.3, temp: 37 };

/**
 * Qualitative fluidity factor (1 for the default membrane). Shorter tails and more cis
 * double bonds lower the melting temperature Tm (gel → liquid); below Tm the bilayer is a
 * gel and diffusion is about 50× slower. Cholesterol slows diffusion in the liquid state
 * but broadens the transition and keeps a "gel" membrane fluid (a fluidity buffer).
 * Warmer = faster. Shape right, numbers illustrative.
 */
export function rawFluidity(f: Fluidity): number {
  const Tm = 41 + 8 * (f.tail - 16) - 45 * f.db;           // °C: DPPC 16:0 ≈ 41, POPC ≈ 0
  const w = 2 + 15 * f.chol;                                // width of the transition, °C
  const g = 1 / (1 + Math.exp(-(Tm - f.temp) / w));         // fraction "gel"
  const liquid = Math.exp(0.05 * (f.temp - 37)) * (16 / f.tail) * (1 - 1.2 * f.chol);
  const gel = 0.02 + 0.8 * f.chol;
  return liquid * ((1 - g) + g * gel);
}
const RAW_DEFAULT = rawFluidity(DEFAULT_FLUID);
export const fluidity = (f: Fluidity) => rawFluidity(f) / RAW_DEFAULT;

export type Mode = "frap" | "fusion";
export const FRAP_W = 15;          // µm, side of the square membrane patch (periodic edges)
export const SPOT_R = 1.5;         // µm, radius of the bleach spot
export const FUSION_R = 20;        // µm, radius of the fused cell's membrane (drawn as a flat disc)

export interface Sample { t: number; f: number }

export class Sim {
  n: number; mode: Mode; mol: MolType; D: number; immobile: number;
  W: number; H: number;
  x: Float32Array; y: Float32Array; ax: Float32Array; ay: Float32Array;
  fixed: Uint8Array;            // 1 = anchored (immobile): jiggles in a small corral
  label: Uint8Array;            // frap: 0 bright, 1 bleached. fusion: 0 green (mouse), 1 red (human)
  t = 0;                        // simulated seconds since start
  spot: { x: number; y: number; t: number } | null = null;
  rand: () => number; gauss: () => number;

  constructor(opts: { n: number; mode: Mode; mol: MolKey; fluid: Fluidity; immobile: number; seed: number }) {
    const { n, mode } = opts;
    this.n = n; this.mode = mode; this.mol = MOLS[opts.mol];
    this.D = this.mol.D0 * fluidity(opts.fluid);
    this.immobile = opts.immobile;
    const r = rng(opts.seed);
    this.rand = r.unif; this.gauss = gaussPairs(r.unif);
    this.W = this.H = mode === "frap" ? FRAP_W : 2 * FUSION_R;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.ax = new Float32Array(n); this.ay = new Float32Array(n);
    this.fixed = new Uint8Array(n); this.label = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let px: number, py: number;
      if (mode === "frap") { px = this.rand() * this.W; py = this.rand() * this.H; }
      else {
        do { px = (this.rand() * 2 - 1) * FUSION_R; py = (this.rand() * 2 - 1) * FUSION_R; } while (px * px + py * py > FUSION_R * FUSION_R);
        this.label[i] = px < 0 ? 1 : 0;
        px += FUSION_R; py += FUSION_R;
      }
      this.x[i] = this.ax[i] = px; this.y[i] = this.ay[i] = py;
    }
    // the first round(immobile*n) molecules in a random order are anchored
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const k = Math.round(opts.immobile * n);
    for (let i = 0; i < k; i++) this.fixed[order[i]] = 1;
  }

  setD(mol: MolKey, fluid: Fluidity) { this.mol = MOLS[mol]; this.D = this.mol.D0 * fluidity(fluid); }

  /** Advance by dt simulated seconds. */
  step(dt: number) {
    const s = Math.sqrt(2 * this.D * dt), g = this.gauss;
    const { x, y, ax, ay, fixed, n, W, H } = this;
    const c = this.mol.corral, c2 = c * c;
    if (this.mode === "frap") {
      for (let i = 0; i < n; i++) {
        let nx = x[i] + s * g(), ny = y[i] + s * g();
        if (fixed[i]) {
          let dx = nx - ax[i], dy = ny - ay[i];
          if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
          if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
          if (dx * dx + dy * dy > c2) continue;           // stays inside its corral
        }
        if (nx < 0) nx += W; else if (nx >= W) nx -= W;
        if (ny < 0) ny += H; else if (ny >= H) ny -= H;
        x[i] = nx; y[i] = ny;
      }
    } else {
      const R2 = FUSION_R * FUSION_R;
      for (let i = 0; i < n; i++) {
        const nx = x[i] + s * g(), ny = y[i] + s * g();
        if (fixed[i]) { const dx = nx - ax[i], dy = ny - ay[i]; if (dx * dx + dy * dy > c2) continue; }
        const ux = nx - FUSION_R, uy = ny - FUSION_R;
        if (ux * ux + uy * uy > R2) continue;           // edge of the cell: step rejected
        x[i] = nx; y[i] = ny;
      }
    }
    this.t += dt;
  }

  /** Bleach every molecule inside a circle of radius SPOT_R around (cx, cy). */
  bleach(cx: number, cy: number) {
    const { x, y, n, W, H } = this;
    for (let i = 0; i < n; i++) {
      let dx = x[i] - cx, dy = y[i] - cy;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      if (dx * dx + dy * dy <= SPOT_R * SPOT_R) this.label[i] = 1;
    }
    this.spot = { x: cx, y: cy, t: this.t };
  }

  /** Fraction of the molecules in the spot that are bright (fluorescent). */
  spotFraction(cx: number, cy: number): number {
    const { x, y, n, W, H, label } = this;
    let tot = 0, br = 0;
    for (let i = 0; i < n; i++) {
      let dx = x[i] - cx, dy = y[i] - cy;
      if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
      if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
      if (dx * dx + dy * dy <= SPOT_R * SPOT_R) { tot++; if (!label[i]) br++; }
    }
    return tot ? br / tot : 0;
  }

  /** Fusion: fraction of the molecules in the left half that are red (human). 1 → 0.5 when mixed. */
  redLeft(): number {
    let tot = 0, red = 0;
    for (let i = 0; i < this.n; i++) if (this.x[i] < FUSION_R) { tot++; red += this.label[i]; }
    return tot ? red / tot : 0;
  }

  /** Fraction of all molecules that are bleached. */
  bleachedFraction(): number {
    let b = 0; for (let i = 0; i < this.n; i++) b += this.label[i];
    return b / this.n;
  }
}

/** e^{-x}·(I0(x) + I1(x)) (Abramowitz & Stegun 9.8.1–9.8.4), stable for large x. */
function eI01(x: number): number {
  if (x < 3.75) {
    const t = (x / 3.75) ** 2;
    const i0 = 1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    const i1 = x * (0.5 + t * (0.87890594 + t * (0.51498869 + t * (0.15084934 + t * (0.02658733 + t * (0.00301532 + t * 0.00032411))))));
    return Math.exp(-x) * (i0 + i1);
  }
  const u = 3.75 / x;
  const i0 = 0.39894228 + u * (0.01328592 + u * (0.00225319 + u * (-0.00157565 + u * (0.00916281 + u * (-0.02057706 + u * (0.02635537 + u * (-0.01647633 + u * 0.00392377)))))));
  const i1 = 0.39894228 + u * (-0.03988024 + u * (-0.00362018 + u * (0.00163801 + u * (-0.01031555 + u * (0.02282967 + u * (-0.02895312 + u * (0.01787654 - u * 0.00420059)))))));
  return (i0 + i1) / Math.sqrt(x);
}

/** Exact recovery for a uniform circular bleach (Soumpasis 1983), 0 → 1; tauD = w²/4D. */
export function soumpasis(t: number, tauD: number): number {
  return t <= 0 ? 0 : eI01(2 * tauD / t);
}
// t½ / tauD for the Soumpasis curve (solved once by bisection)
const HALF = (() => { let a = 0.01, b = 100; for (let i = 0; i < 60; i++) { const m = Math.sqrt(a * b); if (soumpasis(m, 1) < 0.5) a = m; else b = m; } return Math.sqrt(a * b); })();

/** Expected half-time for diffusion coefficient D. */
export const halfTime = (D: number) => HALF * SPOT_R * SPOT_R / (4 * D);

export interface Analysis { pre: number; f0: number; plateau: number; mobile: number; thalf: number; D: number; tauD: number; ok: boolean; shown: boolean }

/**
 * Fit the recovery curve as an experimenter does: F(t) = F0 + A·soumpasis(t, tauD), with
 * F0 the first point after the bleach; A and tauD by least squares. Plateau F0 + A,
 * mobile fraction A / (pre − F0), t½ from tauD, D = w²/(4 tauD).
 * `ok` is false while the curve is too short to trust (less than about 10 half-times);
 * `shown` is false while it is meaningless (less than 2 half-times).
 */
export function analyse(pre: number, s: Sample[]): Analysis | null {
  if (s.length < 20) return null;
  const f0 = s[0].f;
  const tEnd = s[s.length - 1].t;
  const sse = (tau: number) => {
    let sb = 0, sbb = 0;
    for (const p of s) { const b = soumpasis(p.t, tau); sb += (p.f - f0) * b; sbb += b * b; }
    const A = sbb > 0 ? sb / sbb : 0;
    let e = 0; for (const p of s) { const r = p.f - f0 - A * soumpasis(p.t, tau); e += r * r; }
    return { e, A };
  };
  let best = { tau: 1, e: Infinity, A: 0 };
  const lo = Math.log(tEnd / 2000), hi = Math.log(tEnd * 20);
  for (let k = 0; k <= 80; k++) {
    const tau = Math.exp(lo + (hi - lo) * k / 80), r = sse(tau);
    if (r.e < best.e) best = { tau, e: r.e, A: r.A };
  }
  // refine (golden section on log tau)
  let a = Math.log(best.tau) - (hi - lo) / 80, b = Math.log(best.tau) + (hi - lo) / 80;
  for (let i = 0; i < 30; i++) {
    const m1 = a + (b - a) * 0.382, m2 = a + (b - a) * 0.618;
    if (sse(Math.exp(m1)).e < sse(Math.exp(m2)).e) b = m2; else a = m1;
  }
  const tauD = Math.exp((a + b) / 2), A = sse(tauD).A;
  const thalf = HALF * tauD;
  return { pre, f0, plateau: f0 + A, mobile: pre > f0 ? A / (pre - f0) : 0, thalf, D: SPOT_R * SPOT_R / (4 * tauD), tauD, ok: tEnd > 10 * thalf && A > 0.03, shown: tEnd > 2 * thalf && f0 + A < 1.25 };
}
