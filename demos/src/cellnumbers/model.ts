// Agent-based culture dish for the "growth, senescence and telomeres" demo. Pure TS (no
// DOM), so it can be bundled for Node to check the numbers in the task solutions.
//
// Each cell is a disc on the bottom of a small round well (positions in µm). A cell runs
// through a cell cycle of about 22 h. Before the restriction point (45 % into the cycle)
// it checks two things: are there mitogens (serum), and is it free of contact on most of
// its edge (contact inhibition)? If not, it rests in G0 until both are true again. After
// the restriction point it finishes the cycle and divides. At each division both daughters
// lose some telomere (about 70 bp); a daughter whose telomere is short becomes senescent
// (permanent arrest, large and flat) if its p53/Rb checkpoints work. Without checkpoints,
// cells keep dividing until telomeres are so short that chromosomes fuse (crisis) and the
// cell dies. Telomerase adds repeats back. A passage keeps a random quarter of the cells
// (split 1:4), as when trypsinised cells are reseeded.
//
// Qualitative model: illustrative numbers chosen to give textbook behaviour (about 22 h
// cycle, Hayflick limit near 50–60 population doublings); one telomere length per cell
// instead of 92 telomere ends; no DNA damage other than short telomeres apart from a small
// random chance of stress-induced senescence; no spontaneous escape from crisis.
import { rng } from "../lib/ui";

export const R_DISH = 540;          // µm, radius of the well (about 1 mm across)
export const R_CELL = 25;           // µm, footprint radius of a spread fibroblast
export const R_SEN = 44;            // µm, senescent cell (about 3× the area)
export const R_ROUND = 14;          // µm, rounded cell (attaching after a passage, or in mitosis)
export const T_MEAN = 22, T_SD = 2.5;           // h, cycle time
export const RP = 0.45;             // restriction point, fraction of the cycle
export const T_M = 1;               // h, mitosis (last hour of the cycle)
export const L0_MEAN = 8.5, L0_SD = 0.45;       // kb, telomere length at the start (young fibroblasts)
export const LOSS_MEAN = 0.07, LOSS_SD = 0.02;  // kb lost per division
export const L_SEN = 5.0, W_SEN = 0.15;         // kb: short-telomere senescence threshold and width
export const L_CRISIS = 2.5, W_CRISIS = 0.2;    // kb: chromosome fusions without checkpoints
export const P_STRESS = 0.002;      // chance per division of stress-induced senescence
export const L_TERT = 9;            // kb, telomerase set point
export const N_CAP = 1200;          // medium used up: no more divisions
export const CONF_N = Math.round(0.8 * Math.PI * R_DISH * R_DISH / (Math.PI * R_CELL * R_CELL));
export const CONTACT_REACH = 1.4;  // spread fibroblasts touch a neighbour within 1.25 × (sum of radii)
export const CONTACT_FRAC = 0.5;    // arrest in G0 when this fraction of the edge touches others
export const DT_SUB = 0.25;         // h, simulation substep

export const enum St { ATTACH, G1, G0, POST, M, SEN, DYING }

export interface Cell {
  x: number; y: number; r: number; ang: number;
  st: St; age: number; T: number; timer: number;
  L: number;          // telomere length, kb
  wasSen: boolean;    // was senescent before a passage (re-attaches as senescent)
  why: "" | "contact" | "serum" | "medium";   // why in G0
}

export interface Params { serum: boolean; contact: boolean; telomerase: boolean; checkpoints: boolean }
export const DEFAULTS: Params = { serum: true, contact: true, telomerase: false, checkpoints: true };

export interface PassageRec { passage: number; day: number; pd: number; harvested: number; seeded: number }

export class Dish {
  cells: Cell[] = [];
  t = 0;                     // h since the start
  passage = 0;
  cumPD = 0;                 // cumulative population doublings up to the last passage
  nSeed = 0;                 // cells seeded at the last passage
  lastDiv = 0;               // time of the last division (h)
  divisions = 0;
  deaths = 0;
  recs: PassageRec[] = [];
  /** passage automatically (split 1:4) as soon as the well is confluent */
  auto = false;
  onPassage: (() => void) | null = null;
  private r: ReturnType<typeof rng>;
  private acc = 0;
  // neighbour grid
  private gs = 2 * R_SEN;
  private gn = Math.ceil(2 * R_DISH / (2 * R_SEN)) + 1;
  private grid: number[][] = [];

  constructor(public p: Params, seed = 1, nStart = Math.round(CONF_N / 4), startPD = 0, L0 = L0_MEAN - startPD * LOSS_MEAN) {
    this.r = rng(seed);
    this.reset(seed, nStart, startPD, L0);
  }

  reset(seed: number, nStart: number, startPD: number, L0: number) {
    this.r = rng(seed);
    this.cells = []; this.t = 0; this.passage = 0; this.cumPD = startPD; this.lastDiv = 0;
    this.divisions = 0; this.deaths = 0; this.acc = 0;
    for (let i = 0; i < nStart; i++) {
      const c = this.newCell(L0 + L0_SD * this.r.norm());
      this.place(c); this.attach(c, false);
      this.cells.push(c);
    }
    this.nSeed = nStart;
    this.recs = [{ passage: 0, day: 0, pd: startPD, harvested: 0, seeded: nStart }];
  }

  private newCell(L: number): Cell {
    return { x: 0, y: 0, r: R_CELL, ang: this.r.unif() * Math.PI, st: St.G1, age: 0,
      T: Math.max(14, T_MEAN + T_SD * this.r.norm()), timer: 0, L, wasSen: false, why: "" };
  }
  private place(c: Cell) {
    const rad = (R_DISH - R_CELL) * Math.sqrt(this.r.unif()), a = 2 * Math.PI * this.r.unif();
    c.x = rad * Math.cos(a); c.y = rad * Math.sin(a);
  }
  private attach(c: Cell, wasSen: boolean) {
    c.wasSen = wasSen; c.st = St.ATTACH; c.r = R_ROUND; c.timer = 6 + 12 * this.r.unif();
    c.age = 0; c.T = Math.max(14, T_MEAN + T_SD * this.r.norm()); c.why = "";
  }

  /** Split 1:4: keep a random quarter of the living cells and reseed them. */
  passageNow() {
    const alive = this.cells.filter(c => c.st !== St.DYING);
    const n = alive.length;
    if (n === 0) return;
    const pd = n > this.nSeed ? Math.log2(n / this.nSeed) : 0;
    this.cumPD += pd;
    this.passage++;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.r.unif() * (i + 1)); [alive[i], alive[j]] = [alive[j], alive[i]]; }
    const k = Math.max(1, Math.round(n / 4));
    this.cells = alive.slice(0, k);
    for (const c of this.cells) { this.place(c); this.attach(c, c.st === St.SEN || (c.st === St.ATTACH && c.wasSen)); }
    this.recs.push({ passage: this.passage, day: this.t / 24, pd: this.cumPD, harvested: n, seeded: k });
    this.nSeed = k;
  }

  /** Population doublings so far, including the growth since the last passage. */
  pdNow(): number {
    const n = this.alive();
    return this.cumPD + (n > this.nSeed ? Math.log2(n / this.nSeed) : 0);
  }
  alive(): number { let k = 0; for (const c of this.cells) if (c.st !== St.DYING) k++; return k; }

  /** Covered fraction of the well relative to a confluent layer (1 = confluent). */
  confluence(): number {
    let a = 0;
    for (const c of this.cells) if (c.st !== St.DYING) {
      const rr = c.st === St.ATTACH ? (c.wasSen ? R_SEN : R_CELL) : c.st === St.M ? R_CELL : c.r;
      a += rr * rr;
    }
    return a / (0.8 * R_DISH * R_DISH);
  }

  advance(hours: number) {
    this.acc += hours;
    // whole substeps only, so the result does not depend on the frame rate
    while (this.acc >= DT_SUB) {
      this.step(DT_SUB); this.acc -= DT_SUB;
      if (this.auto && this.p.serum && this.confluence() >= 1) { this.passageNow(); if (this.onPassage) this.onPassage(); }
    }
  }

  private buildGrid() {
    const g = this.gn;
    if (this.grid.length !== g * g) this.grid = Array.from({ length: g * g }, () => []);
    for (const b of this.grid) b.length = 0;
    this.cells.forEach((c, i) => this.grid[this.cellIndex(c.x, c.y)].push(i));
  }
  private cellIndex(x: number, y: number) {
    const g = this.gn;
    const ix = Math.min(g - 1, Math.max(0, Math.floor((x + R_DISH) / this.gs)));
    const iy = Math.min(g - 1, Math.max(0, Math.floor((y + R_DISH) / this.gs)));
    return iy * g + ix;
  }
  private neighbours(c: Cell, fn: (j: number) => void) {
    const g = this.gn;
    const ix = Math.min(g - 1, Math.max(0, Math.floor((c.x + R_DISH) / this.gs)));
    const iy = Math.min(g - 1, Math.max(0, Math.floor((c.y + R_DISH) / this.gs)));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = ix + dx, y = iy + dy;
      if (x < 0 || y < 0 || x >= g || y >= g) continue;
      for (const j of this.grid[y * g + x]) fn(j);
    }
  }

  /** Fraction of the cell's edge that touches other cells or the wall (0–1, capped). */
  private contactFrac(i: number): number {
    const c = this.cells[i];
    let cov = 0;
    this.neighbours(c, j => {
      if (j === i) return;
      const o = this.cells[j];
      if (o.st === St.DYING) return;
      const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy);
      if (d < (c.r + o.r) * CONTACT_REACH) cov += 2 * Math.asin(Math.min(1, o.r / Math.max(d, 1)));
    });
    if (Math.hypot(c.x, c.y) > R_DISH - c.r * 1.05) cov += Math.PI / 2;
    return Math.min(1, cov / (2 * Math.PI));
  }

  private step(dt: number) {
    const p = this.p, r = this.r;
    this.t += dt;
    this.buildGrid();
    const nAlive = this.alive();
    const born: Cell[] = [];
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      switch (c.st) {
        case St.ATTACH:
          c.timer -= dt;
          if (c.timer <= 0) {
            if (c.wasSen) { c.st = St.SEN; c.r = R_SEN; }
            else { c.st = St.G1; c.age = 0.35 * c.T * this.r.unif(); }
          } else c.r += (R_CELL - c.r) * Math.min(1, dt / 12);
          break;
        case St.G1: case St.G0: {
          c.r += (R_CELL - c.r) * Math.min(1, dt / 3);
          if (c.st === St.G1 && c.age + dt < RP * c.T) { c.age += dt; break; }
          // at the restriction point (or resting in G0): mitogens? space? medium?
          // A cell leaving G0 starts G1 again from the beginning.
          const why = !p.serum ? "serum" : nAlive >= N_CAP ? "medium"
            : p.contact && this.contactFrac(i) > CONTACT_FRAC ? "contact" : "";
          if (c.st === St.G1 && why) { c.st = St.G0; c.why = why; break; }
          if (c.st === St.G0) { c.why = why; if (!why) { c.st = St.G1; c.age = 0; } break; }
          c.age += dt;
          if (c.age >= RP * c.T) c.st = St.POST;
          break;
        }
        case St.POST:
          c.age += dt;
          if (c.age >= c.T - T_M) { c.st = St.M; }
          break;
        case St.M:
          c.age += dt;
          c.r += (R_ROUND - c.r) * Math.min(1, dt / 0.3);
          if (c.age >= c.T) born.push(this.divide(c));
          break;
        case St.SEN:
          c.r += Math.min(R_SEN - c.r, dt * 10 / 24);
          break;
        case St.DYING:
          c.timer -= dt;
          break;
      }
      // random crawling (slower when touching neighbours, and much slower when senescent)
      if (c.st !== St.DYING && c.st !== St.ATTACH) {
        const s = (c.st === St.SEN ? 1.5 : c.st === St.G0 ? 3 : 7) * Math.sqrt(dt / 0.25);
        c.x += s * r.norm(); c.y += s * r.norm();
        c.ang += 0.15 * Math.sqrt(dt) * r.norm();
      }
    }
    for (const b of born) this.cells.push(b);
    const before = this.cells.length;
    this.cells = this.cells.filter(c => !(c.st === St.DYING && c.timer <= 0));
    this.deaths += before - this.cells.length;
    this.relax();
  }

  private daughterFate(d: Cell) {
    const p = this.p, r = this.r;
    const loss = Math.max(0.01, LOSS_MEAN + LOSS_SD * r.norm());
    d.L -= loss;
    if (p.telomerase) d.L += loss + Math.max(0, 0.15 * (L_TERT - d.L));
    if (p.checkpoints) {
      const pSen = 1 / (1 + Math.exp((d.L - L_SEN) / W_SEN)) + P_STRESS;
      if (r.unif() < pSen) { d.st = St.SEN; d.age = 0; }
    } else {
      const pDie = 1 / (1 + Math.exp((d.L - L_CRISIS) / W_CRISIS));
      if (r.unif() < pDie) { d.st = St.DYING; d.timer = 6; }
    }
  }

  private divide(c: Cell): Cell {
    const a = this.r.unif() * 2 * Math.PI, off = R_ROUND * 0.8;
    const d = this.newCell(c.L);
    d.x = c.x + off * Math.cos(a); d.y = c.y + off * Math.sin(a); d.r = R_ROUND; d.ang = a;
    c.x -= off * Math.cos(a); c.y -= off * Math.sin(a); c.ang = a;
    c.st = St.G1; c.age = 0; c.T = Math.max(14, T_MEAN + T_SD * this.r.norm()); c.why = "";
    this.daughterFate(c); this.daughterFate(d);
    this.divisions++; this.lastDiv = this.t;
    return d;
  }

  /** Push overlapping cells apart. Without contact inhibition, cells may pile up. */
  private relax() {
    const k = this.p.contact ? 0.9 : 0.62;
    this.buildGrid();
    for (let it = 0, nIt = this.cells.length > 800 ? 1 : 2; it < nIt; it++) {
      for (let i = 0; i < this.cells.length; i++) {
        const c = this.cells[i];
        if (c.st === St.DYING) continue;
        this.neighbours(c, j => {
          if (j <= i) return;
          const o = this.cells[j];
          if (o.st === St.DYING) return;
          let dx = o.x - c.x, dy = o.y - c.y;
          let d = Math.hypot(dx, dy);
          const want = (c.r + o.r) * k;
          if (d >= want) return;
          if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
          const push = Math.min(4, 0.5 * (want - d));
          // big flat senescent cells are firmly attached: they move less
          const mc = c.st === St.SEN ? 0.2 : 1, mo = o.st === St.SEN ? 0.2 : 1;
          const f = push / d / (mc + mo);
          c.x -= dx * f * mc; c.y -= dy * f * mc;
          o.x += dx * f * mo; o.y += dy * f * mo;
        });
      }
      for (const c of this.cells) {
        const d = Math.hypot(c.x, c.y), lim = R_DISH - c.r * 0.6;
        if (d > lim) { c.x *= lim / d; c.y *= lim / d; }
      }
    }
  }

  /** Counts per state, and mean telomere length of living cells. */
  stats() {
    const s = { cycling: 0, g0: 0, contact: 0, serum: 0, medium: 0, sen: 0, dying: 0, attach: 0, meanL: 0, n: 0 };
    let sumL = 0;
    for (const c of this.cells) {
      if (c.st === St.DYING) { s.dying++; continue; }
      s.n++; sumL += c.L;
      if (c.st === St.SEN || (c.st === St.ATTACH && c.wasSen)) s.sen++;
      else if (c.st === St.ATTACH) s.attach++;
      else if (c.st === St.G0) { s.g0++; if (c.why === "contact") s.contact++; else if (c.why === "medium") s.medium++; else s.serum++; }
      else s.cycling++;
    }
    s.meanL = s.n ? sumL / s.n : 0;
    return s;
  }
}
