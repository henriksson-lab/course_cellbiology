# Sources: bioinformatics day 2, membrane proteins

Not rendered. All browser answers re-checked live on 2026-11-19.

## Data shipped in `data/` (redistributed snapshot copies)

| File | Contents | Source | Licence |
|---|---|---|---|
| `data/gtex-medians-2026-11-18.csv` | All 108 gene/tissue median TPM rows for SLC5A1 and SLC5A2 | GTEx dataset `gtex_v8`, API v2, retrieved 2026-11-18 | Public aggregate GTEx data (<https://gtexportal.org/home/datasets>); no controlled-access data. Citation guidance: <https://gtexportal.org/home/documentationPage#staticTextCitations> |
| `data/uniprot-features-2026-11-18.csv` | Accession, primary gene, Transmembrane and Topological domain strings, length for 8 reviewed human proteins (TSV converted to CSV, annotations unchanged) | UniProtKB release 2026_04, retrieved 2026-11-18 | CC BY 4.0 (<https://www.uniprot.org/help/license>) |

API calls (snapshot provenance, formerly `gtex-provenance.json` / `uniprot-provenance.json`):

- `https://gtexportal.org/api/v2/reference/gene?geneId=SLC5A1&datasetId=gtex_v8` → `ENSG00000100170.9`
- `https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=ENSG00000100170.9&datasetId=gtex_v8`
- `https://gtexportal.org/api/v2/reference/gene?geneId=SLC5A2&datasetId=gtex_v8` → `ENSG00000140675.12`
- `https://gtexportal.org/api/v2/expression/medianGeneExpression?gencodeId=ENSG00000140675.12&datasetId=gtex_v8`
- `https://rest.uniprot.org/uniprotkb/accessions?accessions=P05023,P11166,P13866,P31639,P08183,P13569,P29972,Q09470&fields=accession,gene_primary,ft_transmem,ft_topo_dom,length&format=tsv`
  (the template's live query drops `ft_topo_dom`).

GTEx needs a versioned GENCODE ID that differs by release (v8 `.12`, v10 `.13` for
SLC5A2); the template resolves it via `/reference/gene` and pins `gtex_v8`.
Live results on 2026-11-19 were identical to the snapshot.

## Browser records (no content copied; no screenshots)

- UniProtKB P13569 (CFTR): 12 TRANSMEM; REGION 654..831 "Disordered R region". CC BY 4.0.
- RCSB PDB 6O2P: CFTR–ivacaftor (ligand VX7), cryo-EM 3.3 Å. Liu F et al.,
  *Science* 364:1184–1188 (2019). <https://www.rcsb.org/structure/6O2P>
- AlphaFold DB AF-P13569-F1 (model v6): mean pLDDT 75.6; R region 654–831 mean 33.3,
  TMD1 87.9, NBD1 81.7, TMD2 83.7. CC BY 4.0. <https://alphafold.ebi.ac.uk/entry/P13569>
- ClinVar VCV 7105, NM_000492.3(CFTR):c.1521_1523del (p.Phe508del): germline
  classification Pathogenic, cystic fibrosis.
  Checked via `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=7105&retmode=json`.
- PubChem CID 16220172 (ivacaftor): MW 392.5 g/mol, XLogP3-AA 5.6 (computed).
  Checked via `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/16220172/property/XLogP,MolecularWeight/JSON`.
