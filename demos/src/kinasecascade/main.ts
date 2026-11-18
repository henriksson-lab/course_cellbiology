// Kinase cascade and drug targets. Growth factor → RTK → Ras → RAF → MEK → ERK as a small
// ODE model (model.ts). Three views of the same model: a cascade diagram coloured by activity
// at a chosen time, the time course after adding growth factor, and the steady-state
// dose–response of every level (switch-like ERK). Controls: growth-factor dose, inhibitors at
// RTK, RAF and MEK (dose in multiples of IC50), added before or 30 min after the growth
// factor; negative feedback on/off; oncogenic mutation (Ras G12V, BRAF V600E).
// No animation: the curves are computed at once; the student moves the time cursor.
// Options (data-*): preset = normal|nofb|meki|mekifb|ras|braf|brafcrc.
import { autoMount, htmlEl, svgEl, slider, checkbox, presets, button, svgPoint } from "../lib/ui";
import * as M from "./model";

type Key = "R" | "Ras" | "RAF" | "MEK" | "ERK";
const KEYS: Key[] = ["R", "Ras", "RAF", "MEK", "ERK"];
const NAME: Record<Key, string> = { R: "RTK", Ras: "Ras", RAF: "RAF", MEK: "MEK", ERK: "ERK" };
const LONG: Record<Key, string> = {
  R: "receptor (phosphorylated)", Ras: "Ras-GTP", RAF: "RAF (active)", MEK: "MEK (doubly phosphorylated)", ERK: "ERK (doubly phosphorylated)",
};
// categorical colours, checked for colour-vision deficiency; receptor in membrane brown
const COL: Record<Key, string> = { R: "#8a6a12", Ras: "#1baf7a", RAF: "#2a78d6", MEK: "#e87ba4", ERK: "#7b3fbf" };
const DRUG = "#e8590c", INK = "#1b2a3a", MUTED = "#6b7280";
const T_END = 90;

const CSS = `
.qb-demo.kc { display: block; }
.kc .kc-row { display: flex; flex-wrap: wrap; gap: 1.2em; align-items: flex-start; }
.kc .kc-diagram { flex: 0 1 330px; min-width: 0; }
.kc .kc-plots { flex: 1 1 420px; min-width: 0; max-width: 620px; display: flex; flex-direction: column; gap: .4em; }
.kc .kc-panel { flex: 1 1 300px; max-width: 460px; }
.kc svg { width: 100%; height: auto; }
.kc .kc-title { font-weight: 600; font-size: .95em; }
.kc .kc-h { font-weight: 700; margin-top: .3em; }
.kc .kc-group { border-left: 3px solid ${DRUG}; padding-left: .6em; display: flex; flex-direction: column; gap: .35em; }
.kc .kc-group.kc-gf { border-left-color: ${COL.R}; }
.kc .kc-group.kc-mut { border-left-color: #c92a2a; }
.kc .qb-presets .qb-btn { min-height: 36px; }
.kc .kc-mutrow { display: flex; flex-wrap: wrap; gap: .35em; }
.kc .kc-mutrow .qb-btn { min-height: 36px; }
.kc .kc-mutrow .qb-btn.active { background: #c92a2a; border-color: #c92a2a; }
.kc .kc-table { border-collapse: collapse; width: 100%; font-size: .9em; font-variant-numeric: tabular-nums; }
.kc .kc-table th, .kc .kc-table td { padding: .15em .4em; text-align: right; border-bottom: 1px solid #e3e3e3; white-space: nowrap; }
.kc .kc-table th:first-child, .kc .kc-table td:first-child { text-align: left; }
.kc .kc-sw { display: inline-block; width: .8em; height: .8em; border-radius: 2px; margin-right: .35em; vertical-align: -1px; }
.kc .kc-twrap { overflow-x: auto; }
.kc .kc-summary { font-weight: 600; font-variant-numeric: tabular-nums; }
.kc .kc-plot { touch-action: pan-y; cursor: crosshair; }
.reveal .kc .kc-table { font-size: .75em; }
@media (max-width: 640px) {
  .kc .kc-diagram, .kc .kc-plots, .kc .kc-panel { flex-basis: 100%; max-width: 100%; }
  .kc .kc-diagram { max-width: 280px; margin: 0 auto; }
  .kc .kc-table { font-size: .8em; }
  .kc .kc-table th:nth-child(4), .kc .kc-table td:nth-child(4) { display: none; }
}`;

function injectCSS() {
  if (document.getElementById("kc-style")) return;
  const s = document.createElement("style");
  s.id = "kc-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const pct = (v: number) => Math.round(v * 100) + " %";
const fmtGF = (v: number) => v <= 0 ? "none" : v >= 1 ? +v.toPrecision(2) + " ng/mL" : +v.toPrecision(1) + " ng/mL";
const fmtDose = (v: number) => v <= 0 ? "none" : (v >= 1 ? +v.toPrecision(2) : +v.toPrecision(1)) + "× IC₅₀";
const fmtN = (n: number) => {
  const r = n >= 1000 ? +n.toPrecision(3) : Math.round(n);   // three significant digits
  return String(r).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};
function mix(hex: string, f: number): string {   // white → colour
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.round(255 + (v - 255) * Math.max(0, Math.min(1, f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// log sliders with an "off" position at the left end
const GF_L0 = -3, GF_L1 = 2;          // 0.001 … 100 ng/mL
const DR_L0 = -1, DR_L1 = 2;          // 0.1 … 100 × IC50
const offL = (l: number, l0: number) => (l <= l0 + 1e-9 ? 0 : Math.pow(10, l));
const toL = (v: number, l0: number) => (v <= 0 ? l0 : Math.log10(v));

interface Preset { key: string; label: string; p: Partial<M.Params>; text: string }
const PRESETS: Preset[] = [
  { key: "normal", label: "Normal cell + growth factor", p: {},
    text: "A normal cell gets growth factor (1 ng/mL, about the K_d) at time 0. ERK activity peaks within minutes, then the negative feedback brings it down to a lower plateau." },
  { key: "nofb", label: "Feedback off", p: { feedback: false },
    text: "The same cell without the ERK → upstream negative feedback: no peak, ERK stays high." },
  { key: "meki", label: "MEK inhibitor at 30 min, no feedback", p: { feedback: false, iMEK: 1, tDrug: 30 },
    text: "A MEK inhibitor at its IC₅₀ is added 30 min after the growth factor, in a cell without feedback. ERK drops and stays down." },
  { key: "mekifb", label: "MEK inhibitor at 30 min, with feedback", p: { iMEK: 1, tDrug: 30 },
    text: "The same drug in a cell with feedback. ERK drops, then partly comes back: with less ERK, the brake on Ras and RAF is released." },
  { key: "ras", label: "Ras G12V (stuck on)", p: { mut: "ras", gf: 0 },
    text: "Ras G12V cannot be switched off by its GAP. ERK is on without any growth factor. Which inhibitor still works?" },
  { key: "braf", label: "BRAF V600E melanoma", p: { mut: "braf", gf: 0 },
    text: "BRAF V600E is active without Ras. Melanoma cells grow with little growth factor. Try the RAF inhibitor (vemurafenib-like) and the MEK inhibitor." },
  { key: "brafcrc", label: "BRAF V600E + vemurafenib, with EGF", p: { mut: "braf", gf: 1, iRAF: 10 },
    text: "The same mutation in a cell that also gets growth factor through its receptor (as in BRAF V600E colon cancer, which has much EGFR signalling). The RAF inhibitor releases the feedback and the receptor reactivates ERK. Add an RTK inhibitor." },
];

autoMount("kinasecascade", host => {
  injectCSS();
  host.classList.add("kc");
  const d = host.dataset;
  const p0 = PRESETS.find(x => x.key === d.preset) ?? PRESETS[0];
  let P: M.Params = { ...M.DEFAULT, ...p0.p };
  let tCur = 8;

  const row = htmlEl("div", "kc-row", "", host);

  // ================= cascade diagram
  const dWrap = htmlEl("div", "kc-diagram", "", row);
  const dTitle = htmlEl("div", "kc-title", "", dWrap);
  const DW = 330, DH = 560, CX = 150, BW = 128, BH = 46;
  const dsvg = svgEl("svg", { viewBox: `0 0 ${DW} ${DH}`, role: "img", "aria-label": "Cascade diagram coloured by activity" }, dWrap);
  const defs = svgEl("defs", {}, dsvg);
  const mk = svgEl("marker", { id: "kc-arr", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
  svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: INK }, mk);
  const mkr = svgEl("marker", { id: "kc-tbar", viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 9, markerHeight: 9, orient: "auto" }, defs);
  svgEl("path", { d: "M5,0 L5,10", stroke: "#c92a2a", "stroke-width": 3 }, mkr);
  // outside / membrane / cytosol / nucleus
  svgEl("rect", { x: 0, y: 0, width: DW, height: 72, fill: "#eef4fa" }, dsvg);
  svgEl("rect", { x: 0, y: 72, width: DW, height: 22, fill: "#f6f0de", stroke: "#8a6a12", "stroke-width": 1.5 }, dsvg);
  svgEl("rect", { x: 0, y: 94, width: DW, height: DH - 94, fill: "#fbfaf5" }, dsvg);
  const tOut = svgEl("text", { x: DW - 8, y: 20, "font-size": 16, "text-anchor": "end", fill: MUTED }, dsvg); tOut.textContent = "outside";
  const tIn = svgEl("text", { x: DW - 8, y: 114, "font-size": 16, "text-anchor": "end", fill: MUTED }, dsvg); tIn.textContent = "cytosol";
  const nuc = svgEl("rect", { x: 30, y: 478, width: 240, height: 74, rx: 30, fill: "#efebf7", stroke: "#6b4fa0", "stroke-width": 2 }, dsvg);
  const nucT = svgEl("text", { x: CX, y: 508, "font-size": 15, "text-anchor": "middle" }, dsvg); nucT.textContent = "nucleus: genes for";
  const nucT2 = svgEl("text", { x: CX, y: 528, "font-size": 15, "text-anchor": "middle", "font-weight": 700 }, dsvg); nucT2.textContent = "cell division";
  // growth-factor dots (count follows occupancy)
  const gfG = svgEl("g", {}, dsvg);
  const gfLab = svgEl("text", { x: 10, y: 20, "font-size": 16, fill: INK }, dsvg); gfLab.textContent = "growth factor";
  // node positions
  const Y: Record<Key, number> = { R: 83, Ras: 172, RAF: 248, MEK: 324, ERK: 400 };
  // receptor: two halves spanning the membrane
  const recG = svgEl("g", {}, dsvg);
  const recL = svgEl("rect", { x: CX - 32, y: 40, width: 28, height: 84, rx: 8, stroke: INK, "stroke-width": 1.5 }, recG);
  const recR = svgEl("rect", { x: CX + 4, y: 40, width: 28, height: 84, rx: 8, stroke: INK, "stroke-width": 1.5 }, recG);
  const recT = svgEl("text", { x: CX - 40, y: 120, "font-size": 15, "text-anchor": "end", "font-weight": 700 }, recG); recT.textContent = "RTK";
  const recV = svgEl("text", { x: CX + 40, y: 120, "font-size": 15, "text-anchor": "start" }, recG);
  const boxes: Partial<Record<Key, { r: SVGRectElement; t: SVGTextElement }>> = {};
  for (const k of ["Ras", "RAF", "MEK", "ERK"] as Key[]) {
    const r = svgEl("rect", { x: CX - BW / 2, y: Y[k] - BH / 2, width: BW, height: BH, rx: 10, stroke: COL[k], "stroke-width": 2.5 }, dsvg);
    const t = svgEl("text", { x: CX, y: Y[k] + 6, "font-size": 17, "text-anchor": "middle", "font-weight": 700 }, dsvg);
    boxes[k] = { r, t };
  }
  // arrows down the cascade
  const arrow = (y1: number, y2: number) => svgEl("line", { x1: CX, x2: CX, y1, y2, stroke: INK, "stroke-width": 2, "marker-end": "url(#kc-arr)" }, dsvg);
  arrow(126, Y.Ras - BH / 2 - 2);
  arrow(Y.Ras + BH / 2, Y.RAF - BH / 2 - 2);
  arrow(Y.RAF + BH / 2, Y.MEK - BH / 2 - 2);
  arrow(Y.MEK + BH / 2, Y.ERK - BH / 2 - 2);
  arrow(Y.ERK + BH / 2, 476);
  const via = svgEl("text", { x: CX - 8, y: 145, "font-size": 14, "text-anchor": "end", fill: MUTED }, dsvg); via.textContent = "Grb2–SOS";
  // negative feedback, ERK → Ras and RAF
  const fbG = svgEl("g", {}, dsvg);
  const fbPath = svgEl("path", { d: `M${CX + BW / 2},${Y.ERK} H${CX + BW / 2 + 52} V${Y.Ras} H${CX + BW / 2 + 6}`, fill: "none", stroke: "#c92a2a", "stroke-width": 2.5, "stroke-dasharray": "7 4", "marker-end": "url(#kc-tbar)" }, fbG);
  svgEl("path", { d: `M${CX + BW / 2 + 52},${Y.RAF} H${CX + BW / 2 + 6}`, fill: "none", stroke: "#c92a2a", "stroke-width": 2.5, "stroke-dasharray": "7 4", "marker-end": "url(#kc-tbar)" }, fbG);
  const fbX = CX + BW / 2 + 66, fbY = (Y.RAF + Y.ERK) / 2;
  const fbT = svgEl("text", { x: fbX, y: fbY, "font-size": 16, fill: "#c92a2a", "font-weight": 700, "text-anchor": "middle", transform: `rotate(90 ${fbX} ${fbY})` }, fbG);
  fbT.textContent = "feedback";
  void fbPath;
  // drugs: orange pills to the left of their targets
  const drugMark = (y: number, label: string) => {
    const g = svgEl("g", {}, dsvg);
    svgEl("line", { x1: 44, x2: CX - BW / 2 - 4, y1: y, y2: y, stroke: DRUG, "stroke-width": 3 }, g);
    svgEl("line", { x1: CX - BW / 2 - 4, x2: CX - BW / 2 - 4, y1: y - 9, y2: y + 9, stroke: DRUG, "stroke-width": 3 }, g);
    svgEl("rect", { x: 2, y: y - 14, width: 50, height: 28, rx: 14, fill: DRUG }, g);
    const t = svgEl("text", { x: 27, y: y + 5, "font-size": 15, "text-anchor": "middle", "font-weight": 700 }, g);
    t.style.fill = "#fff"; t.textContent = label;
    return g;
  };
  const dRTK = drugMark(Y.R + 40, "RTKi");
  const dRAF = drugMark(Y.RAF, "RAFi");
  const dMEK = drugMark(Y.MEK, "MEKi");
  // mutation badges
  const badge = (y: number, label: string) => {
    const g = svgEl("g", {}, dsvg);
    svgEl("rect", { x: CX - 38, y: y - BH / 2 - 16, width: 76, height: 22, rx: 11, fill: "#c92a2a" }, g);
    const t = svgEl("text", { x: CX, y: y - BH / 2 + 0, "font-size": 15, "text-anchor": "middle", "font-weight": 700 }, g);
    t.style.fill = "#fff"; t.textContent = label;
    return g;
  };
  const bRas = badge(Y.Ras, "G12V");
  const bRaf = badge(Y.RAF, "V600E");

  // ================= plots
  const plots = htmlEl("div", "kc-plots", "", row);
  htmlEl("div", "kc-title", "Activity over time after adding growth factor (tap or drag to move the time cursor)", plots);
  const PW = 600, PH = 300, ML = 58, MR = 70, MT = 12, MB = 48;
  const IW = PW - ML - MR, IH = PH - MT - MB;
  const tsvg = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "kc-plot", role: "img", "aria-label": "Time course of each level" }, plots);
  const tx = (t: number) => ML + t / T_END * IW, ty = (v: number) => MT + IH - v * IH;
  for (let t = 0; t <= T_END; t += 15) {
    svgEl("line", { x1: tx(t), x2: tx(t), y1: MT, y2: MT + IH, class: "grid" }, tsvg);
    const tt = svgEl("text", { x: tx(t), y: MT + IH + 20, "font-size": 16, "text-anchor": "middle" }, tsvg); tt.textContent = String(t);
  }
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svgEl("line", { x1: ML, x2: ML + IW, y1: ty(v), y2: ty(v), class: "grid" }, tsvg);
    const tt = svgEl("text", { x: ML - 6, y: ty(v) + 5, "font-size": 16, "text-anchor": "end" }, tsvg); tt.textContent = Math.round(v * 100) + "%";
  }
  svgEl("line", { x1: ML, x2: ML + IW, y1: MT + IH, y2: MT + IH, class: "axis" }, tsvg);
  const txl = svgEl("text", { x: ML + IW / 2, y: PH - 6, "font-size": 16, "text-anchor": "middle" }, tsvg);
  txl.textContent = "minutes after growth factor";
  const ytl = svgEl("text", { x: 14, y: MT + IH / 2, "font-size": 16, "text-anchor": "middle", transform: `rotate(-90 14 ${MT + IH / 2})` }, tsvg);
  ytl.textContent = "% of each protein active";
  const drugLine = svgEl("line", { y1: MT, y2: MT + IH, stroke: DRUG, "stroke-width": 2, "stroke-dasharray": "4 3" }, tsvg);
  const drugLab = svgEl("text", { y: MT + 14, "font-size": 15, "font-weight": 700 }, tsvg); drugLab.style.fill = DRUG; drugLab.textContent = "drug";
  const ghost = svgEl("path", { fill: "none", stroke: COL.ERK, "stroke-width": 2, "stroke-dasharray": "2 4", opacity: 0.8 }, tsvg);
  const tLines: Record<Key, SVGPathElement> = {} as never;
  const tLabs: Record<Key, SVGTextElement> = {} as never;
  for (const k of KEYS) {
    tLines[k] = svgEl("path", { fill: "none", stroke: COL[k], "stroke-width": k === "ERK" ? 3.5 : 2.2, "stroke-linejoin": "round" }, tsvg);
    tLabs[k] = svgEl("text", { x: ML + IW + 6, "font-size": 16, "font-weight": 700 }, tsvg);
    tLabs[k].textContent = NAME[k];
  }
  const cursor = svgEl("line", { y1: MT, y2: MT + IH, stroke: INK, "stroke-width": 1.5 }, tsvg);
  const cursorLab = svgEl("text", { y: MT + IH - 6, "font-size": 15 }, tsvg);
  const setCursorFromEvent = (ev: PointerEvent) => {
    const [x] = svgPoint(tsvg, ev);
    tCur = Math.max(0, Math.min(T_END, Math.round((x - ML) / IW * T_END * 2) / 2));
    sT.set(tCur); drawCursor();
  };
  tsvg.addEventListener("pointerdown", ev => {
    setCursorFromEvent(ev);
    const move = (e: PointerEvent) => setCursorFromEvent(e);
    const up = () => { tsvg.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    tsvg.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  const legend = htmlEl("div", "qb-note", "", plots);
  legend.innerHTML = KEYS.map(k => `<span class="kc-sw" style="background:${COL[k]}"></span>${LONG[k]}`).join(" · ")
    + ` · <span style="color:${COL.ERK}">┈</span> ERK without the drugs`;
  const sT = slider(plots, "time cursor", 0, T_END, 0.5, tCur, v => { tCur = v; drawCursor(); }, v => v + " min");

  // ---- table at the cursor
  const tw = htmlEl("div", "kc-twrap", "", plots);
  const table = htmlEl("table", "kc-table", "", tw);
  table.innerHTML = "<thead><tr><th>level</th><th>active</th><th>active molecules per cell</th><th>total</th></tr></thead>";
  const tb = htmlEl("tbody", "", "", table);
  const cells: Record<Key, HTMLTableCellElement[]> = {} as never;
  for (const k of KEYS) {
    const tr = htmlEl("tr", "", "", tb);
    const c = Array.from({ length: 4 }, () => htmlEl("td", "", "", tr));
    c[0].innerHTML = `<span class="kc-sw" style="background:${COL[k]}"></span>${NAME[k]}`;
    c[3].textContent = fmtN(M.TOTALS[k]);
    cells[k] = c;
  }
  const summary = htmlEl("div", "qb-readout kc-summary", "", plots);

  // ---- dose–response
  htmlEl("div", "kc-title", "Steady state (after 5 h) at every growth-factor dose", plots);
  const dsv = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, role: "img", "aria-label": "Dose–response of each level" }, plots);
  const L0 = Math.log10(M.GF_MIN), L1 = Math.log10(M.GF_MAX);
  const dx = (gf: number) => ML + (Math.log10(gf) - L0) / (L1 - L0) * IW;
  for (let l = L0; l <= L1; l++) {
    svgEl("line", { x1: dx(10 ** l), x2: dx(10 ** l), y1: MT, y2: MT + IH, class: "grid" }, dsv);
    const tt = svgEl("text", { x: dx(10 ** l), y: MT + IH + 20, "font-size": 16, "text-anchor": "middle" }, dsv);
    tt.textContent = String(+(10 ** l).toPrecision(1));
  }
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svgEl("line", { x1: ML, x2: ML + IW, y1: ty(v), y2: ty(v), class: "grid" }, dsv);
    const tt = svgEl("text", { x: ML - 6, y: ty(v) + 5, "font-size": 16, "text-anchor": "end" }, dsv); tt.textContent = Math.round(v * 100) + "%";
  }
  svgEl("line", { x1: ML, x2: ML + IW, y1: MT + IH, y2: MT + IH, class: "axis" }, dsv);
  const dxl = svgEl("text", { x: ML + IW / 2, y: PH - 6, "font-size": 16, "text-anchor": "middle" }, dsv);
  dxl.textContent = "growth factor (ng/mL, log scale)";
  const dyl = svgEl("text", { x: 14, y: MT + IH / 2, "font-size": 16, "text-anchor": "middle", transform: `rotate(-90 14 ${MT + IH / 2})` }, dsv);
  dyl.textContent = "% active at steady state";
  const doseMark = svgEl("line", { y1: MT, y2: MT + IH, stroke: INK, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, dsv);
  const dLines: Record<Key, SVGPathElement> = {} as never;
  const dLabs: Record<Key, SVGTextElement> = {} as never;
  for (const k of KEYS) {
    dLines[k] = svgEl("path", { fill: "none", stroke: COL[k], "stroke-width": k === "ERK" ? 3.5 : 2.2 }, dsv);
    dLabs[k] = svgEl("text", { x: ML + IW + 6, "font-size": 16, "font-weight": 700 }, dsv);
    dLabs[k].textContent = NAME[k];
  }
  const drStats = htmlEl("div", "qb-readout", "", plots);

  // ================= controls
  const panel = htmlEl("div", "qb-panel kc-panel", "", row);
  htmlEl("div", "kc-h", "Presets", panel);
  const presetText = htmlEl("div", "qb-note", "", panel);
  const pBtns = presets(panel, PRESETS.map(pr => ({ label: pr.label, apply: () => { P = { ...M.DEFAULT, ...pr.p }; presetText.textContent = pr.text; sync(); recompute(true); } })));
  // move the note below the buttons
  panel.appendChild(presetText);

  const gGF = htmlEl("div", "kc-group kc-gf", "", panel);
  htmlEl("div", "kc-h", "Growth factor", gGF);
  const sGF = slider(gGF, "dose", GF_L0, GF_L1, 0.05, toL(P.gf, GF_L0), l => { P.gf = offL(l, GF_L0); recompute(false); }, l => fmtGF(offL(l, GF_L0)));
  htmlEl("div", "qb-note", `Receptor K_d = ${M.KD} ng/mL: at this dose half of the receptors are bound.`, gGF);

  const gD = htmlEl("div", "kc-group", "", panel);
  htmlEl("div", "kc-h", "Inhibitors (dose in multiples of IC₅₀)", gD);
  const sRTK = slider(gD, "RTK (erlotinib-like)", DR_L0, DR_L1, 0.05, toL(P.iRTK, DR_L0), l => { P.iRTK = offL(l, DR_L0); recompute(true); }, l => fmtDose(offL(l, DR_L0)));
  const sRAF = slider(gD, "RAF (vemurafenib-like)", DR_L0, DR_L1, 0.05, toL(P.iRAF, DR_L0), l => { P.iRAF = offL(l, DR_L0); recompute(true); }, l => fmtDose(offL(l, DR_L0)));
  const sMEK = slider(gD, "MEK (trametinib-like)", DR_L0, DR_L1, 0.05, toL(P.iMEK, DR_L0), l => { P.iMEK = offL(l, DR_L0); recompute(true); }, l => fmtDose(offL(l, DR_L0)));
  const cLate = checkbox(gD, "add the drugs 30 min after the growth factor (otherwise before)", P.tDrug > 0, v => { P.tDrug = v ? 30 : 0; recompute(false); });
  button(gD, "Remove all drugs", () => { P.iRTK = P.iRAF = P.iMEK = 0; sync(); recompute(true); });

  const gF = htmlEl("div", "kc-group kc-mut", "", panel);
  htmlEl("div", "kc-h", "Feedback and mutations", gF);
  const cFb = checkbox(gF, "negative feedback: active ERK slowly inhibits Ras activation (SOS) and RAF", P.feedback, v => { P.feedback = v; recompute(true); });
  const mutRow = htmlEl("div", "kc-mutrow", "", gF);
  const mutBtns: Record<M.Mut, HTMLButtonElement> = {
    none: button(mutRow, "no mutation", () => setMut("none")),
    ras: button(mutRow, "Ras G12V", () => setMut("ras")),
    braf: button(mutRow, "BRAF V600E", () => setMut("braf")),
  };
  function setMut(m: M.Mut) { P.mut = m; pBtns.forEach(b => b.classList.remove("active")); sync(); recompute(true); }
  htmlEl("div", "qb-note", "Qualitative model with illustrative numbers: one pathway out of a network (no PI3K branch, no scaffolds); see the text above the demo.", panel);

  function sync() {
    sGF.set(toL(P.gf, GF_L0)); sRTK.set(toL(P.iRTK, DR_L0)); sRAF.set(toL(P.iRAF, DR_L0)); sMEK.set(toL(P.iMEK, DR_L0));
    cLate.checked = P.tDrug > 0; cFb.checked = P.feedback;
    (Object.keys(mutBtns) as M.Mut[]).forEach(m => mutBtns[m].classList.toggle("active", m === P.mut));
  }

  // ================= computing and drawing
  let tc: { t: number; L: M.Levels }[] = [];
  let tcGhost: { t: number; L: M.Levels }[] | null = null;
  let dr: { gf: number; L: M.Levels }[] = [];
  let drKey = "";
  let ssNow: M.Levels, ssNoDrug: M.Levels;
  let pending = 0, needDR = false;

  function recompute(doseResponseToo: boolean) {
    needDR = needDR || doseResponseToo;
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const anyDrug = P.iRTK > 0 || P.iRAF > 0 || P.iMEK > 0;
      tc = M.timeCourse(P, T_END, 0.5);
      tcGhost = anyDrug ? M.timeCourse({ ...P, iRTK: 0, iRAF: 0, iMEK: 0 }, T_END, 0.5) : null;
      ssNow = M.steady(P);
      ssNoDrug = anyDrug ? M.steady({ ...P, iRTK: 0, iRAF: 0, iMEK: 0 }) : ssNow;
      const key = JSON.stringify({ ...P, gf: 0, tDrug: 0 });
      if (needDR || key !== drKey) { dr = M.doseResponse(P, 36); drKey = key; needDR = false; }
      draw();
    });
  }

  const pathOf = (pts: [number, number][]) => pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1)).join("");
  function placeLabels(labs: Record<Key, SVGTextElement>, ends: Record<Key, number>) {
    const order = [...KEYS].sort((a, b) => ends[a] - ends[b]);   // top to bottom on screen (small y first)
    let last = -1e9;
    for (const k of order) {
      let y = Math.max(ends[k] + 5, last + 16);
      labs[k].setAttribute("y", String(y));
      last = y;
    }
    // if pushed below the plot, shift all up
    const over = last - (MT + IH + 4);
    if (over > 0) for (const k of order) labs[k].setAttribute("y", String(Number(labs[k].getAttribute("y")) - over));
  }

  function draw() {
    // time course
    const ends = {} as Record<Key, number>;
    for (const k of KEYS) {
      tLines[k].setAttribute("d", pathOf(tc.map(s => [tx(s.t), ty(s.L[k])])));
      ends[k] = ty(tc[tc.length - 1].L[k]);
    }
    placeLabels(tLabs, ends);
    if (tcGhost) {
      ghost.setAttribute("d", pathOf(tcGhost.map(s => [tx(s.t), ty(s.L.ERK)])));
      ghost.style.display = "";
    } else ghost.style.display = "none";
    const anyDrug = P.iRTK > 0 || P.iRAF > 0 || P.iMEK > 0;
    const showDrugLine = anyDrug && P.tDrug > 0;
    drugLine.style.display = drugLab.style.display = showDrugLine ? "" : "none";
    if (showDrugLine) { drugLine.setAttribute("x1", String(tx(P.tDrug))); drugLine.setAttribute("x2", String(tx(P.tDrug))); setAttrsXY(drugLab, tx(P.tDrug) + 4, MT + 14); }

    // dose–response
    const dEnds = {} as Record<Key, number>;
    for (const k of KEYS) {
      dLines[k].setAttribute("d", pathOf(dr.map(s => [dx(s.gf), ty(s.L[k])])));
      dEnds[k] = ty(dr[dr.length - 1].L[k]);
    }
    placeLabels(dLabs, dEnds);
    const gfShown = Math.max(M.GF_MIN, Math.min(M.GF_MAX, P.gf));
    doseMark.style.display = P.gf > 0 ? "" : "none";
    doseMark.setAttribute("x1", String(dx(gfShown))); doseMark.setAttribute("x2", String(dx(gfShown)));
    const cR = M.curveStats(dr, "R"), cE = M.curveStats(dr, "ERK");
    const lines: string[] = [];
    const ecTxt = (c: { ec50: number; nH: number; lo: number; hi: number }) =>
      Number.isFinite(c.ec50) ? `half-maximal at ${+c.ec50.toPrecision(2)} ng/mL, steepness n_H ≈ ${c.nH.toFixed(1)}` : `does not respond to the growth factor (stays at ${pct(c.lo)}–${pct(c.hi)})`;
    lines.push(`Receptor: ${ecTxt(cR)}`);
    lines.push(`ERK:      ${ecTxt(cE)}`);
    if (Number.isFinite(cR.ec50) && Number.isFinite(cE.ec50)) {
      const r = cR.ec50 / cE.ec50;
      lines.push(r >= 1.2 ? `ERK needs ${r.toFixed(r >= 10 ? 0 : 1)}× less growth factor than the receptor for a half response.`
        : `ERK is not more sensitive than the receptor here.`);
    }
    lines.push(`n_H = log(81) / log(EC90/EC10): 1 = graded like a single binding step; > 2 = switch-like.`);
    drStats.textContent = lines.join("\n");

    // summary at steady state
    const sumLines = [`ERK at steady state (after 5 h): ${pct(ssNow.ERK)}`];
    if (anyDrug) {
      const left = ssNoDrug.ERK > 0.005 ? ssNow.ERK / ssNoDrug.ERK : 1;
      sumLines[0] += `   without the drugs: ${pct(ssNoDrug.ERK)}`;
      sumLines.push(left > 1.02 ? `The drugs RAISE ERK activity, by ${Math.round((left - 1) * 100)} %.`
        : `The drugs remove ${Math.round((1 - left) * 100)} % of ERK activity (${Math.round(left * 100)} % is left).`);
    }
    summary.textContent = sumLines.join("\n");

    // diagram drug and mutation marks
    dRTK.style.display = P.iRTK > 0 ? "" : "none";
    dRAF.style.display = P.iRAF > 0 ? "" : "none";
    dMEK.style.display = P.iMEK > 0 ? "" : "none";
    bRas.style.display = P.mut === "ras" ? "" : "none";
    bRaf.style.display = P.mut === "braf" ? "" : "none";
    fbG.style.opacity = P.feedback ? "1" : "0.15";
    // growth-factor dots: number grows with dose (log)
    gfG.innerHTML = "";
    const nDots = P.gf <= 0 ? 0 : Math.max(1, Math.round(2 + 2.2 * (Math.log10(P.gf) - GF_L0)));
    for (let i = 0; i < nDots; i++) {
      const x = 18 + ((i * 53) % (DW - 120)), y = 34 + ((i * 17) % 26);
      svgEl("circle", { cx: x, cy: y, r: 6, fill: COL.R, opacity: 0.8 }, gfG);
    }
    drawCursor();
  }

  function setAttrsXY(e: SVGElement, x: number, y: number) { e.setAttribute("x", String(x)); e.setAttribute("y", String(y)); }

  function levelsAt(t: number): M.Levels {
    const i = Math.max(0, Math.min(tc.length - 1, Math.round(t / 0.5)));
    return tc[i].L;
  }

  function drawCursor() {
    if (!tc.length) return;
    const L = levelsAt(tCur);
    cursor.setAttribute("x1", String(tx(tCur))); cursor.setAttribute("x2", String(tx(tCur)));
    const right = tCur > T_END * 0.75;
    setAttrsXY(cursorLab, tx(tCur) + (right ? -4 : 4), MT + IH - 6);
    cursorLab.setAttribute("text-anchor", right ? "end" : "start");
    cursorLab.textContent = `${tCur} min`;
    dTitle.textContent = `The cascade at ${tCur} min (colour = % active)`;
    // receptor halves
    const fR = mix(COL.R, L.R);
    recL.setAttribute("fill", fR); recR.setAttribute("fill", fR);
    recV.textContent = pct(L.R);
    for (const k of ["Ras", "RAF", "MEK", "ERK"] as Key[]) {
      const b = boxes[k]!;
      b.r.setAttribute("fill", mix(COL[k], L[k]));
      b.t.textContent = `${NAME[k]}  ${pct(L[k])}`;
      b.t.style.fill = L[k] > 0.55 ? "#fff" : INK;
    }
    nuc.setAttribute("fill", mix("#6b4fa0", 0.08 + 0.5 * L.ERK));
    for (const k of KEYS) {
      cells[k][1].textContent = pct(L[k]);
      cells[k][2].textContent = fmtN(L[k] * M.TOTALS[k]);
    }
  }

  // ---- start
  // the shared CSS sets the fill of all SVG text; keep the colours given as attributes
  host.querySelectorAll<SVGTextElement>("svg text[fill]").forEach(t => { t.style.fill = t.getAttribute("fill")!; });
  presetText.textContent = p0.text;
  pBtns[PRESETS.indexOf(p0)].classList.add("active");
  sync();
  // any manual change clears the preset highlight
  panel.querySelectorAll("input").forEach(inp => {
    const clear = () => pBtns.forEach(b => b.classList.remove("active"));
    inp.addEventListener("input", clear); inp.addEventListener("change", clear);
  });
  recompute(true);
});
