# Handover notes (updated 2026-11-18, second session)

State of the 3MB001 Cell Biology course site and how to continue. Read this
first in a new session, then `plan/schedule.md`.

## What exists

- **Site:** Quarto website, built into `docs/`, published by GitHub Pages
  (main branch, `/docs`): <https://henriksson-lab.github.io/course_cellbiology/>.
  Repo: `henriksson-lab/course_cellbiology`, remote over HTTPS with `gh`
  credentials (`gh auth setup-git`); SSH keys are not available to Claude's shell.
- **Built lecture units (19), each with slides, quiz, study questions, demo:**
  cell-tour, microscopy, cell-methods · membrane-structure, membrane-transport,
  ion-channels · protein-sorting, er, golgi-secretion, endocytosis-lysosomes,
  protein-lifecycle, organelles-homeostasis · signalling-principles, gpcr,
  kinase-signalling, fate-signalling · actin, microtubules, myosin-if.
- **Mitochondria completed:** `mitochondria/` now includes study questions and
  image credits, and `demos/src/mitostress/` is enabled. The section is included
  in the site and sidebar. Inheritance, energetic estimates and mitochondrial
  donation explanations were corrected; the demo starts at 1× assay time.
- **Second session added:** cell-cycle-control, mitosis, cell-numbers, apoptosis,
  regulated-necrosis, cancer, disease-casebook (all with demos), so 27 of 28
  lectures are complete including mitochondria.
- **Not built:** `drug-journey` (capstone). Its worker was also stopped by
  safeguards before writing any files; sidebar entry removed. It remains outside this completion batch.
- **Bioinformatics modules:** eight modules are linked to their teaching blocks,
  following `plan/bioinformatics.md`. Use “module”, not “day”. Each module has a
  short overview and separate browser/report pages, downloadable student R Markdown
  templates and dated data snapshots. Solutions remain in source control, excluded
  from published downloads. Page front matter uses `engine: markdown` and explicit
  `resources:`; never add a wildcard that publishes solution files.

## Key planning docs

| File | What |
|---|---|
| `courseplan.md` | Syllabus summary, verbatim ELOs 1–19, exam rules |
| `audience.md` | Biomedicine programme (MGBIO), prior/later courses, what students know (now also: command line + R) |
| `elo.md` | ELO → block mapping |
| `contentplan.md` | All 28 lectures: content, MBoC 7th ed. chapter, "Why it matters" |
| `designprinciples.md` | Rules for material |
| `plan/lecture-brief.md` | Spec for building one lecture unit (files, slide skeleton, picture/licence rules, colour key incl. ions, screenshot tool, sidebar demo links) |
| `plan/parallel-round.md` | Rules for parallel workers (what each may write, shared-repo build/render rules, report format) |
| `plan/demos.md` | Demo principles (incl. 1× real time, no flashing) + one demo per lecture (section 5) |
| `plan/schedule.md` | Lecture order by block and build status |
| `plan/bioinformatics.md` | The 8 bioinformatics modules |

## Decisions by the course author (keep to these)

- Folders/files never named by week or day; order lives only in `_quarto.yml`.
  Lectures refer to each other by topic, never by number.
- Don't over-plan; make material and refactor later. No calendar scheduling.
- Out of scope for this repo: revision, exam, labs (module 3), module 2 (oral
  presentations, seminars, group problem solving, poster).
- English only (no Swedish translations). Glossary is `dictionary.qmd`.
- Lectures ~45 min (15–19 content slides), ≥ 50 % slides with a picture, real
  images only with free licences (Wikimedia Commons, checked via API), never
  textbook figures. Every lecture ends with "Why it matters" (drug, drug
  delivery or disease).
- Image credits are central: each unit has `<unit>/_credits.md` (no YAML), all
  included by `credits.qmd` with an anchor per unit; slides link
  `../credits.qmd#<unit>`.
- Demos: each lecture has one, linked in the sidebar as "Demo: …" under its
  lecture (`<unit>/questions.qmd#explore`). Animations start at **1× real time**,
  faster only by choice, no flashing. WebGL allowed. Must work offline from
  `file://` (no CDN, no fetch).
- Experimental run: each block gets a **bioinformatics module** (no lecture;
  step-by-step browser + R). Any R is done in **R Markdown** (knit to HTML) to
  train report writing instead of Excel.
- Commit and push when a batch is done; no LLM attribution in commit messages.
  `authors.md` keeps its note that an LLM was used.

## How to build and check

```sh
make            # build demos, render site into docs/, git add
make demos      # build demos (skips folders with DRAFT); one demo: demos/build.sh <name>
make typecheck  # TypeScript check of demos
make preview    # live preview
node --experimental-websocket tools/shoot-slides.mjs docs/<unit>/lec.html <outdir>
                # screenshots every slide, reports overflow (Node 20 needs the flag)
```

After a push, check the Pages run: `gh run list -R henriksson-lab/course_cellbiology -L 1`.

## How the last rounds were run

- One general-purpose agent per lecture (lecture + its demo), prompt = unit slug,
  contentplan section, neighbours to avoid overlapping, demo row from
  `plan/demos.md`, and "follow `plan/parallel-round.md`". Workers do not edit
  `_quarto.yml`, `dictionary.qmd` or `credits.qmd`; the coordinator adds sidebar
  entries, glossary entries and credits sections from their reports, then runs
  the full render, the overflow check on every new deck, commits and pushes.
- Lessons: give each worker **its own scratch subfolder** (one worker overwrote
  others' scratch files and killed processes by pattern); Wikimedia Commons
  rate-limits many parallel workers (expect missing optional images);
  headless Chrome per-slide calls hang, use `tools/shoot-slides.mjs`.

## Open items / to check

- Drug-journey capstone lecture remains unbuilt (see above).
- Protein-atlas module: check the UniProt/HPA button labels by hand in a browser.
- Optional images not downloaded (Commons rate limits) are listed in the workers' units/credits notes (mitosis: ProphaseIF, fibroblast cytokinesis, meiosis I oocyte, H2B-GFP film; cancer: multipolar spindle, FDG-PET, microinvasive DCIS).
- Notch demo opens at 1× real time but the pattern needs time-lapse; students
  are told to pick a speed. Author may prefer opening in time-lapse.
- Optional image not downloaded (rate limit): clathrin cage cryo-EM for the
  Golgi coat slide, CC BY-SA 4.0,
  <https://commons.wikimedia.org/wiki/File:Clathrin_cage_viewed_by_croelectron_microscopy.jpg>.
- Workers flagged facts to verify in their units (e.g. ER Ca²⁺, HCM prevalence,
  Palade pulse-chase times, Na⁺/K⁺ pump ATP share, LNP composition). Not yet
  collected into one list.
- Cell-tour deck is at the 19-content-slide ceiling.
