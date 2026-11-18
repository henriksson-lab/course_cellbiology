// Pulse-chase of cargo (RUSH-style). A fluorescent cargo is held in the ER by a hook;
// "Release" (biotin) lets it go, and the dots follow it ER → ERGIC → Golgi → TGN → plasma
// membrane, or into secretory granules (regulated secretion) or lysosomes (M6P route).
// The plot shows the fraction of the cargo in each compartment over time. Blocks: 15 °C,
// 20 °C, brefeldin A, botulinum/tetanus toxin; a Ca²⁺ trigger for regulated secretion.
// The dots are a drawing of the model: dot k moves along an edge when the cumulative
// flux along that edge (model.ts) passes k/N, so the dots and the plot always agree.
// Options (data-*): cargo = membrane|hormone|lysosomal, speed (× real time), n (dots), seed.
import { autoMount, htmlEl, svgEl, button, presets, checkbox, rng } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import {
  Model, Conditions, Cargo, Temp, DEFAULT_COND, EDGES, NC, seriesFor, Series,
  ER, ERGIC, GOLGI, TGN, VES, DOCK, OUT, LYS,
} from "./model";

const SPEEDS = [1, 2, 5, 10, 30, 60, 120];
const VW = 600, VH = 380;                       // cell view
const PW = 420, PH = 250, ML = 50, MR = 12, MT = 14, MB = 40;   // plot
const NCX = 150, NCY = 190, NRX = 62, NRY = 78; // nucleus
const GFP = "#37b24d", GFP_DARK = "#1b5e20";
const DASH: Record<string, string> = { ergic: "6 4", tgn: "6 4", lys: "2 3" };

const CARGO: { key: Cargo; label: string; text: string }[] = [
  { key: "membrane", label: "Membrane protein (constitutive)",
    text: "A GFP-tagged membrane protein, like VSVG. It is sent to the cell surface all the time (constitutive secretion)." },
  { key: "hormone", label: "Hormone (regulated)",
    text: "A GFP-tagged hormone, like insulin in a β cell. It is stored in secretory granules and released only after a Ca²⁺ signal." },
  { key: "lysosomal", label: "Lysosomal enzyme (M6P)",
    text: "A GFP-tagged lysosomal enzyme. In the Golgi it gets a mannose-6-phosphate (M6P) tag; M6P receptors in the TGN send it to the lysosomes." },
];

const CSS = `
.pc { flex-direction: column; align-items: stretch; }
.pc .pc-top { display: flex; flex-wrap: wrap; gap: 1em; align-items: flex-start; }
.pc .pc-view { flex: 1.3 1 340px; min-width: 0; display: flex; flex-direction: column; gap: .45em; }
.pc .pc-plotbox { flex: 1 1 300px; min-width: 0; }
.pc .pc-ctl { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1em; align-items: start; }
.pc .pc-cell { width: 100%; height: auto; background: #fff; border: 1px solid #dee2e6; border-radius: 6px; }
.pc .pc-status { font-family: ui-monospace, monospace; font-size: .85em; color: var(--qb-muted); min-height: 1.3em; }
.pc .pc-plot { width: 100%; height: auto; }
.pc .pc-h { font-weight: 600; font-size: .95em; margin: .2em 0; }
.pc .pc-legend { display: grid; grid-template-columns: repeat(auto-fill, minmax(10.5em, 1fr)); gap: .15em .8em; font-size: .9em; }
.pc .pc-leg { display: flex; align-items: center; gap: .4em; }
.pc .pc-leg svg { flex: none; }
.pc .pc-leg span { white-space: nowrap; }
.pc .pc-leg b { white-space: nowrap; font-family: ui-monospace, monospace; font-weight: 600; margin-left: auto; }
.pc .pc-select { font: inherit; font-size: .9em; padding: .15em .3em; grid-column: 2 / span 2; }
.pc .pc-box { display: flex; flex-direction: column; gap: .35em; }
.pc .pc-drugs { border-left: 3px solid #e8590c; padding-left: .6em; }
.pc .qb-btn { min-height: 34px; }
.pc .pc-release { font-weight: 600; border-color: ${GFP}; }
.pc .qb-btn:disabled { opacity: .45; cursor: default; }
.pc .pc-check-off { opacity: .45; }
`;

function niceCeil(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (f * e >= v - 1e-9) return f * e;
  return 10 * e;
}

interface Dot { c: number; x: number; y: number; x0: number; y0: number; x1: number; y1: number; p: number; el: SVGCircleElement; ring: SVGCircleElement }

autoMount("pulsechase", host => {
  if (!document.getElementById("pc-style")) {
    const st = document.createElement("style"); st.id = "pc-style"; st.textContent = CSS; document.head.appendChild(st);
  }
  host.classList.add("pc");
  const d = host.dataset;
  const seed = Number(d.seed) || 1;
  const N = Math.max(50, Math.min(600, Number(d.n) || 200));
  const cond: Conditions = { ...DEFAULT_COND, cargo: (CARGO.some(c => c.key === d.cargo) ? d.cargo : "membrane") as Cargo };
  let speed = SPEEDS.includes(Number(d.speed)) ? Number(d.speed) : 1;
  let model!: Model;
  let rand = rng(seed);
  let moved = new Int32Array(EDGES.length);
  let samples: { t: number; x: Float64Array }[] = [];
  let events: { t: number; text: string }[] = [];
  let series: Series[] = [];

  // ---------------- cell view
  const top = htmlEl("div", "pc-top", "", host);
  const view = htmlEl("div", "pc-view", "", top);
  const cell = svgEl("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "pc-cell", role: "img",
    "aria-label": "Cartoon cell: nucleus, ER, ERGIC, Golgi stack, TGN, vesicles, lysosomes and plasma membrane, with green cargo dots" }, view);
  const gLay = svgEl("g", {}, cell);
  const gGolgi = svgEl("g", {}, cell);
  const gLab = svgEl("g", { "font-size": 15 }, cell);
  const gDots = svgEl("g", {}, cell);
  const gBanner = svgEl("g", {}, cell);
  const status = htmlEl("div", "pc-status", "", view);
  const tools = htmlEl("div", "qb-presets", "", view);
  const bRelease = button(tools, "Release cargo (add biotin)", () => {
    if (model.released) return;
    model.release(); samples = [{ t: 0, x: model.x.slice() }]; events = []; xMax = 10; drawAxes(); syncButtons(); loop.redraw();
  }, "pc-release");
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(tools, "Reset", () => rebuild());
  const spRow = htmlEl("label", "qb-slider", "", view);
  htmlEl("span", "qb-slider-name", "time runs at", spRow);
  const sSpeed = htmlEl("select", "pc-select", "", spRow);
  for (const v of SPEEDS) { const o = htmlEl("option", "", v + "× real time", sSpeed); o.value = String(v); }
  sSpeed.value = String(speed);
  sSpeed.addEventListener("change", () => { speed = Number(sSpeed.value); sSpeed.blur(); });

  // ---------------- side panel
  const side = htmlEl("div", "pc-plotbox", "", top);
  htmlEl("div", "pc-h", "Fraction of the cargo in each compartment", side);
  const plot = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "pc-plot", role: "img", "aria-label": "Plot: fraction of cargo in each compartment against time after release" }, side);
  const gAxes = svgEl("g", {}, plot);
  const gEvents = svgEl("g", {}, plot);
  const gLines = svgEl("g", {}, plot);
  const legend = htmlEl("div", "pc-legend", "", side);

  const ctl = htmlEl("div", "pc-ctl", "", host);
  const cargoBox = htmlEl("div", "pc-box", "", ctl);
  htmlEl("div", "pc-h", "Cargo", cargoBox);
  const cargoBtns = presets(cargoBox, CARGO.map(c => ({ label: c.label, apply: () => { cond.cargo = c.key; rebuild(); } })));
  const cargoText = htmlEl("div", "qb-note", "", cargoBox);

  const condBox = htmlEl("div", "pc-box pc-drugs", "", ctl);
  htmlEl("div", "pc-h", "Temperature", condBox);
  const TEMPS: Temp[] = [37, 20, 15];
  const tempBtns = presets(condBox, TEMPS.map(T => ({ label: T + " °C", apply: () => { cond.temp = T; logEvent(T + " °C"); } })));
  htmlEl("div", "pc-h", "Drugs and signals", condBox);
  const cBfa = checkbox(condBox, "brefeldin A (blocks COPI coat formation)", cond.bfa, v => { cond.bfa = v; logEvent(v ? "BFA on" : "BFA off"); });
  const cTox = checkbox(condBox, "botulinum / tetanus toxin (cuts a SNARE)", cond.toxin, v => { cond.toxin = v; logEvent(v ? "toxin" : "no toxin"); });
  const cCa = checkbox(condBox, "Ca²⁺ stimulus (regulated secretion)", cond.ca, v => { cond.ca = v; logEvent(v ? "Ca²⁺ on" : "Ca²⁺ off"); });
  const cM6p = checkbox(condBox, "M6P tag on the enzyme", cond.m6p, v => { cond.m6p = v; rebuild(); });
  const note = htmlEl("div", "qb-note", "", host);
  note.textContent = "Qualitative compartment model: each step moves a fixed fraction of the cargo per minute (first-order), "
    + "with illustrative rates close to those measured for VSVG and RUSH cargo at 37 °C (Golgi after 10–20 min, "
    + "surface after 30–60 min). Cold slows every step; 15 °C stops ERGIC → Golgi, 20 °C stops exit from the TGN. "
    + "Brefeldin A: the Golgi merges into the ER within minutes and cargo cannot leave the ER; washout rebuilds the Golgi. "
    + "The toxin stops fusion of vesicles with the plasma membrane (in a real cell it acts only in nerve cells and some "
    + "secretory cells; here imagine its light chain made inside the cell). COPI retrieval, vesicle movement along "
    + "microtubules and new synthesis are not modelled. The cell is a cartoon, not to scale (a real cell is 20–30 µm across).";

  function logEvent(text: string) {
    syncButtons();
    if (model?.released) { events.push({ t: model.t, text }); drawEvents(); }
    loop?.redraw();
  }
  function syncButtons() {
    tempBtns.forEach((b, k) => b.classList.toggle("active", TEMPS[k] === cond.temp));
    cargoBtns.forEach((b, k) => b.classList.toggle("active", CARGO[k].key === cond.cargo));
    cargoText.textContent = CARGO.find(c => c.key === cond.cargo)!.text;
    const lysOn = cond.cargo === "lysosomal";
    cM6p.disabled = !lysOn; cM6p.parentElement!.classList.toggle("pc-check-off", !lysOn);
    const caOn = cond.cargo === "hormone";
    cCa.parentElement!.classList.toggle("pc-check-off", !caOn);
    bRelease.disabled = !!model?.released;
  }

  // ---------------- cell drawing
  const ER_ARCS = 4, ER_A0 = -125, ER_A1 = 125;
  const erPt = (k: number, aDeg: number): [number, number] => {
    const a = aDeg * Math.PI / 180, rx = NRX + 15 + 15 * k, ry = NRY + 15 + 15 * k;
    return [NCX + rx * Math.cos(a), NCY + ry * Math.sin(a)];
  };
  const ERGIC_PTS: [number, number][] = [[262, 128], [272, 165], [258, 200], [270, 236], [262, 268]];
  const CIS_X = [300, 314, 328, 342, 356];
  const cisPath = (x: number) => `M ${x + 10} 120 Q ${x - 8} 190 ${x + 10} 260`;
  const TGN_PTS: [number, number][] = [[384, 132], [378, 165], [386, 195], [376, 225], [384, 252]];
  const LYS_PTS: [number, number][] = [[440, 322], [492, 330], [470, 52]];

  function drawCell() {
    gLay.innerHTML = ""; gGolgi.innerHTML = ""; gLab.innerHTML = "";
    // outside label and plasma membrane
    svgEl("rect", { x: 12, y: 12, width: 540, height: VH - 24, rx: 60, fill: "#fbfaf5", stroke: "#8a6a12", "stroke-width": 5 }, gLay);
    svgEl("ellipse", { cx: NCX, cy: NCY, rx: NRX, ry: NRY, fill: "#efebf7", stroke: "#6b4fa0", "stroke-width": 3 }, gLay);
    for (let k = 0; k < ER_ARCS; k++) {
      let p = "";
      for (let a = ER_A0; a <= ER_A1; a += 5) { const [x, y] = erPt(k, a); p += (p ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1); }
      svgEl("path", { d: p, fill: "none", stroke: "#2a7f8f", "stroke-width": 11, "stroke-linecap": "round" }, gLay);
      svgEl("path", { d: p, fill: "none", stroke: "#e6f3f5", "stroke-width": 6.5, "stroke-linecap": "round" }, gLay);
    }
    for (const [x, y] of ERGIC_PTS) svgEl("circle", { cx: x, cy: y, r: 9, fill: "#e6f3f5", stroke: "#74b9c4", "stroke-width": 2.5 }, gLay);
    for (const x of CIS_X) {
      svgEl("path", { d: cisPath(x), fill: "none", stroke: "#d9822b", "stroke-width": 10, "stroke-linecap": "round" }, gGolgi);
      svgEl("path", { d: cisPath(x), fill: "none", stroke: "#fbeedd", "stroke-width": 5.5, "stroke-linecap": "round" }, gGolgi);
    }
    for (const [x, y] of TGN_PTS) svgEl("circle", { cx: x, cy: y, r: 7, fill: "#fbeedd", stroke: "#8f4f0e", "stroke-width": 2.5 }, gGolgi);
    svgEl("path", { d: "M 384 132 L 378 165 L 386 195 L 376 225 L 384 252", fill: "none", stroke: "#8f4f0e", "stroke-width": 2.5 }, gGolgi);
    if (cond.cargo === "lysosomal")
      for (const [x, y] of LYS_PTS) svgEl("circle", { cx: x, cy: y, r: 17, fill: "#e3f3ea", stroke: "#2e8b57", "stroke-width": 3 }, gLay);
    // labels
    const lab = (x: number, y: number, s: string, anchor = "middle", col = "#1b2a3a") => {
      const t = svgEl("text", { x, y, "text-anchor": anchor }, gLab); t.textContent = s; t.style.fill = col; return t;
    };
    lab(NCX, NCY + 5, "nucleus", "middle", "#6b4fa0");
    lab(NCX + 40, 26 + 10, "ER", "start", "#2a7f8f");
    lab(266, 106, "ERGIC", "middle", "#2a7f8f");
    lab(300, 284, "cis", "middle", "#b5651d"); lab(352, 284, "trans", "middle", "#b5651d");
    lab(330, 108, "Golgi", "middle", "#b5651d");
    lab(398, 280, "TGN", "middle", "#8f4f0e");
    lab(470, VH - 22, "plasma membrane", "middle", "#8a6a12");
    const out = lab(584, 200, "outside", "middle", "#868e96");
    out.setAttribute("transform", "rotate(-90 584 200)");
    if (cond.cargo === "lysosomal") lab(470, 88, "lysosome", "middle", "#2e8b57");
    if (cond.cargo === "hormone") lab(470, 36, "secretory granules", "middle", "#7a4fb5");
  }

  // a random spot inside a compartment
  function spot(c: number): [number, number] {
    const u = rand.unif, j = () => (u() - 0.5) * 5;
    switch (c) {
      case ER: { const [x, y] = erPt(Math.floor(u() * ER_ARCS), ER_A0 + u() * (ER_A1 - ER_A0)); return [x + j() * 0.6, y + j() * 0.6]; }
      case ERGIC: { const [x, y] = ERGIC_PTS[Math.floor(u() * ERGIC_PTS.length)]; return [x + j(), y + j()]; }
      case GOLGI: {      // on one cisterna (quadratic Bézier)
        const x = CIS_X[Math.floor(u() * CIS_X.length)], s = 0.08 + 0.84 * u();
        const bx = (1 - s) * (1 - s) * (x + 10) + 2 * s * (1 - s) * (x - 8) + s * s * (x + 10);
        return [bx, 120 + 140 * s];
      }
      case TGN: { const [x, y] = TGN_PTS[Math.floor(u() * TGN_PTS.length)]; return [x + j(), y + j()]; }
      case VES: return cond.cargo === "hormone" ? [425 + 95 * u(), 60 + 260 * u()] : [410 + 120 * u(), 40 + 300 * u()];
      case DOCK: return [541 + 2 * u(), 45 + 290 * u()];
      case LYS: { const [x, y] = LYS_PTS[Math.floor(u() * LYS_PTS.length)]; const a = u() * 6.283, r = 10 * Math.sqrt(u()); return [x + r * Math.cos(a), y + r * Math.sin(a)]; }
      case OUT:
        if (cond.cargo === "membrane") {   // in the plasma membrane: right, top or bottom edge
          const w = u();
          if (w < 0.5) return [552 + j() * 0.3, 70 + 240 * u()];
          const x = 80 + 440 * u();
          return [x, w < 0.75 ? 12 + j() * 0.3 : VH - 12 + j() * 0.3];
        }
        return [562 + 12 * u(), 20 + 340 * u()];
    }
    return [0, 0];
  }

  // ---------------- dots
  let dots: Dot[] = [];
  function makeDots() {
    gDots.innerHTML = ""; dots = [];
    for (let i = 0; i < N; i++) {
      const [x, y] = spot(ER);
      const ring = svgEl("circle", { cx: x, cy: y, r: 6.5, fill: "none", stroke: "#7a4fb5", "stroke-width": 1.5, opacity: 0 }, gDots);
      const el = svgEl("circle", { cx: x, cy: y, r: 3.4, fill: GFP, stroke: GFP_DARK, "stroke-width": 0.8 }, gDots);
      dots.push({ c: ER, x, y, x0: x, y0: y, x1: x, y1: y, p: 1, el, ring });
    }
  }
  /** move dots so that dots moved along edge e = floor(N × cumulative flux e) */
  function syncDots() {
    for (let e = 0; e < EDGES.length; e++) {
      const [a, b] = EDGES[e];
      const target = Math.floor(N * model.flux[e] + 1e-9);
      while (moved[e] < target) {
        // prefer a dot that sits still in the source; else take one still on its way there
        let cand: number[] = [];
        for (let i = 0; i < N; i++) if (dots[i].c === a && dots[i].p >= 1) cand.push(i);
        if (!cand.length) for (let i = 0; i < N; i++) if (dots[i].c === a) cand.push(i);
        if (!cand.length) break;
        const dt = dots[cand[Math.floor(rand.unif() * cand.length)]];
        const [x1, y1] = spot(b);
        dt.c = b; dt.x0 = dt.x; dt.y0 = dt.y; dt.x1 = x1; dt.y1 = y1; dt.p = 0;
        moved[e]++;
      }
    }
  }
  function moveDots(realDt: number) {
    for (const dt of dots) {
      if (dt.p >= 1) continue;
      dt.p = Math.min(1, dt.p + realDt / Math.max(0.3, Math.min(1.2, 12 / speed)));   // a hop takes 0.3–1.2 s on screen
      const s = dt.p * dt.p * (3 - 2 * dt.p);
      dt.x = dt.x0 + (dt.x1 - dt.x0) * s; dt.y = dt.y0 + (dt.y1 - dt.y0) * s;
    }
  }
  function drawDots() {
    for (const dt of dots) {
      dt.el.setAttribute("cx", dt.x.toFixed(1)); dt.el.setAttribute("cy", dt.y.toFixed(1));
      const vesicle = dt.p < 1 || dt.c === VES || dt.c === DOCK;
      dt.ring.setAttribute("opacity", vesicle ? "0.9" : "0");
      if (vesicle) {
        dt.ring.setAttribute("cx", dt.x.toFixed(1)); dt.ring.setAttribute("cy", dt.y.toFixed(1));
        dt.ring.setAttribute("r", cond.cargo === "hormone" && dt.p >= 1 ? "8" : "6.5");
        dt.ring.setAttribute("stroke-width", cond.cargo === "hormone" && dt.p >= 1 ? "3" : "1.5");
      }
    }
  }

  // ---------------- plot
  let xMax = 10;
  const sx = (t: number) => ML + t / xMax * (PW - ML - MR);
  const sy = (f: number) => MT + (1 - f) * (PH - MT - MB);
  function drawAxes() {
    gAxes.innerHTML = "";
    const x0 = ML, x1 = PW - MR, y0 = PH - MB;
    svgEl("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "axis" }, gAxes);
    svgEl("line", { x1: x0, x2: x0, y1: MT, y2: y0, class: "axis" }, gAxes);
    const step = xMax / 5;
    for (let k = 0; k <= 5; k++) {
      const v = k * step, X = sx(v);
      svgEl("line", { x1: X, x2: X, y1: y0, y2: y0 + 4, class: "axis" }, gAxes);
      const t = svgEl("text", { x: X, y: y0 + 17, "font-size": 14, "text-anchor": "middle" }, gAxes);
      t.textContent = String(+v.toPrecision(3));
    }
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const Y = sy(v);
      if (v > 0) svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, class: "grid" }, gAxes);
      const t = svgEl("text", { x: x0 - 6, y: Y + 4, "font-size": 14, "text-anchor": "end" }, gAxes);
      t.textContent = Math.round(v * 100) + " %";
    }
    const xl = svgEl("text", { x: (x0 + x1) / 2, y: PH - 5, "font-size": 14, "text-anchor": "middle" }, gAxes);
    xl.textContent = "time after release (min)";
    drawEvents();
  }
  function drawEvents() {
    gEvents.innerHTML = "";
    let lastX = -99, row = 0;
    for (const ev of events) {
      const X = sx(ev.t);
      svgEl("line", { x1: X, x2: X, y1: MT, y2: PH - MB, stroke: "#e8590c", "stroke-dasharray": "3 3", "stroke-width": 1.2 }, gEvents);
      row = X - lastX < 60 ? (row + 1) % 3 : 0; lastX = X;
      const t = svgEl("text", { x: X + 3, y: MT + 11 + 13 * row, "font-size": 12 }, gEvents);
      t.textContent = ev.text; t.style.fill = "#c4470a";
    }
  }
  function buildLegend() {
    legend.innerHTML = ""; gLines.innerHTML = "";
    series = seriesFor(cond.cargo, cond.m6p);
    for (const s of series) {
      svgEl("path", { fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-dasharray": DASH[s.key] ?? "", "data-k": s.key, "stroke-linejoin": "round" }, gLines);
      const row = htmlEl("div", "pc-leg", "", legend);
      const sw = svgEl("svg", { width: 26, height: 10, viewBox: "0 0 26 10" }, row);
      svgEl("line", { x1: 1, x2: 25, y1: 5, y2: 5, stroke: s.color, "stroke-width": 3, "stroke-dasharray": DASH[s.key] ?? "" }, sw);
      htmlEl("span", "", s.label, row);
      htmlEl("b", "", "", row).dataset.k = s.key;
    }
  }
  function updatePlot() {
    const tNow = model.released ? model.t : 0;
    const want = niceCeil(Math.max(10, tNow * 1.08));
    if (want !== xMax) { xMax = want; drawAxes(); }
    const paths = gLines.querySelectorAll("path");
    const stride = Math.max(1, Math.floor(samples.length / 500));
    series.forEach((s, k) => {
      let p = "";
      for (let i = 0; i < samples.length; i += stride) p += (p ? "L" : "M") + sx(samples[i].t).toFixed(1) + "," + sy(s.of(samples[i].x)).toFixed(1);
      if (samples.length) { const L = samples[samples.length - 1]; p += (p ? "L" : "M") + sx(L.t).toFixed(1) + "," + sy(s.of(L.x)).toFixed(1); }
      paths[k].setAttribute("d", p);
    });
    legend.querySelectorAll<HTMLElement>("b").forEach(b => {
      const s = series.find(q => q.key === b.dataset.k)!;
      b.textContent = Math.round(s.of(model.x) * 100) + " %";
    });
  }

  // ---------------- state
  function rebuild() {
    model = new Model(cond);
    rand = rng(seed);
    moved = new Int32Array(EDGES.length);
    samples = []; events = []; xMax = 10;
    drawCell(); makeDots(); buildLegend(); drawAxes(); syncButtons();
    cBfa.checked = cond.bfa; cTox.checked = cond.toxin; cCa.checked = cond.ca; cM6p.checked = cond.m6p;
    loop?.redraw();
  }

  function step() {
    const dtMin = speed / 60 / 60;          // one step = 1/60 s of real time
    model.step(dtMin);
    if (model.released) {
      const L = samples[samples.length - 1];
      if (!L || model.t - L.t >= Math.max(dtMin, xMax / 600)) samples.push({ t: model.t, x: model.x.slice() });
    }
    syncDots();
    moveDots(1 / 60);
  }

  function render() {
    gGolgi.setAttribute("opacity", (0.12 + 0.88 * model.g).toFixed(2));
    gBanner.innerHTML = "";
    const banner = (txt: string) => {
      svgEl("rect", { x: 210, y: 300, width: 230, height: 26, rx: 5, fill: "#fff4e6", stroke: "#e8590c" }, gBanner);
      const t = svgEl("text", { x: 325, y: 318, "font-size": 14, "text-anchor": "middle" }, gBanner); t.textContent = txt;
    };
    if (model.g < 0.5) banner("Golgi has merged into the ER");
    else if (cond.temp !== 37) banner(cond.temp === 15 ? "15 °C: no ERGIC → Golgi" : "20 °C: no exit from the TGN");
    drawDots();
    updatePlot();
    const clock = model.released ? `t = ${model.t.toFixed(1)} min after release` : "cargo held in the ER by the hook: press Release";
    const drugs = [cond.bfa ? "BFA" : "", cond.toxin ? "toxin" : "", cond.ca && cond.cargo === "hormone" ? "Ca²⁺ high" : ""].filter(Boolean).join(", ");
    status.textContent = `${clock} · ${cond.temp} °C${drugs ? " · " + drugs : ""} · ${speed}× real time`;
  }

  let loop: ReturnType<typeof visibleLoop>;
  rebuild();
  loop = visibleLoop(host, 1 / 60, step, render, 3);
  loop.redraw();
});
