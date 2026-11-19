# Sources: bioinfo-mito-proteasome (not rendered)

No external images are used. Structures are viewed on RCSB PDB, not copied.

## Published data snapshots (`data/`)

| File | Content and provenance | Licence |
|---|---|---|
| `data/mtdna-features-2026-11-18.csv` | CDS/tRNA/rRNA features (37 rows; 1-based inclusive coordinates; complex assigned from gene names) parsed by `parse_feature_table()` in the template from the NCBI feature table of RefSeq NC_012920.1, fetched 2026-11-18 via E-utilities: <https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NC_012920.1&rettype=ft&retmode=text>. Re-parsed live on 2026-11-19: identical. | NCBI data: no restrictions, <https://www.ncbi.nlm.nih.gov/home/about/policies/> |
| `data/uniprot-mitochondria-2026-11-18.csv` | All 1 374 entries (accession, primary gene) of UniProtKB release 2026_04 for query `organism_id:9606 AND reviewed:true AND cc_scl_term:SL-0173`, via <https://rest.uniprot.org/uniprotkb/stream?format=tsv&fields=accession,gene_primary&query=organism_id%3A9606%20AND%20reviewed%3Atrue%20AND%20cc_scl_term%3ASL-0173>, retrieved 2026-11-18. Count unchanged (1 374, release 2026_04) on 2026-11-19. | CC BY 4.0, <https://www.uniprot.org/help/license> |

The raw feature table and the UniProt release-header file from 2026-11-18 were
removed when the day was reworked (2026-11-19); the template re-creates the CSV
from the live feature table.

## Browser answers, checked 2026-11-19 through the public APIs

- NC_012920.1: 16 569 bp, circular (NCBI esummary).
- UniProt P25705 (ATP5F1A): transit peptide 1–43; P00846 (MT-ATP6): no transit peptide, encoded in mitochondrion (UniProt REST).
- PDB 5LF3 (X-ray, 2.1 Å): ligand BO2 (bortezomib) on auth chains H, K, N, V, Y, b = entities beta type-7 (PSMB7, β2), beta type-5 (PSMB5, β5), beta type-6 (PSMB6, β1) (RCSB data API).
- ChEMBL CHEMBL325041 bortezomib: max_phase 4; mechanism "26S proteasome inhibitor" (ChEMBL API).
- ClinVar 14500: NM_170707.4(LMNA):c.1824C>T (p.Gly608=), Pathogenic, criteria provided, multiple submitters, no conflicts; conditions include Hutchinson–Gilford syndrome (E-utilities esummary).
- Mechanism (cryptic splice site, 150 nt / 50 aa deletion, retained farnesyl): GeneReviews, Hutchinson–Gilford progeria syndrome, <https://www.ncbi.nlm.nih.gov/books/NBK1121/>; course lecture organelles-homeostasis.
