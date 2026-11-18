# Cell Biology (3MB001): course site sources

Teacher information. This file is not part of the published site.

- Planning: [courseplan.md](courseplan.md) (syllabus), [audience.md](audience.md),
  [elo.md](elo.md), [contentplan.md](contentplan.md),
  [designprinciples.md](designprinciples.md), [plan/](plan/).
- Each lecture is one folder (topic slug, never a week or day number): `lec.qmd`
  (slides), `quiz.qmd`, `questions.qmd` (study questions), `credits.md` (image
  sources and licences), and its figures. Order lives only in `_quarto.yml`.

## Building this site

```bash
make           # render the whole site to docs/
make preview   # start a live-reload preview server
make clean     # delete docs/ and the Quarto cache
```

You need [Quarto](https://quarto.org/docs/get-started/). No R or Python.
