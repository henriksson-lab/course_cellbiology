// Dynamic instability. Tab 1: microtubules grow and shrink from a centrosome (two-state
// Dogterom–Leibler model), with free tubulin, taxol and vinblastine; a kymograph of one
// microtubule and catastrophe/rescue counts. Tab 2: why motors: a vesicle (or protein)
// diffusing along an axon vs carried by kinesin, over 10 µm, 1 mm and 1 m.
// Options (data-*): tab = 1|2, c (µM free tubulin), seed, n (number of microtubules),
// dist = cell|mm|m, cargo = protein|vesicle.
import { autoMount, htmlEl, svgEl, slider, button, presets, checkbox } from "../lib/ui";
import { visibleLoop, Loop } from "../lib/particles";
import {
  DynSim, Drugs, rates, dl, CELL_R, Cloud, CARGO, CargoKey, STEP_NM, tDiff, tMotor, crossover, fmtDur,
} from "./model";

const INK = "#1b2a3a", MT = "#555555", SEL = "#1f77b4", DRUG = "#e8590c", GROW = "#2f9e44", SHRINK = "#c92a2a";
const MEMB = "#8a6a12", MEMB_F = "#f6f0de", CYTO = "#fbfaf5", NUC = "#6b4fa0", NUC_F = "#efebf7", CARGO_C = "#d9822b";

// Demo-specific styles. demos/demo.css is shared and edited centrally; these could move there.
const CSS = `
.qb-demo.mt { display: block; }
.mt .mt-tabs { margin-bottom: .8em; }
.mt .mt-tabs .qb-btn { min-height: 40px; font-size: .95em; }
.mt .mt-pane { display: flex; flex-wrap: wrap; gap: 1.2em; align-items: flex-start; }
.mt .mt-pane[hidden] { display: none; }
.mt .mt-view { flex: 1 1 340px; max-width: 520px; min-width: 0; display: flex; flex-direction: column; gap: .45em; }
.mt .mt-side { flex: 1 1 320px; max-width: 500px; min-width: 0; display: flex; flex-direction: column; gap: .55em; }
.mt .mt-cell { width: 100%; height: auto; touch-action: manipulation; cursor: pointer; }
.mt .mt-plot { width: 100%; height: auto; }
.mt .mt-h { font-weight: 600; font-size: .95em; }
.mt .mt-select { font: inherit; font-size: .9em; padding: .15em .3em; }
.mt .mt-row { display: flex; flex-wrap: wrap; gap: .4em 1em; align-items: center; }
.mt .qb-presets .qb-btn { min-height: 36px; }
.mt .mt-wide { flex: 1 1 100%; max-width: 980px; min-width: 0; display: flex; flex-direction: column; gap: .55em; }
.mt .mt-racewrap { width: 100%; overflow-x: auto; }
.mt .mt-race { width: 100%; min-width: 620px; height: auto; }
.mt .mt-cols { display: flex; flex-wrap: wrap; gap: 1.2em; align-items: flex-start; }
.mt .mt-cols > div { flex: 1 1 320px; min-width: 0; max-width: 520px; display: flex; flex-direction: column; gap: .5em; }
.mt .mt-table { border-collapse: collapse; font-size: .9em; width: 100%; font-variant-numeric: tabular-nums; }
.mt .mt-table th, .mt .mt-table td { padding: .2em .45em; text-align: right; border-bottom: 1px solid #e3e3e3; }
.mt .mt-table th:first-child, .mt .mt-table td:first-child { text-align: left; }
.mt .mt-table tr.mt-cur td { font-weight: 700; }
.mt .mt-legend { display: flex; flex-wrap: wrap; gap: .2em 1em; font-size: .9em; }
.mt .mt-legend i { display: inline-block; width: 1.1em; height: .45em; border-radius: 3px; margin-right: .35em; vertical-align: middle; }
.mt .qb-readout { font-size: .82em; }
.mt .mt-big { font-weight: 600; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .mt .mt-view, .mt .mt-side { max-width: 100%; flex-basis: 100%; } }
`;
function injectCss() {
  if (document.getElementById("mt-demo-css")) return;
  const s = document.createElement("style"); s.id = "mt-demo-css"; s.textContent = CSS;
  document.head.appendChild(s);
}

function speedSelect(parent: Element, values: number[], value: number, onChange: (v: number) => void): HTMLSelectElement {
  const row = htmlEl("label", "qb-slider", "", parent);
  htmlEl("span", "qb-slider-name", "time runs at", row);
  const sel = htmlEl("select", "mt-select", "", row);
  sel.style.gridColumn = "2 / span 2";
  for (const v of values) { const o = htmlEl("option", "", v.toLocaleString("en-US") + "× real time", sel); o.value = String(v); }
  sel.value = String(value);
  sel.addEventListener("change", () => { onChange(Number(sel.value)); sel.blur(); });
  return sel;
}
function text(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number> = {}) {
  const t = svgEl("text", { x, y, "font-size": 15, fill: INK, ...attrs }, parent);
  t.textContent = s; return t;
}

autoMount("microtubules", host => {
  injectCss();
  host.classList.add("mt");
  const d = host.dataset;
  const tabs = htmlEl("div", "mt-tabs", "", host);
  const pane1 = htmlEl("div", "mt-pane", "", host);
  const pane2 = htmlEl("div", "mt-pane", "", host);
  let loops: Loop[] = [];
  const show = (k: number) => {
    pane1.hidden = k !== 1; pane2.hidden = k !== 2;
    tabBtns.forEach((b, i) => b.classList.toggle("active", i === k - 1));
    loops.forEach(l => l.redraw());
  };
  const tabBtns = presets(tabs, [
    { label: "1 · Dynamic instability", apply: () => show(1) },
    { label: "2 · Why motors? Diffusion vs kinesin", apply: () => show(2) },
  ]);
  loops = [dynTab(pane1, d), raceTab(pane2, d)];
  show(d.tab === "2" ? 2 : 1);
});

// ======================= tab 1: dynamic instability =======================
function dynTab(pane: HTMLElement, d: DOMStringMap): Loop {
  const seed = Number(d.seed) || 1;
  const n = Number(d.n) || 40;
  const c0 = d.c !== undefined && Number.isFinite(Number(d.c)) ? Number(d.c) : 10;
  let c = c0, speed = 1;
  const drugs: Drugs = { taxol: false, vinblastine: false };
  let sim = new DynSim(n, c, drugs, seed);
  let sel = 0;
  let hist: { t: number; L: number; g: boolean }[] = [];
  let marks: { t: number; s: string }[] = [];
  const WIN = 300;          // kymograph window, s

  // ---- cell view
  const view = htmlEl("div", "mt-view", "", pane);
  htmlEl("div", "mt-h", "A cell seen from above (radius 25 µm). Tap a microtubule to follow it in the kymograph.", view);
  const S = 10, R = CELL_R * S, M = 16, W = 2 * (R + M);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${W}`, class: "mt-cell", role: "img", "aria-label": "Microtubules growing and shrinking from the centrosome" }, view);
  const cx = W / 2, cy = W / 2;
  svgEl("circle", { cx, cy, r: R + 4, fill: CYTO, stroke: MEMB, "stroke-width": 8 }, svg);
  svgEl("circle", { cx, cy, r: R + 4, fill: "none", stroke: MEMB_F, "stroke-width": 3 }, svg);
  svgEl("ellipse", { cx: cx - 95, cy: cy + 10, rx: 75, ry: 62, fill: NUC_F, stroke: NUC, "stroke-width": 2.5, opacity: 0.8 }, svg);
  text(svg, cx - 95, cy + 15, "nucleus", { "text-anchor": "middle", fill: NUC, "font-size": 16 });
  const gMT = svgEl("g", { "stroke-linecap": "round" }, svg);
  const lines = sim.mts.map(() => svgEl("line", { stroke: MT, "stroke-width": 2.6 }, gMT));
  const gTips = svgEl("g", {}, svg);
  const comets = sim.mts.map(() => svgEl("line", { stroke: GROW, "stroke-width": 6, "stroke-linecap": "round", opacity: 0.9 }, gTips));
  const frays = sim.mts.map(() => svgEl("circle", { r: 4, fill: SHRINK }, gTips));
  svgEl("circle", { cx, cy, r: 11, fill: "#fff", stroke: INK, "stroke-width": 2 }, svg);
  svgEl("rect", { x: cx - 6, y: cy - 2.5, width: 12, height: 5, fill: INK }, svg);
  svgEl("rect", { x: cx - 2.5, y: cy - 6, width: 5, height: 12, fill: INK }, svg);
  // scale bar 10 µm
  svgEl("line", { x1: W - M - 20 - 10 * S, x2: W - M - 20, y1: W - 22, y2: W - 22, stroke: INK, "stroke-width": 5 }, svg);
  text(svg, W - M - 20 - 5 * S, W - 30, "10 µm", { "text-anchor": "middle" });
  svg.addEventListener("pointerdown", ev => {
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const a = Math.atan2(p.y - cy, p.x - cx);
    let best = 0, bd = 9;
    sim.mts.forEach((m, i) => { let da = Math.abs(((a - m.angle) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); if (da < bd) { bd = da; best = i; } });
    sel = best; hist = []; marks = []; loop.redraw();
  });
  const leg = htmlEl("div", "mt-legend", "", view);
  leg.innerHTML = `<span><i style="background:${GROW}"></i>growing end (EB1 comet)</span>`
    + `<span><i style="background:${SHRINK};border-radius:50%;width:.7em"></i>shrinking end</span>`
    + `<span><i style="background:${SEL}"></i>followed in the kymograph</span>`
    + `<span>✚ centrosome</span>`;
  const status = htmlEl("div", "qb-note", "", view);
  const tools = htmlEl("div", "qb-presets", "", view);
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(tools, "Restart (all from the centrosome)", () => restart());
  button(tools, "Reset counts", () => { sim.resetCounts(); t0 = sim.t; loop.redraw(); });

  // ---- side: kymograph, counts, controls
  const side = htmlEl("div", "mt-side", "", pane);
  htmlEl("div", "mt-h", "Kymograph of the blue microtubule (time runs downwards)", side);
  const KW = 460, KH = 270, KL = 60, KR = 12, KT = 10, KB = 40;
  const ksvg = svgEl("svg", { viewBox: `0 0 ${KW} ${KH}`, class: "mt-plot" }, side);
  const kx = (L: number) => KL + L / CELL_R * (KW - KL - KR);
  svgEl("rect", { x: KL, y: KT, width: KW - KL - KR, height: KH - KT - KB, fill: "#fbfaf5", stroke: "#ccc" }, ksvg);
  for (let L = 0; L <= 25; L += 5) {
    svgEl("line", { x1: kx(L), x2: kx(L), y1: KH - KB, y2: KH - KB + 5, stroke: "#444" }, ksvg);
    text(ksvg, kx(L), KH - KB + 20, String(L), { "text-anchor": "middle", "font-size": 14 });
  }
  text(ksvg, (KL + KW - KR) / 2, KH - 4, "distance from the centrosome (µm); cell edge = 25", { "text-anchor": "middle", "font-size": 14 });
  const ky = (t: number) => KT + (1 - (sim.t - t) / WIN) * (KH - KT - KB);
  const gTicks = svgEl("g", {}, ksvg);
  const kFill = svgEl("path", { fill: "#d0d4d9", stroke: "none" }, ksvg);
  const kGrow = svgEl("path", { fill: "none", stroke: GROW, "stroke-width": 2.4 }, ksvg);
  const kShr = svgEl("path", { fill: "none", stroke: SHRINK, "stroke-width": 2.4 }, ksvg);
  const gMarks = svgEl("g", {}, ksvg);
  const counts = htmlEl("div", "qb-readout", "", side);

  const cSl = slider(side, "free tubulin (µM)", 0, 25, 0.5, c, v => { c = v; apply(`${v} µM`); }, v => v.toFixed(1));
  const row = htmlEl("div", "mt-row", "", side);
  checkbox(row, "taxol (paclitaxel)", false, v => { drugs.taxol = v; apply(v ? "+ taxol" : "− taxol"); });
  checkbox(row, "vinblastine", false, v => { drugs.vinblastine = v; apply(v ? "+ vinblastine" : "− vinblastine"); });
  speedSelect(side, [0.5, 1, 2, 5, 10, 30], speed, v => { speed = v; });
  const model = htmlEl("div", "qb-readout", "", side);
  htmlEl("div", "qb-note",
    "Model: each microtubule is either growing or shrinking (two-state model of Dogterom and Leibler). It switches to "
    + "shrinking (catastrophe) and back (rescue) at random, with the rates shown. Growth speed rises with free tubulin, and "
    + "fast growth (a bigger GTP cap) makes catastrophes rarer. An end that reaches the cell edge stalls there until it has "
    + "a catastrophe; an empty site at the centrosome starts a new microtubule after a few seconds. Illustrative rates, "
    + "similar to a cultured cell; free tubulin is held constant. Taxol: 10× fewer catastrophes, slower shrinking, more rescues. "
    + "Vinblastine (high dose): growth almost stops and ends fall apart more often. 40 microtubules (MTs; a real cell has hundreds).", side);

  let t0 = 0, tStart = 0;
  function apply(label: string) {
    sim.set(c, drugs);
    marks.push({ t: sim.t, s: label });
    loop.redraw();
  }
  function restart() {
    sim = new DynSim(n, c, drugs, seed);
    hist = []; marks = []; t0 = tStart = 0;
    loop.redraw();
  }

  function step() {
    sim.step(speed / 60);
    const m = sim.mts[sel];
    hist.push({ t: sim.t, L: m.L, g: m.grow });
    while (hist.length > 2 && sim.t - hist[0].t > WIN + 2) hist.shift();
    while (marks.length && sim.t - marks[0].t > WIN) marks.shift();
  }

  function render() {
    sim.mts.forEach((m, i) => {
      const ex = cx + Math.cos(m.angle) * m.L * S, ey = cy + Math.sin(m.angle) * m.L * S;
      const ln = lines[i];
      ln.setAttribute("x1", String(cx)); ln.setAttribute("y1", String(cy));
      ln.setAttribute("x2", ex.toFixed(1)); ln.setAttribute("y2", ey.toFixed(1));
      ln.setAttribute("stroke", i === sel ? SEL : MT);
      ln.setAttribute("stroke-width", i === sel ? "4.5" : "2.6");
      const growing = m.grow && m.L > 0 && !m.atEdge && sim.r.vg > 0;
      const cl = Math.min(m.L, 1.6) * S;
      const co = comets[i];
      co.style.display = growing ? "" : "none";
      if (growing) {
        co.setAttribute("x1", (ex - Math.cos(m.angle) * cl).toFixed(1)); co.setAttribute("y1", (ey - Math.sin(m.angle) * cl).toFixed(1));
        co.setAttribute("x2", ex.toFixed(1)); co.setAttribute("y2", ey.toFixed(1));
      }
      const fr = frays[i];
      fr.style.display = !m.grow && m.L > 0 ? "" : "none";
      fr.setAttribute("cx", ex.toFixed(1)); fr.setAttribute("cy", ey.toFixed(1));
    });
    // kymograph
    let f = "", g = "", s = "";
    const yb = KH - KB;
    if (hist.length > 1) {
      f = `M${kx(0)},${Math.max(KT, ky(hist[0].t)).toFixed(1)}`;
      for (const h of hist) { const y = ky(h.t); if (y < KT) continue; f += `L${kx(h.L).toFixed(1)},${y.toFixed(1)}`; }
      f += `L${kx(0)},${ky(sim.t).toFixed(1)}Z`;
      for (let i = 1; i < hist.length; i++) {
        const a = hist[i - 1], b = hist[i];
        const ya = ky(a.t), yb2 = ky(b.t);
        if (yb2 < KT) continue;
        const seg = `M${kx(a.L).toFixed(1)},${Math.max(KT, ya).toFixed(1)}L${kx(b.L).toFixed(1)},${yb2.toFixed(1)}`;
        if (b.g) g += seg; else s += seg;
      }
    }
    void yb;
    kFill.setAttribute("d", f); kGrow.setAttribute("d", g); kShr.setAttribute("d", s);
    gTicks.innerHTML = "";
    for (let k = 0; k <= 5; k++) {
      const y = KT + k / 5 * (KH - KT - KB);
      svgEl("line", { x1: KL - 5, x2: KL, y1: y, y2: y, stroke: "#444" }, gTicks);
      text(gTicks, KL - 8, y + 5, k === 5 ? "now" : `−${5 - k} min`, { "text-anchor": "end", "font-size": 13 });
    }
    gMarks.innerHTML = "";
    for (const mk of marks) {
      const y = ky(mk.t); if (y < KT) continue;
      svgEl("line", { x1: KL, x2: KW - KR, y1: y, y2: y, stroke: DRUG, "stroke-dasharray": "5 4", "stroke-width": 1.5 }, gMarks);
      text(gMarks, KW - KR - 4, y - 4, mk.s, { "text-anchor": "end", "font-size": 13, fill: DRUG });
    }
    // counts
    const T = Math.max(1e-9, sim.t - t0);
    const perMin = (k: number) => (k / n / T * 60).toFixed(2);
    counts.textContent =
      `time ${fmtClock(sim.t - tStart)}   counting for ${fmtClock(T)}\n`
      + `catastrophes ${sim.cats} (${perMin(sim.cats)} per MT per min)\n`
      + `rescues ${sim.rescues} (${perMin(sim.rescues)} per MT per min)\n`
      + `mean length ${sim.meanLength().toFixed(1)} µm\n`
      + `growing now ${sim.growing()} · at the edge ${sim.atEdge()} (of ${n} MTs)`;
    const r = sim.r, q = dl(r);
    model.textContent =
      `growth ${(r.vg * 60).toFixed(1)} µm/min, shrinkage ${(r.vs * 60).toFixed(1)} µm/min\n`
      + `catastrophe ${r.fcat.toFixed(3)} /s, rescue ${r.fres.toFixed(3)} /s\n`
      + (r.vg <= 0 ? "no growth: tubulin is below the critical concentration"
        : q.J < 0 ? (q.mean > 100 ? "bounded, but only just: average length > 100 µm (in a cell without an edge)"
          : `bounded: average length ≈ ${q.mean.toFixed(q.mean < 10 ? 1 : 0)} µm (in a cell without an edge)`)
          : "unbounded: the average end gains length; microtubules reach the cell edge");
    status.textContent = `time runs at ${speed}× real time${loop?.paused ? " · paused" : ""}`;
  }
  const fmtClock = (t: number) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };

  // warm up: start from a steady state (and a full kymograph), not from 40 empty sites
  function warm() {
    for (let i = 0; i < 1800; i++) {
      sim.step(1 / 3);
      const m = sim.mts[sel];
      if (sim.t > 600 - WIN - 2) hist.push({ t: sim.t, L: m.L, g: m.grow });
    }
    sim.resetCounts(); t0 = tStart = sim.t;
  }
  warm();
  void cSl;
  const loop = visibleLoop(pane, 1 / 60, step, render, 4);
  const restart0 = restart;
  void restart0;
  return loop;
}

// ======================= tab 2: diffusion vs kinesin =======================
const DISTS = {
  cell: { x: 10, label: "Across a cell (10 µm)" },
  mm: { x: 1000, label: "1 mm" },
  m: { x: 1e6, label: "1 m axon (spinal cord to foot)" },
} as const;
type DistKey = keyof typeof DISTS;

function raceTab(pane: HTMLElement, d: DOMStringMap): Loop {
  let dist: DistKey = (d.dist as DistKey) in DISTS ? d.dist as DistKey : "cell";
  let cargo: CargoKey = (d.cargo as CargoKey) in CARGO ? d.cargo as CargoKey : "vesicle";
  let v = 1, atp = true, speed = 1;
  const N = 40;
  let cloud = new Cloud(N, CARGO[cargo].D, DISTS[dist].x);
  let kx = 0, kArrive = -1, t = 0;

  const wide = htmlEl("div", "mt-wide", "", pane);
  const prow = htmlEl("div", "mt-cols", "", wide);
  const pa = htmlEl("div", "", "", prow), pb = htmlEl("div", "", "", prow);
  htmlEl("div", "mt-h", "Distance", pa);
  const dBtns = presets(pa, (Object.keys(DISTS) as DistKey[]).map(k => ({ label: DISTS[k].label, apply: () => { dist = k; restart(); } })));
  htmlEl("div", "mt-h", "Cargo", pb);
  const cBtns = presets(pb, (Object.keys(CARGO) as CargoKey[]).map(k => ({
    label: `${k === "protein" ? "protein" : "vesicle (100 nm)"}: D = ${CARGO[k].D} µm²/s`, apply: () => { cargo = k; restart(); },
  })));

  // race view
  const RW = 960, RH = 270, X0 = 140, X1 = RW - 40;
  const rwrap = htmlEl("div", "mt-racewrap", "", wide);
  const rsvg = svgEl("svg", { viewBox: `0 0 ${RW} ${RH}`, class: "mt-race", role: "img", "aria-label": "Race between diffusion and a kinesin motor along an axon" }, rwrap);
  svgEl("path", { d: `M${X0 - 10},62 L${X1},70 L${X1},196 L${X0 - 10},204 Z`, fill: CYTO, stroke: MEMB, "stroke-width": 3 }, rsvg);
  svgEl("circle", { cx: 72, cy: 133, r: 66, fill: CYTO, stroke: MEMB, "stroke-width": 3 }, rsvg);
  svgEl("rect", { x: X0 - 16, y: 66, width: 14, height: 134, fill: CYTO }, rsvg);
  svgEl("ellipse", { cx: 62, cy: 133, rx: 28, ry: 24, fill: NUC_F, stroke: NUC, "stroke-width": 2 }, rsvg);
  text(rsvg, 72, 26, "cell body", { "text-anchor": "middle" });
  text(rsvg, 72, 46, "(cargo made here)", { "text-anchor": "middle", "font-size": 13 });
  text(rsvg, X1, 46, "axon tip", { "text-anchor": "end" });
  svgEl("line", { x1: X1 - 6, x2: X1 - 6, y1: 72, y2: 194, stroke: INK, "stroke-width": 2, "stroke-dasharray": "4 3" }, rsvg);
  text(rsvg, X0 + 4, 88, "diffusion only (40 copies)", { "font-size": 14 });
  text(rsvg, X0 + 4, 190, "kinesin on a microtubule", { "font-size": 14 });
  svgEl("line", { x1: X0, x2: X1 - 6, y1: 168, y2: 168, stroke: MT, "stroke-width": 4 }, rsvg);
  text(rsvg, X0 - 4, 174, "−", { "text-anchor": "end", "font-size": 20, "font-weight": 700 });
  text(rsvg, X1 + 6, 174, "+", { "font-size": 20, "font-weight": 700 });
  const gCloud = svgEl("g", {}, rsvg);
  const dots = Array.from({ length: N }, (_, i) => svgEl("circle", { r: 5, cy: 100 + (i * 37 % 31), fill: CARGO_C, opacity: 0.85 }, gCloud));
  const kin = svgEl("g", {}, rsvg);
  svgEl("line", { x1: 0, x2: 0, y1: 166, y2: 150, stroke: INK, "stroke-width": 2.5 }, kin);
  svgEl("circle", { cx: -4, cy: 166, r: 4, fill: INK }, kin);
  svgEl("circle", { cx: 4, cy: 166, r: 4, fill: INK }, kin);
  svgEl("circle", { cx: 0, cy: 142, r: 9, fill: CARGO_C, stroke: INK, "stroke-width": 1.5 }, kin);
  const scaleLab = text(rsvg, (X0 + X1) / 2, RH - 8, "", { "text-anchor": "middle" });
  svgEl("line", { x1: X0, x2: X1 - 6, y1: RH - 30, y2: RH - 30, stroke: INK, "stroke-width": 1.5 }, rsvg);
  svgEl("line", { x1: X0, x2: X0, y1: RH - 36, y2: RH - 24, stroke: INK, "stroke-width": 1.5 }, rsvg);
  svgEl("line", { x1: X1 - 6, x2: X1 - 6, y1: RH - 36, y2: RH - 24, stroke: INK, "stroke-width": 1.5 }, rsvg);

  const tools = htmlEl("div", "qb-presets", "", wide);
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(tools, "Restart", () => restart());
  const cols = htmlEl("div", "mt-cols", "", wide);
  const left = htmlEl("div", "", "", cols), right = htmlEl("div", "", "", cols);
  const clock = htmlEl("div", "mt-big", "", left);
  const out = htmlEl("div", "qb-readout", "", left);
  slider(left, "kinesin speed (µm/s)", 0.2, 5, 0.1, v, x => { v = x; refresh(); }, x => x.toFixed(1));
  checkbox(left, "ATP present", true, x => { atp = x; refresh(); });
  speedSelect(left, [1, 10, 100, 1000, 1e4, 1e5, 1e6], speed, x => { speed = x; });

  htmlEl("div", "mt-h", "Time needed: diffusion (t ≈ x²/2D) vs kinesin (t = x/v)", right);
  const PW = 460, PH = 300, PL = 64, PR = 14, PT = 12, PB = 44;
  const psvg = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "mt-plot" }, right);
  const lx0 = -1, lx1 = 6, ly0 = -2, ly1 = 13;   // log10 µm, log10 s
  const px = (x: number) => PL + (Math.log10(x) - lx0) / (lx1 - lx0) * (PW - PL - PR);
  const py = (s: number) => PT + (1 - (Math.log10(s) - ly0) / (ly1 - ly0)) * (PH - PT - PB);
  const gPlot = svgEl("g", {}, psvg);
  const table = htmlEl("table", "mt-table", "", right);
  htmlEl("div", "qb-note",
    "Model: the free copies take random steps along the axon (1D diffusion; they bounce back at the cell body). "
    + "The kinesin walks at constant speed towards the plus end, 8 nm per step, one ATP per step. D for a protein in "
    + "cytoplasm ≈ 5 µm²/s; a 100-nm vesicle is slowed much more by the crowded cytoplasm (D ≈ 0.1 µm²/s, a rough value). "
    + "Kinesin-1 moves about 1 µm/s in a test tube; fast axonal transport in a neuron reaches 2–5 µm/s. "
    + "The drawing of the axon is not to scale for its width.", right);

  function restart() {
    cloud = new Cloud(N, CARGO[cargo].D, DISTS[dist].x);
    kx = 0; kArrive = -1; t = 0;
    dBtns.forEach((b, i) => b.classList.toggle("active", (Object.keys(DISTS) as DistKey[])[i] === dist));
    cBtns.forEach((b, i) => b.classList.toggle("active", (Object.keys(CARGO) as CargoKey[])[i] === cargo));
    const x = DISTS[dist].x;
    scaleLab.textContent = x >= 1e6 ? "1 m" : x >= 1000 ? `${x / 1000} mm` : `${x} µm`;
    refresh();
  }
  function refresh() { drawPlot(); fillTable(); loop?.redraw(); }

  function drawPlot() {
    gPlot.innerHTML = "";
    const D = CARGO[cargo].D;
    // grid: time references
    const refs: [number, string][] = [[1, "1 s"], [60, "1 min"], [3600, "1 h"], [86400, "1 day"], [365.25 * 86400, "1 year"], [80 * 365.25 * 86400, "80 years"]];
    for (const [s, lab] of refs) {
      const y = py(s);
      svgEl("line", { x1: PL, x2: PW - PR, y1: y, y2: y, stroke: "#e3e3e3" }, gPlot);
      text(gPlot, PL - 6, y + 5, lab, { "text-anchor": "end", "font-size": 12.5 });
    }
    for (const [x, lab] of [[0.1, "0.1 µm"], [10, "10 µm"], [1000, "1 mm"], [1e6, "1 m"]] as [number, string][]) {
      const X = px(x);
      svgEl("line", { x1: X, x2: X, y1: PT, y2: PH - PB, stroke: "#e3e3e3" }, gPlot);
      text(gPlot, X, PH - PB + 18, lab, { "text-anchor": "middle", "font-size": 13 });
    }
    svgEl("rect", { x: PL, y: PT, width: PW - PL - PR, height: PH - PT - PB, fill: "none", stroke: "#444" }, gPlot);
    text(gPlot, (PL + PW - PR) / 2, PH - 6, "distance x (log scale)", { "text-anchor": "middle", "font-size": 13 });
    const line = (f: (x: number) => number, col: string, dash: string) => {
      let p = "";
      for (let k = 0; k <= 70; k++) {
        const x = Math.pow(10, lx0 + k / 70 * (lx1 - lx0)), tt = f(x);
        const y = Math.min(PH - PB, Math.max(PT, py(tt)));
        p += (p ? "L" : "M") + px(x).toFixed(1) + "," + y.toFixed(1);
      }
      svgEl("path", { d: p, fill: "none", stroke: col, "stroke-width": 3, "stroke-dasharray": dash }, gPlot);
    };
    line(x => tDiff(x, D), CARGO_C, "");
    if (atp) line(x => tMotor(x, v), SEL, "8 5");
    // labels
    const xl = D > 1 ? 3000 : 1000;
    text(gPlot, px(xl) - 10, py(tDiff(xl, D)), "diffusion", { fill: CARGO_C, "font-weight": 700, "text-anchor": "end", "font-size": 14 });
    if (atp) text(gPlot, px(2e4), py(tMotor(2e4, v)) + 22, "kinesin", { fill: SEL, "font-weight": 700, "font-size": 14 });
    const xc = crossover(D, v);
    if (atp && xc > 0.1 && xc < 1e6) {
      svgEl("circle", { cx: px(xc), cy: py(tMotor(xc, v)), r: 5, fill: "#fff", stroke: INK, "stroke-width": 2 }, gPlot);
    }
    const xd = DISTS[dist].x;
    svgEl("line", { x1: px(xd), x2: px(xd), y1: PT, y2: PH - PB, stroke: INK, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, gPlot);
  }

  function fillTable() {
    const D = CARGO[cargo].D;
    table.innerHTML = "";
    const h = htmlEl("tr", "", "", table);
    for (const s of ["distance", "diffusion", "kinesin"]) htmlEl("th", "", s, h);
    for (const k of Object.keys(DISTS) as DistKey[]) {
      const r = htmlEl("tr", k === dist ? "mt-cur" : "", "", table);
      htmlEl("td", "", DISTS[k].label, r);
      htmlEl("td", "", fmtDur(tDiff(DISTS[k].x, D)), r);
      htmlEl("td", "", atp ? fmtDur(tMotor(DISTS[k].x, v)) : "never (no ATP)", r);
    }
    const xc = crossover(D, v);
    const row = htmlEl("tr", "", "", table);
    const td = htmlEl("td", "", `Equal times at x = 2D/v = ${xc >= 1 ? xc.toFixed(xc < 10 ? 1 : 0) + " µm" : (xc * 1000).toFixed(0) + " nm"} (white circle). Shorter: diffusion wins; longer: the motor wins.`, row);
    td.colSpan = 3; td.style.textAlign = "left"; td.style.fontSize = ".9em";
  }

  function step() {
    const dt = speed / 60;
    const X = DISTS[dist].x;
    cloud.step(dt);
    if (atp && kArrive < 0) {
      kx += v * dt;
      if (kx >= X) { kArrive = t + (X - (kx - v * dt)) / v; kx = X; }
    }
    t += dt;
  }

  function render() {
    const X = DISTS[dist].x, D = CARGO[cargo].D;
    const sx = (x: number) => X0 + 8 + Math.min(1, x / X) * (X1 - 6 - X0 - 8);
    dots.forEach((dot, i) => dot.setAttribute("cx", sx(cloud.x[i]).toFixed(1)));
    kin.setAttribute("transform", `translate(${sx(kx).toFixed(1)},0)`);
    const steps = kx * 1000 / STEP_NM;
    const nArr = cloud.nArrived();
    clock.textContent = `elapsed ${fmtDur(t)}   (time runs at ${speed.toLocaleString("en-US")}× real time${loop?.paused ? ", paused" : ""})`;
    const rms = Math.sqrt(2 * D * t);
    out.textContent =
      `kinesin: ${fmtLen(kx)} of ${fmtLen(X)}` + (kArrive >= 0 ? `, arrived after ${fmtDur(kArrive)}` : atp ? "" : ", stuck (no ATP)") + "\n"
      + `   steps ${fmtBig(steps)} = ATP used ${fmtBig(steps)}\n`
      + `diffusion: typical spread √(2Dt) = ${fmtLen(rms)}\n`
      + `   arrived ${nArr} of ${N}` + (cloud.firstArrival >= 0 ? `, first after ${fmtDur(cloud.firstArrival)}` : "") + "\n"
      + `   average time to arrive x²/2D = ${fmtDur(tDiff(X, D))}`;
  }
  const fmtLen = (x: number) => x >= 1e6 ? (x / 1e6).toFixed(3) + " m" : x >= 1000 ? (x / 1000).toFixed(x >= 1e5 ? 0 : 2) + " mm" : x.toFixed(x < 10 ? 2 : 1) + " µm";
  const fmtBig = (k: number) => k < 1e6 ? Math.floor(k).toLocaleString("en-US") : (k / 1e6).toFixed(1) + " million";

  const loop = visibleLoop(pane, 1 / 60, step, render, 4);
  restart();
  return loop;
}
