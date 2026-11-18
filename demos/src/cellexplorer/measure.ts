// Measure mode of the cell explorer: the stereology part, with no DOM, so it can be
// bundled for Node and the task solutions checked against it.
//  - Each outline belongs to one compartment ("category"); the cytosol is what is
//    left inside the counting frame. Where outlines overlap, the smaller organelle wins
//    (fixed priority, the same for single points and for the area).
//  - Point counting: a square grid of test points with a random offset; a point
//    counts for the compartment it lies in (Delesse/Weibel: area fraction of a
//    compartment on a section estimates its volume fraction).
//  - Area: exact area of the outlines inside the frame, by scanlines (one per image
//    pixel row), the reference the point count is compared with.
import { CLASSES } from "./classes";
import data from "./outlines.json";

export type Cat = "nucleus" | "er" | "golgi" | "mito" | "endolyso" | "ld" | "cytosol";
export const CATS: Cat[] = ["nucleus", "er", "golgi", "mito", "endolyso", "ld", "cytosol"];

/** Outline class -> compartment. Nucleolus and envelope count as nucleus; the
 *  centriole (no membrane) and the plasma membrane line count as cytosol. */
export const CAT_OF: Record<string, Cat> = {
  nucleus: "nucleus", nucleolus: "nucleus", ne: "nucleus", er: "er", golgi: "golgi",
  mito: "mito", endolyso: "endolyso", ld: "ld", cent: "cytosol", pm: "cytosol",
};
/** Larger number wins where outlines overlap (smaller organelles on top). */
export const PRIORITY: Record<Cat, number> = { cytosol: 0, nucleus: 1, er: 2, golgi: 3, endolyso: 4, mito: 5, ld: 6 };

export type Ring = number[][];
export interface MShape { cat: Cat; rings: Ring[]; bbox: [number, number, number, number] }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

export const NM_PER_PX: number = data.nmPerPx;

/** All outlines as measure shapes, sorted by priority (low first). */
export function loadShapes(): MShape[] {
  const out: MShape[] = [];
  const sd = data.shapes as Record<string, number[][][][]>;
  for (const c of CLASSES) {
    const cat = CAT_OF[c.id];
    if (!cat || cat === "cytosol") continue;
    for (const rings of sd[c.id] ?? []) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of rings) for (const [x, y] of r) {
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      out.push({ cat, rings, bbox: [x0, y0, x1, y1] });
    }
  }
  return out.sort((a, b) => PRIORITY[a.cat] - PRIORITY[b.cat]);
}

function inside(x: number, y: number, sh: MShape): boolean {
  const [x0, y0, x1, y1] = sh.bbox;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  let c = false;
  for (const r of sh.rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

/** The compartment at image point (x, y). */
export function classify(x: number, y: number, shapes: MShape[]): Cat {
  let best: Cat = "cytosol";
  for (const sh of shapes) if (PRIORITY[sh.cat] > PRIORITY[best] && inside(x, y, sh)) best = sh.cat;
  return best;
}

/** Compartments within `tol` image px of (x, y): a point on an edge may count either way. */
export function classifyNear(x: number, y: number, tol: number, shapes: MShape[]): Set<Cat> {
  const s = new Set<Cat>();
  for (const [dx, dy] of [[0, 0], [tol, 0], [-tol, 0], [0, tol], [0, -tol]]) s.add(classify(x + dx, y + dy, shapes));
  return s;
}

/** Test points of a square grid with spacing `sp` (image px) and offset (ox, oy) in [0, 1). */
export function gridPoints(f: Rect, sp: number, ox: number, oy: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let y = f.y0 + oy * sp; y < f.y1; y += sp)
    for (let x = f.x0 + ox * sp; x < f.x1; x += sp) pts.push([x, y]);
  return pts;
}

export type Counts = Record<Cat, number>;
export const zeroCounts = (): Counts => ({ nucleus: 0, er: 0, golgi: 0, mito: 0, endolyso: 0, ld: 0, cytosol: 0 });

/** Point count: how many grid points fall in each compartment. */
export function pointCounts(pts: [number, number][], shapes: MShape[]): { cats: Cat[]; counts: Counts } {
  const counts = zeroCounts();
  const cats = pts.map(([x, y]) => classify(x, y, shapes));
  for (const c of cats) counts[c]++;
  return { cats, counts };
}

/** Area of each compartment inside the frame, in image px², by scanlines (`step` px apart). */
export function areas(f: Rect, shapes: MShape[], step = 1): Counts {
  const w = Math.round(f.x1 - f.x0);
  const lab = new Uint8Array(w);
  const pri = CATS.map(c => PRIORITY[c]);
  const catOfPri: Cat[] = [];
  CATS.forEach((c, i) => { catOfPri[pri[i]] = c; });
  const counts = zeroCounts();
  const xs: number[] = [];
  for (let y = f.y0 + step / 2; y < f.y1; y += step) {
    lab.fill(0);
    for (const sh of shapes) {
      if (y < sh.bbox[1] || y > sh.bbox[3] || sh.bbox[2] < f.x0 || sh.bbox[0] > f.x1) continue;
      xs.length = 0;
      for (const r of sh.rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, yi] = r[i], [xj, yj] = r[j];
          if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi));
        }
      }
      xs.sort((a, b) => a - b);
      const p = PRIORITY[sh.cat];
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // pixel centres x0 + i + 0.5 inside [xs[k], xs[k+1])
        const a = Math.max(0, Math.ceil(xs[k] - f.x0 - 0.5));
        const b = Math.min(w, Math.ceil(xs[k + 1] - f.x0 - 0.5));
        for (let i = a; i < b; i++) if (lab[i] < p) lab[i] = p;
      }
    }
    for (let i = 0; i < w; i++) counts[catOfPri[lab[i]]] += step;
  }
  return counts;
}

export const total = (c: Counts) => CATS.reduce((s, k) => s + c[k], 0);
