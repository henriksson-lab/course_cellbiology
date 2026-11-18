// Topology builder: the rules (no DOM, so it can be run in Node to check the task solutions).
//
// A protein is a list of segments from N to C. The translocon reads them in order, as the
// ribosome makes them (co-translational insertion), with the textbook rules:
//  - A cleavable signal sequence works only at the N-terminus. SRP binds it, the ribosome
//    docks on the translocon, the chain that follows goes into the ER lumen, and signal
//    peptidase cuts the signal sequence off.
//  - Every other hydrophobic segment is a transmembrane (TM) helix. Its ROLE depends on where
//    the chain is when the helix comes out of the ribosome, not on its name:
//      * no signal yet (protein still free in the cytosol): it is the signal-anchor; SRP binds
//        it. Its orientation follows the positive charges next to it (positive-inside rule):
//        charges before it → N-terminus stays in the cytosol (type II); charges after it →
//        N-terminus goes into the lumen (type III).
//      * chain going into the lumen: it is a stop-transfer; it leaves the translocon sideways,
//        N-end in the lumen, C-end in the cytosol; what follows stays in the cytosol.
//      * chain in the cytosol after a stop-transfer: it is a start-transfer (an internal
//        signal-anchor) and starts translocation again, N-end in the cytosol.
//    So after the first one, the orientations simply alternate (a simplification: in real
//    proteins the charges and the loop lengths also matter, and some segments fail to insert).
//  - The lumen side of the ER membrane becomes the outside of the cell (vesicles bud and fuse
//    without the protein flipping), so the final orientation is fixed in the ER.
//  - Each lumenal domain is N-glycosylated (custom domains: one site assumed); cytosolic
//    parts never are.

export type Kind = "ss" | "tm" | "loop" | "dom";
/** The name the student gave a TM segment: stop-transfer, or signal-anchor with charges before/after. */
export type TmLabel = "st" | "saIn" | "saOut";
export type Side = "cyt" | "lum";
export type Role = "ss" | "sa" | "st" | "start";
export type Dest = "surface" | "er";

export interface Seg {
  kind: Kind;
  len: number;          // amino acids
  label?: TmLabel;      // TM only
  glyc?: number;        // number of N-glycans if lumenal (default: dom 1, loop 0)
  name?: string;        // e.g. "NBD1 + R domain"
}

export interface Placed {
  seg: Seg;
  i: number;            // index in the protein
  start: number;        // first residue (0-based) and end (exclusive)
  end: number;
  side: Side;           // loops/domains: the side they end up on; TMs: side of their N-end
  role?: Role;          // TMs and the signal sequence
  glycans: number;      // N-glycans actually added (lumenal only)
}

export interface Topology {
  segs: Seg[];
  placed: Placed[];
  total: number;              // residues
  targeted: boolean;          // does it reach the ER at all?
  targetIdx: number;          // segment that SRP binds (-1: none)
  postTranslational: boolean; // tail-anchored: the only TM is too close to the C-terminus for SRP
  cleaved: boolean;           // has a cleavable signal sequence
  nTM: number;
  nSide: Side | null;         // mature N-terminus (after cleavage)
  cSide: Side | null;
  secreted: boolean;          // no TM: soluble in the lumen
  cls: string;                // short class name
  notes: string[];            // things the student should know (role differs from label, unrealistic …)
  warn: string[];             // unrealistic combinations
}

export const RATE = 5;        // amino acids per second (mammalian ribosome, about 5–6 aa/s)
export const TUNNEL = 35;     // residues hidden in the ribosome exit tunnel
export const MAX_FLIP = 60;   // longest N-terminal part that a signal-anchor can pull into the lumen (rough)

export const LABEL_NAME: Record<TmLabel, string> = {
  st: "stop-transfer",
  saIn: "signal-anchor, + before (N in cytosol)",
  saOut: "signal-anchor, + after (N in lumen)",
};
export const ROLE_NAME: Record<Role, string> = {
  ss: "signal sequence (cleaved)",
  sa: "signal-anchor (first TM, starts translocation)",
  st: "stop-transfer",
  start: "start-transfer (internal signal-anchor)",
};

const isTM = (s: Seg) => s.kind === "tm" || s.kind === "ss";

export function topology(segs: Seg[]): Topology {
  const placed: Placed[] = [];
  const notes: string[] = [], warn: string[] = [];
  let r = 0;
  for (let i = 0; i < segs.length; i++) {
    placed.push({ seg: segs[i], i, start: r, end: r + segs[i].len, side: "cyt", glycans: 0 });
    r += segs[i].len;
  }
  const total = r;
  let targeted = false, targetIdx = -1, side: Side = "cyt";
  const cleaved = segs.length > 0 && segs[0].kind === "ss";
  segs.forEach((s, i) => {
    if (s.kind === "ss" && i > 0) notes.push(`Segment ${i + 1}: a cleavable signal sequence works only at the N-terminus. Here it is treated as a signal-anchor.`);
  });
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], p = placed[i];
    if (s.kind === "ss" && i === 0) {
      targeted = true; targetIdx = 0; p.role = "ss"; p.side = "cyt"; side = "lum";
      continue;
    }
    if (isTM(s)) {
      const label: TmLabel = s.kind === "ss" ? "saIn" : (s.label ?? "st");
      if (!targeted) {
        targeted = true; targetIdx = i; p.role = "sa";
        const nOut = label !== "saIn";          // charges after the helix → N-end goes to the lumen
        p.side = nOut ? "lum" : "cyt";
        if (nOut) {
          let before = 0;
          for (let k = 0; k < i; k++) { placed[k].side = "lum"; before += segs[k].len; }
          if (before > MAX_FLIP) warn.push(before > 150
            ? `Unrealistic: the signal-anchor (segment ${i + 1}) would have to pull ${before} amino acids that are already made, and folded, back through the translocon into the lumen. That does not happen; real "N in lumen" signal-anchors have a short N-terminal part.`
            : `Unlikely in a real cell: the signal-anchor (segment ${i + 1}) would have to pull ${before} amino acids back through the translocon. Real "N in lumen" signal-anchors have a short N-terminal part (up to a few dozen amino acids).`);
        }
        side = nOut ? "cyt" : "lum";
        if (label === "st") notes.push(`Segment ${i + 1} is named stop-transfer, but nothing was being translocated when it came out of the ribosome: it is the first hydrophobic segment, so SRP bound it and it acted as a signal-anchor. Its positive charges are after it, so the N-terminus went into the lumen (the same helix, a different role).`);
      } else if (side === "lum") {
        p.role = "st"; p.side = "lum"; side = "cyt";
        if (label !== "st") notes.push(`Segment ${i + 1} is named signal-anchor, but the chain was already going into the lumen when it arrived, so it acted as a stop-transfer.`);
      } else {
        p.role = "start"; p.side = "cyt"; side = "lum";
        if (label === "st") notes.push(`Segment ${i + 1} is named stop-transfer, but the chain was in the cytosol when it arrived (after the previous stop-transfer), so it started translocation again: a start-transfer (internal signal-anchor).`);
        if (label === "saOut") notes.push(`Segment ${i + 1}: its charges ask for "N in lumen", but the chain before it is in the cytosol, so in this model it inserts N in cytosol (the orientations alternate after the first TM).`);
      }
      continue;
    }
    p.side = targeted ? side : "cyt";
  }
  // a TM that is the last segment (or followed by fewer than TUNNEL residues) is still inside the
  // ribosome when translation ends: SRP cannot catch it (tail-anchored proteins, GET pathway)
  let postTranslational = false;
  if (targetIdx >= 0 && segs[targetIdx].kind === "tm" && total - placed[targetIdx].end < TUNNEL) {
    postTranslational = true;
    notes.push(`The only signal is a TM segment within ${TUNNEL} amino acids of the C-terminus: it is still inside the ribosome when translation ends, so SRP cannot bind it. Such tail-anchored proteins are inserted after translation, by another pathway (GET). The demo shows the result, not that route.`);
  }
  // glycans: lumenal loops and domains only
  for (const p of placed) {
    if (!targeted || isTM(p.seg)) continue;
    if (p.side === "lum") p.glycans = p.seg.glyc ?? (p.seg.kind === "dom" ? 1 : 0);
  }
  const nTM = placed.filter(p => p.role === "sa" || p.role === "st" || p.role === "start").length;
  const mature = placed.filter(p => p.role !== "ss");
  const endSide = (p: Placed, end: "N" | "C"): Side => {
    if (!isTM(p.seg)) return p.side;
    return end === "N" ? p.side : (p.side === "lum" ? "cyt" : "lum");
  };
  const nSide = mature.length ? endSide(mature[0], "N") : null;
  const cSide = mature.length ? endSide(mature[mature.length - 1], "C") : null;
  const secreted = targeted && nTM === 0;
  let cls: string;
  if (!targeted) cls = "Cytosolic protein (no ER signal)";
  else if (secreted) cls = "Soluble protein in the ER lumen → secreted";
  else if (nTM === 1) {
    const tm = placed.find(p => p.role === "sa" || p.role === "st")!;
    if (postTranslational) cls = "Tail-anchored single-pass protein";
    else if (tm.role === "st") cls = "Single-pass, type I";
    else cls = tm.side === "cyt" ? "Single-pass, type II" : "Single-pass, type III";
  } else cls = `Multipass, ${nTM} TM segments`;
  return { segs, placed, total, targeted, targetIdx, postTranslational, cleaved, nTM, nSide, cSide, secreted, cls, notes, warn };
}

/** Where the side ends up after the vesicle trip. */
export function sideName(s: Side | null, where: "er" | "surface"): string {
  if (s === null) return "–";
  if (s === "cyt") return "cytosol";
  return where === "er" ? "ER lumen" : "outside the cell";
}

// ---------------------------------------------------------------- named examples
// Segment lengths are rounded from UniProt; loops are drawn as arcs, domains as blobs.
export interface Example {
  key: string;
  label: string;
  segs: Seg[];
  dest: Dest;
  text: string;
  misfoldText?: string;   // what happens with the disease mutation (misfolded checkbox)
}

const tm = (label: TmLabel, len = 21, name?: string): Seg => ({ kind: "tm", len, label, name });
const lp = (len: number, glyc = 0, name?: string): Seg => ({ kind: "loop", len, glyc, name });
const dm = (len: number, glyc = 0, name?: string): Seg => ({ kind: "dom", len, glyc, name });

function multipass(first: TmLabel, nTM: number, nTail: Seg | null, loops: Seg[], cTail: Seg): Seg[] {
  const out: Seg[] = [];
  if (nTail) out.push(nTail);
  for (let k = 0; k < nTM; k++) {
    // first: signal-anchor; then alternate stop-transfer / signal-anchor (+ before), as in the rules
    const label: TmLabel = k === 0 ? first : (((k % 2 === 1) === (first === "saIn")) ? "st" : "saIn");
    out.push(tm(label, 21));
    if (k < nTM - 1) out.push(loops[k]);
  }
  out.push(cTail);
  return out;
}

export const EXAMPLES: Example[] = [
  {
    key: "a1at", label: "α1-antitrypsin (secreted)", dest: "surface",
    segs: [{ kind: "ss", len: 24 }, dm(394, 3, "serpin domain")],
    text: "A serum protein made by liver cells: signal sequence, no TM segment. It is released into the blood, where it blocks the protease elastase.",
    misfoldText: "Z mutation (Glu342Lys): the protein folds slowly; much of it stays in the ER, part forms polymers (the globules in a liver biopsy), part is degraded by ERAD. Only about 10–15 % reaches the blood.",
  },
  {
    key: "ldlr", label: "LDL receptor (type I)", dest: "surface",
    segs: [{ kind: "ss", len: 21 }, dm(767, 2, "LDL-binding domain"), tm("st", 22), lp(50, 0, "cytosolic tail")],
    text: "Takes up cholesterol-carrying LDL particles from the blood (endocytosis lecture). Signal sequence + one stop-transfer.",
    misfoldText: "Many familial hypercholesterolaemia mutations make the receptor misfold: it is held in the ER and degraded, and fewer receptors reach the surface.",
  },
  {
    key: "tfr", label: "Transferrin receptor (type II)", dest: "surface",
    segs: [dm(61, 0, "N-terminal tail"), tm("saIn", 28), dm(671, 3, "transferrin-binding domain")],
    text: "Takes up iron-loaded transferrin. No cleavable signal sequence: its single TM segment is a signal-anchor with positive charges before it.",
  },
  {
    key: "cyp3a4", label: "Cytochrome P450 3A4 (type III, stays in ER)", dest: "er",
    segs: [tm("saOut", 22), dm(481, 0, "P450 enzyme domain")],
    text: "Breaks down about half of all drugs, in the smooth ER of liver cells. An N-terminal signal-anchor with charges after it puts the short N-terminus in the lumen and the enzyme in the cytosol. It stays in the ER.",
  },
  {
    key: "b2ar", label: "β2-adrenergic receptor (7 TM)", dest: "surface",
    segs: multipass("saOut", 7, dm(34, 2, "N-terminal tail"),
      [lp(8), lp(8), lp(20), lp(25), lp(50), lp(8)], lp(113, 0, "C-terminal tail")),
    text: "The adrenaline receptor (a GPCR; signalling block). No cleavable signal sequence: TM1 is a signal-anchor that puts the glycosylated N-terminus out.",
  },
  {
    key: "glut1", label: "GLUT1 glucose transporter (12 TM)", dest: "surface",
    segs: multipass("saIn", 12, lp(11), [lp(33, 1, "loop 1"), lp(10), lp(10), lp(10), lp(65, 0, "central loop"), lp(10), lp(10), lp(10), lp(10), lp(10), lp(10)], lp(41, 0, "C-terminal tail")),
    text: "The glucose uniporter from the transport lecture. Both ends in the cytosol; one N-glycan, on the first outside loop.",
  },
  {
    key: "cftr", label: "CFTR Cl⁻ channel (12 TM)", dest: "surface",
    segs: multipass("saIn", 12, dm(77, 0, "N-terminal tail"),
      [lp(15), lp(60), lp(10), lp(60), lp(10), dm(500, 0, "NBD1 + R domain"), lp(30, 2, "loop 4"), lp(60), lp(10), lp(60), lp(10)],
      dm(326, 0, "NBD2")),
    text: "The chloride channel that is faulty in cystic fibrosis (ion-channel lecture). Both ends and both ATP-binding domains (NBDs) in the cytosol.",
    misfoldText: "ΔF508 (the most common CF mutation, in NBD1): the protein folds badly, the calnexin cycle and other chaperones keep it in the ER, and ERAD destroys almost all of it. Corrector drugs help it fold and leave.",
  },
];

// ---------------------------------------------------------------- timeline (seconds of real time)
export type PhaseKey = "free" | "srp" | "trans" | "release" | "post" | "fold" | "erad" | "toGolgi" | "golgi" | "toPM" | "end";
export interface Phase { key: PhaseKey; t0: number; t1: number; text: string }
export interface Timeline { phases: Phase[]; targetRes: number; tDock: number; tEnd: number; end: string }

export const T_SRP = 4;          // SRP binds, elongation pauses, ribosome reaches the translocon (a few s; illustrative)
export const T_RELEASE = 3;      // termination, ribosome leaves
export const T_POST = 10;        // tail-anchored: post-translational insertion (illustrative)
export const T_FOLD = 600;       // folding, glycan trimming, quality control in the ER (~10 min)
export const T_ERAD = 600;       // misfolded: held, then sent back to the cytosol and degraded
export const T_VESICLE = 60;     // budding, travel and fusion of one carrier
export const T_GOLGI = 900;      // passage through the Golgi stack (~15 min)

export function timeline(top: Topology, dest: Dest, misfolded: boolean): Timeline {
  const ph: Phase[] = [];
  let t = 0;
  const add = (key: PhaseKey, dur: number, text: string) => { ph.push({ key, t0: t, t1: t + dur, text }); t += dur; };
  const total = top.total;
  let targetRes = total;
  if (top.targeted && !top.postTranslational) {
    const sig = top.placed[top.targetIdx];
    targetRes = Math.min(total, sig.end + TUNNEL);
  }
  add("free", targetRes / RATE, top.targeted && !top.postTranslational
    ? "A free ribosome in the cytosol makes the chain, N-terminus first."
    : "A free ribosome in the cytosol makes the chain. No signal has come out of the ribosome.");
  let tDock = -1;
  if (top.targeted && !top.postTranslational) {
    add("srp", T_SRP, "SRP binds the signal as it comes out of the ribosome and pauses translation. SRP brings the ribosome to the SRP receptor and the translocon (Sec61) in the ER membrane.");
    tDock = t;
    add("trans", (total - targetRes) / RATE, "SRP lets go; translation goes on and the chain is threaded through the translocon as it is made.");
  }
  add("release", T_RELEASE, "Translation ends; the ribosome lets go.");
  if (!top.targeted) {
    ph.push({ key: "end", t0: t, t1: Infinity, text: "No ER signal: the protein folds and stays in the cytosol." });
    return { phases: ph, targetRes, tDock, tEnd: t, end: "cytosol" };
  }
  if (top.postTranslational) add("post", T_POST, "Tail-anchored protein: the finished chain is brought to the ER membrane after translation and its C-terminal TM is inserted (GET pathway).");
  add("fold", T_FOLD, "In the ER: the protein folds with chaperones (BiP, calnexin), disulfide bonds form, the glucoses on its N-glycans are trimmed, and quality control checks it.");
  if (misfolded) {
    add("erad", T_ERAD, "Misfolded: chaperones hold it in the ER. After repeated failed attempts it is pulled back into the cytosol, ubiquitinated and degraded by the proteasome (ERAD).");
    ph.push({ key: "end", t0: t, t1: Infinity, text: "Degraded by ERAD: none of it reaches its destination." });
    return { phases: ph, targetRes, tDock, tEnd: t, end: "erad" };
  }
  if (dest === "er") {
    ph.push({ key: "end", t0: t, t1: Infinity, text: "An ER-resident protein: it stays in the ER membrane, with the same orientation." });
    return { phases: ph, targetRes, tDock, tEnd: t, end: "er" };
  }
  add("toGolgi", T_VESICLE, "Folded and approved: it leaves the ER in a COPII vesicle that fuses with the Golgi.");
  add("golgi", T_GOLGI, "Golgi: its N-glycans are trimmed and rebuilt into complex glycans.");
  add("toPM", T_VESICLE, "A vesicle from the trans-Golgi network carries it to the plasma membrane and fuses.");
  ph.push({ key: "end", t0: t, t1: Infinity, text: top.secreted
    ? "Secreted: the vesicle lumen opened to the outside and the protein left the cell."
    : "At the cell surface. The side that faced the ER lumen now faces the outside of the cell." });
  return { phases: ph, targetRes, tDock, tEnd: t, end: top.secreted ? "secreted" : "surface" };
}

export function phaseAt(tl: Timeline, t: number): Phase {
  for (const p of tl.phases) if (t < p.t1) return p;
  return tl.phases[tl.phases.length - 1];
}

/** Residues made at time t. */
export function residuesAt(tl: Timeline, top: Topology, t: number): number {
  const free = tl.phases[0];
  if (t <= free.t1) return Math.min(tl.targetRes, t * RATE);
  if (tl.tDock < 0) return top.total;
  if (t <= tl.tDock) return tl.targetRes;
  return Math.min(top.total, tl.targetRes + (t - tl.tDock) * RATE);
}
