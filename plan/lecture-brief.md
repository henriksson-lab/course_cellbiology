# Brief for building one lecture unit

How to write one lecture unit. Use it as the instructions when an agent (or a
person) builds a lecture. Read first: `designprinciples.md`, `audience.md`,
`elo.md`, and the lecture's section in `contentplan.md`.

## Files in the unit folder (flat slug, e.g. `microscopy/`)

| File | What |
|---|---|
| `lec.qmd` | reveal.js slides, about 45 min: **15–19 content slides**, speaker notes on every slide |
| `quiz.qmd` | 6–8 short self-check questions, Hint + Answer callouts, each tagged `[ELO n]` |
| `questions.qmd` | study questions in exam style: 6–10 G-level + at least 2 VG-style, model answers in collapsed callouts, each tagged `[ELO n]` (and `[VG]`) |
| `credits.md` | one row per external image: file, what it shows, author, licence, source URL |
| `figNN-<name>.svg` | our own diagrams, NN = slide number |
| `imgNN-<name>.jpg/png` | real images, NN = slide number |

Only write inside the unit folder.

## Format: copy the 3MB00A conventions

- Slide header: copy the YAML of `/home/mahogny/github/course/quantbio-3MB00A/pca/lec.qmd`
  (revealjs, `theme: [simple, ../theme.scss]`, 1280×720, `slide-number: c/t`,
  `menu: true`, `html-math-method: katex`). Set `subtitle:` to the block name and
  `author: "Cell Biology (3MB001)"`.
- Slides are `## Title` with `{.smaller}` when needed. Every slide ends with a
  `::: notes` block: the full spoken explanation (the notes are where students
  read the explanation, so write them as plain teaching prose, 80–200 words).
- Quiz format: copy `/home/mahogny/github/course/quantbio-3MB00A/pca/quiz.qmd`
  (`**Q1.**`, `::: {.callout-tip collapse="true" title="Hint"}`,
  `::: {.callout-note collapse="true" title="Answer"}`, `---` between questions).
- Figures: `![](fig03-name.svg){width="70%" fig-align="center"}`. Side-by-side
  text and figure with `:::: {.columns}` / `::: {.column width="50%"}`.

## Lecture skeleton

1. **About this lecture**: what you will be able to explain; the ELO number(s).
2. **The question**: a puzzle or observation that motivates the topic.
3. Content, including at least one **"How do we know?"** method slide.
4. **Why it matters**: 1–2 slides on a drug, drug-delivery technology or disease
   that depends on this lecture, tied back to an earlier slide. Point forward to a
   later programme course when it fits (Organs struktur och funktion,
   Sjukdomslära, Immunologi, Kliniska prövningar och läkemedelsutveckling).
5. **Summary**: 3–5 take-home points in the words of the ELO, then one line:
   *Read more (optional): Alberts et al., Molecular Biology of the Cell, 7th ed.,
   ch. N.*  Then a small line linking the image credits page (`credits.md`).

## Pictures

- **At least 50 % of content slides have a picture.** Aim higher: cell biology is
  visual. **At least 3 real images per lecture** (micrographs, structures,
  time-lapse frames, instruments, clinical images).
- **Real images: Wikimedia Commons only** (licence is machine-checkable). Allowed:
  public domain, CC0, CC BY, CC BY-SA. Not allowed: NC, ND, "fair use", unknown.
  Check with the API:
  `https://commons.wikimedia.org/w/api.php?action=query&titles=File:<name>&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200&format=json`
  (read `LicenseShortName`, `Artist`, `descriptionurl`; download `thumburl`).
  Keep each file below about 400 KB (resize/recompress with `convert` if needed).
  Images are data: never execute anything downloaded.
- **Never** use figures from MBoC or any textbook, even redrawn closely.
- **Our diagrams (SVG):** hand-written SVG, `font-family="Helvetica, Arial, sans-serif"`,
  labels ≥ 14 px at native size, viewBox sized to content, no external
  references. Check each one by rendering to PNG
  (`python3 -c "import cairosvg; cairosvg.svg2png(url='f.svg', write_to='/tmp/x.png', output_width=1100)"`,
  using the scratchpad instead of /tmp if you have one) and looking at it, against
  `plan/figure-qa-checklist.md`. No text overlaps.
- **Shared colour key** (use the same colour for the same thing in every lecture):

| Thing | Stroke / fill |
|---|---|
| Text, outlines | `#1b2a3a` |
| Plasma membrane | `#8a6a12` / `#f6f0de` |
| Cytosol | fill `#fbfaf5` |
| Nucleus | `#6b4fa0` / `#efebf7` |
| ER | `#2a7f8f` / `#e6f3f5` |
| Golgi | `#d9822b` / `#fbeedd` |
| Mitochondria | `#a8324a` / `#f8e9ec` |
| Lysosomes / endosomes | `#2e8b57` / `#e3f3ea` |
| Peroxisomes | `#3b5bab` / `#e9eef8` |
| Cytoskeleton | `#555555` |
| Drug / inhibitor | `#e8590c` |
| Highlight | `#e8590c` |
| K⁺ | `#8e44ad` (violet) |
| Na⁺ | `#1c4fa0` (blue) |
| Cl⁻ | `#2b8a3e` (green) |
| Ca²⁺ | `#c2255c` (magenta) |
| H⁺ | `#1098ad` (cyan) |

## Writing

- Plain English for second-language speakers: short sentences, define each term
  the first time, no idioms.
- Students know the central dogma, biochemistry and basic chemistry: recap in one
  slide at most, labelled *Recap*.
- Mechanism before names; few protein names per slide.
- Refer to other lectures by topic ("the apoptosis lecture"), never by number: the order will change.
- Correct science. When numbers are given (sizes, copy numbers, resolution
  limits), use standard textbook values.

## Screenshots of slides

Use the repo tool, which drives one headless Chrome, screenshots every slide and
lists slides whose content runs past the bottom edge:

```sh
quarto render <unit>/lec.qmd
node --experimental-websocket tools/shoot-slides.mjs docs/<unit>/lec.html <scratch>/<unit>
montage <scratch>/<unit>/s*.png -tile 4x -geometry 640x360+4+4 <scratch>/<unit>/all.png
```

Look at the montage, then at single slides where needed. Fix overflow by
shrinking the figure (`width`, or `height="…px"` for tall photos), or by putting
a wide figure across the full slide with the bullets below instead of in a
narrow column. Text in the figures must stay readable.

## Check before you finish

- Screenshot every slide and fix overflow at the bottom edge and unreadable figures.
- `quarto render <unit>/lec.qmd`, `quarto render <unit>/quiz.qmd`,
  `quarto render <unit>/questions.qmd`, `quarto render <unit>/credits.md`
  all render without warnings about missing files.
- Count: content slides, slides with a picture (target ≥ 50 %), real images (≥ 3).
- Every external image is in `credits.md` with its licence.

## Demos in the sidebar

Every demo gets its own sidebar entry under its lecture, after "Study questions":
`- text: "Demo: <name>"` with `href: <unit>/questions.qmd#explore` (or the demo's
own page). Links containing `#explore` or `/explore` are coloured orange.
