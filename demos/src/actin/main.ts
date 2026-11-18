// Actin treadmilling and a lamellipodium. Two tabs:
//  1. One filament in a large pool of G-actin: subunits join and leave at the two ends
//     with end-specific rates (filament.ts). Concentration slider, capping protein,
//     cytochalasin D, latrunculin, phalloidin. A rate plot (net rate at each end versus
//     free G-actin, with the two critical concentrations) and a plot of the two end
//     positions over time. Coloured subunits show ATP hydrolysis; dyed "speckles" stay put
//     while the filament treadmills.
//  2. The leading edge of a lamellipodium (lamella.ts): Arp2/3 branches push the membrane;
//     capping protein and cofilin set how fast. Edge speed over time, and a sweep that
//     measures the speed at several levels of one protein.
// Options (data-*): tab = 1|2, c (µM G-actin for tab 1), seed.
import { autoMount, htmlEl, svgEl, slider, button, checkbox, presets } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import * as Fm from "./filament";
import * as Lm from "./lamella";

const STYLE = `
.qb-demo.ac { display: block; }
.ac .ac-tabs { margin-bottom: .6em; }
.ac .ac-tabs .qb-btn, .ac .qb-presets .qb-btn { min-height: 36px; }
.ac .ac-pane { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 420px); grid-template-areas: "main side" "plots side"; grid-template-rows: auto 1fr;
  column-gap: 1.4em; row-gap: .8em; align-items: start; }
.ac .ac-pane[hidden] { display: none; }
.ac .ac-main { grid-area: main; min-width: 0; display: flex; flex-direction: column; gap: .45em; }
.ac .ac-side { grid-area: side; min-width: 0; display: flex; flex-direction: column; gap: .55em; }
.ac .ac-plots { grid-area: plots; min-width: 0; }
.ac .ac-stage.ac-fil { aspect-ratio: 1000 / 300; }
.ac .ac-stage { position: relative; width: 100%; border-radius: 6px; overflow: hidden; border: 1px solid #ccd; background: #fbfaf5; }
.ac .ac-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ac .ac-status { font-family: ui-monospace, monospace; font-size: .85em; color: var(--qb-muted); }
.ac .ac-legend { display: flex; flex-wrap: wrap; gap: .15em 1em; font-size: .88em; }
.ac .ac-legend span::before { content: ""; display: inline-block; width: .8em; height: .8em; border-radius: 50%;
  margin-right: .35em; vertical-align: -.05em; background: var(--dot); border: 1px solid rgba(0,0,0,.25); }
.ac .ac-plots { display: flex; flex-wrap: wrap; gap: .8em; }
.ac .ac-plotbox { flex: 1 1 280px; min-width: 0; }
.ac .ac-plot { width: 100%; max-width: 520px; height: auto; display: block; }
.ac .ac-plots.ac-narrow { max-width: 560px; }
.ac .qb-slider { grid-template-columns: auto 1fr 5.6em; }
.ac .qb-slider output { white-space: nowrap; }
.ac .ac-h { font-weight: 600; font-size: .95em; margin-bottom: .15em; }
.ac .ac-verdict { font-size: 1.15em; font-weight: 700; }
.ac .ac-group { display: flex; flex-direction: column; gap: .4em; border-left: 3px solid #e8590c; padding-left: .6em; }
.ac .ac-group.ac-prot { border-color: #868e96; }
.ac .ac-select { font: inherit; font-size: .9em; padding: .15em .3em; grid-column: 2 / span 2; }
.ac .qb-btn:disabled { opacity: .5; cursor: default; }
.ac .ac-big { font-size: 1.2em; font-weight: 700; font-variant-numeric: tabular-nums; }
.ac.ac-1col .ac-pane { grid-template-columns: minmax(0, 1fr); grid-template-areas: "main" "side" "plots"; grid-template-rows: auto; }
.ac.ac-1col .ac-main, .ac.ac-1col .ac-plots { max-width: 760px; }
@media (max-width: 760px) {
  .ac .ac-stage.ac-fil { aspect-ratio: 1000 / 560; }
}`;

const C_ATP = "#ffd166", C_ADPPI = "#d39b2a", C_ADP = "#8a9099", C_SPECK = "#2fb344";
const C_BARB = "#1971c2", C_POINT = "#9c36b5", C_DRUG = "#e8590c", C_CAP = "#d6336c", C_ARP = "#7048e8";
const C_MEM = "#8a6a12", C_TEXT = "#1b2a3a";
const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 20];

function injectStyle() {
  if (document.getElementById("ac-style")) return;
  const s = document.createElement("style");
  s.id = "ac-style"; s.textContent = STYLE;
  document.head.appendChild(s);
}

/** Resize a canvas to its CSS box × devicePixelRatio; returns [w, h, dpr]. */
function fitCanvas(cv: HTMLCanvasElement): [number, number, number] {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return [w, h, dpr];
}

function speedSelect(parent: Element, value: number, onChange: (v: number) => void): HTMLSelectElement {
  const row = htmlEl("label", "qb-slider", "", parent);
  htmlEl("span", "qb-slider-name", "time runs at", row);
  const sel = htmlEl("select", "ac-select", "", row);
  for (const v of SPEEDS) { const o = htmlEl("option", "", v + "× real time", sel); o.value = String(v); }
  sel.value = String(value);
  sel.addEventListener("change", () => { onChange(Number(sel.value)); sel.blur(); });
  return sel;
}

function legend(parent: Element, items: [string, string][]): void {
  const l = htmlEl("div", "ac-legend", "", parent);
  for (const [c, t] of items) { const s = htmlEl("span", "", t, l); s.style.setProperty("--dot", c); }
}

const f1 = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
const sgn = (v: number, d = 2) => (v > 0.004 ? "+" : "") + (Math.abs(v) < 0.005 ? "0" : v.toFixed(d));

autoMount("actin", host => {
  injectStyle();
  host.classList.add("ac");
  // one column when the demo is narrow (page column, phone); two columns when wide
  const fitCols = () => host.classList.toggle("ac-1col", host.clientWidth < 900);
  fitCols();
  if ("ResizeObserver" in window) new ResizeObserver(fitCols).observe(host);
  const d = host.dataset;
  const seed = Number(d.seed) || 1;
  const tabs = htmlEl("div", "qb-presets ac-tabs", "", host);
  const pane1 = htmlEl("div", "ac-pane", "", host);
  const pane2 = htmlEl("div", "ac-pane", "", host);
  const t1 = button(tabs, "1 · One filament: treadmilling", () => show(1));
  const t2 = button(tabs, "2 · Lamellipodium: pushing the edge", () => show(2));
  const tab1 = buildTab1(pane1, Number(d.c) >= 0 && d.c !== undefined ? Number(d.c) : 0.3, seed);
  const tab2 = buildTab2(pane2, seed);
  function show(k: number) {
    pane1.hidden = k !== 1; pane2.hidden = k !== 2;
    t1.classList.toggle("active", k === 1); t2.classList.toggle("active", k === 2);
    tab1.setActive(k === 1); tab2.setActive(k === 2);
  }
  show(d.tab === "2" ? 2 : 1);
});

// ======================================================================= tab 1
function buildTab1(pane: HTMLElement, c0: number, seed: number) {
  let cTot = c0;
  const drugs: Fm.Drugs = { ...Fm.NO_DRUGS };
  let speed = 1;
  let fil = new Fm.Filament(100, seed);
  let nFil = 0;
  let hist: { t: number; p: number; b: number }[] = [];
  let active = true;
  // camera (in subunits): centre and span; eased towards a target
  let camC = 0, camS = 220, tgtC = 0, tgtS = 220;

  const main = htmlEl("div", "ac-main", "", pane);
  const stage = htmlEl("div", "ac-stage ac-fil", "", main);
  const cv = htmlEl("canvas", "", "", stage);
  cv.setAttribute("aria-label", "One actin filament seen from the side, with free actin monomers around it");
  const ctx = cv.getContext("2d")!;
  legend(main, [[C_ATP, "ATP-actin"], [C_ADPPI, "ADP-Pi-actin"], [C_ADP, "ADP-actin"], [C_SPECK, "dyed subunit (speckle)"], ["#ced4da", "free G-actin"]]);
  const status = htmlEl("div", "ac-status", "", main);
  const tools = htmlEl("div", "qb-presets", "", main);
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(tools, "New filament", () => newFilament());
  speedSelect(main, speed, v => { speed = v; });

  // ---- side panel
  const side = htmlEl("div", "ac-side", "", pane);
  const plots = htmlEl("div", "ac-plots", "", pane);
  const pb1 = htmlEl("div", "ac-plotbox", "", plots);
  htmlEl("div", "ac-h", "Net growth at each end", pb1);
  const RW = 380, RH = 250, RL = 48, RR = 12, RT = 12, RB = 42;
  const rsvg = svgEl("svg", { viewBox: `0 0 ${RW} ${RH}`, class: "ac-plot" }, pb1);
  const pb2 = htmlEl("div", "ac-plotbox", "", plots);
  htmlEl("div", "ac-h", "Where the two ends are (last 60 s)", pb2);
  const ksvg = svgEl("svg", { viewBox: `0 0 ${RW} ${RH}`, class: "ac-plot" }, pb2);

  const verdictEl = htmlEl("div", "ac-verdict", "", side);
  const readout = htmlEl("div", "qb-readout", "", side);
  const sC = slider(side, "G-actin", 0, 1.5, 0.01, cTot, v => { cTot = v; changed(); }, v => v.toFixed(2) + " µM");
  presets(side, [
    { label: "below both (0.05)", apply: () => setC(0.05) },
    { label: "between (0.3)", apply: () => setC(0.3) },
    { label: "steady state (0.17)", apply: () => setC(0.17) },
    { label: "above both (1.0)", apply: () => setC(1.0) },
  ]);
  const grpP = htmlEl("div", "ac-group ac-prot", "", side);
  htmlEl("div", "ac-h", "Actin-binding protein", grpP);
  const cbCap = checkbox(grpP, "capping protein on the barbed end", false, v => { drugs.capping = v; changed(); });
  const grpD = htmlEl("div", "ac-group", "", side);
  htmlEl("div", "ac-h", "Drugs", grpD);
  const cbCyto = checkbox(grpD, "cytochalasin D (binds the barbed end)", false, v => { drugs.cytoD = v; changed(); });
  const cbPhal = checkbox(grpD, "phalloidin (binds the filament)", false, v => { drugs.phalloidin = v; changed(); });
  const sLat = slider(grpD, "latrunculin", 0, 2, 0.05, 0, v => { drugs.lat = v; changed(); }, v => v.toFixed(2) + " µM");
  button(side, "Reset all", () => {
    Object.assign(drugs, Fm.NO_DRUGS); cbCap.checked = false; cbCyto.checked = false; cbPhal.checked = false; sLat.set(0);
    setC(c0); newFilament();
  });
  const note = htmlEl("div", "qb-note", "", side);
  note.textContent = "Stochastic model, qualitatively right: subunits join and leave one at a time at random moments. "
    + "Each end has one on-rate and one off-rate, measured for ATP-actin (barbed end 11.6 µM⁻¹s⁻¹ and 1.4 s⁻¹, "
    + "pointed end 1.3 µM⁻¹s⁻¹ and 0.8 s⁻¹), so the critical concentrations are 0.12 and 0.6 µM. In a real filament the ends differ "
    + "because ATP is hydrolysed after a subunit joins; the colours show this hydrolysis but do not change the rates here. "
    + "The pool is large, so the filament does not change the G-actin concentration. "
    + "Latrunculin binds G-actin 1:1 (Kd 0.2 µM); phalloidin lowers both off-rates 50-fold; "
    + "capping protein and cytochalasin D block the barbed end. The free monomers are drawn for show (number ∝ concentration); "
    + "they do not move at their real speed.";

  function setC(v: number) { cTot = v; sC.set(v); changed(); }
  function changed() { drawRatePlot(); loop.redraw(); }
  function newFilament() {
    nFil++;
    fil = new Fm.Filament(100, seed + nFil);
    hist = []; camC = 0; camS = 220; tgtC = 0; tgtS = 220;
    loop.redraw();
  }
  const cFree = () => Fm.freeActin(cTot, drugs.lat);

  // ---- pool dots (decoration): fixed seeded positions, slow drift
  const POOL_MAX = 90;
  const pool: { x: number; y: number; a: number }[] = [];
  { let s = 12345; const u = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < POOL_MAX; i++) pool.push({ x: u(), y: u(), a: u() * 6.283 }); }

  // ---- rate plot
  const RXMAX = 1.5, RYMIN = -3, RYMAX = 8;
  const rx = (c: number) => RL + c / RXMAX * (RW - RL - RR);
  const ry = (v: number) => RT + (RYMAX - Math.max(RYMIN, Math.min(RYMAX, v))) / (RYMAX - RYMIN) * (RH - RT - RB);
  function drawRatePlot() {
    rsvg.innerHTML = "";
    const y0 = RH - RB;
    for (const v of [-2, 0, 2, 4, 6, 8]) {
      svgEl("line", { x1: RL, x2: RW - RR, y1: ry(v), y2: ry(v), class: v === 0 ? "axis" : "grid" }, rsvg);
      const t = svgEl("text", { x: RL - 6, y: ry(v) + 4, "font-size": 13, "text-anchor": "end" }, rsvg); t.textContent = String(v);
    }
    svgEl("line", { x1: RL, x2: RL, y1: RT, y2: y0, class: "axis" }, rsvg);
    for (const c of [0, 0.5, 1, 1.5]) {
      const t = svgEl("text", { x: rx(c), y: y0 + 17, "font-size": 13, "text-anchor": "middle" }, rsvg); t.textContent = String(c);
    }
    const xl = svgEl("text", { x: (RL + RW - RR) / 2, y: RH - 6, "font-size": 13, "text-anchor": "middle" }, rsvg);
    xl.textContent = "free G-actin (µM)";
    const yl = svgEl("text", { x: 13, y: (RT + y0) / 2, "font-size": 13, "text-anchor": "middle", transform: `rotate(-90 13 ${(RT + y0) / 2})` }, rsvg);
    yl.textContent = "subunits / s";
    // critical concentrations (of the current conditions)
    const r1 = Fm.rates(1, drugs);
    const ccB = r1.barbedBlocked ? NaN : r1.bOff / r1.bOn, ccP = r1.pOff / r1.pOn;
    for (const [cc, col, lab, dy] of [[ccB, C_BARB, "Cc+", 0], [ccP, C_POINT, "Cc−", 0]] as [number, string, string, number][]) {
      if (!Number.isFinite(cc) || cc > RXMAX) continue;
      svgEl("line", { x1: rx(cc), x2: rx(cc), y1: RT, y2: y0, stroke: col, "stroke-dasharray": "4 4", "stroke-width": 1.5 }, rsvg);
      const t = svgEl("text", { x: rx(cc) + 4, y: RT + 14 + dy, "font-size": 13 }, rsvg); t.textContent = lab;
      (t as SVGTextElement).style.fill = col;
    }
    // lines
    const line = (fn: (c: number) => number, col: string, dash = "") => {
      let p = "";
      for (let k = 0; k <= 150; k++) { const c = RXMAX * k / 150; p += (p ? "L" : "M") + rx(c).toFixed(1) + "," + ry(fn(c)).toFixed(1); }
      svgEl("path", { d: p, fill: "none", stroke: col, "stroke-width": 2.5, "stroke-dasharray": dash }, rsvg);
    };
    line(c => Fm.netRates(c, drugs).barbed, C_BARB, r1.barbedBlocked ? "6 4" : "");
    line(c => Fm.netRates(c, drugs).pointed, C_POINT);
    // labels at the right
    const lb = r1.barbedBlocked
      ? svgEl("text", { x: rx(0.03), y: ry(0) - 8, "font-size": 13 }, rsvg)
      : svgEl("text", { x: RW - RR - 2, y: ry(RYMAX) + 16, "font-size": 13, "text-anchor": "end" }, rsvg);
    lb.textContent = r1.barbedBlocked ? "barbed end (blocked)" : "barbed end"; (lb as SVGTextElement).style.fill = C_BARB;
    const lp = svgEl("text", { x: RW - RR - 2, y: ry(Fm.netRates(RXMAX, drugs).pointed) - 8, "font-size": 13, "text-anchor": "end" }, rsvg);
    lp.textContent = "pointed end"; (lp as SVGTextElement).style.fill = C_POINT;
    // current concentration
    const c = cFree(), n = Fm.netRates(c, drugs);
    svgEl("line", { x1: rx(Math.min(c, RXMAX)), x2: rx(Math.min(c, RXMAX)), y1: RT, y2: y0, stroke: C_TEXT, "stroke-width": 1 }, rsvg);
    svgEl("circle", { cx: rx(c), cy: ry(n.barbed), r: 5, fill: C_BARB, stroke: "#fff", "stroke-width": 1.5 }, rsvg);
    svgEl("circle", { cx: rx(c), cy: ry(n.pointed), r: 5, fill: C_POINT, stroke: "#fff", "stroke-width": 1.5 }, rsvg);
  }

  // ---- kymograph-like plot of end positions
  function drawEnds() {
    ksvg.innerHTML = "";
    const y0 = RH - RB, x0 = RL, x1 = RW - RR;
    const tNow = fil.t, tMin = tNow - 60;
    const pts = hist.filter(h => h.t >= tMin);
    let lo = Infinity, hi = -Infinity;
    for (const h of pts) { lo = Math.min(lo, h.p); hi = Math.max(hi, h.b); }
    if (!pts.length) { lo = fil.p0; hi = fil.barbedPos; }
    // nm, with a nice range
    const nmLo = lo * Fm.NM_PER_SUB, nmHi = hi * Fm.NM_PER_SUB;
    const span = Math.max(200, nmHi - nmLo);
    const step = span > 1500 ? 500 : span > 600 ? 200 : 100;
    const yMin = Math.floor((nmLo - span * 0.08) / step) * step, yMax = Math.ceil((nmHi + span * 0.08) / step) * step;
    const sx = (t: number) => x0 + (t - tMin) / 60 * (x1 - x0);
    const sy = (nm: number) => RT + (yMax - nm) / (yMax - yMin) * (y0 - RT);
    for (let v = yMin; v <= yMax + 1e-6; v += step) {
      svgEl("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), class: "grid" }, ksvg);
      const t = svgEl("text", { x: x0 - 6, y: sy(v) + 4, "font-size": 13, "text-anchor": "end" }, ksvg); t.textContent = String(v);
    }
    svgEl("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "axis" }, ksvg);
    svgEl("line", { x1: x0, x2: x0, y1: RT, y2: y0, class: "axis" }, ksvg);
    for (let k = 0; k <= 6; k++) {
      const t = svgEl("text", { x: x0 + k / 6 * (x1 - x0), y: y0 + 17, "font-size": 13, "text-anchor": "middle" }, ksvg);
      t.textContent = String(k * 10 - 60);
    }
    const xl = svgEl("text", { x: (x0 + x1) / 2, y: RH - 6, "font-size": 13, "text-anchor": "middle" }, ksvg);
    xl.textContent = "seconds before now";
    const yl = svgEl("text", { x: 13, y: (RT + y0) / 2, "font-size": 13, "text-anchor": "middle", transform: `rotate(-90 13 ${(RT + y0) / 2})` }, ksvg);
    yl.textContent = "position (nm)";
    if (pts.length < 2) return;
    let area = "", pb = "", pp = "";
    for (const h of pts) pb += (pb ? "L" : "M") + sx(h.t).toFixed(1) + "," + sy(h.b * Fm.NM_PER_SUB).toFixed(1);
    for (const h of pts) pp += (pp ? "L" : "M") + sx(h.t).toFixed(1) + "," + sy(h.p * Fm.NM_PER_SUB).toFixed(1);
    area = pb + [...pts].reverse().map(h => "L" + sx(h.t).toFixed(1) + "," + sy(h.p * Fm.NM_PER_SUB).toFixed(1)).join("") + "Z";
    svgEl("path", { d: area, fill: "#adb5bd", opacity: 0.35 }, ksvg);
    svgEl("path", { d: pb, fill: "none", stroke: C_BARB, "stroke-width": 2 }, ksvg);
    svgEl("path", { d: pp, fill: "none", stroke: C_POINT, "stroke-width": 2 }, ksvg);
    const lt = pts[pts.length - 1];
    const tb = svgEl("text", { x: x1 - 4, y: sy(lt.b * Fm.NM_PER_SUB) - 6, "font-size": 13, "text-anchor": "end" }, ksvg);
    tb.textContent = "barbed end"; (tb as SVGTextElement).style.fill = C_BARB;
    const tp = svgEl("text", { x: x1 - 4, y: sy(lt.p * Fm.NM_PER_SUB) + 16, "font-size": 13, "text-anchor": "end" }, ksvg);
    tp.textContent = "pointed end"; (tp as SVGTextElement).style.fill = C_POINT;
  }

  // ---- simulation
  function step() {
    const dt = speed / 60;
    fil.step(dt, cFree(), drugs);
    const last = hist[hist.length - 1];
    if (!last || fil.t - last.t >= 0.25 || fil.length === 0) {
      if (fil.length > 0) hist.push({ t: fil.t, p: fil.p0, b: fil.barbedPos });
      while (hist.length && hist[0].t < fil.t - 65) hist.shift();
    }
    for (const q of pool) { q.a += 0.02 * (Math.sin(q.x * 40 + fil.t) ); }
  }

  let frame = 0;
  function render() {
    const [w, h, dpr] = fitCanvas(cv);
    // camera: keep both ends inside the middle 84 %; ease
    const L = fil.length;
    if (L > 0) {
      const lo = fil.p0, hi = fil.barbedPos;
      const minS = Math.max(110, Math.min(220, cv.clientWidth / 4.5));
      const need = Math.max(minS, (hi - lo) * 1.35);
      if (need > camS * 1.0 || need < camS * 0.55) tgtS = need;
      const a = camC - camS * 0.42, b = camC + camS * 0.42;
      if (lo < a || hi > b) tgtC = (lo + hi) / 2;
    }
    camS += (tgtS - camS) * 0.05; camC += (tgtC - camC) * 0.05;
    const s = w / camS;                       // px per subunit
    const X = (pos: number) => w / 2 + (pos - camC) * s;
    const yMid = h * 0.5;
    ctx.fillStyle = "#fbfaf5"; ctx.fillRect(0, 0, w, h);
    // ruler (lab frame) at the bottom: tick every 50 nm
    const nmPer = Fm.NM_PER_SUB;
    const tickNm = camS * nmPer > 1500 ? 200 : camS * nmPer > 700 ? 100 : 50;
    ctx.strokeStyle = "#ced4da"; ctx.lineWidth = 1 * dpr;
    const first = Math.floor((camC - camS / 2) * nmPer / tickNm) * tickNm;
    ctx.beginPath();
    for (let nm = first; nm <= (camC + camS / 2) * nmPer + tickNm; nm += tickNm) {
      const x = X(nm / nmPer);
      ctx.moveTo(x, h - 4 * dpr); ctx.lineTo(x, h - 12 * dpr);
    }
    ctx.stroke();
    // pool of free G-actin (decoration): number ∝ total G-actin; latrunculin-bound ones in orange
    const c = cFree();
    const nDots = Math.round(Math.min(POOL_MAX, cTot / 1.5 * POOL_MAX));
    const nBound = Math.round(nDots * (cTot > 0 ? 1 - c / cTot : 0));
    const rr = 3.2 * dpr;
    for (let i = 0; i < nDots; i++) {
      const q = pool[i];
      const x = q.x * w + Math.cos(q.a) * 4 * dpr, y = 10 * dpr + q.y * (h - 40 * dpr) + Math.sin(q.a) * 4 * dpr;
      if (Math.abs(y - yMid) < 14 * dpr) continue;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.283);
      ctx.fillStyle = "#ced4da"; ctx.fill();
      if (i < nBound) { ctx.lineWidth = 2 * dpr; ctx.strokeStyle = C_DRUG; ctx.stroke(); }
    }
    // the filament: two strands of beads (actin is a two-stranded helix)
    const R = Math.max(1.6 * dpr, Math.min(6 * dpr, s * 1.05));
    const amp = Math.max(1.4 * dpr, Math.min(5 * dpr, s * 0.95));
    const t = fil.t;
    for (let i = 0; i < L; i++) {
      const sub = fil.subs[i], pos = fil.p0 + i + 0.5;
      const x = X(pos);
      if (x < -10 || x > w + 10) continue;
      const y = yMid + (((fil.p0 + i) & 1) ? amp : -amp);
      const nu = Fm.nucleotide(sub, t);
      ctx.beginPath(); ctx.arc(x, y, R, 0, 6.283);
      ctx.fillStyle = sub.speckle ? C_SPECK : nu === 0 ? C_ATP : nu === 1 ? C_ADPPI : C_ADP; ctx.fill();
      if (R > 2.5 * dpr) { ctx.lineWidth = 0.6 * dpr; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke(); }
    }
    if (drugs.phalloidin && L > 0) {        // phalloidin along the filament
      ctx.fillStyle = C_DRUG;
      for (let i = 3; i < L; i += 9) {
        const x = X(fil.p0 + i);
        if (x < -10 || x > w + 10) continue;
        ctx.beginPath(); ctx.arc(x, yMid, Math.max(1.5 * dpr, R * 0.45), 0, 6.283); ctx.fill();
      }
    }
    ctx.font = `${15 * dpr}px system-ui, sans-serif`; ctx.textBaseline = "middle";
    if (L > 0) {
      const xb = X(fil.barbedPos), xp = X(fil.p0);
      if (drugs.capping || drugs.cytoD) {   // a cap on the barbed end
        ctx.fillStyle = drugs.capping ? C_CAP : C_DRUG;
        const cw = 9 * dpr, ch = 26 * dpr;
        ctx.fillRect(xb + 1 * dpr, yMid - ch / 2, cw, ch);
      }
      const label = (txt: string, x: number, y: number, col: string, align: CanvasTextAlign) => {
        ctx.textAlign = align;
        const tw = ctx.measureText(txt).width;
        let xx = x;
        if (align === "left") xx = Math.min(Math.max(x, 4 * dpr), w - tw - 4 * dpr);
        else xx = Math.max(Math.min(x, w - 4 * dpr), tw + 4 * dpr);
        ctx.fillStyle = "rgba(251,250,245,.85)";
        ctx.fillRect(align === "left" ? xx - 2 * dpr : xx - tw - 2 * dpr, y - 10 * dpr, tw + 4 * dpr, 20 * dpr);
        ctx.fillStyle = col; ctx.fillText(txt, xx, y);
      };
      label("+ barbed end", xb + 14 * dpr, yMid - 26 * dpr, C_BARB, "left");
      label("pointed end −", xp - 10 * dpr, yMid + 26 * dpr, C_POINT, "right");
    } else {
      ctx.textAlign = "center"; ctx.fillStyle = C_TEXT;
      ctx.fillText("The filament has fallen apart. Press “New filament”.", w / 2, yMid);
    }
    // scale bar 100 nm (or 500), bottom left
    const barNm = camS * nmPer > 1500 ? 500 : 100, bw = barNm / nmPer * s;
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(w - bw - 20 * dpr, h - 52 * dpr, bw + 16 * dpr, 34 * dpr);
    ctx.fillStyle = C_TEXT; ctx.fillRect(w - bw - 12 * dpr, h - 26 * dpr, bw, 4 * dpr);
    ctx.font = `${13 * dpr}px system-ui, sans-serif`; ctx.textAlign = "right";
    ctx.fillText(barNm + " nm", w - 12 * dpr, h - 38 * dpr);

    // readouts
    const n = Fm.netRates(c, drugs);
    const v = Fm.verdict(c, drugs);
    const vtxt: Record<Fm.Verdict, string> = {
      grows: "The filament grows" + (n.barbed > 0.02 && n.pointed > 0.02 ? " at both ends" : ""),
      treadmills: n.total > 0.3 ? "Treadmills, and grows overall" : n.total < -0.3 ? "Treadmills, and shrinks overall" : "Treadmills: grows at + as fast as it shrinks at −",
      shrinks: "The filament shrinks" + (n.barbed < -0.02 && n.pointed < -0.02 ? " at both ends" : ""),
      stable: "Frozen: almost nothing happens at either end",
    };
    verdictEl.textContent = vtxt[v];
    verdictEl.style.color = v === "treadmills" ? "#2b8a3e" : v === "grows" ? C_BARB : v === "shrinks" ? "#c92a2a" : C_TEXT;
    // measured over the last 20 s of history
    let meas = "";
    const old = hist.find(hh => hh.t >= fil.t - 20);
    if (old && hist.length > 4 && fil.t - old.t > 5 && L > 0) {
      const dtm = fil.t - old.t;
      meas = `\nmeasured, last ${dtm.toFixed(0)} s:\n  + end ${sgn((fil.barbedPos - old.b) / dtm, 1)} · − end ${sgn(-(fil.p0 - old.p) / dtm, 1)}`;
    }
    readout.textContent =
      `free G-actin: ${f1(c)} µM` + (drugs.lat > 0 ? `\n  (of ${f1(cTot)} µM; the rest is bound to latrunculin)` : "") + "\n"
      + `net rate (subunits/s), expected:\n  + end ${sgn(n.barbed)} · − end ${sgn(n.pointed)}\n`
      + `  whole filament ${sgn(n.total)} (${sgn(n.total * Fm.NM_PER_SUB * 60 / 1000, 2)} µm/min)`
      + meas + `\nlength: ${L} subunits = ${(L * Fm.NM_PER_SUB).toFixed(0)} nm`;
    status.textContent = `t = ${fil.t.toFixed(1)} s · time runs at ${speed}× real time`;
    frame++;
    if (frame % 6 === 0 || loop?.paused) drawEnds();
  }

  let loop: ReturnType<typeof visibleLoop>;
  drawRatePlot();
  loop = visibleLoop(stage, 1 / 60, () => { if (active) step(); }, render, 3);
  loop.redraw();
  return {
    setActive(a: boolean) { active = a; if (a) { loop.redraw(); drawEnds(); } },
  };
}

// ======================================================================= tab 2
function buildTab2(pane: HTMLElement, seed: number) {
  const p: Lm.LamParams = { ...Lm.DEFAULT_LAM };
  let lam = new Lm.Lamella(p, seed);
  let nRun = 0;
  let speed = 1;
  let active = false;
  let vHist: { t: number; v: number }[] = [];
  const VIEW_H = 0.9, AHEAD = 0.12;            // µm shown; µm in front of the membrane

  const main = htmlEl("div", "ac-main", "", pane);
  const stage = htmlEl("div", "ac-stage", "", main);
  stage.style.aspectRatio = `${Lm.W} / ${VIEW_H}`;
  stage.style.maxWidth = "560px";
  const cv = htmlEl("canvas", "", "", stage);
  cv.setAttribute("aria-label", "Leading edge of a crawling cell seen from above: a branched actin network pushes the membrane");
  const ctx = cv.getContext("2d")!;
  legend(main, [["#e0a100", "new filament"], ["#555555", "older filament"], [C_ARP, "Arp2/3 (branch point)"], [C_CAP, "capping protein"]]);
  const status = htmlEl("div", "ac-status", "", main);
  const tools = htmlEl("div", "qb-presets", "", main);
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(tools, "Restart", () => restart());
  speedSelect(main, speed, v => { speed = v; });
  const side = htmlEl("div", "ac-side", "", pane);
  const pbox = htmlEl("div", "ac-plots ac-narrow", "", pane);
  htmlEl("div", "ac-h", "Edge speed (last 60 s)", pbox);
  const VW = 440, VH = 200, VL = 48, VR = 12, VT = 10, VB = 40;
  const vsvg = svgEl("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "ac-plot" }, pbox);

  const big = htmlEl("div", "ac-big", "", side);
  const readout = htmlEl("div", "qb-readout", "", side);
  const grp = htmlEl("div", "ac-group ac-prot", "", side);
  htmlEl("div", "ac-h", "Proteins (1 = normal amount)", grp);
  const fmtX = (v: number) => v.toFixed(2).replace(/\.?0+$/, "") + "×";
  const sArp = slider(grp, "Arp2/3", 0, 3, 0.25, p.arp, v => { p.arp = v; lam.p.arp = v; }, fmtX);
  const sCap = slider(grp, "capping protein", 0, 3, 0.25, p.cap, v => { p.cap = v; lam.p.cap = v; }, fmtX);
  const sCof = slider(grp, "cofilin", 0, 3, 0.25, p.cof, v => { p.cof = v; lam.p.cof = v; }, fmtX);
  presets(grp, [
    { label: "normal", apply: () => setAll(1, 1, 1) },
    { label: "no Arp2/3", apply: () => setAll(0, 1, 1) },
    { label: "no capping", apply: () => setAll(1, 0, 1) },
    { label: "no cofilin", apply: () => setAll(1, 1, 0) },
  ]);
  const sw = htmlEl("div", "ac-group ac-prot", "", side);
  htmlEl("div", "ac-h", "Experiment: speed at several levels", sw);
  const swRow = htmlEl("label", "qb-slider", "", sw);
  htmlEl("span", "qb-slider-name", "vary", swRow);
  const swSel = htmlEl("select", "ac-select", "", swRow);
  for (const [k, t] of [["cap", "capping protein"], ["arp", "Arp2/3"], ["cof", "cofilin"]]) { const o = htmlEl("option", "", t, swSel); o.value = k; }
  swSel.addEventListener("change", () => swSel.blur());
  const bSweep = button(sw, "Measure speed curve", () => runSweep());
  const swNote = htmlEl("div", "qb-note", "", sw);
  swNote.textContent = "Fresh edges at 0, 0.25, 0.5, 1, 1.5, 2 and 3× of the chosen protein (the other two as set above), 40 s each; mean speed after the first 15 s.";
  const ssvg = svgEl("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "ac-plot" }, sw);
  const note = htmlEl("div", "qb-note", "", side);
  note.textContent = "Stochastic model, qualitatively right; numbers are illustrative. A 1 µm piece of the leading edge seen from above. "
    + "Filaments are fixed to the substrate (no backward flow, as in a fish keratocyte); barbed ends grow at 11.6 µM⁻¹s⁻¹ × [G-actin]. "
    + "Arp2/3 adds branches at 70° on filaments next to the membrane, on the side facing it (a branch also needs free actin); capping protein stops barbed ends at random; "
    + "cofilin takes old, capped filaments apart and returns their subunits to the monomer pool. This piece of cell holds a fixed amount of actin (20 µM). "
    + "Ends touching the membrane push it; the more of them, the closer the edge gets to the free growth speed (a simple rule, not a force calculation).";

  function setAll(arp: number, cap: number, cof: number) {
    p.arp = arp; p.cap = cap; p.cof = cof; sArp.set(arp); sCap.set(cap); sCof.set(cof);
    lam.p = { ...p };
  }
  function restart() { nRun++; lam = new Lm.Lamella(p, seed + nRun); vHist = []; loop.redraw(); }

  // ---- sweep
  const SW_X = [0, 0.25, 0.5, 1, 1.5, 2, 3];
  let sweep: { key: string; pts: { x: number; v: number }[] } | null = null;
  function runSweep() {
    const key = swSel.value as keyof Lm.LamParams;
    bSweep.disabled = true; bSweep.textContent = "Measuring …";
    const pts: { x: number; v: number }[] = [];
    let i = 0;
    const next = () => {
      if (i >= SW_X.length) {
        sweep = { key, pts }; drawSweep(); bSweep.disabled = false; bSweep.textContent = "Measure speed curve"; return;
      }
      const q = { ...p, [key]: SW_X[i] };
      pts.push({ x: SW_X[i], v: Lm.measure(q, 100 + i).v * 60 });
      i++; sweep = { key, pts: pts.slice() }; drawSweep();
      setTimeout(next, 0);
    };
    setTimeout(next, 30);
  }
  function drawSweep() {
    ssvg.innerHTML = "";
    const x0 = VL, x1 = VW - VR, y0 = VH - VB;
    const ymax = 15;
    const sx = (x: number) => x0 + x / 3 * (x1 - x0), sy = (v: number) => VT + (ymax - Math.min(v, ymax)) / ymax * (y0 - VT);
    for (const v of [0, 5, 10, 15]) {
      svgEl("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), class: v ? "grid" : "axis" }, ssvg);
      const t = svgEl("text", { x: x0 - 6, y: sy(v) + 4, "font-size": 13, "text-anchor": "end" }, ssvg); t.textContent = String(v);
    }
    svgEl("line", { x1: x0, x2: x0, y1: VT, y2: y0, class: "axis" }, ssvg);
    for (const x of [0, 0.5, 1, 1.5, 2, 2.5, 3]) {
      const t = svgEl("text", { x: sx(x), y: y0 + 17, "font-size": 13, "text-anchor": "middle" }, ssvg); t.textContent = String(x);
    }
    const names: Record<string, string> = { cap: "capping protein", arp: "Arp2/3", cof: "cofilin" };
    const xl = svgEl("text", { x: (x0 + x1) / 2, y: VH - 6, "font-size": 13, "text-anchor": "middle" }, ssvg);
    xl.textContent = sweep ? `${names[sweep.key]} (× normal)` : "amount (× normal)";
    const yl = svgEl("text", { x: 13, y: (VT + y0) / 2, "font-size": 13, "text-anchor": "middle", transform: `rotate(-90 13 ${(VT + y0) / 2})` }, ssvg);
    yl.textContent = "µm/min";
    if (!sweep || !sweep.pts.length) return;
    let d = "";
    for (const q of sweep.pts) d += (d ? "L" : "M") + sx(q.x).toFixed(1) + "," + sy(q.v).toFixed(1);
    svgEl("path", { d, fill: "none", stroke: C_TEXT, "stroke-width": 2 }, ssvg);
    for (const q of sweep.pts) {
      svgEl("circle", { cx: sx(q.x), cy: sy(q.v), r: 5, fill: "#1971c2", stroke: "#fff", "stroke-width": 1.5 }, ssvg);
      const t = svgEl("text", { x: sx(q.x), y: sy(q.v) - 9, "font-size": 12, "text-anchor": "middle" }, ssvg);
      t.textContent = q.v.toFixed(1);
    }
  }

  function drawSpeed() {
    vsvg.innerHTML = "";
    const x0 = VL, x1 = VW - VR, y0 = VH - VB, ymax = 15;
    const tNow = lam.t;
    const sx = (t: number) => x0 + (t - (tNow - 60)) / 60 * (x1 - x0), sy = (v: number) => VT + (ymax - Math.min(v, ymax)) / ymax * (y0 - VT);
    for (const v of [0, 5, 10, 15]) {
      svgEl("line", { x1: x0, x2: x1, y1: sy(v), y2: sy(v), class: v ? "grid" : "axis" }, vsvg);
      const t = svgEl("text", { x: x0 - 6, y: sy(v) + 4, "font-size": 13, "text-anchor": "end" }, vsvg); t.textContent = String(v);
    }
    svgEl("line", { x1: x0, x2: x0, y1: VT, y2: y0, class: "axis" }, vsvg);
    for (let k = 0; k <= 6; k++) {
      const t = svgEl("text", { x: x0 + k / 6 * (x1 - x0), y: y0 + 17, "font-size": 13, "text-anchor": "middle" }, vsvg);
      t.textContent = String(k * 10 - 60);
    }
    const xl = svgEl("text", { x: (x0 + x1) / 2, y: VH - 6, "font-size": 13, "text-anchor": "middle" }, vsvg);
    xl.textContent = "seconds before now";
    const yl = svgEl("text", { x: 13, y: (VT + y0) / 2, "font-size": 13, "text-anchor": "middle", transform: `rotate(-90 13 ${(VT + y0) / 2})` }, vsvg);
    yl.textContent = "µm/min";
    let dd = "";
    for (const h of vHist) if (h.t >= tNow - 60) dd += (dd ? "L" : "M") + sx(h.t).toFixed(1) + "," + sy(h.v).toFixed(1);
    if (dd) svgEl("path", { d: dd, fill: "none", stroke: "#1971c2", "stroke-width": 2 }, vsvg);
  }

  function step() {
    // keep the physics step at 1/60 s of simulated time: several steps per frame when faster
    const n = Math.max(1, Math.round(speed));
    const dt = speed / 60 / n;
    for (let k = 0; k < n; k++) lam.step(dt);
    const last = vHist[vHist.length - 1];
    if (!last || lam.t - last.t >= 0.25) {
      vHist.push({ t: lam.t, v: lam.speed(3) * 60 });
      while (vHist.length && vHist[0].t < lam.t - 62) vHist.shift();
    }
  }

  let frame = 0;
  function render() {
    const [w, h, dpr] = fitCanvas(cv);
    const s = w / Lm.W;                         // px per µm
    const M = lam.M;
    const Y = (y: number) => (AHEAD - (y - M)) * s;   // lab y → screen y (membrane at AHEAD from the top)
    // background: outside, cytosol
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, Y(M));
    ctx.fillStyle = "#fbfaf5"; ctx.fillRect(0, Y(M), w, h - Y(M));
    // substrate marks (fixed to the dish): they slide back as the cell moves forward
    ctx.fillStyle = "#c9ced6";
    const g = 0.1;
    const yTop = M + AHEAD, yBot = M + AHEAD - VIEW_H;
    for (let yy = Math.floor(yBot / g) * g; yy <= yTop; yy += g) {
      for (let xx = g / 2; xx < Lm.W; xx += g) { ctx.beginPath(); ctx.arc(xx * s, Y(yy), 1.6 * dpr, 0, 6.283); ctx.fill(); }
    }
    // filaments
    const t = lam.t;
    ctx.lineCap = "round";
    const lw = Math.max(1.5 * dpr, 0.007 * s);
    for (const f of lam.fils) {
      const yt = f.y0 + f.len * f.cy;
      if (Math.max(yt, f.y0) < yBot - 0.05) continue;
      const age = t - f.born;
      const mix = Math.max(0, Math.min(1, (age - 0.5) / 2.5));
      ctx.strokeStyle = mixCol([0xe0, 0xa1, 0x00], [0x55, 0x55, 0x55], mix);
      ctx.lineWidth = lw;
      const xa = f.x0, xb = f.x0 + f.len * f.sx;
      for (const off of [-Lm.W, 0, Lm.W]) {
        if (Math.max(xa, xb) + off < -0.02 || Math.min(xa, xb) + off > Lm.W + 0.02) continue;
        ctx.beginPath(); ctx.moveTo((xa + off) * s, Y(f.y0)); ctx.lineTo((xb + off) * s, Y(yt)); ctx.stroke();
      }
    }
    // branch points and caps on top
    for (const f of lam.fils) {
      const yt = f.y0 + f.len * f.cy;
      if (Math.max(yt, f.y0) < yBot - 0.05) continue;
      if (f.branched) { ctx.fillStyle = C_ARP; ctx.beginPath(); ctx.arc(Lm.wrap(f.x0) * s, Y(f.y0), Math.max(2.2 * dpr, 0.007 * s), 0, 6.283); ctx.fill(); }
      if (f.capped) { ctx.fillStyle = C_CAP; ctx.beginPath(); ctx.arc(Lm.wrap(f.x0 + f.len * f.sx) * s, Y(yt), Math.max(2.6 * dpr, 0.008 * s), 0, 6.283); ctx.fill(); }
    }
    // membrane
    ctx.fillStyle = "#f6f0de"; ctx.fillRect(0, Y(M) - 4 * dpr, w, 5 * dpr);
    ctx.strokeStyle = C_MEM; ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath(); ctx.moveTo(0, Y(M) - 4 * dpr); ctx.lineTo(w, Y(M) - 4 * dpr); ctx.stroke();
    ctx.font = `${14 * dpr}px system-ui, sans-serif`; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillStyle = C_TEXT;
    ctx.fillText("outside the cell", 8 * dpr, Y(M) / 2 - 4 * dpr);
    ctx.fillStyle = C_MEM; ctx.textAlign = "right";
    ctx.fillText("plasma membrane ↑ direction of movement", w - 8 * dpr, Y(M) / 2 - 4 * dpr);
    // scale bar 200 nm
    const bw = 0.2 * s;
    ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(w - bw - 22 * dpr, h - 40 * dpr, bw + 16 * dpr, 34 * dpr);
    ctx.fillStyle = C_TEXT; ctx.fillRect(w - bw - 14 * dpr, h - 14 * dpr, bw, 4 * dpr);
    ctx.textAlign = "right"; ctx.font = `${13 * dpr}px system-ui, sans-serif`;
    ctx.fillText("200 nm", w - 14 * dpr, h - 26 * dpr);

    const v = lam.speed(3) * 60;
    big.textContent = `Edge speed: ${v.toFixed(1)} µm/min`;
    readout.textContent =
      `free G-actin: ${lam.C.toFixed(1)} µM of ${Lm.C_TOT} µM\n`
      + `actin in the network: ${Math.round(Math.min(100, lam.F / Lm.N_TOT * 100))} %\n`
      + `growing barbed ends: ${lam.nGrowing} (${lam.nTouch} touch the membrane)\n`
      + `free growth of one end: ${(lam.vFree * 60).toFixed(1)} µm/min\n`
      + `distance moved: ${lam.M.toFixed(2)} µm`;
    status.textContent = `t = ${lam.t.toFixed(1)} s · time runs at ${speed}× real time · dots: marks on the dish`;
    frame++;
    if (frame % 6 === 0 || loop?.paused) drawSpeed();
  }

  let loop: ReturnType<typeof visibleLoop>;
  drawSweep();
  loop = visibleLoop(stage, 1 / 60, () => { if (active) step(); }, render, 3);
  return {
    setActive(a: boolean) { active = a; if (a) { loop.redraw(); drawSpeed(); } },
  };
}

function mixCol(a: number[], b: number[], m: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * m));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

