// Clonal evolution under therapy: an agent-based tumour on a 2D square lattice.
// Pure model (no DOM), so it can be bundled for Node to check the numbers in the tasks.
//
// Each lattice site is empty (-1) or holds one cell with a genotype: 4 bits
//   G  = "growth signal stuck on" (e.g. RAS/BRAF): divides faster
//   S  = "escapes cell death" (e.g. BCL-2 up): dies less often by itself
//   RA = resistant to drug A (e.g. a gatekeeper mutation in its target)
//   RB = resistant to drug B (a different target)
// A cell divides only into an empty neighbour (8 neighbours), so a tumour grows at its
// edge and cells inside wait for space (crowding). Each daughter can gain each missing
// mutation with a small probability. Drugs kill cells that are not resistant to them.
// Rates are per day; the time step is DT days. Qualitative model, illustrative numbers.

export const G = 1, S = 2, RA = 4, RB = 8;
export const DT = 0.1;                 // days per step

export interface Params {
  n: number;           // lattice side
  birth: number;       // division attempts per day (founder)
  death: number;       // spontaneous death per day (founder)
  gFactor: number;     // G: division rate × this
  sFactor: number;     // S: spontaneous death × this
  kill: number;        // extra death per day from one drug, sensitive cells
  cost: number;        // fraction of division rate lost per resistance mutation
  muDriver: number;    // per daughter per division, for G and S each
  muRes: number;       // per daughter per division, for RA and RB each
  instability: number; // multiplies every mutation rate (genome instability)
  newRes: boolean;     // resistance mutations can also arise after diagnosis
}

export const DEFAULTS: Params = {
  n: 120, birth: 0.35, death: 0.08, gFactor: 1.4, sFactor: 0.4,
  kill: 0.5, cost: 0.3, muDriver: 3e-4, muRes: 1e-4, instability: 1, newRes: true,
};

export type Schedule = "none" | "A" | "inter" | "AB" | "seq";
export const SCHEDULES: { key: Schedule; label: string }[] = [
  { key: "none", label: "No therapy" },
  { key: "A", label: "Drug A, continuous" },
  { key: "inter", label: "Drug A, intermittent" },
  { key: "AB", label: "Drugs A + B together" },
  { key: "seq", label: "A, then B at relapse" },
];
export const DIAG = 4000;          // tumour size (cells) at diagnosis: therapy starts
export const PROG = 5000;          // progression: the tumour is 25 % larger than at diagnosis
export const LOW = 2000;         // intermittent: drug off below this, on again at DIAG

/** Small seeded generator (mulberry32), the same as lib/ui.ts rng(). */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Sample { t: number; byClass: number[]; total: number; a: boolean; b: boolean }

export class Tumour {
  p: Params;
  grid: Int8Array;
  t = 0;                 // days since the first cell
  tDiag = -1;            // day of diagnosis (therapy start), -1 before
  schedule: Schedule;
  drugA = false; drugB = false;
  manual = false;        // the student switches the drugs by hand
  progDay = -1;          // first day after diagnosis that the tumour is above PROG
  prog2Day = -1;         // A then B: second progression, on drug B
  nadir = Infinity; nadirDay = -1;
  seqSwitched = false; seqDipped = false;
  counts = new Int32Array(16);
  hist: Sample[] = [];
  private rnd: () => number;
  private order: Int32Array;
  private nb: Int32Array;    // 8 neighbour offsets per site (-1 = outside)

  constructor(p: Params, seed: number, schedule: Schedule) {
    this.p = { ...p };
    this.schedule = schedule;
    this.rnd = mulberry(seed);
    const n = p.n, N = n * n;
    this.grid = new Int8Array(N).fill(-1);
    this.order = new Int32Array(N);
    for (let i = 0; i < N; i++) this.order[i] = i;
    this.nb = new Int32Array(8 * N);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const X = x + dx, Y = y + dy;
        this.nb[8 * (y * n + x) + k++] = X < 0 || Y < 0 || X >= n || Y >= n ? -1 : Y * n + X;
      }
    }
    const c = (n >> 1) * n + (n >> 1);
    this.grid[c] = 0;
    this.counts[0] = 1;
    this.sample();
  }

  get total(): number { let s = 0; for (let i = 0; i < 16; i++) s += this.counts[i]; return s; }
  /** cells per resistance class: [sensitive, A-resistant, B-resistant, both] */
  byClass(): number[] {
    const r = [0, 0, 0, 0];
    for (let g = 0; g < 16; g++) r[(g >> 2) & 3] += this.counts[g];
    return r;
  }
  /** cells with 0, 1, 2 growth/survival drivers */
  byDrivers(): number[] {
    const r = [0, 0, 0];
    for (let g = 0; g < 16; g++) r[(g & 1) + ((g >> 1) & 1)] += this.counts[g];
    return r;
  }
  daysOfTherapy(): number { return this.tDiag < 0 ? 0 : this.t - this.tDiag; }

  setParams(v: Partial<Params>) { this.p = { ...this.p, ...v }; }

  private applySchedule() {
    if (this.manual) return;
    const tot = this.total;
    if (this.tDiag < 0) {
      if (tot >= DIAG) this.tDiag = this.t; else return;
    }
    const d = this.t - this.tDiag;
    switch (this.schedule) {
      case "none": this.drugA = this.drugB = false; break;
      case "A": this.drugA = true; this.drugB = false; break;
      case "AB": this.drugA = this.drugB = true; break;
      case "inter":
        if (d === 0 || tot >= DIAG) this.drugA = true;
        else if (tot <= LOW) this.drugA = false;
        this.drugB = false; break;
      case "seq":
        if (!this.seqSwitched && this.progDay >= 0) { this.seqSwitched = true; this.nadir = Infinity; }
        this.drugA = !this.seqSwitched; this.drugB = this.seqSwitched; break;
    }
  }

  private mutate(g: number): number {
    const p = this.p, r = this.rnd;
    const md = p.muDriver * p.instability, mr = p.muRes * p.instability * (this.tDiag >= 0 && !p.newRes ? 0 : 1);
    if (!(g & G) && r() < md) g |= G;
    if (!(g & S) && r() < md) g |= S;
    if (!(g & RA) && r() < mr) g |= RA;
    if (!(g & RB) && r() < mr) g |= RB;
    return g;
  }

  step() {
    this.applySchedule();
    const p = this.p, r = this.rnd, grid = this.grid, nb = this.nb, order = this.order, cnt = this.counts;
    const N = grid.length;
    // shuffle the visiting order (Fisher–Yates) so no direction is favoured
    for (let i = N - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
    const killA = this.drugA ? p.kill * DT : 0, killB = this.drugB ? p.kill * DT : 0;
    for (let k = 0; k < N; k++) {
      const i = order[k], g = grid[i];
      if (g < 0) continue;
      // death: spontaneous, plus each drug the cell is not resistant to
      let pd = p.death * (g & S ? p.sFactor : 1) * DT;
      if (!(g & RA)) pd += killA;
      if (!(g & RB)) pd += killB;
      if (r() < pd) { grid[i] = -1; cnt[g]--; continue; }
      // division into a random empty neighbour
      let b = p.birth * (g & G ? p.gFactor : 1);
      if (g & RA) b *= 1 - p.cost;
      if (g & RB) b *= 1 - p.cost;
      if (r() >= b * DT) continue;
      let free = 0, pick = -1;
      for (let m = 0; m < 8; m++) {
        const j = nb[8 * i + m];
        if (j >= 0 && grid[j] < 0 && r() * ++free < 1) pick = j;   // reservoir sampling
      }
      if (pick < 0) continue;
      const g1 = this.mutate(g), g2 = this.mutate(g);
      cnt[g]--; cnt[g1]++; cnt[g2]++;
      grid[i] = g1; grid[pick] = g2;
    }
    this.t += DT;
    // nadir and progression (the tumour grows past PROG after therapy started)
    if (this.tDiag >= 0) {
      const tot = this.total;
      if (tot < this.nadir) { this.nadir = tot; this.nadirDay = this.t; }
      if (tot > PROG) {
        if (this.progDay < 0) this.progDay = this.t;
        else if (this.seqDipped && this.prog2Day < 0) this.prog2Day = this.t;
      }
      if (this.seqSwitched && tot < DIAG) this.seqDipped = true;
    }
    if (Math.round(this.t / DT) % 5 === 0) this.sample();   // every half day
  }

  sample() {
    this.hist.push({ t: this.t, byClass: this.byClass(), total: this.total, a: this.drugA, b: this.drugB });
  }
}

export interface Outcome { cured: boolean; progAfter: number | null; prog2After: number | null; nadir: number; resistantAtDiag: number; diagDay: number }

/** Run one tumour to diagnosis and then up to `days` of therapy (or to progression); summarise. */
export function runOne(p: Params, seed: number, schedule: Schedule, days: number): Outcome {
  const T = new Tumour(p, seed, schedule);
  let resistantAtDiag = -1;
  for (;;) {
    T.step();
    if (T.tDiag >= 0 && resistantAtDiag < 0) { const c = T.byClass(); resistantAtDiag = c[1] + c[2] + c[3]; }
    if (T.total === 0) break;
    if (T.tDiag >= 0 && T.t - T.tDiag >= days) break;
    if (T.progDay >= 0 && (schedule !== "seq" || T.prog2Day >= 0)) break;
    if (T.t > 5000) break;
  }
  return {
    cured: T.total === 0,
    progAfter: T.progDay >= 0 ? T.progDay - T.tDiag : null,
    prog2After: T.prog2Day >= 0 ? T.prog2Day - T.tDiag : null,
    nadir: T.nadir, resistantAtDiag, diagDay: T.tDiag,
  };
}
