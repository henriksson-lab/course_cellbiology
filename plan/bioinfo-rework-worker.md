# Instructions for one worker reworking a bioinformatics day (2026-11-19)

You rework **one** existing bioinformatics day folder `bioinfo-<topic>/`. Seven other
workers rework the other days in parallel.

## Read first

1. `plan/bioinformatics.md` **section 7 (Redesign)**: the rules. They override
   anything conflicting earlier in that file. Also section 6 (lessons from the pilot)
   and your day's original section in section 2 (for the topic and lecture links).
2. Everything currently in your folder: `index.qmd`, `browser.qmd`, `report.qmd`
   (and any other `.qmd`), the `.Rmd` template, the solution `.Rmd`, `data/`,
   `_credits.md`, any `fetch-data.R`. Reuse what is good; cut the rest.
3. `audience.md` (students know the command line and R basics, never used
   bioinformatics databases; all R work in R Markdown knit to HTML).
4. The lectures your day links to (by topic), so the tasks reuse what students just learnt.

## What to produce (only inside your folder)

- `index.qmd`: the single page (engine: markdown; front-matter `resources:` for the
  template and `data/*.csv` only). Delete `browser.qmd`, `report.qmd` and any other
  extra pages; fix links to them.
- `bioinfo-<topic>.Rmd`: template with working fetch/cleaning code and 2–3 marked
  blanks `___`, `use_snapshot` fallback reading `data/` or the published copy at
  `https://henriksson-lab.github.io/course_cellbiology/bioinfo-<topic>/data/...`.
- `bioinfo-<topic>-solution.Rmd`: blanks filled; not published.
- `data/*.csv`: snapshot copies (keep or refresh; keep the date in the filename).
  Remove retrieval-manifest JSON files and `fetch-data.R` from what is published (keep
  a fetch script only if needed, but not listed in `resources:`).
- `_sources.md`: all sources, licences, retrieval dates, API URLs and the snapshot
  provenance (rename `_credits.md`; it is no longer shown anywhere on the site).

## Checks before you finish

- Every task: exact entry linked, one checkable answer, stable fact, collapsed
  answer. Verify each browser answer live (few, polite requests; generic User-Agent).
- Knit the **template untouched** (it must knit, with blanks showing errors because
  `error = TRUE`), and the **solution** both live and with `use_snapshot <- TRUE`, each
  in a fresh session (`Rscript -e 'rmarkdown::render(...)'`). Answers read off the
  solution's plot/printouts must match the answer callouts.
- `quarto render bioinfo-<topic>/index.qmd` without warnings about your files; check
  in headless Chrome (fresh `--user-data-dir`, timeout) at 1280 and 390 px.
- Word count of `index.qmd` ~600–900 (state it).
- Use only your own scratch subfolder `<scratchpad>/<topic>/`; never kill processes
  by pattern; do not edit files outside your folder (not `_quarto.yml`, `credits.qmd`,
  `styles.css`); do not commit.

## Final report (short)

Files kept/deleted/created; the task list with one-line answers; blanks in the
template; word count; what you verified live; anything uncertain.


## Avoid permission prompts

Avoid commands that look destructive (`rm -rf`, `pkill`/`kill`, chained one-liners that
delete files, `curl | sh`). Delete only explicitly named files (e.g. Python `os.remove`
on listed paths). Stale files in `docs/` are cleaned by the coordinator.
