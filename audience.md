# Audience

3MB001 is taken in **year 2, spring term (term 4)** of the **Biomedicine
Programme** (*Biomedicinprogrammet*, MGBIO, 180 ECTS, Bachelor of Medical
Science), Umeå University. Programme page:
<https://www.umu.se/utbildning/program/biomedicinprogrammet/>. The syllabus says
the course is open only to programme students, so in practice the class is
**MGBIO students**. A few exchange students may join. The programme is taught in
Swedish but this course is in English.

Sources: programme page and course syllabi on umu.se, read 2026-11-18. Course
order is from the programme page; check the exact term placement with the
programme coordinator.

## What they have taken before (programme order)

| Term | Course | Code | What it gives us |
|---|---|---|---|
| 1 | Folkhälsovetenskap, epidemiologi och biostatistik | 3ME095 | Descriptive statistics, tests, confidence intervals, confounding, reading papers |
| 1 | Grundläggande anatomi och embryologi | 3AN005 | Organ systems, body plan, organogenesis, malformations |
| 1 | Grundläggande kemi | 3BK033 | Bonding, intermolecular forces, equilibria (K), **ΔG = ΔH − TΔS, ΔG° = −RT ln K**, kinetics, solutions, spectrophotometry |
| 2 | Biomedicinsk kemi | 3BK032 | Organic and biological chemistry, **structure and function of proteins, enzymes, carbohydrates, lipids and membranes**, metabolism and its regulation, **central dogma and regulation of gene expression**, protein purification, PCR, enzyme assays, **testing drug effects on enzymes, principles of drug design** |
| 3 | Mikrobiologi och basal molekylärbiologi | 3MB036 | **Prokaryotic vs eukaryotic cells**, growth and how it is measured, replication, transcription, translation and their regulation, bacterial genetics, **antibiotic resistance**, lab safety |
| 3 | Basal och molekylär genetik | 3MB035 | Eukaryotic genome structure and organisation, transmission genetics (mitosis and meiosis at chromosome level), model organisms, population genetics, statistical evaluation of results |

## What comes after (do not steal their thunder; do point forward)

| When | Course | Code | Overlap to manage |
|---|---|---|---|
| Term 4, after us | Organs struktur och funktion | 3AN006 | Physiology and histology, **signalling between cells**, tissue renewal, light microscopy of tissues, intro immunology. Keep tissues, ECM and physiology light here. |
| Term 5–6 | Immunologi | 5MO096 | Immune signalling. Use immune examples only as applications. |
| Term 5–6 | Mikrobiell patogenes | 3MB039 | Pathogens hijacking the cell. Good applications, but no depth. |
| Term 5–6 | Sjukdomslära: mekanismer, symptom, diagnostik | 3ME129 | Disease mechanisms in depth. ELO 9 here = the **cell-level** basis only. |
| Term 5–6 | Kliniska prövningar och läkemedelsutveckling | 3FA034 | Drug development phases and trials. Our end-of-lecture drug applications are a **preview**: say so ("you meet this again in…"). |

## What we can assume

- **Molecular biology:** DNA, chromosomes, replication, transcription,
  translation and gene regulation, all at the level of the central dogma. **Do not
  re-teach it.** At most one recap slide where a lecture builds on it (e.g.
  co-translational import into the ER).
- **Biochemistry:** amino acids, protein structure levels, enzyme kinetics and
  inhibition, lipids and **the basics of membranes**, metabolism (glycolysis, TCA,
  oxidative phosphorylation at the metabolic level).
- **Chemistry and thermodynamics:** ΔG, equilibrium constants, concentration
  gradients. We can use these for the Nernst equation, binding (K_d) and
  dose–response, without deriving them again.
- **Cells:** what a eukaryotic cell is and how it differs from a prokaryote,
  names of the main organelles.
- **Lab:** pipetting, solutions, spectrophotometry, PCR, protein purification,
  SDS-PAGE (likely), sterile bacterial work, lab journals and reports.
- **Statistics:** t-tests, confidence intervals, reading a figure in a paper.
- **Drugs:** they have seen enzyme-inhibition assays and drug-design principles,
  so "a drug is a molecule that binds a target and changes its activity" is
  familiar ground for the application slides.

- **Computing (experimental run):** command line and R. They have **not**
  used bioinformatics tools or databases before. Each block has a
  bioinformatics module (see `plan/bioinformatics.md`).

## What we should not assume

- **Membrane transport mechanisms:** transporters vs channels, pumps, membrane
  potential, electrochemical gradients in a cell (the ΔG maths is known, the cell
  biology is not).
- **Protein sorting and vesicle traffic:** signal sequences, ER, Golgi, endocytosis,
  lysosomes, autophagy.
- **Protein quality control and degradation:** chaperones, ubiquitin–proteasome,
  unfolded protein response.
- **Signal transduction:** receptor classes, second messengers, kinase cascades.
- **Cytoskeleton and motors:** almost certainly new.
- **Cell-cycle control:** they know what mitosis and meiosis *look like* from
  genetics, but not cyclins/CDKs, checkpoints, the spindle assembly checkpoint
  or cytokinesis machinery.
- **Programmed cell death:** new.
- **Cell biology methods:** fluorescence, confocal and electron microscopy, cell
  culture, flow cytometry, fractionation, live imaging, CRISPR. Light microscopy
  of tissues comes *after* us (3AN006).
- **Mammalian cell culture**: probably new.

## Pedagogical consequences

- **Start where they are:** they think in molecules (chemistry, biochemistry,
  central dogma). This course moves them up one level, to **compartments,
  machines and decisions inside a cell**. Say this explicitly in lecture 1.
- **Pictures first.** The topics are spatial (where is the protein, which way does
  the ion go, what moves along what). At least half the slides carry an
  explanatory diagram or a real image (see [designprinciples.md](designprinciples.md)).
- **Motivate with drugs and disease.** This programme leads to pharma, biotech
  and clinical work, and the later courses are about disease and drug
  development. Every lecture ends with an application.
- **Self-contained.** No lecture may require reading the book. Book chapters are
  optional pointers.
- **Exam per ELO.** Students must pass every ELO separately, so material,
  quizzes and study questions are tagged by ELO, and each ELO gets practice at
  both G and VG level.
