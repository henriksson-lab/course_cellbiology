// Airy pattern of a circular lens (incoherent light), Rayleigh and Sparrow limits.

/** Bessel function J1(x), Abramowitz & Stegun 9.4.4 / 9.4.6 (error < 1e-7). */
export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 3) {
    const y = (x / 3) ** 2;
    return x * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289
      + y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
  }
  const y = 3 / ax;
  const f = 0.79788456 + y * (0.00000156 + y * (0.01659667 + y * (0.00017105
    + y * (-0.00249511 + y * (0.00113653 - y * 0.00020033)))));
  const t = ax - 2.35619449 + y * (0.12499612 + y * (0.00005650 + y * (-0.00637879
    + y * (0.00074348 + y * (0.00079824 - y * 0.00029166)))));
  const r = f * Math.cos(t) / Math.sqrt(ax);
  return x < 0 ? -r : r;
}

/** Normalised Airy intensity [2 J1(v)/v]^2, v = 2π NA r / λ. Peak 1 at v = 0. */
export function airy(v: number): number {
  if (Math.abs(v) < 1e-6) return 1;
  const a = 2 * besselJ1(v) / v;
  return a * a;
}

/** Rayleigh limit d = 0.61 λ / NA (first zero of the Airy pattern). */
export const rayleigh = (lambda: number, na: number) => 0.61 * lambda / na;

/** Sparrow limit: the dip between two equal spots disappears, d ≈ 0.47 λ / NA. */
export const sparrow = (lambda: number, na: number) => 0.47 * lambda / na;

/** Intensity along the line through two point sources at ±d/2, at position x (same units). */
export function profile(x: number, d: number, lambda: number, na: number): [number, number] {
  const k = 2 * Math.PI * na / lambda;
  return [airy(k * (x + d / 2)), airy(k * (x - d / 2))];
}

/** Intensity at the midpoint relative to the peak of the summed profile (1 = no dip). */
export function dipRatio(d: number, lambda: number, na: number): number {
  const mid = 2 * profile(0, d, lambda, na)[0];
  let peak = 0;
  const n = 400;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * d;           // search from the midpoint outward past one source
    const [a, b] = profile(x, d, lambda, na);
    peak = Math.max(peak, a + b);
  }
  return mid / peak;
}

/** Approximate RGB of a visible wavelength in nm (for the display only). */
export function wavelengthRGB(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else { r = 1; }
  // fade at the ends of the visible range
  const f = nm < 420 ? 0.4 + 0.6 * (nm - 380) / 40 : nm > 680 ? 0.4 + 0.6 * (750 - nm) / 70 : 1;
  return [r * f, g * f, b * f].map(c => Math.round(255 * Math.min(1, Math.max(0, c)))) as [number, number, number];
}
