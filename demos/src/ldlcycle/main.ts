// Demo: LDL receptor cycle. Two tabs:
//  1. A liver cell at real time: receptors bind LDL, enter coated pits, release LDL in the
//     acidic sorting endosome and recycle, or go to the lysosome (with PCSK9, or when they
//     cannot let go of LDL). Controls: person (healthy / FH / PCSK9 gain of function),
//     endosome pH, PCSK9 level, statin, PCSK9 antibody. A plot shows what the same model
//     predicts for the blood LDL and the surface receptors over weeks.
//  2. LNP escape: lipid nanoparticles in an endosome that acidifies; the ionisable lipid
//     becomes charged below its pKa and a few particles escape before the lysosome.
// Qualitative compartment model (model.ts); the cell view (sim.ts) uses the same rates.
// Options (data-*): tab = ldl|lnp, seed.
import { autoMount, htmlEl, svgEl, slider, button, checkbox, presets } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import * as M from "./model";
import { CellSim, Receptor, W, H, MEM_Y, ENDO, LYSO, GOLGI, N_HEALTHY } from "./sim";
import { LnpSim, LW, LH, LENDO, LLYSO, N_LNP } from "./lnpsim";

const C = {
  ink: "#1b2a3a", mem: "#8a6a12", memFill: "#f6f0de", cyto: "#fbfaf5", blood: "#f8eded",
  endo: "#2e8b57", endoFill: "#e3f3ea", golgi: "#d9822b", golgiFill: "#fbeedd",
  rec: "#3d4f63", ldl: "#e0a800", pcsk9: "#c2408a", drug: "#e8590c", coat: "#7d8b99", h: "#1098ad",
  rna: "#c92a2a", lipid: "#c9b37a",
};

const CSS = `
.qb-demo.ld { display: block; }
.ld .ld-tabs { margin-bottom: .6em; }
.ld .ld-tabs .qb-btn, .ld .qb-presets .qb-btn { min-height: 36px; }
.ld .ld-row { display: flex; flex-wrap: wrap; gap: 1em; align-items: flex-start; }
.ld .ld-box { flex: 1 1 340px; min-width: 0; max-width: 560px; }
.ld .ld-title, .ld .ld-h { font-weight: 600; font-size: .95em; margin-bottom: .25em; }
.ld .ld-stage { position: relative; width: 100%; border-radius: 6px; overflow: hidden; border: 1px solid #ccd; }
.ld .ld-stage canvas { display: block; width: 100%; height: 100%; }
.ld .ld-status { font-family: ui-monospace, monospace; font-size: .85em; color: var(--qb-muted); margin-top: .25em; }
.ld .ld-plot { width: 100%; height: auto; display: block; }
.ld .ld-legend { display: flex; flex-wrap: wrap; gap: .3em 1em; font-size: .85em; margin-top: .35em; }
.ld .ld-legend span { display: inline-flex; align-items: center; gap: .3em; }
.ld .ld-legend i { display: inline-block; width: .8em; height: .8em; border-radius: 50%; }
.ld .ld-panel { display: flex; flex-wrap: wrap; gap: 1.2em; margin-top: 1em; }
.ld .ld-col { flex: 1 1 300px; display: flex; flex-direction: column; gap: .5em; min-width: 0; max-width: 520px; }
.ld .ld-note { margin-top: .8em; }
.ld .ld-big { font-weight: 600; margin-top: .3em; font-variant-numeric: tabular-nums; }
.ld .qb-readout { font-size: .85em; }
.ld .ld-hide { display: none; }
@media (max-width: 640px) { .ld .ld-box, .ld .ld-col { max-width: 100%; flex-basis: 100%; } }
`;
function injectCss() {
  if (document.getElementById("ld-css")) return;
  const s = document.createElement("style"); s.id = "ld-css"; s.textContent = CSS; document.head.appendChild(s);
}

const PERSONS: { label: string; s: M.Settings }[] = [
  { label: "Healthy", s: M.HEALTHY },
  { label: "FH: one faulty LDLR gene", s: { ...M.HEALTHY, genes: 0.5 } },
  { label: "FH: two faulty LDLR genes", s: { ...M.HEALTHY, genes: 0.02 } },
  { label: "PCSK9 gain of function", s: { ...M.HEALTHY, pcsk9: 3 } },
];
const SPEEDS = [1, 10, 60];
const speedLabel = (v: number) => v === 1 ? "real time" : v === 60 ? "60× (1 min per s)" : v + "× faster";
const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min ${String(x).padStart(2, "0")} s`;
};
/** Round axis maximum and tick step (4–6 ticks). */
function niceAxis(v: number): { max: number; step: number } {
  const e = Math.pow(10, Math.floor(Math.log10(v / 4)));
  for (const f of [1, 2, 2.5, 5, 10]) { const st = f * e; if (v / st <= 5) return { max: Math.ceil(v / st - 1e-9) * st, step: st }; }
  return { max: v, step: v / 4 };
}
/** Mix two #rrggbb colours. */
function mix(a: string, b: string, f: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - f) + ((pb >> s) & 255) * f);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
/** Fixed pseudo-random positions (no flicker): k-th point in a disc of radius r. */
function discPt(k: number, r: number): [number, number] {
  const h = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const a = h(k) * 6.2832, d = r * Math.sqrt(h(k + 0.5));
  return [d * Math.cos(a), d * Math.sin(a)];
}

/** A canvas whose drawing coordinates are world units. */
function worldCanvas(parent: HTMLElement, w: number, h: number, label: string) {
  const stage = htmlEl("div", "ld-stage", "", parent);
  stage.style.aspectRatio = `${w} / ${h}`;
  const cv = htmlEl("canvas", "", "", stage);
  cv.setAttribute("role", "img"); cv.setAttribute("aria-label", label);
  const ctx = cv.getContext("2d")!;
  const begin = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(cv.clientWidth * dpr)), ph = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const k = pw / w;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, px: k / dpr };   // px: CSS pixels per world unit
  };
  return { stage, cv, begin };
}
function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill?: string, stroke?: string, lw = 0.3) {
  c.beginPath(); c.arc(x, y, r, 0, 6.2832);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
/** Text at a size given in CSS pixels, so it stays readable on a phone. */
function label(c: CanvasRenderingContext2D, px: number, t: string, x: number, y: number, size = 13, align: CanvasTextAlign = "left", col = C.ink, bold = false, bg = "") {
  c.font = `${bold ? "600 " : ""}${(size / px).toFixed(2)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  c.textAlign = align;
  if (bg) {
    const w = c.measureText(t).width, hh = size / px, pad = 2 / px;
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    c.fillStyle = bg; c.fillRect(x0 - pad, y - hh * 0.85, w + 2 * pad, hh * 1.1);
  }
  c.fillStyle = col; c.fillText(t, x, y);
}

autoMount("ldlcycle", host => {
  injectCss();
  host.classList.add("ld");
  const seed = Number(host.dataset.seed) || 1;
  const tabs = htmlEl("div", "qb-presets ld-tabs", "", host);
  const paneA = htmlEl("div", "", "", host);
  const paneB = htmlEl("div", "", "", host);
  const tabBtns = presets(tabs, [
    { label: "LDL receptor cycle", apply: () => show("ldl") },
    { label: "LNP escape from the endosome", apply: () => show("lnp") },
  ]);
  const A = ldlTab(paneA, seed);
  const B = lnpTab(paneB, seed);
  function show(t: string) {
    paneA.classList.toggle("ld-hide", t !== "ldl");
    paneB.classList.toggle("ld-hide", t !== "lnp");
    tabBtns.forEach((b, k) => b.classList.toggle("active", (k === 0) === (t === "ldl")));
    A.setVisible(t === "ldl"); B.setVisible(t === "lnp");
  }
  show(host.dataset.tab === "lnp" ? "lnp" : "ldl");
});

// =====================================================================================
// Tab 1: the LDL receptor cycle
// =====================================================================================
function ldlTab(root: HTMLElement, seed: number) {
  let person = 0;
  let s: M.Settings = { ...PERSONS[0].s };
  let base: M.Settings = { ...PERSONS[0].s };
  let Lcell = M.steady(base).L;
  let sim = new CellSim(s, Lcell, seed);
  let speed = 1, visible = true;

  const row = htmlEl("div", "ld-row", "", root);
  const boxA = htmlEl("div", "ld-box", "", row);
  htmlEl("div", "ld-title", "A liver cell, at real time (each icon is one molecule or particle)", boxA);
  const view = worldCanvas(boxA, W, H, "A liver cell with LDL receptors cycling between the surface, the endosome and the lysosome");
  const status = htmlEl("div", "ld-status", "", boxA);
  const leg = htmlEl("div", "ld-legend", "", boxA);
  for (const [t, c] of [["LDL receptor", C.rec], ["LDL", C.ldl], ["PCSK9", C.pcsk9], ["antibody", C.drug], ["clathrin coat", C.coat], ["H⁺", C.h]] as const)
    htmlEl("span", "", "", leg).innerHTML = `<i style="background:${c}"></i>${t}`;
  const cellOut = htmlEl("div", "qb-readout", "", boxA);
  cellOut.style.marginTop = ".4em";

  const boxB = htmlEl("div", "ld-box", "", row);
  htmlEl("div", "ld-title", "In the body, over weeks (calculated with the same model)", boxB);
  const PW = 440, PH = 345;
  const plot = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "ld-plot", role: "img", "aria-label": "LDL in the blood and receptors at the surface over 8 weeks" }, boxB);
  const bodyOut = htmlEl("div", "ld-big", "", boxB);
  const bodyNote = htmlEl("div", "qb-readout", "", boxB);
  bodyNote.style.marginTop = ".4em";

  // ---- controls
  const panel = htmlEl("div", "ld-panel", "", root);
  const c1 = htmlEl("div", "ld-col", "", panel);
  htmlEl("div", "ld-h", "Person (before treatment)", c1);
  const pBtns = presets(c1, PERSONS.map((p, k) => ({ label: p.label, apply: () => setPerson(k) })));
  const sPH = slider(c1, "endosome pH", 5.0, 7.4, 0.1, s.pH, v => set({ pH: v }), v => v.toFixed(1));
  const sP = slider(c1, "PCSK9 level", 0, 4, 0.1, s.pcsk9, v => set({ pcsk9: v }), v => v.toFixed(1) + "×");
  const c2 = htmlEl("div", "ld-col", "", panel);
  htmlEl("div", "ld-h", "Drugs and time", c2);
  const cSt = checkbox(c2, "statin (cell makes more receptors)", false, v => set({ statin: v }));
  const cAb = checkbox(c2, "PCSK9 antibody (binds 95 % of PCSK9)", false, v => set({ antibody: v }));
  const runRow = htmlEl("div", "qb-presets", "", c2);
  const bPause = button(runRow, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(runRow, "Skip ahead 6 hours", () => { for (let i = 0; i < 6 * 3600; i++) sim.step(1, false); loop.redraw(); });
  button(runRow, "Reset", () => setPerson(person));
  const spRow = htmlEl("div", "qb-presets", "", c2);
  const spBtns = SPEEDS.map(v => button(spRow, speedLabel(v), () => { speed = v; spBtns.forEach((b, k) => b.classList.toggle("active", SPEEDS[k] === v)); }));
  spBtns[0].classList.add("active");

  const note = htmlEl("div", "qb-note ld-note", "", root);
  note.innerHTML = "<b>Model (qualitative).</b> A compartment model with round numbers, not fitted to patients. "
    + "A receptor at the surface binds LDL, is taken into a clathrin-coated pit (on average after about 7 minutes), "
    + "and reaches the sorting endosome. If the endosome is acid enough (pH below about 6.5), LDL lets go and goes on "
    + "to the lysosome, and the receptor recycles to the surface. A receptor is sent to the lysosome instead if it carries "
    + "PCSK9, if it still holds its LDL, or by chance (about 1 trip in 200). New receptors come from the ER and Golgi; "
    + "a statin doubles their synthesis (and raises PCSK9 1.5×, because both genes are switched on by the same "
    + "sterol-sensing factor, SREBP2). The plot uses the same rates: receptors at the surface = synthesis ÷ (chance of "
    + "being destroyed per trip × uptake rate), and the blood LDL follows production − (non-receptor clearance + "
    + "receptor clearance) × LDL, with an LDL half-life in blood of about two days. Simplifications: the cell view keeps "
    + "the blood LDL of the person before treatment (blood LDL changes over days, the cell view shows minutes); one "
    + "drawn receptor stands for many thousands; the drift of particles in the blood is drawn slowly and is not to scale; "
    + "drug doses and the feedback of cell cholesterol on receptor synthesis are left out.";

  function setPerson(k: number) {
    person = k;
    pBtns.forEach((b, i) => b.classList.toggle("active", i === k));
    base = { ...PERSONS[k].s };
    s = { ...base };
    sPH.set(s.pH); sP.set(s.pcsk9); cSt.checked = false; cAb.checked = false;
    Lcell = M.steady(base).L;
    sim = new CellSim(s, Lcell, seed);
    drawPlot(); loop?.redraw();
  }
  function set(v: Partial<M.Settings>) {
    s = { ...s, ...v };
    sim.setSettings(s, Lcell);
    drawPlot(); loop?.redraw();
  }

  // ---- body plot
  function drawPlot() {
    plot.innerHTML = "";
    const days = 56;
    const before = M.course(base, base, days), after = M.course(base, s, days);
    const ML = 50, MR = 14, x0 = ML, x1 = PW - MR;
    const sx = (t: number) => x0 + t / days * (x1 - x0);
    const panels = [
      { y0: 40, y1: 165, key: "L" as const, yl: "LDL (mmol/L)", f: (p: M.BodyPoint) => p.L },
      { y0: 215, y1: 312, key: "R" as const, yl: "receptors (%)", f: (p: M.BodyPoint) => p.R * 100 },
    ];
    for (const P of panels) {
      let ym = 0;
      for (const p of [...before, ...after]) ym = Math.max(ym, P.f(p));
      const ax = niceAxis(Math.max(P.key === "L" ? 3 : 120, ym * 1.05));
      ym = ax.max;
      const sy = (v: number) => P.y1 - v / ym * (P.y1 - P.y0);
      for (let v = 0; v <= ym + 1e-9; v += ax.step) {
        const Y = sy(v);
        svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, class: "grid" }, plot);
        svgEl("text", { x: x0 - 5, y: Y + 4, "font-size": 12, "text-anchor": "end" }, plot).textContent = String(+v.toPrecision(3));
      }
      svgEl("line", { x1: x0, x2: x1, y1: P.y1, y2: P.y1, class: "axis" }, plot);
      svgEl("line", { x1: x0, x2: x0, y1: P.y0, y2: P.y1, class: "axis" }, plot);
      for (let w = 0; w <= 8; w++) {
        const X = sx(w * 7);
        svgEl("line", { x1: X, x2: X, y1: P.y1, y2: P.y1 + 4, class: "axis" }, plot);
        svgEl("text", { x: X, y: P.y1 + 16, "font-size": 12, "text-anchor": "middle" }, plot).textContent = String(w);
      }
      const yc = (P.y0 + P.y1) / 2;
      svgEl("text", { x: 13, y: yc, "font-size": 12.5, "text-anchor": "middle", transform: `rotate(-90 13 ${yc})` }, plot).textContent = P.yl;
      if (P.key === "L" && 1.8 < ym) {
        const Y = sy(1.8);
        svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, stroke: "#2b8a3e", "stroke-dasharray": "2 4", "stroke-width": 1.5 }, plot);
        svgEl("text", { x: x1 - 4, y: Y - 4, "font-size": 11.5, "text-anchor": "end", fill: "#2b8a3e" }, plot).textContent = "goal for high-risk patients: 1.8";
      }
      if (P.key === "R") {
        const Y = sy(100);
        svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, stroke: "#868e96", "stroke-dasharray": "2 4" }, plot);
      }
      const path = (pts: M.BodyPoint[]) => pts.map((p, i) => (i ? "L" : "M") + sx(p.t).toFixed(1) + "," + sy(P.f(p)).toFixed(1)).join("");
      svgEl("path", { d: path(before), fill: "none", stroke: "#868e96", "stroke-width": 2, "stroke-dasharray": "6 4" }, plot);
      svgEl("path", { d: path(after), fill: "none", stroke: P.key === "L" ? "#b07d00" : C.rec, "stroke-width": 2.6 }, plot);
    }
    svgEl("text", { x: (x0 + x1) / 2, y: 193, "font-size": 12.5, "text-anchor": "middle" }, plot).textContent = "weeks after the change";
    svgEl("text", { x: (x0 + x1) / 2, y: PH - 6, "font-size": 12.5, "text-anchor": "middle" }, plot).textContent = "weeks after the change";
    // legend
    svgEl("line", { x1: x0 + 10, x2: x0 + 34, y1: 12, y2: 12, stroke: "#868e96", "stroke-width": 2, "stroke-dasharray": "6 4" }, plot);
    svgEl("text", { x: x0 + 38, y: 16, "font-size": 11.5 }, plot).textContent = "before (person, no drugs)";
    svgEl("line", { x1: x0 + 200, x2: x0 + 224, y1: 12, y2: 12, stroke: "#b07d00", "stroke-width": 2.6 }, plot);
    svgEl("text", { x: x0 + 228, y: 16, "font-size": 11.5 }, plot).textContent = "with current settings";
    const L0 = before[0].L, L1 = after[after.length - 1].L, R1 = after[after.length - 1].R;
    const ch = (L1 / L0 - 1) * 100;
    bodyOut.textContent = `LDL in blood: ${L0.toFixed(1)} → ${L1.toFixed(1)} mmol/L (${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(0)} %)`;
    const life = M.lifetimeH(s, L1);
    bodyNote.textContent = `receptors at the surface: ${(R1 * 100).toFixed(0)} % of a healthy liver\n`
      + `LDL released in the endosome: ${(M.release(s.pH) * 100).toFixed(1)} % · receptor lifetime about ${life.toFixed(0)} h (≈ ${(1 / M.qTrip(s, L1)).toFixed(0)} round trips)\n`
      + `active PCSK9: ${M.pcsk9Free(s).toFixed(2)}× healthy`;
  }

  // ---- cell view
  function drawCell() {
    const { ctx: c, px } = view.begin();
    // blood and cytosol
    c.fillStyle = C.blood; c.fillRect(0, 0, W, MEM_Y);
    c.fillStyle = C.cyto; c.fillRect(0, MEM_Y, W, H - MEM_Y);
    // plasma membrane with pits
    const pits = sim.pits.filter(p => !p.done);
    c.fillStyle = C.memFill; c.strokeStyle = C.mem; c.lineWidth = 0.35;
    c.beginPath(); c.moveTo(0, MEM_Y);
    const sorted = pits.slice().sort((a, b) => a.x - b.x);
    for (const p of sorted) {
      const d = 5.5 * Math.min(1, p.age / 30), w = 3.2;
      c.lineTo(p.x - w - 1, MEM_Y);
      c.bezierCurveTo(p.x - w, MEM_Y + d * 0.2, p.x - w * 1.1, MEM_Y + d, p.x, MEM_Y + d);
      c.bezierCurveTo(p.x + w * 1.1, MEM_Y + d, p.x + w, MEM_Y + d * 0.2, p.x + w + 1, MEM_Y);
    }
    c.lineTo(W, MEM_Y); c.lineTo(W, MEM_Y + 1.6);
    for (const p of sorted.slice().reverse()) {
      const d = 5.5 * Math.min(1, p.age / 30) + 1.6, w = 3.2 - 1.2;
      c.lineTo(p.x + w + 2.2, MEM_Y + 1.6);
      c.bezierCurveTo(p.x + w + 1, MEM_Y + 1.6 + d * 0.2, p.x + w * 1.2, MEM_Y + d, p.x, MEM_Y + d);
      c.bezierCurveTo(p.x - w * 1.2, MEM_Y + d, p.x - w - 1, MEM_Y + 1.6 + d * 0.2, p.x - w - 2.2, MEM_Y + 1.6);
    }
    c.lineTo(0, MEM_Y + 1.6); c.closePath(); c.fill(); c.stroke();
    // clathrin coat on pits, dynamin collar near the end
    for (const p of pits) {
      const d = 5.5 * Math.min(1, p.age / 30) + 1.6;
      c.strokeStyle = C.coat; c.lineWidth = 0.35;
      for (let k = -3; k <= 3; k++) {
        const a = Math.PI / 2 + k * 0.38, rx = 2.4, ry = d * 0.62;
        const bx = p.x + rx * Math.cos(a) * 1.25, by = MEM_Y + 1.6 + (d - 1.6) * 0.45 + ry * Math.sin(a) * 0.8;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 0.9 * Math.cos(a), by + 0.9 * Math.sin(a)); c.stroke();
      }
      if (p.age > 30) { c.fillStyle = C.ink; c.fillRect(p.x - 2.6, MEM_Y + 2.1, 1, 0.9); c.fillRect(p.x + 1.6, MEM_Y + 2.1, 1, 0.9); }
    }
    // Golgi (source of new receptors)
    c.strokeStyle = C.golgi; c.lineWidth = 0.9; c.lineCap = "round";
    for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(GOLGI.x, GOLGI.y + 9 + k * 1.6, 8, Math.PI * 1.3, Math.PI * 1.7); c.stroke(); }
    c.lineCap = "butt";
    label(c, px, "Golgi: new receptors", W - 1.5, H - 1.8, 12, "right", C.golgi, true);
    // endosome: tint and H⁺ by pH
    const acid = Math.max(0, Math.min(1, (7.4 - sim.s.pH) / 2.9));
    circle(c, ENDO.x, ENDO.y, ENDO.r, mix("#f4faf6", "#bfe3cd", acid), C.endo, 0.5);
    const nH = Math.round(3 + 6 * Math.pow(10, 6.5 - sim.s.pH));
    for (let k = 0; k < Math.min(60, nH); k++) { const [dx, dy] = discPt(k + 3, ENDO.r - 1.5); circle(c, ENDO.x + dx, ENDO.y + dy, 0.35, C.h); }
    label(c, px, "sorting endosome", ENDO.x, ENDO.y + ENDO.r + 3.6, 12.5, "center", C.endo, true);
    label(c, px, `pH ${sim.s.pH.toFixed(1)}`, ENDO.x, ENDO.y + ENDO.r + 7.2, 12.5, "center", C.endo);
    // V-ATPase pumps on the endosome
    for (let k = 0; k < 4; k++) { const a = 0.4 + k * 1.57; circle(c, ENDO.x + ENDO.r * Math.cos(a), ENDO.y + ENDO.r * Math.sin(a), 0.8, C.h); }
    circle(c, LYSO.x, LYSO.y, LYSO.r, "#cfe9da", C.endo, 0.6);
    for (let k = 0; k < 30; k++) { const [dx, dy] = discPt(k + 11, LYSO.r - 1.2); circle(c, LYSO.x + dx, LYSO.y + dy, 0.3, C.h); }
    label(c, px, "lysosome pH 4.8", LYSO.x, LYSO.y - LYSO.r - 1.6, 12.5, "center", C.endo, true);
    // vesicles from pits (coated for the first 8 s, then uncoated)
    for (const p of sim.pits.filter(q => q.done)) {
      circle(c, p.vx, p.vy, 2.7, C.cyto, C.mem, 0.35);
      if (p.tv < 8) { c.strokeStyle = C.coat; c.lineWidth = 0.35; for (let k = 0; k < 10; k++) { const a = k * 0.628; c.beginPath(); c.moveTo(p.vx + 2.9 * Math.cos(a), p.vy + 2.9 * Math.sin(a)); c.lineTo(p.vx + 3.7 * Math.cos(a), p.vy + 3.7 * Math.sin(a)); c.stroke(); } }
    }
    // small transport vesicles: recycling, to the lysosome, new receptors
    for (const R of sim.rs) if (R.state === "back" || R.state === "tolys" || R.state === "new") circle(c, R.x, R.y, 1.9, C.cyto, R.state === "new" ? C.golgi : C.endo, 0.3);
    // LDL inside the cell
    for (const q of sim.ldl) if (q.where === "endo" || q.where === "tolys" || q.where === "lys") {
      c.globalAlpha = q.where === "lys" ? Math.max(0, q.fade) : 1;
      if (q.where === "tolys") circle(c, q.x, q.y, 1.9, C.cyto, C.endo, 0.3);
      circle(c, q.x, q.y, 1.15, C.ldl, "#8a6a00", 0.2);
    }
    c.globalAlpha = 1;
    // receptors
    for (const R of sim.rs) drawReceptor(c, R);
    // blood particles
    sim.ldl.forEach(q => { if (q.where === "blood" || q.where === "toR") circle(c, q.x, q.y, 1.15, C.ldl, "#8a6a00", 0.2); });
    sim.pcsk9.forEach((q, i) => {
      if (q.where !== "blood" && q.where !== "toR") return;
      circle(c, q.x, q.y, 0.6, C.pcsk9);
      if (q.where === "blood" && sim.hasAntibody(i)) drawY(c, q.x + 1.1, q.y - 0.2, 0.8, C.drug, -0.6);
    });
    label(c, px, "blood", 1.2, 3.8, 12.5, "left", C.ink, true, "rgba(248,237,237,.85)");
    label(c, px, "liver cell", 1.2, MEM_Y + 6.2, 12.5, "left", C.ink, true, "rgba(251,250,245,.85)");
  }
  function drawY(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, ang: number) {
    c.save(); c.translate(x, y); c.rotate(ang); c.strokeStyle = col; c.lineWidth = 0.35 * s / 0.8;
    c.beginPath(); c.moveTo(0, s); c.lineTo(0, 0); c.lineTo(-0.7 * s, -0.8 * s); c.moveTo(0, 0); c.lineTo(0.7 * s, -0.8 * s); c.stroke(); c.restore();
  }
  function drawReceptor(c: CanvasRenderingContext2D, R: Receptor) {
    let ang = 0, x = R.x, y = R.y;       // ang: direction the binding end points (0 = up)
    if (R.state === "surf" || R.state === "pit") {
      ang = 0; y = MEM_Y;
      if (R.state === "pit") { const p = sim.pits.find(q => q.id === R.pit); if (p) { const f = Math.min(1, p.age / 30); const off = (R.x - p.x); y = MEM_Y + 5.5 * f * Math.max(0, 1 - (off * off) / 10) * 0.9; ang = Math.max(-0.5, Math.min(0.5, -off * 0.12 * f)); } }
    } else if (R.state === "endo") ang = Math.atan2(ENDO.x - x, -(ENDO.y - y));
    else if (R.state === "ves") { const p = sim.pits.find(q => q.id === R.pit); if (p) ang = Math.atan2(p.vx - x, -(p.vy - y)); }
    else if (R.state === "lys") ang = Math.atan2(LYSO.x - x, -(LYSO.y - y));
    c.save(); c.globalAlpha = R.state === "lys" ? Math.max(0, R.fade) : 1;
    c.translate(x, y); c.rotate(ang);
    const off = R.state === "surf" || R.state === "pit" ? 0 : 0.6;
    c.strokeStyle = C.rec; c.lineWidth = 0.42;
    c.beginPath(); c.moveTo(0, 1.4 - off); c.lineTo(0, -0.6 - off); c.lineTo(-0.7, -1.5 - off); c.moveTo(0, -0.6 - off); c.lineTo(0.7, -1.5 - off); c.stroke();
    if (R.ldl) circle(c, 0, -2.4 - off, 1.15, C.ldl, "#8a6a00", 0.2);
    if (R.pcsk9) circle(c, 0.95, -0.9 - off, 0.6, C.pcsk9);
    c.restore();
  }

  function render() {
    drawCell();
    const nS = sim.surface();
    status.textContent = `time ${fmtTime(sim.t)} · ${speed === 1 ? "real time" : speed + "× faster"}${loop?.paused ? " · paused" : ""}`;
    const hr = Math.min(3600, sim.t);
    const per = hr < 3600 ? ` (in the first ${Math.max(1, Math.round(hr / 60))} min)` : " (last hour)";
    cellOut.textContent = `receptors at the surface: ${nS} (healthy cell ≈ ${N_HEALTHY}) · inside: ${sim.inside()}\n`
      + `LDL taken in${per}: ${sim.recent("ldlIn")}\n`
      + `receptors destroyed${per}: ${sim.recent("destroyed") + sim.recent("destroyedP")} (with PCSK9: ${sim.recent("destroyedP")}) · new: ${sim.recent("new")}`;
  }
  const loop = visibleLoop(root, 1 / 60, () => { if (visible) sim.step(speed / 60, true); }, render, 1);
  setPerson(0);
  return { setVisible(v: boolean) { visible = v; loop.setPaused(!v || bPause.textContent === "Run"); if (v) loop.redraw(); } };
}

// =====================================================================================
// Tab 2: lipid nanoparticles escaping from the endosome
// =====================================================================================
function lnpTab(root: HTMLElement, seed: number) {
  let pKa = 6.4, pHend = 5.5, speed = 1, visible = false;
  let sim = new LnpSim(pKa, pHend, seed);

  const row = htmlEl("div", "ld-row", "", root);
  const boxA = htmlEl("div", "ld-box", "", row);
  htmlEl("div", "ld-title", `${N_LNP} lipid nanoparticles just taken up into one endosome`, boxA);
  const view = worldCanvas(boxA, LW, LH, "An endosome with lipid nanoparticles; a few escape into the cytosol");
  const status = htmlEl("div", "ld-status", "", boxA);
  const leg = htmlEl("div", "ld-legend", "", boxA);
  for (const [t, c] of [["LNP, uncharged", C.lipid], ["LNP, charged (+)", C.h], ["RNA in the cytosol", C.rna], ["H⁺", C.h]] as const)
    htmlEl("span", "", "", leg).innerHTML = `<i style="background:${c}"></i>${t}`;
  const out = htmlEl("div", "ld-big", "", boxA);

  const boxB = htmlEl("div", "ld-box", "", row);
  htmlEl("div", "ld-title", "Calculated: how much RNA reaches the cytosol", boxB);
  const PW = 440, PH = 420;
  const plot = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "ld-plot", role: "img", "aria-label": "Escape against pKa, and charge against pH" }, boxB);
  const calc = htmlEl("div", "qb-readout", "", boxB);
  calc.style.marginTop = ".4em";

  const panel = htmlEl("div", "ld-panel", "", root);
  const c1 = htmlEl("div", "ld-col", "", panel);
  htmlEl("div", "ld-h", "Lipid and endosome", c1);
  const sK = slider(c1, "pKa of the ionisable lipid", 5.0, 9.0, 0.1, pKa, v => { pKa = v; changed(); }, v => v.toFixed(1));
  const sE = slider(c1, "lowest endosome pH", 4.5, 7.4, 0.1, pHend, v => { pHend = v; changed(); }, v => v.toFixed(1));
  presets(c1, [
    { label: "Approved LNP (pKa 6.4)", apply: () => { pKa = 6.4; pHend = 5.5; sync(); } },
    { label: "Always charged (pKa 9)", apply: () => { pKa = 9; pHend = 5.5; sync(); } },
    { label: "V-ATPase blocked", apply: () => { pHend = 7.2; sync(); } },
  ]);
  const c2 = htmlEl("div", "ld-col", "", panel);
  htmlEl("div", "ld-h", "Run", c2);
  const runRow = htmlEl("div", "qb-presets", "", c2);
  const bPause = button(runRow, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(runRow, "Start again", () => restart());
  const spRow = htmlEl("div", "qb-presets", "", c2);
  const spBtns = SPEEDS.map(v => button(spRow, speedLabel(v), () => { speed = v; spBtns.forEach((b, k) => b.classList.toggle("active", SPEEDS[k] === v)); }));
  spBtns[0].classList.add("active");
  htmlEl("div", "qb-note", "Changing a slider starts a new endosome.", c2);

  const note = htmlEl("div", "qb-note ld-note", "", root);
  note.innerHTML = "<b>Model (qualitative).</b> The ionisable lipid carries a + charge on a fraction 1/(1 + 10<sup>pH − pKa</sup>) "
    + "of its molecules (Henderson–Hasselbalch). After uptake the endosome acidifies from pH 7.4 towards its lowest pH "
    + "(half-way in about 6 minutes) as V-ATPase pumps in H⁺. Each particle escapes at a rate that rises with the square of "
    + "its charged fraction (charged lipid pairs with negative lipids of the endosome membrane and disturbs it), and meanwhile "
    + "the endosome hands its contents on to the lysosome (on average after 25 minutes), where the RNA is destroyed. "
    + "A particle that is already charged in the blood (pH 7.4) sticks to blood proteins and cells, is removed and is more "
    + "toxic, so fewer particles reach the target cells. Real LNPs differ in size, lipid mix and cell type; the numbers are "
    + "chosen to give the measured order of magnitude (a few per cent escape), not fitted.";

  function sync() { sK.set(pKa); sE.set(pHend); changed(); }
  function changed() { restart(); drawPlot(); }
  function restart() { sim = new LnpSim(pKa, pHend, seed); loop?.redraw(); }

  function drawPlot() {
    plot.innerHTML = "";
    const ML = 50, MR = 14, x0 = ML, x1 = PW - MR;
    // (a) % against pKa
    {
      const y0 = 44, y1 = 190, k0 = 5, k1 = 9;
      const sx = (k: number) => x0 + (k - k0) / (k1 - k0) * (x1 - x0);
      const pts: { k: number; e: number; c: number }[] = [];
      for (let k = k0; k <= k1 + 1e-9; k += 0.05) { const r = M.lnpFate(k, pHend); pts.push({ k, e: r.escape * 100, c: r.cytosol * 100 }); }
      let ym = 1; for (const p of pts) ym = Math.max(ym, p.e, p.c);
      const ax = niceAxis(ym * 1.1); ym = ax.max;
      const sy = (v: number) => y1 - v / ym * (y1 - y0);
      for (let v = 0; v <= ym + 1e-9; v += ax.step) { const Y = sy(v); svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, class: "grid" }, plot); svgEl("text", { x: x0 - 5, y: Y + 4, "font-size": 12, "text-anchor": "end" }, plot).textContent = String(+v.toPrecision(3)); }
      for (let k = k0; k <= k1; k++) { const X = sx(k); svgEl("line", { x1: X, x2: X, y1: y1, y2: y1 + 4, class: "axis" }, plot); svgEl("text", { x: X, y: y1 + 16, "font-size": 12, "text-anchor": "middle" }, plot).textContent = String(k); }
      svgEl("line", { x1: x0, x2: x1, y1: y1, y2: y1, class: "axis" }, plot);
      svgEl("line", { x1: x0, x2: x0, y1: y0, y2: y1, class: "axis" }, plot);
      svgEl("text", { x: (x0 + x1) / 2, y: y1 + 32, "font-size": 12.5, "text-anchor": "middle" }, plot).textContent = "pKa of the ionisable lipid";
      const yc = (y0 + y1) / 2;
      svgEl("text", { x: 13, y: yc, "font-size": 12.5, "text-anchor": "middle", transform: `rotate(-90 13 ${yc})` }, plot).textContent = "per cent";
      const line = (f: (p: typeof pts[0]) => number) => pts.map((p, i) => (i ? "L" : "M") + sx(p.k).toFixed(1) + "," + sy(f(p)).toFixed(1)).join("");
      svgEl("path", { d: line(p => p.e), fill: "none", stroke: C.ink, "stroke-width": 1.8, "stroke-dasharray": "6 4" }, plot);
      svgEl("path", { d: line(p => p.c), fill: "none", stroke: C.rna, "stroke-width": 2.6 }, plot);
      const X = sx(pKa);
      svgEl("line", { x1: X, x2: X, y1: y0, y2: y1, stroke: C.drug, "stroke-width": 1.5 }, plot);
      const r = M.lnpFate(pKa, pHend);
      svgEl("circle", { cx: X, cy: sy(r.cytosol * 100), r: 5, fill: C.rna, stroke: C.ink }, plot);
      svgEl("circle", { cx: X, cy: sy(r.escape * 100), r: 4, fill: "#fff", stroke: C.ink, "stroke-width": 1.5 }, plot);
      svgEl("line", { x1: x0 + 6, x2: x0 + 30, y1: 12, y2: 12, stroke: C.ink, "stroke-width": 1.8, "stroke-dasharray": "6 4" }, plot);
      svgEl("text", { x: x0 + 34, y: 16, "font-size": 11.5 }, plot).textContent = "escape (% of particles taken up)";
      svgEl("line", { x1: x0 + 6, x2: x0 + 30, y1: 26, y2: 26, stroke: C.rna, "stroke-width": 2.6 }, plot);
      svgEl("text", { x: x0 + 34, y: 30, "font-size": 11.5 }, plot).textContent = "RNA in the cytosol (% of the dose)";
      calc.textContent = `pKa ${pKa.toFixed(1)}, lowest endosome pH ${pHend.toFixed(1)}\n`
        + `charged at pH 7.4 (blood): ${(M.charged(7.4, pKa) * 100).toFixed(0)} % → particles reaching cells: ${(r.reach * 100).toFixed(0)} %\n`
        + `escape from the endosome: ${(r.escape * 100).toFixed(1)} % · to the lysosome: ${(r.lysosome * 100).toFixed(1)} %\n`
        + `RNA in the cytosol: ${(r.cytosol * 100).toFixed(1)} % of the dose`;
    }
    // (b) charged fraction against pH
    {
      const y0 = 280, y1 = 380, p0 = 4.5, p1 = 7.5;
      const sx = (p: number) => x0 + (p - p0) / (p1 - p0) * (x1 - x0);
      const sy = (v: number) => y1 - v * (y1 - y0);
      for (let i = 0; i <= 4; i++) { const v = i / 4, Y = sy(v); svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, class: "grid" }, plot); svgEl("text", { x: x0 - 5, y: Y + 4, "font-size": 12, "text-anchor": "end" }, plot).textContent = String(i * 25); }
      for (let p = 4.5; p <= 7.51; p += 0.5) { const X = sx(p); svgEl("line", { x1: X, x2: X, y1: y1, y2: y1 + 4, class: "axis" }, plot); svgEl("text", { x: X, y: y1 + 16, "font-size": 12, "text-anchor": "middle" }, plot).textContent = p.toFixed(1); }
      svgEl("line", { x1: x0, x2: x1, y1: y1, y2: y1, class: "axis" }, plot);
      svgEl("line", { x1: x0, x2: x0, y1: y0, y2: y1, class: "axis" }, plot);
      svgEl("text", { x: (x0 + x1) / 2, y: y1 + 32, "font-size": 12.5, "text-anchor": "middle" }, plot).textContent = "pH";
      const yc = (y0 + y1) / 2;
      svgEl("text", { x: 13, y: yc, "font-size": 12.5, "text-anchor": "middle", transform: `rotate(-90 13 ${yc})` }, plot).textContent = "% charged";
      svgEl("text", { x: x0, y: y0 - 12, "font-size": 12.5, "font-weight": 600 }, plot).textContent = "Charged ionisable lipid against pH";
      let d = "";
      for (let p = p0; p <= p1 + 1e-9; p += 0.05) d += (d ? "L" : "M") + sx(p).toFixed(1) + "," + sy(M.charged(p, pKa)).toFixed(1);
      svgEl("path", { d, fill: "none", stroke: C.h, "stroke-width": 2.6 }, plot);
      const mark = (p: number, t: string, anchor: string) => {
        const X = sx(p);
        svgEl("line", { x1: X, x2: X, y1: y0, y2: y1, stroke: "#868e96", "stroke-dasharray": "3 3" }, plot);
        svgEl("circle", { cx: X, cy: sy(M.charged(p, pKa)), r: 4.5, fill: C.h, stroke: C.ink }, plot);
        svgEl("text", { x: X + (anchor === "end" ? -4 : 4), y: y0 + 10, "font-size": 11.5, "text-anchor": anchor }, plot).textContent = t;
      };
      mark(7.4, "blood 7.4", "end");
      if (Math.abs(pHend - 7.4) > 0.25) mark(pHend, `endosome ${pHend.toFixed(1)}`, "start");
    }
  }

  function drawView() {
    const { ctx: c, px } = view.begin();
    c.fillStyle = C.cyto; c.fillRect(0, 0, LW, LH);
    label(c, px, "cytosol", 1.5, 4, 12.5, "left", C.ink, true);
    const pH = sim.pH();
    const acid = Math.max(0, Math.min(1, (7.4 - pH) / 2.9));
    circle(c, LENDO.x, LENDO.y, LENDO.r, mix("#f4faf6", "#bfe3cd", acid), C.endo, 0.6);
    const nH = Math.round(3 + 6 * Math.pow(10, 6.5 - pH));
    for (let k = 0; k < Math.min(80, nH); k++) { const [dx, dy] = discPt(k + 3, LENDO.r - 1.5); circle(c, LENDO.x + dx, LENDO.y + dy, 0.35, C.h); }
    for (let k = 0; k < 6; k++) { const a = 0.3 + k * 1.047; circle(c, LENDO.x + LENDO.r * Math.cos(a), LENDO.y + LENDO.r * Math.sin(a), 0.9, C.h); }
    label(c, px, `endosome pH ${pH.toFixed(1)}`, LENDO.x, LENDO.y + LENDO.r + 4, 12.5, "center", C.endo, true);
    circle(c, LLYSO.x, LLYSO.y, LLYSO.r, "#cfe9da", C.endo, 0.6);
    label(c, px, "lysosome", LLYSO.x, LLYSO.y + LLYSO.r + 4, 12.5, "center", C.endo, true);
    const ch = M.charged(pH, pKa);
    for (const q of sim.ps) {
      c.globalAlpha = q.fade;
      const qch = q.where === "endo" || q.where === "out" ? ch : q.where === "lys" ? M.charged(4.8, pKa) : ch;
      if (q.where === "tolys") circle(c, q.x, q.y, 2.1, C.cyto, C.endo, 0.3);
      circle(c, q.x, q.y, 1.3, C.lipid, mix("#8a6a12", C.h, qch), 0.25 + 0.4 * qch);
      if (q.rna) {
        c.strokeStyle = C.rna; c.lineWidth = 0.35; c.beginPath();
        for (let k = 0; k <= 12; k++) { const xx = q.rx + k * 0.35, yy = q.ry + 0.45 * Math.sin(k * 1.2 + q.phase); k ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  function render() {
    drawView();
    const n = sim.counts();
    status.textContent = `time ${fmtTime(sim.t)} · ${speed === 1 ? "real time" : speed + "× faster"}${loop?.paused ? " · paused" : ""}`;
    out.textContent = `escaped: ${n.esc} of ${N_LNP} · in the endosome: ${n.endo} · sent to the lysosome: ${n.lys}`;
  }
  const loop = visibleLoop(root, 1 / 60, () => { if (visible) sim.step(speed / 60); }, render, 1);
  drawPlot();
  return { setVisible(v: boolean) { visible = v; loop.setPaused(!v || bPause.textContent === "Run"); if (v) { drawPlot(); loop.redraw(); } } };
}
