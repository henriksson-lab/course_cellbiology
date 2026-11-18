// Growth, senescence and telomeres: a culture dish of fibroblasts (agent-based, model.ts).
// Cells grow and divide until they cover the dish (contact inhibition). The student passages
// the culture (split 1:4); telomeres shorten at every division until cells become senescent
// (large, flat, no division). Over many passages the cumulative population doublings level
// off: the Hayflick limit. Switches: serum (mitogens), contact inhibition, telomerase,
// p53/Rb checkpoints. Opens at real time (the rule for all demos); culture changes take
// hours to days, so the speed buttons offer time-lapse.
// Options (data-*): seed, speed (index into SPEEDS, default 0 = real time),
// preset = young | old | cancer, auto = 0/1 (passage automatically at confluence).
import { autoMount, htmlEl, svgEl, button, presets, checkbox } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import { Dish, DEFAULTS, Params, St, Cell, R_DISH, CONF_N, L0_MEAN } from "./model";

/** Speeds: hours of culture time per second on screen. */
const SPEEDS: { label: string; h: number }[] = [
  { label: "real time", h: 1 / 3600 },
  { label: "1 s = 10 min", h: 1 / 6 },
  { label: "1 s = 1 h", h: 1 },
  { label: "1 s = 6 h", h: 6 },
  { label: "1 s = 1 day", h: 24 },
  { label: "1 s = 3 days", h: 72 },
];
const DT = 1 / 60;
const PW = 440, PH = 190, ML = 56, MR = 14, MT = 12, MB = 40;

// colours: shared colour key (membrane, nucleus, highlight); senescent cells blue, as after
// staining for senescence-associated β-galactosidase
const COL = {
  dish: "#e7eaee", rim: "#9aa3ad",
  memb: "#8a6a12", cyto: "#f6f0de", nucS: "#6b4fa0", nucF: "#cbbfe3",
  g0: "#d9d3c2", g0Stroke: "#8f8466",
  sen: "#cfe0f4", senStroke: "#2f5d9e", senNuc: "#8aa6cf",
  mit: "#fff7e0", mitStroke: "#e8590c",
  dead: "#adb5bd",
};
const TEL_LO = [232, 89, 12], TEL_HI = [42, 127, 143];     // short (orange) → long (teal)

type Preset = "young" | "old" | "cancer";
const PRESETS: Record<Preset, { label: string; p: Params; pd: number; L0: number }> = {
  young: { label: "Young fibroblasts", p: { ...DEFAULTS }, pd: 0, L0: L0_MEAN },
  old: { label: "Old fibroblasts (40 doublings)", p: { ...DEFAULTS }, pd: 40, L0: 5.55 },
  cancer: { label: "Cancer cell line", p: { serum: true, contact: false, telomerase: true, checkpoints: false }, pd: 0, L0: 4.5 },
};

const CSS = `
.qb-demo.cn { align-items: flex-start; }
.qb-demo.cn .cn-view { flex: 1 1 380px; max-width: 520px; min-width: 0; display: flex; flex-direction: column; gap: .45em; }
.cn .cn-canvas { width: 100%; aspect-ratio: 1; display: block; border-radius: 8px; background: #fff; }
.cn .cn-status { font-family: ui-monospace, monospace; font-size: .9em; }
.cn .cn-msg { border-left: 4px solid #e8590c; padding: .15em .5em; font-size: .92em; }
.cn .cn-msg[hidden] { display: none; }
.cn .cn-legend { display: flex; flex-wrap: wrap; gap: .3em .9em; font-size: .85em; align-items: center; }
.cn .cn-legend span { display: inline-flex; align-items: center; gap: .3em; }
.cn .cn-sw { display: inline-block; width: 18px; height: 12px; border-radius: 6px; border: 2px solid; }
.cn .cn-bar { display: inline-block; width: 120px; height: 12px; border-radius: 3px; border: 1px solid #ccc; }
.qb-demo.cn .cn-side { flex: 1 1 340px; max-width: 520px; min-width: 0; }
.cn .cn-plot { width: 100%; height: auto; }
.cn .cn-h { font-weight: 600; font-size: .95em; margin-top: .25em; }
.cn .qb-presets .qb-btn { min-height: 36px; }
.cn .cn-main .qb-btn { min-height: 40px; font-size: .9em; }
.cn .cn-play { min-width: 5.5em; font-weight: 600; }
.cn .cn-checks { display: flex; flex-direction: column; gap: .35em; }
.cn .cn-checks .qb-check { min-height: 30px; }
.cn .cn-checks input { width: 18px; height: 18px; }
@media (max-width: 640px) {
  .qb-demo.cn .cn-view, .qb-demo.cn .cn-side { flex: 0 0 auto; width: 100%; max-width: 100%; }
  .cn .qb-btn { min-height: 44px; } .cn .cn-checks .qb-check { min-height: 40px; }
}
`;
function injectCSS() {
  if (document.getElementById("cn-style")) return;
  const s = document.createElement("style");
  s.id = "cn-style"; s.textContent = CSS;
  document.head.appendChild(s);
}

const mix = (lo: number[], hi: number[], t: number) => {
  t = Math.max(0, Math.min(1, t));
  return `rgb(${lo.map((v, k) => Math.round(v + (hi[k] - v) * t)).join(",")})`;
};
function niceCeil(v: number, steps: number[]): number {
  for (const s of steps) if (s >= v) return s;
  return steps[steps.length - 1] * Math.ceil(v / steps[steps.length - 1]);
}
function niceStep(max: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (max / s <= 6) return s;
  return 1000;
}
const fmtTime = (h: number) => h < 48 ? `${Math.floor(h)} h ${String(Math.floor((h % 1) * 60)).padStart(2, "0")} min` : `day ${(h / 24).toFixed(1)}`;

autoMount("cellnumbers", host => {
  injectCSS();
  host.classList.add("cn");
  const ds = host.dataset;
  const seed0 = Number(ds.seed) || 1;
  let speed = Math.min(SPEEDS.length - 1, Math.max(0, Number(ds.speed) || 0));
  let preset: Preset = ds.preset === "old" || ds.preset === "cancer" ? ds.preset : "young";
  let auto = ds.auto === "1";
  let colourBy: "state" | "telomere" = "state";
  const p: Params = { ...PRESETS[preset].p };
  const pr0 = PRESETS[preset];
  const dish = new Dish(p, seed0, undefined, pr0.pd, pr0.L0);
  let hist: { d: number; n: number }[] = [];
  let divLog: { t: number; n: number }[] = [];
  dish.auto = auto;
  dish.onPassage = () => { const d = dish.t / 24; hist.push({ d, n: dish.recs[dish.recs.length - 1].harvested }, { d, n: dish.nSeed }); };

  // ---- the dish
  const view = htmlEl("div", "cn-view cn-main", "", host);
  const canvas = htmlEl("canvas", "cn-canvas", "", view);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Bottom of a culture well seen from above, with cells drawn as outlines");
  const ctx = canvas.getContext("2d")!;
  const status = htmlEl("div", "cn-status", "", view);
  const msg = htmlEl("div", "cn-msg", "", view);
  const legend = htmlEl("div", "cn-legend", "", view);
  const tools = htmlEl("div", "qb-presets", "", view);
  const bPlay = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPlay.textContent = loop.paused ? "Run" : "Pause"; }, "cn-play");
  button(tools, "Passage now (split 1:4)", () => { doPassage(); });
  button(tools, "Reset", () => applyPreset(preset));
  const cAuto = checkbox(view, "Passage automatically when the dish is confluent", auto, v => { auto = v; dish.auto = v; });
  cAuto.closest("label")!.classList.add("cn-auto");
  htmlEl("div", "cn-h", "Clock speed", view);
  const speedBtns = presets(view, SPEEDS.map((s, k) => ({ label: s.label, apply: () => { speed = k; showMsg(); } })));
  speedBtns[speed].classList.add("active");
  htmlEl("div", "cn-h", "Colour cells by", view);
  const colBtns = presets(view, [
    { label: "state", apply: () => { colourBy = "state"; paintLegend(); loop.redraw(); } },
    { label: "telomere length", apply: () => { colourBy = "telomere"; paintLegend(); loop.redraw(); } },
  ]);
  colBtns[0].classList.add("active");

  // ---- side: plots, readout, switches
  const side = htmlEl("div", "qb-panel cn-side", "", host);
  htmlEl("div", "cn-h", "Cells in the dish over time", side);
  const svgN = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "cn-plot" }, side);
  svgN.setAttribute("role", "img"); svgN.setAttribute("aria-label", "Graph of cell number against time in days");
  const axN = svgEl("g", {}, svgN);
  const lineN = svgEl("path", { fill: "none", stroke: "#1b2a3a", "stroke-width": 2 }, svgN);
  htmlEl("div", "cn-h", "Cumulative population doublings at each passage", side);
  const svgP = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "cn-plot" }, side);
  svgP.setAttribute("role", "img"); svgP.setAttribute("aria-label", "Graph of cumulative population doublings against passage number");
  const axP = svgEl("g", {}, svgP);
  const lineP = svgEl("path", { fill: "none", stroke: "#2a7f8f", "stroke-width": 2 }, svgP);
  const dotsP = svgEl("g", {}, svgP);
  const readout = htmlEl("div", "qb-readout", "", side);

  htmlEl("div", "cn-h", "Change the cells", side);
  const checks = htmlEl("div", "cn-checks", "", side);
  const cSerum = checkbox(checks, "Serum in the medium (mitogens)", p.serum, v => { p.serum = v; showMsg(); });
  const cContact = checkbox(checks, "Contact inhibition (untick: transformed cells)", p.contact, v => { p.contact = v; });
  const cTert = checkbox(checks, "Telomerase (TERT gene added)", p.telomerase, v => { p.telomerase = v; });
  const cChk = checkbox(checks, "p53 and Rb checkpoints work (untick: lost, as with a viral oncogene)", p.checkpoints, v => { p.checkpoints = v; });
  htmlEl("div", "cn-h", "Start again with", side);
  const preBtns = presets(side, (Object.keys(PRESETS) as Preset[]).map(k => ({ label: PRESETS[k].label, apply: () => applyPreset(k) })));
  preBtns[Object.keys(PRESETS).indexOf(preset)].classList.add("active");
  htmlEl("div", "qb-note", `Qualitative model with illustrative numbers. Each cell is a disc in a well about 1 mm across (a confluent layer is about ${CONF_N} cells; a real dish holds about a million). Cycle about 22 h; a cell passes the restriction point only with serum and a free edge. Each division costs both daughters about 70 bp of telomere (one length per cell instead of 92 chromosome ends); a short telomere triggers senescence through p53/Rb, plus a small chance of stress-induced senescence. Without checkpoints, very short telomeres cause chromosome fusions and death (crisis); rare escape from crisis is not modelled. No apoptosis from lack of survival factors.`, side);

  // ---- drawing
  function resize() {
    const w = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
    if (w > 0 && canvas.width !== w) { canvas.width = w; canvas.height = w; }
  }
  function cellStyle(c: Cell): { fill: string; stroke: string; nuc: string | null; alpha: number } {
    if (c.st === St.DYING) return { fill: COL.dead, stroke: "#6c757d", nuc: null, alpha: 0.6 * Math.max(0, c.timer / 6) };
    if (colourBy === "telomere") {
      const f = mix(TEL_LO, TEL_HI, (c.L - 3) / 6);
      return { fill: f, stroke: "#1b2a3a", nuc: null, alpha: 0.8 };
    }
    if (c.st === St.SEN || (c.st === St.ATTACH && c.wasSen)) return { fill: COL.sen, stroke: COL.senStroke, nuc: COL.senNuc, alpha: 0.85 };
    if (c.st === St.M) return { fill: COL.mit, stroke: COL.mitStroke, nuc: COL.nucS, alpha: 0.9 };
    if (c.st === St.ATTACH) return { fill: COL.cyto, stroke: COL.memb, nuc: COL.nucF, alpha: 0.85 };
    if (c.st === St.G0) return { fill: COL.g0, stroke: COL.g0Stroke, nuc: "#e4e0ea", alpha: 0.8 };
    return { fill: COL.cyto, stroke: COL.memb, nuc: COL.nucS, alpha: 0.8 };
  }
  function render() {
    resize();
    const W = canvas.width, s = W / (2 * R_DISH + 20), cx = W / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = COL.dish; ctx.strokeStyle = COL.rim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cx, R_DISH * s + 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.setTransform(s, 0, 0, s, cx, cx);
    ctx.lineWidth = 1.6;
    for (const c of dish.cells) {
      const st = cellStyle(c);
      if (st.alpha <= 0) continue;
      ctx.globalAlpha = st.alpha;
      ctx.fillStyle = st.fill; ctx.strokeStyle = st.stroke;
      const round = c.st === St.M || c.st === St.ATTACH || c.st === St.DYING;
      const flat = c.st === St.SEN;
      // transformed cells (no contact inhibition) are smaller and rounder; drawn see-through,
      // so cells piled on top of each other look darker
      const tr = !p.contact && !flat && !round;
      if (tr) ctx.globalAlpha = 0.5;
      const rx = round ? c.r : flat ? c.r * 1.15 : tr ? c.r * 0.95 : c.r * 1.4;
      const ry = round ? c.r : flat ? c.r * 0.88 : tr ? c.r * 0.75 : c.r * 0.68;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, c.ang, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      if (st.nuc) {
        ctx.fillStyle = st.nuc;
        const nr = c.st === St.M ? 5 : flat ? 11 : 7;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, nr * (flat || c.st === St.M ? 1 : 1.3), nr, c.ang, 0, 2 * Math.PI); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // scale bar 100 µm
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bx = W - 18 * s - 100 * s - 6, by = W - 14 * s;
    ctx.fillStyle = "#1b2a3a"; ctx.fillRect(bx, by - 4 * s, 100 * s, Math.max(3, 4 * s));
    ctx.font = `${Math.round(Math.max(12, 26 * s))}px system-ui, sans-serif`; ctx.textAlign = "center";
    ctx.fillText("100 µm", bx + 50 * s, by - 10 * s);
    drawText();
  }
  function paintLegend() {
    legend.innerHTML = "";
    if (colourBy === "telomere") {
      htmlEl("span", "", "short telomeres (3 kb)", legend);
      const bar = htmlEl("span", "cn-bar", "", legend);
      bar.style.background = `linear-gradient(to right, ${mix(TEL_LO, TEL_HI, 0)}, ${mix(TEL_LO, TEL_HI, 1)})`;
      htmlEl("span", "", "long (9 kb)", legend);
      return;
    }
    const item = (fill: string, stroke: string, text: string) => {
      const s = htmlEl("span", "", "", legend);
      const sw = htmlEl("i", "cn-sw", "", s); sw.style.background = fill; sw.style.borderColor = stroke;
      s.append(text);
    };
    item(COL.cyto, COL.memb, "growing (G1, S, G2)");
    item(COL.mit, COL.mitStroke, "dividing (round)");
    item(COL.g0, COL.g0Stroke, "resting (G0)");
    item(COL.sen, COL.senStroke, "senescent (large, flat)");
    item(COL.dead, "#6c757d", "dying");
  }

  function axes(g: SVGGElement, xMax: number, xStep: number, yMax: number, yStep: number, xl: string, yl: string) {
    g.innerHTML = "";
    const sx = (v: number) => ML + v / xMax * (PW - ML - MR), sy = (v: number) => PH - MB - v / yMax * (PH - MT - MB);
    svgEl("line", { x1: ML, x2: PW - MR, y1: PH - MB, y2: PH - MB, class: "axis" }, g);
    svgEl("line", { x1: ML, x2: ML, y1: MT, y2: PH - MB, class: "axis" }, g);
    for (let v = 0; v <= xMax + 1e-9; v += xStep) {
      svgEl("line", { x1: sx(v), x2: sx(v), y1: PH - MB, y2: PH - MB + 5, class: "axis" }, g);
      svgEl("text", { x: sx(v), y: PH - MB + 19, "font-size": 14, "text-anchor": "middle" }, g).textContent = String(+v.toFixed(2));
    }
    for (let v = 0; v <= yMax + 1e-9; v += yStep) {
      svgEl("line", { x1: ML - 4, x2: ML, y1: sy(v), y2: sy(v), class: "axis" }, g);
      if (v > 0) svgEl("line", { x1: ML, x2: PW - MR, y1: sy(v), y2: sy(v), class: "grid" }, g);
      svgEl("text", { x: ML - 7, y: sy(v) + 5, "font-size": 14, "text-anchor": "end" }, g).textContent = String(v);
    }
    svgEl("text", { x: (ML + PW - MR) / 2, y: PH - 5, "font-size": 14, "text-anchor": "middle" }, g).textContent = xl;
    const ym = (MT + PH - MB) / 2;
    svgEl("text", { x: 14, y: ym, "font-size": 14, "text-anchor": "middle", transform: `rotate(-90 14 ${ym})` }, g).textContent = yl;
    return { sx, sy };
  }
  function drawPlots() {
    // cells over time
    const dNow = dish.t / 24;
    const xMax = niceCeil(Math.max(2, dNow), [2, 4, 6, 8, 10, 15, 20, 30, 40, 60, 80, 100, 150, 200, 300, 400]);
    const nMax = Math.max(CONF_N * 1.4, ...hist.map(h => h.n));
    const yMax = niceCeil(nMax, [600, 800, 1000, 1500, 2000, 2500, 3000]);
    const { sx, sy } = axes(axN, xMax, niceStep(xMax), yMax, niceStep(yMax), "time (days)", "cells");
    const cy = sy(CONF_N);
    svgEl("line", { x1: ML, x2: PW - MR, y1: cy, y2: cy, stroke: "#e8590c", "stroke-dasharray": "5 4", "stroke-width": 1.5 }, axN);
    svgEl("text", { x: PW - MR - 4, y: cy - 5, "font-size": 13, "text-anchor": "end", fill: "#c2410c" }, axN).textContent = "confluent";
    lineN.setAttribute("d", hist.map((h, k) => `${k ? "L" : "M"}${sx(h.d).toFixed(1)},${sy(h.n).toFixed(1)}`).join(""));

    // doublings per passage
    const recs = dish.recs;
    const pdNow = dish.pdNow();
    const pMax = niceCeil(Math.max(10, dish.passage + 1), [10, 20, 30, 40, 60, 80, 100, 150, 200]);
    const yMaxP = niceCeil(Math.max(60, pdNow + 1), [60, 80, 100, 150, 200, 300, 400]);
    const a = axes(axP, pMax, niceStep(pMax), yMaxP, niceStep(yMaxP), "passage number", "doublings");
    const pts = recs.map(r => [a.sx(r.passage), a.sy(r.pd)]);
    const live = [a.sx(dish.passage + 0.5), a.sy(pdNow)];
    lineP.setAttribute("d", pts.map((q, k) => `${k ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join("")
      + `L${live[0].toFixed(1)},${live[1].toFixed(1)}`);
    lineP.setAttribute("stroke-dasharray", "");
    dotsP.innerHTML = "";
    for (const q of pts) svgEl("circle", { cx: q[0], cy: q[1], r: 3.5, fill: "#2a7f8f" }, dotsP);
    svgEl("circle", { cx: live[0], cy: live[1], r: 4, fill: "#fff", stroke: "#2a7f8f", "stroke-width": 2 }, dotsP);
  }
  function drawText() {
    const s = dish.stats();
    const conf = dish.confluence();
    status.textContent = `${fmtTime(dish.t)} · passage ${dish.passage} · ${s.n} cells · ${Math.round(100 * Math.min(conf, 9.99))} % confluent`;
    const pdHere = dish.pdNow() - dish.cumPD;
    readout.textContent =
      `population doublings: ${dish.pdNow().toFixed(1)} in total (${pdHere.toFixed(1)} since the last passage)\n`
      + `mean telomere length: ${s.n ? s.meanL.toFixed(2) + " kb" : "–"}\n`
      + `growing or dividing: ${s.cycling}   attaching: ${s.attach}\n`
      + `resting in G0: ${s.g0}  (touching neighbours ${s.contact}, no serum ${s.serum}${s.medium ? ", medium used up " + s.medium : ""})\n`
      + `senescent: ${s.sen} (${s.n ? Math.round(100 * s.sen / s.n) : 0} %)   died in crisis: ${dish.deaths}`;
    showMsg(s);
    drawPlots();
  }
  function showMsg(s = dish.stats()) {
    let t = "";
    // divisions in the last 7 days (sampled about every half day)
    const old = divLog.find(e => e.t >= dish.t - 7 * 24);
    const div7 = old && dish.t - divLog[0].t >= 7 * 24 ? dish.divisions - old.n : Infinity;
    if (s.n === 0) t = "All cells have died: telomeres became so short that chromosomes fused (crisis). Press Reset.";
    else if (!p.serum) t = "No serum: without mitogens, cells stop before the restriction point and rest in G0. They are not dead; tick serum again.";
    else if (s.sen > 0.7 * s.n && div7 <= Math.max(2, 0.05 * s.n)) t = `Almost no division in the last 7 days, and ${Math.round(100 * s.sen / s.n)} % of the cells are senescent: the culture has reached its Hayflick limit, after about ${dish.pdNow().toFixed(0)} population doublings.`;
    else if (s.medium > 0) t = "The dish is overgrown and the medium is used up: passage the cells.";
    else if (speed === 0) t = "Real time: a cell cycle takes about a day, so you will see almost nothing change. Choose a faster clock speed below to watch it as a time-lapse.";
    msg.hidden = !t;
    if (msg.textContent !== t) msg.textContent = t;
  }

  function record() {
    const lastDiv = divLog[divLog.length - 1];
    if (!lastDiv || dish.t - lastDiv.t >= 12) divLog.push({ t: dish.t, n: dish.divisions });
    if (divLog.length > 40) divLog.shift();
    const d = dish.t / 24, last = hist[hist.length - 1];
    if (!last || d - last.d >= 0.02) hist.push({ d, n: dish.alive() });
    if (hist.length > 3000) hist = hist.filter((_, k) => k % 2 === 0 || k === hist.length - 1);
  }
  function doPassage() {
    record();
    dish.passageNow();
    hist.push({ d: dish.t / 24, n: dish.alive() });
    loop.redraw();
  }
  function applyPreset(k: Preset) {
    preset = k;
    const pr = PRESETS[k];
    Object.assign(p, pr.p);
    cSerum.checked = p.serum; cContact.checked = p.contact; cTert.checked = p.telomerase; cChk.checked = p.checkpoints;
    preBtns.forEach((b, i) => b.classList.toggle("active", i === Object.keys(PRESETS).indexOf(k)));
    dish.reset(seed0, Math.round(CONF_N / 4), pr.pd, pr.L0);
    hist = []; divLog = [];
    record();
    loop.redraw();
  }

  const loop = visibleLoop(host, DT, () => {
    dish.advance(SPEEDS[speed].h * DT);
    record();
  }, render);
  if ("ResizeObserver" in window) new ResizeObserver(() => loop.redraw()).observe(canvas);
  paintLegend();
  record();
  render();
});
