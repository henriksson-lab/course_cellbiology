// Simulated blood sample (white cells after red-cell lysis) for the gating game.
// Scatter on a linear 0–1023 scale; CD4 and CD8 fluorescence as log10 values (0–4.5).
// Illustrative numbers, of the right kind for human blood.
import { rng } from "../lib/ui";

export type CellType = "debris" | "lymph" | "mono" | "gran";
export type TSub = "CD4" | "CD8" | "DN" | "DP";   // lymphocyte subsets (DN: B and NK cells)

export interface Cell { fsc: number; ssc: number; cd4: number; cd8: number; type: CellType; sub?: TSub }

export interface Sample {
  name: string;
  n: number;
  frac: Record<CellType, number>;          // share of all events
  sub: Record<TSub, number>;               // share of lymphocytes
}

export const SAMPLES: Record<string, Sample> = {
  healthy: {
    name: "Healthy donor", n: 4000,
    frac: { debris: 0.10, lymph: 0.28, mono: 0.07, gran: 0.55 },
    sub: { CD4: 0.45, CD8: 0.25, DN: 0.28, DP: 0.02 },
  },
  hiv: {
    name: "Untreated HIV infection", n: 4000,
    frac: { debris: 0.12, lymph: 0.24, mono: 0.07, gran: 0.57 },
    sub: { CD4: 0.14, CD8: 0.52, DN: 0.32, DP: 0.02 },
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function simulate(s: Sample, seed: number): Cell[] {
  const r = rng(seed);
  const N = r.norm;
  const cells: Cell[] = [];
  const types: CellType[] = ["debris", "lymph", "mono", "gran"];
  const subs: TSub[] = ["CD4", "CD8", "DN", "DP"];
  const pick = <K extends string>(keys: K[], p: Record<K, number>): K => {
    let u = r.unif();
    for (const k of keys) { u -= p[k]; if (u < 0) return k; }
    return keys[keys.length - 1];
  };
  const neg = () => 0.75 + 0.28 * N();
  for (let i = 0; i < s.n; i++) {
    const type = pick(types, s.frac);
    let fsc = 0, ssc = 0, cd4 = neg(), cd8 = neg(), sub: TSub | undefined;
    if (type === "debris") {
      fsc = 12 + Math.abs(75 * N()) + 30 * r.unif(); ssc = 10 + Math.abs(90 * N()) + 20 * r.unif();
      cd4 = 0.5 + 1.6 * r.unif(); cd8 = 0.5 + 1.6 * r.unif();
    } else if (type === "lymph") {
      fsc = 330 + 38 * N(); ssc = 115 + 22 * N();
      sub = pick(subs, s.sub);
      if (sub === "CD4" || sub === "DP") cd4 = 3.0 + 0.2 * N();
      if (sub === "CD8" || sub === "DP") cd8 = 3.2 + 0.22 * N();
    } else if (type === "mono") {
      fsc = 520 + 50 * N(); ssc = 300 + 45 * N();
      cd4 = 2.25 + 0.2 * N();                 // monocytes carry a little CD4
      cd8 = 1.0 + 0.25 * N();
    } else {
      fsc = 600 + 55 * N(); ssc = 640 + 85 * N();
      cd4 = 1.25 + 0.25 * N(); cd8 = 1.2 + 0.25 * N();   // autofluorescence only
    }
    cells.push({ fsc: clamp(fsc, 2, 1020), ssc: clamp(ssc, 2, 1020), cd4: clamp(cd4, 0.05, 4.45), cd8: clamp(cd8, 0.05, 4.45), type, sub });
  }
  return cells;
}

/** Even-odd point-in-polygon. */
export function inPoly(x: number, y: number, poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export type Quad = "CD4" | "CD8" | "DN" | "DP";
export function quadrant(c: Cell, t4: number, t8: number): Quad {
  const p4 = c.cd4 >= t4, p8 = c.cd8 >= t8;
  return p4 && p8 ? "DP" : p4 ? "CD4" : p8 ? "CD8" : "DN";
}
