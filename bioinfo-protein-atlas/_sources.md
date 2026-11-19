<!-- Not rendered or included anywhere. Sources, licences and provenance for bioinfo-protein-atlas/. -->

# Sources: Where does a protein live? (bioinformatics day 1)

The page shows no images from other sites; students view HPA images on the HPA
website itself.

## Databases used

- **UniProt**: The UniProt Consortium, *UniProt: the Universal Protein
  Knowledgebase*, Nucleic Acids Research (latest database issue).
  <https://www.uniprot.org>, CC BY 4.0. Entries P27824 (calnexin), P04040 (catalase).
- **Human Protein Atlas** version 26.0, <https://www.proteinatlas.org>, CC BY 4.0.
  Subcellular section: Thul et al., *Science* 2017, 356:eaal3321. Single cell
  section: Karlsson et al., *Science Advances* 2021, 7:eabh2169. Genes TOMM20
  (ENSG00000173726), GOLGA2 (ENSG00000167110), LMNB1 (ENSG00000113368), CAT
  (ENSG00000121691), INS (ENSG00000254647).
- **Cellosaurus**: Bairoch A., *J Biomol Tech* 2018, 29:25–38.
  <https://www.cellosaurus.org>, CC BY 4.0. Entries CVCL_0030 (HeLa), CVCL_1906 (HEp-2).

## Snapshot shipped with the page

| File | What it is | Source | Licence |
|---|---|---|---|
| `data/uniprot-proteins-2026-11-18.csv` | Accession, gene, name, length and mass of 13 human proteins | UniProtKB release 2026_04, retrieved 2026-11-18 | CC BY 4.0 |

Query (the same one the template runs):
`https://rest.uniprot.org/uniprotkb/accessions?accessions=P27824,Q15388,P11279,Q08379,P20700,P04040,P05023,P13569,P60709,P07437,Q8WZ42,P62805,P04406&fields=accession,gene_primary,protein_name,length,mass&format=tsv`
(release from the `X-UniProt-Release` response header).

## Answer checks

- 2026-11-18: all answers checked against UniProt 2026_04, HPA 26.0, Cellosaurus.
- 2026-11-19 (rework): re-checked live. UniProt P27824 ER membrane (ECO:0000269),
  single-pass type I; P04040 peroxisome matrix (ECO:0000269, two publications).
  HPA API (`/api/search_download.php`, `/ENSG….json`): main locations TOMM20
  Mitochondria, GOLGA2 Golgi apparatus, LMNB1 Nuclear membrane, CAT Vesicles; INS
  single cell type enriched, Pancreatic islet cells (85 601 nCPM). Cellosaurus API:
  HeLa transformant HPV18; HEp-2 "Problematic cell line: Contaminated. Shown to be a
  HeLa derivative". Template solution knitted live (UniProt 2026_04) and from the
  snapshot: titin 3816 kDa heaviest, histone H4 11.4 kDa lightest, ratio 336.
