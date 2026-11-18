# Handover notes (2026-11-18)

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
- **Draft, not published:** `mitochondria/` (lec.qmd, quiz.qmd, figures; no
  questions.qmd or `_credits.md`) and `demos/src/mitostress/` (has a `DRAFT` file,
  so `demos/build.sh` skips it). Excluded in `_quarto.yml` (`"!mitochondria/"`) and
  not in the sidebar. The worker building it was stopped by Anthropic safeguards
  (flagged as bio); Claude must not finish that work itself. The user decides:
  finish by hand, another model, or `/feedback`.
- **Not built yet:** blocks "Cell cycle and cell death" (cell-cycle-control,
  mitosis, cell-numbers, apoptosis) and "Cell death and disease"
  (regulated-necrosis, cancer, disease-casebook, drug-journey). Demo ideas for
  each are in `plan/demos.md` section 5.
- **Bioinformatics days:** planned in `plan/bioinformatics.md` (one per block, 8 in
  total; browser steps + R Markdown templates knit to HTML; APIs checked
  2026-11-18). None built. Suggested pilot: day 1 `bioinfo-protein-atlas/`.

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
| `plan/bioinformatics.md` | The 8 bioinformatics days |

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
- Experimental run: each block gets a **bioinformatics day** (no lecture;
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

- Mitochondria draft (see above).
- Notch demo opens at 1× real time but the pattern needs time-lapse; students
  are told to pick a speed. Author may prefer opening in time-lapse.
- Optional image not downloaded (rate limit): clathrin cage cryo-EM for the
  Golgi coat slide, CC BY-SA 4.0,
  <https://commons.wikimedia.org/wiki/File:Clathrin_cage_viewed_by_croelectron_microscopy.jpg>.
- Workers flagged facts to verify in their units (e.g. ER Ca²⁺, HCM prevalence,
  Palade pulse-chase times, Na⁺/K⁺ pump ATP share, LNP composition). Not yet
  collected into one list.
- Cell-tour deck is at the 19-content-slide ceiling.
