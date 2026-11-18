The module uses no external images. Structures are viewed on RCSB PDB rather than copied into the course.

| File | Content and provenance | Reuse |
|---|---|---|
| `data/NC_012920.1-2026-11-18.txt` | Original five-column feature table fetched 2026-11-18 through [NCBI E-utilities](https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NC_012920.1&rettype=ft&retmode=text), reference sequence NC_012920.1 | [NCBI data policy](https://www.ncbi.nlm.nih.gov/home/about/policies/) |
| `data/mtdna-features-2026-11-18.csv` | CDS/tRNA/rRNA features parsed from that feature table; 37 rows, 1-based inclusive coordinates. Complex labels assigned from the gene names; the plotting helper retains opposite-strand coordinates and overlapping genes. | Same source |
| `data/uniprot-mitochondria-2026-11-18.csv` | All 1,374 entries from UniProtKB 2026_04 query `organism_id:9606 AND reviewed:true AND cc_scl_term:SL-0173`; accession and primary gene fields; [REST stream endpoint](https://rest.uniprot.org/uniprotkb/stream?query=organism_id%3A9606%20AND%20reviewed%3Atrue%20AND%20cc_scl_term%3ASL-0173&format=tsv&fields=accession,gene_primary), retrieved 2026-11-18 | [CC BY 4.0](https://www.uniprot.org/help/license) |

Browser interpretation checked 2026-11-18: [PDB 5LF3](https://www.rcsb.org/structure/5LF3), [ChEMBL bortezomib CHEMBL325041](https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL325041), [ClinVar variation 14500](https://www.ncbi.nlm.nih.gov/clinvar/variation/14500/) and [GeneReviews: Hutchinson–Gilford progeria](https://www.ncbi.nlm.nih.gov/books/NBK1121/). The plotted genome map is generated for the course from the feature data.
