// Clonal evolution under therapy. An agent-based tumour on a 2D lattice (sim.ts): cells
// divide into free space and die; mutations give growth or survival advantages, or resistance
// to drug A or drug B. Therapy starts automatically at diagnosis (DIAG cells) with the chosen
// schedule: none, drug A continuous, drug A intermittent, A + B together, A then B.
// Left: the tumour, cells coloured by clone class. Right: tumour size over time as stacked
// areas, with earlier runs of the same tumour as thin lines. A batch button runs 10 tumours.
// Starts at 1× real time; time-lapse speeds by choice. No flashing.
// Options (data-*): schedule = none|A|inter|AB|seq, seed.
import { autoMount, htmlEl, svgEl, slider, button, checkbox, presets } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import * as M from "./sim";

const INK = "#1b2a3a", MUTED = "#6b7280", DRUG = "#e8590c", DRUG_B = "#9c3d0b";
// [no driver, 1 driver, 2 drivers] for sensitive, A-resistant, B-resistant, both
const SHADES = [
  ["#a9c9ef", "#5b8fd6", "#2754a3"],
  ["#f3b3c8", "#d6457a", "#8f1d4a"],
  ["#b5e3bd", "#43a85a", "#1f6b32"],
  ["#d9c8f5", "#8a63d2", "#4b2a8f"],
];
const CLASS_NAME = ["sensitive", "resistant to A", "resistant to B", "resistant to A and B"];
const EMPTY = "#f4efe2";
const SPEEDS: { label: string; daysPerSec: number }[] = [
  { label: "real time", daysPerSec: 1 / 86400 },
  { label: "1 hour/s", daysPerSec: 1 / 24 },
  { label: "1 day/s", daysPerSec: 1 },
  { label: "1 week/s", daysPerSec: 7 },
];
const HORIZON = 1095;   // days of therapy before the run stops (3 years)

const CSS = `
.qb-demo.cl { display: block; }
.cl .cl-row { display: flex; flex-wrap: wrap; gap: 1.2em; align-items: flex-start; }
.cl .cl-left { flex: 0 1 380px; min-width: 0; display: flex; flex-direction: column; gap: .4em; }
.cl .cl-right { flex: 1 1 420px; min-width: 0; max-width: 640px; display: flex; flex-direction: column; gap: .4em; }
.cl .cl-canvas { width: 100%; box-sizing: border-box; aspect-ratio: 1; image-rendering: pixelated; border: 1px solid #c9c2ad; border-radius: 6px; background: ${EMPTY}; }
.cl svg { width: 100%; height: auto; }
.cl .cl-title { font-weight: 600; font-size: .95em; }
.cl .cl-status { display: flex; flex-wrap: wrap; gap: .4em; align-items: center; font-variant-numeric: tabular-nums; }
.cl .cl-chip { display: inline-block; padding: .1em .55em; border-radius: 999px; font-size: .85em; border: 1px solid #ccc; color: ${MUTED}; }
.cl .cl-chip.on { background: ${DRUG}; border-color: ${DRUG}; color: #fff; }
.cl .cl-chip.onB { background: ${DRUG_B}; border-color: ${DRUG_B}; color: #fff; }
.cl .cl-legend { display: grid; grid-template-columns: auto repeat(3, 1.3em); gap: .15em .35em; align-items: center; font-size: .85em; }
.cl .cl-legend .cl-sw { width: 1.3em; height: 1em; border-radius: 2px; }
.cl .cl-legend .cl-lh { font-size: .8em; color: ${MUTED}; text-align: center; }
.cl .cl-panel { display: flex; flex-wrap: wrap; gap: 1.2em; margin-top: .8em; }
.cl .cl-col { flex: 1 1 300px; min-width: 0; display: flex; flex-direction: column; gap: .45em; }
.cl .cl-h { font-weight: 700; margin-top: .2em; }
.cl .qb-btn { min-height: 36px; }
.cl .cl-table { border-collapse: collapse; width: 100%; font-size: .88em; font-variant-numeric: tabular-nums; }
.cl .cl-table th, .cl .cl-table td { padding: .2em .45em; text-align: left; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
.cl .cl-twrap { overflow-x: auto; }
.cl .cl-hint { font-size: .85em; color: ${MUTED}; }
@media (max-width: 640px) {
  .cl .qb-slider { grid-template-columns: 1fr 3.6em; }
  .cl .qb-slider-name { white-space: normal; grid-column: 1 / -1; }
  .cl .cl-left, .cl .cl-right { flex-basis: 100%; max-width: 100%; }
  .cl .qb-btn { min-height: 44px; }
}`;

function injectCSS() {
  if (document.getElementById("cl-style")) return;
  const s = document.createElement("style");
  s.id = "cl-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const COLOR_OF = new Uint8Array(16 * 3);
for (let g = 0; g < 16; g++) {
  const c = rgb(SHADES[(g >> 2) & 3][(g & 1) + ((g >> 1) & 1)]);
  COLOR_OF.set(c, 3 * g);
}
const EMPTY_RGB = rgb(EMPTY);
function niceCeil(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (f * e >= v - 1e-9) return f * e;
  return 10 * e;
}
const fmtN = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
function fmtTime(t: number): string {
  const d = Math.floor(t + 1e-9), rest = (t - d) * 24, h = Math.floor(rest), m = Math.floor((rest - h) * 60), s = Math.floor(((rest - h) * 60 - m) * 60);
  return `day ${d}, ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
const schedLabel = (k: M.Schedule) => M.SCHEDULES.find(s => s.key === k)!.label;

autoMount("clonal", host => {
  injectCSS();
  host.classList.add("cl");
  const d = host.dataset;
  const initSched = (M.SCHEDULES.some(s => s.key === d.schedule) ? d.schedule : "A") as M.Schedule;
  let seed = Number(d.seed) || 1;
  let params: M.Params = { ...M.DEFAULTS };
  let schedule: M.Schedule = initSched;
  let tum = new M.Tumour(params, seed, schedule);
  let simT = 0;               // continuous clock (days), the lattice advances in steps of DT
  let speed = 0;
  let finished = false;
  let ghosts: { label: string; pts: [number, number][] }[] = [];
  let loop: ReturnType<typeof visibleLoop> | undefined;

  // ---- layout
  const row = htmlEl("div", "cl-row", "", host);
  const left = htmlEl("div", "cl-left", "", row);
  htmlEl("div", "cl-title", "The tumour (each square is one cell; seen from above)", left);
  const canvas = htmlEl("canvas", "cl-canvas", "", left);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "A growing tumour of cells on a square grid, coloured by clone");
  const status = htmlEl("div", "cl-status", "", left);
  const clock = htmlEl("span", "", "", status);
  const chipA = htmlEl("span", "cl-chip", "drug A", status);
  const chipB = htmlEl("span", "cl-chip", "drug B", status);
  const legend = htmlEl("div", "cl-legend", "", left);
  htmlEl("span", "cl-lh", "", legend);
  for (const t of ["no driver", "1", "2"]) htmlEl("span", "cl-lh", t === "no driver" ? "0" : t, legend);
  SHADES.forEach((sh, k) => {
    htmlEl("span", "", CLASS_NAME[k], legend);
    for (const c of sh) { const e = htmlEl("span", "cl-sw", "", legend); e.style.background = c; }
  });
  htmlEl("div", "cl-hint", "Columns: number of growth/survival driver mutations (0, 1, 2); darker = more drivers.", left);

  const right = htmlEl("div", "cl-right", "", row);
  htmlEl("div", "cl-title", "Tumour size over time (number of cells), by clone class", right);
  const PW = 560, PH = 300, ML = 56, MR = 14, MT = 14, MB = 58;
  const psvg = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}` }, right);
  psvg.setAttribute("aria-label", "Stacked area plot of tumour cell numbers over time");
  const gAxes = svgEl("g", {}, psvg), gData = svgEl("g", {}, psvg), gGhost = svgEl("g", {}, psvg), gMarks = svgEl("g", {}, psvg);
  const readout = htmlEl("div", "qb-readout", "", right);

  // ---- controls
  const panel = htmlEl("div", "cl-panel", "", host);
  const c1 = htmlEl("div", "cl-col", "", panel);
  htmlEl("div", "cl-h", "Therapy (starts at diagnosis, " + fmtN(M.DIAG) + " cells)", c1);
  const schedBtns = presets(c1, M.SCHEDULES.map(s => ({ label: s.label, apply: () => newRun(s.key, true) })));
  htmlEl("div", "cl-hint", `Intermittent: drug A stops when the tumour has shrunk to ${fmtN(M.LOW)} cells and starts again when it is back at ${fmtN(M.DIAG)}. `
    + `Choosing a therapy restarts the same tumour from one cell; the earlier run stays as a thin line.`, c1);
  const runRow = htmlEl("div", "qb-presets", "", c1);
  const bPause = button(runRow, "Pause", () => togglePause());
  button(runRow, "Skip to diagnosis", () => skipToDiagnosis());
  button(runRow, "Reset", () => newRun(schedule, false));
  htmlEl("div", "cl-h", "Speed", c1);
  const spRow = htmlEl("div", "qb-presets", "", c1);
  const spBtns = SPEEDS.map((s, k) => button(spRow, s.label, () => setSpeed(k)));
  htmlEl("div", "cl-hint", "At real time a cell divides about every few days: nothing visible happens. Choose a time-lapse speed.", c1);

  const c2 = htmlEl("div", "cl-col", "", panel);
  htmlEl("div", "cl-h", "The tumour and its mutations", c2);
  const sSeed = slider(c2, "tumour (random seed)", 1, 10, 1, seed, v => { seed = v; ghosts = []; newRun(schedule, false); }, v => String(v));
  const sCost = slider(c2, "cost of each resistance", 0, 0.6, 0.05, params.cost, v => { params.cost = v; ghosts = []; newRun(schedule, false); }, v => "−" + Math.round(v * 100) + " %");
  const sInst = slider(c2, "mutation rate (genome instability)", -1, 1, 0.5, 0, v => { params.instability = Math.pow(10, v); ghosts = []; newRun(schedule, false); },
    v => "×" + +Math.pow(10, v).toPrecision(2));
  const cNew = checkbox(c2, "resistance can also arise during therapy", true, v => { params.newRes = v; ghosts = []; newRun(schedule, false); });
  htmlEl("div", "cl-h", "Ten tumours (seeds 1–10), current settings", c2);
  const bRow = htmlEl("div", "qb-presets", "", c2);
  const bBatch = button(bRow, "Run 10 tumours with this therapy", () => runBatch());
  button(bRow, "Clear table", () => { tbody.innerHTML = ""; });
  const twrap = htmlEl("div", "cl-twrap", "", c2);
  const table = htmlEl("table", "cl-table", "", twrap);
  table.innerHTML = "<thead><tr><th>therapy</th><th>settings</th><th>cured</th><th>median time to progression</th><th>each tumour (days)</th></tr></thead>";
  const tbody = htmlEl("tbody", "", "", table);
  const bOut = htmlEl("div", "cl-hint", "Progression: the tumour grows past " + fmtN(M.PROG) + " cells (25 % above its size at diagnosis). "
    + "C = cured (no cells left). The batch is computed, not animated (a few seconds).", c2);

  const note = htmlEl("div", "qb-note", "", host);
  note.style.marginTop = ".8em";
  note.innerHTML = "<b>Model (qualitative; illustrative numbers).</b> A 120 × 120 grid; each square holds one cell or is empty. "
    + "A cell divides (about every 3 days) only if one of its 8 neighbours is empty, so the tumour grows at its edge and crowded cells wait for space; "
    + "it also dies at random (about 8 % per day). At each division a daughter can gain a mutation: a <i>growth</i> driver (divides 40 % faster, like an active RAS) "
    + "or a <i>survival</i> driver (dies 60 % less often, like extra BCL-2), each about 1 in 10 000; or resistance to drug A or B (like a gatekeeper mutation), "
    + "each 1 in 10 000. Resistance costs some division speed (slider). Each drug kills cells that are not resistant to it (about 40 % per day). "
    + "Simplifications: a real tumour at diagnosis has about 10⁹ cells, here 4 000, so the mutation rates are set far higher than real ones, "
    + "to give a small tumour about as many resistant cells as a large real one; "
    + "no blood vessels, immune cells, invasion or drug side effects; drugs reach every cell equally; the two drugs never interact. "
    + "The same seed gives the same tumour until therapy starts.";

  // ---- simulation control
  function newRun(s: M.Schedule, keepGhost: boolean) {
    if (keepGhost && tum.tDiag >= 0 && tum.hist.length > 1) {
      ghosts.push({ label: schedLabel(tum.schedule), pts: tum.hist.map(h => [h.t, h.total] as [number, number]) });
      if (ghosts.length > 4) ghosts.shift();
    }
    schedule = s;
    tum = new M.Tumour(params, seed, schedule);
    simT = 0; finished = false;
    schedBtns.forEach((b, k) => b.classList.toggle("active", M.SCHEDULES[k].key === schedule));
    if (loop?.paused) togglePause();
    loop?.redraw();
  }
  function togglePause() {
    if (!loop) return;
    loop.setPaused(!loop.paused);
    bPause.textContent = loop.paused ? "Run" : "Pause";
  }
  function setSpeed(k: number) { speed = k; spBtns.forEach((b, j) => b.classList.toggle("active", j === k)); }
  function advance(days: number, maxSteps: number) {
    simT += days;
    let n = 0;
    while (tum.t + M.DT <= simT + 1e-9 && n < maxSteps) { tum.step(); n++; checkEnd(); if (finished) break; }
    if (simT > tum.t + M.DT) simT = tum.t;   // could not keep up: do not run ahead of the lattice
  }
  function checkEnd() {
    if (finished) return;
    const done = tum.total === 0 || (tum.tDiag >= 0 && tum.t - tum.tDiag >= HORIZON)
      || (tum.total >= params.n * params.n * 0.97);
    if (done) { finished = true; tum.sample(); if (loop && !loop.paused) togglePause(); }
  }
  function skipToDiagnosis() {
    let n = 0;
    while (tum.tDiag < 0 && n < 20000 && tum.total > 0) { tum.step(); n++; }
    simT = tum.t; checkEnd(); loop?.redraw();
  }
  function step() { if (!finished) advance(SPEEDS[speed].daysPerSec / 60, 20); }

  // ---- drawing: lattice
  const n = params.n;
  const off = document.createElement("canvas");
  off.width = n; off.height = n;
  const octx = off.getContext("2d")!;
  const img = octx.createImageData(n, n);
  const ctx = canvas.getContext("2d")!;
  function drawGrid() {
    const g = tum.grid, px = img.data;
    for (let i = 0; i < g.length; i++) {
      const v = g[i], k = 4 * i;
      if (v < 0) { px[k] = EMPTY_RGB[0]; px[k + 1] = EMPTY_RGB[1]; px[k + 2] = EMPTY_RGB[2]; }
      else { px[k] = COLOR_OF[3 * v]; px[k + 1] = COLOR_OF[3 * v + 1]; px[k + 2] = COLOR_OF[3 * v + 2]; }
      px[k + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(n, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== w) { canvas.width = w; canvas.height = w; }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, w, w);
  }

  // ---- drawing: plot
  let axKey = "";
  function drawPlot() {
    const H = tum.hist;
    let tMax = Math.max(150, tum.t * 1.05), yMax = M.PROG * 1.2;
    for (const h of H) yMax = Math.max(yMax, h.total * 1.05);
    for (const gh of ghosts) for (const [t, v] of gh.pts) { tMax = Math.max(tMax, t); yMax = Math.max(yMax, v * 1.05); }
    const xm = niceCeil(tMax), ym = niceCeil(yMax);
    const x0 = ML, x1 = PW - MR, y0 = PH - MB, y1 = MT;
    const sx = (t: number) => x0 + t / xm * (x1 - x0), sy = (v: number) => y0 - v / ym * (y0 - y1);
    const key = xm + "/" + ym;
    if (key !== axKey) {
      axKey = key;
      gAxes.innerHTML = "";
      for (let k = 0; k <= 4; k++) {
        const v = ym * k / 4, Y = sy(v);
        svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, class: "grid" }, gAxes);
        svgEl("text", { x: x0 - 6, y: Y + 4, "font-size": 13, "text-anchor": "end" }, gAxes).textContent = fmtN(v);
      }
      for (let k = 0; k <= 5; k++) {
        const v = xm * k / 5, X = sx(v);
        svgEl("line", { x1: X, x2: X, y1: y0, y2: y0 + 4, class: "axis" }, gAxes);
        svgEl("text", { x: X, y: y0 + 18, "font-size": 13, "text-anchor": "middle" }, gAxes).textContent = String(+v.toPrecision(3));
      }
      svgEl("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "axis" }, gAxes);
      svgEl("line", { x1: x0, x2: x0, y1: y1, y2: y0, class: "axis" }, gAxes);
      svgEl("text", { x: (x0 + x1) / 2, y: PH - 4, "font-size": 13, "text-anchor": "middle" }, gAxes).textContent = "time (days since the first cancer cell)";
      for (const [v, lab] of [[M.DIAG, "diagnosis"], [M.PROG, "progression"]] as [number, string][]) {
        svgEl("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), stroke: MUTED, "stroke-dasharray": "4 4", "stroke-width": 1 }, gAxes);
        const t = svgEl("text", { x: x1 - 2, y: sy(v) - 4, "font-size": 12, "text-anchor": "end" }, gAxes);
        t.textContent = lab; t.style.fill = MUTED;
      }
    }
    // stacked areas, bottom: sensitive, then A-res, B-res, both
    gData.innerHTML = "";
    if (H.length > 1) {
      const step = Math.max(1, Math.floor(H.length / 600));
      const idx: number[] = [];
      for (let i = 0; i < H.length; i += step) idx.push(i);
      if (idx[idx.length - 1] !== H.length - 1) idx.push(H.length - 1);
      let lower = idx.map(() => 0);
      for (let c = 0; c < 4; c++) {
        const upper = idx.map((i, k) => lower[k] + H[i].byClass[c]);
        if (upper.some((u, k) => u > lower[k])) {
          let dd = "";
          idx.forEach((i, k) => { dd += (k ? "L" : "M") + sx(H[i].t).toFixed(1) + "," + sy(upper[k]).toFixed(1); });
          for (let k = idx.length - 1; k >= 0; k--) dd += "L" + sx(H[idx[k]].t).toFixed(1) + "," + sy(lower[k]).toFixed(1);
          svgEl("path", { d: dd + "Z", fill: SHADES[c][1], "fill-opacity": 0.85, stroke: "none" }, gData);
        }
        lower = upper;
      }
      let tl = "";
      idx.forEach((i, k) => { tl += (k ? "L" : "M") + sx(H[i].t).toFixed(1) + "," + sy(H[i].total).toFixed(1); });
      svgEl("path", { d: tl, fill: "none", stroke: INK, "stroke-width": 1.4 }, gData);
      // drug bars under the axis
      for (const [key, col, yy, lab] of [["a", DRUG, y0 + 26, "A"], ["b", DRUG_B, y0 + 34, "B"]] as ["a" | "b", string, number, string][]) {
        let start = -1, any = false;
        for (let i = 0; i <= H.length; i++) {
          const on = i < H.length && H[i][key];
          if (on && start < 0) start = i;
          if (!on && start >= 0) {
            any = true;
            svgEl("rect", { x: sx(H[start].t), y: yy, width: Math.max(1, sx(H[i - 1].t) - sx(H[start].t)), height: 6, fill: col }, gData);
            start = -1;
          }
        }
        if (any) { const t = svgEl("text", { x: x0 - 6, y: yy + 6, "font-size": 11, "text-anchor": "end" }, gData); t.textContent = "drug " + lab; }
      }
    }
    // earlier runs
    gGhost.innerHTML = "";
    ghosts.forEach((gh, k) => {
      let dd = "";
      const step = Math.max(1, Math.floor(gh.pts.length / 400));
      for (let i = 0; i < gh.pts.length; i += step) dd += (dd ? "L" : "M") + sx(gh.pts[i][0]).toFixed(1) + "," + sy(gh.pts[i][1]).toFixed(1);
      svgEl("path", { d: dd, fill: "none", stroke: MUTED, "stroke-width": 1.2, "stroke-dasharray": ["6 3", "2 3", "8 3 2 3", "1 2"][k % 4] }, gGhost);
      const last = gh.pts[gh.pts.length - 1];
      const t = svgEl("text", { x: Math.min(x1 - 4, sx(last[0]) + 4), y: Math.max(y1 + 12, sy(last[1]) - 4 - 12 * k), "font-size": 11.5, "text-anchor": sx(last[0]) > x1 - 120 ? "end" : "start" }, gGhost);
      t.textContent = gh.label; t.style.fill = MUTED;
    });
    // current run marks
    gMarks.innerHTML = "";
    if (tum.tDiag >= 0) {
      const X = sx(tum.tDiag);
      svgEl("line", { x1: X, x2: X, y1: y1, y2: y0, stroke: INK, "stroke-width": 1, "stroke-dasharray": "2 3" }, gMarks);
    }
    if (tum.progDay >= 0) {
      const X = sx(tum.progDay);
      svgEl("circle", { cx: X, cy: sy(M.PROG), r: 5, fill: "none", stroke: INK, "stroke-width": 2 }, gMarks);
    }
  }

  // ---- readout
  function render() {
    drawGrid(); drawPlot();
    clock.textContent = fmtTime(simT);
    chipA.classList.toggle("on", tum.drugA);
    chipB.classList.toggle("onB", tum.drugB);
    chipA.textContent = "drug A " + (tum.drugA ? "on" : "off");
    chipB.textContent = "drug B " + (tum.drugB ? "on" : "off");
    const tot = tum.total, cl = tum.byClass(), dr = tum.byDrivers();
    const pct = (v: number) => tot ? (100 * v / tot).toFixed(v / tot < 0.1 ? 1 : 0) + " %" : "–";
    let s = `cells ${fmtN(tot)}   therapy: ${schedLabel(schedule)}\n`;
    s += `sensitive ${fmtN(cl[0])} · A-res ${fmtN(cl[1])} · B-res ${fmtN(cl[2])} · both ${fmtN(cl[3])}\n`;
    s += `drivers 0 / 1 / 2: ${pct(dr[0])} / ${pct(dr[1])} / ${pct(dr[2])}\n`;
    if (tum.tDiag < 0) s += `before diagnosis (at ${fmtN(M.DIAG)} cells)`;
    else {
      s += `diagnosis on day ${tum.tDiag.toFixed(0)}; therapy for ${(tum.t - tum.tDiag).toFixed(0)} days\n`;
      s += `smallest size ${fmtN(tum.nadir)} cells (day ${tum.nadirDay.toFixed(0)})`;
      if (tum.progDay >= 0) s += `\nprogression ${(tum.progDay - tum.tDiag).toFixed(0)} days after diagnosis`;
      if (tum.prog2Day >= 0) s += `; again on drug B after ${(tum.prog2Day - tum.tDiag).toFixed(0)} days`;
      if (tot === 0) s += "\nno cells left: cured";
      else if (finished && tum.t - tum.tDiag >= HORIZON) s += "\nstopped after 3 years of therapy";
    }
    readout.textContent = s;
  }

  // ---- batch of ten tumours
  function runBatch() {
    bBatch.disabled = true;
    const p = { ...params }, sch = schedule;
    const res: M.Outcome[] = [];
    let k = 1;
    const tr = htmlEl("tr", "", "", tbody);
    const settings = `cost −${Math.round(p.cost * 100)} %, mutation ×${+p.instability.toPrecision(2)}${p.newRes ? "" : ", no new resistance"}`;
    tr.innerHTML = `<td>${schedLabel(sch)}</td><td>${settings}</td><td colspan="3">running …</td>`;
    const next = () => {
      res.push(M.runOne(p, k, sch, HORIZON));
      tr.lastElementChild!.textContent = `running … ${k} of 10`;
      k++;
      if (k <= 10) { setTimeout(next, 0); return; }
      const cured = res.filter(o => o.cured).length;
      const ttp = res.filter(o => !o.cured).map(o => o.progAfter ?? Infinity).sort((a, b) => a - b);
      let med = "–";
      if (ttp.length) {
        const m = ttp.length % 2 ? ttp[ttp.length >> 1] : (ttp[ttp.length / 2 - 1] + ttp[ttp.length / 2]) / 2;
        med = m === Infinity ? `> ${HORIZON} days` : m.toFixed(0) + " days";
      }
      const each = res.map(o => o.cured ? "C" : o.progAfter === null ? `>${HORIZON}` : o.progAfter.toFixed(0)).join(" ");
      tr.innerHTML = `<td>${schedLabel(sch)}</td><td>${settings}</td><td>${cured} of 10</td><td>${med}</td><td>${each}</td>`;
      bBatch.disabled = false;
    };
    setTimeout(next, 30);
  }
  void bOut; void sSeed; void sCost; void sInst; void cNew;

  setSpeed(0);
  newRun(initSched, false);
  loop = visibleLoop(host, 1 / 60, step, render, 2);
  loop.redraw();
});
