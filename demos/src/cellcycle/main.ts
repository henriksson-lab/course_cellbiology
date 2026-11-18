// Cell-cycle clock with FUCCI. A dish of cells, each running the small control system in
// model.ts (cyclin D → CDK4/6 → Rb/E2F → cyclin E–CDK2, then cyclins A and B, SCF and
// APC/C, p53/p21 after DNA damage). Each nucleus shows the two FUCCI reporters (red in G1,
// green in S/G2/M, yellow at G1/S). Beside it: the DNA-content histogram of the whole dish,
// built the way a flow cytometer builds it, and the cyclins of one followed cell.
// Opens at real time (the rule for all demos); a cycle takes about a day, so the speed
// buttons offer time-lapse. Colours change smoothly: nothing flashes.
// Controls: mitogens, CDK4/6 inhibitor (palbociclib), DNA damage, spindle poison,
// p53 or RB1 lost; tap a cell to follow it.
// Options (data-*): seed, speed (index into SPEEDS, default 0 = real time), cells.
import { autoMount, htmlEl, svgEl, slider, button, presets, checkbox } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import { Population, DEFAULTS, Params, Cell, R_POINT } from "./model";

/** Speeds: hours of culture time per second on screen. */
const SPEEDS: { label: string; h: number }[] = [
  { label: "real time", h: 1 / 3600 },
  { label: "1 s = 1 min", h: 1 / 60 },
  { label: "1 s = 10 min", h: 10 / 60 },
  { label: "1 s = 30 min", h: 0.5 },
  { label: "1 s = 1 h", h: 1 },
  { label: "1 s = 2 h", h: 2 },
];
const DT = 1 / 60;                    // s of real time per loop step
const DW = 560, DH = 400;             // dish size in world units
const HW = 440, HH = 210, HL = 50, HR = 12, HT = 26, HB = 40;   // histogram plot
const PW = 440, PH = 230, ML = 50, MR = 12, MT = 12, MB = 62;   // cyclin plot
const WINDOW_H = 48;                  // hours shown in the cyclin plot
const CYC = {
  D: { col: "#7048e8", name: "cyclin D (CDK4/6)" },
  E: { col: "#1c7ed6", name: "cyclin E (CDK2)" },
  A: { col: "#0ca678", name: "cyclin A (CDK2, CDK1)" },
  B: { col: "#c2255c", name: "cyclin B (CDK1)" },
};
const PHASE_COL: Record<string, string> = { G1: "#f3d3d3", S: "#d3ecd6", G2: "#bfe3c5", M: "#9fd4a8" };

const CSS = `
.qb-demo.cc { align-items: flex-start; }
.cc .cc-view { flex: 1 1 400px; max-width: 600px; min-width: 0; display: flex; flex-direction: column; gap: .45em; }
.cc .cc-stage { position: relative; width: 100%; aspect-ratio: ${DW} / ${DH}; border-radius: 6px; overflow: hidden; background: #07090c; touch-action: manipulation; cursor: pointer; }
.cc .cc-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.cc .cc-status { font-family: ui-monospace, monospace; font-size: .88em; }
.cc .cc-legend { display: flex; flex-wrap: wrap; gap: .3em .9em; font-size: .85em; align-items: center; }
.cc .cc-sw { display: inline-block; width: .95em; height: .95em; border-radius: 50%; vertical-align: -.12em; margin-right: .3em; border: 1px solid #555; }
.cc .cc-side { flex: 1 1 340px; max-width: 480px; min-width: 0; }
.cc .cc-plot { width: 100%; height: auto; }
.cc .cc-h { font-weight: 600; font-size: .95em; margin-top: .25em; }
.cc .qb-presets .qb-btn { min-height: 36px; }
.cc .cc-hint { border-left: 4px solid #e8590c; padding: .15em .5em; font-size: .9em; }
.cc .cc-hint[hidden] { display: none; }
.cc .cc-group { display: flex; flex-direction: column; gap: .4em; border-left: 3px solid #e8590c; padding-left: .6em; }
.cc .cc-group.cc-mut { border-left-color: #6b4fa0; }
.cc .cc-group .qb-btn { align-self: flex-start; }
.cc .qb-readout { white-space: pre-wrap; font-size: .85em; }
@media (max-width: 640px) {
  .cc .qb-btn { min-height: 44px; }
  .cc .cc-view, .cc .cc-side { width: 100%; max-width: 100%; flex-basis: auto; }
}
`;

function injectCSS() {
  if (document.getElementById("cc-style")) return;
  const s = document.createElement("style");
  s.id = "cc-style"; s.textContent = CSS;
  document.head.appendChild(s);
}

const fmtH = (h: number) => h < 1 ? `${(h * 60).toFixed(0)} min` : `${h.toFixed(1)} h`;
const pct = (x: number) => `${Math.round(100 * x)} %`;

autoMount("cellcycle", host => {
  injectCSS();
  host.classList.add("cc");
  const ds = host.dataset;
  let seed = Number(ds.seed) || 1;
  const n0 = Number(ds.cells) || 300;
  let speed = Math.min(SPEEDS.length - 1, Math.max(0, Number(ds.speed) || 0));
  const p: Params = { ...DEFAULTS };
  const pop = new Population(p, seed, n0, DW, DH);
  let magenta = false, histFucci = true;
  let follow: Cell = pickStart();
  let hist: { t: number; D: number; E: number; A: number; B: number; R: number; p21: number; ph: string }[] = [];
  let doses = 0;

  // ---- the dish
  const view = htmlEl("div", "cc-view", "", host);
  htmlEl("div", "cc-h", "A dish of cells with the FUCCI reporters (tap a cell to follow it)", view);
  const stage = htmlEl("div", "cc-stage", "", view);
  const canvas = htmlEl("canvas", "cc-canvas", "", stage);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Cells in a dish, nuclei coloured by the FUCCI reporters");
  const ctx = canvas.getContext("2d")!;
  const status = htmlEl("div", "cc-status", "", view);
  const legend = htmlEl("div", "cc-legend", "", view);
  const hint = htmlEl("div", "cc-hint", "", view);
  const tools = htmlEl("div", "qb-presets", "", view);
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(tools, "Reset all", () => resetAll());
  htmlEl("div", "cc-h", "Clock speed", view);
  const speedBtns = presets(view, SPEEDS.map((s, k) => ({ label: s.label, apply: () => { speed = k; showHint(); } })));
  speedBtns[speed].classList.add("active");
  const cMag = checkbox(view, "magenta instead of red (easier for red–green colour blindness)", false, v => { magenta = v; paintLegend(); render(); });

  stage.addEventListener("click", ev => {
    const r = stage.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * DW, y = (ev.clientY - r.top) / r.height * DH;
    let best: Cell | null = null, bd = 1e9;
    for (const c of pop.cells) { const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd) { bd = d; best = c; } }
    if (best && bd < 30 * 30) { follow = best; hist = []; record(); render(); }
  });

  // ---- side panel: histogram, cyclin plot, controls
  const side = htmlEl("div", "qb-panel cc-side", "", host);
  htmlEl("div", "cc-h", "DNA content of every cell in the dish (flow cytometry)", side);
  const hsvg = svgEl("svg", { viewBox: `0 0 ${HW} ${HH}`, class: "cc-plot" }, side);
  hsvg.setAttribute("role", "img");
  hsvg.setAttribute("aria-label", "Histogram of DNA content");
  const hGates = svgEl("g", {}, hsvg), hBars = svgEl("g", {}, hsvg), hAxes = svgEl("g", {}, hsvg);
  checkbox(side, "colour the histogram by FUCCI colour", true, v => { histFucci = v; render(); });

  htmlEl("div", "cc-h", "Inside the followed cell (white ring)", side);
  const psvg = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "cc-plot" }, side);
  psvg.setAttribute("role", "img");
  psvg.setAttribute("aria-label", "Cyclin levels over time in the followed cell");
  const pBands = svgEl("g", {}, psvg), pAxes = svgEl("g", {}, psvg), pLines = svgEl("g", {}, psvg);
  const plegend = htmlEl("div", "cc-legend", "", side);
  for (const k of ["D", "E", "A", "B"] as const) {
    const s = htmlEl("span", "", "", plegend);
    const sw = htmlEl("span", "cc-sw", "", s); sw.style.background = CYC[k].col; sw.style.borderRadius = "2px"; sw.style.height = ".3em"; sw.style.border = "none";
    s.append(CYC[k].name);
  }
  {
    const s = htmlEl("span", "", "", plegend);
    s.innerHTML = `<svg width="26" height="10" style="vertical-align:middle;margin-right:.3em"><line x1="0" x2="26" y1="5" y2="5" stroke="#1b2a3a" stroke-width="2" stroke-dasharray="5 3"/></svg>Rb phosphorylated (E2F free)`;
    const s2 = htmlEl("span", "", "", plegend);
    s2.innerHTML = `<svg width="26" height="10" style="vertical-align:middle;margin-right:.3em"><line x1="0" x2="26" y1="5" y2="5" stroke="#e8590c" stroke-width="2.5" stroke-dasharray="2 3"/></svg>p21 (CDK inhibitor)`;
  }
  const readout = htmlEl("div", "qb-readout", "", side);

  htmlEl("div", "cc-h", "Treat the dish", side);
  const g1 = htmlEl("div", "cc-group", "", side);
  const sMito = slider(g1, "mitogens (serum)", 0, 100, 5, 100, v => { p.mitogen = v / 100; }, v => v + " %");
  const sInh = slider(g1, "CDK4/6 inhibitor", 0, 100, 5, 0, v => { p.cdk46inh = v / 100; }, v => v + " %");
  htmlEl("div", "qb-note", "Inhibitor: the percentage of CDK4/6 activity blocked, as by palbociclib.", g1);
  button(g1, "DNA damage: irradiate the dish", () => { pop.irradiate(1); doses++; render(); });
  const cPoison = checkbox(g1, "spindle poison (e.g. nocodazole)", false, v => { p.spindlePoison = v; });
  htmlEl("div", "cc-h", "Change the cells (mutations)", side);
  const g2 = htmlEl("div", "cc-group cc-mut", "", side);
  const cP53 = checkbox(g2, "p53 lost (as in about half of cancers)", false, v => { p.p53lost = v; });
  const cRb = checkbox(g2, "RB1 lost (no Rb protein)", false, v => { p.rbLost = v; });
  htmlEl("div", "qb-note", `Model: each cell runs a few differential equations for its control system (cyclin D → CDK4/6 → Rb/E2F → cyclin E–CDK2 with positive feedback; SCF and APC/C destroy cyclins and the FUCCI reporters; DNA damage → p53 → p21). A simplified caricature with illustrative numbers: qualitatively right, not quantitatively. Typical phase lengths of a human cell line (G1 about 8 h and the most variable, S 8 h, G2 4 h, M 1 h). Left out: cell death, senescence, cell size, contact inhibition. Cells arrested by a spindle poison stay in mitosis here; real cells die or slip out after many hours. When the dish holds more than 1200 cells, half are removed at random (the culture is split, as in the lab), which does not change the histogram's shape.`, side);

  // ---- drawing
  function pickStart(): Cell {
    // a cell in early G1 near the middle, so the first cycle is visible from the start
    let best = pop.cells[0], bs = 1e9;
    for (const c of pop.cells) {
      const s = (c.phase === "G1" ? c.t : 30) * 40 + Math.hypot(c.x - DW / 2, c.y - DH / 2);
      if (s < bs) { bs = s; best = c; }
    }
    return best;
  }
  function paintLegend() {
    legend.innerHTML = "";
    const red = magenta ? "rgb(235,40,235)" : "rgb(235,40,40)";
    const yel = magenta ? "rgb(235,235,235)" : "rgb(235,235,40)";
    const items: [string, string][] = [
      [red, "red: G1 (Cdt1 reporter)"],
      [yel, magenta ? "white: G1/S (both)" : "yellow: G1/S (both)"],
      ["rgb(40,220,60)", "green: S, G2, M (geminin reporter)"],
      ["#222", "dark: just divided (early G1)"],
    ];
    for (const [c, t] of items) {
      const s = htmlEl("span", "", "", legend);
      const sw = htmlEl("span", "cc-sw", "", s); sw.style.background = c;
      s.append(t);
    }
  }
  function cellRGB(c: Cell): [number, number, number] {
    const r = Math.min(1, c.red / 2.5), g = Math.min(1, c.green / 2.5);
    const R = Math.round(25 + 215 * r), G = Math.round(25 + 205 * g);
    return magenta ? [R, Math.max(G, Math.round(25 + 205 * Math.min(r, g))), R] : [R, G, 30];
  }
  function drawDish() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const sx = w / DW, sy = h / DH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#07090c"; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    for (const c of pop.cells) {
      const [R, G, B] = cellRGB(c);
      ctx.fillStyle = `rgb(${R},${G},${B})`;
      ctx.beginPath();
      if (c.phase === "M") ctx.arc(c.x, c.y, 4.2, 0, 6.2832);            // round, compact in mitosis
      else ctx.ellipse(c.x, c.y, 6.2, 4.4, c.ang, 0, 6.2832);
      ctx.fill();
    }
    // followed cell
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(follow.x, follow.y, 10, 0, 6.2832); ctx.stroke();
  }

  let hMax = 40;
  function drawHist() {
    const lo = 0, hi = 520, bw = 10, nb = (hi - lo) / bw;
    const counts = { red: new Array(nb).fill(0), yellow: new Array(nb).fill(0), green: new Array(nb).fill(0), dark: new Array(nb).fill(0) };
    for (const c of pop.cells) {
      const k = Math.floor((Population.stain(c) - lo) / bw);
      if (k >= 0 && k < nb) counts[Population.fucci(c)][k]++;
    }
    let m = 0;
    for (let k = 0; k < nb; k++) m = Math.max(m, counts.red[k] + counts.yellow[k] + counts.green[k] + counts.dark[k]);
    // y scale grows at once and shrinks only slowly, so the plot does not jump
    if (m > hMax) hMax = Math.ceil(m / 20) * 20;
    else if (m < 0.45 * hMax) hMax = Math.max(20, Math.ceil(m / 0.8 / 20) * 20);
    const sx = (v: number) => HL + (v - lo) / (hi - lo) * (HW - HL - HR);
    const sy = (v: number) => HH - HB - v / hMax * (HH - HT - HB);
    // gates
    hGates.innerHTML = "";
    const g = pop.gates();
    const gates: [number, number, string, number][] = [[lo, 230, "G1", g.g1], [230, 370, "S", g.s], [370, hi, "G2/M", g.g2m]];
    gates.forEach(([a, b, name, f], i) => {
      svgEl("rect", { x: sx(a), y: HT - 2, width: sx(b) - sx(a), height: HH - HB - HT + 2, fill: i % 2 ? "#f1f3f5" : "#ffffff" }, hGates);
      const t = svgEl("text", { x: (sx(Math.max(a, 120)) + sx(Math.min(b, 480))) / 2, y: HT - 8, "font-size": 14, "text-anchor": "middle", "font-weight": 600 }, hGates);
      t.textContent = `${name} ${pct(f)}`;
    });
    // bars (stacked by FUCCI colour, or one colour)
    hBars.innerHTML = "";
    const order: (keyof typeof counts)[] = ["red", "yellow", "green", "dark"];
    const fill: Record<string, string> = histFucci
      ? { red: magenta ? "#c837c8" : "#d6336c", yellow: magenta ? "#bbbbbb" : "#e0b800", green: "#2f9e44", dark: "#495057" }
      : { red: "#4c6ef5", yellow: "#4c6ef5", green: "#4c6ef5", dark: "#4c6ef5" };
    const d: Record<string, string> = { red: "", yellow: "", green: "", dark: "" };
    const bx = sx(bw) - sx(0) - 1;
    for (let k = 0; k < nb; k++) {
      let base = 0;
      for (const o of order) {
        const v = counts[o][k];
        if (!v) continue;
        const y1 = sy(base + v), y0 = sy(base);
        d[o] += `M${(sx(lo + k * bw) + 0.5).toFixed(1)},${y0.toFixed(1)}h${bx.toFixed(1)}V${y1.toFixed(1)}h${(-bx).toFixed(1)}Z`;
        base += v;
      }
    }
    for (const o of order) if (d[o]) svgEl("path", { d: d[o], fill: fill[o] }, hBars);
    // axes
    hAxes.innerHTML = "";
    svgEl("line", { x1: HL, x2: HW - HR, y1: HH - HB, y2: HH - HB, class: "axis" }, hAxes);
    svgEl("line", { x1: HL, x2: HL, y1: HT, y2: HH - HB, class: "axis" }, hAxes);
    for (const [v, lab] of [[0, "0"], [100, "100"], [200, "200 (2N)"], [300, "300"], [400, "400 (4N)"], [500, "500"]] as [number, string][]) {
      svgEl("line", { x1: sx(v), x2: sx(v), y1: HH - HB, y2: HH - HB + 5, class: "axis" }, hAxes);
      svgEl("text", { x: sx(v), y: HH - HB + 19, "font-size": 13, "text-anchor": "middle" }, hAxes).textContent = lab;
    }
    for (const v of [0, hMax / 2, hMax]) {
      svgEl("line", { x1: HL - 4, x2: HL, y1: sy(v), y2: sy(v), class: "axis" }, hAxes);
      svgEl("text", { x: HL - 7, y: sy(v) + 5, "font-size": 13, "text-anchor": "end" }, hAxes).textContent = String(v);
    }
    svgEl("text", { x: (HL + HW - HR) / 2, y: HH - 4, "font-size": 14, "text-anchor": "middle" }, hAxes).textContent = "DNA stain (propidium iodide), fluorescence";
    const yl = svgEl("text", { x: 13, y: (HT + HH - HB) / 2, "font-size": 14, "text-anchor": "middle", transform: `rotate(-90 13 ${(HT + HH - HB) / 2})` }, hAxes);
    yl.textContent = "cells";
  }

  function drawCyclins() {
    const tNow = pop.t;
    const t0 = Math.max(0, tNow - WINDOW_H), t1 = t0 + WINDOW_H;
    const sx = (t: number) => ML + (t - t0) / WINDOW_H * (PW - ML - MR);
    const yTop = MT, yBot = PH - MB;
    const sy = (v: number) => yBot - Math.min(1.05, v) * (yBot - yTop) / 1.05;
    // phase band under the axis
    pBands.innerHTML = "";
    const bandY = yBot + 26, bandH = 14;
    let segStart = 0;
    for (let i = 1; i <= hist.length; i++) {
      if (i === hist.length || hist[i].ph !== hist[segStart].ph) {
        const a = Math.max(t0, hist[segStart].t), b = i < hist.length ? hist[i].t : hist[i - 1].t;
        if (b > t0 && b > a) {
          svgEl("rect", { x: sx(a), y: bandY, width: Math.max(0.5, sx(b) - sx(a)), height: bandH, fill: PHASE_COL[hist[segStart].ph], stroke: "#fff", "stroke-width": 0.5 }, pBands);
          if (sx(b) - sx(a) > 20) svgEl("text", { x: (sx(a) + sx(b)) / 2, y: bandY + 11.5, "font-size": 11.5, "text-anchor": "middle" }, pBands).textContent = hist[segStart].ph;
        }
        segStart = i;
      }
    }
    pAxes.innerHTML = "";
    svgEl("line", { x1: ML, x2: PW - MR, y1: yBot, y2: yBot, class: "axis" }, pAxes);
    svgEl("line", { x1: ML, x2: ML, y1: yTop, y2: yBot, class: "axis" }, pAxes);
    const step = 12;
    for (let v = Math.ceil(t0 / step) * step; v <= t1 + 1e-9; v += step) {
      const x = sx(v);
      svgEl("line", { x1: x, x2: x, y1: yBot, y2: yBot + 5, class: "axis" }, pAxes);
      svgEl("text", { x, y: yBot + 19, "font-size": 13, "text-anchor": "middle" }, pAxes).textContent = String(v);
    }
    for (const v of [0, 0.5, 1]) {
      svgEl("line", { x1: ML - 4, x2: ML, y1: sy(v), y2: sy(v), class: "axis" }, pAxes);
      svgEl("text", { x: ML - 7, y: sy(v) + 5, "font-size": 13, "text-anchor": "end" }, pAxes).textContent = String(v);
    }
    svgEl("line", { x1: ML, x2: PW - MR, y1: sy(R_POINT), y2: sy(R_POINT), stroke: "#adb5bd", "stroke-dasharray": "3 4" }, pAxes);
    svgEl("text", { x: PW - MR - 2, y: sy(R_POINT) - 4, "font-size": 11.5, "text-anchor": "end", fill: "#6c757d" }, pAxes).textContent = "restriction point";
    svgEl("text", { x: (ML + PW - MR) / 2, y: PH - 4, "font-size": 14, "text-anchor": "middle" }, pAxes).textContent = "time (hours)";
    const yl = svgEl("text", { x: 13, y: (yTop + yBot) / 2, "font-size": 14, "text-anchor": "middle", transform: `rotate(-90 13 ${(yTop + yBot) / 2})` }, pAxes);
    yl.textContent = "level (0–1)";
    pLines.innerHTML = "";
    const vis = hist.filter(h => h.t >= t0 - 0.2);
    const path = (f: (h: typeof hist[number]) => number) => vis.map((h, k) => `${k ? "L" : "M"}${sx(h.t).toFixed(1)},${sy(f(h)).toFixed(1)}`).join("");
    for (const k of ["D", "E", "A", "B"] as const) svgEl("path", { d: path(h => h[k]), fill: "none", stroke: CYC[k].col, "stroke-width": 2.2 }, pLines);
    svgEl("path", { d: path(h => h.R), fill: "none", stroke: "#1b2a3a", "stroke-width": 1.8, "stroke-dasharray": "6 4" }, pLines);
    svgEl("path", { d: path(h => h.p21), fill: "none", stroke: "#e8590c", "stroke-width": 2.5, "stroke-dasharray": "2 3" }, pLines);
  }

  function render() {
    if (!pop.cells.includes(follow)) { follow = pickStart(); hist = []; record(); }
    drawDish();
    drawHist();
    drawCyclins();
    const fr = pop.phaseFractions();
    status.textContent = `time ${fmtH(pop.t)} · ${pop.cells.length} cells in the dish`
      + (pop.passaged ? ` · split ${pop.passaged}× (cells if never split: ${Math.round(pop.totalCells())})` : "")
      + (doses ? ` · irradiated ${doses}×` : "");
    const c = follow;
    const past = c.phase !== "G1" || c.Rbp > R_POINT;
    const rpText = p.rbLost ? "no Rb protein: E2F free, no restriction point" : past ? "past the restriction point" : "before the restriction point";
    readout.textContent =
      `followed cell: ${c.phase}, ${fmtH(c.t)} in this phase · DNA ${Population.dna(c).toFixed(1)}N · FUCCI ${Population.fucci(c)}\n`
      + `Rb phosphorylated ${c.Rbp.toFixed(2)} · ${rpText} · p53 ${c.p53.toFixed(2)} · p21 ${c.p21.toFixed(2)} · DNA damage ${c.dmg.toFixed(2)}\n`
      + `whole dish (true phases): G1 ${pct(fr.G1)} · S ${pct(fr.S)} · G2 ${pct(fr.G2)} · M ${pct(fr.M)}`;
  }

  function record() {
    const c = follow, last = hist[hist.length - 1];
    if (!last || pop.t - last.t >= 0.05 || last.ph !== c.phase) {
      hist.push({ t: pop.t, D: c.D, E: Math.min(1, c.E / 1.6), A: c.A, B: c.B, R: c.Rbp, p21: Math.min(1, c.p21), ph: c.phase });
      if (hist.length > 3000) hist.splice(0, hist.length - 2500);
    }
  }
  function showHint() {
    hint.hidden = speed !== 0;
    hint.textContent = "Real time: a human cell needs about a day for one cycle, so at this speed you will see almost nothing change. Choose a faster clock speed to watch a time-lapse, as a microscope would record it.";
  }
  function resetAll() {
    Object.assign(p, DEFAULTS);
    sMito.set(100); sInh.set(0); cPoison.checked = false; cP53.checked = false; cRb.checked = false;
    seed = Number(ds.seed) || 1;
    pop.reset(seed, n0);
    doses = 0; hMax = 40;
    follow = pickStart(); hist = [];
    record(); render();
  }

  const loop = visibleLoop(host, DT, () => {
    pop.step(SPEEDS[speed].h * DT);
    record();
  }, render);
  void cMag;
  paintLegend(); showHint();
  record(); render();
  new ResizeObserver(() => loop.redraw()).observe(stage);
});
