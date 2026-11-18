// Organelle classes shown in the cell explorer: colour (shared colour key in
// plan/lecture-brief.md), a short description, how to recognise it in EM, and the
// lecture(s) that cover it (by topic, never by number).

export interface OrgClass {
  id: string;
  name: string;          // shown in the layer list and info card
  quizName: string;      // "Find a …"
  colour: string;
  text: string;
  em: string;
  lecture: string;
  band?: boolean;        // thin membrane: hit-tested by distance to the outline
}

export const CLASSES: OrgClass[] = [
  {
    id: "nucleus", name: "Nucleus", quizName: "the nucleus", colour: "#6b4fa0",
    text: "Holds the DNA as chromatin. The dark clumps are tightly packed heterochromatin, much of it along the envelope. "
      + "This slice also cuts through a deep fold in the nucleus, so a patch of cytoplasm (with mitochondria and the centrosome) seems to lie inside it.",
    em: "The largest round body; grainy, with dark clumps of chromatin.",
    lecture: "A tour of the cell; Organelles compared",
  },
  {
    id: "ne", name: "Nuclear envelope", quizName: "the nuclear envelope", colour: "#9b7fd4", band: true,
    text: "Two membranes around the nucleus, crossed by nuclear pores. The outer membrane continues into the ER.",
    em: "A thin double line at the edge of the nucleus, with small gaps where the pores are.",
    lecture: "Sorting proteins to the right compartment",
  },
  {
    id: "nucleolus", name: "Nucleolus", quizName: "a nucleolus", colour: "#3d2a66",
    text: "Where ribosomal RNA is made and ribosome subunits are put together. It has no membrane around it. "
      + "This slice only grazes the edge of one nucleolus; most of it lies in other planes.",
    em: "A dense, evenly grey, finely granular area inside the nucleus.",
    lecture: "A tour of the cell",
  },
  {
    id: "er", name: "Endoplasmic reticulum", quizName: "the endoplasmic reticulum (ER)", colour: "#2a7f8f",
    text: "A network of membrane tubes and flat sacs. Rough ER makes membrane and secreted proteins; smooth ER makes lipids and stores Ca²⁺.",
    em: "Thin tubes and flat sacs, often in rows; rough ER is dotted with ribosomes (dark grains).",
    lecture: "The endoplasmic reticulum: making, folding and checking proteins",
  },
  {
    id: "golgi", name: "Golgi apparatus", quizName: "the Golgi apparatus", colour: "#d9822b",
    text: "A stack of flattened sacs (cisternae) that modifies proteins coming from the ER and sorts them to their destinations.",
    em: "A stack of 4–8 curved, parallel membranes with small vesicles at the edges, usually next to the nucleus.",
    lecture: "The Golgi and the secretory pathway",
  },
  {
    id: "mito", name: "Mitochondria", quizName: "a mitochondrion", colour: "#a8324a",
    text: "Make most of the cell's ATP by oxidative phosphorylation. A HeLa cell has hundreds; many are long tubes, cut here at different angles.",
    em: "Oval or long bodies, about 0.3–0.6 µm wide, with a double membrane; the inner membrane folds into stripes (cristae).",
    lecture: "Mitochondria: energy conversion and more",
  },
  {
    id: "endolyso", name: "Endosomes and lysosomes", quizName: "an endosome or lysosome", colour: "#2e8b57",
    text: "Endosomes receive material taken up from outside the cell; lysosomes digest it with acid enzymes.",
    em: "Round vesicles, 0.2–1 µm; lysosomes are dark and dense, multivesicular bodies are full of small vesicles.",
    lecture: "Endocytosis, lysosomes and autophagy",
  },
  {
    id: "ld", name: "Lipid droplet", quizName: "a lipid droplet", colour: "#b38f00",
    text: "A store of neutral fat (triglycerides and cholesterol esters), covered by a single layer of phospholipids, not a bilayer.",
    em: "Round and evenly grey inside, with no membrane line around it.",
    lecture: "Organelles compared: keeping the cell in balance",
  },
  {
    id: "cent", name: "Centrosome (centriole)", quizName: "the centrosome", colour: "#555555",
    text: "Organises the cell's microtubules. It contains a pair of centrioles; here one centriole is cut across: a ring of nine microtubule triplets, about 250 nm wide.",
    em: "A small cartwheel-like ring near the nucleus, often next to the Golgi.",
    lecture: "Microtubules and motor proteins",
  },
  {
    id: "pm", name: "Plasma membrane", quizName: "the plasma membrane", colour: "#8a6a12", band: true,
    text: "The membrane around the cell: a lipid bilayer with proteins that control what enters and leaves. "
      + "Only the parts that face the space outside the cells are outlined.",
    em: "A thin dark line where the cytoplasm ends and the smooth grey resin (outside the cell) begins.",
    lecture: "Membrane structure; Moving molecules across membranes",
  },
];
