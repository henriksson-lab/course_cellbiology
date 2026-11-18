# Provided helper. Source this file from the report; do not edit to complete tasks.
# Parse NCBI five-column feature tables; map RNA/CDS features to their gene feature.
parse_mtdna <- function(text) {
  lines <- strsplit(text, "\n", fixed = TRUE)[[1]]
  features <- list()
  for (line in lines[-1]) {
    cells <- strsplit(line, "\t", fixed = TRUE)[[1]]
    if (length(cells) >= 3 && nzchar(cells[1]) && nzchar(cells[3])) {
      features[[length(features) + 1L]] <- list(start = as.integer(cells[1]),
        end = as.integer(cells[2]), type = cells[3], gene = "", product = "")
    } else if (length(cells) >= 5 && cells[4] %in% c("gene", "product")) {
      features[[length(features)]][[cells[4]]] <- cells[5]
    }
  }
  tab <- do.call(rbind, lapply(features, as.data.frame, stringsAsFactors = FALSE))
  genes <- tab[tab$type == "gene", ]
  out <- tab[tab$type %in% c("CDS", "tRNA", "rRNA"), ]
  key <- function(x) paste(x$start, x$end, sep = ":")
  out$gene <- genes$gene[match(key(out), key(genes))]
  out$strand <- ifelse(out$start < out$end, "+", "-")
  lo <- pmin(out$start, out$end); hi <- pmax(out$start, out$end)
  out$start <- lo; out$end <- hi
  out$complex <- "RNA"
  out$complex[grepl("^ND", out$gene)] <- "I"
  out$complex[out$gene == "CYTB"] <- "III"
  out$complex[grepl("^COX", out$gene)] <- "IV"
  out$complex[grepl("^ATP", out$gene)] <- "V"
  out[, c("gene", "start", "end", "strand", "type", "complex", "product")]
}

fetch_organelle_data <- function(use_snapshot = FALSE) {
  dir.create("data", showWarnings = FALSE)
  tag <- if (use_snapshot) "2026-11-18" else as.character(Sys.Date())
  files <- file.path("data", paste0(c("mtdna-features-", "uniprot-mitochondria-"), tag, ".csv"))
  ncbi_url <- "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=NC_012920.1&rettype=ft&retmode=text"
  query <- "organism_id:9606 AND reviewed:true AND cc_scl_term:SL-0173"
  uniprot_url <- paste0("https://rest.uniprot.org/uniprotkb/stream?format=tsv&fields=accession,gene_primary&query=", URLencode(query, reserved = TRUE))
  if (use_snapshot && !all(file.exists(files))) stop("Download both snapshot CSVs into data/ before knitting offline.")
  if (!file.exists(files[1])) {
    Sys.sleep(0.4) # Respect NCBI's request limit, no API key needed.
    raw <- rentrez::entrez_fetch(db = "nuccore", id = "NC_012920.1", rettype = "ft", retmode = "text")
    writeLines(raw, file.path("data", paste0("NC_012920.1-", tag, ".txt")))
    write.csv(parse_mtdna(raw), files[1], row.names = FALSE)
  }
  if (!file.exists(files[2])) {
    proteins <- read.delim(uniprot_url, check.names = FALSE)
    write.csv(proteins, files[2], row.names = FALSE)
    headers <- curlGetHeaders(uniprot_url)
    release <- trimws(sub("^[^:]*:", "", grep("^x-uniprot-release:", headers, ignore.case = TRUE, value = TRUE)))
    writeLines(if (length(release)) release else "not reported", paste0(files[2], ".release.txt"))
  }
  release_file <- paste0(files[2], ".release.txt")
  release <- if (use_snapshot) "2026_04" else if (file.exists(release_file)) readLines(release_file)[1] else "not recorded (cached file)"
  list(genes = read.csv(files[1]), proteins = read.csv(files[2], check.names = FALSE),
       retrieved = tag, release = release, ncbi_url = ncbi_url, uniprot_url = uniprot_url,
       mode = if (use_snapshot) "course snapshot" else "dated local data/cache")
}
