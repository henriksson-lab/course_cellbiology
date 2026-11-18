# Content plan: 3MB001 Cell Biology (theory module)

A working draft of the lectures. It is a planning document, not a contract:
lectures will split, merge and move. See [elo.md](elo.md) for the outcomes,
[audience.md](audience.md) for what students already know, and
[designprinciples.md](designprinciples.md) for the rules every lecture follows.

Open questions are marked **[?]**.

## Shape of the course

- **28 lectures of about 45 minutes** (soft target: 15–19 content slides).
- **Order follows *Molecular Biology of the Cell*** (Alberts et al., 7th ed.,
  2022), Parts III–V. We skip Parts I–II (chemistry, proteins, DNA, central
  dogma), which students had in 3BK032, 3MB036 and 3MB035. The one exception is
  protein quality control and degradation, which we pull forward next to protein
  sorting because ELO 4 groups them.
- **Book chapters are optional pointers.** No lecture may need the book. Chapter
  numbers below are for the 7th edition; check them against the edition the
  department lists. A free, older (4th ed., 2002) version is on NCBI Bookshelf,
  where it can be searched but not browsed: <https://www.ncbi.nlm.nih.gov/books/NBK21054/>.
- **Every lecture ends with "Why it matters"**: one or two slides on a drug, a
  drug-delivery technology or a disease that depends on the lecture's content,
  then the summary.
- **Every lecture has a "How do we know?" moment**: one method slide, because
  ELO 1 and ELO 6 ask for methods and the lab module uses them.
- **Each lecture unit** = `lec.qmd` + `quiz.qmd` + `questions.qmd` (study
  questions with one VG-style question). There is no code.

## ELO balance

The exam passes each ELO separately, so no ELO should be thin.

| ELO | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Lectures (main) | 3 | 3 | 4 | 5 | 2 (+4 shared with ELO 4) | 3 | 3 | 2 | 2 + every application slide |

---

## Block A: The cell and how we study it (ELO 1)

### L1. A tour of the cell
*MBoC ch. 1, 12 (overview)* · ELO 1, 5
- Course map: from molecules (what you know) to compartments, machines and
  decisions (this course). How the exam works per ELO.
- Scale: from ion to organelle to cell; numbers worth knowing (cell volume,
  protein copy numbers, diffusion times).
- Recap prokaryote vs eukaryote in one slide; the main compartments and their
  topology (lumen vs cytosol, "inside-out" logic).
- Cell types and model systems: yeast, HeLa and other cell lines, organoids.
- **Pictures:** a real cell-atlas image (e.g. Human Protein Atlas or Allen Cell
  Explorer) with organelles stained; an EM section of a cell; a scale bar ladder.
- **Why it matters:** HeLa cells, from one patient's tumour to polio vaccine and
  thousands of drug screens, and the consent debate that followed.

### L2. Seeing cells: microscopy
*MBoC ch. 9* · ELO 1, 6
- Resolution and contrast; bright field, phase, DIC.
- Fluorescence, fluorescent proteins (GFP and its colours), immunofluorescence.
- Confocal and light-sheet; live-cell imaging; super-resolution in one slide.
- Electron microscopy: TEM, SEM, cryo-EM and tomography.
- **Pictures:** the same cell in several modes; GFP jellyfish → GFP-tagged
  protein; a cryo-EM density map.
- **Why it matters:** cryo-EM structure of the SARS-CoV-2 spike, used to design
  the stabilised spike in COVID-19 vaccines.

### L3. Taking cells apart and perturbing them
*MBoC ch. 8* · ELO 1
- Cell culture: primary cells, cell lines, stem cells and organoids.
- Cell fractionation and centrifugation; antibodies (western blot,
  immunoprecipitation); flow cytometry and cell sorting.
- Perturbation: inhibitors, RNAi, CRISPR knockout; correlation vs causation.
- Single-cell omics in one slide (what a "cell atlas" is).
- **Pictures:** a density gradient tube; a flow cytometry dot plot; a CRISPR cut
  diagram.
- **Why it matters:** high-content drug screening on cultured cells; CAR-T cells
  made, checked and sorted with the same flow cytometers.

## Block B: Membranes and transport (ELO 2)

### L4. Membrane structure
*MBoC ch. 10* · ELO 2
- Bilayer self-assembly (recap the chemistry in one slide), lipid types,
  fluidity, cholesterol, asymmetry, lipid rafts.
- Membrane proteins: integral, peripheral, lipid-anchored; how they are studied
  (detergents, FRAP).
- Glycocalyx.
- **Pictures:** molecular dynamics snapshot of a bilayer; FRAP time series.
- **Why it matters:** lipid nanoparticles (mRNA vaccines, patisiran) and
  liposomal doxorubicin: building drug carriers from the membrane's own rules.

### L5. Moving molecules across membranes: transporters and pumps
*MBoC ch. 11* · ELO 2
- What crosses a bilayer unaided (and why most drugs are designed to).
- Transporters: uniport, symport, antiport; coupling to gradients.
- Pumps: P-type (Na⁺/K⁺-ATPase), V-type, ABC transporters.
- Transcellular transport in epithelia (glucose uptake in the gut).
- **Pictures:** permeability ladder; alternating-access mechanism; epithelial
  cell with apical and basal transporters.
- **Why it matters:** SGLT2 inhibitors (diabetes, heart failure); P-glycoprotein
  pumping chemotherapy out of cancer cells; oral drug absorption.

### L6. Ion channels and membrane potential
*MBoC ch. 11* · ELO 2
- Channels vs transporters; selectivity filter; gating (voltage, ligand,
  mechanical).
- Resting membrane potential; the Nernst equation from ΔG (they know ΔG from
  chemistry).
- Action potential in one slide; patch clamp as the method.
- **Pictures:** K⁺ channel structure; patch-clamp pipette on a cell; voltage trace.
- **Why it matters:** cystic fibrosis and CFTR modulators (ivacaftor,
  elexacaftor/tezacaftor/ivacaftor); local anaesthetics blocking Na⁺ channels.

## Block C: Protein handling and organelles (ELO 4, 5)

### L7. Sorting proteins to the right compartment
*MBoC ch. 12* · ELO 4, 5
- Signal sequences as zip codes; the three ways in: gated (nucleus),
  transmembrane (ER, mitochondria, peroxisomes), vesicular.
- Nuclear pores, importins, Ran; mitochondrial import (TOM/TIM).
- **Pictures:** nuclear pore cryo-ET; GFP with and without an NLS.
- **Why it matters:** selinexor (blocks nuclear export, myeloma); NLS sequences
  in gene therapy and CRISPR delivery.

### L8. The endoplasmic reticulum: making, folding and checking proteins
*MBoC ch. 12* · ELO 4, 5
- Co-translational translocation (SRP, translocon); membrane protein topology.
- Folding, disulfides, N-glycosylation, calnexin cycle; ER quality control and
  ERAD; the unfolded protein response.
- Smooth ER: lipid synthesis, Ca²⁺ store.
- **Pictures:** EM of rough ER; SRP cycle diagram.
- **Why it matters:** therapeutic antibodies are made in CHO cells and their
  glycosylation changes how well they work; α1-antitrypsin deficiency as an
  ER-retention disease.

### L9. The Golgi and the secretory pathway
*MBoC ch. 13* · ELO 4, 5
- Vesicle budding (COPII, COPI, clathrin), Rab GTPases, SNARE fusion.
- Golgi processing, the trans-Golgi network, constitutive vs regulated
  secretion.
- Method: tracking cargo with a temperature-sensitive GFP-tagged protein
  (VSVG); classic yeast *sec* mutants.
- **Pictures:** Golgi stack EM; SNARE zipper; live-imaging frames of cargo
  moving out of the ER.
- **Why it matters:** botulinum toxin cleaves SNAREs (Botox); insulin secretion
  and its failure in type 2 diabetes.

### L10. Endocytosis, lysosomes and autophagy
*MBoC ch. 13* · ELO 4, 5
- Clathrin-mediated endocytosis, receptor-mediated uptake (LDL), endosome
  maturation and pH, recycling vs degradation.
- Lysosomes; macropinocytosis and phagocytosis; autophagy.
- **Pictures:** clathrin-coated pits by EM; LDL receptor cycle.
- **Why it matters:** familial hypercholesterolaemia, statins and PCSK9
  inhibitors; antibody–drug conjugates and lipid nanoparticles enter by
  endocytosis and must escape the endosome; enzyme replacement for lysosomal
  storage diseases.

### L11. Protein life and death: folding, modification and degradation
*MBoC ch. 3, 6 (protein parts)* · ELO 4
- Chaperones and folding in the crowded cytosol; aggregation.
- Regulation by modification: phosphorylation, ubiquitination, acetylation; a
  protein as a switch.
- Ubiquitin–proteasome system; protein half-lives.
- **Pictures:** proteasome structure; amyloid fibrils by EM.
- **Why it matters:** bortezomib (proteasome inhibitor, myeloma); PROTACs and
  molecular glues (thalidomide's mechanism); misfolding in Alzheimer's and
  Parkinson's.

### L12. Mitochondria: energy conversion and more
*MBoC ch. 14* · ELO 5
- Structure, cristae, mtDNA and maternal inheritance; fission and fusion.
- Chemiosmosis: electron transport, proton gradient, ATP synthase (recap
  metabolism in one slide, then focus on the membrane and the machine).
- Mitochondria beyond ATP: Ca²⁺, apoptosis (link to L24), reactive oxygen.
- Chloroplasts in one comparison slide (optional **[?]**).
- **Pictures:** cristae tomogram; ATP synthase rotary motor; mitochondrial
  network in a living cell.
- **Why it matters:** mitochondrial diseases and mitochondrial donation
  ("three-parent" IVF); the uncoupler DNP as a deadly diet pill; metformin.

### L13. Organelles compared: keeping the cell in balance
*MBoC ch. 12, 14* · ELO 5
- Nucleus and nuclear envelope (lamina); peroxisomes; lipid droplets.
- Organelle contact sites; how organelles share lipids, Ca²⁺ and signals.
- Homeostasis as a theme: pH, Ca²⁺, energy, protein load (UPR from L8).
- A comparison table of all organelles (exam-friendly for ELO 5).
- **Pictures:** volume EM reconstruction of a whole cell (e.g. OpenOrganelle); a
  contact-site diagram.
- **Why it matters:** progeria (a broken lamin A) and lonafarnib, the first
  approved progeria drug; Zellweger syndrome (no peroxisomes).

## Block D: Cell signalling (ELO 3)

### L14. Principles of cell communication
*MBoC ch. 15* · ELO 3
- Signal types: endocrine, paracrine, autocrine, contact-dependent.
- Receptor classes: cell surface (ion channel, GPCR, enzyme-coupled) and
  intracellular (nuclear receptors).
- Binding, K_d and dose–response (recap equilibria from chemistry); amplification,
  integration, feedback, adaptation; molecular switches (GTPases, kinases).
- **Pictures:** the four signal types; a dose–response curve; switch diagram.
- **Why it matters:** about a third of approved drugs act on GPCRs; agonist,
  antagonist, EC₅₀ and IC₅₀ as the drug developer's vocabulary (previews 3FA034).

### L15. G-protein-coupled receptors and second messengers
*MBoC ch. 15* · ELO 3
- GPCR → trimeric G protein → cAMP/PKA, IP₃/Ca²⁺, DAG/PKC.
- Switching off: GTP hydrolysis, phosphodiesterases, arrestin, desensitisation.
- Method: FRET or calcium imaging of a live signal.
- **Pictures:** GPCR–G protein structure; Ca²⁺ wave imaging.
- **Why it matters:** beta-blockers, opioids, GLP-1 agonists (semaglutide);
  cholera toxin locks Gs on.

### L16. Enzyme-coupled receptors: kinase cascades
*MBoC ch. 15* · ELO 3
- Receptor tyrosine kinases, Ras–MAPK, PI3K–Akt–mTOR, JAK–STAT.
- Cross-talk and signalling networks.
- **Pictures:** RTK dimerisation; MAPK cascade as an amplifier.
- **Why it matters:** imatinib (BCR-ABL), the first targeted cancer drug;
  trastuzumab (HER2); EGFR inhibitors and how resistance appears.

### L17. Signalling that shapes tissues and decides fates
*MBoC ch. 15 (and 21–22 in passing)* · ELO 3
- Wnt, Hedgehog, Notch, TGF-β/SMAD, NF-κB; nuclear receptors (steroids).
- How a signal becomes a gene-expression programme (link to known gene
  regulation).
- **Pictures:** Notch lateral inhibition pattern; Wnt on/off.
- **Why it matters:** tamoxifen (oestrogen receptor) in breast cancer; vismodegib
  (Hedgehog) in basal cell carcinoma; corticosteroids.

## Block E: Cytoskeleton (ELO 6)

### L18. Actin: cell shape and migration
*MBoC ch. 16* · ELO 6
- Polymerisation, treadmilling, nucleators (Arp2/3, formins), actin-binding
  proteins.
- Lamellipodia, filopodia, stress fibres; Rho GTPases.
- Methods: phalloidin staining, live imaging of a migrating cell.
- **Pictures:** keratocyte or fibroblast migrating (real time-lapse frames);
  Arp2/3 branching.
- **Why it matters:** cancer metastasis as cell migration; *Listeria* hijacking
  actin to move between cells.

### L19. Microtubules and motor proteins
*MBoC ch. 16* · ELO 6
- Dynamic instability, centrosome, polarity.
- Kinesin and dynein; transport along axons; cilia and flagella.
- Methods: single-molecule motor assays, optical tweezers.
- **Pictures:** EB1 comets in a live cell; kinesin "walking"; cilium
  cross-section by EM.
- **Why it matters:** taxanes and vinca alkaloids in chemotherapy; ciliopathies
  (e.g. primary ciliary dyskinesia, polycystic kidney disease).

### L20. Myosin, intermediate filaments and the mechanical cell
*MBoC ch. 16* · ELO 6
- Myosin II and muscle contraction (sarcomere); non-muscle myosin.
- Intermediate filaments (keratins, lamins, neurofilaments) and mechanical
  strength.
- Methods round-up: FRAP, TIRF, traction-force microscopy.
- **Pictures:** sarcomere EM; keratin network; traction-force map.
- **Why it matters:** mavacamten (cardiac myosin inhibitor) for hypertrophic
  cardiomyopathy; epidermolysis bullosa simplex (broken keratin).

## Block F: Cell cycle and division (ELO 7)

### L21. The cell-cycle control system
*MBoC ch. 17* · ELO 7
- Phases; cyclins and CDKs; CDK inhibitors; APC/C.
- G1/S: Rb and E2F; DNA-damage checkpoint and p53.
- Methods: yeast *cdc* mutants; DNA-content flow cytometry (links L3).
- **Pictures:** cyclin oscillation plot; FUCCI live cells.
- **Why it matters:** CDK4/6 inhibitors (palbociclib) in breast cancer.

### L22. Mitosis and cytokinesis
*MBoC ch. 17* · ELO 7, 6
- Chromosome condensation, cohesin and condensin; spindle assembly; kinetochores.
- Spindle assembly checkpoint; separase; anaphase.
- Cytokinesis: contractile ring.
- Meiosis in one comparison slide (they know it from genetics).
- **Pictures:** real fluorescence images of each mitotic phase; kinetochore
  attachment diagram.
- **Why it matters:** antimitotic drugs and why they hit hair and gut too;
  aneuploidy (Down syndrome, cancer).

### L23. Controlling cell numbers: growth, proliferation and senescence
*MBoC ch. 17, 22* · ELO 7, 9
- Mitogens, growth factors and survival factors; cell growth vs division.
- Contact inhibition; senescence and telomeres; stem cells and tissue renewal
  (light: 3AN006 covers tissues).
- **Pictures:** contact inhibition in culture; telomere FISH.
- **Why it matters:** senolytics; telomerase in cancer; why growth-factor
  receptors are cancer drug targets (links L16).

## Block G: Cell death (ELO 8)

### L24. Apoptosis
*MBoC ch. 18* · ELO 8
- Why cells kill themselves (development, damage, immunity).
- Caspases; intrinsic pathway (BCL-2 family, MOMP, cytochrome c, apoptosome);
  extrinsic pathway (death receptors); clearance ("eat me" signals).
- Methods: annexin V and PI by flow cytometry, TUNEL, caspase assays.
- **Pictures:** apoptotic cell blebbing (time-lapse); annexin V/PI dot plot;
  BCL-2 balance diagram.
- **Why it matters:** venetoclax (BCL-2 inhibitor) in leukaemia.

### L25. Beyond apoptosis: necroptosis, pyroptosis, ferroptosis
*MBoC ch. 18 (and recent reviews)* · ELO 8
- Regulated necrosis: RIPK1/RIPK3/MLKL; inflammasomes and gasdermin pores;
  lipid peroxidation and GPX4; autophagy and cell death.
- Death as signal: inflammation, why the mode of death matters to the body.
- A comparison table of death types (exam-friendly for ELO 8).
- **Pictures:** gasdermin pore structure; morphology panel apoptosis vs necrosis.
- **Why it matters:** ferroptosis inducers against therapy-resistant cancer;
  cell death in stroke and heart attack; RIPK1 inhibitors in trials.

## Block H: Disease mechanisms (ELO 9)

### L26. Cancer as a disease of cell biology
*MBoC ch. 20* · ELO 9
- Hallmarks of cancer mapped onto this course's lectures (signalling, cell cycle,
  death, migration, metabolism).
- Oncogenes and tumour suppressors; clonal evolution; invasion and metastasis
  (EMT, ECM in brief).
- **Pictures:** hallmarks wheel redrawn with lecture numbers; tumour histology.
- **Why it matters:** targeted therapy and resistance; checkpoint immunotherapy
  (previews 5MO096).

### L27. When cell biology goes wrong: a disease casebook
*MBoC across Parts IV–V* · ELO 9
- A framework: loss of function, gain of function, toxic aggregates, wrong place,
  wrong time.
- Cases, one per category: neurodegeneration (misfolding), lysosomal storage
  (trafficking), channelopathy (CF, from L6), mitochondrial disease, ciliopathy,
  infection hijacking the cell (previews 3MB039).
- **Pictures:** one real image per case (histology, patient MRI, EM).
- **Why it matters:** the therapy types matched to the categories: small
  molecule, enzyme replacement, antisense oligonucleotide (nusinersen), gene
  therapy.

### L28. Capstone: the journey of a drug through the cell
· ELO 1–9 (revision)
- Follow one mRNA–lipid nanoparticle from injection to immune response: membrane
  (L4), endocytosis and endosomal escape (L10), translation on the ER (L8),
  Golgi and secretion or display (L9), signalling in the immune cell (L14–16),
  cell death of the transfected cell (L24–25).
- Then follow one small-molecule kinase inhibitor the same way.
- Exam format walk-through: one G and one VG question per ELO.
- **Pictures:** one "journey" figure, built up over the lecture.

## Candidate material (not scheduled)

- **Cell junctions and extracellular matrix** (MBoC ch. 19). In the old 3MB038
  outcomes, not in the new ones. Covered in brief inside L26 (metastasis) and
  as a drug-delivery barrier (blood–brain barrier, tight junctions). Could be a
  full lecture if the timetable has a slot **[?]**.
- **Stem cells and regeneration** (MBoC ch. 22): partly in L23; tissues are in
  3AN006.
- **Chloroplasts** (MBoC ch. 14): one slide in L12 at most.
- **Development** (MBoC ch. 21): only through signalling in L17.

## Possible link to the lab module **[?]**

When the lab content is known, place the method lecture before the lab that uses
it, e.g. L2 (microscopy) and L3 (culture, fractionation, flow) before the first
lab, L24 (apoptosis assays) before a cell-death lab.
