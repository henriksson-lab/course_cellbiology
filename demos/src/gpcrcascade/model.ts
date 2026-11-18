// GPCR → Gs → adenylyl cyclase → cAMP → PKA, as a small set of ODEs.
// Qualitatively right, numbers illustrative (one "typical" cell of 2 pL), simplified network:
//   O  fraction of receptors with hormone bound (fast binding, competitive antagonist)
//   D  fraction of receptors desensitised (GRK phosphorylation + arrestin; many internalised)
//   R* = O·(1 − D)  active receptors
//   G  fraction of Gαs in the GTP (active) state; active receptors act as GEFs, GTP hydrolysis turns it off
//   C  cAMP (µM): made by adenylyl cyclase ∝ G, destroyed by phosphodiesterase (first order)
//   P  fraction of PKA catalytic subunits released (Hill function of cAMP, short delay)
// Glucose released (liver cell): ∝ active PKA, with phosphorylase kinase and phosphorylase lumped.
// No DOM here, so this file can be bundled for Node to check the numbers in the tasks.

export interface Params {
  dose: number;       // hormone concentration during the pulse, in units of K_d
  duration: number;   // pulse length (s)
  kGTP: number;       // Gα GTPase rate (1/s)
  kPDE: number;       // phosphodiesterase rate constant (1/s)
  kDes: number;       // desensitisation rate per active receptor (1/s)
  ctx: boolean;       // cholera toxin: Gαs cannot hydrolyse GTP
  pdeInhib: boolean;  // PDE inhibitor (theophylline, high-dose caffeine): PDE activity cut to a third
  blocker: boolean;   // β-blocker (competitive antagonist) at 100 × K_B
}

export const DEFAULTS: Params = {
  dose: 10, duration: 60, kGTP: 0.05, kPDE: 0.15, kDes: 0.01, ctx: false, pdeInhib: false, blocker: false,
};

export const T_START = 20;     // pulse starts here (s)
export const T_END = 600;      // simulated window (s)
export const DT_OUT = 0.5;     // output spacing (s)

// fixed constants (illustrative)
export const K = {
  tauBind: 3,        // s: hormone binding / unbinding
  kRec: 0.002,       // 1/s: resensitisation (dephosphorylation, recycling from endosomes)
  kAct: 0.15,        // 1/s: G activation per unit fraction of active receptors
  kBasal: 0.001,     // 1/s: spontaneous GDP→GTP exchange
  vBasal: 0.02,      // µM/s: basal cyclase activity
  vAC: 1.0,          // µM/s: cyclase activity when all Gαs is active
  pkaK: 2,           // µM: cAMP for half-active PKA
  pkaN: 2,           // Hill coefficient
  tauPKA: 2,         // s
  blockerB: 100,     // [blocker]/K_B
  pdeInhibFactor: 1 / 3,
};

// copy numbers in one cell (2 pL): 1 µM ≈ 1.2 million molecules
export const N = {
  receptors: 10_000,
  gs: 100_000,
  perMicroM: 1.2e6,
  pkaC: 2 * 0.4 * 1.2e6,   // 0.4 µM PKA holoenzyme, 2 catalytic subunits each
  glcPerPKA: 30,           // glucose per second per active PKA catalytic subunit (two enzyme steps lumped)
};

export interface Run {
  t: Float64Array; H: Float64Array; O: Float64Array; D: Float64Array; R: Float64Array;
  G: Float64Array; C: Float64Array; P: Float64Array; glc: Float64Array;
}

type S = [number, number, number, number, number]; // O, D, G, C, P

function hormone(p: Params, t: number): number {
  return t >= T_START && t < T_START + p.duration ? p.dose : 0;
}

function deriv(p: Params, ctxOn: boolean, h: number, s: S): S {
  const [O, D, G, C, P] = s;
  const b = p.blocker ? K.blockerB : 0;
  const occ = h / (1 + h + b);
  const R = O * (1 - D);
  const kG = ctxOn ? 0 : p.kGTP;
  const kP = p.kPDE * (p.pdeInhib ? K.pdeInhibFactor : 1);
  const f = Math.pow(C, K.pkaN) / (Math.pow(K.pkaK, K.pkaN) + Math.pow(C, K.pkaN));
  return [
    (occ - O) / K.tauBind,
    p.kDes * R - K.kRec * D,
    (K.kAct * R + K.kBasal) * (1 - G) - kG * G,
    K.vBasal + K.vAC * G - kP * C,
    (f - P) / K.tauPKA,
  ];
}

function rk4(p: Params, ctxOn: boolean, h: number, s: S, dt: number): S {
  const add = (a: S, b: S, k: number): S => a.map((v, i) => v + k * b[i]) as S;
  const k1 = deriv(p, ctxOn, h, s);
  const k2 = deriv(p, ctxOn, h, add(s, k1, dt / 2));
  const k3 = deriv(p, ctxOn, h, add(s, k2, dt / 2));
  const k4 = deriv(p, ctxOn, h, add(s, k3, dt));
  return s.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as S;
}

/** Resting state with the drugs already present (cholera toxin is taken to start acting at t = 0). */
export function restState(p: Params): S {
  let s: S = [0, 0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) s = rk4(p, false, 0, s, 1);
  return s;
}

export function simulate(p: Params): Run {
  const n = Math.round(T_END / DT_OUT) + 1;
  const r: Run = {
    t: new Float64Array(n), H: new Float64Array(n), O: new Float64Array(n), D: new Float64Array(n),
    R: new Float64Array(n), G: new Float64Array(n), C: new Float64Array(n), P: new Float64Array(n),
    glc: new Float64Array(n),
  };
  const dt = 0.05, sub = Math.round(DT_OUT / dt);
  let s = restState(p), glc = 0, t = 0;
  for (let i = 0; i < n; i++) {
    r.t[i] = t; r.H[i] = hormone(p, t);
    [r.O[i], r.D[i], r.G[i], r.C[i], r.P[i]] = s;
    r.R[i] = s[0] * (1 - s[1]);
    r.glc[i] = glc;
    if (i === n - 1) break;
    for (let k = 0; k < sub; k++) {
      // the pulse edge falls on the output grid, so evaluate the hormone at the step midpoint
      s = rk4(p, p.ctx, hormone(p, t + dt / 2), s, dt);
      glc += N.glcPerPKA * N.pkaC * s[4] * dt;
      t += dt;
    }
    t = (i + 1) * DT_OUT;
  }
  return r;
}

/** Linear interpolation of a run's series at time t. */
export function at(r: Run, key: keyof Run, t: number): number {
  const a = r[key];
  const x = Math.max(0, Math.min(r.t.length - 1, t / DT_OUT));
  const i = Math.floor(x), f = x - i;
  return i >= a.length - 1 ? a[a.length - 1] : a[i] * (1 - f) + a[i + 1] * f;
}

export function peak(a: Float64Array): { v: number; i: number } {
  let v = -Infinity, i = 0;
  for (let k = 0; k < a.length; k++) if (a[k] > v) { v = a[k]; i = k; }
  return { v, i };
}

/** Molecule counts in the cell for one moment of a run. */
export function counts(r: Run, i: number) {
  return {
    bound: r.O[i] * N.receptors,
    active: r.R[i] * N.receptors,
    galpha: r.G[i] * N.gs,
    camp: r.C[i] * N.perMicroM,
    pka: r.P[i] * N.pkaC,
    glcRate: r.P[i] * N.pkaC * N.glcPerPKA,
  };
}

/** Time for a series to fall back to half-way between its peak and the resting value, after the peak. */
export function halfOff(r: Run, key: keyof Run): number | null {
  const a = r[key];
  const { v, i } = peak(a);
  const base = a[0];
  const half = base + (v - base) / 2;
  for (let k = i; k < a.length; k++) if (a[k] <= half) return r.t[k];
  return null;
}
