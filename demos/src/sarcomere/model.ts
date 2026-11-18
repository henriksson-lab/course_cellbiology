// Sarcomere model, no DOM (can be bundled for Node to check numbers).
//
// 1. Geometry (accurate in shape): frog skeletal muscle filament lengths as used by
//    Gordon, Huxley & Julian (1966): thick filament 1.6 µm with a bare zone (no heads)
//    of 0.2 µm in the middle; thin filament 1.0 µm from each Z-disc, Z-disc 0.05 µm.
//    Descending limb: force ∝ overlap of the head-bearing part of the thick filament
//    with thin filaments. Plateau 2.0–2.25 µm; zero force at 3.65 µm.
//    Ascending limb (below 2.0 µm): thin filaments from the two halves overlap each other
//    and get in the way, and below 1.65 µm the thick filaments hit the Z-discs. Here the
//    model uses the piecewise-linear fit of the GHJ data: 84 % at 1.65 µm, zero at 1.27 µm.
// 2. Ca²⁺ (qualitative): fraction of binding sites exposed by troponin–tropomyosin
//    = Hill curve, K = 1 µM, n = 3 (cooperative). Resting cytosol 0.1 µM ≈ 0; 10 µM ≈ 1.
// 3. Heads available (qualitative): a fraction of myosin heads is "parked" (folded onto
//    the thick filament, the super-relaxed state) and cannot bind. Control: 40 % parked.
//    HCM mutation: 20 % parked. Mavacamten parks more heads: dose d (0–1) moves the
//    available fraction towards 15 %.
// Active force (relative to control, full Ca²⁺, optimal length) =
//    length factor × exposed fraction × available heads / available heads in control.

export const THICK = 1.6, BARE = 0.2, THIN = 1.0, ZW = 0.05;
export const SL_MIN = 1.2, SL_MAX = 3.8;
/** break points of the length–tension curve (µm) */
export const BP = { zero: 1.27, knee: 1.65, plateau0: 2.0, plateau1: THIN * 2 + ZW + BARE, end: THICK + 2 * THIN + ZW };

/** Half-sarcomere overlap (µm) between the head-bearing part of a thick filament and thin filaments. */
export function overlap(sl: number): number {
  const half = sl / 2;
  const thinTipFromM = half - ZW / 2 - THIN;          // distance of the thin filament tip from the M-line
  const heads0 = BARE / 2, heads1 = THICK / 2;          // head-bearing zone, distance from the M-line
  return Math.max(0, heads1 - Math.max(heads0, thinTipFromM));
}
export const MAX_OVERLAP = THICK / 2 - BARE / 2;      // 0.7 µm

/** Length factor 0–1: fraction of the maximal isometric force (full activation). */
export function lengthFactor(sl: number): number {
  if (sl >= BP.plateau0) return overlap(sl) / MAX_OVERLAP;
  if (sl >= BP.knee) return 0.84 + 0.16 * (sl - BP.knee) / (BP.plateau0 - BP.knee);
  if (sl > BP.zero) return 0.84 * (sl - BP.zero) / (BP.knee - BP.zero);
  return 0;
}

export const CA_K = 1.0, CA_N = 3;
/** Fraction of actin binding sites uncovered by tropomyosin at cytosolic Ca²⁺ `ca` (µM). */
export function exposed(ca: number): number {
  const x = Math.pow(ca / CA_K, CA_N);
  return x / (1 + x);
}

export const AVAIL_CONTROL = 0.6, AVAIL_HCM = 0.8, AVAIL_DRUG_MIN = 0.15;
/** Fraction of heads that are not parked. dose 0–1 (mavacamten, qualitative). */
export function available(hcm: boolean, dose: number): number {
  const a0 = hcm ? AVAIL_HCM : AVAIL_CONTROL;
  return a0 - (a0 - AVAIL_DRUG_MIN) * dose;
}

export interface Cond { sl: number; ca: number; hcm: boolean; dose: number; atp: boolean }

/** Active isometric force relative to control at optimal length and full Ca²⁺ (1 = 100 %). */
export function force(c: Cond): number {
  return lengthFactor(c.sl) * exposed(c.ca) * available(c.hcm, c.dose) / AVAIL_CONTROL;
}

/** Band widths (µm) for the labels: A band, I band (each half-I summed), H zone. */
export function bands(sl: number) {
  const A = THICK;
  const I = Math.max(0, sl - THICK);                    // both half-I bands together
  const H = Math.max(0, sl - 2 * THIN - ZW);            // zone in the A band with no thin filament
  return { A, I, H };
}

// ---- cross-bridge cycle timings (seconds of real time) for the animation.
// About one cycle per second per head, like a slow (cardiac) myosin in a muscle that is
// held at fixed length. Fast skeletal myosin cycles several times faster.
export const T = {
  bindRate: 2.5,      // per second, for a head that can reach an exposed site
  pRelease: 0.06,     // attached, before the power stroke (Pi leaves)
  stroke: 0.12,       // the power stroke itself (drawn as a smooth swing)
  adp: 0.18,          // attached after the stroke until ATP binds (needs ADP to leave)
  recock: 0.15,       // detached; ATP hydrolysis re-cocks the lever
};
