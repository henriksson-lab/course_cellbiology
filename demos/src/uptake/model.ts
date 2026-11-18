// Uptake assay: the shared kinetic model. The particle view (sim.ts) uses these rates for
// its random events; the equation view integrates the same model as smooth fluxes. So the
// two views show the same thing, once as counted molecules and once as concentrations.
//
// A transporter is a four-state alternating-access cycle:
//   Eo (empty, facing out) ⇄ Lo (loaded, facing out) ⇄ Li (loaded, facing in) ⇄ Ei ⇄ Eo
// binding:  kon·c·σ  (σ = probability that 2 Na⁺ are bound: SGLT only; 1 for GLUT)
// release:  R (to the side it faces)
// loaded flip: KF (GLUT); for SGLT KF·exp(∓V/(RT/F)), since 2 positive charges cross
// empty flip:  KE (GLUT); for SGLT KE·(1−σ), since only the Na⁺-free carrier flips back
// These rules obey detailed balance, so GLUT can only equalise glucose (in/out → 1) and SGLT
// can concentrate it up to (Na_out/Na_in)²·exp(−2FV/RT).

export const RTF = 26.7;            // mV at 37 °C
export const KON = 4;               // per mM per s (matches the particle capture rule, see sim.ts)
export const R = 8, KF = 4, KE = 4; // per s (illustrative, slow motion: real GLUT1 turns over ~1000/s)
export const KNA = 30;              // mM, Na⁺ affinity of SGLT (Hill coefficient 2)
export const P_BILAYER = 0.103;     // dots/s per mM gradient (glucose through pure lipid: very slow)
export const DOTS_PER_MM = 60;      // glucose dots per mM in a compartment: 1 dot/s = 1 mM/min
export const NA_DOTS_PER_MM = 3;    // Na⁺ dots per mM (Na⁺ is drawn at a different scale)
export const NA_IN0 = 12, NA_OUT0 = 145, V0 = -70;
export const LEAK = 0.03;           // per s, Na⁺ leak into the cell
export const KP = 10;               // mM, Na⁺/K⁺ pump half-saturation (inside Na⁺)
export const PMAX = LEAK * (NA_OUT0 - NA_IN0) * (NA_IN0 + KP) / NA_IN0;   // keeps Na_in = 12 mM at rest
export const TAU_V = 1 / LEAK;      // s, the voltage runs down with the gradient when the pump stops
export const GLIFLOZIN_FREE = 0.1;  // fraction of SGLT left unblocked by the drug

export type Kind = "GLUT" | "SGLT";
export const sigmaNa = (na: number) => na * na / (na * na + KNA * KNA);

export interface Rates { a12: number; a21: number; a23: number; a32: number; a34: number; a43: number; a41: number; a14: number }

/** Rate constants for one transporter. States 1 Eo, 2 Lo, 3 Li, 4 Ei. */
export function rates(kind: Kind, co: number, ci: number, naO: number, naI: number, V: number): Rates {
  const so = kind === "SGLT" ? sigmaNa(naO) : 1, si = kind === "SGLT" ? sigmaNa(naI) : 1;
  const phi = kind === "SGLT" ? Math.exp(-V / RTF) : 1;
  return {
    a12: KON * co * so, a21: R,
    a23: KF * phi, a32: KF / phi,
    a34: R, a43: KON * ci * si,
    a41: KE * (kind === "SGLT" ? 1 - si : 1), a14: KE * (kind === "SGLT" ? 1 - so : 1),
  };
}

/** Steady-state net inward flux (glucose per s) through one transporter. */
export function cycleFlux(k: Rates): number {
  // solve Q p = 0 with Σp = 1 (4 states, Gaussian elimination)
  const A = [
    [-(k.a12 + k.a14), k.a21, 0, k.a41],
    [k.a12, -(k.a21 + k.a23), k.a32, 0],
    [0, k.a23, -(k.a32 + k.a34), k.a43],
    [1, 1, 1, 1],
  ];
  const b = [0, 0, 0, 1];
  for (let c = 0; c < 4; c++) {
    let piv = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < 4; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let j = c; j < 4; j++) A[r][j] -= f * A[c][j];
      b[r] -= f * b[c];
    }
  }
  const p = b.map((v, i) => v / A[i][i]);
  return p[1] * k.a23 - p[2] * k.a32;
}

export interface Params {
  path: "bilayer" | Kind; nT: number; co: number; naO: number; pump: boolean; gliflozin: boolean;
}

/** Number of working transporters. */
export const working = (p: Params) => p.path === "bilayer" ? 0
  : p.path === "SGLT" && p.gliflozin ? Math.round(GLIFLOZIN_FREE * p.nT) : p.nT;

/** Net glucose uptake (dots/s = mM/min) at inside concentration ci. */
export function uptake(p: Params, ci: number, naI: number, V: number): number {
  let J = P_BILAYER * (p.co - ci);
  const n = working(p);
  if (n > 0 && p.path !== "bilayer") J += n * cycleFlux(rates(p.path, p.co, ci, p.naO, naI, V));
  return J;
}

/** Shared state of the cell: inside Na⁺ (mM) and how charged the "battery" is (0–1). */
export interface CellState { naI: number; q: number }
export const voltage = (s: CellState) => V0 * s.q;

/** Advance the Na⁺ state by dt seconds. sglt = SGLT glucose flux (dots/s), which brings in 2 Na⁺ each. */
export function stepCell(s: CellState, p: Params, sgltFlux: number, dt: number) {
  const pumpRate = p.pump ? PMAX * s.naI / (s.naI + KP) : 0;
  const dNa = LEAK * (p.naO - s.naI) + 2 * sgltFlux / DOTS_PER_MM - pumpRate;
  s.naI = Math.max(0, s.naI + dNa * dt);
  s.q += ((p.pump ? 1 : 0) - s.q) * dt / TAU_V;
}

/** Fit v = Vmax·c/(Km + c) by least squares (grid in log Km, Vmax closed form). */
export function fitMM(pts: { c: number; v: number }[]): { vmax: number; km: number } | null {
  if (pts.length < 3) return null;
  let best = { e: Infinity, vmax: 0, km: 1 };
  for (let k = 0; k <= 400; k++) {
    const km = Math.pow(10, -2 + 4 * k / 400);
    let sb = 0, sbb = 0;
    for (const p of pts) { const b = p.c / (km + p.c); sb += p.v * b; sbb += b * b; }
    const vmax = sb / sbb;
    let e = 0; for (const p of pts) { const r = p.v - vmax * p.c / (km + p.c); e += r * r; }
    if (e < best.e) best = { e, vmax, km };
  }
  return best;
}

/** Fit v = P·c through the origin. */
export function fitLine(pts: { c: number; v: number }[]): number {
  let a = 0, b = 0; for (const p of pts) { a += p.c * p.v; b += p.c * p.c; }
  return b ? a / b : 0;
}

/** A fresh cell equilibrated in this bath: inside Na⁺ where leak and pump balance
 *  (no SGLT load); with the pump blocked, the gradients have run down. */
export function freshCell(p: Params): CellState {
  if (!p.pump) return { naI: p.naO, q: 0 };
  const b = LEAK * p.naO - LEAK * KP - PMAX;
  return { naI: (b + Math.sqrt(b * b + 4 * LEAK * LEAK * p.naO * KP)) / (2 * LEAK), q: 1 };
}
