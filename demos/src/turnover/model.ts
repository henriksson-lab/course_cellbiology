// Protein turnover: the exact solution of dP/dt = k_s − k_d·P for two proteins (a target
// and a bystander), piecewise: one set of rates before the drugs are added, another after.
// No DOM, so it can be bundled for Node to check the numbers in the tasks.
//
// Simplifications (stated on the demo page):
//  - synthesis is a constant rate (zero order); degradation is first order (each molecule
//    has the same chance per hour to be destroyed, whatever its age);
//  - a fixed share F_PROT of each protein's own degradation goes through the proteasome,
//    the rest through lysosomes (not touched by bortezomib);
//  - drugs act at once and fully at the moment they are added;
//  - dilution by cell growth (optional) acts like extra first-order loss.

export interface Prot { ks: number; thalf: number }   // molecules per hour; half-life in hours (degradation only)
export interface Setup {
  target: Prot; bystander: Prot;
  start: "zero" | "steady";    // P(0) = 0 (gene switched on at t = 0) or the steady state
  chx: boolean;                // cycloheximide: all synthesis stops
  btz: boolean; btzBlock: number;      // bortezomib: fraction of proteasome activity blocked (0–1)
  protac: boolean; kProtac: number;    // PROTAC: extra degradation of the target only (per hour)
  tAdd: number;                // hours: when the drugs are added
  divide: boolean;             // dividing cells: dilution with doubling time DOUBLING
}

export const LN2 = Math.LN2;
export const F_PROT = 0.9;     // share of a protein's own degradation done by the proteasome
export const DOUBLING = 24;    // hours, cell doubling time when "dividing" is on

export type Which = "target" | "bystander";
export interface Rates { ks: number; kd: number; kProt: number; kOther: number; kDil: number }

/** Rates before (after = false) or after the drugs are added. */
export function rates(s: Setup, w: Which, after: boolean): Rates {
  const p = s[w];
  const kdeg = LN2 / p.thalf;
  const kDil = s.divide ? LN2 / DOUBLING : 0;
  const drugs = after && (s.chx || s.btz || s.protac);
  const left = drugs && s.btz ? 1 - s.btzBlock : 1;           // proteasome activity left
  let kProt = F_PROT * kdeg * left;
  if (drugs && s.protac && w === "target") kProt += s.kProtac * left;  // PROTAC needs the proteasome too
  const kOther = (1 - F_PROT) * kdeg;
  const ks = drugs && s.chx ? 0 : p.ks;
  return { ks, kd: kProt + kOther + kDil, kProt, kOther, kDil };
}

export const steady = (r: Rates) => r.ks / r.kd;
export const halfLife = (r: Rates) => LN2 / r.kd;

/** Amount at t = 0. */
export function p0(s: Setup, w: Which): number {
  return s.start === "zero" ? 0 : steady(rates(s, w, false));
}

/** Exact amount (molecules per cell) at time t (hours). */
export function amount(s: Setup, w: Which, t: number): number {
  const r1 = rates(s, w, false);
  const a = p0(s, w);
  const before = (u: number) => steady(r1) + (a - steady(r1)) * Math.exp(-r1.kd * u);
  if (t <= s.tAdd) return before(t);
  const r2 = rates(s, w, true);
  const b = before(s.tAdd);
  return steady(r2) + (b - steady(r2)) * Math.exp(-r2.kd * (t - s.tAdd));
}

/** Time for a first-order approach to cover a fraction f of the way (e.g. 0.9). */
export const timeToFraction = (r: Rates, f: number) => -Math.log(1 - f) / r.kd;
