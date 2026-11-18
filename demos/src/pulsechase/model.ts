// Pulse-chase of a fluorescent cargo through the secretory pathway: a qualitative
// compartment model (first-order transfer between compartments, illustrative rates in
// the range seen in VSVG-ts045 and RUSH experiments at 37 °C). No DOM here, so the
// numbers in the task solutions can be checked in Node.
//
// Compartments: ER → ERGIC → Golgi stack → TGN → then one of three routes:
//   constitutive: carrier vesicles → docked at the plasma membrane → fused (surface / secreted)
//   regulated:    secretory granules (reserve) ⇄ docked granules → fused only when Ca²⁺ is high
//   lysosomal:    (mannose-6-phosphate receptor) carrier vesicles → endosome/lysosome
// Blocks: 15 °C (stops ERGIC → Golgi), 20 °C (stops TGN exit), brefeldin A (Golgi
// collapses into the ER), botulinum/tetanus toxin (docked → fused stops), Ca²⁺ trigger.

export const ER = 0, ERGIC = 1, GOLGI = 2, TGN = 3, VES = 4, DOCK = 5, OUT = 6, LYS = 7;
export const NC = 8;

export type Cargo = "membrane" | "hormone" | "lysosomal";
export type Temp = 37 | 20 | 15;

export interface Conditions {
  cargo: Cargo;
  temp: Temp;
  bfa: boolean;      // brefeldin A present
  toxin: boolean;    // SNARE cleaved by botulinum/tetanus toxin light chain
  ca: boolean;       // Ca²⁺ stimulus on (regulated secretion)
  m6p: boolean;      // lysosomal enzyme carries its mannose-6-phosphate tag
}

export const DEFAULT_COND: Conditions = { cargo: "membrane", temp: 37, bfa: false, toxin: false, ca: false, m6p: true };

/** Rates in 1/min at 37 °C (illustrative). */
export const K = {
  erExit: 0.12,      // ER → ERGIC (COPII), t½ ≈ 6 min
  ergic: 0.4,        // ERGIC → cis-Golgi
  golgi: 0.12,       // across the stack to the TGN (cisternal maturation), ≈ 8 min
  tgnExit: 0.1,      // TGN → carriers / granules / lysosomal carriers
  carrier: 0.6,      // carrier vesicle reaches and docks at the plasma membrane
  fuse: 2.0,         // docked carrier fuses (SNAREs)
  toLys: 0.25,       // lysosomal carrier → endosome → lysosome
  // regulated secretion
  dockBasal: 0.015, undock: 0.06, dockCa: 0.03,
  fuseBasal: 0.002, fuseCa: 1.5,
  // brefeldin A
  bfaRetro: 0.3,     // Golgi / ERGIC content back into the ER while BFA is present
  golgiLoss: 1 / 2.5, golgiRegrow: 1 / 8,   // Golgi integrity: lost in minutes, back in ~10–20 min after washout
};

/** Slowing of every step by cold (qualitative, Q10 ≈ 2). */
export const TEMP_FACTOR: Record<Temp, number> = { 37: 1, 20: 0.35, 15: 0.25 };

/** Edges (from, to) whose cumulative flux we track, for moving the dots. */
export const EDGES: [number, number][] = [
  [ER, ERGIC], [ERGIC, GOLGI], [GOLGI, TGN], [TGN, VES], [VES, DOCK], [DOCK, OUT],
  [VES, LYS], [DOCK, VES], [GOLGI, ER], [ERGIC, ER],
];

export class Model {
  /** fraction of the cargo in each compartment */
  x = new Float64Array(NC);
  /** cumulative flux along each edge (fraction of all cargo) */
  flux = new Float64Array(EDGES.length);
  /** Golgi integrity, 1 = normal stack, 0 = fully merged with the ER (BFA) */
  g = 1;
  /** minutes since release (or since reset if not yet released) */
  t = 0;
  released = false;

  constructor(public c: Conditions = { ...DEFAULT_COND }) { this.x[ER] = 1; }

  release() { this.released = true; this.t = 0; }

  /** rate (1/min) of each edge under the current conditions */
  rates(): Float64Array {
    const c = this.c, f = TEMP_FACTOR[c.temp], g = this.g;
    const r = new Float64Array(EDGES.length);
    const regulated = c.cargo === "hormone";
    const toLys = c.cargo === "lysosomal" && c.m6p;
    r[0] = this.released ? K.erExit * f * g : 0;                    // ER → ERGIC
    r[1] = c.temp === 15 ? 0 : K.ergic * f * g;                       // ERGIC → Golgi
    r[2] = K.golgi * f * g;                                           // Golgi → TGN
    r[3] = c.temp === 20 ? 0 : K.tgnExit * f * g;                     // TGN → vesicles/granules
    if (regulated) {
      r[4] = (c.ca ? K.dockCa : K.dockBasal) * f;                     // granule reserve → docked
      r[5] = c.toxin ? 0 : (c.ca ? K.fuseCa : K.fuseBasal) * f;      // docked → secreted
      r[7] = K.undock * f;                                            // docked → reserve
    } else if (toLys) {
      r[6] = K.toLys * f;                                             // carrier → lysosome
    } else {
      r[4] = K.carrier * f;                                           // carrier → docked
      r[5] = c.toxin ? 0 : K.fuse * f;                                // docked → fused
    }
    if (c.bfa) { r[8] = K.bfaRetro * f; r[9] = K.bfaRetro * f; }     // Golgi, ERGIC → ER
    return r;
  }

  /** advance by dt minutes (sub-stepped Euler; rates ≤ 2/min) */
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
    for (let s = 0; s < n; s++) {
      const r = this.rates();
      const d = new Float64Array(NC);
      for (let e = 0; e < EDGES.length; e++) {
        if (!r[e]) continue;
        const [a, b] = EDGES[e];
        const q = r[e] * this.x[a] * h;
        d[a] -= q; d[b] += q; this.flux[e] += q;
      }
      for (let i = 0; i < NC; i++) this.x[i] = Math.max(0, this.x[i] + d[i]);
      const f = TEMP_FACTOR[this.c.temp];
      if (this.c.bfa) this.g -= this.g * K.golgiLoss * f * h;
      else this.g += (1 - this.g) * K.golgiRegrow * f * h;
      this.t += h;
    }
  }
}

/** The plotted series: compartments, merged where the plot shows one line. */
export interface Series { key: string; label: string; color: string; of: (x: Float64Array) => number }

export function seriesFor(cargo: Cargo, m6p: boolean): Series[] {
  const s: Series[] = [
    { key: "er", label: "ER", color: "#2a7f8f", of: x => x[ER] },
    { key: "ergic", label: "ERGIC", color: "#74b9c4", of: x => x[ERGIC] },
    { key: "golgi", label: "Golgi", color: "#d9822b", of: x => x[GOLGI] },
    { key: "tgn", label: "TGN", color: "#8f4f0e", of: x => x[TGN] },
  ];
  if (cargo === "hormone") {
    s.push({ key: "ves", label: "granules", color: "#7a4fb5", of: x => x[VES] + x[DOCK] });
    s.push({ key: "out", label: "secreted", color: "#1b2a3a", of: x => x[OUT] });
  } else if (cargo === "lysosomal" && m6p) {
    s.push({ key: "ves", label: "vesicles", color: "#7a4fb5", of: x => x[VES] + x[DOCK] });
    s.push({ key: "lys", label: "lysosomes", color: "#2e8b57", of: x => x[LYS] });
  } else {
    s.push({ key: "ves", label: "vesicles", color: "#7a4fb5", of: x => x[VES] + x[DOCK] });
    s.push({ key: "out", label: cargo === "membrane" ? "surface" : "secreted", color: "#1b2a3a", of: x => x[OUT] });
  }
  return s;
}
