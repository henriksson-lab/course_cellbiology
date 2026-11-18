// Kinase cascade: growth factor → RTK → Ras → RAF → MEK → ERK. Pure code (no DOM), so it
// can be bundled for Node to check the numbers in the task solutions.
//
// A caricature in the spirit of Huang & Ferrell (1996, PNAS 93:10078): MEK and ERK are each
// phosphorylated twice (distributively) by Michaelis–Menten enzymes working near saturation,
// which makes each level steeper (more switch-like) than the one above it. Illustrative
// parameters; all activities are fractions (0–1) of each protein; time in minutes.
//
// Simplifications (stated on the page): one pathway out of a network (no PI3K branch, no
// scaffolds, no nuclear transport); the receptor is ligand occupancy relaxing in ~0.5 min
// (no internalisation); the negative feedback is one slow ERK-dependent inhibitor F
// (lumping ERK phosphorylation of SOS and RAF, and induced phosphatases) acting on Ras
// activation and on wild-type RAF; drugs act as simple fractional inhibition I/(I+IC50).
// The RAF inhibitor is vemurafenib-like: it blocks mutant BRAF V600E with IC50 = 1 but
// Ras-driven (dimeric) wild-type RAF only at 100× higher doses, and at moderate doses it
// boosts that RAF up to 1.5× (paradoxical activation). Ras G12V: GAP-stimulated hydrolysis
// reduced 100-fold. BRAF V600E: constant RAF activity, independent of Ras and feedback.

export type Mut = "none" | "ras" | "braf";

export interface Params {
  gf: number;        // growth factor, ng/mL (0 = none)
  iRTK: number;      // RTK inhibitor dose, in multiples of its IC50
  iRAF: number;      // RAF inhibitor dose, in multiples of its IC50 for BRAF V600E
  iMEK: number;      // MEK inhibitor dose, in multiples of its IC50
  feedback: boolean; // ERK → upstream negative feedback
  mut: Mut;          // oncogenic mutation
  tDrug: number;     // time (min) at which the drugs are added; 0 = before the growth factor
}

export const DEFAULT: Params = { gf: 1, iRTK: 0, iRAF: 0, iMEK: 0, feedback: true, mut: "none", tDrug: 0 };

// ---- parameters (illustrative)
export const KD = 1;            // ng/mL, growth factor–receptor dissociation constant
/** Rate constants (illustrative; exported so the numbers can be checked in Node). */
export const K = {
  kR: 2,                 // /min, receptor activation relaxes to occupancy
  kSOS: 3, kRasB: 0.02,  // /min, Ras activation by active receptor (via Grb2–SOS); basal exchange
  kGAP: 1,               // /min, GAP-stimulated GTP hydrolysis
  GAP_MUT: 0.01,         // Ras G12V: GAP can no longer speed up hydrolysis (×0.01)
  kRAF: 3, kRAFoff: 1,   // /min, RAF activation by Ras-GTP; inactivation
  V600E: 1,              // mutant BRAF activity (Ras-independent, not feedback-regulated)
  RAF_WT_FOLD: 100,      // RAF inhibitor needs 100× more drug to block Ras-driven (dimeric) RAF
  PARADOX: 0.5,          // ...and at lower doses it even boosts it (up to 1.5×): paradoxical activation
  kMEK: 2.8, KM: 0.15,    // MEK phosphorylation by RAF (V = kMEK·RAF); Km relative to total
  kMEKp: 1,              // MEK phosphatase Vmax (/min)
  kERK: 2.5, kERKp: 1,    // ERK phosphorylation by active MEK; ERK phosphatase Vmax
  TAU_F: 20, KF: 0.5, NF: 2, // feedback delay (min); ERK level for half-maximal feedback; Hill
};

/** Fraction of target inhibited by a dose given in multiples of IC50. */
export const inh = (dose: number) => dose / (dose + 1);

/** Molecules per cell for each level (illustrative, in the usual range 10⁴–10⁶). */
export const TOTALS = { R: 20000, Ras: 50000, RAF: 10000, MEK: 300000, ERK: 600000 };

// state: R, Ras, RAF(wt active), M1, M2, E1, E2, F
export type Y = Float64Array;
export const NV = 8;
export const I = { R: 0, Ras: 1, RAF: 2, M1: 3, M2: 4, E1: 5, E2: 6, F: 7 };

export interface Levels { R: number; Ras: number; RAF: number; MEK: number; ERK: number; F: number }

function drugsOn(p: Params, t: number) { return t >= p.tDrug; }

/** Active RAF (wild type, after inhibitor) + mutant BRAF activity (after inhibitor). */
export function rafActivity(p: Params, y: Y, t: number): number {
  const on = drugsOn(p, t);
  const dr = on ? p.iRAF : 0;
  const wt = y[I.RAF] * (1 + K.PARADOX * inh(dr)) * (1 - inh(dr / K.RAF_WT_FOLD));
  const mut = p.mut === "braf" ? K.V600E * (1 - inh(dr)) : 0;
  return Math.min(1, wt + mut);
}
export function mekActivity(p: Params, y: Y, t: number): number {
  return y[I.M2] * (1 - inh(drugsOn(p, t) ? p.iMEK : 0));
}

export function deriv(p: Params, y: Y, t: number, dy: Y): void {
  const on = drugsOn(p, t);
  const occ = p.gf / (p.gf + KD);
  const fb = p.feedback ? 1 / (1 + (y[I.F] / K.KF) ** K.NF) : 1;
  const R = y[I.R], Ras = y[I.Ras], RAF = y[I.RAF];
  const M1 = y[I.M1], M2 = y[I.M2], M0 = Math.max(0, 1 - M1 - M2);
  const E1 = y[I.E1], E2 = y[I.E2], E0 = Math.max(0, 1 - E1 - E2);
  const Ract = R * (1 - inh(on ? p.iRTK : 0));
  dy[I.R] = K.kR * (occ - R);
  const gap = p.mut === "ras" ? K.kGAP * K.GAP_MUT : K.kGAP;
  dy[I.Ras] = (K.kSOS * Ract * fb + K.kRasB) * (1 - Ras) - gap * Ras;
  dy[I.RAF] = K.kRAF * Ras * fb * (1 - RAF) - K.kRAFoff * RAF;
  const raf = rafActivity(p, y, t);
  const v1 = K.kMEK * raf * M0 / (K.KM + M0), v2 = K.kMEK * raf * M1 / (K.KM + M1);
  const p2 = K.kMEKp * M2 / (K.KM + M2), p1 = K.kMEKp * M1 / (K.KM + M1);
  dy[I.M1] = v1 - v2 + p2 - p1;
  dy[I.M2] = v2 - p2;
  const mek = mekActivity(p, y, t);
  const w1 = K.kERK * mek * E0 / (K.KM + E0), w2 = K.kERK * mek * E1 / (K.KM + E1);
  const q2 = K.kERKp * E2 / (K.KM + E2), q1 = K.kERKp * E1 / (K.KM + E1);
  dy[I.E1] = w1 - w2 + q2 - q1;
  dy[I.E2] = w2 - q2;
  dy[I.F] = (E2 - y[I.F]) / K.TAU_F;
}

/** Levels shown to the student: fraction of each protein in its active form. */
export function levels(p: Params, y: Y, t: number): Levels {
  return {
    R: y[I.R] * (1 - inh(drugsOn(p, t) ? p.iRTK : 0)),
    Ras: y[I.Ras],
    RAF: Math.min(1, rafActivity(p, y, t)),
    MEK: mekActivity(p, y, t),
    ERK: y[I.E2],
    F: y[I.F],
  };
}

const DT = 0.01;
function rk4(p: Params, y: Y, t: number, h: number, k: Y[]): void {
  const [k1, k2, k3, k4, tmp] = k;
  deriv(p, y, t, k1);
  for (let i = 0; i < NV; i++) tmp[i] = y[i] + h / 2 * k1[i];
  deriv(p, tmp, t + h / 2, k2);
  for (let i = 0; i < NV; i++) tmp[i] = y[i] + h / 2 * k2[i];
  deriv(p, tmp, t + h / 2, k3);
  for (let i = 0; i < NV; i++) tmp[i] = y[i] + h * k3[i];
  deriv(p, tmp, t + h, k4);
  for (let i = 0; i < NV; i++) y[i] = Math.min(1, Math.max(0, y[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])));
}
const work = () => Array.from({ length: 5 }, () => new Float64Array(NV));

/** Resting state before the growth factor: the cell with the same mutation and drugs (if
 *  added before the growth factor) but no growth factor, run to steady state. */
export function rest(p: Params): Y {
  const q: Params = { ...p, gf: 0, tDrug: p.tDrug > 0 ? 1e9 : 0 };
  const y = new Float64Array(NV);
  const k = work();
  for (let t = 0; t < 400; t += 0.05) rk4(q, y, 0, 0.05, k);
  return y;
}

/** Time course from growth factor addition at t = 0 to tEnd (min). Every `every` min a sample. */
export function timeCourse(p: Params, tEnd = 60, every = 0.25): { t: number; L: Levels }[] {
  const y = rest(p);
  const k = work();
  const out: { t: number; L: Levels }[] = [{ t: 0, L: levels(p, y, 0) }];
  const nPer = Math.round(every / DT);
  let t = 0;
  while (t < tEnd - 1e-9) {
    for (let j = 0; j < nPer; j++) { rk4(p, y, t, DT, k); t += DT; }
    out.push({ t, L: levels(p, y, t) });
  }
  return out;
}

/** Steady state with growth factor present (drugs present throughout). Averages the last
 *  stretch, in case the feedback leaves a slow damped wobble. */
export function steady(p: Params): Levels {
  const q: Params = { ...p, tDrug: 0 };
  const y = rest(q);
  const k = work();
  const h = 0.05;
  let t = 0;
  for (; t < 300; t += h) rk4(q, y, t, h, k);
  const acc: Levels = { R: 0, Ras: 0, RAF: 0, MEK: 0, ERK: 0, F: 0 };
  let n = 0;
  for (; t < 400; t += h) {
    rk4(q, y, t, h, k);
    const L = levels(q, y, t);
    for (const key of Object.keys(acc) as (keyof Levels)[]) acc[key] += L[key];
    n++;
  }
  for (const key of Object.keys(acc) as (keyof Levels)[]) acc[key] /= n;
  return acc;
}

/** Dose–response at steady state over log-spaced growth factor doses (ng/mL). */
export const GF_MIN = 0.001, GF_MAX = 100;
export function doseResponse(p: Params, n = 41): { gf: number; L: Levels }[] {
  const out: { gf: number; L: Levels }[] = [];
  for (let i = 0; i < n; i++) {
    const gf = GF_MIN * Math.pow(GF_MAX / GF_MIN, i / (n - 1));
    out.push({ gf, L: steady({ ...p, gf }) });
  }
  return out;
}

/** EC50 and Hill coefficient (from EC10 and EC90, n_H = log 81 / log(EC90/EC10)) of one level
 *  along a dose–response curve, relative to that level's own minimum and maximum. */
export function curveStats(dr: { gf: number; L: Levels }[], key: keyof Levels): { ec50: number; nH: number; lo: number; hi: number } {
  const v = dr.map(d => d.L[key]);
  const lo = Math.min(...v), hi = Math.max(...v);
  if (hi - lo < 0.02) return { ec50: NaN, nH: NaN, lo, hi };
  const at = (f: number) => {
    const target = lo + f * (hi - lo);
    for (let i = 1; i < dr.length; i++) {
      const a = v[i - 1], b = v[i];
      if ((a - target) * (b - target) <= 0 && a !== b) {
        const la = Math.log10(dr[i - 1].gf), lb = Math.log10(dr[i].gf);
        return Math.pow(10, la + (target - a) / (b - a) * (lb - la));
      }
    }
    return NaN;
  };
  const e10 = at(0.1), e50 = at(0.5), e90 = at(0.9);
  return { ec50: e50, nH: Math.log10(81) / Math.log10(e90 / e10), lo, hi };
}
