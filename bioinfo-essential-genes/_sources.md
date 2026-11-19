# Sources for bioinfo-essential-genes (not rendered)

Reworked 2026-11-19. Browser answers checked live on 2026-11-19.

## Data snapshot (published in `data/`)

| File | Source | Terms |
|---|---|---|
| `data/depmap-gene-effect-2026-11-18.csv` | DepMap CRISPR gene effects (Chronos) redistributed by the Open Targets Platform, release 26.09, field `target.depMapEssentiality { tissueName screens { cellLineName geneEffect } }` | Open Targets: CC0, except contributing datasets with extra terms. Keep the DepMap attribution; DepMap terms: https://depmap.org/portal/terms/ |

- API: `POST https://api.platform.opentargets.org/api/v4/graphql`, one query per
  gene: `{ target(ensemblId: "<ID>") { depMapEssentiality { tissueId tissueName screens { cellLineName geneEffect } } } }`.
- Genes: CDK1 ENSG00000170312, CDK4 ENSG00000135446, CDK6 ENSG00000105810,
  BCL2 ENSG00000171791, MCL1 ENSG00000143384, BCL2L1 ENSG00000171552.
- Snapshot retrieved 2026-11-18 (Open Targets 26.09; `meta.dataVersion`
  year 26, month 09). 7 547 non-missing screen results (1 258 per gene, 1 257 for
  BCL2L1). A live fetch on 2026-11-19 gave the same row count and medians.
- The snapshot CSV has extra columns (`ensembl_id`, `tissue_id`); the template
  keeps only `gene, tissue, cell_line, gene_effect`.
- Cite DepMap (https://depmap.org/portal/) and the Chronos method,
  https://doi.org/10.1186/s13059-021-02540-7 .
- The DepMap portal itself shows a Cloudflare verification page to scripts, so
  the page has no DepMap-portal task (it could not be checked live).

## Browser entries (linked, nothing copied)

- HPA CCNB1, https://www.proteinatlas.org/ENSG00000134057-CCNB1/subcellular
  (CC BY 4.0). "Protein expression peak phase": G2 (FUCCI U-2 OS assay); CCD
  protein: Yes.
- UniProt P04637 TP53, https://www.uniprot.org/uniprotkb/P04637/entry (CC BY 4.0).
  Modified residue 15: "Phosphoserine; by CDK5, PRPK, AMPK, NUAK1 and ATM".
  DNA binding 102–292; oligomerization 325–356.
- ChEMBL venetoclax CHEMBL3137309, https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL3137309
  (CC BY-SA 3.0). Mechanism: "Apoptosis regulator Bcl-2 inhibitor" (target
  CHEMBL4860); max phase 4; first approval 2016.

## Answers read from the snapshot (solution knit, 2026-11-19)

- Medians: BCL2 −0.003, BCL2L1 −0.99, CDK1 −2.63, CDK4 −0.56, CDK6 −0.53, MCL1 −0.64.
- BCL2 lines below −1: lymphoid tissue 5, hematopoietic tissue 2, breast 1,
  Peripheral Nervous System 1. Lowest: OCI-LY-19 (lymphoid, −2.62).
