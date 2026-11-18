// Cell-cycle clock: a population of cells, each with a small set of differential equations
// for its control system, driven through the phases G1 → S → G2 → M → division.
// No DOM here, so the model can be bundled for Node to check the numbers in the tasks.
//
// Per cell (time in hours, levels scaled 0–1, illustrative parameters):
//   G1: mitogens → cyclin D (short-lived) → CDK4/6 → Rb phosphorylation → E2F free →
//       cyclin E → CDK2 → more Rb phosphorylation (positive feedback). Once cyclin E–CDK2
//       carries Rb phosphorylation on its own, the cell no longer needs mitogens: the
//       restriction point. S starts when cyclin E–CDK2 activity passes a threshold.
//   S:  DNA content rises from 2N to 4N; SCF destroys cyclin E; cyclin A is made.
//   G2: cyclin B is made; entry into M is blocked while there is DNA damage (Chk1/2).
//   M:  APC/C–Cdc20 destroys cyclin A, then (at anaphase) cyclin B; the spindle
//       checkpoint holds APC/C off while a spindle poison is present. Then division.
//   DNA damage → p53 (stabilised) → p21, a CDK inhibitor that blocks CDK4/6 and CDK2 (G1
//   arrest); damage also blocks G2/M directly (Chk1/2 → Cdc25), with or without p53.
//   FUCCI: red = Cdt1 fragment, destroyed by SCF/CRL4 in S, G2, M; green = geminin
//   fragment, destroyed by APC/C from anaphase until the end of G1.
// Simplified: one CDK activity per cyclin, no Cdc25/Wee1 feedback loop written out, no
// apoptosis or senescence, no cell size, no contact inhibition, cells never die.

import { rng } from "../lib/ui";

export type Phase = "G1" | "S" | "G2" | "M";

export interface Params {
  mitogen: number;     // 0–1, growth factors in the medium (serum)
  cdk46inh: number;    // 0–1, fraction of CDK4/6 blocked (palbociclib)
  spindlePoison: boolean;
  p53lost: boolean;
  rbLost: boolean;
}

export const DEFAULTS: Params = { mitogen: 1, cdk46inh: 0, spindlePoison: false, p53lost: false, rbLost: false };

/** Mean phase lengths (h) of a typical human cell line in culture (G1 emerges from the ODEs). */
export const S_H = 8, G2_H = 4, M_H = 1;
export const MAX_CELLS = 1200;

export interface Cell {
  id: number;
  phase: Phase;
  t: number;          // hours in the current phase
  sDur: number; g2Dur: number; mDur: number;
  prog: number;       // progress through S (0–1)
  k46: number;        // cell's own CDK4/6 strength (cell-to-cell variation)
  // molecules (0–1 scale)
  D: number; E: number; A: number; B: number; Rbp: number;
  dmg: number; p53: number; p21: number;
  red: number; green: number;
  noise: number;      // fixed measurement error of this cell's DNA stain (flow cytometer)
  x: number; y: number; ang: number;
  birth: number;      // time of birth (h)
}

const TAU_D = 0.5;      // cyclin D half-life is short (~30 min)
const TAU_E_G1 = 2;     // cyclin E lifetime in G1
const TAU_E_S = 0.7;    // cyclin E destroyed by SCF once S has started
const K46 = 0.16, K2 = 0.6, KPH = 0.25;   // Rb phosphorylation by CDK4/6, CDK2; phosphatase
const E_SYN = 0.9, E_J = 0.55;            // cyclin E made by E2F (steep sigmoid: positive feedback)
const EJ4 = E_J ** 4;
const E_START_S = 0.62;                   // cyclin E–CDK2 activity that fires replication
const KI21 = 0.25;                        // p21 that halves CDK activity
const TAU_REPAIR = 5;                     // DNA repair time constant (h)
const DMG_G2_HALF = 0.15;                 // damage that halves G2 progress (Chk1/2)

const RED_SYN = 0.5, GREEN_SYN = 1;      // FUCCI reporter synthesis (constant promoter)
export const FUCCI_ON = 0.8;              // reporter level a microscopist would call "on"

export const R_POINT = 0.33; // Rb phosphorylation above which cyclin E–CDK2 keeps it going alone (unstable point of the loop)

export class Population {
  cells: Cell[] = [];
  t = 0;              // hours since start
  nextId = 1;
  passaged = 0;
  p: Params;
  private r: ReturnType<typeof rng>;
  readonly W: number; readonly H: number;

  constructor(p: Params, seed = 1, n0 = 300, W = 560, H = 420) {
    this.p = p; this.W = W; this.H = H;
    this.r = rng(seed);
    this.reset(seed, n0);
  }

  reset(seed: number, n0 = 300): void {
    this.r = rng(seed);
    this.cells = []; this.t = 0; this.nextId = 1; this.passaged = 0;
    // Start from an asynchronous culture: each cell is run alone from birth for a random
    // age, drawn from the age distribution of an exponentially growing culture
    // (density ∝ 2^(−age/T)); a division on the way just restarts it as a daughter.
    const keep = this.p;
    this.p = { ...DEFAULTS };
    const T = 21;
    for (let i = 0; i < n0; i++) {
      const c = this.newCell(12 + this.r.unif() * (this.W - 24), 12 + this.r.unif() * (this.H - 24));
      const age = -T * Math.log2(1 - this.r.unif() / 2);
      this.advanceCell(c, age, 0.05);
      c.birth = -c.t;
      this.cells.push(c);
    }
    this.nextId = n0 + 1;
    this.p = keep;
  }

  private newCell(x: number, y: number): Cell {
    const r = this.r;
    const ln = (cv: number) => Math.exp(cv * r.norm() - cv * cv / 2);
    return {
      id: this.nextId++, phase: "G1", t: 0,
      sDur: S_H * ln(0.12), g2Dur: G2_H * ln(0.2), mDur: M_H * ln(0.15), prog: 0,
      k46: K46 * ln(0.3),
      D: this.p.mitogen, E: 0, A: 0, B: 0, Rbp: 0,
      dmg: 0, p53: 0, p21: 0, red: 0, green: 0,
      noise: 0.035 * r.norm(),
      x, y, ang: r.unif() * Math.PI, birth: this.t,
    };
  }

  /** Advance the whole population by `h` hours (sub-steps of at most dt). */
  step(h: number, dt = 0.02): void {
    let left = h;
    while (left > 1e-9) {
      const d = Math.min(dt, left);
      const born: Cell[] = [];
      for (const c of this.cells) {
        const kid = this.advanceCell(c, d, d);
        if (kid) born.push(kid);
      }
      if (born.length) this.cells.push(...born);
      this.t += d; left -= d;
      if (this.cells.length > MAX_CELLS) this.passage();
    }
  }

  /** Split the culture: keep a random half, as when cells are passaged into a new dish. */
  passage(): void {
    const keep: Cell[] = [];
    for (const c of this.cells) if (this.r.unif() < 0.5) keep.push(c);
    this.cells = keep;
    this.passaged++;
  }

  /** Give every cell a dose of DNA damage (arbitrary units; 1 ≈ a moderate X-ray dose). */
  irradiate(dose: number): void {
    for (const c of this.cells) c.dmg += dose;
  }

  /** Advance one cell; returns a daughter if it divided. */
  advanceCell(c: Cell, h: number, dt: number): Cell | null {
    let kid: Cell | null = null;
    let left = h;
    while (left > 1e-9) {
      const d = Math.min(dt, left);
      kid = this.tick(c, d) || kid;
      left -= d;
    }
    return kid;
  }

  private tick(c: Cell, dt: number): Cell | null {
    const p = this.p;
    c.t += dt;
    // DNA damage, p53, p21 (all phases)
    c.dmg -= c.dmg / TAU_REPAIR * dt;
    const sense = c.dmg / (0.1 + c.dmg);
    c.p53 += ((p.p53lost ? 0 : 1.5 * sense) - c.p53 / 0.5) * dt;   // MDM2 keeps p53 short-lived
    c.p21 += (1.2 * c.p53 - c.p21 / 1.0) * dt;
    const free = 1 / (1 + c.p21 / KI21);                           // CDK activity left by p21
    // cyclin D follows mitogens in every phase (it matters in G1)
    c.D += (p.mitogen - c.D) / TAU_D * dt;
    const a46 = c.D * (1 - p.cdk46inh) * free;

    let kid: Cell | null = null;
    switch (c.phase) {
      case "G1": {
        const aE = c.E * free;
        c.Rbp += (c.k46 * a46 + K2 * aE) * (1 - c.Rbp) * dt - KPH * c.Rbp * dt;
        // without Rb, nothing holds E2F back: it is free from the start of G1, whatever
        // CDK4/6 does (other pocket proteins still dampen it a little, so not fully on)
        if (p.rbLost) c.Rbp = 0;
        const e2f = p.rbLost ? 0.5 : c.Rbp;
        const e4 = e2f * e2f * e2f * e2f;
        c.E += (E_SYN * e4 / (EJ4 + e4) - c.E / TAU_E_G1) * dt;
        c.A += (-c.A / 0.5) * dt; c.B += (-c.B / 0.3) * dt;
        if (aE > E_START_S) { c.phase = "S"; c.t = 0; c.prog = 0; }
        break;
      }
      case "S": {
        c.E += (-c.E / TAU_E_S) * dt;
        c.A += (0.12 * (1 - c.A)) * dt;
        c.Rbp += (1 - c.Rbp) * dt;
        // damage slows replication (intra-S checkpoint)
        c.prog += dt / c.sDur / (1 + 4 * c.dmg);
        if (c.prog >= 1) { c.prog = 1; c.phase = "G2"; c.t = 0; }
        break;
      }
      case "G2": {
        c.E += (-c.E / TAU_E_S) * dt;
        c.A += (0.25 * (1 - c.A)) * dt;
        c.B += (0.3 * (1 - c.B)) * dt;
        c.Rbp += (1 - c.Rbp) * dt;
        // the G2 timer runs slowly while damage is present (Chk1/2 → Cdc25 off), with or without p53
        const go = 1 / (1 + Math.pow(c.dmg / DMG_G2_HALF, 2)) * free;
        c.prog += dt / c.g2Dur * go;  // prog reused: 1 → 2 through G2
        if (c.prog >= 2) { c.phase = "M"; c.t = 0; c.prog = 2; }
        break;
      }
      case "M": {
        // APC/C–Cdc20: cyclin A goes in prometaphase; cyclin B at anaphase, unless the spindle checkpoint is on
        c.A += (-c.A / 0.15) * dt;
        const anaphaseAt = 0.6 * c.mDur;
        if (p.spindlePoison && c.t > 0.3 * c.mDur && c.t < anaphaseAt) c.t = Math.min(c.t, 0.3 * c.mDur + 1e-6);
        if (c.t >= anaphaseAt) c.B += (-c.B / 0.08) * dt;
        else c.B += (0.3 * (1 - c.B)) * dt;
        if (c.t >= c.mDur) kid = this.divide(c);
        break;
      }
    }
    // FUCCI reporters
    const scf = c.phase === "S" || c.phase === "G2" || c.phase === "M";
    const apcc = (c.phase === "M" && c.t >= 0.6 * c.mDur) || (c.phase === "G1" && c.E * free < 0.45);
    c.red += (RED_SYN - (scf ? (c.phase === "S" ? 1.5 : 4) : 0.12) * c.red) * dt;
    c.green += (GREEN_SYN - (apcc ? 4 : 0.12) * c.green) * dt;
    return kid;
  }

  private divide(c: Cell): Cell {
    // the mother becomes daughter 1, a new cell daughter 2; each gets half of the reporters
    const k = this.newCell(c.x, c.y);
    const a = c.ang, off = 4;
    k.x = clamp(c.x + off * Math.cos(a), 6, this.W - 6); k.y = clamp(c.y + off * Math.sin(a), 6, this.H - 6);
    c.x = clamp(c.x - off * Math.cos(a), 6, this.W - 6); c.y = clamp(c.y - off * Math.sin(a), 6, this.H - 6);
    for (const cell of [c, k]) {
      cell.phase = "G1"; cell.t = 0; cell.prog = 0;
      cell.E = 0; cell.A = 0; cell.B = c.B; cell.Rbp = 0;  // phosphatases reset Rb at mitotic exit
      cell.D = c.D; cell.dmg = c.dmg; cell.p53 = c.p53; cell.p21 = c.p21;
      cell.red = c.red / 2; cell.green = c.green / 2;
      cell.birth = this.t;
      cell.ang = this.r.unif() * Math.PI;
    }
    k.noise = 0.035 * this.r.norm();
    // a fresh G2, S, M length for the mother too
    const ln = (cv: number) => Math.exp(cv * this.r.norm() - cv * cv / 2);
    c.sDur = S_H * ln(0.12); c.g2Dur = G2_H * ln(0.2); c.mDur = M_H * ln(0.15);
    c.k46 = K46 * ln(0.3);
    // small drift so the dish fills
    for (const cell of [c, k]) {
      cell.x = clamp(cell.x + 6 * this.r.norm(), 6, this.W - 6);
      cell.y = clamp(cell.y + 6 * this.r.norm(), 6, this.H - 6);
    }
    return k;
  }

  /** DNA content of a cell in units of N (2 = one diploid genome, 4 = after replication). */
  static dna(c: Cell): number {
    if (c.phase === "G1") return 2;
    if (c.phase === "S") return 2 + 2 * c.prog;
    return 4;
  }

  /** Measured DNA stain (flow cytometer channel; 2N ≈ 200, 4N ≈ 400). */
  static stain(c: Cell): number {
    return 100 * Population.dna(c) * (1 + c.noise);
  }

  /** FUCCI colour class of a cell, as a microscopist would call it. */
  static fucci(c: Cell): "red" | "yellow" | "green" | "dark" {
    const r = c.red > FUCCI_ON, g = c.green > FUCCI_ON;
    return r && g ? "yellow" : r ? "red" : g ? "green" : "dark";
  }

  /** Fractions by DNA content gates, as read from a flow histogram. */
  gates(): { g1: number; s: number; g2m: number } {
    let g1 = 0, s = 0, g2m = 0;
    for (const c of this.cells) {
      const v = Population.stain(c);
      if (v < 230) g1++; else if (v < 370) s++; else g2m++;
    }
    const n = Math.max(1, this.cells.length);
    return { g1: g1 / n, s: s / n, g2m: g2m / n };
  }

  phaseFractions(): Record<Phase, number> {
    const f: Record<Phase, number> = { G1: 0, S: 0, G2: 0, M: 0 };
    for (const c of this.cells) f[c.phase]++;
    const n = Math.max(1, this.cells.length);
    for (const k of Object.keys(f) as Phase[]) f[k] /= n;
    return f;
  }

  /** Total cells as if never passaged (cell number, for growth curves). */
  totalCells(): number { return this.cells.length * Math.pow(2, this.passaged); }
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
