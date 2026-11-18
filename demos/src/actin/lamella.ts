// Tab 2 of the actin demo: the leading edge of a lamellipodium, a 1 µm wide strip seen
// from above. Pure model code (no DOM), so it can be bundled for Node to check numbers.
//
// Model (stochastic, qualitative; the "dendritic nucleation" picture):
//  - Filaments are straight lines fixed to the substrate (no retrograde flow, as in a fish
//    keratocyte). Their barbed ends grow towards the membrane at k_on·[G-actin] subunits/s.
//  - Arp2/3 makes new branches at 70° on filaments next to the membrane (on the side facing
//    the membrane), at a rate set by
//    the Arp2/3 level (activated at the membrane, so the rate is per µm of edge).
//  - Capping protein caps each growing barbed end at a constant rate; a capped filament
//    stops growing and falls behind.
//  - Growing ends that touch the membrane push it. The edge speed is the free growth speed
//    times n/(n + n½), n = ends touching the membrane: a few filaments cannot push the
//    membrane's load, many share it (a simple force–velocity rule, not a force calculation).
//  - Cofilin takes old, capped filaments apart; their subunits return to the monomer pool.
//    The strip holds a fixed amount of actin, so monomers spent on the network are back
//    only when the network is taken apart. Without cofilin a slow background rate remains.
import { rng } from "../lib/ui";

export const W = 1.0;               // µm of edge (periodic in x)
export const DELTA = 0.0027;        // µm per subunit
export const KON = 11.6;            // µM⁻¹ s⁻¹ (barbed end)
export const C_TOT = 20;            // µM actin in the strip (monomer + network)
export const N_TOT = 24000;         // the same amount as a number of subunits
export const KBR = 30;              // branches per s per µm of edge at Arp2/3 = 1
export const KCAP = 1.0;            // per s per growing end at capping = 1
export const KDIS0 = 0.02;          // per s per capped filament, without cofilin
export const KCOF = 0.4;            // per s per capped filament per unit cofilin
export const K_DENOVO = 0.3;        // per s: new filaments made without Arp2/3 (other nucleators)
export const N_HALF = 18;            // ends at the membrane for half the free speed
export const ZONE = 0.05;           // µm: branching zone behind the membrane
export const CONTACT = 0.004;       // µm: an end this close to the membrane is touching it
export const BRANCH_ANGLE = 70 * Math.PI / 180;
export const FIL_ANGLE = 35 * Math.PI / 180;

export interface LamParams { arp: number; cap: number; cof: number }
export const DEFAULT_LAM: LamParams = { arp: 1, cap: 1, cof: 1 };

export interface Fil {
  x0: number; y0: number;        // base (branch point), lab frame, µm
  sx: number; cy: number;        // sin θ, cos θ (θ from the direction of travel)
  len: number;                   // µm
  capped: boolean;
  born: number; cappedAt: number;
  branched: boolean;             // made by Arp2/3 (draw the branch point)
}

export class Lamella {
  fils: Fil[] = [];
  M = 0;              // membrane position (µm, lab frame)
  t = 0;
  F = 0;              // subunits in filaments
  v = 0;              // current edge speed, µm/s
  nTouch = 0;         // growing ends at the membrane
  nGrowing = 0;
  p: LamParams;
  private r: ReturnType<typeof rng>;
  /** recent membrane positions, for a smoothed speed */
  hist: { t: number; M: number }[] = [];

  constructor(p: LamParams, seed = 1) {
    this.p = { ...p };
    this.r = rng(seed);
    // start with a small network near the edge
    for (let i = 0; i < 24; i++) {
      const th = (i % 2 ? 1 : -1) * FIL_ANGLE + 0.08 * this.r.norm();
      const len = 0.05 + 0.15 * this.r.unif();
      const f: Fil = { x0: this.r.unif() * W, y0: -len * Math.cos(th) - 0.3 * this.r.unif(), sx: Math.sin(th), cy: Math.cos(th),
        len, capped: i >= 12, born: -1, cappedAt: i >= 12 ? -0.5 : 0, branched: true };
      this.fils.push(f);
      this.F += len / DELTA;
    }
    this.hist.push({ t: 0, M: 0 });
  }

  /** free G-actin, µM */
  get C(): number { return Math.max(0, C_TOT * (N_TOT - this.F) / N_TOT); }
  /** free growth speed of one barbed end, µm/s */
  get vFree(): number { return KON * this.C * DELTA; }

  private poisson(lam: number): number {
    if (lam <= 0) return 0;
    let k = 0, p = Math.exp(-lam), s = p;
    const u = this.r.unif();
    while (u > s && k < 50) { k++; p *= lam / k; s += p; }
    return k;
  }

  step(dt: number): void {
    const p = this.p, u = this.r.unif;
    const vf = this.vFree;
    // ends touching the membrane push it
    let n = 0, cs = 0, grow = 0;
    for (const f of this.fils) {
      if (f.capped) continue;
      grow++;
      if (f.cy > 0.05 && f.y0 + f.len * f.cy >= this.M - CONTACT) { n++; cs += f.cy; }
    }
    this.nTouch = n; this.nGrowing = grow;
    this.v = n ? vf * (cs / n) * n / (n + N_HALF) : 0;
    this.M += this.v * dt;
    // growth of every uncapped barbed end (clamped at the membrane)
    let dF = 0;
    for (const f of this.fils) {
      if (f.capped) continue;
      let L = f.len + vf * dt;
      if (f.cy > 0) {
        const lmax = (this.M - f.y0) / f.cy;
        if (L > lmax) L = Math.max(f.len, lmax);
      }
      dF += (L - f.len) / DELTA;
      f.len = L;
    }
    // do not use more monomers than exist
    this.F += dF;
    // capping
    const pc = 1 - Math.exp(-KCAP * p.cap * dt);
    for (const f of this.fils) if (!f.capped && u() < pc) { f.capped = true; f.cappedAt = this.t; }
    // branching by Arp2/3 on filaments next to the membrane
    // a new branch also needs actin monomers (factor C/(C + 1 µM)); a safety limit keeps the drawing fast
    const C = this.C;
    const nb = this.fils.length < 1500 ? this.poisson(KBR * p.arp * W * dt * C / (C + 1)) : 0;
    if (nb) {
      const cand: Fil[] = [];
      for (const f of this.fils) {
        const yt = f.y0 + f.len * f.cy;
        if (yt >= this.M - ZONE && f.len > 0.006) cand.push(f);
      }
      for (let k = 0; k < nb && cand.length; k++) {
        const m = cand[Math.floor(u() * cand.length)];
        // branch point: a random point on the part of the mother inside the zone
        const yt = m.y0 + m.len * m.cy;
        const back = Math.min(m.len, m.cy > 0.05 ? (yt - (this.M - ZONE)) / m.cy : m.len) * u();
        const L = m.len - back;
        const th0 = Math.atan2(m.sx, m.cy);
        // the branch grows at about 70° to its mother, on the side that points towards the
        // membrane; this keeps the network at about ±35° to the direction of travel
        const sgn = Math.abs(th0 + BRANCH_ANGLE) < Math.abs(th0 - BRANCH_ANGLE) ? 1 : -1;
        const th = Math.sign(th0 + sgn * BRANCH_ANGLE) * FIL_ANGLE + 0.09 * this.r.norm();
        this.fils.push({ x0: wrap(m.x0 + L * m.sx), y0: m.y0 + L * m.cy, sx: Math.sin(th), cy: Math.cos(th),
          len: 0, capped: false, born: this.t, cappedAt: 0, branched: true });
      }
    }
    // a few filaments are made without Arp2/3 (other nucleators), so a dead edge can restart
    if (u() < K_DENOVO * dt) {
      const th = (u() < 0.5 ? 1 : -1) * FIL_ANGLE + 0.1 * this.r.norm();
      this.fils.push({ x0: u() * W, y0: this.M - 0.01, sx: Math.sin(th), cy: Math.cos(th), len: 0, capped: false,
        born: this.t, cappedAt: 0, branched: false });
    }
    // disassembly of capped filaments (cofilin); subunits go back to the pool
    const kd = KDIS0 + KCOF * p.cof;
    const pd = 1 - Math.exp(-kd * dt);
    let w = 0;
    for (const f of this.fils) {
      if (f.capped && this.t - f.cappedAt > 0.5 && u() < pd) { this.F -= f.len / DELTA; continue; }
      this.fils[w++] = f;
    }
    this.fils.length = w;
    if (this.F < 0) this.F = 0;
    this.t += dt;
    this.hist.push({ t: this.t, M: this.M });
    while (this.hist.length > 2 && this.hist[0].t < this.t - 120) this.hist.shift();
  }

  /** edge speed averaged over the last `win` seconds, µm/s */
  speed(win = 2): number {
    const h = this.hist, last = h[h.length - 1];
    let i = h.length - 1;
    while (i > 0 && h[i - 1].t >= last.t - win) i--;
    const a = h[i];
    return last.t > a.t ? (last.M - a.M) / (last.t - a.t) : 0;
  }
}

export function wrap(x: number): number { return ((x % W) + W) % W; }

/** Run a fresh strip for `t` s and return the mean edge speed (µm/s) after `t0` s. */
export function measure(p: LamParams, seed: number, t = 40, t0 = 15, dt = 1 / 60): { v: number; c: number; n: number } {
  const s = new Lamella(p, seed);
  let m0 = 0, c = 0, n = 0, k = 0;
  while (s.t < t) {
    s.step(dt);
    if (s.t >= t0) {
      if (!k) m0 = s.M;
      c += s.C; n += s.nTouch; k++;
    }
  }
  return { v: (s.M - m0) / (t - t0), c: c / Math.max(1, k), n: n / Math.max(1, k) };
}
