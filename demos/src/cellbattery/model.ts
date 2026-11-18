// The cell battery: exact Nernst and Goldman–Hodgkin–Katz (GHK) equations. Pure code.

export const R = 8.314, F = 96485, T = 310;           // J/(mol K), C/mol, K (37 °C)
export const RTF = R * T / F * 1000;                  // mV, 26.7
export type Ion = "K" | "Na" | "Cl";
export const IONS: Ion[] = ["K", "Na", "Cl"];
export const Z: Record<Ion, number> = { K: 1, Na: 1, Cl: -1 };
export const NAME: Record<Ion, string> = { K: "K⁺", Na: "Na⁺", Cl: "Cl⁻" };
export const COLOR: Record<Ion, string> = { K: "#8e44ad", Na: "#1c4fa0", Cl: "#2b8a3e" };

export interface State {
  cin: Record<Ion, number>;    // mM
  cout: Record<Ion, number>;   // mM
  P: Record<Ion, number>;      // relative permeability (resting K⁺ = 1)
  lidocaine: boolean;
}
/** Lidocaine blocks the Na⁺ channels that open: only the resting Na⁺ leak is left. */
export const NA_LEAK = 0.035;
export const effP = (s: State): Record<Ion, number> => ({ ...s.P, Na: s.lidocaine ? Math.min(s.P.Na, NA_LEAK) : s.P.Na });

/** Nernst potential (mV): E = (RT/zF) ln(c_out/c_in). */
export const nernst = (s: State, ion: Ion) => RTF / Z[ion] * Math.log(s.cout[ion] / s.cin[ion]);

/** GHK voltage equation (mV): anions enter with inside and outside swapped. */
export function ghk(s: State): number {
  const P = effP(s);
  const num = P.K * s.cout.K + P.Na * s.cout.Na + P.Cl * s.cin.Cl;
  const den = P.K * s.cin.K + P.Na * s.cin.Na + P.Cl * s.cout.Cl;
  return RTF * Math.log(num / den);
}

/**
 * GHK unidirectional fluxes of one ion at voltage V (mV), in arbitrary units ∝ P·c.
 * Returns {eff, inf}: ions per unit time going out and in. Net out = eff − inf.
 */
export function fluxes(s: State, ion: Ion, V: number): { eff: number; inf: number } {
  const P = effP(s)[ion], u = Z[ion] * V / RTF;
  const g = Math.abs(u) < 1e-6 ? 1 : u / (1 - Math.exp(-u));      // → 1 as u → 0
  return { eff: P * s.cin[ion] * g, inf: P * s.cout[ion] * g * Math.exp(-u) };
}

export const LECTURE: State = {
  cin: { K: 140, Na: 12, Cl: 10 }, cout: { K: 5, Na: 145, Cl: 110 },
  P: { K: 1, Na: 0.035, Cl: 0.1 }, lidocaine: false,
};
