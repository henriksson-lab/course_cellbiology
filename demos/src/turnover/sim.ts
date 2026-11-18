// Stochastic version of the turnover model for the particle view: molecules are made at
// random times (Poisson, rate k_s) and each molecule is destroyed with probability
// k_d·dt per step, with the same rates as the exact model (model.ts). Averaged over many
// runs it follows the exact curve; one run wobbles around it by about √N.
// Geometry (a cell with a nucleus and proteasomes) lives here too, in world units
// W × H; no DOM, so it can be run in Node.
import { rng } from "../lib/ui";
import { Setup, Which, rates } from "./model";

export const W = 100, H = 56;
export const CELL = { cx: 50, cy: 28, rx: 47, ry: 25.5 };
export const NUC = { cx: 50, cy: 28, rx: 13, ry: 9 };
export const PROTEASOMES: [number, number][] = [
  [17, 18], [24, 38], [35, 10], [33, 45], [72, 9], [69, 45], [82, 20], [86, 35], [10, 29], [52, 47.5], [50, 7.5],
];
export const GROW_S = 0.5;      // real seconds for a new molecule to appear (no flashing)
export const PROT_S = 0.9;      // real seconds to travel into a proteasome
export const FADE_S = 0.7;      // real seconds to fade (lysosome or dilution)

export interface Dot { x: number; y: number; age: number }
export interface Anim { w: number; x0: number; y0: number; x1: number; y1: number; t: number; kind: "prot" | "fade" }

const inCell = (x: number, y: number) => ((x - CELL.cx) / (CELL.rx - 1.5)) ** 2 + ((y - CELL.cy) / (CELL.ry - 1.5)) ** 2 < 1
  && ((x - NUC.cx) / (NUC.rx + 1.2)) ** 2 + ((y - NUC.cy) / (NUC.ry + 1.2)) ** 2 > 1;

export class TurnoverSim {
  t = 0;                                   // hours
  alive: Dot[][] = [[], []];               // [target, bystander]
  anims: Anim[] = [];
  private r: ReturnType<typeof rng>;

  constructor(public s: Setup, public m: number, seed = 11) {
    this.r = rng(seed);
    const whichs: Which[] = ["target", "bystander"];
    whichs.forEach((w, i) => {
      const n0 = this.s.start === "zero" ? 0 : this.poisson(rates(s, w, false).ks / rates(s, w, false).kd / m);
      for (let k = 0; k < n0; k++) this.alive[i].push({ ...this.place(), age: GROW_S });
    });
  }

  /** molecules per cell (dots × molecules per dot) */
  count(i: number): number { return this.alive[i].length * this.m; }

  place(): { x: number; y: number } {
    for (;;) {
      const x = CELL.cx + (this.r.unif() * 2 - 1) * CELL.rx, y = CELL.cy + (this.r.unif() * 2 - 1) * CELL.ry;
      if (inCell(x, y)) return { x, y };
    }
  }

  poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 40) return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.r.norm()));
    const L = Math.exp(-mean); let k = 0, p = 1;
    for (;;) { p *= this.r.unif(); if (p <= L) return k; k++; }
  }

  /** Advance by dtH hours of cell time and dtReal seconds of screen time. */
  step(dtH: number, dtReal: number, animate = true): void {
    const after = this.t >= this.s.tAdd;
    (["target", "bystander"] as Which[]).forEach((w, i) => {
      const rt = rates(this.s, w, after);
      const born = this.poisson(rt.ks * dtH / this.m);
      for (let k = 0; k < born; k++) this.alive[i].push({ ...this.place(), age: 0 });
      const a = this.alive[i];
      const die = Math.min(a.length, this.poisson(a.length * (1 - Math.exp(-rt.kd * dtH))));
      for (let k = 0; k < die; k++) {
        const j = Math.floor(this.r.unif() * a.length);
        const d = a[j]; a[j] = a[a.length - 1]; a.pop();
        if (!animate) continue;
        const prot = this.r.unif() < rt.kProt / rt.kd;
        let x1 = d.x, y1 = d.y;
        if (prot) {
          let bd = Infinity;
          for (const [px, py] of PROTEASOMES) { const dd = (px - d.x) ** 2 + (py - d.y) ** 2; if (dd < bd) { bd = dd; x1 = px; y1 = py; } }
        }
        this.anims.push({ w: i, x0: d.x, y0: d.y, x1, y1, t: 0, kind: prot ? "prot" : "fade" });
      }
    });
    this.t += dtH;
    if (!animate) return;
    // gentle jiggle (not to scale: real proteins diffuse across a cell in seconds)
    for (const a of this.alive) for (const d of a) {
      d.age += dtReal;
      const x = d.x + 0.06 * this.r.norm(), y = d.y + 0.06 * this.r.norm();
      if (inCell(x, y)) { d.x = x; d.y = y; }
    }
    for (const an of this.anims) an.t += dtReal;
    this.anims = this.anims.filter(an => an.t < (an.kind === "prot" ? PROT_S : FADE_S));
  }
}
