# Build-out plan: 3MB001

Working tracker for setting up the site from the 3MB00A scaffold and building the
lectures. Internal doc; `plan/` is excluded from the rendered site.

Scaffold source: `/home/mahogny/github/course/quantbio-3MB00A`

## Phase 0: Copy the scaffold (no programming)

**Copy as is or lightly adapt:**

| From 3MB00A | Action |
|---|---|
| `_quarto.yml` | Copy; new title, empty sidebar with blocks A–H, same render globs and exclusions (drop `demos/` resources) |
| `theme.scss`, `styles.css`, `_further-reading-banner.html` | Copy unchanged (sidebar colours rely on `lec` / `quiz` filenames) |
| `Makefile` | Keep `render`, `preview`, `clean`, `gitadd`, `edit-slides`, `help`; drop `figs`, `demos`, `typecheck` |
| `.gitignore` | Copy; drop R and node lines that no longer apply |
| `tools/slide-editor/`, `edit-notes/README.md` | Copy unchanged (slide edit-notes workflow) |
| `canvas-quiz/build.py` | Copy; check it handles ELO tags; keep `canvas-quiz/private/` git-ignored |
| `plan/figure-qa-checklist.md` | Copy unchanged |
| `dictionary.qmd` | New content: cell biology glossary (English only) |
| `index.qmd`, `authors.md` | Rewrite for 3MB001 |
| `README.md` | Rewrite (build instructions without R) |

**Do not copy:** all topic folders, `demos/`, `node_modules/`, `package*.json`,
`warmups/`, `intro/install.qmd`, `CODE_AUDIT_CHECKLIST.md`, `docs/`, `videos/`
(make new ones only if lectures are recorded **[?]**), `mscprogram.md`
(replaced by the programme section of `audience.md`).

**Already written for 3MB001:** `courseplan.md`, `audience.md`, `elo.md`,
`contentplan.md`, `designprinciples.md`.

## Unit layout

One folder per lecture, flat kebab-case topic slug, no numbers (order lives only
in `_quarto.yml`, as in 3MB00A):

```
membrane-transport/
  lec.qmd         reveal.js slides, ~45 min, speaker notes on every slide
  quiz.qmd        5–8 self-check questions, each tagged [ELO n]
  questions.qmd   study questions: G-level + at least one VG-style question
  _credits.md     source + licence for every external image (included in credits.qmd)
  figNN-*.svg     our diagrams
  imgNN-*.jpg/png real images (licensed)
```

Proposed slugs: `cell-tour`, `microscopy`, `cell-methods`, `membrane-structure`,
`membrane-transport`, `ion-channels`, `protein-sorting`, `er`, `golgi-secretion`,
`endocytosis-lysosomes`, `protein-lifecycle`, `mitochondria`,
`organelles-homeostasis`, `signalling-principles`, `gpcr`, `kinase-signalling`,
`fate-signalling`, `actin`, `microtubules`, `myosin-if`, `cell-cycle-control`,
`mitosis`, `cell-numbers`, `apoptosis`, `regulated-necrosis`, `cancer`,
`disease-casebook`, `drug-journey`.

## Phase 1: First block (in progress)

Block A (`cell-tour`, `microscopy`, `cell-methods`) built first, following
[lecture-brief.md](lecture-brief.md). Review it before building the rest.

## Phase 2: Build the remaining blocks

In course order A, C, D, E, F, G, H. For each lecture:

- [ ] `lec.qmd` following the skeleton in designprinciples.md §4
- [ ] picture audit: a table in `plan/slides-image-audit.md` listing each slide,
      whether it has an image and why or why not; ≥ 50 % with an image, at least
      two real images per lecture
- [ ] figure QA on every SVG
- [ ] `_credits.md` complete
- [ ] `quiz.qmd` + `questions.qmd`, ELO-tagged
- [ ] glossary entries added

## Phase 3: Course-level pages

- [ ] Canvas quizzes built from `quiz.qmd`

## Decisions (2026-11-18)

- Files and folders are never named by week or day; order lives in `_quarto.yml`.
- Make material now and refactor later; don't over-plan.
- Design does not depend on whether lectures are live or recorded.
- Labs (module 3) and everything in module 2 (oral presentations, seminars, group problem solving, poster) are handled outside this repo. Lectures may refer to any standard lab method.
- Book chapter pointers: MBoC 7th ed. for now.
- Who teaches what is not our concern here.
- Revision and the exam are out of scope for this repo.
