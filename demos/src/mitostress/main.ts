// Mito stress test: a Seahorse-style O₂ consumption trace next to an animated proton
// circuit across the inner mitochondrial membrane. The student injects oligomycin, an
// uncoupler (FCCP, acts like DNP) and rotenone + antimycin A, in any order, and reads
// basal, ATP-linked, proton-leak, maximal and spare respiration and non-mitochondrial O₂ use.
// The circuit is a slowed illustration; the assay starts at 1× real time,
// one 6-minute measurement cycle per point, with optional faster playback.
// Model: model.ts (qualitative proton circuit; the analysis follows the real assay).
// Options (data-*): preset = healthy|complexI|metformin, seed.
import { autoMount, htmlEl, svgEl, button, presets, slider, checkbox, rng } from "../lib/ui";
import * as M from "./model";

const MITO = "#a8324a", MITOFILL = "#f8e9ec", INK = "#1b2a3a", HPLUS = "#1098ad", DRUG = "#e8590c";
const ELEC = "#c99700";
const POINT_EVERY = 360;        // seconds per six-minute assay cycle at 1×
const PHASES_MAX = 4;
const DRUG_LABEL: Record<M.Drug, string> = { oligo: "oligomycin", unc: "FCCP", rotaa: "rotenone + antimycin A" };
const DRUG_SHORT: Record<M.Drug, string> = { oligo: "oligomycin", unc: "FCCP", rotaa: "rot/AA" };

const CSS = `
.qb-demo.ms { display: block; }
.ms .ms-top { display: flex; flex-wrap: wrap; gap: .5em 1em; align-items: center; margin-bottom: .6em; }
.ms .ms-row { display: flex; flex-wrap: wrap; gap: 1em; }
.ms .ms-box { flex: 1 1 360px; min-width: 0; max-width: 580px; display: flex; flex-direction: column; gap: .45em; }
.ms .ms-title { font-weight: 600; font-size: .95em; }
.ms .ms-svg { width: 100%; height: auto; display: block; border-radius: 6px; }
.ms .ms-trace { border: 1px solid #dde; }
.ms .ms-status { min-height: 1.4em; font-size: .92em; }
.ms .ms-ports { display: flex; flex-wrap: wrap; gap: .4em; }
.ms .ms-ports .qb-btn { min-height: 40px; border-color: ${DRUG}; font-weight: 600; }
.ms .qb-btn:disabled { opacity: .45; cursor: default; }
.ms .qb-presets .qb-btn { min-height: 36px; }
.ms .ms-bars { display: grid; grid-template-columns: auto 1fr 4.2em; gap: .2em .5em; align-items: center; font-size: .88em; }
.ms .ms-bar { height: .85em; border-radius: 2px; min-width: 1px; }
.ms .ms-barwrap { background: #f1f3f5; border-radius: 2px; position: relative; height: .85em; }
.ms .ms-val { text-align: right; font-variant-numeric: tabular-nums; }
.ms .ms-state { font-size: .92em; font-variant-numeric: tabular-nums; }
.ms .ms-table { border-collapse: collapse; font-size: .9em; width: 100%; font-variant-numeric: tabular-nums; }
.ms .ms-table td { padding: .2em .45em; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
.ms .ms-table td:nth-child(2) { text-align: right; white-space: nowrap; font-weight: 600; }
.ms .ms-table td:nth-child(3) { color: var(--qb-muted); font-size: .9em; }
.ms .ms-sw { display: inline-block; width: .8em; height: .8em; border-radius: 2px; margin-right: .35em; vertical-align: -.05em; }
.ms .ms-problems { margin: .3em 0 0; padding-left: 1.2em; font-size: .9em; color: #8a3b00; }
.ms .ms-lower { margin-top: 1em; }
.ms .ms-note { margin-top: .8em; }
@media (max-width: 640px) { .ms .ms-box { flex-basis: 100%; max-width: 100%; } }
`;
function injectCss() {
  if (document.getElementById("ms-style")) return;
  const s = document.createElement("style");
  s.id = "ms-style"; s.textContent = CSS;
  document.head.appendChild(s);
}

// colours of the parts of the trace (also the brackets and the table swatches)
const PART = { nonMito: "#868e96", atp: "#2b8a3e", leak: "#e8590c", spare: "#1c4fa0", basal: MITO };

autoMount("mitostress", host => {
  injectCss();
  host.classList.add("ms");
  const d = host.dataset;
  const seed = Number(d.seed) || 7;
  let preset = M.PRESETS.find(p => p.key === d.preset) ?? M.PRESETS[0];
  let cell: M.Cell = { ...preset.cell };
  let wellNo = 0;
  let noise = rng(seed);

  // ---- state of the well
  let phases: M.Phase[] = [];
  let drugs: M.Drugs = { ...M.NO_DRUGS };
  let clock = 0;                  // real seconds since the last trace point
  let dp = M.steady(cell, drugs).dp;
  let ghost: { pts: M.Point[]; label: string } | null = null;

  // ---- top row: presets, demand, reset
  const top = htmlEl("div", "ms-top", "", host);
  const pBtns = presets(top, M.PRESETS.map(p => ({ label: p.label, apply: () => { keepGhost(); preset = p; cell = { ...p.cell, demand: sDem.get() }; newWell(); } })));
  pBtns[M.PRESETS.indexOf(preset)].classList.add("active");
  button(top, "New well (same cells)", () => { keepGhost(); newWell(); });

  // ---- left: trace
  const row = htmlEl("div", "ms-row", "", host);
  const boxT = htmlEl("div", "ms-box", "", row);
  htmlEl("div", "ms-title", "O₂ consumption rate (OCR) of the cells in one well", boxT);
  const TW = 560, TH = 330, ML = 56, MR = 14, MT = 34, MB = 46;
  const tsvg = svgEl("svg", { viewBox: `0 0 ${TW} ${TH}`, class: "ms-svg ms-trace", role: "img", "aria-label": "Oxygen consumption trace" }, boxT);
  const TMAX = PHASES_MAX * M.CYCLES * M.CYCLE_MIN;
  const YMAX = 300;
  const X = (t: number) => ML + t / TMAX * (TW - ML - MR);
  const Y = (v: number) => TH - MB - Math.min(v, YMAX) / YMAX * (TH - MT - MB);
  const gShade = svgEl("g", {}, tsvg);
  const gAxes = svgEl("g", {}, tsvg);
  for (let v = 0; v <= YMAX; v += 50) {
    svgEl("line", { x1: ML, x2: TW - MR, y1: Y(v), y2: Y(v), stroke: "#eceef0" }, gAxes);
    const t = svgEl("text", { x: ML - 7, y: Y(v) + 5, "font-size": 14, "text-anchor": "end" }, gAxes);
    t.textContent = String(v);
  }
  for (let t = 0; t <= TMAX; t += 12) {
    svgEl("line", { x1: X(t), x2: X(t), y1: TH - MB, y2: TH - MB + 5, stroke: INK }, gAxes);
    const s = svgEl("text", { x: X(t), y: TH - MB + 20, "font-size": 14, "text-anchor": "middle" }, gAxes);
    s.textContent = String(t);
  }
  svgEl("line", { x1: ML, x2: TW - MR, y1: TH - MB, y2: TH - MB, stroke: INK, "stroke-width": 1.5 }, gAxes);
  svgEl("line", { x1: ML, x2: ML, y1: MT, y2: TH - MB, stroke: INK, "stroke-width": 1.5 }, gAxes);
  const xl = svgEl("text", { x: (ML + TW - MR) / 2, y: TH - 6, "font-size": 15, "text-anchor": "middle" }, gAxes);
  xl.textContent = "assay time (min)";
  const yl = svgEl("text", { x: 16, y: (MT + TH - MB) / 2, "font-size": 15, "text-anchor": "middle", transform: `rotate(-90 16 ${(MT + TH - MB) / 2})` }, gAxes);
  yl.textContent = "OCR (pmol O₂/min)";
  const gGhost = svgEl("g", {}, tsvg);
  const gParts = svgEl("g", {}, tsvg);
  const gData = svgEl("g", {}, tsvg);
  const status = htmlEl("div", "ms-status", "", boxT);
  const ports = htmlEl("div", "ms-ports", "", boxT);
  const portBtn: Record<M.Drug, HTMLButtonElement> = {
    oligo: button(ports, "Inject oligomycin", () => inject("oligo")),
    unc: button(ports, "Inject FCCP (uncoupler)", () => inject("unc")),
    rotaa: button(ports, "Inject rotenone + antimycin A", () => inject("rotaa")),
  };
  const ctrl = htmlEl("div", "ms-ports", "", boxT);
  let assaySpeed = 1;
  slider(ctrl, "Assay speed", 1, 240, 1, 1, v => { assaySpeed = v; }, v => v + "×");
  const cParts = checkbox(ctrl, "show the parts on the trace", true, () => drawTrace());

  // ---- right: proton circuit
  const boxC = htmlEl("div", "ms-box", "", row);
  htmlEl("div", "ms-title", "The proton circuit across the inner membrane (illustration)", boxC);
  const CW = 560, CH = 340;
  const csvg = svgEl("svg", { viewBox: `0 0 ${CW} ${CH}`, class: "ms-svg", role: "img", "aria-label": "Proton circuit: respiratory chain pumping protons, ATP synthase, leak and uncoupler" }, boxC);
  const MEM0 = 122, MEM1 = 162;
  svgEl("rect", { x: 0, y: 0, width: CW, height: MEM0, fill: "#fdf6f7" }, csvg);
  svgEl("rect", { x: 0, y: MEM1, width: CW, height: CH - MEM1, fill: MITOFILL }, csvg);
  svgEl("rect", { x: 0, y: MEM0, width: CW, height: MEM1 - MEM0, fill: "#ecc9d1" }, csvg);
  for (const y of [MEM0, MEM1]) svgEl("line", { x1: 0, x2: CW, y1: y, y2: y, stroke: MITO, "stroke-width": 2 }, csvg);
  const label = (x: number, y: number, txt: string, size = 15, anchor = "start", weight = "400", fill = INK, parent: Element = csvg) => {
    const t = svgEl("text", { x, y, "font-size": size, "text-anchor": anchor, "font-weight": weight }, parent);
    t.style.fill = fill; t.textContent = txt; return t;
  };
  const halo = (t: SVGTextElement) => { t.setAttribute("paint-order", "stroke"); t.setAttribute("stroke", "#fff"); t.setAttribute("stroke-width", "4"); t.setAttribute("stroke-linejoin", "round"); return t; };
  label(8, 20, "intermembrane space", 15, "start", "600", MITO);
  label(8, CH - 10, "matrix", 15, "start", "600", MITO);
  const gRes = svgEl("g", {}, csvg);   // H⁺ reservoir dots (number follows Δp)
  // the electron path
  const ePath: [number, number][] = [[70, 214], [70, 142], [132, 148], [182, 142], [228, 100], [272, 142], [272, 214]];
  svgEl("polyline", { points: ePath.map(p => p.join(",")).join(" "), fill: "none", stroke: ELEC, "stroke-width": 2, "stroke-dasharray": "4 4", opacity: 0.8 }, csvg);
  const cx = { I: 70, III: 182, IV: 272, ATP: 372, leak: 446, unc: 512 };
  const complex = (x: number, w: number, name: string) => {
    svgEl("rect", { x: x - w / 2, y: MEM0 - 16, width: w, height: MEM1 - MEM0 + 32, rx: 9, fill: "#fff", stroke: MITO, "stroke-width": 2.2 }, csvg);
    label(x, (MEM0 + MEM1) / 2 + 6, name, 18, "middle", "700", MITO);
  };
  complex(cx.I, 54, "I"); complex(cx.III, 50, "III"); complex(cx.IV, 46, "IV");
  svgEl("circle", { cx: 132, cy: 148, r: 11, fill: "#fff3bf", stroke: ELEC, "stroke-width": 2 }, csvg);
  label(132, 153, "Q", 13, "middle", "700");
  svgEl("circle", { cx: 228, cy: 100, r: 11, fill: "#fff3bf", stroke: ELEC, "stroke-width": 2 }, csvg);
  label(228, 105, "c", 14, "middle", "700");
  label(70, 232, "NADH", 14, "middle", "600");
  label(272, 232, "O₂ → H₂O", 14, "middle", "600");
  // ATP synthase: F0 ring in the membrane, stalk, F1 head in the matrix with a rotor
  svgEl("rect", { x: cx.ATP - 30, y: MEM0 - 4, width: 60, height: MEM1 - MEM0 + 8, rx: 12, fill: "#fff", stroke: INK, "stroke-width": 2 }, csvg);
  const ringStripes = svgEl("g", {}, csvg);
  const clipId = "ms-clip-" + Math.round(Math.random() * 1e6);
  const clip = svgEl("clipPath", { id: clipId }, csvg);
  svgEl("rect", { x: cx.ATP - 28, y: MEM0 - 2, width: 56, height: MEM1 - MEM0 + 4, rx: 10 }, clip);
  ringStripes.setAttribute("clip-path", `url(#${clipId})`);
  const stripes: SVGLineElement[] = [];
  for (let k = 0; k < 8; k++) stripes.push(svgEl("line", { y1: MEM0, y2: MEM1, stroke: "#adb5bd", "stroke-width": 5 }, ringStripes));
  svgEl("rect", { x: cx.ATP + 30, y: MEM0 + 2, width: 9, height: 82, fill: "#dee2e6", stroke: INK, "stroke-width": 1.2 }, csvg); // peripheral stalk
  svgEl("line", { x1: cx.ATP, x2: cx.ATP, y1: MEM1, y2: 196, stroke: INK, "stroke-width": 6 }, csvg);
  svgEl("circle", { cx: cx.ATP, cy: 222, r: 28, fill: "#fff", stroke: INK, "stroke-width": 2 }, csvg);
  const rotor = svgEl("g", {}, csvg);
  for (let k = 0; k < 3; k++) svgEl("circle", { cx: cx.ATP + 16 * Math.cos(k * 2.094), cy: 222 + 16 * Math.sin(k * 2.094), r: 7, fill: "#dee2e6", stroke: INK }, csvg);
  svgEl("line", { x1: 0, y1: 0, x2: 0, y2: -20, stroke: INK, "stroke-width": 4, "stroke-linecap": "round" }, rotor);
  const atpLab = label(cx.ATP, 272, "ATP synthase", 14, "middle", "600");
  const atpTxt = label(cx.ATP, 290, "", 13, "middle");
  void atpLab;
  // leak and uncoupler
  svgEl("rect", { x: cx.leak - 7, y: MEM0, width: 14, height: MEM1 - MEM0, fill: "#fdf6f7", stroke: MITO, "stroke-dasharray": "3 3" }, csvg);
  label(cx.leak, 196, "leak", 14, "middle", "600");
  const gUnc = svgEl("g", {}, csvg);
  label(cx.unc, 222, "FCCP", 14, "middle", "700", DRUG, gUnc);
  label(cx.unc, 238, "(uncoupler)", 13, "middle", "400", DRUG, gUnc);
  // drug marks
  const gOligo = svgEl("g", {}, csvg);
  svgEl("rect", { x: cx.ATP - 44, y: MEM0 + 8, width: 88, height: 24, rx: 5, fill: DRUG, opacity: 0.92 }, gOligo);
  label(cx.ATP, MEM0 + 25, "oligomycin", 13, "middle", "700", "#fff", gOligo);
  const cross = (x: number, y: number, parent: Element) => {
    svgEl("path", { d: `M${x - 13},${y - 13} L${x + 13},${y + 13} M${x + 13},${y - 13} L${x - 13},${y + 13}`, stroke: DRUG, "stroke-width": 5, "stroke-linecap": "round" }, parent);
  };
  const gRot = svgEl("g", {}, csvg);
  cross(cx.I, (MEM0 + MEM1) / 2, gRot); halo(label(cx.I, 252, "rotenone", 13, "middle", "700", DRUG, gRot));
  cross(cx.III, (MEM0 + MEM1) / 2, gRot); halo(label(cx.III, 252, "antimycin A", 13, "middle", "700", DRUG, gRot));
  // legend
  const gLeg = svgEl("g", {}, csvg);
  svgEl("circle", { cx: 120, cy: CH - 15, r: 5, fill: HPLUS }, gLeg); label(130, CH - 10, "H⁺", 14, "start", "600", INK, gLeg);
  svgEl("circle", { cx: 170, cy: CH - 15, r: 4, fill: ELEC }, gLeg); label(180, CH - 10, "e⁻ (each dot stands for many)", 14, "start", "400", INK, gLeg);
  const gDots = svgEl("g", {}, csvg);

  const st = htmlEl("div", "ms-state", "", boxC);
  htmlEl("div", "qb-note", "Proton currents (H⁺ per time, as % of the healthy resting pump rate):", boxC);
  const bars = htmlEl("div", "ms-bars", "", boxC);
  const barRow = (name: string, col: string) => {
    htmlEl("span", "", name, bars);
    const wrap = htmlEl("span", "ms-barwrap", "", bars);
    const b = htmlEl("span", "ms-bar", "", wrap); b.style.background = col; b.style.position = "absolute"; b.style.top = "0";
    const v = htmlEl("span", "ms-val", "", bars);
    return { b, v };
  };
  const bPump = barRow("pumped out by I, III, IV", HPLUS);
  const bAtp = barRow("back through ATP synthase", PART.atp);
  const bLeak = barRow("back through the leak", PART.leak);
  const bUnc = barRow("back through the uncoupler", DRUG);
  const runRow = htmlEl("div", "qb-presets", "", boxC);
  const bPause = button(runRow, "Pause", () => { paused = !paused; bPause.textContent = paused ? "Run" : "Pause"; if (!paused) kick(); });
  let paused = false;

  // ---- lower: results
  const lower = htmlEl("div", "ms-row ms-lower", "", host);
  const boxR = htmlEl("div", "ms-box", "", lower);
  htmlEl("div", "ms-title", "Results (calculated from the trace, as in a real assay)", boxR);
  const table = htmlEl("table", "ms-table", "", boxR);
  const tbody = htmlEl("tbody", "", "", table);
  const ROWS: { key: keyof M.Result; name: string; col: string; how: string; pct?: boolean }[] = [
    { key: "basal", name: "Basal respiration", col: PART.basal, how: "last basal point − non-mitochondrial" },
    { key: "atpLinked", name: "ATP-linked respiration", col: PART.atp, how: "last basal point − lowest point after oligomycin" },
    { key: "leak", name: "Proton leak", col: PART.leak, how: "lowest point after oligomycin − non-mitochondrial" },
    { key: "maximal", name: "Maximal respiration", col: PART.spare, how: "highest point after FCCP − non-mitochondrial" },
    { key: "spare", name: "Spare capacity", col: PART.spare, how: "maximal − basal" },
    { key: "nonMito", name: "Non-mitochondrial O₂ use", col: PART.nonMito, how: "lowest point after rotenone + antimycin A" },
    { key: "coupling", name: "Coupling efficiency", col: "transparent", how: "ATP-linked ÷ basal", pct: true },
  ];
  const cellsR = ROWS.map(r => {
    const tr = htmlEl("tr", "", "", tbody);
    const a = htmlEl("td", "", "", tr), b = htmlEl("td", "", "", tr), c = htmlEl("td", "", r.how, tr);
    a.innerHTML = `<span class="ms-sw" style="background:${r.col}"></span>${r.name}`;
    void c; return b;
  });
  const probs = htmlEl("ul", "ms-problems", "", boxR);
  const boxS = htmlEl("div", "ms-box", "", lower);
  htmlEl("div", "ms-title", "The cells", boxS);
  const presetTxt = htmlEl("div", "qb-note", "", boxS);
  const sDem = slider(boxS, "ATP demand", 0.5, 2, 0.1, cell.demand, v => { keepGhost(); cell = { ...cell, demand: v }; newWell(); }, v => v.toFixed(1) + "×");
  htmlEl("div", "qb-note", "Changing the cells or their ATP demand starts a new well. The last trace stays in grey for comparison.", boxS);

  const note = htmlEl("div", "qb-note ms-note", "", host);
  note.innerHTML = "<b>Model.</b> A qualitative proton circuit with realistic assay logic, not a fit to data. "
    + "One variable, the proton-motive force Δp. The chain (complexes I, III, IV) pumps 10 H⁺ per O atom used and slows "
    + "down when Δp is high (respiratory control); H⁺ come back through ATP synthase (in proportion to ATP demand and Δp; "
    + "it runs backwards, using ATP, when Δp falls too low), through a leak that grows steeply with Δp, and through the "
    + "uncoupler. O₂ use is set where pumping and return balance. Δψ is taken as 85 % of Δp. All rates are illustrative "
    + "numbers for one well of cultured cells; glycolysis, substrate supply and the cell's own responses are left out. "
    + "The circuit responds over illustrative seconds (not calibrated drug-mixing kinetics); each "
    + "dot stands for very many ions, and the rotor turns far slower than the real ~100 turns per second. The trace starts at 1× assay time; choose a faster assay speed: each point is one 6-minute measurement cycle (mix 3 min, measure 3 min).";

  // ---- assay logic
  function keepGhost() {
    const pts = phases.flatMap(p => p.points);
    if (pts.length >= M.CYCLES) ghost = { pts, label: preset.label + (cell.demand !== 1 ? `, demand ${cell.demand.toFixed(1)}×` : "") };
  }
  function newWell() {
    wellNo++;
    noise = rng(seed + 101 * wellNo);
    pBtns.forEach((b, k) => b.classList.toggle("active", M.PRESETS[k] === preset));
    presetTxt.textContent = preset.text;
    drugs = { ...M.NO_DRUGS };
    phases = [{ drugs: { ...drugs }, added: null, points: [] }];
    clock = 0;
    dp = M.steady(cell, drugs).dp;
    update();
  }
  function measuring() { const p = phases[phases.length - 1]; return p.points.length < M.CYCLES; }
  function inject(dr: M.Drug) {
    if (measuring() || drugs[dr] || phases.length >= PHASES_MAX) return;
    drugs = { ...drugs, [dr]: true };
    phases.push({ drugs: { ...drugs }, added: dr, points: [] });
    clock = 0;
    update();
  }
  function addPoint() {
    const i = phases.length - 1, p = phases[i];
    const k = i * M.CYCLES + p.points.length;
    const f = M.steady(cell, p.drugs);
    p.points.push({ t: (k + 0.75) * M.CYCLE_MIN, ocr: M.measure(f, 0.02 * noise.norm()), phase: i });
  }

  // ---- drawing: trace
  const pathOf = (pts: M.Point[]) => pts.map((p, i) => (i ? "L" : "M") + X(p.t).toFixed(1) + "," + Y(p.ocr).toFixed(1)).join(" ");
  function drawTrace() {
    gShade.replaceChildren(); gData.replaceChildren(); gGhost.replaceChildren(); gParts.replaceChildren();
    phases.forEach((p, i) => {
      const t0 = i * M.CYCLES * M.CYCLE_MIN;
      if (i % 2) svgEl("rect", { x: X(t0), y: MT, width: X(M.CYCLES * M.CYCLE_MIN) - X(0), height: TH - MT - MB, fill: "#f6f7f9" }, gShade);
      if (p.added) {
        svgEl("line", { x1: X(t0), x2: X(t0), y1: MT - 4, y2: TH - MB, stroke: DRUG, "stroke-width": 2, "stroke-dasharray": "5 4" }, gShade);
        const t = svgEl("text", { x: X(t0) + 4, y: MT - 8, "font-size": 14, "font-weight": 700 }, gShade);
        t.style.fill = DRUG; t.textContent = DRUG_SHORT[p.added];
      } else {
        const t = svgEl("text", { x: X(0) + 4, y: MT - 8, "font-size": 14, "font-weight": 700 }, gShade);
        t.textContent = "basal";
      }
    });
    if (ghost) {
      svgEl("path", { d: pathOf(ghost.pts), fill: "none", stroke: "#adb5bd", "stroke-width": 2 }, gGhost);
      for (const p of ghost.pts) svgEl("circle", { cx: X(p.t), cy: Y(p.ocr), r: 3.5, fill: "#adb5bd" }, gGhost);
      const lp = ghost.pts[ghost.pts.length - 1];
      const t = svgEl("text", { x: Math.min(X(lp.t) + 6, TW - MR - 4), y: Y(lp.ocr) - 8, "font-size": 13, "text-anchor": X(lp.t) > TW - 150 ? "end" : "start" }, gGhost);
      t.style.fill = "#868e96"; t.textContent = "previous: " + ghost.label; halo(t);
    }
    const pts = phases.flatMap(p => p.points);
    if (pts.length) {
      svgEl("path", { d: pathOf(pts), fill: "none", stroke: MITO, "stroke-width": 2.5 }, gData);
      for (const p of pts) svgEl("circle", { cx: X(p.t), cy: Y(p.ocr), r: 5, fill: MITO, stroke: "#fff", "stroke-width": 1.5 }, gData);
    }
    if (cParts.checked) drawParts();
  }
  function bracket(t: number, v0: number, v1: number, col: string, txt: string, right = true) {
    if (Math.abs(v1 - v0) < 1) return;
    if (!txt) { svgEl("path", { d: `M${X(t) - 5},${Y(v0)} H${X(t)} V${Y(v1)} H${X(t) - 5}`, fill: "none", stroke: col, "stroke-width": 3 }, gParts); return; }
    const x = X(t), y0 = Y(v0), y1 = Y(v1);
    svgEl("path", { d: `M${x - 5},${y0} H${x} V${y1} H${x - 5}`, fill: "none", stroke: col, "stroke-width": 3 }, gParts);
    const tt = svgEl("text", { x: right ? x + 5 : x - 9, y: (y0 + y1) / 2 + 5, "font-size": 13, "font-weight": 700, "text-anchor": right ? "start" : "end" }, gParts);
    tt.style.fill = col; tt.textContent = txt; halo(tt);
  }
  function drawParts() {
    const r = M.analyse(phases);
    const T = (i: number, frac: number) => (i * M.CYCLES + frac) * M.CYCLE_MIN;
    const ph = (dr: M.Drug) => phases.findIndex(p => p.added === dr);
    const base = phases[0].points.length === M.CYCLES ? phases[0].points[M.CYCLES - 1].ocr : undefined;
    if (r.nonMito !== undefined) {
      const i = ph("rotaa");
      svgEl("line", { x1: ML, x2: TW - MR, y1: Y(r.nonMito), y2: Y(r.nonMito), stroke: PART.nonMito, "stroke-dasharray": "3 4", "stroke-width": 1.5 }, gParts);
      bracket(T(i, 1.2), 0, r.nonMito, PART.nonMito, "");
      const t = svgEl("text", { x: ML + 6, y: Y(r.nonMito) - 5, "font-size": 13, "font-weight": 700 }, gParts);
      t.style.fill = PART.nonMito; t.textContent = "non-mitochondrial"; halo(t);
    }
    if (base !== undefined && r.atpLinked !== undefined) {
      const i = ph("oligo");
      svgEl("line", { x1: X(T(0, 2.75)), x2: X(T(i, 2.6)), y1: Y(base), y2: Y(base), stroke: PART.basal, "stroke-dasharray": "3 4", "stroke-width": 1.5 }, gParts);
      bracket(T(i, 1.25), base - r.atpLinked, base, PART.atp, "ATP-linked");
      if (r.leak !== undefined && r.nonMito !== undefined) bracket(T(i, 2.35), r.nonMito, r.nonMito + r.leak, PART.leak, "leak", false);
    }
    if (base !== undefined && r.spare !== undefined && r.nonMito !== undefined) {
      const i = ph("unc");
      svgEl("line", { x1: X(T(0, 2.75)), x2: X(T(i, 2.4)), y1: Y(base), y2: Y(base), stroke: PART.basal, "stroke-dasharray": "3 4", "stroke-width": 1.5 }, gParts);
      if (r.spare > 0) bracket(T(i, 1.25), base, base + r.spare, PART.spare, "spare");
    }
  }

  // ---- drawing: results
  const fmt = (v: number | undefined) => v === undefined ? "—" : Math.round(v).toString();
  function drawResults() {
    const r = M.analyse(phases);
    ROWS.forEach((row, k) => {
      const v = r[row.key] as number | undefined;
      cellsR[k].textContent = row.pct ? (v === undefined ? "—" : Math.round(100 * v) + " %") : fmt(v);
    });
    probs.replaceChildren();
    const done = phases.length >= 2 || phases[0].points.length === M.CYCLES;
    // "No …" (a missing injection) is only worth saying once the student stops injecting
    const finished = phases.length >= PHASES_MAX && !measuring();
    if (done) for (const p of r.problems) if (finished || !p.startsWith("No ")) htmlEl("li", "", p, probs);
  }
  function drawStatus() {
    const i = phases.length - 1, p = phases[i];
    const what = p.added ? "after " + DRUG_LABEL[p.added] : "basal respiration";
    if (measuring()) status.textContent = `Measuring ${what}: cycle ${p.points.length + 1} of ${M.CYCLES}…`;
    else if (phases.length >= PHASES_MAX) status.textContent = "Assay finished. Read the results below, or start a new well.";
    else status.textContent = i === 0 ? "Basal rate measured. Inject the first port." : "Done. Inject the next port (any order), or start a new well.";
    (Object.keys(portBtn) as M.Drug[]).forEach(dr => { portBtn[dr].disabled = measuring() || drugs[dr] || phases.length >= PHASES_MAX; });
  }
  function update() { drawTrace(); drawResults(); drawStatus(); drawCircuitStatic(); }

  // ---- drawing: circuit
  const R = rng(seed + 5);
  const resPos = Array.from({ length: 48 }, () => [12 + R.unif() * (CW - 24), 34 + R.unif() * (MEM0 - 48)]);
  const resDots = resPos.map(([x, y]) => svgEl("circle", { cx: x, cy: y, r: 4, fill: HPLUS, opacity: 0.55 }, gRes));
  // keep reservoir dots off the labels and the complexes
  resPos.forEach(([x, y], k) => {
    const nearComplex = Object.values(cx).some(c => Math.abs(x - c) < 34) && y > MEM0 - 26;
    const nearLabel = x < 170 && y < 30;
    if (nearComplex || nearLabel || Math.hypot(x - 228, y - 100) < 18) resDots[k].setAttribute("cy", String(-20));
  });
  function drawCircuitStatic() {
    gOligo.style.display = drugs.oligo ? "" : "none";
    gRot.style.display = drugs.rotaa ? "" : "none";
    gUnc.style.display = drugs.unc ? "" : "none";
  }
  interface Dot { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; el: SVGCircleElement; kind: "h" | "e"; shuttle?: SVGCircleElement }
  const dots: Dot[] = [];
  const pool: SVGCircleElement[] = [];
  const shPool: SVGCircleElement[] = [];
  const acc = { I: 0, III: 0, IV: 0, ATP: 0, leak: 0, unc: 0, e: 0, back: 0 };
  const getDot = (col: string, r: number) => {
    const el = pool.pop() ?? svgEl("circle", {}, gDots);
    el.setAttribute("r", String(r)); el.setAttribute("fill", col); el.style.display = "";
    return el;
  };
  const getShuttle = () => {
    const el = shPool.pop() ?? svgEl("circle", { r: 8, fill: "none", stroke: DRUG, "stroke-width": 3 }, gDots);
    el.style.display = ""; return el;
  };
  const HSCALE = 1 / 150;    // dots per second per H⁺ unit of current
  const ESCALE = 1 / 55;     // electron dots per second per unit of O₂ flux
  function spawnH(x: number, up: boolean, shuttle = false) {
    const jx = shuttle ? 0 : (R.unif() - 0.5) * 14;
    const yA = shuttle ? 192 : 214, yB = shuttle ? 84 : 70;
    const d: Dot = { x0: x + jx, x1: x + jx * 0.4, y0: up ? yA : yB, y1: up ? yB : yA, t: 0, dur: 2.4, el: getDot(HPLUS, 5), kind: "h" };
    if (shuttle) d.shuttle = getShuttle();
    dots.push(d);
  }
  function spawnUncReturn(x: number) {     // empty shuttle going back out (the uncoupler is an anion)
    const sh = getShuttle();
    const d: Dot = { x0: x + 14, x1: x + 14, y0: 192, y1: 84, t: 0, dur: 2.4, el: getDot("transparent", 0.1), kind: "h", shuttle: sh };
    dots.push(d);
  }
  function spawnE() {
    dots.push({ x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 4.2, el: getDot(ELEC, 4), kind: "e" });
  }
  function ePos(f: number): [number, number] {
    const n = ePath.length - 1, s = f * n, k = Math.min(n - 1, Math.floor(s)), u = s - k;
    return [ePath[k][0] + (ePath[k + 1][0] - ePath[k][0]) * u, ePath[k][1] + (ePath[k + 1][1] - ePath[k][1]) * u];
  }
  let rotAngle = 0, ringShift = 0;
  const basal = M.steady(M.PRESETS[0].cell, M.NO_DRUGS);
  function stepCircuit(dt: number) {
    const target = M.steady(cell, drugs).dp;
    dp = M.relax(dp, target, dt);
    const f = M.fluxesAt(cell, drugs, dp);
    // spawn dots in proportion to the currents
    const share = { I: 0.4, III: 0.4, IV: 0.2 };
    for (const k of ["I", "III", "IV"] as const) {
      acc[k] += f.pump * share[k] * HSCALE * dt;
      while (acc[k] >= 1) { acc[k] -= 1; spawnH(cx[k], true); }
    }
    acc.ATP += Math.abs(f.atp) * HSCALE * dt;
    while (acc.ATP >= 1) { acc.ATP -= 1; spawnH(cx.ATP, f.atp < 0 ? true : false); }
    acc.leak += f.leak * HSCALE * dt;
    while (acc.leak >= 1) { acc.leak -= 1; spawnH(cx.leak, false); }
    acc.unc += f.unc * HSCALE * dt;
    while (acc.unc >= 1) { acc.unc -= 1; spawnH(cx.unc - 8, false, true); spawnUncReturn(cx.unc); }
    acc.e += f.e * ESCALE * dt;
    while (acc.e >= 1) { acc.e -= 1; spawnE(); }
    // move
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      d.t += dt;
      const u = d.t / d.dur;
      if (u >= 1) {
        d.el.style.display = "none"; pool.push(d.el);
        if (d.shuttle) { d.shuttle.style.display = "none"; shPool.push(d.shuttle); }
        dots.splice(i, 1); continue;
      }
      let x: number, y: number;
      if (d.kind === "e") [x, y] = ePos(u);
      else { x = d.x0 + (d.x1 - d.x0) * u; y = d.y0 + (d.y1 - d.y0) * u; }
      d.el.setAttribute("cx", x.toFixed(1)); d.el.setAttribute("cy", y.toFixed(1));
      const op = u < 0.12 ? u / 0.12 : u > 0.88 ? (1 - u) / 0.12 : 1;
      d.el.setAttribute("opacity", op.toFixed(2));
      if (d.shuttle) { d.shuttle.setAttribute("cx", x.toFixed(1)); d.shuttle.setAttribute("cy", y.toFixed(1)); d.shuttle.setAttribute("opacity", op.toFixed(2)); }
    }
    // ATP synthase rotor: turns with the current through it (slowed down a lot)
    const turnsPerS = 0.5 * f.atp / basal.atp;
    rotAngle += 360 * turnsPerS * dt;
    rotor.setAttribute("transform", `translate(${cx.ATP} 222) rotate(${rotAngle.toFixed(1)})`);
    ringShift = (ringShift + 56 * turnsPerS * dt) % 56;
    stripes.forEach((s, k) => { const x = cx.ATP - 28 + ((k * 7 + ringShift) % 56 + 56) % 56; s.setAttribute("x1", x.toFixed(1)); s.setAttribute("x2", x.toFixed(1)); });
    return f;
  }
  function drawCircuitState(f: M.Fluxes) {
    const n = Math.round(Math.max(0, f.dp) / 200 * resDots.length);
    resDots.forEach((el, k) => { el.style.display = k < n ? "" : "none"; });
    atpTxt.textContent = drugs.oligo ? "blocked" : f.atp > 1 ? "ADP + Pᵢ → ATP" : f.atp < -1 ? "running backwards: ATP → ADP" : "idle";
    st.innerHTML = `Δp = <b>${Math.round(f.dp)} mV</b> (membrane potential Δψ ≈ <b>${Math.round(f.dpsi) === 0 ? 0 : "−" + Math.abs(Math.round(f.dpsi))} mV</b>, matrix negative) · `
      + `mitochondrial O₂ use <b>${Math.round(f.e)}</b> pmol/min · ATP made <b>${Math.round(100 * f.atpRate / basal.atpRate)} %</b> of a healthy resting cell`;
    const maxv = 2.0 * basal.pump;
    const setBar = (b: { b: HTMLElement; v: HTMLElement }, val: number) => {
      const w = Math.min(100, Math.abs(val) / maxv * 100);
      b.b.style.width = w + "%"; b.b.style.left = "0";
      b.v.textContent = (val < -0.5 ? "−" : "") + Math.round(Math.abs(val) / basal.pump * 100) + " %";
    };
    setBar(bPump, f.pump); setBar(bAtp, f.atp); setBar(bLeak, f.leak); setBar(bUnc, f.unc);
  }

  // ---- loop: real time, only while on screen
  let raf = 0, lastT = 0, onScreen = true;
  const frame = (t: number) => {
    raf = 0;
    if (paused || !onScreen || document.hidden) { lastT = 0; return; }
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const f = stepCircuit(dt);
    drawCircuitState(f);
    if (measuring()) {
      clock += dt * assaySpeed;
      if (clock >= POINT_EVERY) { clock -= POINT_EVERY; addPoint(); update(); }
    }
    raf = requestAnimationFrame(frame);
  };
  function kick() { if (!raf && !paused && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; kick(); }, { rootMargin: "50px" }).observe(host);
  }
  document.addEventListener("visibilitychange", kick);

  sDem.set(cell.demand);
  newWell();
  drawCircuitState(M.fluxesAt(cell, drugs, dp));
  kick();
});
