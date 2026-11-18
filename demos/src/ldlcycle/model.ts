// LDL receptor cycle and LNP escape: the numbers behind the demo. No DOM, so it can be
// bundled for Node to check the task solutions.
//
// A qualitative compartment model, with round numbers chosen so that the behaviour is
// right (receptor half-life of hours, LDL half-life in blood of about two days, drug
// effects of the right size). It is not fitted to patient data.
//
// Cell level (time in minutes): a receptor at the surface binds LDL, is taken into a
// coated pit (rate K_INT), reaches the sorting endosome, lets go of LDL if the endosome is
// acid enough, and then either recycles or goes to the lysosome. Per round trip it is
// destroyed with probability q = basal + PCSK9 term + "still holding LDL" term.
// At steady state the number at the surface is synthesis / (q · K_INT).
//
// Body level (time in days): dL/dt = production − (k0 + kR · R) · L, where L is the LDL
// cholesterol in the blood (mmol/L) and R is the number of receptors at the liver cell
// surface relative to a healthy person. R follows its target with the receptor lifetime.

export interface Settings {
  /** receptor genes: 1 healthy, 0.5 heterozygous FH, 0.02 homozygous FH */
  genes: number;
  /** PCSK9 activity relative to a healthy person (gain-of-function mutation ≈ 3) */
  pcsk9: number;
  /** PCSK9 antibody (evolocumab/alirocumab-like): binds 95 % of PCSK9 in the blood */
  antibody: boolean;
  /** statin: receptor synthesis × 2 (and PCSK9 × 1.5, also an SREBP2 target gene) */
  statin: boolean;
  /** pH in the sorting endosome (normal 6.0) */
  pH: number;
}

export const HEALTHY: Settings = { genes: 1, pcsk9: 1, antibody: false, statin: false, pH: 6.0 };

// ---- cell-level rates (per minute)
export const K_INT = 0.15;        // surface → coated pit (mean 6.7 min at the surface)
export const K_OUT = 0.33;        // leave the sorting endosome (mean 3 min)
export const T_TRANSIT = 1.5;     // minutes in vesicles per round trip (pit, travel, return)
export const K_LDL = 0.087;       // LDL binding to a free surface receptor, per min per mmol/L
export const Q_BASAL = 0.005;     // destroyed per trip without PCSK9 (lifetime ~200 trips)
export const Q_PCSK9 = 0.01;      // extra per trip at healthy PCSK9 level
export const PH_RELEASE = 6.5;    // half of the LDL lets go at this pH
export const N_RELEASE = 5;       // steepness of the release
export const ANTIBODY_FREE = 0.05;
export const STATIN_SYN = 2, STATIN_PCSK9 = 1.5;

/** Fraction of bound LDL that lets go of the receptor in the endosome. */
export function release(pH: number): number {
  return 1 / (1 + Math.pow(10, N_RELEASE * (pH - PH_RELEASE)));
}
/** Free (active) PCSK9 relative to healthy. */
export function pcsk9Free(s: Settings): number {
  return s.pcsk9 * (s.statin ? STATIN_PCSK9 : 1) * (s.antibody ? ANTIBODY_FREE : 1);
}
/** Per-minute rate at which a surface receptor picks up PCSK9 (gives Q_PCSK9 per trip). */
export function kPcsk9(s: Settings): number {
  return Q_PCSK9 * K_INT * pcsk9Free(s);
}
/** Fraction of receptors that carry LDL when they enter a pit. */
export function loaded(L: number): number {
  return K_LDL * L / (K_LDL * L + K_INT);
}
/** Probability that one round trip ends in the lysosome. */
export function qTrip(s: Settings, L: number): number {
  const pP = 1 - Math.exp(-kPcsk9(s) / K_INT);            // picked up PCSK9 at the surface
  const pStuck = loaded(L) * (1 - release(s.pH));          // still holding LDL
  return 1 - (1 - Q_BASAL) * (1 - pP) * (1 - pStuck);
}
/** Relative synthesis of working receptors. */
export function synthesis(s: Settings): number {
  return s.genes * (s.statin ? STATIN_SYN : 1);
}
/** Receptors at the surface at steady state, relative to a healthy person at L = 2.6. */
export function surfaceRel(s: Settings, L: number): number {
  return (synthesis(s) / qTrip(s, L)) / (1 / qTrip(HEALTHY, L_HEALTHY));
}
/** Mean receptor lifetime in hours. */
export function lifetimeH(s: Settings, L: number): number {
  return (1 / K_INT + 1 / K_OUT + T_TRANSIT) / qTrip(s, L) / 60;
}

// ---- body level (per day)
export const L_HEALTHY = 2.6;      // mmol/L LDL cholesterol
export const K0 = 0.05;            // clearance without LDL receptors (per day)
export const KR = 0.30;            // clearance by receptors in a healthy liver (per day)
export const PROD = (K0 + KR) * L_HEALTHY;

export interface BodyPoint { t: number; L: number; R: number }

/** Steady state of the body model (L and R solved together; q depends weakly on L). */
export function steady(s: Settings): { L: number; R: number } {
  let L = L_HEALTHY;
  for (let i = 0; i < 200; i++) {
    const R = surfaceRel(s, L);
    const Ln = PROD / (K0 + KR * R);
    if (Math.abs(Ln - L) < 1e-9) break;
    L = 0.5 * L + 0.5 * Ln;
  }
  return { L, R: surfaceRel(s, L) };
}

/** Time course over `days`, starting from the steady state of `before`, with `after` from day 0. */
export function course(before: Settings, after: Settings, days: number, dt = 0.01): BodyPoint[] {
  let { L, R } = steady(before);
  const out: BodyPoint[] = [{ t: 0, L, R }];
  const n = Math.round(days / dt), every = Math.max(1, Math.round(0.1 / dt));
  for (let i = 1; i <= n; i++) {
    const tau = lifetimeH(after, L) / 24;
    R += (surfaceRel(after, L) - R) / tau * dt;
    L += (PROD - (K0 + KR * R) * L) * dt;
    if (i % every === 0) out.push({ t: i * dt, L, R });
  }
  return out;
}

// ---- LNP tab: escape from the endosome (time in minutes)
export const PH_BLOOD = 7.4;
export const TAU_ACID = 8;          // endosome pH falls towards its final value with this time constant
export const K_LYS = 1 / 25;        // endosome contents handed on to the lysosome (per min)
export const K_ESC = 0.0024;        // escape rate when all ionisable lipid is charged (per min)
export const HILL_ESC = 2;          // membrane disruption needs several charged lipids together
export const CHARGE_TOXIC = 0.1;    // charged fraction at pH 7.4 that halves delivery

/** Fraction of ionisable lipid that carries a + charge at this pH (Henderson–Hasselbalch). */
export function charged(pH: number, pKa: number): number {
  return 1 / (1 + Math.pow(10, pH - pKa));
}
/** Endosome pH at time t (min) after uptake, falling from 7.4 to pHend. */
export function endoPH(t: number, pHend: number): number {
  return pHend + (PH_BLOOD - pHend) * Math.exp(-t / TAU_ACID);
}
/** Escape rate per particle (per min) at endosome pH. */
export function escRate(pH: number, pKa: number): number {
  return K_ESC * Math.pow(charged(pH, pKa), HILL_ESC);
}
/** Fraction of the dose that reaches cells: a particle charged in blood sticks to blood
 *  proteins and cells and is cleared (and is more toxic). */
export function reachCells(pKa: number): number {
  const c = charged(PH_BLOOD, pKa) / CHARGE_TOXIC;
  return 1 / (1 + c * c);
}

export interface LnpResult { escape: number; lysosome: number; cytosol: number; reach: number }

/** Fate of particles taken up into endosomes (deterministic). */
export function lnpFate(pKa: number, pHend: number, minutes = 240, dt = 0.05): LnpResult {
  let inEndo = 1, esc = 0, lys = 0;
  for (let t = 0; t < minutes; t += dt) {
    const e = escRate(endoPH(t, pHend), pKa) * inEndo * dt, l = K_LYS * inEndo * dt;
    inEndo -= e + l; esc += e; lys += l;
  }
  const reach = reachCells(pKa);
  return { escape: esc, lysosome: lys + inEndo, cytosol: reach * esc, reach };
}
