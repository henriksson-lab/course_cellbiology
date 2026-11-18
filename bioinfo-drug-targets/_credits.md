No external images are reproduced. Structures are viewed at RCSB PDB, and plots are generated from the following dated records.

| File | Content and provenance | Licence |
|---|---|---|
| `data/imatinib-activities-2026-11-18.csv` | 161 ChEMBL 37 activity records, selected fields including assay descriptions and source-document IDs. [REST query](https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=CHEMBL941&standard_type=IC50&target_chembl_id__in=CHEMBL1862,CHEMBL1936,CHEMBL2007,CHEMBL267,CHEMBL203&limit=1000), retrieved 2026-11-18. Target labels added from the five ChEMBL IDs; no potency observations removed from the snapshot. | [CC BY-SA 3.0](https://chembl.gitbook.io/chembl-interface-documentation/about) |
| `data/clinical-candidates-2026-11-18.csv` | All returned drug/candidate records for EGFR (82), ABL1 (27) and KIT (38), flattened from Open Targets Platform 26.09 `drugAndClinicalCandidates` GraphQL response, retrieved 2026-11-18. Fields include stable IDs, names and `maxClinicalStage`. | [CC0 1.0](https://platform-docs.opentargets.org/licence) |
| `data/opentargets-query-2026-11-18.txt` | Exact query sent to [Open Targets GraphQL](https://api.platform.opentargets.org/api/v4/graphql); metadata and three targets. | Query written for this course |
| `data/releases-2026-11-18.csv` | Release identifiers from ChEMBL `/status.json` and Open Targets `meta.dataVersion`, retrieved with the records | Same sources |

Browser sources checked 2026-11-18: [PDB 3SN6](https://www.rcsb.org/structure/3SN6), [PDB 1IEP](https://www.rcsb.org/structure/1IEP), [Reactome signalling by EGFR](https://reactome.org/content/detail/R-HSA-177929), and the API records behind [Open Targets EGFR](https://platform.opentargets.org/target/ENSG00000146648) and [ChEMBL imatinib](https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL941).

The ChEMBL snapshot contains a conflicting EGFR observation (activity 24962906, IC50 0.11 nM) and a censored EGFR result (activity 909964, >100000 nM). They are retained and explicitly discussed. Curves are illustrative Hill-slope-1 calculations, not fitted experimental curves or clinical predictions. Exact numeric assay medians depend on the stated filters.
