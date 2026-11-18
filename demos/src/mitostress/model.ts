// Mito stress test: a qualitative proton-circuit model with the real assay logic.
// No DOM here, so the numbers can be checked in Node (bundle with esbuild).
//
// One variable, the proton-motive force Δp (mV). Four proton currents across the inner
// membrane, all in the same arbitrary units (H⁺ per time):
//   pump   = H_PER_O · electron flux. The electron transport chain (complexes I, III, IV)
//            slows down when Δp is high ("back-pressure", respiratory control).
//   atp    = through ATP synthase. Proportional to Δp − E_ATP, where E_ATP is the Δp at
//            which ATP synthesis is at equilibrium; it runs in reverse (ATP hydrolysis,
//            pumping H⁺ out) when Δp falls below E_ATP, up to a limit.
//   leak   = through the bilayer and leaky proteins; rises steeply with Δp.
//   unc    = through an uncoupler (FCCP, DNP): a proton shuttle, current ∝ Δp.
// Steady state: pump = atp + leak + unc. Oxygen use = electron flux (+ non-mitochondrial
// O₂ use). All parameters are illustrative, chosen so that a healthy cell gives a
// typical Seahorse trace; they are not measured values.

export type Drug = "oligo" | "unc" | "rotaa";

export interface Cell {
  /** capacity of the electron transport chain (1 = healthy) */
  etc: number;
  /** ATP demand of the cell (1 = resting cell in culture) */
  demand: number;
  /** basal leak conductance (1 = normal) */
  leak: number;
  /** non-mitochondrial O₂ use, pmol O₂/min */
  nonMito: number;
}

export interface Drugs { oligo: boolean; unc: boolean; rotaa: boolean }

export const NO_DRUGS: Drugs = { oligo: false, unc: false, rotaa: false };

// --- parameters (illustrative)
const VMAX = 230;        // maximal electron flux, in pmol O₂/min per well
const P_HALF = 180;      // Δp (mV) at which the chain runs at half speed
const P_SLOPE = 9.3;      // steepness of back-pressure (mV)
export const H_PER_O = 20;      // H⁺ pumped per O₂ (two NADH): 2 × (4 + 4 + 2)
const K_ATP = 37.2;      // ATP synthase conductance, × demand (H⁺ units per mV)
export const E_ATP = 150;       // Δp (mV) where ATP synthesis is at equilibrium
const REV_MAX = 320;     // largest reverse (ATP hydrolysis) current, × demand
const L0 = 400;          // leak current at Δp = 185 mV (H⁺ units), × cell.leak
const L_SLOPE = 80;      // the leak rises faster than in proportion to Δp
const K_UNC = 40;        // uncoupler conductance (H⁺ units per mV), optimal dose
export const DPSI_FRACTION = 0.85; // part of Δp that is voltage (Δψ); the rest is ΔpH
/** H⁺ needed per ATP delivered to the cytosol: 8 c-subunits / 3 ATP + 1 for transport */
export const H_PER_ATP = 8 / 3 + 1;

export interface Fluxes {
  dp: number;        // proton-motive force, mV
  dpsi: number;      // membrane potential, mV (matrix negative, reported as a negative number)
  e: number;         // electron flux = mitochondrial O₂ use, pmol O₂/min
  pump: number;      // H⁺ pumped out by the chain
  atp: number;       // H⁺ back through ATP synthase (negative = running in reverse)
  leak: number;      // H⁺ back through the leak
  unc: number;       // H⁺ back through the uncoupler
  atpRate: number;   // ATP made per time (negative = ATP used), same scale as pump/H_PER_ATP
  ocr: number;       // total O₂ use measured by the instrument, pmol O₂/min
}

function electron(cell: Cell, d: Drugs, dp: number): number {
  if (d.rotaa) return 0;
  return VMAX * cell.etc / (1 + Math.exp((dp - P_HALF) / P_SLOPE));
}
function atpCurrent(cell: Cell, d: Drugs, dp: number): number {
  if (d.oligo) return 0;
  const j = K_ATP * cell.demand * (dp - E_ATP);
  return Math.max(j, -REV_MAX * cell.demand);
}
function leakCurrent(cell: Cell, dp: number): number {
  return L0 * cell.leak * Math.exp((dp - 185) / L_SLOPE) * (dp / 185);
}
function uncCurrent(d: Drugs, dp: number): number {
  return d.unc ? K_UNC * dp : 0;
}

/** Net current into the intermembrane space at a given Δp (positive = Δp will rise). */
function net(cell: Cell, d: Drugs, dp: number): number {
  return H_PER_O * electron(cell, d, dp) - atpCurrent(cell, d, dp) - leakCurrent(cell, dp) - uncCurrent(d, dp);
}

/** Fluxes at a given Δp. */
export function fluxesAt(cell: Cell, d: Drugs, dp: number): Fluxes {
  const e = electron(cell, d, dp);
  const atp = atpCurrent(cell, d, dp);
  return {
    dp, dpsi: -DPSI_FRACTION * dp, e,
    pump: H_PER_O * e, atp, leak: leakCurrent(cell, dp), unc: uncCurrent(d, dp),
    atpRate: atp / H_PER_ATP, ocr: e + cell.nonMito,
  };
}

/** Steady state: the Δp at which the currents balance (bisection; net falls with Δp). */
export function steady(cell: Cell, d: Drugs): Fluxes {
  let lo = 0, hi = 260;
  if (net(cell, d, lo) <= 0) return fluxesAt(cell, d, 0);
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (net(cell, d, m) > 0) lo = m; else hi = m;
  }
  return fluxesAt(cell, d, (lo + hi) / 2);
}

/** Relax Δp towards steady state over real time (the drug takes seconds to act). */
export function relax(dpNow: number, target: number, dt: number, tau = 2.5): number {
  return target + (dpNow - target) * Math.exp(-dt / tau);
}

// --- presets
export interface Preset { key: string; label: string; cell: Cell; text: string }
export const PRESETS: Preset[] = [
  { key: "healthy", label: "Healthy cell", cell: { etc: 1, demand: 1, leak: 1, nonMito: 14 },
    text: "Cultured cells with normal mitochondria. The chain runs well below its top speed at rest." },
  { key: "complexI", label: "Complex I defect", cell: { etc: 0.45, demand: 1, leak: 1, nonMito: 14 },
    text: "Cells from a patient with a mutation in a complex I subunit: the chain can carry less than half the normal electron flux." },
  { key: "metformin", label: "Cell on metformin", cell: { etc: 0.7, demand: 1, leak: 1, nonMito: 14 },
    text: "Liver cells with metformin at a high concentration: complex I is partly inhibited. (In patients the size of this effect, and whether it is the main action of the drug, is debated.)" },
];

// --- the assay
export const CYCLE_MIN = 6;     // one measurement cycle: mix 3 min, measure 3 min
export const CYCLES = 3;        // measurement cycles per phase

export interface Point { t: number; ocr: number; phase: number }

/** Measured OCR with a small, fixed well-to-well noise (seeded). */
export function measure(f: Fluxes, noise: number): number {
  return Math.max(0, f.ocr * (1 + noise));
}

export interface Phase { drugs: Drugs; added: Drug | null; points: Point[] }

export interface Result {
  nonMito?: number; basal?: number; atpLinked?: number; leak?: number;
  maximal?: number; spare?: number; coupling?: number;
  problems: string[];
}

const last = (p: Phase) => p.points[p.points.length - 1].ocr;
const minOf = (p: Phase) => Math.min(...p.points.map(x => x.ocr));
const maxOf = (p: Phase) => Math.max(...p.points.map(x => x.ocr));

/**
 * Standard analysis of a stress test (the usual conventions):
 *  non-mitochondrial = minimum after rotenone + antimycin A;
 *  basal = last basal point − non-mito; ATP-linked = last basal − minimum after oligomycin;
 *  proton leak = minimum after oligomycin − non-mito; maximal = maximum after uncoupler − non-mito;
 *  spare = maximal − basal. A value is reported only if the injections came in a usable order.
 */
export function analyse(phases: Phase[]): Result {
  const r: Result = { problems: [] };
  const base = phases[0];
  if (!base || base.points.length < CYCLES) return r;
  const idx = (d: Drug) => phases.findIndex(p => p.added === d && p.points.length === CYCLES);
  const iO = idx("oligo"), iU = idx("unc"), iR = idx("rotaa");
  const before = (a: number, b: number) => b < 0 || a < b;   // a came before b (or b never)
  const basalRaw = last(base);
  if (iR >= 0) {
    r.nonMito = minOf(phases[iR]);
    r.basal = basalRaw - r.nonMito;
    if ((iO > iR) || (iU > iR)) r.problems.push("Rotenone + antimycin A stopped the chain, so nothing injected after them could change the O₂ use.");
  } else {
    r.problems.push("No rotenone + antimycin A yet: the non-mitochondrial O₂ use is unknown, so no value can be corrected for it.");
  }
  if (iO >= 0 && before(iO, iR)) {
    if (iU >= 0 && iU < iO) {
      r.problems.push("Oligomycin came after the uncoupler: protons already flow back without ATP synthase, so blocking it reveals nothing. ATP-linked respiration and proton leak are lost.");
    } else {
      r.atpLinked = basalRaw - minOf(phases[iO]);
      if (r.nonMito !== undefined) r.leak = minOf(phases[iO]) - r.nonMito;
    }
  } else if (iO < 0) r.problems.push("No oligomycin: ATP-linked respiration and proton leak are unknown.");
  if (iU >= 0 && before(iU, iR)) {
    if (r.nonMito !== undefined) {
      r.maximal = maxOf(phases[iU]) - r.nonMito;
      if (r.basal !== undefined) r.spare = r.maximal - r.basal;
    }
  } else if (iU < 0) r.problems.push("No uncoupler: maximal respiration and spare capacity are unknown.");
  if (r.atpLinked !== undefined && r.basal !== undefined && r.basal > 0) r.coupling = r.atpLinked / r.basal;
  return r;
}
