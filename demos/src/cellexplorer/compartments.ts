// Measure mode: what each compartment is like inside. Textbook values for a typical
// mammalian cell (free, not total, Ca²⁺); ranges where measurements differ.
// `ph` and `caUM` are one representative number each, used only for the colour maps.
import type { Cat } from "./measure";

export interface Compartment {
  id: Cat | "perox" | "outside";
  name: string;
  colour: string;
  ph: number | null;          // representative pH (null: no water phase)
  caUM: number | null;        // representative free Ca²⁺ in µM
  phText: string;
  caText: string;
  why: string;
  tour: string;               // share of cell volume in the cell-tour table (liver cell)
  counted: boolean;           // outlined in this slice, so it can be counted
}

export const COMPARTMENTS: Compartment[] = [
  {
    id: "nucleus", name: "Nucleus", colour: "#6b4fa0", ph: 7.2, caUM: 0.1,
    phText: "7.2", caText: "≈ 0.1 µM",
    why: "Nuclear pores let ions and small molecules through freely, so the nucleoplasm has the same pH and Ca²⁺ as the cytosol. (The space between the two nuclear membranes is part of the ER lumen.)",
    tour: "5–10 %", counted: true,
  },
  {
    id: "er", name: "Endoplasmic reticulum", colour: "#2a7f8f", ph: 7.2, caUM: 500,
    phText: "7.2", caText: "≈ 0.1–0.8 mM",
    why: "The cell's main Ca²⁺ store: SERCA pumps fill it with ATP, and Ca²⁺-binding chaperones in the lumen need the Ca²⁺ to fold proteins.",
    tour: "10–15 %", counted: true,
  },
  {
    id: "golgi", name: "Golgi apparatus", colour: "#d9822b", ph: 6.4, caUM: 200,
    phText: "6.7 (cis) → 6.0 (trans)", caText: "≈ 0.1–0.3 mM",
    why: "A V-type H⁺ pump acidifies each cisterna a little more than the one before; the falling pH helps sorting receptors bind and release their cargo.",
    tour: "2–5 %", counted: true,
  },
  {
    id: "mito", name: "Mitochondria (matrix)", colour: "#a8324a", ph: 8.0, caUM: 0.1,
    phText: "≈ 8.0", caText: "≈ 0.1 µM at rest; 10–100 µM in a Ca²⁺ signal",
    why: "The electron transport chain pumps H⁺ out of the matrix, so the matrix is alkaline. Ca²⁺ enters through the uniporter, pulled by the negative matrix, mostly at contacts with the ER.",
    tour: "~20 %", counted: true,
  },
  {
    id: "endolyso", name: "Endosomes and lysosomes", colour: "#2e8b57", ph: 5.0, caUM: 500,
    phText: "6.5 (early endosome) → 4.5–5 (lysosome)", caText: "lysosome ≈ 0.5 mM",
    why: "V-type H⁺ pumps acidify the lumen more and more along the route; lysosomal enzymes work best at pH 4.5–5 and are almost inactive at the pH of the cytosol.",
    tour: "1–2 %", counted: true,
  },
  {
    id: "ld", name: "Lipid droplets", colour: "#b38f00", ph: null, caUM: null,
    phText: "none: oil, no water inside", caText: "none",
    why: "A core of fat covered by one layer of phospholipids. There is no water inside, so pH and Ca²⁺ have no meaning there.",
    tour: "varies (fat cell ~90 %)", counted: true,
  },
  {
    id: "perox", name: "Peroxisomes", colour: "#3b5bab", ph: null, caUM: null,
    phText: "≈ 7–8 (measurements disagree)", caText: "not well known",
    why: "Not outlined in this slice: peroxisomes are small (0.1–1 µm) and the segmentation has no peroxisome layer.",
    tour: "~1 %", counted: false,
  },
  {
    id: "cytosol", name: "Cytosol (everything else)", colour: "#868e96", ph: 7.2, caUM: 0.1,
    phText: "7.2", caText: "≈ 0.1 µM",
    why: "Pumps in the plasma membrane and the ER keep free Ca²⁺ 10 000 times lower than outside. In this count the cytosol includes ribosomes, the cytoskeleton, the centrosome and the small vesicles that are not outlined.",
    tour: "~50 %", counted: true,
  },
  {
    id: "outside", name: "Outside the cell (for comparison)", colour: "#8a6a12", ph: 7.4, caUM: 1500,
    phText: "7.4", caText: "≈ 1–2 mM",
    why: "Blood plasma and culture medium. The ER and lysosome lumens are topologically outside: their Ca²⁺ is high, as it is here.",
    tour: "", counted: false,
  },
];

export const COMP = Object.fromEntries(COMPARTMENTS.map(c => [c.id, c])) as Record<Compartment["id"], Compartment>;

/** Fill colour for the pH map (null: no fill). Neutral 7.2 has no colour. */
export function phColour(ph: number | null): string | null {
  if (ph === null) return "#868e96";
  if (Math.abs(ph - 7.2) < 0.05) return null;
  if (ph > 7.2) return "#1c7ed6";
  // acid: orange (6.5) to deep red (4.5)
  const t = Math.max(0, Math.min(1, (6.7 - ph) / 2.2));
  return mix("#f59f00", "#c92a2a", t);
}
/** Fill colour for the Ca²⁺ map: log scale from 0.1 µM (none) to 1 mM (dark magenta). */
export function caColour(ca: number | null): string | null {
  if (ca === null) return "#868e96";
  if (ca <= 0.15) return null;
  const t = Math.max(0, Math.min(1, Math.log10(ca / 0.1) / 4));
  return mix("#f3a6c4", "#a61e4d", t);
}
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2].map(i => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, "0")).join("");
}
