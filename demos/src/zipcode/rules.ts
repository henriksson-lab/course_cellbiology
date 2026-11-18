// Rule table for the zip-code game. Pure TS (no DOM), so it can be checked in Node.
// A protein is a set of sorting signals. The rules follow the textbook logic:
//  1. Where translation finishes decides the first fork: an N-terminal ER signal peptide
//     (or, without one, a hydrophobic transmembrane segment acting as a signal anchor)
//     sends the ribosome to the ER; everything else is finished in the cytosol.
//  2. Cytosolic signals (NLS, mitochondrial presequence, PTS1) only work on proteins that
//     stay in the cytosol; lumenal signals (KDEL, the mannose-6-phosphate patch) only work
//     inside the ER/Golgi. A signal on the wrong side is ignored, and we say why.
//  3. Two signals that compete for the same protein (e.g. NLS + PTS1, KDEL + M6P) are not
//     resolved by a simple rule: real proteins of that kind exist, and they end up split or
//     depend on details. We mark them "not predicted" instead of inventing an outcome.
// Durations are typical textbook values for a mammalian cell at 37 °C (rounded).

export type NTerm = "none" | "sp" | "mts";
export type CTerm = "none" | "kdel" | "pts1";
export interface Protein {
  nterm: NTerm;      // N-terminal signal: ER signal peptide or mitochondrial presequence
  tm: boolean;       // one hydrophobic transmembrane segment in the middle
  nls: boolean;      // nuclear localisation signal (basic stretch, e.g. PKKKRKV)
  cterm: CTerm;      // C-terminal tail: KDEL (ER retrieval) or PTS1 (-SKL, peroxisome)
  m6p: boolean;      // signal patch that gets mannose-6-phosphate in the Golgi (lysosome)
  large: boolean;    // larger than ~50 kDa: too big to diffuse through nuclear pores
}

export type Dest =
  | "cytosol" | "cytonuc" | "nucleus" | "erLumen" | "secreted" | "pm" | "lysosome"
  | "matrix" | "innerMem" | "peroxisome" | "unclear";

export const DEST_NAME: Record<Dest, string> = {
  cytosol: "cytosol",
  cytonuc: "cytosol and nucleus (spread evenly)",
  nucleus: "nucleus",
  erLumen: "ER lumen",
  secreted: "outside the cell (secreted)",
  pm: "plasma membrane",
  lysosome: "lysosome",
  matrix: "mitochondrial matrix",
  innerMem: "inner mitochondrial membrane",
  peroxisome: "peroxisome",
  unclear: "not predicted: competing or unusual signals",
};

/** The choices offered for a prediction, in display order. */
export const PREDICT: Dest[] = [
  "cytosol", "cytonuc", "nucleus", "erLumen", "secreted", "pm", "lysosome",
  "matrix", "innerMem", "peroxisome", "unclear",
];

/** One leg of the route. `id` names the geometry in main.ts; dur in seconds of real time. */
export type StepId =
  | "transCyto" | "transER" | "toPore" | "throughPore" | "diffuseNuc" | "toMito" | "mitoImport"
  | "toInner" | "toPex" | "pexImport" | "erFold" | "erToGolgi" | "golgi" | "golgiBack"
  | "golgiToPM" | "golgiToEndo" | "endoToLys" | "stop";
export interface Step { id: StepId; dur: number; text: string }

export type SignalKey = "sp" | "mts" | "tm" | "nls" | "kdel" | "pts1" | "m6p";
export interface Outcome {
  dest: Dest;
  steps: Step[];
  /** Signals present but without effect, with the reason. */
  ignored: Partial<Record<SignalKey, string>>;
  /** Short explanation of the result. */
  why: string;
  /** Membrane topology note, when there is a membrane segment. */
  topology?: string;
}

const T = {
  translate: 60,     // ~400 amino acids at ~6 aa/s
  toPore: 20, pore: 2, nucAccum: 180,      // NLS cargo accumulates in the nucleus over minutes
  diffuseNuc: 600,   // small protein equilibrates between cytosol and nucleus (~10 min)
  toMito: 20, mitoImport: 60,
  toPex: 30, pexImport: 300,               // peroxisomal import: minutes (slow, less well measured)
  erFold: 300, erToGolgi: 600, golgi: 1200, golgiBack: 300, golgiToPM: 600,
  golgiToEndo: 600, endoToLys: 900,
};

export function has(p: Protein): SignalKey[] {
  const s: SignalKey[] = [];
  if (p.nterm === "sp") s.push("sp");
  if (p.nterm === "mts") s.push("mts");
  if (p.tm) s.push("tm");
  if (p.nls) s.push("nls");
  if (p.cterm === "kdel") s.push("kdel");
  if (p.cterm === "pts1") s.push("pts1");
  if (p.m6p) s.push("m6p");
  return s;
}

const stop = (text: string): Step => ({ id: "stop", dur: 0, text });

export function sortProtein(p: Protein): Outcome {
  const ignored: Outcome["ignored"] = {};
  const transCyto: Step = { id: "transCyto", dur: T.translate, text: "Translated by a free ribosome in the cytosol." };

  // ---- 1. Into the ER: an N-terminal signal peptide, or a TM segment acting as signal anchor
  if (p.nterm === "sp" || (p.nterm === "none" && p.tm)) {
    const viaAnchor = p.nterm !== "sp";
    const transER: Step = { id: "transER", dur: T.translate, text: viaAnchor
      ? "Translation starts in the cytosol; the hydrophobic TM segment acts as an internal signal (signal anchor): SRP brings the ribosome to the ER and the protein is inserted while it is made."
      : "Translation starts in the cytosol; SRP binds the signal peptide and brings the ribosome to the ER. The chain is threaded into the ER while it is made; the signal peptide is cut off." };
    if (p.nls) ignored.nls = "The NLS is read only in the cytosol. This protein is inside the ER (or in its membrane) and never meets importins.";
    if (p.cterm === "pts1") ignored.pts1 = "PTS1 is read by a cytosolic receptor (PEX5). This protein is already in the secretory pathway.";

    if (viaAnchor && (p.nls || p.cterm !== "none" || p.m6p)) {
      return { dest: "unclear", ignored: {}, steps: [transER, stop("Which end faces the lumen depends on charges around the TM segment.")],
        why: "Without a signal peptide the TM segment itself takes the protein into the ER membrane, but which end ends up in the lumen depends on charged amino acids around it (ER lecture). Tail signals cannot be judged without knowing the topology, so this game does not predict the outcome.",
        topology: "Signal-anchor protein: orientation set by flanking charges." };
    }
    const secretory = [transER, { id: "erFold" as StepId, dur: T.erFold, text: "Folds in the ER lumen with chaperones; sugar chains are added." }];

    if (p.tm) {
      if (p.cterm === "kdel") ignored.kdel = "With the signal peptide first and the TM segment after it, the C-terminal tail is in the cytosol. The KDEL receptor looks for KDEL in the lumen, so it never sees it. (ER membrane proteins use a different, cytosolic retrieval signal.)";
      if (p.m6p) return { dest: "unclear", ignored, steps: [...secretory, stop("Not the usual way to a lysosome.")],
        why: "A membrane protein with a mannose-6-phosphate patch is unusual: lysosomal membrane proteins are sorted by signals in their cytosolic tail, not by M6P. The game does not predict this one.",
        topology: "Type I membrane protein: N-terminal part in the lumen (later outside the cell), C-terminal tail in the cytosol." };
      return { dest: "pm", ignored, steps: [...secretory,
        { id: "erToGolgi", dur: T.erToGolgi, text: "Leaves the ER in a COPII vesicle, as part of the vesicle membrane." },
        { id: "golgi", dur: T.golgi, text: "Passes through the Golgi stack; sugar chains are trimmed and extended." },
        { id: "golgiToPM", dur: T.golgiToPM, text: "A vesicle from the trans-Golgi network fuses with the plasma membrane." }],
        why: viaAnchor
          ? "A TM segment without a signal peptide works as a signal anchor: the protein enters the ER membrane. With no other signal it follows the default route to the plasma membrane."
          : "The signal peptide takes it into the ER; the TM segment stops the transfer and anchors it in the membrane. With no retention signal, membrane proteins follow the default route to the plasma membrane.",
        topology: viaAnchor ? "Signal-anchor protein: orientation set by flanking charges (ER lecture)."
          : "Type I membrane protein: the part before the TM segment is in the ER lumen and ends up outside the cell; the C-terminal tail stays in the cytosol." };
    }
    // soluble, in the lumen
    if (p.cterm === "kdel" && p.m6p) return { dest: "unclear", ignored, steps: [...secretory, stop("Two lumenal sorting signals compete.")],
      why: "KDEL (back to the ER) and mannose-6-phosphate (on to the lysosome) compete for the same protein in the Golgi. The outcome depends on which receptor wins, so the game does not predict it." };
    if (p.cterm === "kdel") return { dest: "erLumen", ignored, steps: [...secretory,
      { id: "erToGolgi", dur: T.erToGolgi, text: "Some molecules escape in COPII vesicles to the Golgi (cis side)." },
      { id: "golgiBack", dur: T.golgiBack, text: "The KDEL receptor binds the KDEL tail and a COPI vesicle carries it back to the ER." }],
      why: "The signal peptide takes it into the ER lumen. KDEL does not stop the protein from leaving; it gets it back: the KDEL receptor in the cis-Golgi returns it to the ER (retrieval)." };
    if (p.m6p) return { dest: "lysosome", ignored, steps: [...secretory,
      { id: "erToGolgi", dur: T.erToGolgi, text: "Leaves the ER in a COPII vesicle." },
      { id: "golgi", dur: T.golgi, text: "In the cis-Golgi, its signal patch gets a phosphate on mannose (M6P); in the trans-Golgi network the M6P receptor binds it." },
      { id: "golgiToEndo", dur: T.golgiToEndo, text: "A clathrin-coated vesicle carries receptor and cargo to an endosome; the acid pH releases the cargo." },
      { id: "endoToLys", dur: T.endoToLys, text: "The endosome matures into, or fuses with, a lysosome." }],
      why: "Signal peptide into the ER, then the mannose-6-phosphate tag added in the Golgi is read by the M6P receptor, which delivers the protein to endosomes and lysosomes." };
    return { dest: "secreted", ignored, steps: [...secretory,
      { id: "erToGolgi", dur: T.erToGolgi, text: "Leaves the ER in a COPII vesicle." },
      { id: "golgi", dur: T.golgi, text: "Passes through the Golgi stack." },
      { id: "golgiToPM", dur: T.golgiToPM, text: "A secretory vesicle fuses with the plasma membrane and releases the protein outside." }],
      why: "Signal peptide into the ER lumen, and no further signal: soluble proteins follow the default route and are secreted." };
  }

  // ---- 2. Made in the cytosol. Lumenal signals are never read here.
  if (p.cterm === "kdel") ignored.kdel = "KDEL is read in the ER and Golgi lumen. Without a signal peptide the protein never gets there.";
  if (p.m6p) ignored.m6p = "The mannose-6-phosphate tag is added in the Golgi. Without a signal peptide the protein never enters the secretory pathway.";

  if (p.nterm === "mts") {
    if (p.nls || p.cterm === "pts1") return { dest: "unclear", ignored, steps: [transCyto, stop("Two cytosolic targeting signals compete.")],
      why: "A presequence plus an NLS or PTS1 gives two cytosolic receptors a claim on the same protein. Real proteins like this exist and often end up split between compartments, depending on signal strength and folding speed. The game does not predict it." };
    const imp: Step[] = [transCyto,
      { id: "toMito", dur: T.toMito, text: "Kept unfolded by cytosolic chaperones; the presequence binds the TOM complex in the outer membrane." },
      { id: "mitoImport", dur: T.mitoImport, text: "Threaded through TOM and TIM23; the membrane potential pulls the positive presequence in, mitochondrial Hsp70 pulls the rest. The presequence is cut off in the matrix." }];
    if (p.tm) return { dest: "innerMem", ignored, steps: [...imp.slice(0, 2),
      { id: "toInner", dur: T.mitoImport, text: "The hydrophobic segment stops transfer in TIM23 and moves sideways into the inner membrane." }],
      why: "The presequence starts import into the matrix; the hydrophobic segment that follows stops it in the TIM23 channel and is released into the inner membrane (stop-transfer).",
      topology: "N-terminus in the matrix, C-terminal part in the intermembrane space." };
    return { dest: "matrix", ignored, steps: imp,
      why: "The positively charged presequence is recognised by TOM and TIM23; the protein is imported unfolded into the matrix, where the presequence is removed." };
  }

  if (p.nls && p.cterm === "pts1") return { dest: "unclear", ignored, steps: [transCyto, stop("Two cytosolic receptors compete.")],
    why: "Importins (NLS) and PEX5 (PTS1) both bind it in the cytosol. The result depends on which wins and how fast; the game does not predict it." };
  if (p.nls) return { dest: "nucleus", ignored, steps: [transCyto,
    { id: "toPore", dur: T.toPore, text: "Importin α binds the NLS, importin β binds importin α and the FG repeats of the pore." },
    { id: "throughPore", dur: T.pore, text: "The complex passes the nuclear pore in about 10 ms, folded." },
    { id: "diffuseNuc", dur: T.nucAccum, text: "Ran-GTP in the nucleus releases the cargo. The cycle repeats and the protein accumulates in the nucleus over minutes." }],
    why: "The NLS is read by importins in the cytosol; importin carries the folded protein through the nuclear pore and Ran-GTP releases it inside. Ran-GTP is only in the nucleus, so import goes one way." };
  if (p.cterm === "pts1") return { dest: "peroxisome", ignored, steps: [transCyto,
    { id: "toPex", dur: T.toPex, text: "The receptor PEX5 binds the C-terminal PTS1 (-SKL) in the cytosol, after folding." },
    { id: "pexImport", dur: T.pexImport, text: "PEX5 docks on the peroxisome membrane and takes the folded protein in; PEX5 is recycled." }],
    why: "PTS1, the last three amino acids (-SKL), is read by PEX5 in the cytosol, and the folded protein is imported into the peroxisome." };
  if (!p.large) return { dest: "cytonuc", ignored, steps: [transCyto,
    { id: "diffuseNuc", dur: T.diffuseNuc, text: "Small enough to diffuse through the nuclear pores: it spreads into the nucleus too." }],
    why: "No sorting signal: it stays in the cytosol. But nuclear pores let proteins below about 40–60 kDa diffuse through, so a small protein such as GFP fills cytosol and nucleus." };
  return { dest: "cytosol", ignored, steps: [transCyto, stop("No signal: stays where it was made.")],
    why: "No sorting signal: the cytosol is the default. A large protein cannot diffuse through the nuclear pores, so it stays out of the nucleus." };
}

export const totalTime = (o: Outcome) => o.steps.reduce((s, x) => s + x.dur, 0);
