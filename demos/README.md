# Interactive demos

Small TypeScript demos embedded in pages (and, where useful, slides). Not rendered by
Quarto (`demos/` is excluded); the built scripts in `demos/dist/` and the image assets
in `demos/assets/` are copied into `docs/` as project resources. The infrastructure is
copied from the sister course 3MB00A. Plan and rationale: [plan/demos.md](../plan/demos.md).

## Build

```sh
npm i              # once: installs esbuild + typescript into node_modules/
make demos         # build every demo into demos/dist/  (make render does this first)
demos/build.sh foo # build only demos/src/foo/
make typecheck     # tsc --noEmit (esbuild does not check types)
```

## Demos

| Demo | Where | What |
|---|---|---|
| `cellexplorer` | `cell-tour/explore.qmd` (own page; screenshot + link in the deck) | One FIB-SEM plane through a HeLa cell (OpenOrganelle jrc_hela-2) with organelle outlines: pan/zoom, layers, info per organelle, scale bar, "Find the organelle" quiz |
| `resolution` | `microscopy/questions.qmd#explore` (linked from "Magnification is not resolution") | Two Airy spots merging: distance, wavelength, NA, electrons; Rayleigh limit |
| `flowgate` | `cell-methods/questions.qmd#explore` (linked from "Reading a dot plot: gating") | Simulated blood sample: draw an FSC/SSC gate, read CD4/CD8 quadrants, check against the truth |
| `frap` | `membrane-structure/questions.qmd#explore` (linked from "How do we know? Membrane proteins move") | Thousands of molecules doing 2D random walks (WebGL); tap to bleach, recovery curve fitted with the exact circular-spot curve (mobile fraction, t½, D); immobile fraction, qualitative fluidity sliders, follow one molecule; Frye–Edidin cell-fusion mode |
| `uptake` | `membrane-transport/questions.qmd#explore` (linked from "How do we know? Uptake assays…") | Glucose and Na⁺ particles crossing the bilayer, GLUT or SGLT (4-state alternating-access cycle, detailed balance), side by side with the same model as concentrations and fluxes; pump/ouabain, outside Na⁺, gliflozin; seeded assay series with Michaelis–Menten fit |
| `cellbattery` | `ion-channels/questions.qmd#explore` (linked from "The voltage follows the most open channels") | Exact Nernst and GHK: voltage scale with E lines and Vm marker, concentrations and permeabilities, presets (rest, hyperkalaemia, Na⁺ channels open, lidocaine, CFTR); optional particle panel (`particles.ts`, off by default, removable) |
| `doseresponse` | not embedded yet (for the signalling lectures) | Occupancy and response curves; partial agonist, competitive and non-competitive antagonist |

## Layout

- `demos/src/<name>/main.ts`: one demo per folder; bundled to `demos/dist/<name>.js`
  as an IIFE (ES modules do not load from `file://`).
- `demos/src/lib/ui.ts`: shared helpers (sliders, buttons, dragging, seeded RNG, auto-mount).
- `demos/src/lib/particles.ts`: WebGL point renderer (Canvas2D fallback, no textures) and an
  animation loop with a fixed step that runs only while the demo is on screen and the tab is visible.
- Model code that needs no DOM (`frap/sim.ts`, `uptake/model.ts`, `uptake/sim.ts`, `cellbattery/model.ts`)
  can be bundled for Node with esbuild to check the numbers in the task solutions.
- `demos/demo.css`: shared styles (plus a section per demo), copied to `demos/dist/demo.css`.
- Data are imported in TS and bundled (`import data from "./x.json"`), never fetched.
  Large images live in `demos/assets/<name>/` and are loaded with a plain `<img>`
  (path from a `data-img` attribute), which works from `file://`.
- `demos/data-scripts/`: one-off Python scripts that made committed data (not run by
  `make`). The cell explorer: `cellexplorer_fetch.py` downloads the needed chunks to a
  scratch directory outside the repo (anonymous HTTPS, about 1 GB), then
  `cellexplorer_build.py --cache <dir> --preview <dir>` writes
  `demos/assets/cellexplorer/hela-plane.jpg` and `demos/src/cellexplorer/outlines.json`.
  Hand corrections after checking the outlines by eye are in `cellexplorer_fixes.json`.
  Run with `python3 -I` (numpy, opencv, numcodecs); downloaded data are untrusted and
  only decoded into numeric arrays.

## Embedding

In a `.qmd` (slide or page), one raw HTML block:

````md
```{=html}
<link rel="stylesheet" href="../demos/dist/demo.css">
<div data-demo="<name>" data-foo="..."></div>
<script src="../demos/dist/<name>.js"></script>
```
````

## Rules

- No network: no CDN libraries, no `fetch`. Plain DOM + SVG/canvas.
- Fixed random seeds (`rng(seed)` from `lib/ui.ts`), so a recording is reproducible.
- Give the keyboard back to reveal.js: use the `slider`/`button`/`checkbox` helpers,
  which blur themselves; never bind arrow keys or space.
- Pointer events for mouse and touch; no hover-only information; touch targets ≥ 44 px.
- Slides: fit in about 1150×560 px; labels ≥ 18 px; a reset or preset button. Keep the
  static figure in the deck as the fallback for PDF/print.
- Read per-embed settings from `data-*` attributes, so one demo serves several units.
- Colours of organelles follow the shared colour key in `plan/lecture-brief.md`.
