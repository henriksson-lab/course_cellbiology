// Uptake assay, particle view: glucose and Na⁺ dots move randomly in an outside bath and
// inside a cell; they cross the bilayer (rarely) or ride on transporters whose random
// events follow the rates in model.ts. Saturation, Fick's law and uphill transport are not
// programmed in: they emerge from these rules. Pure model code (no DOM).
import { rng } from "../lib/ui";
import { gaussPairs } from "../lib/particles";
import * as M from "./model";

export const W = 100, H = 80;
export const OUT_Y1 = 35, IN_Y0 = 45;          // outside: y 0–35, membrane 35–45, inside 45–80
export const T_X0 = 12, T_X1 = 88;             // transporters sit between these x
export const LEAK_X = 5, PUMP_X = 95;          // Na⁺ leak channel and Na⁺/K⁺ pump
const AREA = W * OUT_Y1;                       // area of each compartment
const SIGMA = 1.0;                             // random step per tick (world units)
const ZONE = 6;                                // dots this close to the membrane are indexed by x
const LAYER = 1.0;                             // bilayer crossing: dots this close may cross
const PM = M.P_BILAYER / (60 * M.DOTS_PER_MM * W * LAYER / AREA);           // per dot per tick
export const DT = 1 / 60;                      // seconds per tick
const BINW = 5, NBIN = W / BINW;

export interface Transporter {
  x: number; kind: M.Kind; blocked: boolean;
  side: 0 | 1;          // 0 faces out, 1 faces in
  cargo: number;        // glucose index or −1
  na: [number, number]; // bound Na⁺ dot indices or −1
  from: 0 | 1;          // side the cargo came from
}

/** A set of dots of one kind. state: 0 dead, 1 free, 2 bound. */
class Dots {
  x: Float32Array; y: Float32Array; st: Uint8Array; cap: number; hi = 0; free: number[] = [];
  constructor(cap: number) { this.cap = cap; this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.st = new Uint8Array(cap); }
  add(x: number, y: number): number {
    const i = this.free.length ? this.free.pop()! : this.hi < this.cap ? this.hi++ : -1;
    if (i < 0) return -1;
    this.x[i] = x; this.y[i] = y; this.st[i] = 1; return i;
  }
  kill(i: number) { this.st[i] = 0; this.free.push(i); }
}

export class UptakeSim {
  p: M.Params; cell: M.CellState;
  g = new Dots(24000); na = new Dots(1500);
  ts: Transporter[] = [];
  t = 0;
  /** net glucose entries per whole second of simulated time (for the rate readout) */
  bins: number[] = [0];
  netIn = 0;
  sink = false;              // assay mode: glucose that arrives inside is removed at once
  unif: () => number; gauss: () => number;
  private near: number[][][] = [[], []];

  constructor(p: M.Params, cell: M.CellState, seed: number) {
    this.p = { ...p }; this.cell = cell;
    const r = rng(seed); this.unif = r.unif; this.gauss = gaussPairs(r.unif);
    for (let s = 0; s < 2; s++) for (let b = 0; b < NBIN; b++) this.near[s][b] = [];
    this.setParams(p);
    this.clamp(true);
    const target = Math.round(this.cell.naI * M.NA_DOTS_PER_MM);
    for (let k = 0; k < target; k++) this.na.add(this.unif() * W, IN_Y0 + this.unif() * (H - IN_Y0));
  }

  /** Apply new parameters; rebuilds the transporters if their number or kind changed. */
  setParams(p: M.Params) {
    const kind: M.Kind = p.path === "SGLT" ? "SGLT" : "GLUT";
    const n = p.path === "bilayer" ? 0 : p.nT;
    if (this.ts.length !== n || (n && this.ts[0].kind !== kind)) {
      for (const t of this.ts) this.unload(t, t.side);
      this.ts = [];
      for (let i = 0; i < n; i++) this.ts.push({ x: T_X0 + (i + 0.5) * (T_X1 - T_X0) / n, kind, blocked: false, side: 0, cargo: -1, na: [-1, -1], from: 0 });
    }
    // gliflozin: all but a fixed subset of SGLTs blocked (the same ones each time)
    const free = M.working({ ...p, nT: n });
    const keep = new Set<number>();
    for (let k = 0; k < free; k++) keep.add(Math.floor((k + 0.5) * n / Math.max(1, free)));
    this.ts.forEach((t, i) => {
      t.blocked = kind === "SGLT" && p.gliflozin && !keep.has(i);
      if (t.blocked) { this.unload(t, t.side); t.side = 0; }
    });
    this.p = { ...p };
  }

  /** Release whatever a transporter holds to side s (used when transporters are removed). */
  private unload(t: Transporter, s: 0 | 1) {
    const y = s === 0 ? OUT_Y1 - 1.5 : IN_Y0 + 1.5;
    if (t.cargo >= 0) { this.g.x[t.cargo] = t.x; this.g.y[t.cargo] = y; this.g.st[t.cargo] = 1; t.cargo = -1; }
    for (let k = 0; k < 2; k++) if (t.na[k] >= 0) { this.na.x[t.na[k]] = t.x; this.na.y[t.na[k]] = y; this.na.st[t.na[k]] = 1; t.na[k] = -1; }
  }

  countGlucose(): { out: number; inn: number } {
    let out = 0, inn = 0;
    const { st, y, hi } = this.g;
    for (let i = 0; i < hi; i++) if (st[i] === 1) { if (y[i] < OUT_Y1) out++; else inn++; }
    return { out, inn };
  }
  ci(): number { return this.countGlucose().inn / M.DOTS_PER_MM; }

  /** Keep the bath at its set concentration (it is large compared with the cell). */
  clamp(init = false) {
    const fix = (d: Dots, target: number) => {
      let out: number[] = [];
      for (let i = 0; i < d.hi; i++) if (d.st[i] === 1 && d.y[i] < OUT_Y1) out.push(i);
      let n = out.length;
      while (n < target) { if (d.add(this.unif() * W, this.unif() * (OUT_Y1 - (init ? 0 : 1))) < 0) break; n++; }
      while (n > target) { const k = Math.floor(this.unif() * out.length); d.kill(out[k]); out[k] = out[out.length - 1]; out.pop(); n--; }
    };
    fix(this.g, Math.round(this.p.co * M.DOTS_PER_MM));
    fix(this.na, Math.round(this.p.naO * M.NA_DOTS_PER_MM));
  }

  /** Empty the cell of glucose (wash). */
  wash() {
    for (let i = 0; i < this.g.hi; i++) if (this.g.st[i] === 1 && this.g.y[i] >= IN_Y0) this.g.kill(i);
    for (const t of this.ts) if (t.cargo >= 0) { this.g.kill(t.cargo); t.cargo = -1; for (let k = 0; k < 2; k++) if (t.na[k] >= 0) { this.na.st[t.na[k]] = 1; this.na.x[t.na[k]] = t.x; this.na.y[t.na[k]] = t.side ? IN_Y0 + 1.5 : OUT_Y1 - 1.5; t.na[k] = -1; } }
  }

  private move(d: Dots) {
    const g = this.gauss;
    for (let i = 0; i < d.hi; i++) {
      if (d.st[i] !== 1) continue;
      let x = d.x[i] + SIGMA * g(), y = d.y[i] + SIGMA * g();
      if (x < 0) x += W; else if (x >= W) x -= W;
      if (d.y[i] < OUT_Y1) { if (y < 0) y = -y; if (y > OUT_Y1) y = 2 * OUT_Y1 - y; }
      else { if (y > H) y = 2 * H - y; if (y < IN_Y0) y = 2 * IN_Y0 - y; }
      d.x[i] = x; d.y[i] = y;
    }
  }

  private nearest(d: Dots, side: 0 | 1, x0: number): number {
    let best = -1, bd = Infinity;
    for (let i = 0; i < d.hi; i++) {
      if (d.st[i] !== 1 || (d.y[i] < OUT_Y1 ? 0 : 1) !== side) continue;
      let dx = Math.abs(d.x[i] - x0); if (dx > W / 2) dx = W - dx;
      const dy = side === 0 ? OUT_Y1 - d.y[i] : d.y[i] - IN_Y0;
      const dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }

  /** Nearest free glucose to a transporter mouth on side s: look in the near-membrane bins first. */
  private nearestG(side: 0 | 1, x0: number): number {
    const g = this.g, my = side === 0 ? OUT_Y1 : IN_Y0;
    let best = -1, bd = Infinity;
    const b0 = Math.floor(x0 / BINW);
    for (let db = -2; db <= 2; db++) for (const i of this.near[side][(b0 + db + NBIN) % NBIN]) {
      if (g.st[i] !== 1) continue;
      let dx = Math.abs(g.x[i] - x0); if (dx > W / 2) dx = W - dx;
      const dy = g.y[i] - my, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    return best >= 0 ? best : this.nearest(g, side, x0);
  }

  private record(n: number) { this.netIn += n; this.bins[this.bins.length - 1] += n; }

  /** One tick (DT seconds). */
  tick() {
    const { g, p } = this;
    const naI = this.cell.naI, V = M.voltage(this.cell);
    this.move(g); this.move(this.na);

    // dots near the membrane, binned by x, and bilayer crossing
    for (let s = 0; s < 2; s++) for (let b = 0; b < NBIN; b++) this.near[s][b].length = 0;
    for (let i = 0; i < g.hi; i++) {
      if (g.st[i] !== 1) continue;
      const y = g.y[i];
      if (y < OUT_Y1) {
        if (y > OUT_Y1 - LAYER && this.unif() < PM) { g.y[i] = IN_Y0 + (OUT_Y1 - y); this.record(1); continue; }
        if (y > OUT_Y1 - ZONE) this.near[0][Math.min(NBIN - 1, Math.floor(g.x[i] / BINW))].push(i);
      } else {
        if (y < IN_Y0 + LAYER && this.unif() < PM) { g.y[i] = OUT_Y1 - (y - IN_Y0); this.record(-1); continue; }
        if (y < IN_Y0 + ZONE) this.near[1][Math.min(NBIN - 1, Math.floor(g.x[i] / BINW))].push(i);
      }
    }

    // transporters
    const sig = [M.sigmaNa(p.naO), M.sigmaNa(naI)];
    const cIn = this.sink ? 0 : this.countGlucose().inn / M.DOTS_PER_MM;
    const phi = Math.exp(-V / M.RTF);
    for (const t of this.ts) {
      if (t.blocked) continue;
      const sglt = t.kind === "SGLT";
      const s = t.side;
      if (t.cargo < 0) {
        // bind: rate kon·c·σ, with c the concentration on the side the carrier faces
        // (compartments taken as well mixed); the nearest free glucose is the one that binds
        const c = s === 0 ? p.co : cIn;
        const accept = sglt ? sig[s] : 1;
        if (c > 0 && this.unif() < 1 - Math.exp(-M.KON * c * accept * DT)) {
          const i = this.nearestG(s, t.x);
          if (i >= 0) {
            g.st[i] = 2; t.cargo = i; t.from = s;
            if (sglt) for (let k = 0; k < 2; k++) {
              const j = this.nearest(this.na, s, t.x);
              if (j >= 0) { this.na.st[j] = 2; t.na[k] = j; }
            }
            continue;
          }
        }
        const ke = M.KE * (sglt ? 1 - sig[s] : 1);
        if (this.unif() < 1 - Math.exp(-ke * DT)) t.side = (1 - s) as 0 | 1;
      } else {
        const kflip = sglt ? (s === 0 ? M.KF * phi : M.KF / phi) : M.KF;
        const tot = M.R + kflip;
        if (this.unif() < 1 - Math.exp(-tot * DT)) {
          if (this.unif() < M.R / tot) {
            // release to the side it faces
            const y = s === 0 ? OUT_Y1 - 1.2 : IN_Y0 + 1.2;
            g.st[t.cargo] = 1; g.x[t.cargo] = t.x + (this.unif() - 0.5); g.y[t.cargo] = y;
            if (s !== t.from) this.record(s === 1 ? 1 : -1);
            if (this.sink && s === 1) g.kill(t.cargo);
            t.cargo = -1;
            for (let k = 0; k < 2; k++) if (t.na[k] >= 0) {
              const j = t.na[k]; this.na.st[j] = 1; this.na.x[j] = t.x + (k ? 1 : -1); this.na.y[j] = y; t.na[k] = -1;
            }
          } else t.side = (1 - s) as 0 | 1;
        }
      }
    }
    if (this.sink) for (let i = 0; i < g.hi; i++) if (g.st[i] === 1 && g.y[i] >= IN_Y0) g.kill(i);

    // Na⁺ dots inside follow the cell's Na⁺ (model.ts): pump throws extra dots out, the leak lets dots in
    let nIn = 0;
    for (let i = 0; i < this.na.hi; i++) if (this.na.st[i] === 1 && this.na.y[i] >= IN_Y0) nIn++;
    const target = Math.round(naI * M.NA_DOTS_PER_MM);
    if (nIn > target && p.pump && this.unif() < 0.5) {
      const j = this.nearest(this.na, 1, PUMP_X);
      if (j >= 0) { this.na.x[j] = PUMP_X + this.unif() - 0.5; this.na.y[j] = OUT_Y1 - 1.2; }
    } else if (nIn < target && this.unif() < 0.5) {
      const j = this.nearest(this.na, 0, LEAK_X);
      if (j >= 0) { this.na.x[j] = LEAK_X + this.unif() - 0.5; this.na.y[j] = IN_Y0 + 1.2; }
    }

    this.clamp();
    this.t += DT;
    if (Math.floor(this.t + 1e-9) >= this.bins.length) this.bins.push(0);
  }

  /** Measured uptake rate (dots/s = mM/min) over the last `win` whole seconds. */
  rate(win = 10): number | null {
    const full = this.bins.length - 1;            // completed seconds
    if (full < 2) return null;
    const k = Math.min(win, full);
    let s = 0; for (let i = full - k; i < full; i++) s += this.bins[i];
    return s / k;
  }
}

/** One point of an uptake assay: a fresh cell at outside glucose co, inside kept at ~0
 *  (as in a short assay), net uptake counted for T seconds. Returns dots/s = mM/min. */
export function assayPoint(p: M.Params, cell: M.CellState, co: number, T: number, seed: number): number {
  const s = new UptakeSim({ ...p, co }, { ...cell }, seed);
  s.sink = true;
  const n = Math.round(T / DT);
  for (let k = 0; k < 120; k++) s.tick();        // 2 s to let the transporters settle
  s.netIn = 0;
  for (let k = 0; k < n; k++) s.tick();
  return s.netIn / T;
}
