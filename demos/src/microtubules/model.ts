// Dynamic instability, two-state model (Dogterom & Leibler 1993), and the diffusion
// vs motor race. No DOM here, so the numbers can be checked in Node.
//
// Each microtubule (MT) grows from the centrosome at speed vg or shrinks at speed vs.
// It switches growing -> shrinking (catastrophe) with rate fcat and shrinking ->
// growing (rescue) with rate fres. A MT that shrinks back to the centrosome is
// re-nucleated (starts growing again) at rate fnuc. A MT that reaches the cell edge
// stops there and has a higher catastrophe rate (it pushes on the cortex).
// Illustrative rates chosen to resemble an interphase cell (growth ~12 µm/min at
// 10 µM free tubulin, shrinkage ~24 µm/min); the free tubulin is held constant.
import { rng } from "../lib/ui";

export interface Drugs { taxol: boolean; vinblastine: boolean }

export interface Rates {
  vg: number;    // growth speed, µm/s
  vs: number;    // shrinkage speed, µm/s
  fcat: number;  // catastrophe frequency, 1/s
  fres: number;  // rescue frequency, 1/s
  fedge: number; // catastrophe frequency of an end stalled at the cell edge, 1/s
}

export const C_CRIT = 1;        // µM free tubulin below which an end does not grow
export const K_ON = 0.2 / 9;    // µm/s per µM above C_CRIT (0.2 µm/s at 10 µM)
export const VS = 0.4;          // µm/s
export const FCAT0 = 0.09;      // 1/s, catastrophe frequency of a slowly growing end
export const V_HALF = 0.1;      // µm/s: faster growth = bigger GTP cap = fewer catastrophes
export const FRES = 0.03;       // 1/s
export const FNUC = 0.2;        // 1/s, new MT from an empty nucleation site
export const EDGE_CAT = 0.05;   // 1/s, catastrophe of an end stalled at the cell edge
export const CELL_R = 25;       // µm, centrosome to cell edge

/** The four parameters for a free tubulin concentration c (µM) and drugs. */
export function rates(c: number, d: Drugs): Rates {
  let vg = Math.max(0, K_ON * (c - C_CRIT));
  let vs = VS, fres = FRES, fedge = EDGE_CAT;
  let fcat = FCAT0 / (1 + vg / V_HALF);
  if (d.vinblastine) {           // binds the plus end: growth almost stops, ends fall apart more often
    vg *= 0.1;
    fcat = Math.max(fcat, FCAT0 / (1 + vg / V_HALF)) * 1.5;
  }
  if (d.taxol) {                 // binds inside the lattice: stabilises it
    fcat *= 0.1; vs *= 0.3; fres *= 5; fedge *= 0.1;
  }
  return { vg, vs, fcat, fres, fedge };
}

/** Dogterom–Leibler: mean drift J (µm/s) and, if J < 0, the mean length (µm). */
export function dl(r: Rates): { J: number; mean: number } {
  const J = (r.vg * r.fres - r.vs * r.fcat) / (r.fcat + r.fres);
  const den = r.vs * r.fcat - r.vg * r.fres;
  return { J, mean: den > 0 ? r.vg * r.vs / den : Infinity };
}

export interface MT { angle: number; L: number; grow: boolean; atEdge: boolean }

export class DynSim {
  mts: MT[] = [];
  t = 0;
  cats = 0; rescues = 0; nucs = 0;
  r: Rates;
  private u: () => number;
  constructor(public n: number, public c: number, public drugs: Drugs, seed = 1) {
    const R = rng(seed); this.u = R.unif;
    for (let i = 0; i < n; i++) {
      const angle = (i + 0.35 * (R.unif() - 0.5)) / n * 2 * Math.PI;
      this.mts.push({ angle, L: 0, grow: true, atEdge: false });
    }
    this.r = rates(c, drugs);
  }
  set(c: number, drugs: Drugs): void { this.c = c; this.drugs = drugs; this.r = rates(c, drugs); }
  resetCounts(): void { this.cats = 0; this.rescues = 0; this.nucs = 0; }
  /** Advance by dt seconds (dt <= 1 s keeps the event probabilities small). */
  step(dt: number): void {
    const { vg, vs, fcat, fres, fedge } = this.r;
    const p = (f: number) => 1 - Math.exp(-f * dt);
    for (const m of this.mts) {
      if (m.grow) {
        if (m.L <= 0 && vg <= 0) continue;
        const f = m.atEdge ? Math.max(fcat, fedge) : fcat;
        if (this.u() < p(f) && m.L > 0) { m.grow = false; m.atEdge = false; this.cats++; continue; }
        m.L += vg * dt;
        if (m.L >= CELL_R) { m.L = CELL_R; m.atEdge = true; }
      } else {
        if (m.L <= 0) {                       // empty site at the centrosome: wait for a new MT
          if (this.u() < p(FNUC)) { m.grow = true; this.nucs++; }
          continue;
        }
        if (this.u() < p(fres)) { m.grow = true; this.rescues++; continue; }
        m.L -= vs * dt;
        if (m.L <= 0) m.L = 0;
      }
    }
    this.t += dt;
  }
  meanLength(): number { let s = 0; for (const m of this.mts) s += m.L; return s / this.mts.length; }
  atEdge(): number { let k = 0; for (const m of this.mts) if (m.L >= CELL_R - 1e-9) k++; return k; }
  growing(): number { let k = 0; for (const m of this.mts) if (m.grow && m.L > 0) k++; return k; }
}

// ---------- tab 2: diffusion vs motor

export const STEP_NM = 8;                 // kinesin step, one ATP per step
export const CARGO = {
  protein: { name: "a protein", D: 5 },   // µm²/s in cytoplasm
  vesicle: { name: "a vesicle (100 nm)", D: 0.1 },
} as const;
export type CargoKey = keyof typeof CARGO;

/** Mean time to diffuse distance x (µm) along a line (1D, reflecting start): x²/2D. */
export const tDiff = (x: number, D: number) => x * x / (2 * D);
/** Time for a motor at speed v (µm/s). */
export const tMotor = (x: number, v: number) => x / v;
/** Distance where diffusion and the motor take equally long: 2D/v. */
export const crossover = (D: number, v: number) => 2 * D / v;

/** Human-readable duration. */
export function fmtDur(s: number): string {
  if (!isFinite(s)) return "never";
  if (s < 1) return (s < 0.01 ? s.toExponential(0) : s.toPrecision(2)) + " s";
  if (s < 120) return (s < 10 ? s.toFixed(1) : s.toFixed(0)) + " s";
  if (s < 7200) return (s / 60).toFixed(s < 600 ? 1 : 0) + " min";
  if (s < 2 * 86400) return (s / 3600).toFixed(s < 36000 ? 1 : 0) + " h";
  if (s < 2 * 365.25 * 86400) return (s / 86400).toFixed(s < 864000 ? 1 : 0) + " days";
  const y = s / (365.25 * 86400);
  if (y < 1e4) return Math.round(y).toLocaleString("en-US") + " years";
  const [m, e] = y.toExponential(1).split("e+");
  return m + "×10" + [...e].map(ch => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+ch]).join("") + " years";
}

/** 1D diffusion of a cloud of particles from 0 with a reflecting wall at 0. */
export class Cloud {
  x: Float64Array; arrived: Uint8Array; firstArrival = -1; t = 0;
  private g: () => number;
  constructor(public n: number, public D: number, public target: number, seed = 3) {
    this.x = new Float64Array(n); this.arrived = new Uint8Array(n);
    const R = rng(seed); this.g = R.norm;
  }
  step(dt: number): void {
    const s = Math.sqrt(2 * this.D * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.arrived[i]) continue;
      let x = Math.abs(this.x[i] + s * this.g());
      if (x >= this.target) { x = this.target; this.arrived[i] = 1; if (this.firstArrival < 0) this.firstArrival = this.t + dt; }
      this.x[i] = x;
    }
    this.t += dt;
  }
  nArrived(): number { let k = 0; for (let i = 0; i < this.n; i++) k += this.arrived[i]; return k; }
}
