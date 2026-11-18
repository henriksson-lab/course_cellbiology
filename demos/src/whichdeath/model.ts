// "Which death is it?": the rule table behind the demo. No DOM here, so the numbers in the
// task solutions can be checked in Node (bundle with esbuild, as for the other demos).
//
// This is NOT a simulation of signalling. It is a rule table that encodes the textbook
// experimental logic of cell-death research:
//   - each stimulus starts one death programme (or none) in the cells used;
//   - an inhibitor rescues the cells only if it blocks a step that programme needs;
//   - blocking caspase-8 activity (z-VAD) after death-receptor signalling switches
//     apoptosis to necroptosis, if the cells express RIPK3;
//   - each programme leaves its own markers (cleaved caspase-3, phospho-MLKL, cleaved
//     gasdermin D, lipid peroxides, IL-1β release) and its own shape.
// Simplifications (stated on the demo page): one programme per case, all-or-none rescue,
// no partial or mixed death, illustrative numbers with a small fixed-seed noise.

export type Death = "apoptosis" | "necroptosis" | "pyroptosis" | "ferroptosis" | "accidental" | "none";

export const DEATH_LABEL: Record<Death, string> = {
  apoptosis: "Apoptosis",
  necroptosis: "Necroptosis",
  pyroptosis: "Pyroptosis",
  ferroptosis: "Ferroptosis",
  accidental: "Accidental necrosis",
  none: "No death",
};
export const DEATHS: Death[] = ["apoptosis", "necroptosis", "pyroptosis", "ferroptosis", "accidental", "none"];

export type Inhib = "zvad" | "nec1" | "fer1" | "mcc950";
export const INHIBS: { id: Inhib; name: string; what: string }[] = [
  { id: "zvad", name: "z-VAD", what: "blocks all caspases (pan-caspase inhibitor)" },
  { id: "nec1", name: "Necrostatin-1", what: "blocks the kinase activity of RIPK1" },
  { id: "fer1", name: "Ferrostatin-1", what: "traps lipid radicals (stops lipid peroxidation)" },
  { id: "mcc950", name: "MCC950", what: "blocks the NLRP3 inflammasome" },
];

export type Readout = "morph" | "avpi" | "casp3" | "pmlkl" | "gsdmd" | "lipid" | "il1b";
export const READOUTS: { id: Readout; name: string; short: string; method: string }[] = [
  { id: "morph", name: "Morphology (microscope)", short: "Morphology", method: "phase contrast / EM" },
  { id: "avpi", name: "Annexin V / PI (flow)", short: "Annexin V / PI", method: "flow cytometry" },
  { id: "casp3", name: "Cleaved caspase-3 (western)", short: "Cl. casp-3", method: "western blot" },
  { id: "pmlkl", name: "Phospho-MLKL (western)", short: "p-MLKL", method: "western blot" },
  { id: "gsdmd", name: "Gasdermin D cleavage (western)", short: "GSDMD-N", method: "western blot" },
  { id: "lipid", name: "Lipid peroxides (C11-BODIPY)", short: "Lipid perox.", method: "flow, fold over control" },
  { id: "il1b", name: "IL-1β in medium (ELISA)", short: "IL-1β", method: "ELISA, pg/mL" },
];

export type Morph = "normal" | "apoptotic" | "swollen" | "pyroptotic" | "ferroptotic" | "lysed";

/** Which stimulus starts which programme. */
type Program = "intrinsic" | "extrinsic" | "tnfOnly" | "tnfZvad" | "nlrp3" | "gpx4" | "xc" | "detergent";

export interface Case {
  id: string;
  label: string;        // button text
  stimulus: string;     // short name of the stimulus
  cells: string;        // which cells
  story: string;        // what the student is told
  program: Program;
  answer: Death;
  hours: number;        // when the readouts are taken
  mystery?: boolean;
  decisive?: string;    // replaces the general "decisive results" text for this case
}

export const CASES: Case[] = [
  { id: "sts", label: "Staurosporine", stimulus: "staurosporine", program: "intrinsic", answer: "apoptosis", hours: 6,
    cells: "HeLa cells (human epithelial cancer line)",
    story: "Staurosporine is a broad kinase inhibitor from a soil bacterium. At 1 µM it kills most cultured cells within hours." },
  { id: "tnfchx", label: "TNF + cycloheximide", stimulus: "TNF + cycloheximide", program: "extrinsic", answer: "apoptosis", hours: 8,
    cells: "Mouse fibroblast line that expresses RIPK3",
    story: "TNF binds its death receptor. Cycloheximide stops protein synthesis, so the cells cannot make the survival proteins that TNF normally switches on.",
    decisive: "Cleaved caspase-3 and an annexin V⁺ PI⁻ population, with no phospho-MLKL. z-VAD alone does not save these cells: blocking caspase-8 switches them to necroptosis (phospho-MLKL appears). Only z-VAD + necrostatin-1 together rescue them. Apoptosis is the first choice; necroptosis is the backup." },
  { id: "tnf", label: "TNF alone", stimulus: "TNF", program: "tnfOnly", answer: "none", hours: 8,
    cells: "Mouse fibroblast line that expresses RIPK3",
    story: "The same cells are given TNF only. TNF is called tumour necrosis factor. Does it kill them?" },
  { id: "tnfzvad", label: "TNF + z-VAD", stimulus: "TNF + z-VAD", program: "tnfZvad", answer: "necroptosis", hours: 8,
    cells: "Mouse fibroblast line that expresses RIPK3",
    story: "TNF is given together with the caspase inhibitor z-VAD. Many viruses make caspase-8 inhibitors, so this mimics an infected cell." },
  { id: "nig", label: "Bacterial toxin (nigericin)", stimulus: "LPS priming, then nigericin", program: "nlrp3", answer: "pyroptosis", hours: 2,
    cells: "Mouse macrophages, primed for 3 h with LPS (bacterial cell wall), which makes them produce pro-IL-1β",
    story: "Nigericin is a toxin from a Streptomyces bacterium. It lets K⁺ leak out of the cell. The macrophages die within an hour or two." },
  { id: "rsl3", label: "GPX4 inhibitor (RSL3)", stimulus: "RSL3", program: "gpx4", answer: "ferroptosis", hours: 12,
    cells: "HT-1080 cells (human fibrosarcoma line)",
    story: "RSL3 binds the active site of the enzyme GPX4 and blocks it." },
  { id: "erastin", label: "Cystine uptake block (erastin)", stimulus: "erastin", program: "xc", answer: "ferroptosis", hours: 16,
    cells: "HT-1080 cells (human fibrosarcoma line)",
    story: "Erastin blocks system xc⁻, the transporter that imports cystine (two linked cysteines) in exchange for glutamate." },
  { id: "triton", label: "Detergent (Triton X-100)", stimulus: "0.1 % Triton X-100", program: "detergent", answer: "accidental", hours: 0.5,
    cells: "HeLa cells (human epithelial cancer line)",
    story: "A detergent dissolves membranes, as in the lecture on membrane structure (detergents extract membrane proteins)." },
];

/** Mystery cases: an unnamed compound that starts one of these programmes. */
const MYSTERY_POOL: Program[] = ["nlrp3", "gpx4", "tnfOnly", "intrinsic", "detergent", "tnfZvad"];
const PROGRAM_ANSWER: Record<Program, Death> = {
  intrinsic: "apoptosis", extrinsic: "apoptosis", tnfOnly: "none", tnfZvad: "necroptosis",
  nlrp3: "pyroptosis", gpx4: "ferroptosis", xc: "ferroptosis", detergent: "accidental",
};
const PROGRAM_HOURS: Record<Program, number> = {
  intrinsic: 6, extrinsic: 8, tnfOnly: 8, tnfZvad: 8, nlrp3: 2, gpx4: 12, xc: 16, detergent: 0.5,
};

export function mysteryCase(n: number): Case {
  const program = MYSTERY_POOL[((n % MYSTERY_POOL.length) + MYSTERY_POOL.length) % MYSTERY_POOL.length];
  return {
    id: "mystery" + n, label: "Mystery compound", stimulus: `compound X${n + 1}`, program, mystery: true,
    answer: PROGRAM_ANSWER[program], hours: PROGRAM_HOURS[program],
    cells: "Mouse macrophages primed with LPS (they express RIPK3, NLRP3 and pro-IL-1β, and can die in every way)",
    story: "A screening lab sends you an unnamed compound. Does it kill these cells, and if so, how?",
  };
}

/** One experiment: with or without the stimulus, plus any inhibitors (given 1 h before). */
export interface Condition { stimulus: boolean; inhib: Set<Inhib>; }

export interface Outcome {
  fate: Death;          // what the cells actually did in this condition
  note: string;         // extra explanation for the feedback (may be empty)
}

/** The rule table: what happens to the cells in one condition. */
export function resolve(c: Case, cond: Condition): Outcome {
  const has = (i: Inhib) => cond.inhib.has(i);
  if (!cond.stimulus) return { fate: "none", note: "" };
  switch (c.program) {
    case "intrinsic":
      if (has("zvad")) return { fate: "none", note: "z-VAD blocks the caspases. The mitochondria are still permeabilised, so many cells die later by a slow, caspase-independent death." };
      return { fate: "apoptosis", note: "" };
    case "extrinsic":
      if (has("zvad") && has("nec1")) return { fate: "none", note: "Both routes blocked: caspases by z-VAD, RIPK1 by necrostatin-1." };
      if (has("zvad")) return { fate: "necroptosis", note: "z-VAD blocked caspase-8, so RIPK1 and RIPK3 were no longer cut: the cells switched to necroptosis." };
      return { fate: "apoptosis", note: "" };
    case "tnfOnly":
      return { fate: "none", note: "TNF alone switches on NF-κB and survival proteins; most cells do not die." };
    case "tnfZvad":
      if (has("nec1")) return { fate: "none", note: "Necrostatin-1 blocks the RIPK1 kinase, so the RIPK1–RIPK3 complex cannot form and MLKL is not phosphorylated." };
      return { fate: "necroptosis", note: "" };
    case "nlrp3":
      if (has("mcc950")) return { fate: "none", note: "MCC950 stops NLRP3 from assembling the inflammasome." };
      if (has("zvad")) return { fate: "none", note: "z-VAD also blocks caspase-1, so a rescue by z-VAD alone does not prove apoptosis." };
      return { fate: "pyroptosis", note: "" };
    case "gpx4":
    case "xc":
      if (has("fer1")) return { fate: "none", note: "Ferrostatin-1 traps lipid radicals and stops the chain reaction in the membrane." };
      return { fate: "ferroptosis", note: "" };
    case "detergent":
      return { fate: "accidental", note: "No inhibitor helps: the detergent dissolves the membrane directly. No programme is needed." };
  }
}

/** Result of one readout in one condition: a display string, a level 0–3, and raw numbers. */
export interface Result {
  text: string;
  level: 0 | 1 | 2 | 3;
  avpi?: [number, number, number];   // % live (AV−PI−), % AV+PI−, % PI+
  morph?: Morph;
}

/** Deterministic noise: a hash of the case, the condition and the readout. */
function noise(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return ((h >>> 0) / 4294967296) * 2 - 1;     // −1 … 1
}

export function condKey(cond: Condition): string {
  return (cond.stimulus ? "S" : "-") + [...cond.inhib].sort().join("+");
}

/** Typical flow-cytometry result (% of cells) for each fate. */
const AVPI: Record<Death, [number, number, number]> = {
  none: [92, 3, 5],
  apoptosis: [30, 45, 25],     // many early-apoptotic AV+ PI− cells
  necroptosis: [30, 4, 66],    // membrane ruptures early: AV+ PI+ without an AV+ PI− stage
  pyroptosis: [20, 3, 77],
  ferroptosis: [28, 4, 68],
  accidental: [3, 1, 96],
};
const MORPH: Record<Death, Morph> = {
  none: "normal", apoptosis: "apoptotic", necroptosis: "swollen", pyroptosis: "pyroptotic",
  ferroptosis: "ferroptotic", accidental: "lysed",
};
export const MORPH_TEXT: Record<Morph, string> = {
  normal: "Normal, flat, attached",
  apoptotic: "Shrunken, blebbing, condensed and fragmented nucleus",
  swollen: "Swollen, plasma membrane ruptured, nucleus intact",
  pyroptotic: "Flattened and swollen, large membrane balloons, then rupture",
  ferroptotic: "Rounded, ruptured; small, dense mitochondria",
  lysed: "Ghosts and debris within minutes",
};

export function measure(c: Case, cond: Condition, r: Readout): Result {
  const { fate } = resolve(c, cond);
  const k = c.id + "|" + condKey(cond) + "|" + r;
  const jit = (v: number, sd: number) => v + sd * noise(k + v);
  const lev = (on: boolean): 0 | 3 => (on ? 3 : 0);
  switch (r) {
    case "morph": {
      const m = MORPH[fate];
      return { text: MORPH_TEXT[m], level: fate === "none" ? 0 : 3, morph: m };
    }
    case "avpi": {
      const base = AVPI[fate];
      const a = Math.max(0, Math.round(jit(base[1], 2)));
      const p = Math.min(100 - a, Math.max(0, Math.round(jit(base[2], 3))));
      const live = Math.max(0, 100 - a - p);
      return { text: `live ${live} · AV⁺PI⁻ ${a} · PI⁺ ${p} (%)`, level: live > 80 ? 0 : 3, avpi: [live, a, p] };
    }
    case "casp3": {
      // z-VAD blocks caspase activity; the readout is the active (cleaved) form.
      const on = fate === "apoptosis";
      return { text: on ? "strong band" : "no band", level: lev(on) };
    }
    case "pmlkl": {
      const on = fate === "necroptosis";
      return { text: on ? "strong band" : "no band", level: lev(on) };
    }
    case "gsdmd": {
      const on = fate === "pyroptosis";
      return { text: on ? "N-terminal fragment" : "full length only", level: lev(on) };
    }
    case "lipid": {
      const on = fate === "ferroptosis";
      const v = on ? jit(8, 1) : jit(1.1, 0.15);
      return { text: `${v.toFixed(1)}× control`, level: on ? 3 : 0 };
    }
    case "il1b": {
      // IL-1β needs priming (pro-IL-1β made) and caspase-1. Only the macrophage cases are primed.
      const primed = c.program === "nlrp3" || !!c.mystery;
      let v: number;
      if (fate === "pyroptosis") v = jit(2400, 200);
      else if (primed && fate !== "none" && fate !== "apoptosis") v = jit(150, 40); // pro-IL-1β leaks out of burst cells; little is active
      else v = jit(20, 10);
      v = Math.max(5, v);
      return { text: `${Math.round(v / 10) * 10} pg/mL`, level: v > 1000 ? 3 : v > 100 ? 1 : 0 };
    }
  }
}

/** For the feedback: which results decide each death type. */
export const DECISIVE: Record<Death, { marker: Readout | null; rescue: Inhib | null; text: string }> = {
  apoptosis: { marker: "casp3", rescue: "zvad",
    text: "Cleaved caspase-3 and an annexin V⁺ PI⁻ population (phosphatidylserine outside while the membrane is still intact), with rescue by z-VAD but not by necrostatin-1 or ferrostatin-1." },
  necroptosis: { marker: "pmlkl", rescue: "nec1",
    text: "Phospho-MLKL, no cleaved caspase-3, and rescue by necrostatin-1 (z-VAD does not help: caspases are already blocked or not involved)." },
  pyroptosis: { marker: "gsdmd", rescue: "mcc950",
    text: "The N-terminal fragment of gasdermin D and a large IL-1β release, with rescue by the NLRP3 inhibitor MCC950." },
  ferroptosis: { marker: "lipid", rescue: "fer1",
    text: "A large rise in lipid peroxides and rescue by ferrostatin-1, while z-VAD and necrostatin-1 do nothing." },
  accidental: { marker: null, rescue: null,
    text: "Almost all cells PI⁺ within minutes, no specific marker, and no inhibitor rescues them: nothing regulated is going on." },
  none: { marker: "avpi", rescue: null,
    text: "Viability with the stimulus is the same as in the control without it, and no death marker appears." },
};
