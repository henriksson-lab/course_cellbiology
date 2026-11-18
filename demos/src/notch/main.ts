// Notch lateral inhibition. A sheet of hexagonal cells, each making Delta (the signal) and
// Notch (the receptor). Delta on a cell activates Notch on its neighbours; active Notch
// switches off Delta in the same cell. From a nearly uniform start with small random
// differences, a salt-and-pepper pattern of Delta-high cells (future hair cells or
// neurons) surrounded by Notch-high cells (supporting cells) appears. Model: Collier et al.
// (1996), two ODEs per cell (model.ts). Opens at real time (the rule for all demos); the
// pattern needs about a day, so the speed buttons offer time-lapse.
// Controls: feedback strength, noise, Notch knockout in a patch, γ-secretase inhibitor,
// restart with a new seed; tap a cell to follow it and its neighbour in the graph.
// Options (data-*): seed, speed (index into SPEEDS, default 0 = real time), cols, rows.
import { autoMount, htmlEl, svgEl, slider, button, presets, checkbox, Slider } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import { Sheet, DEFAULTS, Params, TAU_MIN, HIGH } from "./model";

/** Speeds: minutes of tissue time per second on screen. */
const SPEEDS: { label: string; min: number }[] = [
  { label: "real time", min: 1 / 60 },
  { label: "1 s = 10 min", min: 10 },
  { label: "1 s = 30 min", min: 30 },
  { label: "1 s = 1 h", min: 60 },
  { label: "1 s = 2 h", min: 120 },
];
const DT = 1 / 60;                                  // s of real time per loop step
const DELTA_LO = [253, 248, 232], DELTA_HI = [26, 110, 70];     // cream → deep green
const NOTCH_LO = [253, 248, 232], NOTCH_HI = [28, 79, 160];     // cream → blue
const PW = 440, PH = 200, ML = 54, MR = 12, MT = 12, MB = 38;

const CSS = `
.qb-demo.nt { align-items: flex-start; }
.nt .nt-view { flex: 1 1 380px; max-width: 560px; min-width: 0; display: flex; flex-direction: column; gap: .45em; }
.nt .nt-sheet { width: 100%; height: auto; touch-action: manipulation; cursor: pointer; background: #fff; border-radius: 6px; }
.nt .nt-sheet polygon { stroke: #1b2a3a; stroke-width: .035; stroke-opacity: .35; }
.nt .nt-sheet .nt-ko { fill: none; stroke: #e8590c; stroke-width: .09; stroke-dasharray: .18 .1; pointer-events: none; }
.nt .nt-sheet .nt-mark { fill: none; stroke-width: .16; pointer-events: none; }
.nt .nt-sheet .nt-lab { font-size: .5px; font-weight: 700; text-anchor: middle; pointer-events: none; paint-order: stroke; stroke: #fff; stroke-width: .12px; }
.nt .nt-status { font-family: ui-monospace, monospace; font-size: .9em; }
.nt .nt-legend { display: flex; align-items: center; gap: .5em; font-size: .85em; flex-wrap: wrap; }
.nt .nt-bar { flex: 0 0 120px; height: 14px; border-radius: 3px; border: 1px solid #ccc; }
.nt .nt-side { flex: 1 1 320px; max-width: 480px; min-width: 0; }
.nt .nt-plot { width: 100%; height: auto; }
.nt .nt-h { font-weight: 600; font-size: .95em; margin-top: .2em; }
.nt .qb-presets .qb-btn { min-height: 36px; }
.nt .nt-hint { border-left: 4px solid #e8590c; padding: .15em .5em; font-size: .9em; }
.nt .nt-hint[hidden] { display: none; }
@media (max-width: 640px) { .nt .qb-btn { min-height: 44px; } .nt .nt-slider-note { font-size: .8em; } }
`;

function injectCSS() {
  if (document.getElementById("nt-style")) return;
  const s = document.createElement("style");
  s.id = "nt-style"; s.textContent = CSS;
  document.head.appendChild(s);
}

const mix = (lo: number[], hi: number[], t: number) => {
  t = Math.max(0, Math.min(1, t));
  return `rgb(${lo.map((v, k) => Math.round(v + (hi[k] - v) * t)).join(",")})`;
};
function niceCeil(v: number): number {
  for (const s of [12, 18, 24, 36, 48, 72, 96, 144, 192, 288]) if (s >= v) return s;
  return Math.ceil(v / 96) * 96;
}
const fmtH = (h: number) => h < 1 ? `${(h * 60).toFixed(0)} min` : `${h.toFixed(1)} h`;

autoMount("notch", host => {
  injectCSS();
  host.classList.add("nt");
  const ds = host.dataset;
  const cols = Number(ds.cols) || 18, rows = Number(ds.rows) || 16;
  let seed = Number(ds.seed) || 1;
  let speed = Math.min(SPEEDS.length - 1, Math.max(0, Number(ds.speed) || 0));
  const p: Params = { ...DEFAULTS };
  const sheet = new Sheet(cols, rows, seed, p);
  let colourBy: "delta" | "notch" = "delta";
  // followed cells: A (tapped) and its right-hand neighbour B
  let cellA = Math.floor(rows / 2 - 3) * cols + Math.floor(cols / 2) - 4;
  const right = (i: number) => (i % cols < cols - 1 ? i + 1 : i - 1);
  let hist: { t: number; a: number; b: number }[] = [];

  // ---- the sheet
  const view = htmlEl("div", "nt-view", "", host);
  const R = 1 / Math.sqrt(3), H = Math.sqrt(3) / 2, PAD = 0.15;
  const vw = cols + 0.5 + 2 * PAD, vh = (rows - 1) * H + 2 * R + 2 * PAD;
  const svg = svgEl("svg", { viewBox: `${-0.5 - PAD} ${-R - PAD} ${vw} ${vh}`, class: "nt-sheet" }, view);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Sheet of hexagonal cells coloured by Delta level");
  const hex = (x: number, y: number) => Array.from({ length: 6 }, (_, k) => {
    const a = Math.PI / 6 + k * Math.PI / 3;
    return `${(x + R * Math.cos(a)).toFixed(3)},${(y + R * Math.sin(a)).toFixed(3)}`;
  }).join(" ");
  const polys: SVGPolygonElement[] = [], fills: string[] = [];
  for (let i = 0; i < sheet.N; i++) {
    const [x, y] = sheet.centre(i);
    const pg = svgEl("polygon", { points: hex(x, y) }, svg);
    pg.addEventListener("click", () => { cellA = i; hist = []; drawMarks(); drawPlot(); });
    polys.push(pg); fills.push("");
  }
  const koLayer = svgEl("g", {}, svg);
  for (let i = 0; i < sheet.N; i++) if (sheet.patch[i]) {
    const [x, y] = sheet.centre(i);
    svgEl("polygon", { points: hex(x, y), class: "nt-ko" }, koLayer);
  }
  const markA = svgEl("polygon", { class: "nt-mark", stroke: "#e8590c" }, svg);
  const markB = svgEl("polygon", { class: "nt-mark", stroke: "#1b2a3a", "stroke-dasharray": ".16 .09" }, svg);
  const labA = svgEl("text", { class: "nt-lab" }, svg); labA.textContent = "A"; labA.style.fill = "#c2410c";
  const labB = svgEl("text", { class: "nt-lab" }, svg); labB.textContent = "B"; labB.style.fill = "#1b2a3a";

  const status = htmlEl("div", "nt-status", "", view);
  const legend = htmlEl("div", "nt-legend", "", view);
  const hint = htmlEl("div", "nt-hint", "", view);
  const tools = htmlEl("div", "qb-presets", "", view);
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(tools, "Restart (new random start)", () => { seed++; restart(); });
  button(tools, "Reset all", () => {
    Object.assign(p, DEFAULTS); seed = Number(ds.seed) || 1;
    sB.set(Math.log10(p.b)); sNoise.set(p.noise * 100); sGsi.set(p.gsi * 100); cKO.checked = p.ko;
    restart();
  });
  htmlEl("div", "nt-h", "Clock speed", view);
  const speedBtns = presets(view, SPEEDS.map((s, k) => ({ label: s.label, apply: () => { speed = k; showHint(); } })));
  speedBtns[speed].classList.add("active");
  htmlEl("div", "nt-h", "Colour cells by", view);
  const colBtns = presets(view, [
    { label: "Delta (the signal)", apply: () => { colourBy = "delta"; paintLegend(); render(); } },
    { label: "Notch activity (the receiver)", apply: () => { colourBy = "notch"; paintLegend(); render(); } },
  ]);
  colBtns[0].classList.add("active");

  // ---- side panel: graph and controls
  const side = htmlEl("div", "qb-panel nt-side", "", host);
  htmlEl("div", "nt-h", "Delta in two neighbouring cells (tap a cell to follow it)", side);
  const psvg = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "nt-plot" }, side);
  const axes = svgEl("g", {}, psvg);
  svgEl("line", { x1: ML, x2: PW - MR, y1: 0, y2: 0, stroke: "#adb5bd", "stroke-dasharray": "4 4", class: "nt-thr" }, psvg);
  const lineA = svgEl("path", { fill: "none", stroke: "#e8590c", "stroke-width": 2.5 }, psvg);
  const lineB = svgEl("path", { fill: "none", stroke: "#1b2a3a", "stroke-width": 2, "stroke-dasharray": "6 4" }, psvg);
  const readout = htmlEl("div", "qb-readout", "", side);

  htmlEl("div", "nt-h", "Change the cells", side);
  const sB = slider(side, "feedback strength", 1, 4, 0.05, Math.log10(p.b),
    v => { p.b = Math.pow(10, v); }, v => Math.round(Math.pow(10, v)).toString());
  htmlEl("div", "qb-note nt-slider-note", "How strongly active Notch switches off Delta in the same cell (b in the model; 100 = Collier et al.).", side);
  const sNoise = slider(side, "noise", 0, 30, 1, p.noise * 100, v => { p.noise = v / 100; }, v => v + " %");
  htmlEl("div", "qb-note nt-slider-note", "Random cell-to-cell differences in how much Delta each cell makes (gene-expression noise). Also sets the differences at the start.", side);
  const sGsi = slider(side, "γ-secretase inhibitor", 0, 100, 1, p.gsi * 100, v => { p.gsi = v / 100; }, v => v + " %");
  htmlEl("div", "qb-note nt-slider-note", "Fraction of Notch cleavage blocked: no free intracellular domain, no Notch signal.", side);
  const cKO = checkbox(side, "Notch knockout in a patch of cells (orange outline)", p.ko, v => {
    p.ko = v;
    if (v) for (let i = 0; i < sheet.N; i++) if (sheet.patch[i]) sheet.n[i] = 0;
    koLayer.style.display = v ? "" : "none";
    render();
  });
  koLayer.style.display = "none";
  htmlEl("div", "qb-note", `Model: Collier et al. (1996) lateral inhibition, two differential equations per cell (Notch activity, Delta) on a sheet of ${cols} × ${rows} = ${sheet.N} hexagonal cells; each cell hears the mean Delta of its six neighbours. Simplified: no Notch–Delta binding in the same cell, no transcription delay, fates never lock in. Time scale illustrative (a protein lifetime of about ${TAU_MIN} min).`, side);

  // ---- drawing
  function paintLegend() {
    const [lo, hi] = colourBy === "delta" ? [DELTA_LO, DELTA_HI] : [NOTCH_LO, NOTCH_HI];
    legend.innerHTML = "";
    htmlEl("span", "", colourBy === "delta" ? "low Delta" : "Notch off", legend);
    const bar = htmlEl("span", "nt-bar", "", legend);
    bar.style.background = `linear-gradient(to right, ${mix(lo, hi, 0)}, ${mix(lo, hi, 1)})`;
    htmlEl("span", "", colourBy === "delta" ? "high Delta: hair cell / neuron" : "Notch on: supporting cell", legend);
  }
  function drawMarks() {
    const [xa, ya] = sheet.centre(cellA), [xb, yb] = sheet.centre(right(cellA));
    markA.setAttribute("points", hex(xa, ya));
    markB.setAttribute("points", hex(xb, yb));
    labA.setAttribute("x", String(xa)); labA.setAttribute("y", String(ya + 0.17));
    labB.setAttribute("x", String(xb)); labB.setAttribute("y", String(yb + 0.17));
  }
  function render() {
    const lo = colourBy === "delta" ? DELTA_LO : NOTCH_LO, hi = colourBy === "delta" ? DELTA_HI : NOTCH_HI;
    const v = colourBy === "delta" ? sheet.d : sheet.n;
    for (let i = 0; i < sheet.N; i++) {
      const c = mix(lo, hi, Math.pow(Math.max(0, v[i]), 0.6));
      if (c !== fills[i]) { polys[i].setAttribute("fill", c); fills[i] = c; }
    }
    const hrs = sheet.t * TAU_MIN / 60;
    status.textContent = `time ${fmtH(hrs)} · Delta-high cells ${(100 * sheet.fracHigh()).toFixed(0)} %`;
    drawPlot();
  }
  function drawPlot() {
    const tNow = sheet.t * TAU_MIN / 60;
    const tMax = niceCeil(Math.max(12, tNow));
    const sx = (t: number) => ML + t / tMax * (PW - ML - MR);
    const sy = (v: number) => PH - MB - Math.min(1.05, v) * (PH - MT - MB) / 1.05;
    axes.innerHTML = "";
    svgEl("line", { x1: ML, x2: PW - MR, y1: PH - MB, y2: PH - MB, class: "axis" }, axes);
    svgEl("line", { x1: ML, x2: ML, y1: MT, y2: PH - MB, class: "axis" }, axes);
    const step = tMax / 6;
    for (let k = 0; k <= 6; k++) {
      const x = sx(k * step);
      svgEl("line", { x1: x, x2: x, y1: PH - MB, y2: PH - MB + 5, class: "axis" }, axes);
      svgEl("text", { x, y: PH - MB + 19, "font-size": 14, "text-anchor": "middle" }, axes).textContent = String(k * step);
    }
    for (const v of [0, 0.5, 1]) {
      svgEl("text", { x: ML - 7, y: sy(v) + 5, "font-size": 14, "text-anchor": "end" }, axes).textContent = String(v);
      svgEl("line", { x1: ML - 4, x2: ML, y1: sy(v), y2: sy(v), class: "axis" }, axes);
    }
    svgEl("text", { x: (ML + PW - MR) / 2, y: PH - 4, "font-size": 14, "text-anchor": "middle" }, axes).textContent = "time (hours)";
    const yl = svgEl("text", { x: 13, y: (MT + PH - MB) / 2, "font-size": 14, "text-anchor": "middle", transform: `rotate(-90 13 ${(MT + PH - MB) / 2})` }, axes);
    yl.textContent = "Delta";
    const thr = psvg.querySelector(".nt-thr")!;
    thr.setAttribute("y1", String(sy(HIGH))); thr.setAttribute("y2", String(sy(HIGH)));
    const path = (key: "a" | "b") => hist.map((h, k) => `${k ? "L" : "M"}${sx(h.t).toFixed(1)},${sy(h[key]).toFixed(1)}`).join("");
    lineA.setAttribute("d", path("a"));
    lineB.setAttribute("d", path("b"));
    const a = sheet.d[cellA], b = sheet.d[right(cellA)];
    readout.textContent =
      `cell A (orange line): Delta ${a.toFixed(2)}, Notch ${sheet.n[cellA].toFixed(2)}${sheet.isKO(cellA) ? " (knockout)" : ""}\n`
      + `cell B (dashed line): Delta ${b.toFixed(2)}, Notch ${sheet.n[right(cellA)].toFixed(2)}${sheet.isKO(right(cellA)) ? " (knockout)" : ""}\n`
      + `Delta-high cells touching another Delta-high cell: ${(100 * sheet.fracHighTouching()).toFixed(0)} %`;
  }
  function record() {
    const t = sheet.t * TAU_MIN / 60;
    const last = hist[hist.length - 1];
    if (!last || t - last.t >= 0.1) hist.push({ t, a: sheet.d[cellA], b: sheet.d[right(cellA)] });
  }
  function showHint() {
    hint.hidden = speed !== 0;
    hint.textContent = "Real time: in a tissue this pattern takes about a day to form, so you will see almost nothing change. Choose a faster clock speed below to watch it as a time-lapse.";
  }
  function restart() {
    sheet.reset(seed);
    hist = [];
    record(); render();
  }

  const loop = visibleLoop(host, DT, () => {
    sheet.advance(SPEEDS[speed].min * DT / TAU_MIN);
    record();
  }, render);
  paintLegend(); drawMarks(); showHint();
  record(); render();
});
