# Sources: bioinformatics day 6 (cytoskeleton)

Not rendered or included anywhere on the site. Keeps the provenance of the
published snapshot and of every entry used in the tasks. No external images are
reproduced; RCSB, ClinicalTrials.gov and ClinVar pages are only linked.

## Published snapshot

| File | Content | Source | Terms |
|---|---|---|---|
| `data/gtex-expression-2026-11-18.csv` | Median TPM for 16 genes × 8 tissues (128 rows; columns `gene, gencode_id, tissue, tpm, dataset`) | GTEx Portal API v2, dataset `gtex_v8`, retrieved 2026-11-18 | Open-access GTEx summary data (<https://gtexportal.org/home/datasets>); no controlled-access data. Cite GTEx Consortium, *Science* 369:1318–1330 (2020), <https://doi.org/10.1126/science.aaz1776> |

Tissues: `Skin_Not_Sun_Exposed_Suprapubic`, `Esophagus_Mucosa`, `Liver`, `Lung`,
`Muscle_Skeletal`, `Heart_Left_Ventricle`, `Brain_Cortex`, `Nerve_Tibial`.

API calls (one pair per gene; formerly `retrieval-manifest-2026-11-18.json`):

- `https://gtexportal.org/api/v2/reference/gene?geneId=<SYMBOL>&datasetId=gtex_v8`
- `https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=<ID>&datasetId=gtex_v8&itemsPerPage=250`

GENCODE IDs (v26, as used by gtex_v8): DES ENSG00000175084.11, GFAP
ENSG00000131095.12, KRT14 ENSG00000186847.5, KRT18 ENSG00000111057.10, KRT5
ENSG00000186081.11, KRT8 ENSG00000170421.12, LMNA ENSG00000160789.19, MYH2
ENSG00000125414.18, MYH6 ENSG00000197616.11, MYH7 ENSG00000092054.12, MYH9
ENSG00000100345.20, NEFL ENSG00000277586.2, TUBB ENSG00000196230.12, TUBB3
ENSG00000258947.6, TUBB4A ENSG00000104833.11, VIM ENSG00000026025.15.

A live re-fetch on 2026-11-19 gave identical values (gtex_v8 is a frozen release).

## Entries used in Part A (checked live 2026-11-19)

- **RCSB PDB 1JFF** (CC0): "Refined structure of alpha-beta tubulin from zinc-induced
  sheets stabilized with taxol", electron crystallography, *Bos taurus*. Chain A
  α-tubulin, chain B β-tubulin; TA1 (taxol) on chain B. Löwe et al., *J Mol Biol* 2001.
- **RCSB PDB 5N69** (CC0): cardiac myosin S1 (Myosin-7, *Bos taurus*, UniProt Q9BE39),
  pre-powerstroke, with omecamtiv mecarbil (ligand 2OW). Planelles-Herrero et al.,
  *Nat Commun* 2017.
- **RCSB PDB 8QYR** (CC0): β-cardiac myosin motor domain (Myosin-7, *Bos taurus*,
  Q9BE39), pre-powerstroke, with mavacamten (ligand XB2). Primary citation: "Omecamtiv
  mecarbil and Mavacamten target the same myosin pocket despite antagonistic effects
  in heart contraction" (Auguin et al.; bioRxiv 2023, later *Nat Commun* 2024).
  Found via RCSB search for chem_comp XB2 (entries 8QYQ, 8QYR, 9GZ1, 9GZ2, 9YP9, 9YR7).
- **ClinicalTrials.gov NCT03470545** (EXPLORER-HCM; public registry record): phase 3,
  randomised, quadruple-masked, mavacamten vs placebo, obstructive HCM, completed
  (251 enrolled). API: `https://clinicaltrials.gov/api/v2/studies/NCT03470545`.
- **ClinVar VCV000014612**: NM_000526.5(KRT14):c.373C>T (p.Arg125Cys), Pathogenic
  (multiple submitters, no conflicts), epidermolysis bullosa simplex.
- **ClinVar VCV000014087**: NM_000257.4(MYH7):c.1208G>A (p.Arg403Gln), Pathogenic
  (reviewed by expert panel), hypertrophic cardiomyopathy.
  ClinVar records via NCBI E-utilities `esummary.fcgi?db=clinvar` (public domain, NCBI).

## Dropped in the 2026-11-19 rework

`data/mavacamten-trials-2026-11-18.csv` (ClinicalTrials.gov intervention search,
49 studies) and the trial-phase chart: study counts drift with registry updates.
