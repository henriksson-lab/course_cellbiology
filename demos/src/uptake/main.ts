// Uptake assay: glucose crossing a membrane by simple diffusion, a GLUT uniporter or an
// SGLT Na⁺–glucose symporter. Two views of the same cell, driven by the same controls:
// a particle view (counted molecules, sim.ts) and an equation view (concentrations and
// fluxes from model.ts). "Run assay series" measures initial uptake rates in fresh cells
// at several outside concentrations: linear for diffusion, saturating for transporters.
// Options (data-*): path = bilayer|GLUT|SGLT, co (mM), n (transporters), seed.
import { autoMount, htmlEl, svgEl, slider, button, checkbox, presets } from "../lib/ui";
import { pointRenderer, makePoints, visibleLoop, hexRGB } from "../lib/particles";
import * as M from "./model";
import { UptakeSim, assayPoint, W, H, OUT_Y1, IN_Y0, LEAK_X, PUMP_X, DT } from "./sim";

const GLC = "#d08c00", NA = "#1c4fa0", MEM = "#8a6a12", MEMFILL = "#f6f0de", OUTBG = "#eef4fa", INBG = "#fbfaf5";
const GLC_RGB = hexRGB(GLC), NA_RGB = hexRGB(NA);
const ASSAY_C = [0.5, 1, 2, 3, 5, 10, 15, 20];
const ASSAY_T = 20;
const fmt = (v: number, d = 1) => (Math.abs(v) < 0.05 && d === 1 ? 0 : v).toFixed(d);
function niceCeil(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (f * e >= v - 1e-9) return f * e;
  return 10 * e;
}
const fmtRatio = (r: number) => r >= 1000 ? Math.round(r).toLocaleString("en-US").replace(/,/g, " ") : r >= 10 ? r.toFixed(0) : r.toFixed(2);

function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill();
}

autoMount("uptake", host => {
  host.classList.add("up");
  const d = host.dataset;
  const seed = Number(d.seed) || 1;
  const init: M.Params = {
    path: d.path === "bilayer" || d.path === "SGLT" ? d.path : "GLUT",
    nT: Number(d.n) || 12, co: Number(d.co) || 5, naO: 145, pump: true, gliflozin: false,
  };
  let p: M.Params = { ...init };
  let cell: M.CellState = { naI: M.NA_IN0, q: 1 };
  let sim = new UptakeSim(p, cell, seed);
  let ciEq = 0, Jeq = 0;
  let hist: { t: number; cp: number; ce: number; co: number }[] = [];
  let speed = 1;
  let loop: ReturnType<typeof visibleLoop> | undefined;
  let assay: { c: number; v: number }[] = [], assayPath = p.path, assayBusy = false, assayParams = { ...p };

  // ---- phone toggle
  const tog = htmlEl("div", "qb-presets up-toggle", "", host);
  const tP = button(tog, "Molecules", () => showView("p"));
  const tC = button(tog, "Concentrations", () => showView("c"));

  // ---- the two views
  const views = htmlEl("div", "up-views", "", host);
  const boxP = htmlEl("div", "up-box", "", views);
  htmlEl("div", "up-title", "Molecules (each dot is moving at random)", boxP);
  const stage = htmlEl("div", "up-stage", "", boxP);
  const bg = htmlEl("canvas", "up-canvas", "", stage);
  const glc = htmlEl("canvas", "up-canvas", "", stage);
  glc.setAttribute("aria-label", "Side view of a membrane with glucose and sodium ions moving across");
  const outP = htmlEl("div", "up-big", "", boxP);

  const boxC = htmlEl("div", "up-box", "", views);
  htmlEl("div", "up-title", "Concentrations (calculated from the equations)", boxC);
  const csvg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "up-csvg" }, boxC);
  const outC = htmlEl("div", "up-big", "", boxC);
  // equation view elements
  const cOut = svgEl("rect", { x: 0, y: 0, width: W, height: OUT_Y1 }, csvg);
  const cIn = svgEl("rect", { x: 0, y: IN_Y0, width: W, height: H - IN_Y0 }, csvg);
  svgEl("rect", { x: 0, y: OUT_Y1, width: W, height: IN_Y0 - OUT_Y1, fill: MEMFILL, stroke: MEM, "stroke-width": 0.4 }, csvg);
  const cMarks = svgEl("g", {}, csvg);
  const naBarO = svgEl("rect", { x: W - 5, width: 3, fill: NA, opacity: 0.8 }, csvg);
  const naBarI = svgEl("rect", { x: W - 5, width: 3, fill: NA, opacity: 0.8 }, csvg);
  const tx = (x: number, y: number, size: number, anchor = "start") => svgEl("text", { x, y, "font-size": size, "text-anchor": anchor }, csvg);
  const lOut = tx(3, 7, 4.2), lIn = tx(3, H - 3, 4.2);
  const lOutC = tx(3, 14, 5.2), lInC = tx(3, IN_Y0 + 8, 5.2);
  const lNaO = tx(W - 6, 7, 3.6, "end"), lNaI = tx(W - 6, H - 3, 3.6, "end");
  lOut.textContent = "outside (bath)"; lIn.textContent = "inside the cell";
  const arrow = svgEl("path", { fill: "#1b2a3a", opacity: 0.85 }, csvg);
  const lJ = tx(W / 2 + 6, OUT_Y1 - 3, 4.6);
  lJ.setAttribute("font-weight", "600");
  for (const e of [lOutC, lInC]) e.setAttribute("font-weight", "600");

  // ---- plots
  const plots = htmlEl("div", "up-plots", "", host);
  const PW = 420, PH = 240, ML = 46, MR = 12, MT = 12, MB = 40;
  const mkPlot = (title: string) => {
    const box = htmlEl("div", "up-plotbox", "", plots);
    htmlEl("div", "up-title", title, box);
    const s = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "up-plot" }, box);
    return { box, svg: s, axes: svgEl("g", {}, s), data: svgEl("g", {}, s) };
  };
  const tp = mkPlot("Glucose inside the cell over time");
  const ap = mkPlot("Uptake assay: initial rate against outside glucose");
  const aBtns = htmlEl("div", "qb-presets", "", ap.box);
  const bAssay = button(aBtns, "Run assay series", () => runAssay());
  button(aBtns, "Clear", () => { assay = []; drawAssay(); });
  const aOut = htmlEl("div", "qb-readout", "Press “Run assay series”: at each outside concentration a fresh cell (settled in this bath, with the current pump and Na⁺ settings), initial rate over 20 s.", ap.box);

  // ---- controls
  const panel = htmlEl("div", "qb-panel up-panel", "", host);
  const c1 = htmlEl("div", "up-col", "", panel);
  htmlEl("div", "up-h", "Path across the membrane", c1);
  const pathBtns = presets(c1, [
    { label: "Bilayer only (diffusion)", apply: () => set({ path: "bilayer" }) },
    { label: "GLUT (uniporter)", apply: () => set({ path: "GLUT" }) },
    { label: "SGLT (2 Na⁺ + glucose)", apply: () => set({ path: "SGLT" }) },
  ]);
  const sCo = slider(c1, "outside glucose", 0, 20, 0.5, p.co, v => set({ co: v }), v => v.toFixed(1) + " mM");
  const sN = slider(c1, "transporters", 1, 24, 1, p.nT, v => set({ nT: v }), v => String(v));
  const sNa = slider(c1, "outside Na⁺", 0, 145, 5, p.naO, v => set({ naO: v }), v => v + " mM");
  const c2 = htmlEl("div", "up-col", "", panel);
  htmlEl("div", "up-h", "Drugs and run", c2);
  const cPump = checkbox(c2, "Na⁺/K⁺ pump working (untick = ouabain)", true, v => set({ pump: v }));
  const cGli = checkbox(c2, "gliflozin (blocks 90 % of SGLT)", false, v => set({ gliflozin: v }));
  const runRow = htmlEl("div", "qb-presets", "", c2);
  const bPause = button(runRow, "Pause", () => { if (!loop) return; loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(runRow, "Empty the cell", () => { sim.wash(); ciEq = 0; loop?.redraw(); });
  button(runRow, "Reset", () => reset());
  const spRow = htmlEl("div", "qb-presets", "", c2);
  const spBtns = [1, 3, 10].map(v => button(spRow, v === 1 ? "real time" : v + "× faster", () => { speed = v; spBtns.forEach((b, k) => b.classList.toggle("active", [1, 3, 10][k] === v)); }));
  spBtns[0].classList.add("active");
  const readout = htmlEl("div", "qb-readout", "", c2);
  const note = htmlEl("div", "qb-note up-note", "", host);
  note.innerHTML = "<b>Model.</b> Glucose dots (amber) and Na⁺ dots (blue) take random steps. A glucose dot touching the "
    + "bilayer crosses with a tiny probability (simple diffusion). A transporter faces out or in, never both "
    + "(alternating access); it binds a nearby glucose at a rate proportional to the concentration on its open side "
    + "(each compartment is taken as well mixed), flips, and releases it. SGLT binds glucose only with 2 Na⁺ bound, and "
    + "the membrane voltage speeds its loaded flip inward. These rules obey thermodynamics, so GLUT can only even out "
    + "glucose, while SGLT can concentrate it as far as (Na⁺out/Na⁺in)²·e<sup>−2FV/RT</sup>. "
    + "The equation view uses the same rates as smooth fluxes. Simplifications: the bath is large, so its "
    + "concentrations stay fixed; the cell does not use the glucose; Na⁺ dots are drawn at a different scale "
    + "(1 blue dot ≈ 0.33 mM, 1 amber dot ≈ 0.017 mM); K⁺ is not drawn; the voltage (−70 mV) runs down together "
    + "with the Na⁺ gradient when the pump stops. Rates are in slow motion (a real GLUT1 moves about 1000 glucose "
    + "per second). 1 dot per second = 1 mM per minute inside the cell.";

  function set(v: Partial<M.Params>) {
    p = { ...p, ...v };
    sim.setParams(p); sim.clamp();
    pathBtns.forEach((b, k) => b.classList.toggle("active", ["bilayer", "GLUT", "SGLT"][k] === p.path));
    loop?.redraw();
  }
  function reset() {
    p = { ...init };
    cell = { naI: M.NA_IN0, q: 1 };
    sim = new UptakeSim(p, cell, seed);
    ciEq = 0; hist = [];
    sCo.set(p.co); sN.set(p.nT); sNa.set(p.naO); cPump.checked = true; cGli.checked = false;
    set({});
  }
  function showView(v: "p" | "c") {
    host.classList.toggle("up-show-c", v === "c");
    tP.classList.toggle("active", v === "p"); tC.classList.toggle("active", v === "c");
  }
  showView("p");

  // ---- simulation
  function tick() {
    sim.cell = cell;
    sim.tick();
    const V = M.voltage(cell);
    Jeq = M.uptake(p, ciEq, cell.naI, V);
    const Js = p.path === "SGLT" ? Jeq - M.P_BILAYER * (p.co - ciEq) : 0;
    M.stepCell(cell, p, Js, DT);
    ciEq = Math.max(0, ciEq + Jeq / M.DOTS_PER_MM * DT);
    if (!hist.length || sim.t - hist[hist.length - 1].t >= 0.5) {
      hist.push({ t: sim.t, cp: sim.ci(), ce: ciEq, co: p.co });
      if (hist.length > 2400) hist = hist.filter((_, i) => i % 2 === 0);
    }
  }
  function step() { for (let k = 0; k < speed; k++) tick(); }

  // ---- drawing: particle view
  const pts = makePoints(26000);
  const rend = pointRenderer(glc, W, H);
  const bctx = bg.getContext("2d")!;
  function drawBg() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(bg.clientWidth * dpr), h = Math.round(bg.clientHeight * dpr);
    if (bg.width !== w || bg.height !== h) { bg.width = w; bg.height = h; }
    const k = w / W, c = bctx;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = OUTBG; c.fillRect(0, 0, W, OUT_Y1);
    c.fillStyle = INBG; c.fillRect(0, IN_Y0, W, H - IN_Y0);
    c.fillStyle = MEMFILL; c.fillRect(0, OUT_Y1, W, IN_Y0 - OUT_Y1);
    c.strokeStyle = MEM; c.lineWidth = 0.5;
    for (const y of [OUT_Y1, IN_Y0]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    // head groups, a light pattern
    c.fillStyle = "rgba(138,106,18,.35)";
    for (let x = 0.8; x < W; x += 1.6) { c.beginPath(); c.arc(x, OUT_Y1 + 0.7, 0.55, 0, 6.3); c.arc(x, IN_Y0 - 0.7, 0.55, 0, 6.3); c.fill(); }
    // leak channel and pump
    c.fillStyle = "#adb5bd"; c.fillRect(LEAK_X - 2.2, OUT_Y1 - 0.5, 1.6, 11); c.fillRect(LEAK_X + 0.6, OUT_Y1 - 0.5, 1.6, 11);
    c.fillStyle = p.pump ? "#6d4c00" : "#ced4da";
    rrect(c, PUMP_X - 3, OUT_Y1 - 1, 6, 12, 1.5);
    if (!p.pump) { c.fillStyle = "#e8590c"; c.beginPath(); c.arc(PUMP_X, OUT_Y1 - 1.5, 1.6, 0, 6.3); c.fill(); }
    // transporters
    for (const t of sim.ts) {
      const x = t.x;
      c.fillStyle = t.kind === "GLUT" ? "#7d8b99" : "#4f5f70";
      rrect(c, x - 2.4, OUT_Y1 - 0.8, 4.8, IN_Y0 - OUT_Y1 + 1.6, 1.2);
      c.fillStyle = t.side === 0 ? OUTBG : INBG;
      c.beginPath();
      if (t.side === 0) { c.moveTo(x - 1.3, OUT_Y1 - 0.9); c.lineTo(x + 1.3, OUT_Y1 - 0.9); c.lineTo(x, OUT_Y1 + 5.5); }
      else { c.moveTo(x - 1.3, IN_Y0 + 0.9); c.lineTo(x + 1.3, IN_Y0 + 0.9); c.lineTo(x, IN_Y0 - 5.5); }
      c.fill();
      if (t.blocked) { c.fillStyle = "#e8590c"; c.beginPath(); c.arc(x, OUT_Y1 - 0.6, 1.4, 0, 6.3); c.fill(); }
    }
    c.font = "3.4px system-ui, sans-serif"; c.fillStyle = "#1b2a3a";
    c.textAlign = "left"; c.fillText("outside (bath)", 1.5, 4.2); c.fillText("inside the cell", 1.5, H - 1.6);
    c.textAlign = "center"; c.font = "2.6px system-ui, sans-serif";
    c.textAlign = "left"; c.fillText("Na⁺ leak", 0.8, IN_Y0 + 3.6);
    c.textAlign = "right"; c.fillText(p.pump ? "Na⁺/K⁺ pump" : "pump blocked", W - 0.8, IN_Y0 + 3.6);
  }
  function drawDots() {
    let n = 0;
    const put = (x: number, y: number, s: number, col: [number, number, number]) => {
      pts.pos[2 * n] = x; pts.pos[2 * n + 1] = y; pts.size[n] = s;
      pts.col[4 * n] = col[0]; pts.col[4 * n + 1] = col[1]; pts.col[4 * n + 2] = col[2]; pts.col[4 * n + 3] = 255; n++;
    };
    const g = sim.g, na = sim.na;
    for (let i = 0; i < na.hi && n < 25000; i++) if (na.st[i] === 1) put(na.x[i], na.y[i], 1.15, NA_RGB);
    for (let i = 0; i < g.hi && n < 25000; i++) if (g.st[i] === 1) put(g.x[i], g.y[i], 1.5, GLC_RGB);
    for (const t of sim.ts) {        // bound cargo sits in the pocket
      const y = t.side === 0 ? OUT_Y1 + 2.4 : IN_Y0 - 2.4;
      if (t.cargo >= 0) put(t.x, y, 1.6, GLC_RGB);
      for (let k = 0; k < 2; k++) if (t.na[k] >= 0) put(t.x + (k ? 1.6 : -1.6), y + (t.side === 0 ? -2.2 : 2.2), 1.2, NA_RGB);
    }
    pts.n = n;
    rend.draw(pts);
  }

  // ---- drawing: equation view
  function drawEq() {
    const shade = (c: number) => `rgba(208,140,0,${Math.min(0.85, 0.06 + c / 20 * 0.8).toFixed(3)})`;
    cOut.setAttribute("fill", shade(p.co)); cIn.setAttribute("fill", shade(ciEq));
    lOutC.textContent = `glucose ${fmt(p.co)} mM`;
    lInC.textContent = `glucose ${fmt(ciEq, ciEq < 10 ? 2 : 1)} mM`;
    const naH = (v: number, h: number) => Math.min(1, v / 150) * h;
    const ho = naH(p.naO, OUT_Y1 - 4), hi = naH(cell.naI, H - IN_Y0 - 4);
    naBarO.setAttribute("y", String(OUT_Y1 - 2 - ho)); naBarO.setAttribute("height", String(ho));
    naBarI.setAttribute("y", String(H - 2 - hi)); naBarI.setAttribute("height", String(hi));
    lNaO.textContent = `Na⁺ ${p.naO.toFixed(0)} mM`; lNaI.textContent = `Na⁺ ${cell.naI.toFixed(0)} mM`;
    cMarks.innerHTML = "";
    for (const t of sim.ts) svgEl("rect", { x: t.x - 1.4, y: OUT_Y1 + 1, width: 2.8, height: 8, rx: 0.8, fill: t.blocked ? "#e8590c" : t.kind === "GLUT" ? "#7d8b99" : "#4f5f70" }, cMarks);
    // flux arrow, width ∝ |J|
    const w = Math.min(7, 0.6 + Math.abs(Jeq) * 0.22), x0 = 70, y0 = OUT_Y1 - 6, y1 = IN_Y0 + 6;
    if (Math.abs(Jeq) < 0.05) arrow.setAttribute("d", "");
    else if (Jeq > 0) arrow.setAttribute("d", `M${x0 - w / 2},${y0} L${x0 + w / 2},${y0} L${x0 + w / 2},${y1 - 3} L${x0 + w},${y1 - 3} L${x0},${y1} L${x0 - w},${y1 - 3} L${x0 - w / 2},${y1 - 3}Z`);
    else arrow.setAttribute("d", `M${x0 - w / 2},${y1} L${x0 + w / 2},${y1} L${x0 + w / 2},${y0 + 3} L${x0 + w},${y0 + 3} L${x0},${y0} L${x0 - w},${y0 + 3} L${x0 - w / 2},${y0 + 3}Z`);
    lJ.setAttribute("x", String(x0 + w + 1.5)); lJ.setAttribute("y", String(OUT_Y1 - 3));
    lJ.textContent = `${fmt(Jeq)} mM/min`;
  }

  // ---- time plot
  const tScale = { xMax: 60, yMax: 10 };
  function drawTime() {
    const tNow = sim.t;
    let ymax = p.co;
    for (const h of hist) ymax = Math.max(ymax, h.cp, h.ce, h.co);
    const xm = niceCeil(Math.max(60, tNow * 1.05)), ym = niceCeil(Math.max(1, ymax * 1.1));
    const sx = (t: number) => ML + t / xm * (PW - ML - MR), sy = (v: number) => MT + (1 - v / ym) * (PH - MT - MB);
    if (xm !== tScale.xMax || ym !== tScale.yMax || !tp.axes.childNodes.length) {
      tScale.xMax = xm; tScale.yMax = ym;
      axes(tp.axes, sx, sy, xm, ym, "time (s)", "mM");
    }
    tp.data.innerHTML = "";
    const line = (f: (h: typeof hist[0]) => number, attrs: Record<string, string | number>) => {
      let s = ""; for (const h of hist) s += (s ? "L" : "M") + sx(h.t).toFixed(1) + "," + sy(f(h)).toFixed(1);
      svgEl("path", { d: s, fill: "none", ...attrs }, tp.data);
    };
    line(h => h.co, { stroke: "#868e96", "stroke-width": 1.5, "stroke-dasharray": "5 4" });
    line(h => h.cp, { stroke: GLC, "stroke-width": 1.4 });
    line(h => h.ce, { stroke: "#1b2a3a", "stroke-width": 2.2, "stroke-dasharray": "8 4" });
    const lg = [["counted dots", GLC, ""], ["equations", "#1b2a3a", "8 4"], ["outside", "#868e96", "5 4"]];
    lg.forEach(([t, c, da], k) => {
      const x = ML + 8 + k * 118;
      svgEl("line", { x1: x, x2: x + 22, y1: MT + 8, y2: MT + 8, stroke: c, "stroke-width": 2.2, "stroke-dasharray": da }, tp.data);
      const e = svgEl("text", { x: x + 26, y: MT + 12, "font-size": 12.5 }, tp.data); e.textContent = t;
    });
  }
  function axes(g: SVGGElement, sx: (v: number) => number, sy: (v: number) => number, xm: number, ym: number, xl: string, yl: string) {
    g.innerHTML = "";
    const x0 = ML, x1 = PW - MR, y0 = PH - MB;
    for (let k = 0; k <= 4; k++) {
      const v = ym * k / 4, Y = sy(v);
      svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, class: "grid" }, g);
      const t = svgEl("text", { x: x0 - 5, y: Y + 4, "font-size": 12.5, "text-anchor": "end" }, g); t.textContent = +v.toPrecision(3) + "";
    }
    for (let k = 0; k <= 5; k++) {
      const v = xm * k / 5, X = sx(v);
      svgEl("line", { x1: X, x2: X, y1: y0, y2: y0 + 4, class: "axis" }, g);
      const t = svgEl("text", { x: X, y: y0 + 17, "font-size": 12.5, "text-anchor": "middle" }, g); t.textContent = +v.toPrecision(3) + "";
    }
    svgEl("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "axis" }, g);
    svgEl("line", { x1: x0, x2: x0, y1: MT, y2: y0, class: "axis" }, g);
    const a = svgEl("text", { x: (x0 + x1) / 2, y: PH - 5, "font-size": 13, "text-anchor": "middle" }, g); a.textContent = xl;
    const b = svgEl("text", { x: 12, y: MT + (y0 - MT) / 2, "font-size": 13, "text-anchor": "middle", transform: `rotate(-90 12 ${MT + (y0 - MT) / 2})` }, g); b.textContent = yl;
  }

  // ---- assay
  function runAssay() {
    if (assayBusy) return;
    assayBusy = true; bAssay.disabled = true; assay = [];
    assayParams = { ...p }; assayPath = p.path;
    const frozen = M.freshCell(assayParams);
    let k = 0;
    const next = () => {
      if (k >= ASSAY_C.length) { assayBusy = false; bAssay.disabled = false; drawAssay(); return; }
      const c = ASSAY_C[k];
      assay.push({ c, v: assayPoint(assayParams, frozen, c, ASSAY_T, seed * 100 + k) });
      k++; drawAssay();
      setTimeout(next, 10);
    };
    aOut.textContent = "running …";
    setTimeout(next, 10);
  }
  function drawAssay() {
    const fc = M.freshCell(assayParams);
    const vmaxTheory = M.uptake({ ...assayParams, co: 20 }, 0, fc.naI, M.voltage(fc));
    let ym = 1; for (const a of assay) ym = Math.max(ym, a.v); ym = Math.max(ym, vmaxTheory);
    ym = niceCeil(ym * 1.1);
    const sx = (c: number) => ML + c / 20 * (PW - ML - MR), sy = (v: number) => MT + (1 - v / ym) * (PH - MT - MB);
    axes(ap.axes, sx, sy, 20, ym, "outside glucose (mM)", "uptake (mM/min)");
    ap.data.innerHTML = "";
    if (!assay.length) return;
    // equation curve (same model, inside = 0)
    let s = "";
    for (let i = 0; i <= 80; i++) { const c = 20 * i / 80; s += (s ? "L" : "M") + sx(c).toFixed(1) + "," + sy(M.uptake({ ...assayParams, co: c }, 0, fc.naI, M.voltage(fc))).toFixed(1); }
    svgEl("path", { d: s, fill: "none", stroke: "#1b2a3a", "stroke-width": 1.6, "stroke-dasharray": "8 4" }, ap.data);
    for (const a of assay) svgEl("circle", { cx: sx(a.c), cy: sy(a.v), r: 5, fill: GLC, stroke: "#1b2a3a", "stroke-width": 1 }, ap.data);
    if (assay.length < ASSAY_C.length) { aOut.textContent = `running … ${assay.length} of ${ASSAY_C.length}`; return; }
    const name = assayPath === "bilayer" ? "bilayer only" : assayPath + ` (${assayParams.nT} transporters${assayPath === "SGLT" && assayParams.gliflozin ? ", gliflozin" : ""})`;
    if (assayPath === "bilayer") {
      const P = M.fitLine(assay);
      let t = ""; for (const c of [0, 20]) t += (t ? "L" : "M") + sx(c).toFixed(1) + "," + sy(P * c).toFixed(1);
      svgEl("path", { d: t, fill: "none", stroke: "#e8590c", "stroke-width": 2.2 }, ap.data);
      aOut.textContent = `${name}: a straight line through 0\nslope ${P.toFixed(3)} mM/min per mM: no saturation`;
    } else {
      const f = M.fitMM(assay)!;
      let t = ""; for (let i = 0; i <= 80; i++) { const c = 20 * i / 80; t += (t ? "L" : "M") + sx(c).toFixed(1) + "," + sy(f.vmax * c / (f.km + c)).toFixed(1); }
      svgEl("path", { d: t, fill: "none", stroke: "#e8590c", "stroke-width": 2.2 }, ap.data);
      const kmY = sy(f.vmax / 2), kmX = sx(Math.min(20, f.km));
      svgEl("line", { x1: ML, x2: PW - MR, y1: sy(f.vmax), y2: sy(f.vmax), stroke: "#e8590c", "stroke-dasharray": "3 4" }, ap.data);
      if (f.km < 20) svgEl("line", { x1: kmX, x2: kmX, y1: kmY, y2: PH - MB, stroke: "#e8590c", "stroke-dasharray": "3 4" }, ap.data);
      aOut.textContent = `${name}\nfit (Michaelis–Menten): Vmax = ${f.vmax.toFixed(1)} mM/min, Km = ${f.km.toFixed(f.km < 1 ? 2 : 1)} mM`;
    }
    const k = svgEl("text", { x: PW - MR - 4, y: MT + 14, "font-size": 12.5, "text-anchor": "end" }, ap.data);
    k.textContent = "dots: counted · dashed: equations · orange: fit";
  }

  // ---- readouts
  function render() {
    drawBg(); drawDots(); drawEq();
    const r = sim.rate(), cp = sim.ci();
    const V = M.voltage(cell);
    outP.textContent = `uptake ${r === null ? "…" : fmt(r)} mM/min · inside ${cp.toFixed(2)} mM`;
    outC.textContent = `uptake ${fmt(Jeq)} mM/min · inside ${ciEq.toFixed(2)} mM`;
    const lim = p.path === "SGLT" ? Math.pow(p.naO / Math.max(cell.naI, 1e-3), 2) * Math.exp(-2 * V / M.RTF) : 1;
    readout.textContent = `time ${sim.t.toFixed(0)} s\n`
      + `Na⁺ inside ${cell.naI.toFixed(1)} mM · voltage ${V.toFixed(0)} mV\n`
      + `inside/outside glucose: dots ${p.co > 0 ? (cp / p.co).toFixed(2) : "–"} · equations ${p.co > 0 ? (ciEq / p.co).toFixed(2) : "–"}\n`
      + `highest possible ratio: ${p.path === "bilayer" ? "1 (diffusion)" : p.path === "GLUT" ? "1 (passive)" : fmtRatio(lim)}`;
    drawTime();
  }

  set({});
  drawAssay();
  loop = visibleLoop(host, 1 / 60, step, render, 2);
  loop.redraw();
});
