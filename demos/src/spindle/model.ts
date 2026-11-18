// Spindle checkpoint: a rules-based model of one toy cell (4 chromosomes) from
// prometaphase to two daughter cells. Pure TS (no DOM), so it can be run in Node.
//
// Rules (qualitatively right, timings illustrative):
//  1. Each sister chromatid has one kinetochore. A kinetochore can hold microtubules from
//     the left pole, the right pole, or both (merotelic).
//  2. Search and capture (optional): an unattached kinetochore captures a microtubule at
//     random. Once its sister is attached, it faces the other pole, so it usually (85 %)
//     captures from the opposite pole; otherwise it makes a syntelic attachment. A
//     kinetochore that is attached to one pole sometimes also catches a microtubule from
//     the other pole (merotelic), but only before its chromosome is bioriented. Taxol freezes the microtubules: no new capture.
//  3. Tension: a chromosome is under tension when its two kinetochores are pulled
//     towards opposite poles (amphitelic, also merotelic). Taxol removes tension.
//  4. Error correction (Aurora B, can be switched off): a chromosome with both
//     kinetochores attached but without tension (syntelic) loses one attachment;
//     the wrong microtubule of a merotelic kinetochore is removed more slowly (tension
//     partly hides the error). A single attachment (monotelic) is kept while the
//     sister searches.
//  5. Spindle assembly checkpoint: while any kinetochore is unattached, it makes the
//     "wait" signal (Mad2 → mitotic checkpoint complex, MCC). One unattached kinetochore
//     is enough. The MCC blocks APC/C–Cdc20. The checkpoint senses attachment, not
//     tension: wrong attachments that are not corrected do not stop anaphase.
//  6. APC/C–Cdc20 tags securin and cyclin B for destruction. When securin is gone,
//     separase cleaves cohesin and anaphase starts. Each chromatid moves to the pole its
//     kinetochore is attached to (anaphase A); merotelic chromatids lag in the middle;
//     unattached chromatids stay where they are. The poles move apart (anaphase B).
//  7. When cyclin B is low and anaphase A has run, the contractile ring closes
//     (cytokinesis). Each daughter gets the chromatids on its side. A lagging chromatid,
//     or one left far from the pole, gets its own small nuclear envelope (micronucleus). A monopolar spindle (monastrol) has no middle, so
//     cytokinesis fails and one cell keeps all chromatids.
// Units: µm and seconds; rates are given per minute and converted.

export type Phase = "pro" | "meta" | "ana" | "telo" | "done";
export type Kind = "unattached" | "monotelic" | "syntelic" | "amphitelic" | "merotelic";

export interface Chromatid {
  att: [boolean, boolean];   // attached to [left, right] pole
  x: number; y: number;      // centre (µm)
  lag: boolean;              // merotelic at anaphase: lags in the middle
  micro: boolean;            // after cytokinesis: in a micronucleus (lagging, or left far from the pole)
  side: -1 | 0 | 1;          // daughter after cytokinesis (-1 left, 1 right)
}
export interface Chrom {
  id: number; len: number;   // length of each chromatid (µm)
  x: number; y: number;      // centre of the pair before anaphase
  y0: number; x0: number; ang: number;   // start position, angle around a monoaster
  sis: [Chromatid, Chromatid];   // sis[0] has its kinetochore on the left side
}
export interface Opts { taxol: boolean; correction: boolean; search: boolean; monopolar: boolean; checkpoint: boolean; }
export interface Sim extends Opts {
  t: number; phase: Phase; tAna: number; tAllAttached: number;
  M: number; apc: number; securin: number; cyclinB: number;
  poleX: [number, number]; furrow: number; elong: number;
  chroms: Chrom[]; events: { t: number; text: string }[];
  rnd: () => number;
}

export const N = 4, R_CELL = 10, POLE0 = 5, POLE_MAX = 8;
export const LENS = [2.6, 2.1, 1.7, 1.3];
export const RATE = {
  capture: 0.4,      // per min, per unattached kinetochore (search on)
  opposite: 0.85,    // probability that the second kinetochore captures from the opposite pole
  mero: 0.1,         // per min, per singly attached kinetochore of a not yet bioriented chromosome: extra MT from the other pole
  release: 0.7,      // per min: Aurora B releases a syntelic (no-tension) attachment
  meroFix: 0.35,     // per min: Aurora B removes the wrong MT of a merotelic kinetochore
  mccOn: 4,          // per min: MCC made while a kinetochore is unattached
  mccOff: 1,         // per min: MCC taken apart
  securin: 0.5,      // per min at full APC/C activity
  cyclinB: 0.4,      // per min at full APC/C activity
  congress: 2,       // µm/min: chromosome movement before anaphase
  anaA: 1.5,         // µm/min: chromatids to the poles
  anaB: 1.2,         // µm/min: each pole moves outward
  furrow: 0.25,      // fraction per min: contractile ring closes in 4 min
};
// metaphase plate: chromosomes stacked along the equator with 0.6 µm gaps
const PLATE_Y: number[] = (() => {
  const tot = LENS.reduce((a, b) => a + b, 0) + 0.6 * (LENS.length - 1);
  let y = -tot / 2;
  return LENS.map(l => { const c = y + l / 2; y += l + 0.6; return c; });
})();
const START = [[-2.6, -2.2], [1.8, -3.4], [-1.2, 2.6], [2.9, 1.6]];

export function newSim(o: Partial<Opts> = {}, seed = 1): Sim {
  const rnd = mulberry(seed);
  const monopolar = !!o.monopolar;
  const chroms: Chrom[] = LENS.map((len, i) => {
    let [x, y] = START[i];
    const ang = Math.atan2(y, x);
    if (monopolar) { x = 4.5 * Math.cos(ang); y = 4.5 * Math.sin(ang); }
    const mk = (s: number): Chromatid => ({ att: [false, false], x: x + s * 0.25, y, lag: false, micro: false, side: 0 });
    return { id: i + 1, len, x, y, x0: x, y0: y, ang, sis: [mk(-1), mk(1)] };
  });
  return {
    taxol: !!o.taxol, correction: o.correction ?? true, search: !!o.search, monopolar,
    checkpoint: o.checkpoint ?? true,
    t: 0, phase: "pro", tAna: -1, tAllAttached: -1, M: 0.8, apc: 0, securin: 1, cyclinB: 1,
    poleX: monopolar ? [0, 0] : [-POLE0, POLE0], furrow: 0, elong: 0, chroms, events: [], rnd,
  };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const poles = (a: [boolean, boolean]) => (a[0] ? 1 : 0) + (a[1] ? 1 : 0);

export function kind(c: Chrom): Kind {
  const [A, B] = c.sis.map(s => s.att);
  const nA = poles(A), nB = poles(B);
  if (nA === 0 && nB === 0) return "unattached";
  if (nA === 0 || nB === 0) return "monotelic";
  const left = A[0] || B[0], right = A[1] || B[1];
  if (!(left && right)) return "syntelic";
  if (nA === 1 && nB === 1) return "amphitelic";
  return "merotelic";
}
export const tension = (s: Sim, c: Chrom) => !s.taxol && (kind(c) === "amphitelic" || kind(c) === "merotelic");
export const unattachedCount = (s: Sim) =>
  s.chroms.reduce((n, c) => n + c.sis.filter(x => poles(x.att) === 0).length, 0);

function log(s: Sim, text: string) { s.events.push({ t: s.t, text }); if (s.events.length > 30) s.events.shift(); }

/** Student action: cycle one kinetochore through none → left → right → both → none
 *  (with a monopolar spindle: none → the aster → none). Only before anaphase. */
export function cycle(s: Sim, ci: number, si: number): void {
  if (s.phase !== "pro" && s.phase !== "meta") return;
  const a = s.chroms[ci].sis[si].att;
  if (s.monopolar) { a[0] = !a[0]; a[1] = false; return; }
  if (!a[0] && !a[1]) { a[0] = true; }
  else if (a[0] && !a[1]) { a[0] = false; a[1] = true; }
  else if (!a[0] && a[1]) { a[0] = true; }
  else { a[0] = false; a[1] = false; }
}
/** Helper: attach every chromosome correctly (sister 0 to the left, sister 1 to the right). */
export function attachAll(s: Sim): void {
  if (s.phase !== "pro" && s.phase !== "meta") return;
  for (const c of s.chroms) {
    if (s.monopolar) { c.sis[0].att = [true, false]; c.sis[1].att = [true, false]; }
    else { c.sis[0].att = [true, false]; c.sis[1].att = [false, true]; }
  }
}

function moveTo(o: { x: number; y: number }, tx: number, ty: number, d: number) {
  const dx = tx - o.x, dy = ty - o.y, r = Math.hypot(dx, dy);
  if (r <= d) { o.x = tx; o.y = ty; } else { o.x += dx / r * d; o.y += dy / r * d; }
}

/** Advance the model by dt seconds (call with dt ≤ 2 s). */
export function step(s: Sim, dt: number): void {
  const m = dt / 60;                 // minutes
  const r = s.rnd;
  s.t += dt;
  if (s.phase === "pro" || s.phase === "meta") {
    // ---- attachment rules (random numbers drawn for every kinetochore every step,
    //      so the stream does not depend on the state)
    s.chroms.forEach((c, ci) => {
      const k = kind(c), tens = tension(s, c);
      c.sis.forEach((x, si) => {
        const u1 = r(), u2 = r(), u3 = r();
        const sis = c.sis[1 - si];
        const n = poles(x.att);
        if (n === 0 && s.search && !s.taxol && u1 < RATE.capture * m) {
          let p: 0 | 1;
          if (s.monopolar) p = 0;
          else if (poles(sis.att) > 0) {
            const sp = sis.att[0] && sis.att[1] ? (u3 < 0.5 ? 0 : 1) : (sis.att[0] ? 0 : 1);
            p = (u2 < RATE.opposite ? 1 - sp : sp) as 0 | 1;
          } else {
            const near = c.x < 0 ? 0 : 1;
            p = (u2 < 0.7 ? near : 1 - near) as 0 | 1;
          }
          x.att[p] = true;
          log(s, `chromosome ${c.id}: a kinetochore captured a microtubule from the ${s.monopolar ? "aster" : p === 0 ? "left pole" : "right pole"}`);
        } else if (n === 1 && k !== "amphitelic" && s.search && !s.taxol && !s.monopolar && u1 < RATE.mero * m) {
          x.att = [true, true];
          log(s, `chromosome ${c.id}: one kinetochore also caught a microtubule from the other pole (merotelic)`);
        }
        if (!s.correction) return;
        if (!tens && poles(x.att) > 0 && poles(sis.att) > 0 && si === 0 && u2 < RATE.release * m) {
          const which = u3 < 0.5 ? c.sis[0] : c.sis[1];
          which.att = [false, false];
          log(s, `chromosome ${c.id}: no tension, Aurora B released a ${k === "syntelic" ? "syntelic " : ""}attachment`);
        } else if (k === "merotelic" && n === 2 && u3 < RATE.meroFix * m) {
          // remove the microtubule that comes from the same pole as the sister's
          const sp = poles(sis.att) === 1 ? (sis.att[0] ? 0 : 1) : (u2 < 0.5 ? 0 : 1);
          x.att[sp] = false;
          log(s, `chromosome ${c.id}: Aurora B removed the wrong microtubule (merotelic corrected)`);
        }
      });
    });
    // ---- positions: congression
    for (const c of s.chroms) {
      const k = kind(c);
      let tx = c.x, ty = c.y;
      if (s.monopolar) {
        if (k !== "unattached") { tx = 3.2 * Math.cos(c.ang); ty = 3.2 * Math.sin(c.ang); }
      } else if (k === "amphitelic" || (k === "merotelic" && !s.taxol)) {
        const nl = c.sis.reduce((n, x) => n + (x.att[0] ? 1 : 0), 0), nr = c.sis.reduce((n, x) => n + (x.att[1] ? 1 : 0), 0);
        tx = k === "amphitelic" ? 0 : 0.8 * Math.sign(nr - nl); ty = PLATE_Y[c.id - 1];
      } else if (k === "monotelic" || k === "syntelic" || k === "merotelic") {
        const a = c.sis.find(x => poles(x.att) > 0)!.att;
        const p = a[0] ? 0 : 1;
        tx = s.poleX[p] + (p === 0 ? 2 : -2); ty = Math.max(-4, Math.min(4, c.y0));
      }
      const gap = tension(s, c) ? 0.45 : 0.25;
      moveTo(c, tx, ty, RATE.congress * m);
      c.sis[0].x = c.x - gap; c.sis[1].x = c.x + gap; c.sis[0].y = c.sis[1].y = c.y;
    }
    // ---- checkpoint chemistry
    const U = unattachedCount(s);
    const make = s.checkpoint && U > 0 ? RATE.mccOn : 0;
    s.M += (make * (1 - s.M) - RATE.mccOff * s.M) * m;
    s.apc = 1 / (1 + Math.pow(s.M / 0.1, 3));
    s.securin *= Math.exp(-RATE.securin * s.apc * m);
    s.cyclinB *= Math.exp(-RATE.cyclinB * s.apc * m);
    if (U === 0 && s.tAllAttached < 0) s.tAllAttached = s.t;
    if (U > 0) s.tAllAttached = -1;
    const allAmphi = !s.monopolar && s.chroms.every(c => kind(c) === "amphitelic");
    s.phase = allAmphi && s.chroms.every(c => Math.abs(c.x) < 0.3) ? "meta" : "pro";
    if (s.securin < 0.1) {
      s.phase = "ana"; s.tAna = s.t;
      log(s, "securin gone: separase cleaves cohesin, ANAPHASE starts");
      for (const c of s.chroms) for (const x of c.sis) x.lag = poles(x.att) === 2;
    }
    return;
  }
  // ---- after anaphase onset: APC/C keeps working on cyclin B
  s.apc = s.checkpoint ? 1 / (1 + Math.pow(s.M / 0.1, 3)) : 1;
  s.M *= Math.exp(-RATE.mccOff * m);
  s.cyclinB *= Math.exp(-RATE.cyclinB * Math.max(s.apc, 0.5) * m);
  const slow = s.taxol ? 0.2 : 1;
  // anaphase B: poles apart
  if (!s.monopolar) {
    for (const p of [0, 1] as const) {
      const sgn = p === 0 ? -1 : 1;
      s.poleX[p] = sgn * Math.min(POLE_MAX, Math.abs(s.poleX[p]) + RATE.anaB * slow * m);
    }
    s.elong = (Math.abs(s.poleX[1]) - POLE0) / (POLE_MAX - POLE0);
  }
  // anaphase A: chromatids to their poles
  for (const c of s.chroms) for (const x of c.sis) {
    const n = poles(x.att);
    if (n === 1) {
      const p = x.att[0] ? 0 : 1;
      const tx = s.poleX[p] + (s.monopolar ? 2.2 * Math.cos(c.ang) : p === 0 ? 1.2 : -1.2);
      const ty = s.monopolar ? 2.2 * Math.sin(c.ang) : c.y * 0.9;
      moveTo(x, tx, ty, RATE.anaA * slow * m);
    } else if (n === 2) {
      moveTo(x, Math.sign(x.x) * 0.4, x.y, 0.3 * m);   // pulled both ways: lags near the middle
    }
  }
  const tA = (s.t - s.tAna) / 60;
  if (s.phase === "ana" && tA > 3 && s.cyclinB < 0.1) {
    s.phase = "telo";
    log(s, s.monopolar ? "cyclin B low: mitosis ends, but there is no spindle middle: no contractile ring"
      : "cyclin B low: RhoA at the equator, the contractile ring closes");
  }
  if (s.phase === "telo") {
    if (!s.monopolar) s.furrow = Math.min(1, s.furrow + RATE.furrow * m);
    if (s.monopolar || s.furrow >= 1) {
      s.phase = "done";
      let lag = 0;
      for (const c of s.chroms) for (const x of c.sis) {
        x.side = s.monopolar ? -1 : (x.x < 0 ? -1 : x.x > 0 ? 1 : (s.rnd() < 0.5 ? -1 : 1));
        x.micro = !s.monopolar && (x.lag || Math.abs(x.x - s.poleX[x.side < 0 ? 0 : 1]) > 3.5);
        if (x.micro) lag++;
      }
      log(s, s.monopolar ? "cytokinesis failed: one cell with every chromatid" : `cytokinesis done${lag ? ` (${lag} chromatid${lag > 1 ? "s" : ""} left behind: own nuclear envelope, a micronucleus)` : ""}`);
    }
  }
}

export interface Daughter { counts: number[]; micro: number; total: number; normal: boolean; }
/** Chromosome counts per daughter (left, right), after cytokinesis. One cell if it failed. */
export function daughters(s: Sim): Daughter[] {
  if (s.phase !== "done") return [];
  const sides = s.monopolar ? [-1] : [-1, 1];
  return sides.map(side => {
    const counts = s.chroms.map(c => c.sis.filter(x => x.side === side).length);
    const micro = s.chroms.reduce((n, c) => n + c.sis.filter(x => x.side === side && x.micro).length, 0);
    const total = counts.reduce((a, b) => a + b, 0);
    return { counts, micro, total, normal: counts.every(v => v === 1) && micro === 0 };
  });
}
