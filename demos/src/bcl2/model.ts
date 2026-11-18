// BCL-2 balance: a qualitative threshold model of the intrinsic (mitochondrial) pathway.
// No DOM here, so the numbers in the study-question solutions can be checked in Node.
//
// Amounts are in relative units (a healthy lymphocyte has 1 of everything).
// 1. BH3-only proteins (the stress signal) bind the guardians BCL-2 and MCL-1 (one to one,
//    tight binding). Venetoclax occupies BCL-2, so only drug-free BCL-2 counts.
// 2. BH3-only proteins left over activate BAX/BAK (saturating).
// 3. Guardians left over capture active BAX/BAK. What escapes is "free BAX/BAK".
// 4. If free BAX/BAK is above a threshold, the cell undergoes MOMP (all or none), later the
//    further it is above the threshold. Then cytochrome c release, caspase activation,
//    PS exposure (annexin V), and hours later loss of membrane integrity (PI).
// Cells differ: every amount gets its own random factor (log-normal), so a population
// spreads around the threshold. Illustrative numbers, not fitted to data.

export interface Params {
  stress: number;   // BH3-only proteins (BIM, PUMA, NOXA, BAD … lumped)
  bcl2: number;     // BCL-2
  mcl1: number;     // MCL-1
  baxbak: number;   // BAX + BAK
  ven: number;      // venetoclax, in multiples of its K_d for BCL-2 (0 = none)
}

export const KD = 0.02;        // guardian–BH3 and guardian–BAX/BAK binding (relative units)
export const KA = 0.3;         // BH3-only level that half-activates BAX/BAK
export const BASAL = 0.02;     // spontaneous BAX/BAK activation (as BH3-only equivalents)
export const THRESH = 0.1;     // free BAX/BAK needed for MOMP
export const CV = 0.3;         // cell-to-cell variation (s.d. of ln amount)
export const T_END = 24 * 3600;   // simulate 24 h (seconds)

// timing (seconds)
const LAG = 45 * 60;          // shortest time from the stress (t = 0) to MOMP
const TAU = 2 * 3600;         // MOMP comes later the closer a cell is to the threshold
const CYTC = 5 * 60;          // cytochrome c leaves all mitochondria in about 5 min
const CASP = 15 * 60;         // MOMP → caspase-3/7 active
const PS = 20 * 60;           // caspase active → PS outside (annexin V binds)
const PI = 3 * 3600;          // caspase active → membrane leaky (PI enters), in a dish

/** Free ligand when L binds receptor R one to one with dissociation constant K. */
export function tightFree(L: number, R: number, K = KD): number {
  const b = L + R + K;
  const C = (b - Math.sqrt(Math.max(0, b * b - 4 * L * R))) / 2;
  return Math.max(0, L - C);
}

export interface Balance {
  bcl2Free: number;   // BCL-2 not occupied by drug
  guard: number;      // all guardians able to bind (drug-free BCL-2 + MCL-1)
  bh3Free: number;    // BH3-only proteins not held by guardians
  guardLeft: number;  // guardians still free after binding BH3-only proteins
  active: number;     // activated BAX/BAK
  free: number;       // active BAX/BAK not captured by guardians
}

export function balance(p: Params): Balance {
  const bcl2Free = p.bcl2 / (1 + p.ven);
  const guard = bcl2Free + p.mcl1;
  const bh3Free = tightFree(p.stress, guard);
  const guardLeft = guard - (p.stress - bh3Free);
  const a = bh3Free + BASAL;
  const active = p.baxbak * a / (a + KA);
  const free = tightFree(active, guardLeft);
  return { bcl2Free, guard, bh3Free, guardLeft, active, free };
}

/** Time from the stress (t = 0) to MOMP, in seconds; Infinity if below the threshold. */
export function tMomp(free: number): number {
  const r = free / THRESH;
  return r <= 1 ? Infinity : LAG + TAU / Math.log(r);
}

export interface Cell {
  f: [number, number, number, number];   // random factors on stress, BCL-2, MCL-1, BAX/BAK
  j: number[];                            // random jitter of the later steps
  ax: number; ay: number;                 // baseline annexin and PI staining (log10 units)
  free: number;                           // free BAX/BAK
  tM: number;                             // MOMP time (s), Infinity = survives
  tC: number; tA: number; tP: number;     // caspase active, annexin V+, PI+
}

/** Seeded uniform → normal pairs (Box–Muller), self-contained so Node can run this file. */
function gen(seed: number) {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
  return { u, n };
}

/** A population of n cells with fixed random factors (same seed → same cells). */
export function makeCells(n: number, seed = 7): Cell[] {
  const g = gen(seed);
  const cells: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const f = [0, 0, 0, 0].map(() => Math.exp(CV * g.n() - CV * CV / 2)) as Cell["f"];
    const j = [g.n(), g.n(), g.n(), g.n()];
    cells.push({ f, j, ax: 0.6 + 0.25 * g.n(), ay: 0.5 + 0.25 * g.n(), free: 0, tM: Infinity, tC: Infinity, tA: Infinity, tP: Infinity });
  }
  return cells;
}

/** Apply parameters to every cell: its own free BAX/BAK and its timeline. */
export function applyParams(cells: Cell[], p: Params): void {
  for (const c of cells) {
    const q: Params = { stress: p.stress * c.f[0], bcl2: p.bcl2 * c.f[1], mcl1: p.mcl1 * c.f[2], baxbak: p.baxbak * c.f[3], ven: p.ven };
    c.free = balance(q).free;
    const t = tMomp(c.free);
    if (!isFinite(t)) { c.tM = c.tC = c.tA = c.tP = Infinity; continue; }
    c.tM = t * Math.exp(0.25 * c.j[0]);
    c.tC = c.tM + CASP * Math.exp(0.2 * c.j[1]);
    c.tA = c.tC + PS * Math.exp(0.2 * c.j[2]);
    c.tP = c.tC + PI * Math.exp(0.3 * c.j[3]);
  }
}

const ramp = (t: number, t0: number, w: number) => (t <= t0 ? 0 : t >= t0 + w ? 1 : (t - t0) / w);

export interface CellState {
  cytc: number;     // 0 → 1: cytochrome c released
  casp: number;     // 0 → 1: caspases active
  annexin: number;  // log10 annexin V fluorescence
  pi: number;       // log10 PI fluorescence
  anF: number;      // 0 → 1: PS exposed (annexin V binds)
  piF: number;      // 0 → 1: membrane leaky (PI enters)
  stage: 0 | 1 | 2 | 3;   // 0 healthy, 1 MOMP (cyt c out), 2 caspases on, 3 annexin V+ (dying)
}

/** State of one cell at time t (seconds). Changes are gradual (no jumps). */
export function cellAt(c: Cell, t: number): CellState {
  const cytc = ramp(t, c.tM, CYTC);
  const casp = ramp(t, c.tC, 5 * 60);
  const an = ramp(t, c.tA - 10 * 60, 20 * 60);
  const pi = ramp(t, c.tP - 20 * 60, 40 * 60);
  const annexin = c.ax + 2.4 * an;
  const piV = c.ay + 2.3 * pi;
  const stage = t >= c.tA ? 3 : t >= c.tC ? 2 : t >= c.tM ? 1 : 0;
  return { cytc, casp, annexin, pi: piV, anF: an, piF: pi, stage };
}

export const AN_GATE = 1.6;   // annexin V positive above this (log10 units)
export const PI_GATE = 1.6;   // PI positive above this

/** Flow-cytometry quadrants at time t: live, early apoptotic, late apoptotic (fractions). */
export function quadrants(cells: Cell[], t: number) {
  let live = 0, early = 0, late = 0, piOnly = 0;
  for (const c of cells) {
    const s = cellAt(c, t);
    const a = s.annexin > AN_GATE, p = s.pi > PI_GATE;
    if (a && p) late++; else if (a) early++; else if (p) piOnly++; else live++;
  }
  const n = cells.length;
  return { live: live / n, early: early / n, late: late / n, piOnly: piOnly / n };
}

/** Summary: fraction with MOMP by 24 h, and the median MOMP time of those cells (s). */
export function summary(cells: Cell[]) {
  const ts = cells.map(c => c.tM).filter(t => t <= T_END).sort((a, b) => a - b);
  const median = ts.length ? ts[Math.floor((ts.length - 1) / 2)] : Infinity;
  return { dead: ts.length / cells.length, median, first: ts.length ? ts[0] : Infinity };
}

export const PRESETS: { key: string; label: string; p: Params; text: string }[] = [
  { key: "healthy", label: "Healthy lymphocyte", p: { stress: 0.8, bcl2: 1, mcl1: 1.2, baxbak: 1, ven: 0 },
    text: "A resting lymphocyte: a little BH3-only signal, enough BCL-2 and MCL-1 to hold it. A few cells near the edge die, as in normal turnover." },
  { key: "cll", label: "CLL cell (high BCL-2)", p: { stress: 2.5, bcl2: 4, mcl1: 0.6, baxbak: 1, ven: 0 },
    text: "A chronic lymphocytic leukaemia cell: much more BCL-2 than normal, which holds a lot of BH3-only protein (mainly BIM). The cell is 'primed': alive, but only because BCL-2 holds it." },
  { key: "cllven", label: "CLL cell + venetoclax", p: { stress: 2.5, bcl2: 4, mcl1: 0.6, baxbak: 1, ven: 30 },
    text: "Venetoclax fills the BH3 groove of BCL-2. The BH3-only proteins that BCL-2 held are set free, and so is BAX/BAK." },
  { key: "mcl1", label: "MCL-1-dependent cell + venetoclax", p: { stress: 2.5, bcl2: 0.6, mcl1: 4, baxbak: 1, ven: 30 },
    text: "A cancer cell that relies on MCL-1 instead of BCL-2 (as some resistant CLL cells do). Venetoclax does not bind MCL-1." },
];
