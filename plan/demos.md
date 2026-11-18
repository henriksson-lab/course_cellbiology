# Interactive demos: plan

Status (2026-11-18): first batch built: infrastructure (`demos/`), the cell explorer
(`cell-tour/explore.qmd`), resolution (microscopy), flow cytometry gating (cell methods);
dose–response is built but not embedded. See [demos/README.md](../demos/README.md). Read with
[designprinciples.md](../designprinciples.md), [audience.md](../audience.md) and
[contentplan.md](../contentplan.md). Lectures are named by topic, as in the slides.

## 1. Principles

**Build a demo only if it improves understanding.** A demo earns its place when the
concept is **spatial** (where is it, how big), **dynamic** (what happens over time)
or **quantitative** (what changes when I change this), and a static slide cannot
show the cause-and-effect. The student must **do something and see a
consequence**: move a slider, draw a gate, click an organelle, add a drug. A demo
that only animates what the slide already says is decoration: do not build it.

Further rules:

- **A simple model that is correct enough not to mislead.** Use textbook equations
  where they exist (Rayleigh, Nernst/GHK, binding isotherm, Michaelis–Menten,
  diffusion). Where the model is a caricature (cell-cycle oscillator, signalling
  cascade), say so on the demo ("illustrative numbers, simplified network"), as
  design principle 8 asks.
- **Tied to an ELO and to questions.** Every demo comes with 2–4 short tasks
  ("Set …, what happens to …? Why?") tagged `[ELO n]`, at least one VG-style
  (predict before you move the slider). Without tasks, students play and learn little.
- **A drug knob where it fits.** Most lectures end with a drug; a demo that lets
  the student add the drug (venetoclax, taxol, an antagonist, an SGLT2 inhibitor)
  links mechanism to "Why it matters".
- **Static, offline, no server.** The site is static Quarto on GitHub Pages. No
  backend, no CDN, no `fetch` of JSON (fails on `file://`): bundle data into the JS,
  load images only via `<img>`/tiles. Works when `docs/*.html` is opened from disk.
- **Laptop first, phone usable.** Pointer events (mouse and touch), no hover-only
  information, controls ≥ 44 px on touch, layout that wraps below ~600 px.
- **Licensing.** Only data we may republish on a public site: our own, CC0, public
  domain, CC BY, CC BY-SA (record in the unit's `_credits.md`, as for images). No NC/ND.
  Libraries bundled into the demo must be MIT/BSD/Apache.
- **Colours** follow the shared colour key in `plan/lecture-brief.md` (ER teal,
  mitochondria red, Golgi orange, …), so a demo and the slide diagrams agree.

### Infrastructure: reuse 3MB00A

Copy the sister course's setup (`/home/mahogny/github/course/quantbio-3MB00A/demos/`):

- `demos/src/<name>/main.ts` → `demos/dist/<name>.js` (esbuild, IIFE, so it runs from
  `file://`), `demos/build.sh`, `demos/demo.css`, shared helpers in
  `demos/src/lib/ui.ts` (slider, button, checkbox, presets, draggable, seeded `rng`,
  `autoMount` on `data-demo="<name>"`). Copy `lib/ui.ts` and `demo.css` as they are;
  rename the CSS prefix only if it clashes.
- `package.json` (esbuild + typescript), `Makefile` targets `demos` (and `render: demos`)
  and `typecheck`; `_quarto.yml`: `resources: [demos/dist/]` and `"!demos/"` in
  `render` (`"!node_modules/"` is already there).
- Big static assets (EM tiles) go in `demos/assets/<name>/`, also listed under
  `resources`. Git stores identical files once, so the copy in `docs/` costs no
  extra repository space.
- Rules from 3MB00A to keep: fixed random seeds; give the keyboard back to reveal.js
  (never bind arrows/space); slide size ~1150×560 px, labels ≥ 18 px; a reset/preset
  button; per-embed settings from `data-*` attributes so one demo serves several
  lectures; keep the static figure as the print/PDF fallback.

### Where a demo goes

- **In the slides** (one raw-HTML block replacing or next to the static figure), when
  the lecturer will use it live: small, fast, one or two controls.
- **On a page**, as an `## Explore {#explore}` section at the end of the unit's
  `questions.qmd` (the 3MB00A pattern: short intro, the embed, then tasks E1, E2 …).
  Large demos (the EM explorer) get their own `explore.qmd` in the unit and a sidebar
  entry "Explore".
- **Both** for most demos: a reduced preset in the slide, the full version with tasks
  on the page. A slide can also just link to the page ("Open the explorer").

## 2. Spec: zoomable annotated EM cell ("Cell explorer")

**Lecture:** A tour of the cell (main), reused in microscopy (what EM shows), the
organelle lectures (ER, Golgi, endocytosis/lysosomes, mitochondria, organelles
compared) and microtubules (centrosome). ELO 1, 5.

**Teaches:** the real scale and crowding of a cell; what each organelle *looks like*
in EM (texture, membrane count, size), which the cartoon map cannot teach; that a
diagram is a simplification. The quiz mode trains recognition of organelles in EM,
which is directly examinable.

> **Decision (2026-11-18):** no deep zoom. Use **one** moderate-resolution
> image of the HeLa slice (about 3000–4000 px wide, a few MB at most), shown with
> simple pan/zoom (CSS transform on a plain `<img>` plus an SVG overlay). No tile
> pyramid and no OpenSeadragon. The rest of the spec (layers, click info, scale
> bar, quiz mode) stands. All other ideas in section 3 are approved.

### Data: what I checked (2026-11-18)

| Source | What exists | Licence (as verified) | Verdict |
|---|---|---|---|
| **OpenOrganelle / Janelia COSEM**, dataset `jrc_hela-2` (whole HeLa cell, FIB-SEM) | Public S3 bucket `janelia-cosem-datasets`, anonymous access works (I listed it and downloaded a chunk). EM as OME-Zarr `jrc_hela-2.zarr/recon-1/em/fibsem-uint8`, shape (z,y,x) = 6368 × 1600 × 12000 at 5.24 × 4 × 4 nm, pyramid levels s0–s5. **Whole-cell ML segmentations** in `jrc_hela-2.n5/labels/*_seg` (uint16 instance labels, same grid, levels s0–s4) for 28 classes: nucleus, nucleolus, nuclear envelope, nuclear pores, (hetero/eu)chromatin, ER, ER exit sites, Golgi, mitochondria (+ membrane), endosomes, lysosomes, lipid droplets, vesicles, microtubules, centrosome, plasma membrane, ribosomes, extracellular space; plus contact-site layers (ER–mito, ER–PM …). Hand-annotated ground-truth crops also exist (`labels/groundtruth/crop*`). | **CC BY 4.0** per the AWS Open Data Registry entry (registry.opendata.aws/janelia-cosem). The OpenOrganelle site itself did not show a licence page to my fetch. Cite Heinrich et al., *Nature* 599:141 (2021) and Xu et al., *Nature* 599:147 (2021). | **Use this.** Large, real, already segmented, open. |
| Other OpenOrganelle cells | `jrc_macrophage-2`, `jrc_jurkat-1` (T cell) also have 28 `_seg` layers; `jrc_mus-pancreas-*`, `jrc_mus-liver*` and others exist (segmentation not checked). | same bucket, CC BY 4.0 | Second cell type later (e.g. pancreas acinar cell for the secretory pathway). |
| **EMPIAR** (EMBL-EBI) | Raw EM datasets, many volume EM; segmentations only for some entries. | **CC0** (EMPIAR policies page). | Backup; more work to find a segmented whole cell. |
| **Cell Image Library** | Many classic TEMs. | **Per image**: public domain, CC BY or CC BY-NC-SA (CIL licence page). Check every image; NC is excluded. | Single images only; no segmentations. |
| **Wikimedia Commons** | Classic TEMs already in our decks: `Pancreatic acinar cells - TEM.jpg` (Louisa Howard, public domain) is only **640 × 480 px**; `Human B Lymphocyte (28942386960).jpg` (NIAID, CC BY 2.0) is 2624 × 2936 px. | as stated | Too small for deep zoom; fine for a cheap "label this TEM" quiz with our own hand-drawn outlines. |

Caveats: the `_seg` layers are machine predictions, not ground truth: they will have
errors and need a teacher check of the chosen plane. FIB-SEM contrast differs a bit
from classic thin-section TEM; say so in one sentence on the page. I did not verify
whether the COSEM EM is displayed with TEM-like (dark membranes) contrast; check on
the first extracted plane and invert if needed.

### Which image

One 2D plane through `jrc_hela-2` **parallel to the coverslip** (fixed y, i.e. an x–z
plane: up to 12000 × 6368 px ≈ 48 × 33 µm), chosen through the nucleus so that the
nucleus, a Golgi, many mitochondria, ER, lysosomes and lipid droplets are all in it.
Resample z (5.24 nm) to square pixels. Two resolution options:

- **8 nm/px** (from s1, ~6000 × 3200 px): ribosomes ~3 px, mitochondrial cristae and
  Golgi cisternae clearly visible. Tile pyramid about **3–5 MB** (JPEG q≈80; estimate,
  measure on the real plane).
- **4 nm/px** (s0, ~12000 × 6400 px): ER membranes and ribosomes crisp; about
  **10–15 MB**.

Start with 8 nm/px, crop to the cell's bounding box; go to 4 nm only if the zoomed
view looks too soft. **Budget: ≤ 20 MB for this demo** (the whole `docs/` is now
11 MB; GitHub Pages sites should stay under 1 GB, single files < 100 MB).
Stretch goal: 3–5 planes 1 µm apart with a "depth" slider (×3–5 the size), which
shows that a section is a slice through 3D organelles (a mitochondrion that looks like
a dot in one plane is a tube in the next).

### Pipeline (one-off script, run by hand, outputs committed)

`tools/em-explorer/` (Python, run once, not part of `make`):

1. Read the EM plane and the label planes for the chosen classes from S3
   (zarr/tensorstore, anonymous). Reading one full-resolution plane touches a
   slab of chunks (~1–3 GB download at s0, less at s1), so cache locally.
2. Write the image as a deep-zoom pyramid (`vips dzsave`, JPEG tiles 256 px; `vips` is
   not installed here, `pyvips` or a small Pillow tiler also works).
3. For each class: mask → contours → simplify (Douglas–Peucker, ~1–2 px) → polygons in
   image-pixel coordinates; drop tiny fragments; keep instance ids. Ribosomes and
   vesicles are too many and too small for polygons: show them as a raster overlay or
   leave them out.
4. Emit `annotations.ts`:
   `{ nmPerPx, width, height, classes: [{ id, name, colour, lecture, href, text }], shapes: [{ cls, inst, rings: [[x,y],…][] }] }`.
   Text (2–3 sentences per organelle: what it is, how to recognise it in EM, which
   lecture) is written by hand in a separate `classes.yaml`.
5. Teacher QA: look at every class overlay; delete wrong shapes; fix by hand if needed.

### Viewer

- **Library:** OpenSeadragon 6.1.1 (BSD-3-Clause, on npm, built for deep-zoom
  images, pinch/zoom on touch, navigator mini-map). Bundle it with esbuild like our own
  code (no CDN). Alternative: Leaflet 1.9.4 (BSD-2-Clause) with `CRS.Simple`, which has
  vector layers, layer toggles and click events built in. Both are fine; choose
  OpenSeadragon for image quality and the mini-map, and draw the overlay ourselves as
  one SVG kept in sync with the viewport (~150 lines).
- **`file://` traps:** give OpenSeadragon the tile source as an inline object (not a
  `.dzi` URL, which it would fetch), and use the HTML or canvas drawer, not WebGL
  (WebGL needs CORS-clean images, which `file://` tiles are not). Test both from disk
  and from GitHub Pages.
- **Interaction:**
  - Layer toggles, one per organelle (checkbox in the organelle's colour), plus "all
    outlines" and "labels on/off"; outline only by default, fill at 25 % on hover/tap.
  - Click/tap an organelle → side panel: name, 2–3 sentences, "how to recognise it in
    EM", and a link to the lecture page that covers it.
  - Scale bar that updates with zoom (nm per screen pixel → nearest 1–2–5 length, e.g.
    "500 nm", "2 µm"), and a zoom readout "field of view: 12 µm".
  - Size references (optional toggle): a 25 nm ribosome dot, a 200 nm "light
    microscope limit" circle, a 1 µm bacterium outline, to connect to the scale ladder
    and the resolution slide.
  - **Quiz mode:** outlines hidden; prompt "Find a lysosome" (10 rounds, random but
    seeded); tap → right/wrong + the correct outline flashes; hint after a miss; score
    at the end. Second quiz type: an outline is shown, "What is this?" with 4 choices.
    No server, score stays on the page.
- **In the slides:** a static screenshot of the explorer with outlines, plus a link
  "Open the cell explorer" to `cell-tour/explore.qmd`. Embedding the live viewer in a
  reveal.js slide is optional and risky (reveal scales slides with a CSS transform,
  which can break pointer coordinates in tile viewers; wheel and keyboard capture), so
  try it only after the page version works.

### Effort and risks

Effort **L**: ~1 day data extraction and tiling, ~1 day viewer and overlay, ~1 day
quiz mode, organelle texts and teacher QA. Risks: segmentation errors in the chosen
plane (mitigate: pick the plane by eye, hand-fix); polygon count too high for smooth
SVG on phones (mitigate: simplify more, raster overlay at low zoom); repository size
creep if several planes or cells are added (keep the 20 MB budget per demo); the
licence statement comes from the AWS registry, so re-check on the dataset's own page or
DOI before publishing and credit it in `cell-tour/_credits.md`.

## 3. Other demo ideas, ranked

Ranked by value for understanding per unit of effort. Effort: S ≈ ½–1 day, M ≈ 2–3
days, L ≈ a week.

1. **Resting potential (Nernst/GHK)** · Ion channels and membrane potential · ELO 2.
   *Does:* sliders for inside/outside K⁺, Na⁺, Cl⁻ and relative permeabilities; presets
   "resting neuron", "high extracellular K⁺", "open Na⁺ channels". *Sees:* each ion's
   Nernst potential as a line, the GHK membrane potential as a moving marker, arrows
   for net flow. *Model:* Nernst and GHK, exact. **S.** Highest value: the core
   quantitative idea of the block, and the `ion-channels/` unit is being written now.
2. **Resolution and the diffraction limit** · Microscopy · ELO 1, 6. *Does:* drag two
   point sources together; sliders for wavelength and NA; switch light ↔ electrons.
   *Sees:* Airy discs merging, Rayleigh d = 0.61 λ/NA readout, "resolved / not
   resolved". *Model:* Airy pattern, exact. **S.**
3. **Dose–response with agonists and antagonists** · Principles of cell communication,
   GPCRs · ELO 3, 9. *Does:* choose full/partial agonist, add a competitive or
   non-competitive antagonist, change K_d. *Sees:* occupancy and response curves on a
   log axis, EC₅₀ shifting right (competitive) vs maximum falling (non-competitive).
   *Model:* binding isotherm, Gaddum/Schild; exact for simple receptors. **S.**
4. **Flow cytometry gating game** · Cell methods; reused in cell-cycle control (DNA
   content: G1/S/G2) and apoptosis (annexin V/PI) · ELO 1, 7, 8. *Does:* draw gates
   (FSC/SSC → live cells → marker), read percentages; a challenge "what fraction of
   cells is early apoptotic?". *Sees:* how gate placement changes the answer.
   *Data:* synthetic, seeded. **M.** Reuse code from the 3MB00A `compensation` demo.
5. **Cell explorer (EM)**, see section 2. **L**, very high value, reused in ~6 lectures.
6. **Diffusion vs distance** · A tour of the cell (numbers worth knowing); revisited in
   microtubules and motors · ELO 1, 6. *Does:* release a protein (or a vesicle) and pick
   a distance (bacterium, HeLa cell, 1 m axon). *Sees:* random walkers and t ≈ x²/2D:
   ms, seconds, years → why long cells need motors. *Model:* random walk, exact. **S.**
7. **Transporter saturation vs diffusion** · Transporters and pumps · ELO 2. *Does:*
   raise outside glucose; switch between simple diffusion, a uniporter and SGLT
   (Na⁺-coupled); add an SGLT2 inhibitor. *Sees:* linear vs saturating uptake curve,
   V_max and K_m; coupled transport goes uphill only while the Na⁺ gradient exists.
   *Model:* Fick, Michaelis–Menten. **S.**
8. **Microtubule dynamic instability** · Microtubules and motors · ELO 6. *Does:*
   tubulin concentration slider, add taxol or vinblastine. *Sees:* growing and
   shrinking microtubules from a centrosome, a kymograph, catastrophe/rescue counts;
   taxol freezes them, vinca stops growth. *Model:* two-state stochastic model
   (Dogterom–Leibler), qualitatively right; drug effects as parameter changes. **M.**
9. **Protein sorting "zip code" game** · Protein sorting, ER, Golgi, lysosomes ·
   ELO 4, 5. *Does:* build a protein from tags (ER signal peptide, transmembrane anchor,
   KDEL, NLS, mitochondrial presequence, PTS1, mannose-6-phosphate signal). *Sees:* its
   route animated on the cell map and where it ends; predict first, then run. *Model:*
   rule table; mark unrealistic combinations as such rather than inventing outcomes. **M.**
10. **BCL-2 balance and venetoclax** · Apoptosis · ELO 8, 9. *Does:* sliders for
    BH3-only "stress", BCL-2, BAX/BAK; add venetoclax. *Sees:* free BAX above a threshold
    → MOMP → cytochrome c → caspases, all-or-none; leukaemia cell with high BCL-2
    tipped by the drug. *Model:* titration/threshold, simplified and labelled so. **S–M.**
11. **FRAP** · Membrane structure · ELO 2. *Does:* bleach a spot on a membrane; sliders
    for diffusion coefficient and immobile fraction. *Sees:* the spot refill and the
    recovery curve; read D and mobile fraction off the curve. *Model:* 2D diffusion on a
    grid, exact. **S–M.**
12. **Confocal pinhole and optical sectioning** · Microscopy · ELO 1. *Does:* pinhole
    size slider on a side-view light-path diagram with beads at several depths. *Sees:*
    out-of-focus light blocked, thinner section but less signal. *Model:* geometric
    optics, qualitatively right. **M.**
13. **Fluorescence filter cube and bleed-through** · Microscopy · ELO 1. *Does:* choose
    fluorophores (DAPI, GFP, mCherry) and a filter set. *Sees:* spectra, what passes,
    bleed-through into the wrong channel. *Data:* spectra need a licence check (FPbase);
    fallback: smoothed approximate spectra labelled as such. **M.**
14. **Differential centrifugation** · Cell methods · ELO 1. *Does:* set g-force and
    time for successive spins. *Sees:* which organelles pellet, marker enzymes per
    fraction; a density-gradient mode. *Model:* sedimentation rate ∝ size² × density
    difference; ordering right, absolute times illustrative. **M.**
15. **Signalling amplification and switching off** · GPCRs, kinase cascades · ELO 3.
    *Does:* one receptor activated; toggle GTPase activity, phosphatase,
    phosphodiesterase; add a kinase inhibitor (imatinib) at one step. *Sees:* molecule
    counts per tier (gain), how fast the signal ends, where an inhibitor cuts it.
    *Model:* small ODE chain, illustrative numbers. **M.**
16. **Actin treadmilling** · Actin · ELO 6. *Does:* actin concentration slider, add
    latrunculin, cytochalasin or phalloidin. *Sees:* a filament adding at the plus end,
    losing at the minus end, a "speckle" moving through; steady-state treadmilling
    between the two critical concentrations. *Model:* end-specific on/off rates. **M.**
17. **Notch lateral inhibition** · Signalling that decides fates · ELO 3. *Does:* change
    feedback strength, add noise. *Sees:* a sheet of equal cells resolve into a
    salt-and-pepper pattern. *Model:* Collier et al. 1996, standard. **M.**
18. **Cell-cycle control with FUCCI** · Cell-cycle control · ELO 7, 9. *Does:* run a
    population; add a CDK4/6 inhibitor, DNA damage (p53), or a spindle poison. *Sees:*
    cyclin levels over time, FUCCI colours, where cells arrest, and the DNA-content
    histogram (links to demo 4). *Model:* phase-based caricature, labelled simplified;
    a full oscillator ODE risks false precision. **M–L.**
19. **Vesicle traffic map** · Golgi, endocytosis · ELO 4, 5. Clickable map of the
    secretory and endocytic routes with coat/Rab/SNARE per step; "block" buttons
    (brefeldin A, botulinum toxin, low lysosome pH). Mostly a navigable diagram:
    medium value. **M.**
20. **Drug journey** · Capstone · ELO 1–9. A stepped story (mRNA–LNP, then a kinase
    inhibitor) that links back into demos 5, 9 and 15 at each stop. Build last, from
    existing pieces. **L.**

Not recommended: an action-potential (Hodgkin–Huxley) simulator (correct but beyond
what the lecture needs; one slide covers it), and anything that only animates a
mechanism without a student choice.

## 4. First batch and build order

1. **Infrastructure + Nernst/GHK (1).** Copy the 3MB00A `demos/` setup, Makefile and
   `_quarto.yml` changes; build the first demo for the ion-channels unit while that
   unit is being written. Proves the pipeline end to end (slide embed + Explore section).
2. **Resolution (2).** Small; the microscopy unit is finished, so it drops straight in.
3. **Dose–response (3).** Small; serves the whole signalling block and the drug
   vocabulary of the programme.
4. **Cell explorer (5).** Start the data extraction in parallel with 1–3 (it is the
   long pole); publish as `cell-tour/explore.qmd` with a static screenshot and link in
   the deck.
5. **Flow cytometry gating (4).** Reused in three lectures (methods, cell cycle,
   apoptosis), so build it before those decks are written.

Next batch candidates: diffusion vs distance (6), transporter saturation (7),
microtubule dynamic instability (8), protein sorting game (9), BCL-2 balance (10).

## 5. One demo per lecture (agreed 2026-11-18)

Every lecture gets one main demo, with a sidebar entry "Demo: …". Built ones are
marked ✅, ones being built 🔨. "Model" says how faithful it is: *exact* means
textbook equations; *qualitative* means the behaviour is right and the page says
so. Reuse is encouraged (one engine, several lectures).

| Lecture (slug) | Demo | What the student does → sees | Model | Size |
|---|---|---|---|---|
| cell-tour | ✅ Cell explorer | Pan/zoom a real HeLa slice, toggle organelles, quiz | real data | done |
| microscopy | ✅ Resolution limit | Move two points, change λ/NA → resolved or not | exact (Airy) | done |
| cell-methods | ✅ Flow gating | Gate a blood sample → CD4/CD8 percentages | simulated data | done |
| membrane-structure | 🔨 FRAP lab | Bleach a spot among moving molecules → recovery curve, mobile fraction; cell fusion | 2D random walk | S–M |
| membrane-transport | 🔨 Uptake assay | Glucose via diffusion/GLUT/SGLT, particles + concentration view → line vs saturation, uphill only with Na⁺ gradient | Fick, M–M | M |
| ion-channels | 🔨 The cell battery | Concentrations and permeabilities → Nernst lines, membrane potential | exact (Nernst/GHK) | S |
| protein-sorting | Zip-code game | Build a protein from signals (signal peptide, NLS, presequence, PTS1, KDEL, TM) → predict, then watch its route on the cell map | rule table | M |
| er | Topology builder | Place signal sequence, stop-transfer and signal-anchor segments → protein inserts into the ER membrane; follow it to the cell surface (inside-out logic from the cell tour) | rules | M |
| golgi-secretion | Pulse-chase of cargo | Release a fluorescent cargo from the ER (RUSH-style) → watch it reach the Golgi and the surface; add blocks: 15 °C, brefeldin A, botulinum toxin (cleaved SNAREs) | qualitative compartment model | M |
| endocytosis-lysosomes | LDL receptor cycle | Receptors bind LDL, are endocytosed, release LDL in acidic endosomes and recycle; sliders: endosome pH, PCSK9, PCSK9 antibody, statin → LDL left in blood. Second tab: LNP escape vs endosome pH and lipid pKa | compartment ODE, qualitative | M |
| protein-lifecycle | Protein turnover | Set synthesis and degradation (half-life) → steady state and time to reach it; add bortezomib (proteasome block) or a PROTAC (extra degradation of one target) | exact (dP/dt = k_s − k_d·P) | S |
| mitochondria | Mito stress test | A Seahorse-style O₂ consumption trace; inject oligomycin, the uncoupler FCCP/DNP, then rotenone/antimycin → read basal, ATP-linked, maximal respiration; proton circuit animated | qualitative proton-circuit model; real assay logic | M |
| organelles-homeostasis | Cell explorer: measure mode | Reuse the explorer: estimate area fractions of organelles, compare with the table; compare pH and Ca²⁺ per compartment | real data | S (reuse) |
| signalling-principles | Dose–response (built, not yet linked) | Full/partial agonist, competitive/non-competitive antagonist → curve shifts, EC₅₀, efficacy | exact (occupancy) | done |
| gpcr | Amplification and switching off | Hormone pulse → G protein, cAMP, PKA levels over time; vary GTPase rate, PDE, arrestin; add cholera toxin (Gs stuck on) | ODE cascade, qualitative | M |
| kinase-signalling | Kinase cascade and drug targets | Three-level MAPK cascade → amplification and switch-like output; add an inhibitor at RTK, RAF or MEK; negative feedback switch (why one inhibitor can be weakened by feedback) | ODE, qualitative | M |
| fate-signalling | Notch lateral inhibition | A sheet of cells with Delta–Notch → salt-and-pepper pattern emerges; change coupling, knock out Notch | ODE on a grid (Collier model) | M |
| actin | Actin treadmilling and a lamellipodium | Actin concentration, capping protein, Arp2/3 → treadmilling filament, branched network pushes the edge; latrunculin/phalloidin | stochastic, qualitative | M |
| microtubules | Dynamic instability | Tubulin concentration, taxol, vinblastine → growing/shrinking MTs, kymograph, catastrophe counts. Tab 2: diffusion vs motor transport over an axon (why motors) | stochastic (Dogterom–Leibler) | M |
| myosin-if | Sarcomere | Change sarcomere length and Ca²⁺ → filament overlap, force (length–tension curve); add mavacamten | geometric + qualitative | S–M |
| cell-cycle-control | Cell-cycle clock with FUCCI | Cyclin/CDK oscillator drives FUCCI colours in a cell population; add a CDK4/6 inhibitor → cells pile up in G1; DNA-content histogram (reuses the flow engine) | ODE, qualitative | M |
| mitosis | Spindle checkpoint | Attach kinetochores by hand; one unattached kinetochore holds anaphase; taxol/monastrol → arrest; force anaphase early → missegregation (aneuploidy) | rules | M |
| cell-numbers | Growth, senescence, telomeres | A culture grows to confluence (contact inhibition); passage it → telomeres shorten → senescence (Hayflick limit); add telomerase or a growth-factor-independent mutation | agent-based, qualitative | M |
| apoptosis | BCL-2 balance and venetoclax | Stress (BH3-only), BCL-2, BAX/BAK sliders → all-or-none MOMP, cytochrome c, caspases; leukaemia cell with high BCL-2 + venetoclax | threshold model, qualitative | S–M |
| regulated-necrosis | Which death is it? | Treat cells with a stimulus, then with inhibitors (caspase inhibitor, necrostatin, ferrostatin, MCC950) and read markers (annexin V/PI, caspase-3, MLKL, lipid peroxides) → deduce the death type | rule table on real experimental logic | S–M |
| cancer | Clonal evolution under therapy | A tumour of cells accumulates mutations (hallmarks); start a targeted drug → response, then a resistant clone takes over; try combination or intermittent therapy | agent-based, qualitative | M |
| disease-casebook | Diagnose the defect | Clinical and cellular observations for a case → pick the broken process (folding, trafficking, channel, mitochondria, cilia), then the therapy type (small molecule, enzyme replacement, ASO, gene therapy) | case logic | S |
| drug-journey | Drug journey | Step through an mRNA–LNP and a kinase inhibitor from injection to effect on the cell map; each step links back to its lecture and demo | stepped story, reuses explorer | M–L |

Extra (no lecture of its own): **Diffusion vs distance** (random walkers; t ≈ x²/2D)
can be added to the cell tour and reused in microtubules.

Build order: demos for a block are built together with (or right after) that
block's lectures, so each lecture ships with its demo.
