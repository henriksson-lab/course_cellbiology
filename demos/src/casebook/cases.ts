// Case data and grading for "Diagnose the defect" (disease-casebook). No DOM here, so the
// file can be bundled for Node and checked (every key valid, every case has a right answer).
// Simplifications (said on the page): each case is a typical textbook patient, the findings
// are shown in a fixed order, and "fits" means the therapy type that acts on the broken step
// (or the best one available today), not a full treatment plan.

export type ProcessKey = "fold" | "sort" | "channel" | "endo" | "lyso" | "cyto" | "mito" | "expr";
export type TherapyKey = "corr" | "pot" | "inhib" | "ert" | "ab" | "aso" | "sirna" | "gene" | "supp";
export type Grade = "right" | "partly" | "wrong";
export type Level = "Clinic" | "Body fluids" | "Tissue" | "Cell" | "Molecule";
export type Category = "loss of function" | "gain of function" | "toxic aggregate" | "wrong place" | "wrong amount";

export const PROCESSES: { key: ProcessKey; label: string }[] = [
  { key: "fold", label: "Protein folding and quality control (incl. aggregation)" },
  { key: "sort", label: "Sorting: the protein is sent to the wrong compartment" },
  { key: "channel", label: "Ion channel: the pore does not open" },
  { key: "endo", label: "Endocytosis and receptor recycling" },
  { key: "lyso", label: "Lysosomal digestion: an enzyme is missing" },
  { key: "cyto", label: "Cytoskeleton and motors (incl. cilia)" },
  { key: "mito", label: "Mitochondria: ATP production" },
  { key: "expr", label: "Gene expression: too little protein is made" },
];

export const THERAPIES: { key: TherapyKey; label: string }[] = [
  { key: "corr", label: "Small molecule that helps a protein fold or stay folded (corrector, stabiliser)" },
  { key: "pot", label: "Small molecule that holds a channel open (potentiator)" },
  { key: "inhib", label: "Small-molecule inhibitor of an enzyme or motor" },
  { key: "ert", label: "Enzyme or protein replacement (infusion)" },
  { key: "ab", label: "Antibody that blocks a protein" },
  { key: "aso", label: "Antisense oligonucleotide (changes splicing or blocks an mRNA)" },
  { key: "sirna", label: "siRNA (destroys one mRNA)" },
  { key: "gene", label: "Gene therapy (deliver a working gene)" },
  { key: "supp", label: "No drug for the cause yet: treat the consequences" },
];

/** Generic reason why a therapy type does not fit, used when a case has no specific text. */
export const THERAPY_WHY_NOT: Record<TherapyKey, string> = {
  corr: "A corrector or stabiliser helps a protein that folds badly. Nothing here says the protein misfolds.",
  pot: "A potentiator holds an ion channel open longer. It only helps a channel that reaches the membrane but opens too rarely.",
  inhib: "An inhibitor lowers the activity of a protein. That helps when something is too active, not when a protein is missing.",
  ert: "Replacement by infusion works for a soluble protein that cells can take up by endocytosis (or that acts in the blood). It cannot replace a membrane protein or a protein inside the cytosol or a mitochondrion.",
  ab: "An antibody blocks a protein outside the cell (in blood or on the cell surface). It cannot add a missing function, and it does not get into the cytosol.",
  aso: "An antisense oligonucleotide pairs with one mRNA to change its splicing or block it. It is useful when changing the amount or the form of one mRNA helps.",
  sirna: "An siRNA destroys one mRNA. That helps when a harmful protein should be removed; here it would remove a protein the patient needs.",
  gene: "Adding a working gene helps when a protein is missing. It does not remove a harmful mutant protein.",
  supp: "There is a drug that acts on the cause here, so treating only the consequences is not the best fit.",
};

export interface Finding { level: Level; text: string }
export interface Feedback { grade: Grade; text: string }
export interface LectureLink { topic: string; href?: string }

export interface Case {
  key: string;
  title: string;          // shown before solving (no disease name)
  disease: string;        // revealed after the process is right
  findings: Finding[];
  process: Partial<Record<ProcessKey, Feedback>>;   // missing keys = wrong, with processWhyNot
  processWhyNot: string;  // generic text for the remaining wrong process choices
  category: Category[];
  explain: string;        // shown after the process is right
  therapy: Partial<Record<TherapyKey, Feedback>>;   // missing keys = wrong, with THERAPY_WHY_NOT
  therapyExplain: string; // shown after a fitting therapy is chosen
  lectures: LectureLink[];
}

export const CASES: Case[] = [
  {
    key: "cf-f508",
    title: "A baby with salty skin",
    disease: "Cystic fibrosis (F508del on both copies of CFTR)",
    findings: [
      { level: "Clinic", text: "A 4-month-old baby gains weight poorly, has fatty stools and two chest infections. The parents say the skin tastes salty when they kiss the baby." },
      { level: "Body fluids", text: "Sweat test: chloride 98 mmol/L (normal below 30; 60 or more points to cystic fibrosis)." },
      { level: "Tissue", text: "Nose lining cells in a chamber: raising cAMP gives no chloride current out of the cells." },
      { level: "Cell", text: "Western blot of CFTR from the nose cells: only the small, ER form of the protein (band B, simple sugars). The mature form that has passed the Golgi (band C) is missing." },
      { level: "Molecule", text: "Both CFTR genes lack phenylalanine 508. If the patient's cells are grown at 27 °C instead of 37 °C, some CFTR reaches the surface and conducts Cl⁻." },
    ],
    process: {
      fold: { grade: "right", text: "Right. The protein misfolds, ER quality control holds it and ERAD degrades it: only the ER form (band B) is seen. At 27 °C it folds a little better, escapes the ER and works, so the pore itself is not the main problem." },
      channel: { grade: "partly", text: "Close: chloride transport through CFTR is lost. But the blot shows that the channel never leaves the ER, and the 27 °C rescue shows the pore can work. Which step stops it?" },
      sort: { grade: "partly", text: "Close: the protein does not reach the plasma membrane. But the sorting machinery is normal; the ER keeps the protein back on purpose. Why?" },
    },
    processWhyNot: "That process works normally here. Look again at the blot: which form of CFTR is missing, and where is the protein stuck?",
    category: ["loss of function", "wrong place"],
    explain: "Loss of function because the protein is in the wrong place: misfolded CFTR stays in the ER and is destroyed. No channel in the apical membrane, so no Cl⁻ and water secretion; mucus becomes thick, and the sweat duct cannot take Cl⁻ back.",
    therapy: {
      corr: { grade: "right", text: "Fits. Correctors (elexacaftor, tezacaftor) bind CFTR while it folds and let it leave the ER. Because rescued F508del also opens poorly, they are given together with a potentiator (ivacaftor): one combination pill, approved 2019." },
      pot: { grade: "partly", text: "Half the answer. A potentiator holds the gate open, but alone it has little to act on: almost no F508del protein reaches the surface. It is combined with correctors." },
      gene: { grade: "partly", text: "In principle yes: a normal CFTR gene would replace the missing function. Trials delivering CFTR genes to the airways with viruses or lipids have so far given too little expression to help much." },
      supp: { grade: "partly", text: "Treating the consequences (airway clearance, antibiotics, pancreatic enzymes with food) is still needed, but today a drug acts on the cause in about 9 of 10 patients." },
    },
    therapyExplain: "Matching rule: a protein that misfolds but could work if it reached its place needs a corrector.",
    lectures: [
      { topic: "the ER lecture (quality control, ERAD)", href: "../er/lec.html" },
      { topic: "the ion channels lecture (CFTR, sweat test)", href: "../ion-channels/lec.html" },
    ],
  },
  {
    key: "cf-g551d",
    title: "The same diagnosis, another defect",
    disease: "Cystic fibrosis (G551D in CFTR)",
    findings: [
      { level: "Clinic", text: "A 9-year-old with cystic fibrosis: lung infections and thick mucus, like the baby in case 1." },
      { level: "Body fluids", text: "Sweat test: chloride 105 mmol/L." },
      { level: "Cell", text: "Western blot of CFTR: the mature form (band C) is present in normal amount. Antibody staining shows CFTR in the apical plasma membrane." },
      { level: "Molecule", text: "Patch clamp of single CFTR channels with PKA and ATP added: the channel opens about 100 times less often than normal. The mutation (G551D) sits in an ATP-binding domain." },
    ],
    process: {
      channel: { grade: "right", text: "Right. The protein folds, passes the Golgi (band C) and sits in the right membrane, but its gate does not open: ATP binding cannot drive opening." },
      fold: { grade: "wrong", text: "Not here: band C and the staining at the apical membrane show that the protein folded well enough to pass ER quality control." },
      sort: { grade: "wrong", text: "Not here: the protein is in the apical membrane, its correct place." },
    },
    processWhyNot: "That process works normally here. The protein is made and is in the right place. What does patch clamp show?",
    category: ["loss of function"],
    explain: "Loss of function of the channel itself (a gating defect). Same disease as case 1, a different broken step: that is why cystic fibrosis drugs are chosen by mutation.",
    therapy: {
      pot: { grade: "right", text: "Fits. The potentiator ivacaftor binds CFTR and holds the gate open longer. Approved 2012 for G551D, the first drug against the cause of cystic fibrosis: sweat chloride falls by about half, and lung function improves." },
      corr: { grade: "partly", text: "Not needed: the protein already folds and reaches the surface. The problem is the gate, so a potentiator alone works. (Combination pills contain both.)" },
      gene: { grade: "partly", text: "In principle a normal gene would help, but delivery to the airways is still too inefficient (see case 1). A pill that opens the existing channel is far simpler." },
      supp: { grade: "partly", text: "Still needed alongside, but a drug acts on the cause." },
    },
    therapyExplain: "Matching rule: a channel in the right place that opens too rarely needs a potentiator.",
    lectures: [
      { topic: "the ion channels lecture (patch clamp, CFTR modulators)", href: "../ion-channels/lec.html" },
    ],
  },
  {
    key: "fh-pcsk9",
    title: "A heart attack that runs in the family",
    disease: "Familial hypercholesterolaemia caused by a gain-of-function PCSK9 mutation",
    findings: [
      { level: "Clinic", text: "A 35-year-old man has chest pain on exertion. His father had a heart attack at 42. There are yellow lumps on his Achilles tendons (xanthomas)." },
      { level: "Body fluids", text: "LDL cholesterol 7.5 mmol/L (target below 3). His sister, tested as a child, was also high." },
      { level: "Tissue", text: "A plaque from a coronary artery contains foam cells: macrophages filled with cholesterol droplets." },
      { level: "Cell", text: "Liver cells with his genotype make normal LDL receptor protein, which reaches the surface. But few receptors stay there: after endocytosis most go to lysosomes instead of returning to the surface." },
      { level: "Molecule", text: "The LDL receptor gene is normal. He carries one mutated copy of PCSK9; the mutant PCSK9 binds the receptor more tightly than normal." },
    ],
    process: {
      endo: { grade: "right", text: "Right. Receptor-mediated endocytosis of LDL works, but the receptor is not recycled: PCSK9 bound to it sends it to the lysosome. Fewer receptors on the liver cell means less LDL is removed from the blood." },
      lyso: { grade: "partly", text: "Close: the receptors are destroyed in lysosomes, but the lysosomes work normally; they digest what they are sent. The error is earlier: in the endosome the receptor should be sorted back to the surface." },
      sort: { grade: "partly", text: "Close: the receptor is mis-sorted, but in the endosome after uptake, not on the way out from the Golgi (it reaches the surface normally). Which pathway includes the endosome and recycling?" },
    },
    processWhyNot: "That process works normally here. Follow the receptor: it is made, reaches the surface and is taken up. What goes wrong next?",
    category: ["gain of function", "wrong amount"],
    explain: "A gain of function in PCSK9 causes a wrong amount of the LDL receptor at the cell surface. The more common form of FH is the opposite: a loss-of-function mutation in the LDL receptor itself. Both give the same blood test.",
    therapy: {
      ab: { grade: "right", text: "Fits. Anti-PCSK9 antibodies (evolocumab, alirocumab) catch PCSK9 in the blood, so receptors recycle again. LDL falls by 50–60 %, on top of a statin." },
      sirna: { grade: "right", text: "Fits. Inclisiran, an siRNA taken up by liver cells, destroys PCSK9 mRNA, so less PCSK9 is made. Two injections a year." },
      inhib: { grade: "partly", text: "A statin (an HMG-CoA reductase inhibitor) is the first drug given and makes liver cells build more receptors, but it does not act on the defect; statins even raise PCSK9. Usually combined with a PCSK9 blocker in FH." },
      gene: { grade: "partly", text: "Adding a gene does not help: the receptor gene is normal. Silencing PCSK9 for good by base editing in the liver is being tested in trials." },
    },
    therapyExplain: "Matching rule: a protein that is too active outside the cell can be blocked by an antibody, or its mRNA destroyed by an siRNA.",
    lectures: [
      { topic: "the endocytosis lecture (LDL receptor cycle, PCSK9)", href: "../endocytosis-lysosomes/lec.html" },
    ],
  },
  {
    key: "gaucher",
    title: "A large spleen and aching bones",
    disease: "Gaucher disease type 1 (glucocerebrosidase deficiency)",
    findings: [
      { level: "Clinic", text: "A 20-year-old woman is tired, bruises easily and has bone pain. Her spleen and liver are much enlarged." },
      { level: "Body fluids", text: "Low platelets and low haemoglobin." },
      { level: "Tissue", text: "Bone marrow: many large macrophages whose cytoplasm looks like wrinkled tissue paper." },
      { level: "Cell", text: "Electron microscopy of these macrophages: lysosomes are swollen and packed with tubular lipid deposits (glucosylceramide)." },
      { level: "Molecule", text: "Enzyme assay in white blood cells: glucocerebrosidase activity is 10 % of normal. Other lysosomal enzymes are normal. Both GBA1 genes carry a missense mutation." },
    ],
    process: {
      lyso: { grade: "right", text: "Right. One lysosomal enzyme is missing, so its substrate, a glycolipid from old blood cells, piles up in the lysosomes of the macrophages that eat those cells." },
      sort: { grade: "partly", text: "A sorting defect would lower many lysosomal enzymes at once (see the I-cell case). Here only one enzyme is low: the enzyme itself is defective." },
      endo: { grade: "wrong", text: "Uptake works: the macrophages eat old blood cells normally. The problem is what happens to the material in the lysosome." },
    },
    processWhyNot: "That process works normally here. Where in the cell does the lipid pile up, and which enzyme is low?",
    category: ["loss of function"],
    explain: "Loss of function of one lysosomal enzyme. It is one of about 70 lysosomal storage diseases, each missing one enzyme or transporter.",
    therapy: {
      ert: { grade: "right", text: "Fits. Enzyme replacement (imiglucerase, since the 1990s) is infused every two weeks. Its sugar chains are trimmed to end in mannose, so macrophages take it up by receptor-mediated endocytosis (mannose receptor) and deliver it to lysosomes. The spleen shrinks and the blood counts recover." },
      inhib: { grade: "right", text: "Also fits: substrate reduction. Eliglustat, a pill, inhibits glucosylceramide synthase, so less substrate is made and the weak enzyme can keep up." },
      corr: { grade: "partly", text: "An interesting idea: small 'chaperone' molecules that help mutant glucocerebrosidase fold and leave the ER are being tested, but none is approved for Gaucher disease. (One is approved for Fabry disease.)" },
      gene: { grade: "partly", text: "Gene therapy of blood stem cells is in trials. Today, enzyme replacement or substrate reduction is the standard." },
    },
    therapyExplain: "Matching rule: a missing soluble lysosomal enzyme can be infused, because cells take it up by endocytosis and send it to the lysosome.",
    lectures: [
      { topic: "the endocytosis lecture (lysosomes, enzyme replacement)", href: "../endocytosis-lysosomes/lec.html" },
    ],
  },
  {
    key: "icell",
    title: "Enzymes in the wrong place",
    disease: "I-cell disease (mucolipidosis II, GlcNAc phosphotransferase deficiency)",
    findings: [
      { level: "Clinic", text: "A baby has coarse facial features, stiff joints, thick gums and grows slowly. Development is delayed." },
      { level: "Cell", text: "Skin fibroblasts in culture are full of large, pale inclusions: swollen lysosomes with undigested material ('inclusion cells')." },
      { level: "Body fluids", text: "In blood plasma, many different lysosomal enzymes are 10–20 times higher than normal." },
      { level: "Cell", text: "Inside the fibroblasts, the same enzymes are very low. Normal fibroblasts take up enzymes secreted by normal cells, but not the enzymes secreted by the patient's cells." },
      { level: "Molecule", text: "Both genes for GlcNAc phosphotransferase, the Golgi enzyme that adds the mannose-6-phosphate (M6P) tag, carry loss-of-function mutations." },
    ],
    process: {
      sort: { grade: "right", text: "Right. Without the M6P tag the M6P receptor in the trans-Golgi network cannot catch the enzymes, so they follow the default route and are secreted. The enzymes work; they are in the wrong place." },
      lyso: { grade: "partly", text: "Close: the lysosomes fill up, but many enzymes are low at once and they are high in plasma. They are active, just not delivered. Which step sends enzymes to the lysosome?" },
      endo: { grade: "partly", text: "Uptake from outside by the M6P receptor works for normal enzymes. The patient's enzymes lack the tag. Where is the tag added?" },
    },
    processWhyNot: "That process works normally here. Compare the enzymes in plasma and inside the cells: where did they go?",
    category: ["wrong place"],
    explain: "Wrong place: one broken tagging enzyme in the Golgi mis-sends dozens of lysosomal enzymes out of the cell. This disease showed how lysosomal enzymes are sorted (the M6P pathway).",
    therapy: {
      supp: { grade: "right", text: "Fits, sadly. There is no approved drug for the cause; care treats the joints, heart and breathing. Most children with the severe form die in early childhood." },
      ert: { grade: "partly", text: "Dozens of enzymes are missing at once, so replacing all of them is not practical; and the cells' own enzymes are lost to the blood all the time." },
      gene: { grade: "partly", text: "In principle the right idea: one gene restores the tag for all enzymes. It is still at the stage of animal experiments." },
    },
    therapyExplain: "Matching rule: when one step mis-sends many proteins, only fixing that step (the gene) would help; replacing each protein is not practical.",
    lectures: [
      { topic: "the Golgi lecture (M6P tag in the cis-Golgi)", href: "../golgi-secretion/lec.html" },
      { topic: "the protein sorting lecture (signals and receptors)", href: "../protein-sorting/lec.html" },
    ],
  },
  {
    key: "attr",
    title: "Numb feet in northern Sweden",
    disease: "Hereditary transthyretin amyloidosis (ATTR V30M, 'Skelleftesjukan')",
    findings: [
      { level: "Clinic", text: "A 55-year-old man from Skellefteå has burning pain and numbness in his feet, diarrhoea and dizziness when he stands up. His mother had the same. Later his heart muscle thickens." },
      { level: "Tissue", text: "A fat or nerve biopsy stained with Congo red: deposits glow apple-green in polarised light. This is amyloid." },
      { level: "Molecule", text: "The amyloid is made of transthyretin (TTR), a blood protein made by the liver that carries thyroid hormone. Normally it is a stable tetramer (four chains)." },
      { level: "Molecule", text: "One TTR gene carries V30M. The mutant tetramer falls apart more easily; the single chains misfold and stack into fibrils." },
      { level: "Clinic", text: "Since 1990 some patients received a liver transplant. The disease then progressed much more slowly." },
    ],
    process: {
      fold: { grade: "right", text: "Right. A protein that should stay folded comes apart, misfolds and forms amyloid, which damages nerves and heart. The transplant worked because the liver makes almost all TTR." },
      sort: { grade: "wrong", text: "TTR is secreted normally into the blood, its correct place. The trouble starts afterwards." },
    },
    processWhyNot: "That process works normally here. What are the deposits made of, and what happens to the mutant protein?",
    category: ["toxic aggregate", "gain of function"],
    explain: "Toxic aggregate: the mutant protein gains a harmful property (it forms amyloid). One copy is enough (dominant). The same principle, without a mutation, underlies Alzheimer's and Parkinson's disease.",
    therapy: {
      sirna: { grade: "right", text: "Fits. Patisiran (2018), the first siRNA drug, is carried into liver cells by lipid nanoparticles and destroys TTR mRNA: TTR in blood falls by about 80 %. Vutrisiran works the same way." },
      aso: { grade: "right", text: "Fits. Antisense oligonucleotides (inotersen, eplontersen) bind TTR mRNA in the liver and have it destroyed." },
      corr: { grade: "right", text: "Fits. Tafamidis, a small-molecule stabiliser, binds the TTR tetramer (in the thyroid-hormone pocket) and stops it falling apart, so less amyloid forms." },
      ab: { grade: "partly", text: "Antibodies that help remove existing amyloid deposits are being tested in trials; none is approved yet." },
      gene: { grade: "wrong", text: "The patient already has a normal TTR copy. Adding another does not remove the mutant protein. (Editing the TTR gene off in the liver with CRISPR is in trials: that is silencing, not adding.)" },
    },
    therapyExplain: "Matching rule: when a protein is toxic, make less of it (siRNA, ASO) or keep it folded (stabiliser).",
    lectures: [
      { topic: "the protein life and death lecture (misfolding, amyloid)", href: "../protein-lifecycle/lec.html" },
      { topic: "the membrane structure lecture (lipid nanoparticles)", href: "../membrane-structure/lec.html" },
    ],
  },
  {
    key: "pcd",
    title: "A cough that never stops, and a heart on the right",
    disease: "Primary ciliary dyskinesia (outer dynein arm defect, DNAH5)",
    findings: [
      { level: "Clinic", text: "A newborn needed help with breathing. Since then: a wet cough every day, sinus and ear infections. The chest X-ray shows the heart on the right side." },
      { level: "Body fluids", text: "Sweat test: chloride 25 mmol/L (normal)." },
      { level: "Tissue", text: "Cells brushed from the nose, filmed with a high-speed camera: the cilia are still or only twitch." },
      { level: "Cell", text: "Electron microscopy of cilia in cross-section: the 9 + 2 microtubules are there, but the outer dynein arms are missing." },
      { level: "Molecule", text: "Both copies of DNAH5, a heavy chain of axonemal dynein, carry loss-of-function mutations." },
    ],
    process: {
      cyto: { grade: "right", text: "Right. Without dynein arms the doublet microtubules cannot slide, so motile cilia do not beat. Mucus is not cleared; sperm cannot swim; and in the embryo, still cilia cannot set left and right, so in about half of patients organs are mirrored." },
      channel: { grade: "wrong", text: "The sweat test is normal, so CFTR works. The mucus stays because something else should move it." },
      fold: { grade: "wrong", text: "Nothing here points to misfolding: the cilia are built, but one part of the motor is missing." },
    },
    processWhyNot: "That process works normally here. What should move mucus out of the airways, and what does the electron micrograph show?",
    category: ["loss of function"],
    explain: "Loss of function of a motor protein. Compare case 1: the same symptom (mucus not cleared) from a different broken step.",
    therapy: {
      supp: { grade: "right", text: "Fits. There is no drug for the cause. Daily airway clearance, physiotherapy and antibiotics keep the lungs as healthy as possible." },
      gene: { grade: "partly", text: "The right idea for a missing protein, but the DNAH5 gene is very large (about 14 kb of coding sequence, too big for the common AAV vector), and the gene would have to reach every ciliated cell. Research only." },
      pot: { grade: "wrong", text: "There is no channel defect. A potentiator would not make a cilium beat." },
    },
    therapyExplain: "Matching rule: a missing structural or motor protein inside the cell can only be replaced through its gene, which is hard; until then, treat the consequences.",
    lectures: [
      { topic: "the microtubules lecture (axonemal dynein, cilia)", href: "../microtubules/lec.html" },
    ],
  },
  {
    key: "hcm",
    title: "A footballer who faints",
    disease: "Hypertrophic cardiomyopathy (MYH7 R403Q)",
    findings: [
      { level: "Clinic", text: "A 17-year-old footballer faints during a match. A cousin died suddenly at 25." },
      { level: "Tissue", text: "Ultrasound: the wall of the left ventricle is 22 mm thick (normal below 12) and relaxes poorly. In heart tissue the muscle cells are large and lie in disarray, with scar tissue between them." },
      { level: "Cell", text: "Heart-muscle cells made from his stem cells contract more strongly, relax more slowly and use more ATP than normal cells." },
      { level: "Molecule", text: "One copy of the β-cardiac myosin gene (MYH7) is mutated. Fewer myosin heads sit in the 'parked' (super-relaxed) state, so more heads cycle." },
    ],
    process: {
      cyto: { grade: "right", text: "Right. The motor protein myosin is too active: too many heads bind actin and pull. The heart pulls too hard, relaxes poorly and its wall thickens." },
      mito: { grade: "wrong", text: "The cells use more ATP, but because the motor burns more, not because mitochondria fail." },
      channel: { grade: "wrong", text: "Fainting can come from a disturbed heart rhythm, but the molecular finding is in the contractile machine." },
    },
    processWhyNot: "That process works normally here. Which protein is mutated, and what does it do?",
    category: ["gain of function"],
    explain: "Gain of function in a motor protein. One mutated copy is enough (dominant), because the overactive heads are mixed in with the normal ones.",
    therapy: {
      inhib: { grade: "right", text: "Fits. Mavacamten (approved 2022) binds the myosin motor domain, slows its ATPase and parks heads: fewer cross-bridges. The dose is adjusted by ultrasound, because too much weakens the heart." },
      sirna: { grade: "partly", text: "An idea in research: silence only the mutant copy (allele-specific siRNA or ASO), so the normal copy remains." },
      supp: { grade: "partly", text: "β-blockers and, in some patients, an implanted defibrillator treat the consequences; since 2022 a drug acts on the cause." },
      gene: { grade: "wrong", text: "Adding a normal gene does not remove the overactive mutant myosin." },
    },
    therapyExplain: "Matching rule: a protein that is too active is turned down by an inhibitor.",
    lectures: [
      { topic: "the myosin lecture (cross-bridge cycle, mavacamten)", href: "../myosin-if/lec.html" },
    ],
  },
  {
    key: "melas",
    title: "Tired muscles, inherited from the mother",
    disease: "MELAS (mitochondrial DNA mutation m.3243A>G)",
    findings: [
      { level: "Clinic", text: "A 25-year-old woman is short, has hearing loss and weak muscles that tire quickly. She has had two stroke-like episodes. Her mother has diabetes and hearing loss; her father's family is healthy." },
      { level: "Body fluids", text: "Lactate in blood is high, and rises steeply during mild exercise." },
      { level: "Tissue", text: "Muscle biopsy: 'ragged red fibres' with clumps of abnormal mitochondria under the membrane; some fibres have no cytochrome c oxidase activity." },
      { level: "Molecule", text: "A point mutation in a mitochondrial tRNA gene. 80 % of the mtDNA copies in muscle carry it, but only 20 % in blood." },
    ],
    process: {
      mito: { grade: "right", text: "Right. The mitochondrial tRNA is needed to make the 13 respiratory-chain proteins encoded in mtDNA. Without enough of them, oxidative phosphorylation fails and cells switch to glycolysis (lactate). Tissues that need the most ATP (muscle, brain, ear) suffer first." },
      expr: { grade: "partly", text: "Close: translation fails, but only inside mitochondria. Which organelle has its own DNA, inherited from the mother?" },
    },
    processWhyNot: "That process works normally here. Look at the inheritance (only from the mother), the lactate and the muscle biopsy.",
    category: ["loss of function"],
    explain: "Loss of function of the respiratory chain. Each cell has many mtDNA copies; symptoms appear when the fraction of mutant copies (heteroplasmy) in a tissue passes a threshold.",
    therapy: {
      supp: { grade: "right", text: "Fits. No drug corrects the mtDNA. Care treats the diabetes, hearing and seizures (and arginine during stroke-like episodes). Mitochondrial donation during IVF can prevent passing the mutation to children." },
      gene: { grade: "partly", text: "The idea is right, but no method yet delivers DNA into human mitochondria efficiently. Editing mtDNA is research." },
      ert: { grade: "wrong", text: "The missing proteins sit in the inner mitochondrial membrane; an infused protein cannot get there." },
    },
    therapyExplain: "Matching rule: no current therapy type reaches mtDNA; prevention (mitochondrial donation) acts before the embryo is formed.",
    lectures: [
      { topic: "the mitochondria lecture (mtDNA, oxidative phosphorylation)" },
    ],
  },
  {
    key: "sma",
    title: "A floppy baby with bright eyes",
    disease: "Spinal muscular atrophy type 1 (SMN1 deleted)",
    findings: [
      { level: "Clinic", text: "A 3-month-old baby is floppy, hardly moves the legs and breathes with the belly. The baby is alert and follows faces with the eyes." },
      { level: "Tissue", text: "Nerve and muscle tests show that muscles have lost their nerve supply. In the spinal cord, the motor neurons that drive the muscles die." },
      { level: "Molecule", text: "Both copies of the SMN1 gene are deleted. The baby has two copies of the almost identical backup gene SMN2." },
      { level: "Molecule", text: "SMN2 differs by one base in exon 7, which makes the splicing machinery skip exon 7 in about 9 of 10 transcripts. The short protein is unstable. So only about 10 % of the normal SMN protein is made." },
    ],
    process: {
      expr: { grade: "right", text: "Right. SMN protein is too low because SMN1 is gone and SMN2 is mostly mis-spliced. Motor neurons need SMN most and die." },
      fold: { grade: "partly", text: "The short protein is unstable and degraded, but it is short because exon 7 is skipped. Which step comes first?" },
    },
    processWhyNot: "That process works normally here. How much SMN protein is made, and why?",
    category: ["loss of function", "wrong amount"],
    explain: "Loss of function, and a wrong amount: the backup gene makes too little protein. More SMN2 copies mean milder disease.",
    therapy: {
      aso: { grade: "right", text: "Fits. Nusinersen (2016), an antisense oligonucleotide injected into the spinal fluid, covers a splicing silencer in the intron after exon 7, so SMN2 keeps exon 7 and makes full-length protein. A small-molecule splicing modifier (risdiplam, 2020) does the same as a drink." },
      gene: { grade: "right", text: "Fits. Onasemnogene abeparvovec (2019): one infusion of an AAV9 virus carrying a working SMN1 gene, which reaches motor neurons. Best when given before symptoms (newborn screening)." },
      sirna: { grade: "wrong", text: "An siRNA would destroy SMN2 mRNA and remove the little SMN that is left." },
      ert: { grade: "wrong", text: "SMN works inside the nucleus and cytosol of motor neurons; an infused protein cannot get there." },
    },
    therapyExplain: "Matching rule: if a backup gene exists but is mis-spliced, an ASO can correct its splicing; or deliver the missing gene.",
    lectures: [
      { topic: "this lecture (therapy types: ASO and gene therapy)" },
    ],
  },
];

export function judgeProcess(c: Case, p: ProcessKey): Feedback {
  return c.process[p] ?? { grade: "wrong", text: c.processWhyNot };
}

export function judgeTherapy(c: Case, t: TherapyKey): Feedback {
  return c.therapy[t] ?? { grade: "wrong", text: THERAPY_WHY_NOT[t] };
}

export const PROCESS_LABEL: Record<ProcessKey, string> =
  Object.fromEntries(PROCESSES.map(p => [p.key, p.label])) as Record<ProcessKey, string>;
export const THERAPY_LABEL: Record<TherapyKey, string> =
  Object.fromEntries(THERAPIES.map(t => [t.key, t.label])) as Record<TherapyKey, string>;

/** Points for one case: process (3 if right first time, 2 second, 1 later; minus 0 for clues
 *  used, clues only shown) and therapy (2 if a fitting one first time, 1 later). */
export function score(processTries: number, therapyTries: number): number {
  const p = processTries <= 1 ? 3 : processTries === 2 ? 2 : 1;
  const t = therapyTries <= 1 ? 2 : 1;
  return p + t;
}
