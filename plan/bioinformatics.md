# Plan: one bioinformatics day per block

**Status:** planning document (2026-11-18). Nothing built yet.

**Decision from the course author.** 3MB001 becomes an experimental implementation
that also teaches **bioinformatics linked to the lectures**. Each of the 8 blocks in
[schedule.md](schedule.md) ends with one **bioinformatics day**: not a lecture, but a
page of **step-by-step instructions** (browse a database, or run R) with tasks and
checked answers, built on the proteins, drugs and diseases of that block.

**Students** know the command line and R, and have **never used a bioinformatics
database or tool**. Aims, in priority order:

1. **Find relevant information in databases** (which database answers which
   question; identifiers; evidence; how to cite).
2. **Basic plotting of data**, increasingly **fetched with R from a public API**.
3. Throughout: **reproducible reports in R Markdown** instead of Excel.

Out of scope here as everywhere in this repo: exam, revision, labs, module-2 seminars.

---

## 1. Conventions

### Where the pages live

- **One folder per day, non-week slug**, `bioinfo-<topic>/`, containing:
  - `index.qmd`: the instruction page (no slides, no quiz).
  - `bioinfo-<topic>.Rmd`: the **student template** (download link on the page).
  - `bioinfo-<topic>-solution.Rmd`: the knitted-and-checked solution. Keep it in the
    repo; publish it only after the day (or never).
  - `data/<name>-YYYY-MM-DD.csv`: a **snapshot** of every API result the template
    fetches, used as a fallback when a service is down (see robustness).
  - `_credits.md` if the page reuses any image or data (central credits page).
- `.Rmd` files are **not rendered by Quarto** (the render globs only match
  `*.qmd`/`*.md`; keep it that way, or the site build would call the APIs). Add
  `"bioinfo-*/*.Rmd"` and `"bioinfo-*/data/*.csv"` to `project: resources:` in
  `_quarto.yml` so they are copied to `docs/` and downloadable.
- **Sidebar:** the **last item of each block section**, at the same level as the
  lecture sub-sections, as a single leaf link:
  `- text: "Bioinformatics day: <title>"` / `href: bioinfo-<topic>/index.qmd`.
  `styles.css` colours leaves by filename (`*lec*` green, `*quiz*` blue); give
  `bioinfo-` links their own colour (one CSS rule) so the day is visible as a third
  kind of material.
- Page skeleton (fixed, so students learn the rhythm):
  1. **Today** (2–3 lines: what you will find, which lectures it builds on, ELO tags).
  2. **Before you start** (download the `.Rmd`; check `rmarkdown`, `ggplot2`,
     `jsonlite`, later `httr2`, are installed; no logins needed).
  3. **Part A: in the browser** (numbered steps, each with a direct URL).
  4. **Part B: in R Markdown** (what to fill in which chunk).
  5. **Tasks** `T1…T6`, each tagged with ELO and skill, each followed by
     `::: {.callout-note collapse="true" title="Answer (checked 2026-11-18)"}`,
     the same pattern as `questions.qmd`.
  6. **Hand-in** (optional): the knitted HTML.
  7. **Sources and licences** of the data used.

### R Markdown (all R work)

- Every R part is a **provided `.Rmd` template**: YAML header (`title`, `author`,
  `date: "`r Sys.Date()`"`, `output: html_document`), a **setup chunk** loading the
  packages and setting `options(HTTPUserAgent = "3MB001-course")`, then headings,
  1–3 lines of instruction each, and **empty chunks** for the student to fill. The
  student knits it to HTML; the HTML can be handed in.
- **Every report records its data:** a "Data" section names each source, the URL
  or API call, the **date retrieved** (inline `` `r Sys.Date()` ``) and the release
  where the API reports one (e.g. UniProt's `X-UniProt-Release` header, Open
  Targets `meta { dataVersion }`). The last chunk is `sessionInfo()`.
- The scaffold **shrinks over the course** (see the progression table): day 1 fills
  three chunks in a nearly complete report; day 8 writes a report from a blank
  outline (question → data → code → plot → interpretation → sources).
- **R style:** base R + `jsonlite::fromJSON()` for GET requests that return JSON,
  `read.delim(url)` for TSV, `ggplot2` for every plot, `dplyr` allowed from day 3.
  `httr2` from day 5 (POST, headers, retries). One idea per chunk; named chunks;
  `snake_case`; no `setwd()`; no hard-coded paths. Plots get axis labels with units
  and a caption naming the source. **No Bioconductor needed** (see section 4 for
  why `biomaRt` is not used); `rentrez` (CRAN) is the only wrapper package.
- **Caching and politeness:** each fetch chunk writes its result to
  `data/` with the date in the file name and reads that file if it exists, so
  re-knitting does not hammer the API. Keep loops ≤ ~20 calls; add
  `Sys.sleep(0.4)` for NCBI (max 3 requests/s without an API key).

### Keeping tasks robust when databases update

- Write **"checked YYYY-MM-DD"** on every answer and re-check all answers before
  each course run (≈ 1 h per day page; a small script can re-run the solution
  `.Rmd`s and diff the numbers).
- **Ask for stable things:** an accession number, a domain, a location, which tissue
  is highest, the sign of an effect, the order of magnitude, a named variant
  (F508del, V600E), a PDB ID's ligand. Do **not** ask for exact counts that grow
  (ClinVar records, PubMed hits, trials) without saying "about" and accepting a
  range, or turning them into "which is larger".
- Link with **stable identifiers** (UniProt accession, PDB ID, Ensembl gene ID
  without version, NCT number), never search-result URLs.
- **No screenshots of external sites** as instructions (they date fast); describe
  what to click by its label. Our own plots are fine.
- Each template has `use_snapshot <- FALSE` in the setup chunk; set `TRUE` to read
  the shipped CSV snapshot if an API is down on the day.

---

## 2. The eight days

Time budget for each: **Part A ≈ 1.5 h, Part B ≈ 1.5–2 h**, plus slack. Build
effort assumes the block's lectures exist and includes writing the page, template,
solution, snapshot and checking answers.

### Day 1 — The cell and how we study it: "Where does a protein live?"
`bioinfo-protein-atlas/` · lectures cell-tour, microscopy, cell-methods · ELO 1, 5

**Goals.** *Skills:* gene symbol vs UniProt accession vs Ensembl ID; read a UniProt
entry (function, subcellular location, evidence codes, Swiss-Prot vs TrEMBL); use the
HPA subcellular atlas (real immunofluorescence images) and single-cell section;
look up a cell line in Cellosaurus. First R Markdown report. *Cell biology:*
organelle marker proteins; microscopy as evidence; scale and numbers; HeLa and
"is the culture what you think it is?".

**Resources.** UniProt, Human Protein Atlas (subcellular, single-cell type),
Cellosaurus; R: base `read.delim()` on the UniProt REST TSV, `ggplot2`.

**Steps.**
A1. UniProt: search `CANX human`, open the reviewed entry, find accession, length,
"Subcellular location", one evidence code. A2. HPA: the same gene, Subcellular tab;
compare the IF image with the lecture's cartoon; note the HPA reliability score.
A3. Repeat for TOMM20, LAMP1, GOLGA2, LMNB1 (fill a table on paper/in the Rmd).
A4. HPA single-cell: which cell type expresses INS? A5. Cellosaurus `CVCL_0030`
(HeLa): species, disease, virus, the contamination comment.
B1. Open the template, knit it untouched (learn: YAML, chunks, inline R, knit).
B2. Fill the chunk that reads one UniProt TSV URL for ~12 proteins (markers plus
actin, tubulin, ubiquitin, CFTR, titin) with columns accession, gene, length, mass.
B3. Plot **protein mass on a log scale** (dot plot, coloured by compartment), and
write 2 sentences with an inline R value.

**Tasks.**
- T1 UniProt accession of human calnexin and its location → P27824, ER membrane
  (single-pass).
- T2 Which organelle does each of TOMM20, LAMP1, GOLGA2, LMNB1 mark in HPA? →
  mitochondria (outer membrane), lysosomes/vesicles, Golgi, nuclear membrane/lamina.
- T3 What does HPA single-cell show for INS? → pancreatic endocrine cells only.
- T4 HeLa in Cellosaurus: species, disease, virus → human, cervical
  adenocarcinoma, HPV18; it is a frequent contaminant of other lines.
- T5 (R) Largest and smallest protein in your table, and the ratio (inline R) →
  titin 34 350 aa, 3.8 MDa (checked); actin 375 aa, 41.7 kDa; ratio ~90×; why a
  log axis is needed.

**Plot.** Log-scale dot plot of protein mass by compartment.
**Pitfalls.** Gene vs protein names (GOLGA2 = GM130); unreviewed TrEMBL entries
crowd searches (filter "Reviewed"); HPA location is antibody-based (check the
reliability score); R: knitting runs in a fresh session, so objects from the console
do not exist.
**Effort.** 1.5 days (includes the Rmd primer section reused by all later days).

### Day 2 — Membranes and transport: "Membrane proteins, their tissues and their drugs"
`bioinfo-membrane-proteins/` · membrane-structure, membrane-transport, ion-channels · ELO 2, 9

**Goals.** *Skills:* UniProt features (transmembrane segments, topology); 3D
structures in RCSB PDB with the Mol* viewer; AlphaFold DB and pLDDT confidence; GTEx
tissue expression; ClinVar variants; PubChem compound properties. R: JSON from an
API with `fromJSON(url)`. *Cell biology:* TM helices (hydropathy slide), SGLT1 in gut
vs SGLT2 in kidney, CFTR and ivacaftor, lipophilic drugs crossing membranes.

**Resources.** UniProt, RCSB PDB + Mol*, AlphaFold DB, GTEx portal + API v2,
ClinVar (NCBI), PubChem.

**Steps.** A1. UniProt CFTR (P13569): Features → count transmembrane segments.
A2. RCSB `6O2P` (CFTR with ivacaftor, cryo-EM) in Mol*: find the drug, which part of
the protein holds it (within the membrane). A3. AlphaFold `P13569`: which region is
low-confidence (orange)? relate to the disordered R domain. A4. ClinVar: search
CFTR, find F508del (p.Phe508del), its clinical significance. A5. PubChem ivacaftor:
MW and XLogP. B1. Template fetches GTEx median TPM for SLC5A1 and SLC5A2 (gencode ID
looked up first via `/reference/gene`); students write the plot chunk. B2. Students
write their first own chunk: one UniProt TSV call for ATP1A1, SLC2A1, SLC5A1, SLC5A2,
ABCB1, CFTR, AQP1, KCNA1 → bar plot of TM-segment counts. Rmd: chunk options
(`echo`, `message`, `fig.cap`), a Data section with date.

**Tasks.**
- T1 TM segments: CFTR 12, ABCB1 12, SLC5A2 14 (UniProt annotation, checked).
- T2 Where does ivacaftor sit in 6O2P? → in the membrane-spanning part, at the
  protein–lipid interface (not in the cytosolic NBDs).
- T3 Top GTEx tissue: SLC5A2 → kidney cortex (~36 TPM; all else < 20 except
  testis); SLC5A1 → small intestine (~98 TPM; heart ~45 is a surprise worth a
  sentence). Checked GTEx v8. Link: why gliflozins act on the kidney.
- T4 F508del in ClinVar → pathogenic, cystic fibrosis; why ivacaftor alone is not
  enough (folding/trafficking defect → corrector needed).
- T5 Ivacaftor XLogP 5.6, MW 392.5 → small and lipophilic: crosses membranes, binds
  inside the bilayer region.

**Plots.** Paired bar/dot plot of SGLT1 vs SGLT2 TPM by tissue; TM count per protein.
**Pitfalls.** GTEx needs a *versioned* GENCODE ID that differs by release (v8:
`ENSG00000140675.12`, v10: `.13`); the PDB has many CFTR entries (60 for P13569);
pLDDT is confidence, not flexibility measured; ClinVar has several records per
variant.
**Effort.** 1.5 days.

### Day 3 — Protein handling (1): "Read the zip code"
`bioinfo-sorting-signals/` · protein-sorting, er, golgi-secretion, endocytosis-lysosomes · ELO 4, 5, 9

**Goals.** *Skills:* sequence features (signal peptide, transit peptide, TM,
glycosylation, motifs) in UniProt; FASTA; Gene Ontology cellular-component terms
(QuickGO, evidence codes); pathways in Reactome; interaction networks in STRING.
R: query many proteins, extract sequence ends with `substr()`, `dplyr`, `kable`.
*Cell biology:* signal sequences decide route; KDEL retention; LDLR cycle, PCSK9,
familial hypercholesterolaemia.

**Resources.** UniProt (REST TSV + FASTA), QuickGO, Reactome, STRING, ClinVar, HPA.

**Steps.** A1. UniProt LDLR (P01130): signal peptide, topology, disease section.
A2. PCSK9 (Q8NBP7): signal peptide; where does it end up (secreted)? A3. STRING
LDLR: list 5 partners (APOB, PCSK9, …); what do the edge colours mean? A4. Reactome:
which pathways contain LDLR (e.g. "Cargo recognition for clathrin-mediated
endocytosis", LDL clearance). A5. QuickGO for CFTR (P13569), cellular component:
pick one IDA and one IBA annotation, explain the difference. B1. Template gives a
list of ~15 proteins with known destinations (ALB, INS, HSPA5, CANX, PDI(P4HB),
LAMP1, GBA1, LDLR, TFRC, PCSK9, ATP5F1A, CS, NUP62, PEX5, GAPDH); students fetch
`ft_signal, ft_transit, ft_transmem, cc_subcellular_location` and the FASTA, compute
the last 4 residues. B2. Tile plot protein × feature; students write interpretation.

**Tasks.**
- T1 LDLR: signal peptide 1–21, one TM segment (checked); disease: familial
  hypercholesterolaemia.
- T2 PCSK9: signal peptide 1–30, no TM → secreted; acts on LDLR from outside, which
  is why an antibody drug can reach it.
- T3 HSPA5 (BiP) ends in **KDEL** (checked); it has a signal peptide 1–18 — explain
  how a protein with a signal peptide stays in the ER.
- T4 Which proteins in your table have a signal peptide but no TM? → secreted or
  ER/lysosome lumen proteins; which have a transit peptide? → mitochondrial ones.
- T5 STRING LDLR partners include APOB and PCSK9 (and LDL-related genes);
  answer accepts any 3 of the top 10.

**Plot.** Feature × protein tile plot, faceted by destination: the "zip codes"
slide made from real data.
**Pitfalls.** UniProt "Signal" is often predicted (check evidence); GO annotations
mix experiment and inference; STRING score ≠ physical binding; HPA "Vesicles" for
LDLR is coarse.
**Effort.** 1.5 days (er lecture not built yet: adapt T3/T4 once it exists).

### Day 4 — Protein handling (2): "Genomes inside organelles, and drugs on machines"
`bioinfo-mito-proteasome/` · protein-lifecycle, mitochondria, organelles-homeostasis · ELO 4, 5, 9

**Goals.** *Skills:* NCBI nucleotide records and feature tables with `rentrez`;
counting proteins by annotation in UniProt queries; drug–target lookup in ChEMBL;
PDB complexes with a drug. Rmd: caching, `sessionInfo()`, writing a results
paragraph. *Cell biology:* mtDNA encodes 13 proteins, ~1 000+ are imported (TOM/TIM);
bortezomib in the proteasome; LMNA and progeria.

**Resources.** NCBI Nucleotide/E-utilities (`rentrez`), UniProt, RCSB PDB + Mol*,
ChEMBL, ClinVar.

**Steps.** A1. NCBI Nucleotide `NC_012920`: length, how many genes of each kind.
A2. UniProt: count reviewed human proteins with subcellular location Mitochondrion
(query `cc_scl_term:SL-0173`). A3. RCSB `5LF3` (20S proteasome with bortezomib):
which β-subunit holds the drug? A4. ChEMBL bortezomib: max phase, target.
A5. ClinVar LMNA: find the progeria variant (c.1824C>T, p.Gly608Gly) and why a
"silent" change causes disease (cryptic splice site → progerin).
B1. `rentrez::entrez_fetch(db="nuccore", id="NC_012920", rettype="ft")`, parse with
a provided helper into a gene table (start, end, type, complex). B2. Plot the
genome as segments coloured by OXPHOS complex.

**Tasks.**
- T1 NC_012920: 16 569 bp (checked); 13 protein-coding, 22 tRNA, 2 rRNA genes.
- T2 UniProt mitochondrial proteins: ~1 400 reviewed human entries (1 374 on
  2026-11-18; accept 1 000–2 000) vs 13 encoded in mtDNA → ~99 % imported.
- T3 Which OXPHOS complex has no mtDNA-encoded subunit? → complex II.
- T4 Bortezomib sits in the β5 (chymotrypsin-like) site (PSMB5).
- T5 LMNA G608G: pathogenic, Hutchinson–Gilford progeria.

**Plot.** Linear mtDNA map coloured by complex (or a bar of gene counts per complex).
**Pitfalls.** Feature-table parsing (helper provided); "mitochondrion" annotations
include predictions; ChEMBL lists salt forms as separate molecules.
**Effort.** 2 days (parser and helper need care).

### Day 5 — Cell signalling: "How selective is a kinase inhibitor?"
`bioinfo-drug-targets/` · signalling-principles, gpcr, kinase-signalling, fate-signalling · ELO 3, 9

**Goals.** *Skills:* bioactivity data in ChEMBL (IC50, pChEMBL, assay types); target
evidence and drugs in Open Targets; pathway maps (Reactome; KEGG to view only);
structures of receptors with drugs. R: `httr2` for a GraphQL POST, writing a small
function, joining tables. *Cell biology:* dose–response, IC50 and selectivity;
imatinib and BCR-ABL; EGFR inhibitors; GPCR–G protein complex.

**Resources.** ChEMBL web + API, Open Targets Platform + GraphQL API, Reactome,
KEGG (browse), STRING, RCSB PDB.

**Steps.** A1. RCSB `3SN6` (β2-adrenergic receptor–Gs) in Mol*: find the 7 helices,
Gα. A2. RCSB `1IEP` (ABL kinase with imatinib/STI-571): where in the kinase does it
bind (ATP pocket)? A3. Reactome or KEGG: trace EGF → EGFR → RAS → RAF → MEK → ERK.
A4. Open Targets EGFR: top associated disease, number of drugs/candidates, one
approved small molecule and one antibody. B1. Template provides `get_chembl()`;
students fetch imatinib (`CHEMBL941`) activities against ABL1 (`CHEMBL1862`), KIT,
PDGFRA, SRC, EGFR. B2. Strip plot of pChEMBL per target; then draw Hill curves from
the median IC50s (`ggplot` + `geom_function`). B3. `httr2` POST to Open Targets for
3 targets → bar chart of clinical stage counts.

**Tasks.**
- T1 3SN6: receptor + Gαs, Gβ, Gγ (+ nanobody); helices span the membrane.
- T2 Imatinib binds in the ATP site of the kinase domain (1IEP).
- T3 Open Targets EGFR: top disease non-small cell lung carcinoma (checked); 82
  drugs/candidates on 2026-11-18 (accept "~80", grows).
- T4 Which targets does imatinib hit at < 1 µM? → ABL1, KIT, PDGFRA (not EGFR):
  explains its use in CML *and* GIST.
- T5 From your curves: fraction of ABL1 vs EGFR inhibited at 1 µM.

**Plots.** pChEMBL strip plot by target; dose–response curves (links the
signalling-principles dose–response slide).
**Pitfalls.** IC50s from different assays vary 10–100× (use medians, show the spread);
ChEMBL API is sometimes slow or returns 500 (retry, cache); Open Targets **renamed**
`knownDrugs` → `drugAndClinicalCandidates` (API 26.9) — pin and test queries each
year; KEGG images may not be reused on our pages.
**Effort.** 2 days.

### Day 6 — Cytoskeleton: "One filament family per tissue, and a drug for the heart"
`bioinfo-cytoskeleton/` · actin, microtubules, myosin-if · ELO 6, 9

**Goals.** *Skills:* gene families and isoforms; tissue expression across many genes
(GTEx API, heatmap); clinical-trial registry (ClinicalTrials.gov API v2); variant
lookup. Rmd: `params:` in the YAML (gene list) so one report runs for any gene set.
*Cell biology:* keratins in epithelia, vimentin, desmin, neurofilaments, GFAP;
cardiac vs skeletal myosin heavy chains; mavacamten; taxol on tubulin; EBS.

**Resources.** GTEx API, UniProt, ClinicalTrials.gov (web + API v2), ClinVar, RCSB
PDB, PubChem.

**Steps.** A1. RCSB `1JFF` (tubulin with taxol): which subunit binds taxol (β)?
A2. RCSB `5N69` (cardiac myosin with omecamtiv mecarbil, an activator); search RCSB
for mavacamten and compare (inhibitor). A3. ClinicalTrials.gov: mavacamten — which
disease, phases. A4. ClinVar: KRT14 and MYH7 — one pathogenic variant each, which
disease. B1. Template fetches GTEx medians for a `params$genes` list (KRT5, KRT14,
KRT8, KRT18, VIM, DES, GFAP, NEFL, LMNA, MYH6, MYH7, MYH2, MYH9) in 8 tissues;
students build the heatmap. B2. Students write the ClinicalTrials.gov call
(`/api/v2/studies?query.intr=mavacamten`) and plot studies by phase.

**Tasks.**
- T1 Taxol binds β-tubulin (1JFF).
- T2 Heatmap reading: KRT5/14 → skin and oesophagus mucosa; DES → muscle;
  GFAP → brain; NEFL → brain/nerve; VIM, LMNA → broad; MYH7 → heart ventricle and
  skeletal muscle; MYH9 → broad (non-muscle).
- T3 Mavacamten: ~50 registered studies (49 on 2026-11-18), hypertrophic
  cardiomyopathy; approved in 2022 (ask which phases exist rather than counts).
- T4 KRT14 variants → epidermolysis bullosa simplex; MYH7 → hypertrophic
  cardiomyopathy.
- T5 Re-knit with your own `params` (e.g. tubulin isotypes TUBB, TUBB3, TUBB4A):
  one sentence on what changed.

**Plots.** log10(TPM+1) heatmap genes × tissues; trials by phase.
**Pitfalls.** GTEx tissue names are IDs (`Heart_Left_Ventricle`); TPM of very
abundant genes dwarfs others (log scale); ClinicalTrials.gov `nextPageToken`
paging; trial phases are lists ("PHASE2","PHASE3").
**Effort.** 1.5 days.

### Day 7 — Cell cycle and cell death: "Which genes does a cancer cell need?"
`bioinfo-essential-genes/` · cell-cycle-control, mitosis, cell-numbers, apoptosis · ELO 7, 8, 9

**Goals.** *Skills:* CRISPR dependency data (DepMap: gene effect, what −1 means);
cell-cycle-dependent proteins in HPA; Reactome cell-cycle pathways; approved drugs.
R: nested JSON → long table, distributions with `geom_density`/`geom_violin`,
grouping by tissue. Rmd: template has headings only, students write all chunks.
*Cell biology:* CDK1 is essential everywhere; CDK4/6 only in some lineages
(palbociclib in breast cancer); BCL2 vs MCL1 dependence (venetoclax in leukaemia);
p53.

**Resources.** DepMap portal (browser), Open Targets GraphQL `depMapEssentiality`
(R), HPA (cell-cycle section), Reactome, UniProt TP53, ClinicalTrials.gov, ChEMBL.

**Steps.** A1. DepMap portal, gene CDK1 then CDK4: read the gene-effect histogram;
what does "common essential" mean? A2. HPA: CCNB1 subcellular — cell-cycle-dependent
expression. A3. Reactome: "Cell Cycle Checkpoints", find where p53 acts. A4. UniProt
TP53: domains; one PTM. B1. Students POST the Open Targets query for CDK1, CDK4,
CDK6, BCL2, MCL1, BCL2L1 (Ensembl IDs given), flatten screens. B2. Violin plot of
gene effect per gene; then BCL2 by tissue.

**Tasks.**
- T1 CDK1: essential in nearly all lines (`isEssential: true`; 1 258 screens,
  mostly < −1; checked); CDK4: essential only in a subset.
- T2 Where is BCL2 dependency strongest? → haematopoietic/lymphoid lines (accept
  "blood cancers"); links venetoclax.
- T3 CCNB1 peaks in G2/M and is degraded at anaphase (APC/C).
- T4 Why is a common-essential gene a poor drug target? (toxicity in normal cells,
  antimitotic side effects from the mitosis lecture).

**Plot.** Violin/strip of DepMap gene effect per gene; facet by tissue for 2 genes.
**Pitfalls.** DepMap portal blocks scripted downloads (verification page), so R goes
through Open Targets, which redistributes DepMap gene effects; cell lines ≠
tumours; gene effect is relative (0 = no effect, −1 = typical essential gene).
**Effort.** 1.5 days (lectures not built: adjust names when they exist).

### Day 8 — Cell death and disease: "Oncogene or tumour suppressor? Read the mutations" + own report
`bioinfo-cancer-genomics/` · regulated-necrosis, cancer, disease-casebook, drug-journey · ELO 8, 9

**Goals.** *Skills:* cancer genomics in cBioPortal (OncoPrint, lollipop plot,
study vs sample); the cBioPortal REST API; combining 3+ databases in one argument.
Rmd: **a report from a blank outline** (question, data with dates, code, plot,
interpretation, sources), handed in. *Cell biology:* gain-of-function hotspots
(BRAF V600E, vemurafenib) vs scattered loss-of-function (TP53); necroptosis/
pyroptosis/ferroptosis genes (MLKL, GSDMD, GPX4) in UniProt/HPA; disease casebook.

**Resources.** cBioPortal (web + API), Open Targets (disease → targets), UniProt,
HPA, ClinVar, ClinicalTrials.gov, plus any earlier resource.

**Steps.** A1. cBioPortal, study "Skin Cutaneous Melanoma (TCGA, PanCancer
Atlas)": BRAF and TP53 lollipop plots. A2. Same for a CML/AML study: is BCR-ABL a
mutation? (fusion; see structural variants). A3. UniProt MLKL, GSDMD, GPX4: one
sentence each on what the protein does in its death type (selenocysteine in GPX4).
B1. Guided: fetch BRAF and TP53 mutations via the API, plot counts per protein
position. B2. **Capstone report:** pick one protein–drug or protein–disease pair
from the course (CFTR/ivacaftor, SGLT2/gliflozins, LDLR/PCSK9, BCR-ABL/imatinib,
EGFR, tubulin/taxol, cardiac myosin/mavacamten, BCL2/venetoclax…) and write a
1–2-page report using ≥ 3 databases and ≥ 1 API-fetched plot. A checklist (not a
template) is given.

**Tasks.**
- T1 SKCM (448 samples): 245 BRAF mutation records, 158 V600E (checked); TP53: 82
  records, 55 different changes, no dominant hotspot → oncogene vs tumour
  suppressor pattern.
- T2 Why does the pattern differ? (one specific activating change vs any change that
  breaks the protein.)
- T3 BCR-ABL is a fusion (translocation), not a point mutation; where cBioPortal
  shows it.
- T4 GPX4 contains a selenocysteine (U) in its active site; inhibiting it →
  ferroptosis.
- T5 Capstone: marked against the checklist (source + date for every number,
  plot with caption, interpretation linked to a lecture slide, sessionInfo).

**Plots.** Mutation count by amino-acid position for BRAF vs TP53 (two facets);
student's own capstone plot.
**Pitfalls.** Mutation records ≠ patients (one sample can carry two); study choice
changes frequencies; cBioPortal API uses Entrez gene IDs (BRAF 673, TP53 7157).
**Effort.** 2 days (capstone checklist and marking guide included).

---

## 3. Progression across the course

| Day | New database/browser skills | New R skills | R Markdown | Reuses |
|---|---|---|---|---|
| 1 | Identifiers; UniProt entry; HPA subcellular + single-cell; Cellosaurus | `read.delim(url)`; first ggplot; log axis | Knit; YAML; setup chunk; fill 3 chunks; inline R | — |
| 2 | UniProt features; PDB + Mol*; AlphaFold pLDDT; GTEx; ClinVar; PubChem | `fromJSON(url)`; look up an ID then query | Write own chunk; chunk options; `fig.cap`; Data section with date | UniProt, HPA |
| 3 | Sequence features; FASTA; GO/QuickGO evidence; Reactome; STRING | Many IDs in one query; `substr`; `dplyr`; `kable` | Tables; interpretation paragraphs | UniProt, ClinVar, HPA |
| 4 | NCBI Nucleotide; annotation counts; ChEMBL lookup; PDB with drug | `rentrez`; parse text with a helper | Caching to `data/`; `sessionInfo()` | UniProt, PDB, ClinVar |
| 5 | ChEMBL bioactivity; Open Targets; pathway maps | Own function; `httr2` POST (GraphQL); joins; `geom_function` | Template has instructions only, no code hints | PDB, Reactome, STRING |
| 6 | Gene families across tissues; ClinicalTrials.gov | Loop over genes; heatmap; paging | `params:` in YAML; re-knit for a new gene set | GTEx, ClinVar, PDB |
| 7 | DepMap concepts; HPA cell-cycle | Nested JSON → long table; distributions; facets | Headings only; student writes every chunk | Open Targets, HPA, Reactome |
| 8 | cBioPortal | Combine ≥ 2 APIs | Blank outline → own structured report, handed in | All |

Gentle slope: days 1–3 mostly point-and-click with R reading single URLs; days 4–6
add packages and loops; days 7–8 are API-to-plot in R with student-structured
reports.

---

## 4. Resources and APIs: what was checked (2026-11-18)

Tested with `curl` (generic User-Agent, a few requests each) or in R
(`jsonlite`, `ggplot2`) from our server. All are free and need no login unless noted.

| Resource | Endpoint tested | Result | Reuse terms |
|---|---|---|---|
| UniProt REST | `rest.uniprot.org/uniprotkb/search?...&format=tsv`, `/uniprotkb/P13569.json`, `.fasta` | 200; TSV reads directly with `read.delim()` in R | CC BY 4.0 (stated on UniProt licence page; page is JS, not machine-read) |
| Human Protein Atlas | `proteinatlas.org/ENSG00000001626.json`; `/api/search_download.php?search=LDLR&format=json&columns=g,scl,rnatsm,rnascd&compress=no` | 200 | **CC BY 4.0** (licence page read) |
| Cellosaurus | `api.cellosaurus.org/cell-line/CVCL_0030?format=json` | 200 | CC BY 4.0 (not re-checked) |
| NCBI E-utilities (PubMed, ClinVar, Nucleotide) | `esearch` pubmed "ivacaftor"; clinvar `CFTR[gene]`; `esummary` nuccore NC_012920 | 200 | US public domain; ≤ 3 req/s without key |
| RCSB PDB | `data.rcsb.org/rest/v1/core/entry/{6O2P,1IEP,3SN6,1JFF,5N69,5LF3}`; `search.rcsb.org/rcsbsearch/v2/query` | 200; titles match the tasks | CC0 |
| AlphaFold DB | `alphafold.ebi.ac.uk/api/prediction/P13569` | 200 (global pLDDT 75.6) | CC BY 4.0 (not machine-read) |
| GTEx API v2 | `/api/v2/reference/gene`, `/expression/medianGeneExpression` (gtex_v8 and gtex_v10) | 200; v10 needs GENCODE v39 IDs | Open-access summary data; cite GTEx |
| Reactome | `ContentService/data/mapping/UniProt/P01130/pathways` | 200 | CC BY 4.0 (licence page read; data files CC0) |
| KEGG REST | `rest.kegg.jp/link/pathway/hsa:3949` | 200 | **Academic use only**; do not copy KEGG maps onto our pages |
| STRING | `string-db.org/api/tsv/network`, `/api/image/network` | 200 (TSV, PNG) | CC BY 4.0 (access page read) |
| QuickGO; GO API | `ebi.ac.uk/QuickGO/services/annotation/search`; `api.geneontology.org/api/bioentity/function/...` | 200 | CC BY 4.0 (GO) |
| ChEMBL | `/chembl/api/data/molecule/search.json`, `/activity.json` | 200, but slow; one filtered query returned 500 once | CC BY-SA 3.0 (page read) |
| PubChem PUG REST | `/compound/name/ivacaftor/property/...` | 200 | Public (NCBI) |
| Open Targets GraphQL | `api.platform.opentargets.org/api/v4/graphql` (API 26.9, data 26.09) | 200; `associatedDiseases`, `drugAndClinicalCandidates`, `depMapEssentiality` work; `knownDrugs` **no longer exists** | CC0 (licence page read); bundled ChEMBL data CC BY-SA |
| ClinicalTrials.gov API v2 | `/api/v2/studies?query.intr=mavacamten&countTotal=true` | 200 | Public |
| cBioPortal API | `/api/studies/...`, `/api/molecular-profiles/.../mutations`, `/api/sample-lists/...` | 200 | TCGA data public; cite cBioPortal + study |
| IDR | `idr.openmicroscopy.org/api/v0/m/projects/` | 200 | Per-study licences (mostly CC BY) |
| OpenOrganelle | site root | 200 (JS app; deep links do not resolve by curl) | CC BY 4.0 (already used in cell-tour) |

**Checked and not recommended as core resources:**

- **Ensembl REST** (`rest.ensembl.org`): connection timed out from our server
  (twice). The Ensembl website now redirects gene pages to a new "feature-explorer"
  and `/biomart` to the jun2026 archive: Ensembl is mid-transition. So **no
  `biomaRt`**; get Ensembl IDs from UniProt or HPA. Re-check before day 4.
- **DepMap portal**: scripted access gets a bot-verification page; fine in the
  browser, use Open Targets for R.
- **OMIM API**: needs a registered key (400 without); browse OMIM only, use ClinVar
  for scripted variant data.
- **Cell Image Library**: timed out twice; use HPA images and IDR instead.
- **DrugBank**: licence/registration needed; ChEMBL + PubChem + Open Targets cover
  our needs.
- **R packages** on CRAN/Bioconductor: `httr2`, `jsonlite`, `rentrez`, `rmarkdown`
  (CRAN pages exist); `UniProt.ws`, `biomaRt` (Bioconductor) exist but are not
  needed. Local test: `jsonlite` + `read.delim` + `ggplot2` fetched GTEx, UniProt
  and PubMed and plotted without other packages.

---

## 5. Recommendation: pilot

**Build Day 1 (`bioinfo-protein-atlas/`) first.** Its block is finished, its
resources (UniProt TSV, HPA, Cellosaurus) are the most stable and need no
packages beyond `ggplot2`, and it fixes everything later days reuse: page skeleton,
the `.Rmd` template format and R Markdown primer, answer callouts with check dates,
snapshot fallback, sidebar entry and CSS colour, `_quarto.yml` resources line.
Try it on 2–3 students or TAs and time Parts A and B before building more. Build
**Day 2** next (block finished; tests the first JSON API and the GTEx version
pitfall), then the others in block order as their lectures are built.

Total estimated build effort: about **13–14 days** for all eight, plus ~1 h per
day page per year to re-check answers.
