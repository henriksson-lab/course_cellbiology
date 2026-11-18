# Cell Biology (3MB001): course site sources

Teacher information. This file is not part of the published site.

- Planning: [courseplan.md](courseplan.md) (syllabus), [audience.md](audience.md),
  [elo.md](elo.md), [contentplan.md](contentplan.md),
  [designprinciples.md](designprinciples.md), [plan/](plan/).
- Each lecture is one folder (topic slug, never a week or day number): `lec.qmd`
  (slides), `quiz.qmd`, `questions.qmd` (study questions), `_credits.md` (image
  sources and licences), and its figures. Order lives only in `_quarto.yml`.
- Each teaching block also has a `bioinfo-<topic>/` module with focused browser
  and report pages, a student R Markdown template and dated data snapshots.
  Worked solution reports stay in the repository and are excluded from published
  resources. See [plan/bioinformatics.md](plan/bioinformatics.md).

## Building this site

```bash
npm i          # once: installs esbuild + typescript for the demos
make           # build the demos, render the whole site to docs/
make preview   # start a live-reload preview server
make demos     # build only the interactive demos (demos/src/ -> demos/dist/)
make typecheck # type-check the demo TypeScript
make clean     # delete docs/ and the Quarto cache
```

You need [Quarto](https://quarto.org/docs/get-started/) and Node.js (for the demos;
see [demos/README.md](demos/README.md)). No R. Python is only needed to re-run the
one-off data scripts in `demos/data-scripts/`.
