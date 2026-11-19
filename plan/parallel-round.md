# Instructions for one worker in a parallel build round

You build **one lecture unit and its demo**, while ~14 other workers build other
units in the same repo at the same time.

## Read first

1. `plan/lecture-brief.md`: files, slide format, pictures and licences, colour key,
   screenshots, checks. Follow it exactly.
2. `designprinciples.md`, `audience.md`, `elo.md`, and your lecture's section in
   `contentplan.md` (its content, MBoC chapter and "Why it matters").
3. `plan/demos.md`: section 1 (principles, including **1× real time by default,
   no flashing**) and your row in section 5 (the demo to build).
4. Finished units to match in style and quality: `membrane-transport/`,
   `ion-channels/` (slides, quiz, study questions, `_credits.md`, Explore section),
   and the demos in `demos/src/` (`uptake`, `cellbattery`, `frap`) plus
   `demos/README.md` for the infrastructure.

## What you own (write only here)

- `<unit>/`: `lec.qmd`, `quiz.qmd`, `questions.qmd` (with the demo as
  `## Explore {#explore}` at the end: tasks E1… with collapsed, checked solutions,
  ELO-tagged), `_credits.md` (no YAML header), `fig*.svg`, `img*.jpg`.
- `demos/src/<demo>/` for your demo (and only that folder; you may *import* from
  `demos/src/lib/` but do not change it; if you need a shared helper, copy it into
  your folder).
- On one slide in your `lec.qmd`, a short "**Try it:** [demo name](questions.qmd#explore)"
  link at the end of an existing bullet or line.

## Do NOT edit

`_quarto.yml`, `dictionary.qmd`, `credits.qmd`, `styles.css`, `demos/src/lib/`,
`demos/demo.css`, other units, other demos, plan files. The coordinator adds your
sidebar entries, glossary entries and credits section afterwards from your report.

## Scratch space and processes

- Use **only your own scratch subfolder**: `<scratchpad>/<unit>/` (create it). Never
  write to the scratchpad root or to other workers' folders.
- Never kill processes by pattern (`pkill -f …`, `killall`). Stop only processes
  you started, by their PID.
- Wikimedia Commons rate-limits many parallel workers (HTTP 429): batch API calls
  (several titles per request), wait and retry with back-off, and do not let a
  missing optional image block you; use a diagram instead and say so in the report.

## Building and checking in a shared repo

- Build only your demo: `demos/build.sh <demo>` (not `make demos`). Typecheck:
  `node_modules/.bin/tsc --noEmit -p demos` (errors in other workers' unfinished
  demos are not yours; only fix your own).
- Render only your own files: `quarto render <unit>/lec.qmd` (and quiz, questions).
  Never run a whole-site render or `make`. If a render fails because of a
  concurrent render (lock, missing site_libs, odd YAML errors), wait 20–60 s and
  retry.
- Your page will not be in the sidebar yet; Quarto may warn about that. Ignore it.
- Screenshots: `node --experimental-websocket tools/shoot-slides.mjs docs/<unit>/lec.html <your scratch dir>`;
  fix all overflow. For the demo page use headless Chrome with a fresh
  `--user-data-dir`, a timeout, and `--enable-unsafe-swiftshader` if you use WebGL;
  check desktop (1280) and phone (390) widths.
- Check solution numbers against the running model (models in pure TS files can
  be run in Node via esbuild, as the existing demos do).
- Do not commit.

## Final report (keep it short)

1. Files created.
2. Content slides; slides with a picture (diagram / real image).
3. Demo: what it does, the model and its stated simplifications, size.
4. Facts you were unsure about.
5. **Sidebar:** the section title for your unit and the demo name, e.g.
   `Unit: "The endoplasmic reticulum" · Demo: "Demo: topology builder"`.
6. **Glossary:** 8–15 entries, `**Term**: one-sentence definition.`


## Avoid permission prompts

Avoid commands that look destructive (`rm -rf`, `pkill`/`kill`, chained one-liners that
delete files, `curl | sh`). Delete only explicitly named files (e.g. Python `os.remove`
on listed paths). Stale files in `docs/` are cleaned by the coordinator.
