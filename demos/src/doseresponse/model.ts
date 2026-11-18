// Dose–response model (no DOM, so it can be run in Node to check the task solutions).
//
// Two drugs compete for one binding site on the receptor (law of mass action):
//   occupancy by drug i:  p_i = (c_i/K_i) / (1 + c_1/K_1 + c_2/K_2)
// Response with amplification: the operational model of Black and Leff (slope 1),
//   S = r · (τ_1 p_1 + τ_2 p_2),   response = S / (1 + S)   (fraction of the cell's maximum)
// τ ("transducer ratio") = efficacy of the drug × amplification in this cell; a drug alone
// gives maximum τ/(1+τ) at EC50 = K/(1+τ). r = fraction of receptors still available
// (fewer after desensitisation or an irreversible blocker).
// Without amplification: response = r · (m_1 p_1 + m_2 p_2), with m = τ/(1+τ) the drug's
// maximum, so the response is proportional to occupancy and EC50 = K_d.
// Concentrations and K_d in nM.

export interface Drug {
  name: string;
  kd: number;      // dissociation constant (nM)
  tau: number;     // efficacy × amplification at full receptor number; 0 = antagonist
  role: string;    // short description for the legend
}

export interface Cell {
  receptors: number;     // fraction of receptors available, 0–1
  amplification: boolean;
}

export const maxAlone = (tau: number) => tau / (1 + tau);
export const tauFromMax = (m: number) => m / (1 - m);

/** Occupancy by drug 1 and drug 2, and the response (0–1). */
export function respond(d1: Drug, c1: number, d2: Drug | null, c2: number, cell: Cell) {
  const x1 = c1 / d1.kd, x2 = d2 && c2 > 0 ? c2 / d2.kd : 0;
  const den = 1 + x1 + x2;
  const p1 = x1 / den, p2 = x2 / den;
  const t2 = d2 ? d2.tau : 0;
  let resp: number;
  if (cell.amplification) {
    const S = cell.receptors * (d1.tau * p1 + t2 * p2);
    resp = S / (1 + S);
  } else {
    resp = cell.receptors * (maxAlone(d1.tau) * p1 + maxAlone(t2) * p2);
  }
  return { p1, p2, resp };
}

/**
 * Midpoint of a curve f(c) over concentrations: the c where f is halfway between its value
 * at c → 0 and at c → ∞. Returns null if the curve changes by less than 1 % of the maximum.
 * `rising` tells whether it is an EC50 (rising) or an IC50 (falling).
 */
export function midpoint(f: (c: number) => number) {
  const lo = f(1e-9), hi = f(1e12);
  if (Math.abs(hi - lo) < 0.01) return { c50: null as number | null, lo, hi, rising: hi > lo };
  const half = (lo + hi) / 2;
  let a = -9, b = 12;
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2;
    const v = f(Math.pow(10, m));
    if ((v - half) * (hi - lo) < 0) a = m; else b = m;
  }
  return { c50: Math.pow(10, (a + b) / 2), lo, hi, rising: hi > lo };
}

// ---- drugs. K_d values: rounded literature values for the human receptor (they vary
// several-fold between assays). Efficacies (τ) are illustrative.
export const RECEPTORS = {
  opioid: {
    label: "μ-opioid receptor (pain relief, breathing)",
    short: "μ-opioid receptor",
    drugs: [
      { name: "morphine", kd: 1, tau: 20, role: "full agonist" },
      { name: "fentanyl", kd: 1, tau: 60, role: "full agonist, higher efficacy" },
      { name: "buprenorphine", kd: 0.2, tau: 1, role: "partial agonist" },
      { name: "naloxone", kd: 1.5, tau: 0, role: "antagonist" },
    ] as Drug[],
  },
  beta: {
    label: "β₁-adrenergic receptor (heart rate)",
    short: "β₁-adrenergic receptor",
    drugs: [
      { name: "noradrenaline", kd: 1000, tau: 20, role: "full agonist, natural signal" },
      { name: "pindolol", kd: 2, tau: 0.4, role: "partial agonist" },
      { name: "metoprolol", kd: 50, tau: 0, role: "antagonist, β₁-selective" },
      { name: "propranolol", kd: 2, tau: 0, role: "antagonist, non-selective" },
    ] as Drug[],
  },
};
export type ReceptorKey = keyof typeof RECEPTORS;

export const fmtC = (nM: number) => {
  const p = (v: number) => String(+v.toPrecision(2));
  if (nM >= 1e6) return p(nM / 1e6) + " mM";
  if (nM >= 1000) return p(nM / 1000) + " µM";
  if (nM >= 1) return p(nM) + " nM";
  return p(nM * 1000) + " pM";
};
