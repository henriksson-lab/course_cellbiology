// BCL-2 balance and venetoclax. Sliders for the BH3-only "stress" signal, BCL-2, MCL-1,
// BAX/BAK and venetoclax. A qualitative threshold model (model.ts): free BAX/BAK above a
// threshold gives all-or-none MOMP → cytochrome c release → caspases → apoptosis.
// Views: the balance in an average cell; free BAX/BAK in each of 150 cells against the
// threshold; the cells themselves over 24 h (cytochrome c out, caspases on, shrinking and
// blebbing, annexin V ring, PI in the nucleus); an annexin V/PI flow plot; the cumulative
// fraction with MOMP. Time runs at 1× real time by default; faster speeds by choice.
// Options (data-*): preset = healthy|cll|cllven|mcl1.
import { autoMount, htmlEl, svgEl, slider, presets, button, Slider } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import * as M from "./model";

const N = 150, COLS = 15;
const INK = "#1b2a3a", MUTED = "#6b7280", DRUG = "#e8590c";
const C = {
  bcl2: "#2a78d6", mcl1: "#1baf7a", bh3: "#d6336c", bax: "#7b3fbf",
  membrane: "#8a6a12", cytosol: "#fbfaf5", nucleus: "#6b4fa0", nucFill: "#efebf7",
  mito: "#a8324a", mitoFill: "#f8e9ec", annexin: "#2b8a3e", pi: "#c2255c",
};
const SPEEDS: { label: string; v: number }[] = [
  { label: "1× (real time)", v: 1 }, { label: "1 min/s", v: 60 }, { label: "10 min/s", v: 600 }, { label: "1 h/s", v: 3600 },
];

const CSS = `
.qb-demo.bc { display: block; }
.bc .bc-row { display: flex; flex-wrap: wrap; gap: 1.2em; align-items: flex-start; }
.bc .bc-view { flex: 1 1 560px; min-width: 0; max-width: 820px; display: flex; flex-direction: column; gap: .6em; }
.bc .bc-panel { flex: 1 1 280px; max-width: 400px; }
.bc .bc-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: .8em; }
.bc .bc-grid2b { display: grid; grid-template-columns: 3fr 2fr; gap: .8em; align-items: start; }
.bc svg { width: 100%; height: auto; }
.bc .bc-title { font-weight: 600; font-size: .95em; margin-bottom: .15em; }
.bc .bc-h { font-weight: 700; margin-top: .3em; }
.bc .bc-time { display: flex; flex-wrap: wrap; gap: .4em; align-items: center; }
.bc .bc-clock { font-size: 1.25em; font-weight: 700; font-variant-numeric: tabular-nums; min-width: 6.5em; }
.bc .bc-time .qb-btn, .bc .qb-presets .qb-btn { min-height: 36px; }
.bc .bc-speed .qb-btn.active { background: ${INK}; border-color: ${INK}; color: #fff; }
.bc .bc-result { font-weight: 600; font-variant-numeric: tabular-nums; }
.bc .bc-group { border-left: 3px solid #ccc; padding-left: .6em; display: flex; flex-direction: column; gap: .35em; }
.bc .bc-drug { border-left-color: ${DRUG}; }
.bc .bc-legend { display: flex; flex-wrap: wrap; gap: .2em 1em; font-size: .85em; }
.bc .bc-legend svg { width: 26px; height: 26px; vertical-align: middle; display: inline-block; }
@media (max-width: 640px) {
  .bc .bc-view, .bc .bc-panel { flex-basis: 100%; max-width: 100%; }
  .bc .bc-grid2, .bc .bc-grid2b { grid-template-columns: 1fr; }
}`;

function injectCSS() {
  if (document.getElementById("bc-style")) return;
  const s = document.createElement("style");
  s.id = "bc-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const pct = (v: number) => Math.round(v * 100) + " %";
const fmtTime = (t: number) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  return `${h} h ${String(m).padStart(2, "0")} min ${String(s).padStart(2, "0")} s`;
};
const fmtH = (t: number) => !isFinite(t) ? "–" : t < 3600 ? Math.round(t / 60) + " min" : (t / 3600).toFixed(1) + " h";
const VEN_L0 = -1, VEN_L1 = 3;   // 0.1 … 1000 × K_d, left end = none
const venFromL = (l: number) => (l <= VEN_L0 + 1e-9 ? 0 : +Math.pow(10, l).toPrecision(2));
const venToL = (v: number) => (v <= 0 ? VEN_L0 : Math.log10(v));
const fmtVen = (l: number) => { const v = venFromL(l); return v === 0 ? "none" : v + "×"; };
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
function mixHex(a: string, b: string, f: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], Math.max(0, Math.min(1, f))))).join(",")})`;
}

interface CellG { body: SVGCircleElement; nuc: SVGCircleElement; ring: SVGCircleElement; blebs: SVGCircleElement[] }

/** Draw one cell glyph into g at (0,0); used in the population and in the legend. */
function cellGlyph(g: SVGGElement): CellG {
  const blebs = [0, 1, 2, 3, 4].map(k => {
    const a = k * 1.256 + 0.4;
    return svgEl("circle", { cx: 13 * Math.cos(a), cy: 13 * Math.sin(a), r: 0, fill: C.cytosol, stroke: C.membrane, "stroke-width": 1.2 }, g);
  });
  const ring = svgEl("circle", { r: 18, fill: "none", stroke: C.annexin, "stroke-width": 3, opacity: 0 }, g);
  const body = svgEl("circle", { r: 16, fill: C.cytosol, stroke: C.membrane, "stroke-width": 1.5 }, g);
  const nuc = svgEl("circle", { r: 7, fill: C.nucFill, stroke: C.nucleus, "stroke-width": 1.5 }, g);
  return { body, nuc, ring, blebs };
}

function drawCell(g: CellG, s: M.CellState): void {
  const shrink = s.casp;
  g.body.setAttribute("r", lerp(16, 11, shrink).toFixed(2));
  g.body.setAttribute("fill", mixHex(C.cytosol, "#efc7cf", s.cytc));
  g.nuc.setAttribute("r", lerp(7, 4.2, shrink).toFixed(2));
  const piF = s.piF;
  g.nuc.setAttribute("fill", piF > 0 ? mixHex("#9c86c4", C.pi, piF) : mixHex(C.nucFill, "#9c86c4", shrink));
  g.ring.setAttribute("r", lerp(18, 13.5, shrink).toFixed(2));
  g.ring.setAttribute("opacity", s.anF.toFixed(2));
  g.blebs.forEach(b => b.setAttribute("r", (3.5 * shrink).toFixed(2)));
}

autoMount("bcl2", host => {
  injectCSS();
  host.classList.add("bc");
  const d = host.dataset;
  const p0 = M.PRESETS.find(x => x.key === d.preset) ?? M.PRESETS[0];
  let P: M.Params = { ...p0.p };
  const cells = M.makeCells(N, 7);
  let t = 0, speed = 1, running = true;

  const row = htmlEl("div", "bc-row", "", host);
  const view = htmlEl("div", "bc-view", "", row);

  // ---------- time bar
  const tb = htmlEl("div", "bc-time", "", view);
  const clock = htmlEl("span", "bc-clock", "", tb);
  const playBtn = button(tb, "Pause", () => { running = !running; if (t >= M.T_END) { t = 0; running = true; } loop.setPaused(!running); syncPlay(); });
  button(tb, "Restart", () => { t = 0; running = true; loop.setPaused(false); syncPlay(); render(); });
  const spRow = htmlEl("span", "bc-time bc-speed", "", tb);
  htmlEl("span", "", "speed:", spRow);
  const spBtns = SPEEDS.map(s => button(spRow, s.label, () => { speed = s.v; spBtns.forEach(b => b.classList.toggle("active", b === bt())); function bt() { return spBtns[SPEEDS.indexOf(s)]; } }));
  spBtns[0].classList.add("active");
  htmlEl("div", "qb-note", "The stress and the drug are added at time 0. At real time (1×) a cell needs about an hour or more to reach MOMP: choose a faster speed to follow a whole day.", view);

  // ---------- population + flow plot
  const g2 = htmlEl("div", "bc-grid2b", "", view);
  const popBox = htmlEl("div", "", "", g2);
  htmlEl("div", "bc-title", `${N} cells in a dish`, popBox);
  const rows = Math.ceil(N / COLS);
  const popSvg = svgEl("svg", { viewBox: `0 0 ${COLS * 40} ${rows * 40}`, role: "img", "aria-label": "Population of cells" }, popBox);
  svgEl("rect", { x: 0, y: 0, width: COLS * 40, height: rows * 40, fill: "#f3f4f6", rx: 6 }, popSvg);
  const glyphs: CellG[] = cells.map((_, i) => {
    const g = svgEl("g", { transform: `translate(${(i % COLS) * 40 + 20} ${Math.floor(i / COLS) * 40 + 20})` }, popSvg);
    return cellGlyph(g);
  });
  const leg = htmlEl("div", "bc-legend", "", popBox);
  const legItems: [string, M.CellState][] = [
    ["healthy", { cytc: 0, casp: 0, annexin: 0, pi: 0, anF: 0, piF: 0, stage: 0 }],
    ["cytochrome c released", { cytc: 1, casp: 0, annexin: 0, pi: 0, anF: 0, piF: 0, stage: 1 }],
    ["caspases on: shrinks, blebs", { cytc: 1, casp: 1, annexin: 0, pi: 0, anF: 0, piF: 0, stage: 2 }],
    ["annexin V binds (PS outside)", { cytc: 1, casp: 1, annexin: 3, pi: 0, anF: 1, piF: 0, stage: 3 }],
    ["PI enters (membrane leaky)", { cytc: 1, casp: 1, annexin: 3, pi: 3, anF: 1, piF: 1, stage: 3 }],
  ];
  for (const [label, s] of legItems) {
    const it = htmlEl("span", "", "", leg);
    const sv = svgEl("svg", { viewBox: "-21 -21 42 42" }, it);
    drawCell(cellGlyph(svgEl("g", {}, sv)), s);
    it.append(" " + label);
  }

  // flow plot: annexin V (x) vs PI (y), log10 0–4
  const flowBox = htmlEl("div", "", "", g2);
  htmlEl("div", "bc-title", "Flow cytometry: annexin V and PI", flowBox);
  const FW = 300, FH = 300, FL = 50, FR = 10, FT = 10, FB = 44;
  const fx = (v: number) => FL + Math.max(0, Math.min(4, v)) / 4 * (FW - FL - FR);
  const fy = (v: number) => FH - FB - Math.max(0, Math.min(4, v)) / 4 * (FH - FT - FB);
  const fsvg = svgEl("svg", { viewBox: `0 0 ${FW} ${FH}`, role: "img", "aria-label": "Annexin V versus PI dot plot" }, flowBox);
  svgEl("rect", { x: FL, y: FT, width: FW - FL - FR, height: FH - FT - FB, fill: "#fff", stroke: INK }, fsvg);
  for (let v = 0; v <= 4; v++) {
    svgEl("line", { x1: fx(v), x2: fx(v), y1: FH - FB, y2: FH - FB + 5, stroke: INK }, fsvg);
    svgEl("line", { x1: FL - 5, x2: FL, y1: fy(v), y2: fy(v), stroke: INK }, fsvg);
    const tx = svgEl("text", { x: fx(v), y: FH - FB + 19, "font-size": 13, "text-anchor": "middle" }, fsvg);
    tx.innerHTML = v === 0 ? "1" : `10<tspan dy="-5" font-size="10">${v}</tspan>`;
    const ty = svgEl("text", { x: FL - 8, y: fy(v) + 4, "font-size": 13, "text-anchor": "end" }, fsvg);
    ty.innerHTML = v === 0 ? "1" : `10<tspan dy="-5" font-size="10">${v}</tspan>`;
  }
  svgEl("text", { x: (FL + FW - FR) / 2, y: FH - 6, "font-size": 14, "text-anchor": "middle" }, fsvg).textContent = "annexin V (green) →";
  const yl = svgEl("text", { x: 14, y: (FT + FH - FB) / 2, "font-size": 14, "text-anchor": "middle", transform: `rotate(-90 14 ${(FT + FH - FB) / 2})` }, fsvg);
  yl.textContent = "PI (red) →";
  svgEl("line", { x1: fx(M.AN_GATE), x2: fx(M.AN_GATE), y1: FT, y2: FH - FB, stroke: MUTED, "stroke-dasharray": "4 3" }, fsvg);
  svgEl("line", { x1: FL, x2: FW - FR, y1: fy(M.PI_GATE), y2: fy(M.PI_GATE), stroke: MUTED, "stroke-dasharray": "4 3" }, fsvg);
  const dots = cells.map(() => svgEl("circle", { r: 3, fill: INK, "fill-opacity": 0.6 }, fsvg));
  const qLab = (x: number, y: number, anchor: string) => {
    const e = svgEl("text", { x, y, "font-size": 13, "font-weight": 700, "text-anchor": anchor }, fsvg);
    return e;
  };
  const qLive = qLab(FL + 6, fy(M.PI_GATE) + 18, "start");
  const qEarly = qLab(FW - FR - 6, fy(M.PI_GATE) + 18, "end");
  const qLate = qLab(FW - FR - 6, FT + 18, "end");
  const qPI = qLab(FL + 6, FT + 18, "start");

  // ---------- threshold strip + cumulative curve
  const g3 = htmlEl("div", "bc-grid2", "", view);
  const stripBox = htmlEl("div", "", "", g3);
  htmlEl("div", "bc-title", "Free BAX/BAK in each cell", stripBox);
  const SW = 360, SH = 150, SL = 26, SR = 14, ST = 26, SB = 40;
  const LX0 = -4, LX1 = 1;   // log10 range 1e-4 … 10
  const sx = (v: number) => SL + (Math.max(LX0, Math.min(LX1, Math.log10(Math.max(v, 1e-9)))) - LX0) / (LX1 - LX0) * (SW - SL - SR);
  const ssvg = svgEl("svg", { viewBox: `0 0 ${SW} ${SH}`, role: "img", "aria-label": "Free BAX/BAK per cell and the threshold" }, stripBox);
  svgEl("rect", { x: sx(M.THRESH), y: ST - 4, width: SW - SR - sx(M.THRESH), height: SH - SB - ST + 8, fill: "#fbe4ea" }, ssvg);
  svgEl("line", { x1: SL, x2: SW - SR, y1: SH - SB + 4, y2: SH - SB + 4, stroke: INK }, ssvg);
  for (let l = LX0; l <= LX1; l++) {
    const x = sx(Math.pow(10, l));
    svgEl("line", { x1: x, x2: x, y1: SH - SB + 4, y2: SH - SB + 9, stroke: INK }, ssvg);
    const e = svgEl("text", { x, y: SH - SB + 23, "font-size": 13, "text-anchor": "middle" }, ssvg);
    e.textContent = ["0.0001", "0.001", "0.01", "0.1", "1", "10"][l - LX0];
  }
  svgEl("text", { x: SW / 2, y: SH - 4, "font-size": 13, "text-anchor": "middle" }, ssvg).textContent = "free BAX/BAK (relative units, log scale)";
  svgEl("line", { x1: sx(M.THRESH), x2: sx(M.THRESH), y1: ST - 6, y2: SH - SB + 4, stroke: DRUG, "stroke-width": 2, "stroke-dasharray": "5 3" }, ssvg);
  const thrT = svgEl("text", { x: sx(M.THRESH) + 5, y: ST - 10, "font-size": 13, fill: DRUG }, ssvg);
  thrT.textContent = "threshold → MOMP";
  thrT.style.fill = DRUG;
  const sdots = cells.map((c, i) => svgEl("circle", { r: 3, cy: ST + 4 + ((i * 37) % 71) / 71 * (SH - SB - ST - 8), "fill-opacity": 0.7 }, ssvg));

  const cumBox = htmlEl("div", "", "", g3);
  htmlEl("div", "bc-title", "Cells that have died, over 24 h", cumBox);
  htmlEl("div", "bc-legend", "", cumBox).innerHTML =
    `<span style="color:${C.mito}">━ MOMP (cytochrome c out)</span><span style="color:${C.annexin}">╍ annexin V+</span>`;
  const CW = 360, CH = 150, CL = 48, CR = 12, CT = 10, CB = 40;
  const cx = (s: number) => CL + s / M.T_END * (CW - CL - CR);
  const cy = (f: number) => CH - CB - f * (CH - CT - CB);
  const csvg = svgEl("svg", { viewBox: `0 0 ${CW} ${CH}`, role: "img", "aria-label": "Cumulative fraction of cells with MOMP over time" }, cumBox);
  svgEl("rect", { x: CL, y: CT, width: CW - CL - CR, height: CH - CT - CB, fill: "#fff", stroke: INK }, csvg);
  for (const h of [0, 6, 12, 18, 24]) {
    svgEl("line", { x1: cx(h * 3600), x2: cx(h * 3600), y1: CH - CB, y2: CH - CB + 5, stroke: INK }, csvg);
    svgEl("text", { x: cx(h * 3600), y: CH - CB + 19, "font-size": 13, "text-anchor": "middle" }, csvg).textContent = String(h);
  }
  for (const f of [0, 0.5, 1]) {
    svgEl("line", { x1: CL - 5, x2: CL, y1: cy(f), y2: cy(f), stroke: INK }, csvg);
    svgEl("text", { x: CL - 8, y: cy(f) + 4, "font-size": 13, "text-anchor": "end" }, csvg).textContent = Math.round(f * 100) + "%";
  }
  svgEl("text", { x: (CL + CW - CR) / 2, y: CH - 4, "font-size": 13, "text-anchor": "middle" }, csvg).textContent = "hours after the stress or drug";
  const curveM = svgEl("path", { fill: "none", stroke: C.mito, "stroke-width": 2.5 }, csvg);
  const curveA = svgEl("path", { fill: "none", stroke: C.annexin, "stroke-width": 2.5, "stroke-dasharray": "6 3" }, csvg);
  const cursor = svgEl("line", { y1: CT, y2: CH - CB, stroke: INK, "stroke-width": 1.5 }, csvg);

  // ---------- balance of the average cell
  const balBox = htmlEl("div", "", "", view);
  htmlEl("div", "bc-title", "The balance in an average cell (no cell-to-cell variation)", balBox);
  const BW = 640, BH = 128, BL = 150, BR = 20, BMAX = 8;
  const bx = (v: number) => BL + Math.min(v, BMAX) / BMAX * (BW - BL - BR);
  const bsvg = svgEl("svg", { viewBox: `0 0 ${BW} ${BH}`, role: "img", "aria-label": "Guardians versus death signals" }, balBox);
  const bLab = (y: number, txt: string) => { const e = svgEl("text", { x: BL - 8, y, "font-size": 14, "text-anchor": "end" }, bsvg); e.textContent = txt; };
  bLab(26, "guardians");
  bLab(64, "pro-death");
  bLab(104, "free BAX/BAK");
  const rBcl = svgEl("rect", { y: 10, height: 24, fill: C.bcl2 }, bsvg);
  const rDrug = svgEl("rect", { y: 10, height: 24, fill: "#fff", stroke: DRUG, "stroke-width": 2, "stroke-dasharray": "4 2" }, bsvg);
  const rMcl = svgEl("rect", { y: 10, height: 24, fill: C.mcl1 }, bsvg);
  const rBh3 = svgEl("rect", { y: 48, height: 24, fill: C.bh3 }, bsvg);
  const rBax = svgEl("rect", { y: 48, height: 24, fill: C.bax }, bsvg);
  const rFree = svgEl("rect", { y: 90, height: 22, fill: C.bax }, bsvg);
  svgEl("line", { x1: bx(M.THRESH), x2: bx(M.THRESH), y1: 84, y2: 118, stroke: DRUG, "stroke-width": 2, "stroke-dasharray": "5 3" }, bsvg);
  const freeT = svgEl("text", { y: 106, "font-size": 14, "font-weight": 700 }, bsvg);
  const tB = [rBcl, rDrug, rMcl, rBh3, rBax].map(() => svgEl("text", { y: 0, "font-size": 13, "text-anchor": "middle", fill: "#fff" }, bsvg));
  const balLeg = htmlEl("div", "bc-legend", "", balBox);
  balLeg.innerHTML = [
    [C.bcl2, "BCL-2"], [DRUG, "BCL-2 blocked by venetoclax"], [C.mcl1, "MCL-1"], [C.bh3, "BH3-only proteins (stress)"], [C.bax, "BAX/BAK"],
  ].map(([c, l]) => `<span><span style="display:inline-block;width:.9em;height:.9em;border-radius:2px;vertical-align:-1px;background:${c === DRUG ? "#fff" : c};${c === DRUG ? `border:2px dashed ${DRUG};box-sizing:border-box;` : ""}"></span> ${l}</span>`).join("");

  const result = htmlEl("div", "qb-readout bc-result", "", view);
  htmlEl("div", "qb-note", "A qualitative threshold model with illustrative numbers, not fitted to data. Each guardian binds one BH3-only protein or one active BAX/BAK; venetoclax blocks only BCL-2. BH3-only proteins that are not held activate BAX/BAK; active BAX/BAK that no guardian captures is 'free'. Left out: the different BH3-only proteins and their preferences, BCL-XL and other guardians, how BAX/BAK assemble into pores, and phagocytes (in a dish nobody eats the dying cells, so they become PI-positive).", view);

  // ---------- controls
  const panel = htmlEl("div", "qb-panel bc-panel", "", row);
  htmlEl("div", "bc-h", "Presets", panel);
  const presetText = htmlEl("div", "qb-note", p0.text, panel);
  const pBtns = presets(panel, M.PRESETS.map(p => ({ label: p.label, apply: () => { P = { ...p.p }; presetText.textContent = p.text; sync(); newExperiment(); } })));
  pBtns[M.PRESETS.indexOf(p0)].classList.add("active");
  panel.insertBefore(presetText, null);
  const gDeath = htmlEl("div", "bc-group", "", panel);
  gDeath.style.borderLeftColor = C.bh3;
  htmlEl("div", "bc-h", "Pro-death", gDeath);
  const sl: Record<string, Slider> = {};
  const changed = () => { pBtns.forEach(b => b.classList.remove("active")); newExperiment(); };
  sl.stress = slider(gDeath, "stress (BH3-only)", 0, 5, 0.1, P.stress, v => { P.stress = v; changed(); });
  sl.baxbak = slider(gDeath, "BAX/BAK", 0, 2, 0.05, P.baxbak, v => { P.baxbak = v; changed(); });
  const gLife = htmlEl("div", "bc-group", "", panel);
  gLife.style.borderLeftColor = C.bcl2;
  htmlEl("div", "bc-h", "Guardians (anti-apoptotic)", gLife);
  sl.bcl2 = slider(gLife, "BCL-2", 0, 6, 0.1, P.bcl2, v => { P.bcl2 = v; changed(); });
  sl.mcl1 = slider(gLife, "MCL-1", 0, 6, 0.1, P.mcl1, v => { P.mcl1 = v; changed(); });
  const gDrug = htmlEl("div", "bc-group bc-drug", "", panel);
  htmlEl("div", "bc-h", "Drug", gDrug);
  sl.ven = slider(gDrug, "venetoclax (× K_d)", VEN_L0, VEN_L1, 0.05, venToL(P.ven), v => { P.ven = venFromL(v); changed(); }, fmtVen);
  htmlEl("div", "qb-note", "Venetoclax dose in multiples of its K_d for BCL-2 (log scale). At 1× K_d half of the BCL-2 is blocked, at 30× about 97 %.", gDrug);
  htmlEl("div", "qb-note", "Amounts are relative: a healthy lymphocyte has about 1 of each. Changing anything starts a new experiment at time 0.", panel);

  function sync() {
    sl.stress.set(P.stress); sl.baxbak.set(P.baxbak); sl.bcl2.set(P.bcl2); sl.mcl1.set(P.mcl1); sl.ven.set(venToL(P.ven));
  }
  function syncPlay() { playBtn.textContent = running && t < M.T_END ? "Pause" : t >= M.T_END ? "Run again" : "Play"; }

  function newExperiment() {
    M.applyParams(cells, P);
    t = 0;
    // threshold strip: static per experiment
    cells.forEach((c, i) => {
      sdots[i].setAttribute("cx", sx(c.free).toFixed(1));
      sdots[i].setAttribute("fill", c.free > M.THRESH ? C.mito : MUTED);
    });
    // cumulative curves
    const path = (key: "tM" | "tA") => {
      const ts = cells.map(c => c[key]).filter(v => v <= M.T_END).sort((a, b) => a - b);
      let dd = `M${cx(0)},${cy(0)}`;
      ts.forEach((v, k) => { dd += ` L${cx(v).toFixed(1)},${cy(k / N).toFixed(1)} L${cx(v).toFixed(1)},${cy((k + 1) / N).toFixed(1)}`; });
      return dd + ` L${cx(M.T_END)},${cy(ts.length / N).toFixed(1)}`;
    };
    curveM.setAttribute("d", path("tM"));
    curveA.setAttribute("d", path("tA"));
    // balance of the average cell
    const b = M.balance(P);
    const blocked = P.bcl2 - b.bcl2Free;
    let x = BL;
    const put = (r: SVGRectElement, w: number, lab: SVGTextElement, txt: string, y: number) => {
      const W = Math.max(0, bx(w) - BL);
      r.setAttribute("x", x.toFixed(1)); r.setAttribute("width", W.toFixed(1));
      lab.setAttribute("x", (x + W / 2).toFixed(1)); lab.setAttribute("y", String(y));
      lab.textContent = W > 70 ? txt : "";
      x += W;
    };
    put(rBcl, b.bcl2Free, tB[0], "BCL-2", 27);
    put(rDrug, blocked, tB[1], "blocked", 27);
    tB[1].style.fill = DRUG;
    put(rMcl, P.mcl1, tB[2], "MCL-1", 27);
    x = BL;
    put(rBh3, P.stress, tB[3], "BH3-only", 65);
    put(rBax, P.baxbak, tB[4], "BAX/BAK", 65);
    rFree.setAttribute("x", String(BL));
    rFree.setAttribute("width", Math.max(0, bx(b.free) - BL).toFixed(1));
    freeT.setAttribute("x", (Math.max(bx(b.free), bx(M.THRESH)) + 8).toFixed(1));
    const above = b.free > M.THRESH;
    freeT.textContent = `${b.free < 0.01 ? b.free.toFixed(3) : b.free.toFixed(2)} → ${above ? "above the threshold: MOMP" : "below the threshold: lives"}`;
    freeT.style.fill = above ? C.mito : INK;
    const s = M.summary(cells);
    result.textContent = `In 24 h: ${pct(s.dead)} of the cells undergo MOMP and die` +
      (s.dead > 0 ? `; the first after ${fmtH(s.first)}, half of them by ${fmtH(s.median)}.` : ".");
    running = true; loop.setPaused(false); syncPlay();
    render();
  }

  function render() {
    clock.textContent = "t = " + fmtTime(t);
    cells.forEach((c, i) => {
      const s = M.cellAt(c, t);
      drawCell(glyphs[i], s);
      dots[i].setAttribute("cx", fx(s.annexin).toFixed(1));
      dots[i].setAttribute("cy", fy(s.pi).toFixed(1));
    });
    const q = M.quadrants(cells, t);
    qLive.textContent = "live " + pct(q.live);
    qEarly.textContent = "early " + pct(q.early);
    qLate.textContent = "late " + pct(q.late);
    qPI.textContent = q.piOnly > 0 ? pct(q.piOnly) : "";
    cursor.setAttribute("x1", cx(t).toFixed(1)); cursor.setAttribute("x2", cx(t).toFixed(1));
  }

  const loop = visibleLoop(host, 1 / 30, () => {
    if (!running) return;
    t = Math.min(M.T_END, t + speed / 30);
    if (t >= M.T_END) { running = false; syncPlay(); }
  }, render);

  newExperiment();
});
