# Sources: bioinfo-cancer-genomics (not rendered)

## Redistributed data

| File | Source | Terms |
|---|---|---|
| `data/skcm-mutations-2026-11-18.csv` | cBioPortal API, TCGA Skin Cutaneous Melanoma, PanCancer Atlas 2018; study `skcm_tcga_pan_can_atlas_2018`, profile `skcm_tcga_pan_can_atlas_2018_mutations`, sample list `skcm_tcga_pan_can_atlas_2018_sequenced` (440 samples) | Public TCGA somatic calls; cite cBioPortal (Cerami et al. 2012, doi:10.1158/2159-8290.CD-12-0095; Gao et al. 2013, doi:10.1126/scisignal.2004088) and the TCGA PanCancer Atlas |

Snapshot provenance: retrieved 2026-11-18 with

- `https://www.cbioportal.org/api/molecular-profiles/skcm_tcga_pan_can_atlas_2018_mutations/mutations?sampleListId=skcm_tcga_pan_can_atlas_2018_sequenced&entrezGeneId=673&projection=DETAILED&pageSize=10000000` (BRAF)
- the same with `entrezGeneId=7157` (TP53)

Columns kept: gene, sample_id, patient_id, protein_change, protein_start, protein_end,
mutation_type, study. 245 BRAF and 82 TP53 records. The template's live fetch uses
`projection=SUMMARY` and gave identical counts on 2026-11-19 (158 V600E, 35 V600K).

## Linked in browser tasks (checked 2026-11-19)

- cBioPortal results view, study `skcm_tcga_pan_can_atlas_2018`, case set `_all` (448 samples), genes BRAF TP53: BRAF lollipop max 198 at V600 ("V600E/K/R and 1 more").
- UniProt P15056 (BRAF), CC BY 4.0: Protein kinase domain 457–717; RBD 155–227.
- RCSB PDB 3OG7 (Bollag et al. 2010, Nature 467:596): "B-Raf Kinase V600E oncogenic mutant in complex with PLX4032"; ligand 032 = vemurafenib. PDB data CC0.
- ClinicalTrials.gov NCT01006980 (BRIM-3): vemurafenib vs dacarbazine, V600E melanoma. Public domain (US government).

No external images are reproduced. Plots are made by course code.
