# Sources: bioinfo-sorting-signals (not rendered)

No external images are copied into this day. Students view UniProt, STRING and
QuickGO on the source websites; the only plot is made by students from UniProt data.

## Redistributed snapshot

| File | Contents | Source and version | Licence |
|---|---|---|---|
| `data/uniprot-features-2026-11-19.csv` | Accession, primary gene name, signal peptide, transit peptide and transmembrane features, and sequence for 14 reviewed human proteins (UniProt TSV saved as CSV with `write.csv`) | UniProtKB release 2026_04 (release date 04-Nov-2026), retrieved 2026-11-19 | [CC BY 4.0](https://www.uniprot.org/help/license) |

Request (same as the template's `uniprot_url`):

    https://rest.uniprot.org/uniprotkb/accessions?accessions=P02768,P01308,Q8NBP7,P11021,P27824,P07237,P11279,P04062,P01130,P02786,P25705,O75390,P37198,P04406&fields=accession,gene_primary,ft_signal,ft_transit,ft_transmem,sequence&format=tsv

The release was read from the `X-UniProt-Release` response header. To refresh,
fetch that URL with `read.delim(..., quote = "", colClasses = "character")` and save it with
`write.csv(x, "data/uniprot-features-YYYY-MM-DD.csv", row.names = FALSE)`, then update
`snapshot_file`, `data_date` and `data_release` in both `.Rmd` files and the line on `index.qmd`.

Earlier version (2026-11-18, removed): 15 proteins incl. PEX5, plus a FASTA file,
a QuickGO CSV and a provenance JSON. PEX5 was dropped because it is an import
receptor, not peroxisomal cargo, and does not fit a destination label.

## Browser tasks (checked live 2026-11-19)

- UniProt entries P01130 (LDLR), Q8NBP7 (PCSK9), P11021 (HSPA5): <https://www.uniprot.org>, release 2026_04, CC BY 4.0.
  - LDLR: signal 1–21; topological domain 22–788 Extracellular; transmembrane 789–810; 811–860 Cytoplasmic.
  - PCSK9: disease "Hypercholesterolemia, familial, 3 (FHCL3)"; signal 1–30; no transmembrane feature.
  - HSPA5: sequence ends in KDEL; signal 1–18. Left-menu label is "Sequence" (LDLR and PCSK9 show "Sequence & Isoforms").
- STRING human LDLR network: <https://string-db.org/cgi/network?identifiers=LDLR&species=9606>.
  API check: `https://string-db.org/api/tsv/interaction_partners?identifiers=LDLR&species=9606&limit=10`
  gave APOB, PCSK9, MYLIP, APOE, LDLRAP1, SREBF2, LRPAP1, DAB2, HMGCS1, HMGCR (none of GAPDH, CANX, TFRC).
  STRING data: CC BY 4.0 (<https://string-db.org/cgi/access>).
- QuickGO: <https://www.ebi.ac.uk/QuickGO/annotations?geneProductId=P13569&goId=GO:0005789>.
  API check: `https://www.ebi.ac.uk/QuickGO/services/annotation/search?geneProductId=UniProtKB:P13569&goId=GO:0005789`;
  row GO:0005789, IDA, PMID:11707463, assigned by UniProt. GO data: CC BY 4.0
  (<https://geneontology.org/docs/go-citation-policy/>).

Data providers: The UniProt Consortium; STRING consortium; Gene Ontology Consortium
and contributing annotation groups.
