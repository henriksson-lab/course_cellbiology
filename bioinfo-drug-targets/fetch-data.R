# Supplied API helpers: cache dated CSVs; explicit snapshot mode never uses a URL.
get_chembl <- function(path, query = list()) {
  req <- httr2::request(paste0("https://www.ebi.ac.uk/chembl/api/data/", path))
  req <- do.call(httr2::req_url_query, c(list(req), query))
  req <- httr2::req_user_agent(req, "3MB001-course")
  req <- httr2::req_retry(req, max_tries = 3)
  req <- httr2::req_timeout(req, 90)
  httr2::resp_body_json(httr2::req_perform(req), simplifyVector = TRUE)
}

fetch_target_data <- function(use_snapshot = FALSE) {
  dir.create("data", showWarnings = FALSE)
  tag <- if (use_snapshot) "2026-11-18" else as.character(Sys.Date())
  files <- file.path("data", paste0(c("imatinib-activities-", "clinical-candidates-"), tag, ".csv"))
  meta_file <- file.path("data", paste0("releases-", tag, ".csv"))
  targets <- c(CHEMBL1862 = "ABL1", CHEMBL1936 = "KIT", CHEMBL2007 = "PDGFRA", CHEMBL267 = "SRC", CHEMBL203 = "EGFR")
  chembl_query <- list(molecule_chembl_id = "CHEMBL941", standard_type = "IC50",
    target_chembl_id__in = paste(names(targets), collapse = ","), limit = 1000)
  target_ids <- c(EGFR = "ENSG00000146648", ABL1 = "ENSG00000097007", KIT = "ENSG00000157404")
  query <- paste0("{ meta { dataVersion { year month iteration } } ", paste(vapply(seq_along(target_ids), function(i)
    paste0("t", i, ':target(ensemblId:"', target_ids[i], '") { id approvedSymbol drugAndClinicalCandidates { count rows { id maxClinicalStage drug { id name } } } }'), character(1)), collapse = " "), " }")
  if (use_snapshot && !all(file.exists(c(files, meta_file)))) stop("Download the three snapshot CSVs into data/ before knitting offline.")
  releases <- if (file.exists(meta_file)) read.csv(meta_file) else data.frame(source = character(), release = character())
  if (!file.exists(files[1])) {
    result <- get_chembl("activity.json", chembl_query)
    if (!is.null(result$page_meta[["next"]])) stop("More than 1000 records: add pagination before interpreting this query.")
    x <- result$activities
    columns <- c("activity_id", "target_chembl_id", "standard_type", "standard_relation", "standard_value", "standard_units", "pchembl_value", "assay_type", "assay_chembl_id", "assay_description", "data_validity_comment", "potential_duplicate", "document_chembl_id", "target_organism")
    out <- data.frame(target = unname(targets[x$target_chembl_id]), x[, columns])
    write.csv(out, files[1], row.names = FALSE, na = "")
    status <- get_chembl("status.json")
    releases <- rbind(releases[releases$source != "ChEMBL", ], data.frame(source = "ChEMBL", release = status$chembl_db_version))
    write.csv(releases, meta_file, row.names = FALSE)
  }
  if (!file.exists(files[2])) {
    req <- httr2::request("https://api.platform.opentargets.org/api/v4/graphql")
    req <- httr2::req_body_json(req, list(query = query))
    req <- httr2::req_user_agent(req, "3MB001-course")
    req <- httr2::req_retry(req, max_tries = 3)
    req <- httr2::req_timeout(req, 90)
    response <- httr2::resp_body_json(httr2::req_perform(req), simplifyVector = FALSE)
    if (!is.null(response$errors)) stop("Open Targets schema error: ", response$errors[[1]]$message)
    out <- list()
    for (i in seq_along(target_ids)) {
      target <- response$data[[paste0("t", i)]]
      candidates <- target$drugAndClinicalCandidates
      if (length(candidates$rows) != candidates$count) stop("Incomplete Open Targets result; do not plot partial counts.")
      for (r in candidates$rows) out[[length(out) + 1L]] <- data.frame(target = target$approvedSymbol,
        ensembl_id = target$id, record_id = r$id, stage = r$maxClinicalStage,
        drug_id = r$drug$id, drug_name = r$drug$name)
    }
    write.csv(do.call(rbind, out), files[2], row.names = FALSE)
    version <- response$data$meta$dataVersion
    releases <- rbind(releases[releases$source != "Open Targets", ], data.frame(source = "Open Targets", release = paste(version$year, version$month, sep = ".")))
    write.csv(releases, meta_file, row.names = FALSE)
    writeLines(query, file.path("data", paste0("opentargets-query-", tag, ".txt")))
  }
  list(activities = read.csv(files[1], na.strings = c("", "NA")),
       candidates = read.csv(files[2]), releases = read.csv(meta_file), retrieved = tag,
       mode = if (use_snapshot) "course snapshot" else "dated local data/cache",
       chembl_query = chembl_query, opentargets_query = query)
}
