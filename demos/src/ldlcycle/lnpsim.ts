// LNP escape, one particle at a time: N_LNP particles in one endosome that acidifies.
// Each particle escapes at rate M.escRate(pH, pKa) or is handed to the lysosome at M.K_LYS
// (same rates as M.lnpFate). Time in seconds. No DOM.
import * as M from "./model";
import { rng } from "../lib/ui";

export const LW = 100, LH = 60;
export const LENDO = { x: 36, y: 30, r: 20 };
export const LLYSO = { x: 84, y: 34, r: 10 };
export const N_LNP = 100;
const T_MOVE = 20;   // seconds to travel to the lysosome or through the membrane

export interface Lnp {
  where: "endo" | "out" | "cyto" | "tolys" | "lys";
  x: number; y: number; x0: number; y0: number; x1: number; y1: number; t: number;
  fade: number; rna: boolean; rx: number; ry: number; phase: number;
}

export class LnpSim {
  t = 0;
  ps: Lnp[] = [];
  private r: () => number;
  constructor(public pKa: number, public pHend: number, seed = 1) {
    this.r = rng(seed * 31 + 7).unif;
    for (let i = 0; i < N_LNP; i++) {
      const a = this.r() * 6.2832, d = Math.sqrt(this.r()) * (LENDO.r - 2.5);
      const x = LENDO.x + d * Math.cos(a), y = LENDO.y + d * Math.sin(a);
      this.ps.push({ where: "endo", x, y, x0: x, y0: y, x1: x, y1: y, t: 0, fade: 1, rna: false, rx: 0, ry: 0, phase: this.r() * 6 });
    }
  }
  pH() { return M.endoPH(this.t / 60, this.pHend); }
  counts() {
    let esc = 0, endo = 0, lys = 0;
    for (const p of this.ps) { if (p.where === "endo") endo++; else if (p.where === "tolys" || p.where === "lys") lys++; else esc++; }
    return { esc, endo, lys };
  }
  step(dt: number) {
    const r = this.r, m = dt / 60;
    this.t += dt;
    const pEsc = M.escRate(this.pH(), this.pKa) * m, pLys = M.K_LYS * m;
    for (const p of this.ps) {
      if (p.where === "endo") {
        p.x += (r() - 0.5) * 0.5 * Math.min(1, dt * 4); p.y += (r() - 0.5) * 0.5 * Math.min(1, dt * 4);
        const dx = p.x - LENDO.x, dy = p.y - LENDO.y, d = Math.hypot(dx, dy), R = LENDO.r - 2.2;
        if (d > R) { p.x = LENDO.x + dx / d * R; p.y = LENDO.y + dy / d * R; }
        const u = r();
        if (u < pEsc) {
          p.where = "out"; p.t = 0; p.x0 = p.x; p.y0 = p.y;
          const a = Math.atan2(p.y - LENDO.y, p.x - LENDO.x);
          p.x1 = LENDO.x + (LENDO.r + 4) * Math.cos(a); p.y1 = LENDO.y + (LENDO.r + 4) * Math.sin(a);
          p.x1 = Math.max(3, Math.min(LW - 6, p.x1)); p.y1 = Math.max(6, Math.min(LH - 3, p.y1));
        } else if (u < pEsc + pLys) {
          p.where = "tolys"; p.t = 0; p.x0 = p.x; p.y0 = p.y;
          const a = r() * 6.2832, d = Math.sqrt(r()) * (LLYSO.r - 2);
          p.x1 = LLYSO.x + d * Math.cos(a); p.y1 = LLYSO.y + d * Math.sin(a);
        }
      } else if (p.where === "out" || p.where === "tolys") {
        p.t += dt;
        const f = Math.min(1, p.t / T_MOVE), e = f * f * (3 - 2 * f);
        p.x = p.x0 + (p.x1 - p.x0) * e; p.y = p.y0 + (p.y1 - p.y0) * e;
        if (f >= 1) {
          if (p.where === "out") { p.where = "cyto"; p.rna = true; p.rx = p.x + 1.6; p.ry = p.y; }
          else p.where = "lys";
        }
      } else if (p.where === "cyto") {
        p.fade = Math.max(0.35, p.fade - m / 10);           // empty lipid shell fades; the RNA stays
      } else if (p.where === "lys") {
        p.fade = Math.max(0, p.fade - m / 10);              // destroyed over ~10 min
      }
    }
  }
}
