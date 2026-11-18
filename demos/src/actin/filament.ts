// Tab 1 of the actin demo: one actin filament in a large pool of G-actin.
// Pure model code (no DOM), so it can be bundled for Node to check the numbers.
//
// Model: each end has one on-rate constant and one off-rate (Pollard 1986, ATP-actin:
// barbed 11.6 µM⁻¹s⁻¹ and 1.4 s⁻¹, pointed 1.3 µM⁻¹s⁻¹ and 0.8 s⁻¹), so the critical
// concentrations are about 0.12 µM (barbed) and 0.6 µM (pointed). In a real filament the
// two ends differ only because ATP is hydrolysed after a subunit joins; the model
// summarises that as one rate pair per end. Hydrolysis (ATP → ADP-Pi → ADP) is simulated
// for the colours but does not change the rates. Events are drawn with the Gillespie
// algorithm, so growth is stochastic, one subunit at a time.
import { rng } from "../lib/ui";

export const KON_B = 11.6, KOFF_B = 1.4;   // barbed (plus) end
export const KON_P = 1.3, KOFF_P = 0.8;    // pointed (minus) end
export const CC_B = KOFF_B / KON_B, CC_P = KOFF_P / KON_P;
export const K_HYD = 0.3;                  // ATP → ADP-Pi, per s (t½ ≈ 2 s)
export const K_PI = 0.006;                 // Pi release, per s (t½ ≈ 2 min)
export const NM_PER_SUB = 2.7;             // filament grows 2.7 nm per subunit
export const LAT_KD = 0.2;                 // latrunculin A · G-actin, µM
export const PHALLOIDIN_OFF = 0.02;        // factor on off-rates with phalloidin
export const SPECKLE_P = 0.04;             // fraction of subunits that carry a dye (speckles)

export interface Drugs {
  capping: boolean;      // capping protein on the barbed end
  cytoD: boolean;        // cytochalasin D: also blocks the barbed end
  phalloidin: boolean;   // stabilises: off-rates almost zero
  lat: number;           // latrunculin, µM total
}
export const NO_DRUGS: Drugs = { capping: false, cytoD: false, phalloidin: false, lat: 0 };

/** Free G-actin (µM) when `ctot` µM actin monomer meets `lat` µM latrunculin (1:1, Kd 0.2 µM). */
export function freeActin(ctot: number, lat: number): number {
  if (lat <= 0) return ctot;
  const b = ctot - lat - LAT_KD;
  return (b + Math.sqrt(b * b + 4 * LAT_KD * ctot)) / 2;
}

export interface Rates { bOn: number; bOff: number; pOn: number; pOff: number; barbedBlocked: boolean }

/** Event rates (per s) at each end for free G-actin `c` µM. */
export function rates(c: number, d: Drugs): Rates {
  const blocked = d.capping || d.cytoD;
  const f = d.phalloidin ? PHALLOIDIN_OFF : 1;
  return {
    bOn: blocked ? 0 : KON_B * c, bOff: blocked ? 0 : KOFF_B * f,
    pOn: KON_P * c, pOff: KOFF_P * f, barbedBlocked: blocked,
  };
}

/** Net elongation (subunits/s) at each end, and the whole filament. */
export function netRates(c: number, d: Drugs) {
  const r = rates(c, d);
  const b = r.bOn - r.bOff, p = r.pOn - r.pOff;
  return { barbed: b, pointed: p, total: b + p };
}

export type Verdict = "grows" | "treadmills" | "shrinks" | "stable";
/** grows: both ends gain (or one gains, the other is blocked); shrinks: both lose;
 *  treadmills: the barbed end gains while the pointed end loses. */
export function verdict(c: number, d: Drugs): Verdict {
  const n = netRates(c, d), e = 0.02;
  const b = Math.abs(n.barbed) < e ? 0 : Math.sign(n.barbed), p = Math.abs(n.pointed) < e ? 0 : Math.sign(n.pointed);
  if (b > 0 && p < 0) return "treadmills";
  if (b >= 0 && p >= 0 && b + p > 0) return "grows";
  if (b <= 0 && p <= 0 && b + p < 0) return "shrinks";
  return "stable";
}

/** Concentration where the whole filament neither grows nor shrinks (steady-state treadmilling). */
export const C_SS = (KOFF_B + KOFF_P) / (KON_B + KON_P);

export interface Subunit { born: number; tHyd: number; tPi: number; speckle: boolean }

export class Filament {
  /** subunits from the pointed end (index 0) to the barbed end */
  subs: Subunit[] = [];
  /** lab-frame position (in subunits) of the pointed end; subunit i sits at p0 + i */
  p0 = 0;
  t = 0;
  private r: ReturnType<typeof rng>;
  /** counts of events, for measured rates */
  addedB = 0; lostB = 0; addedP = 0; lostP = 0;

  constructor(n0: number, seed = 1) {
    this.r = rng(seed);
    this.p0 = -Math.floor(n0 / 2);
    for (let i = 0; i < n0; i++) {
      // an older filament: all ADP, born long ago
      this.subs.push({ born: -1000, tHyd: -999, tPi: -900, speckle: this.r.unif() < SPECKLE_P });
    }
  }
  get length(): number { return this.subs.length; }
  get barbedPos(): number { return this.p0 + this.subs.length; }

  private newSub(): Subunit {
    const u = this.r.unif;
    const tHyd = this.t - Math.log(1 - u()) / K_HYD;
    return { born: this.t, tHyd, tPi: tHyd - Math.log(1 - u()) / K_PI, speckle: u() < SPECKLE_P };
  }

  /** advance by dt seconds with free G-actin c µM */
  step(dt: number, c: number, d: Drugs): void {
    const r = rates(c, d);
    const end = this.t + dt;
    for (;;) {
      if (this.subs.length === 0) { this.t = end; return; }
      const a1 = r.bOn, a2 = r.bOff, a3 = r.pOn, a4 = r.pOff;
      const a = a1 + a2 + a3 + a4;
      if (a <= 0) { this.t = end; return; }
      const tau = -Math.log(1 - this.r.unif()) / a;
      if (this.t + tau > end) { this.t = end; return; }
      this.t += tau;
      const x = this.r.unif() * a;
      if (x < a1) { this.subs.push(this.newSub()); this.addedB++; }
      else if (x < a1 + a2) { this.subs.pop(); this.lostB++; }
      else if (x < a1 + a2 + a3) { this.subs.unshift(this.newSub()); this.p0--; this.addedP++; }
      else { this.subs.shift(); this.p0++; this.lostP++; }
    }
  }
}

/** nucleotide state of a subunit at time t: 0 ATP, 1 ADP-Pi, 2 ADP */
export function nucleotide(s: Subunit, t: number): 0 | 1 | 2 {
  return t < s.tHyd ? 0 : t < s.tPi ? 1 : 2;
}
