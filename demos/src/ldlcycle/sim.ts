// LDL receptor cycle, one receptor at a time (the "cell view" of the demo). Uses the
// rates of model.ts, so on average it agrees with the compartment model. No DOM.
// World: 100 × 70 units; blood at the top, the liver cell below the plasma membrane.
import * as M from "./model";
import { rng } from "../lib/ui";

export const W = 100, H = 70;
export const MEM_Y = 17;                       // plasma membrane (outer face)
export const ENDO = { x: 34, y: 44, r: 10 };   // sorting endosome
export const LYSO = { x: 78, y: 52, r: 7.5 };  // lysosome
export const GOLGI = { x: 90, y: 60 };         // where new receptors come from
export const N_HEALTHY = 20;                   // receptors at the surface in a healthy cell

const PIT_RATE = M.K_INT * W / 12;             // pits per minute; each takes receptors within ±6
const PIT_REACH = 6, PIT_GROW = 40, T_IN = 30, T_BACK = 30, T_LYS = 40, T_NEW = 60, T_LET_GO = 20;
const K_LDL_TO_LYS = 0.25;                     // free LDL handed on from the endosome to the lysosome (per min)
const T_DIGEST_LDL = 12, T_DIGEST_R = 6;       // mean minutes to digest in the lysosome

export type RState = "surf" | "pit" | "ves" | "endo" | "back" | "tolys" | "lys" | "new";
export interface Receptor {
  state: RState; x: number; y: number; ldl: boolean; pcsk9: boolean; letGo: number; // letGo: seconds until LDL detaches (−1 = will not)
  x0: number; y0: number; x1: number; y1: number; t: number; dur: number; pit: number; a: number; fade: number;
}
export interface Pit { id: number; x: number; age: number; done: boolean; vx: number; vy: number; tv: number; members: number }
export interface Particle { x: number; y: number; vx: number; vy: number; target: number; fade: number; t: number; x0: number; y0: number; where: "blood" | "toR" | "endo" | "tolys" | "lys" }

export interface Counters { ldlIn: number[]; destroyed: number[]; destroyedP: number[]; newR: number[] }

export class CellSim {
  s: M.Settings;
  L = M.L_HEALTHY;              // LDL in the blood (mmol/L), set from the body model
  t = 0;                        // seconds
  rs: Receptor[] = [];
  pits: Pit[] = [];
  ldl: Particle[] = [];
  pcsk9: Particle[] = [];
  ev: { t: number; kind: "ldlIn" | "destroyed" | "destroyedP" | "new" }[] = [];
  private rand: () => number;
  private nextPit = 0;

  constructor(s: M.Settings, L: number, seed = 1) {
    this.s = { ...s };
    this.L = L;
    this.rand = rng(seed).unif;
    this.populate();
  }

  /** Start at the steady state for the current settings. */
  populate() {
    const r = this.rand;
    this.rs = []; this.pits = []; this.ldl = []; this.pcsk9 = []; this.ev = [];
    const nS = Math.round(N_HEALTHY * M.surfaceRel(this.s, this.L));
    const nE = Math.round(nS * M.K_INT / M.K_OUT);
    const fl = M.loaded(this.L);
    for (let i = 0; i < nS; i++) {
      const x = 2 + r() * (W - 4);
      this.rs.push(this.mk("surf", x, MEM_Y, r() < fl * 0.8));
    }
    for (let i = 0; i < nE; i++) {
      const e = this.mk("endo", 0, 0, false);
      e.a = r() * Math.PI * 2; this.placeEndo(e);
      this.rs.push(e);
    }
    for (let i = 0; i < 4; i++) this.ldl.push(this.endoLdl());
    this.fillBlood();
  }

  private mk(state: RState, x: number, y: number, ldl: boolean): Receptor {
    return { state, x, y, ldl, pcsk9: false, letGo: -1, x0: x, y0: y, x1: x, y1: y, t: 0, dur: 1, pit: -1, a: 0, fade: 1 };
  }
  private endoLdl(): Particle {
    const a = this.rand() * 6.283, d = this.rand() * (ENDO.r - 3.2);
    return { x: ENDO.x + d * Math.cos(a), y: ENDO.y + d * Math.sin(a), vx: 0, vy: 0, target: -1, fade: 1, t: 0, x0: 0, y0: 0, where: "endo" };
  }
  private placeEndo(e: Receptor) {
    e.x = ENDO.x + (ENDO.r - 0.6) * Math.cos(e.a); e.y = ENDO.y + (ENDO.r - 0.6) * Math.sin(e.a);
  }

  /** Number of decorative particles in the blood for the current levels. */
  bloodTarget() { return { ldl: Math.min(70, Math.round(5 * this.L)), p: Math.min(40, Math.round(5 * this.s.pcsk9 * (this.s.statin ? M.STATIN_PCSK9 : 1))) }; }
  private bloodParticle(): Particle {
    const r = this.rand;
    return { x: r() * W, y: 1.5 + r() * (MEM_Y - 5), vx: (r() - 0.5) * 2, vy: (r() - 0.5) * 1, target: -1, fade: 1, t: 0, x0: 0, y0: 0, where: "blood" };
  }
  fillBlood() {
    const tg = this.bloodTarget();
    const nl = this.ldl.filter(p => p.where === "blood").length;
    for (let i = nl; i < tg.ldl; i++) this.ldl.push(this.bloodParticle());
    if (nl > tg.ldl) { let k = nl - tg.ldl; this.ldl = this.ldl.filter(p => !(p.where === "blood" && k-- > 0)); }
    const np = this.pcsk9.filter(p => p.where === "blood").length;
    for (let i = np; i < tg.p; i++) this.pcsk9.push(this.bloodParticle());
    if (np > tg.p) { let k = np - tg.p; this.pcsk9 = this.pcsk9.filter(p => !(p.where === "blood" && k-- > 0)); }
  }

  setSettings(s: M.Settings, L: number) { this.s = { ...s }; this.L = L; this.fillBlood(); }

  /** Is PCSK9 particle i bound by an antibody? (95 % of them, fixed per particle) */
  hasAntibody(i: number) { return this.s.antibody && (i * 7919 % 100) >= 5; }

  /** Advance by dt seconds. `visual` = also move the decorative particles. */
  step(dt: number, visual = true) {
    const r = this.rand, m = dt / 60, s = this.s;
    this.t += dt;
    // new coated pits
    this.nextPit -= m * PIT_RATE;
    while (this.nextPit <= 0) {
      this.nextPit += -Math.log(1 - r());
      const x = 4 + r() * (W - 8);
      const id = this.t * 1000 + Math.floor(r() * 1000);
      const pit: Pit = { id, x, age: 0, done: false, vx: x, vy: MEM_Y, tv: 0, members: 0 };
      for (const R of this.rs) if (R.state === "surf" && Math.abs(R.x - x) < PIT_REACH) { R.state = "pit"; R.pit = id; R.x0 = R.x; pit.members++; }
      this.pits.push(pit);
    }
    // synthesis of new receptors (from the Golgi)
    const syn = M.synthesis(s) * M.qTrip(M.HEALTHY, M.L_HEALTHY) * M.K_INT * N_HEALTHY;
    if (r() < syn * m) {
      const R = this.mk("new", GOLGI.x, GOLGI.y, false);
      R.x0 = GOLGI.x; R.y0 = GOLGI.y; R.x1 = 4 + r() * (W - 8); R.y1 = MEM_Y; R.t = 0; R.dur = T_NEW;
      this.rs.push(R);
      this.ev.push({ t: this.t, kind: "new" });
    }
    const pP = M.kPcsk9(s) * m, pL = M.K_LDL * this.L * m, pOut = M.K_OUT * m;
    for (const R of this.rs) {
      switch (R.state) {
        case "surf": {
          if (visual) R.x = Math.min(W - 1, Math.max(1, R.x + (r() - 0.5) * 0.25 * Math.sqrt(dt * 60) * 0.3));
          if (!R.ldl && r() < pL) { R.ldl = true; this.grab(this.ldl, R); }
          if (!R.pcsk9 && r() < pP) { R.pcsk9 = true; this.grab(this.pcsk9, R); }
          break;
        }
        case "pit": {
          const p = this.pits.find(q => q.id === R.pit);
          if (p) { const f = Math.min(1, p.age / 10); R.x = R.x0 + (p.x - R.x0) * f; }
          break;
        }
        case "endo": {
          if (R.ldl && R.letGo >= 0) {
            R.letGo -= dt;
            if (R.letGo < 0) { R.ldl = false; R.letGo = -1; const q = this.endoLdl(); q.x = ENDO.x + (R.x - ENDO.x) * 0.75; q.y = ENDO.y + (R.y - ENDO.y) * 0.75; this.ldl.push(q); }
          }
          if (visual) { R.a += (r() - 0.5) * 0.02 * Math.sqrt(dt * 60); this.placeEndo(R); }
          if (r() < pOut && !(R.ldl && R.letGo >= 0)) {
            const kill = R.pcsk9 || R.ldl || r() < M.Q_BASAL;
            R.x0 = R.x; R.y0 = R.y; R.t = 0;
            if (kill) {
              R.state = "tolys"; R.x1 = LYSO.x + (r() - 0.5) * 6; R.y1 = LYSO.y + (r() - 0.5) * 6; R.dur = T_LYS;
              this.ev.push({ t: this.t, kind: R.pcsk9 ? "destroyedP" : "destroyed" });
            } else { R.state = "back"; R.x1 = 4 + r() * (W - 8); R.y1 = MEM_Y; R.dur = T_BACK; }
          }
          break;
        }
        case "ves": case "back": case "tolys": case "new": {
          R.t += dt;
          const f = Math.min(1, R.t / R.dur), e = f * f * (3 - 2 * f);
          if (R.state !== "ves") { R.x = R.x0 + (R.x1 - R.x0) * e; R.y = R.y0 + (R.y1 - R.y0) * e; }
          if (f >= 1) {
            if (R.state === "ves") {
              R.state = "endo"; R.a = Math.atan2(R.y - ENDO.y, R.x - ENDO.x); this.placeEndo(R);
              R.letGo = R.ldl ? (r() < M.release(s.pH) ? T_LET_GO * (0.5 + r()) : -1) : -1;
            } else if (R.state === "tolys") { R.state = "lys"; R.fade = 1; }
            else { R.state = "surf"; R.y = MEM_Y; R.ldl = false; }
          }
          break;
        }
        case "lys": R.fade -= m / T_DIGEST_R; break;
      }
    }
    // pits: grow, pinch off (dynamin), travel to the endosome, uncoat
    for (const p of this.pits) {
      p.age += dt;
      if (!p.done && p.age >= PIT_GROW) {
        p.done = true; p.tv = 0;
        for (const R of this.rs) if (R.state === "pit" && R.pit === p.id) { R.state = "ves"; R.t = 0; R.dur = T_IN; }
        if (p.members) for (const R of this.rs) if (R.pit === p.id && R.ldl) this.ev.push({ t: this.t, kind: "ldlIn" });
      }
      if (p.done) {
        p.tv += dt;
        const f = Math.min(1, p.tv / T_IN), e = f * f * (3 - 2 * f);
        const ex = ENDO.x + (p.x - ENDO.x) * 0.35, ey = ENDO.y - ENDO.r * 0.6;
        p.vx = p.x + (ex - p.x) * e; p.vy = MEM_Y + 4 + (ey - MEM_Y - 4) * e;
        for (const R of this.rs) if (R.state === "ves" && R.pit === p.id) {
          const k = this.rs.filter(q => q.pit === p.id).indexOf(R);
          const a = k * 2.4;
          R.x = p.vx + 1.3 * Math.cos(a); R.y = p.vy + 1.3 * Math.sin(a);
        }
      }
    }
    this.pits = this.pits.filter(p => !p.done || p.tv < T_IN);
    this.rs = this.rs.filter(R => R.state !== "lys" || R.fade > 0);
    // LDL inside: endosome → lysosome → digested
    for (const q of this.ldl) {
      if (q.where === "endo") {
        if (visual) this.jiggle(q, ENDO, dt, 3.2);
        if (r() < K_LDL_TO_LYS * m) { q.where = "tolys"; q.x0 = q.x; q.y0 = q.y; q.t = 0; }
      } else if (q.where === "tolys") {
        q.t += dt; const f = Math.min(1, q.t / T_LYS), e = f * f * (3 - 2 * f);
        const tx = LYSO.x + (q.x0 - ENDO.x) * 0.3, ty = LYSO.y + (q.y0 - ENDO.y) * 0.3;
        q.x = q.x0 + (tx - q.x0) * e; q.y = q.y0 + (ty - q.y0) * e;
        if (f >= 1) { q.where = "lys"; q.fade = 1; }
      } else if (q.where === "lys") {
        q.fade -= m / T_DIGEST_LDL;
        if (visual) this.jiggle(q, LYSO, dt, 2.6);
      }
    }
    this.ldl = this.ldl.filter(q => q.where !== "lys" || q.fade > 0);
    if (visual) { this.moveBlood(this.ldl, dt); this.moveBlood(this.pcsk9, dt); }
    else for (const arr of [this.ldl, this.pcsk9]) for (const q of arr) if (q.where === "toR") q.target = -2;
    this.ldl = this.ldl.filter(q => q.target !== -2);
    this.pcsk9 = this.pcsk9.filter(q => q.target !== -2);
    if (this.ev.length > 4000) this.ev = this.ev.filter(e => e.t > this.t - 3600);
  }

  /** A blood particle swims to receptor R and binds (only drawn; R.ldl / R.pcsk9 is already set). */
  private grab(arr: Particle[], R: Receptor) {
    let best = -1, bd = 1e9;
    arr.forEach((q, i) => { if (q.where === "blood" && !(arr === this.pcsk9 && this.hasAntibody(i))) { const d = Math.abs(q.x - R.x) + q.y; if (d < bd) { bd = d; best = i; } } });
    if (best < 0) return;
    const q = arr[best];
    q.where = "toR"; q.x0 = q.x; q.y0 = q.y; q.t = 0; q.target = this.rs.indexOf(R);
    (q as Particle & { R?: Receptor }).R = R;
  }
  private moveBlood(arr: Particle[], dt: number) {
    const r = this.rand, k = Math.min(dt, 0.2);
    for (const q of arr) {
      if (q.where === "blood") {
        q.vx += (r() - 0.5) * 1.2 * k; q.vy += (r() - 0.5) * 1.2 * k;
        q.vx = Math.max(-1.6, Math.min(1.6, q.vx)); q.vy = Math.max(-0.8, Math.min(0.8, q.vy));
        q.x += q.vx * k; q.y += q.vy * k;
        if (q.x < 1) { q.x = 1; q.vx = Math.abs(q.vx); } if (q.x > W - 1) { q.x = W - 1; q.vx = -Math.abs(q.vx); }
        if (q.y < 1.5) { q.y = 1.5; q.vy = Math.abs(q.vy); } if (q.y > MEM_Y - 4) { q.y = MEM_Y - 4; q.vy = -Math.abs(q.vy); }
      } else if (q.where === "toR") {
        q.t += dt;
        const R = (q as Particle & { R?: Receptor }).R;
        if (!R || R.state !== "surf" || q.t > 3) { q.target = -2; continue; }   // arrived: now drawn on the receptor
        const f = Math.min(1, q.t / 3), e = f * f * (3 - 2 * f);
        q.x = q.x0 + (R.x - q.x0) * e; q.y = q.y0 + (MEM_Y - 2.2 - q.y0) * e;
      }
    }
    this.fillBlood();
  }
  private jiggle(q: Particle, c: { x: number; y: number }, dt: number, rmax: number) {
    const k = Math.min(dt, 0.5), r = this.rand;
    q.x += (r() - 0.5) * 0.6 * k * 2; q.y += (r() - 0.5) * 0.6 * k * 2;
    const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy);
    if (d > rmax) { q.x = c.x + dx / d * rmax; q.y = c.y + dy / d * rmax; }
  }

  // ---- readouts
  count(st: RState) { return this.rs.filter(R => R.state === st).length; }
  surface() { return this.rs.filter(R => R.state === "surf" || R.state === "pit").length; }
  inside() { return this.rs.filter(R => R.state === "ves" || R.state === "endo" || R.state === "back" || R.state === "tolys").length; }
  /** Events in the last `sec` seconds (or since the start, if shorter). */
  recent(kind: "ldlIn" | "destroyed" | "destroyedP" | "new", sec = 3600) {
    return this.ev.filter(e => e.kind === kind && e.t > this.t - sec).length;
  }
}
