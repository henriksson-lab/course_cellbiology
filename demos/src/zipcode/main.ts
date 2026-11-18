// Zip-code game: build a protein from sorting signals, predict where it goes, then watch
// its route on a cartoon cell map, in real time by default (faster speeds are a choice).
// The outcome comes from the rule table in rules.ts; combinations without a clear textbook
// answer are marked "not predicted" instead of being given an invented destination.
// Options (data-*): preset = one of the PRESETS keys below.
import { autoMount, htmlEl, svgEl, button, checkbox } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import {
  Protein, NTerm, CTerm, Dest, DEST_NAME, PREDICT, StepId, Outcome, SignalKey, sortProtein, totalTime, has,
} from "./rules";

// ---- shared colour key (plan/lecture-brief.md)
const C = {
  text: "#1b2a3a", pm: "#8a6a12", pmFill: "#f6f0de", cyto: "#fbfaf5", nuc: "#6b4fa0", nucFill: "#efebf7",
  er: "#2a7f8f", erFill: "#e6f3f5", golgi: "#d9822b", golgiFill: "#fbeedd", mito: "#a8324a", mitoFill: "#f8e9ec",
  lys: "#2e8b57", lysFill: "#e3f3ea", pex: "#3b5bab", pexFill: "#e9eef8", hi: "#e8590c", grey: "#868e96",
};
const SIG: Record<SignalKey, { name: string; short: string; color: string }> = {
  sp: { name: "ER signal peptide", short: "signal peptide", color: C.er },
  mts: { name: "mitochondrial presequence", short: "presequence", color: C.mito },
  tm: { name: "transmembrane segment", short: "TM", color: C.pm },
  nls: { name: "nuclear localisation signal (NLS)", short: "NLS", color: C.nuc },
  kdel: { name: "KDEL (ER retrieval)", short: "KDEL", color: C.er },
  pts1: { name: "PTS1 (-SKL, peroxisome)", short: "SKL", color: C.pex },
  m6p: { name: "mannose-6-phosphate signal patch", short: "M6P patch", color: C.lys },
};

const PRESETS: { key: string; label: string; p: Protein; note: string }[] = [
  { key: "gfp", label: "GFP alone", note: "Green fluorescent protein, 27 kDa, no signals.",
    p: { nterm: "none", tm: false, nls: false, cterm: "none", m6p: false, large: false } },
  { key: "nlsgfp", label: "GFP + NLS", note: "GFP with the SV40 NLS (PKKKRKV) added.",
    p: { nterm: "none", tm: false, nls: true, cterm: "none", m6p: false, large: false } },
  { key: "albumin", label: "Albumin", note: "The main blood plasma protein, made by liver cells (66 kDa).",
    p: { nterm: "sp", tm: false, nls: false, cterm: "none", m6p: false, large: true } },
  { key: "bip", label: "BiP", note: "A chaperone that helps proteins fold in the ER (78 kDa).",
    p: { nterm: "sp", tm: false, nls: false, cterm: "kdel", m6p: false, large: true } },
  { key: "cathepsin", label: "Cathepsin D", note: "A protease that digests proteins at acid pH (precursor about 52 kDa).",
    p: { nterm: "sp", tm: false, nls: false, cterm: "none", m6p: true, large: true } },
  { key: "ldlr", label: "LDL receptor", note: "Binds LDL particles (cholesterol) from the blood.",
    p: { nterm: "sp", tm: true, nls: false, cterm: "none", m6p: false, large: true } },
  { key: "citrate", label: "Citrate synthase", note: "First enzyme of the citric acid (TCA) cycle; encoded in the nucleus.",
    p: { nterm: "mts", tm: false, nls: false, cterm: "none", m6p: false, large: true } },
  { key: "luciferase", label: "Firefly luciferase", note: "The light-making enzyme of fireflies (61 kDa); ends in -SKL.",
    p: { nterm: "none", tm: false, nls: false, cterm: "pts1", m6p: false, large: true } },
];

const SPEEDS = [1, 10, 60, 300];

// ---- cell map geometry (viewBox 0 0 900 540)
const MW = 900, MH = 540;
type Pt = [number, number];
const P = {
  ribo: [470, 168] as Pt, cyto: [470, 186] as Pt,
  poreOut: [222, 156] as Pt, poreIn: [222, 196] as Pt, nuc: [200, 270] as Pt, nuc2: [240, 300] as Pt,
  erSurf: [392, 215] as Pt, erLumen: [382, 268] as Pt, erLumen2: [380, 300] as Pt, erExit: [400, 335] as Pt,
  cis: [528, 300] as Pt, trans: [596, 300] as Pt, tgn: [624, 300] as Pt,
  pm: [792, 250] as Pt, out: [852, 240] as Pt, endo: [655, 395] as Pt, lys: [720, 450] as Pt,
  mitoOut: [330, 438] as Pt, matrix: [318, 470] as Pt, inner: [362, 458] as Pt,
  pexOut: [640, 148] as Pt, pex: [652, 120] as Pt,
};
/** Path (and vesicle colour, if the protein travels in a vesicle) for each step. */
const LEG: Record<StepId, { path: Pt[]; ves?: string }> = {
  transCyto: { path: [P.ribo, P.cyto] },
  transER: { path: [P.ribo, P.erSurf, P.erLumen] },
  toPore: { path: [P.cyto, [330, 150], P.poreOut] },
  throughPore: { path: [P.poreOut, P.poreIn] },
  diffuseNuc: { path: [P.poreIn, P.nuc] },
  toMito: { path: [P.cyto, [420, 330], P.mitoOut] },
  mitoImport: { path: [P.mitoOut, P.matrix] },
  toInner: { path: [P.mitoOut, P.inner] },
  toPex: { path: [P.cyto, [560, 170], P.pexOut] },
  pexImport: { path: [P.pexOut, P.pex] },
  erFold: { path: [P.erLumen, P.erLumen2] },
  erToGolgi: { path: [P.erLumen2, P.erExit, [470, 330], P.cis], ves: C.er },
  golgi: { path: [P.cis, P.trans, P.tgn] },
  golgiBack: { path: [P.cis, [470, 345], P.erExit, P.erLumen2], ves: C.golgi },
  golgiToPM: { path: [P.tgn, [700, 270], P.pm], ves: C.golgi },
  golgiToEndo: { path: [P.tgn, [650, 340], P.endo], ves: C.golgi },
  endoToLys: { path: [P.endo, P.lys] },
  stop: { path: [] },
};

function along(path: Pt[], u: number): Pt {
  if (path.length === 1) return path[0];
  const seg: number[] = [];
  let L = 0;
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(d); L += d; }
  let s = Math.max(0, Math.min(1, u)) * L;
  for (let i = 0; i < seg.length; i++) {
    if (s <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? Math.min(1, s / seg[i]) : 1;
      return [path[i][0] + f * (path[i + 1][0] - path[i][0]), path[i][1] + f * (path[i + 1][1] - path[i][1])];
    }
    s -= seg[i];
  }
  return path[path.length - 1];
}
// smooth start and stop of each leg, so nothing jumps
const ease = (u: number) => u * u * (3 - 2 * u);

function fmtTime(s: number): string {
  s = Math.floor(s);
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}
function fmtDur(s: number): string {
  if (s < 1) return "< 1 s";
  if (s < 90) return `about ${Math.round(s)} s`;
  return `about ${Math.round(s / 60)} min`;
}

let styled = false;
function addStyle() {
  if (styled) return;
  styled = true;
  const st = document.createElement("style");
  st.textContent = `
.qb-demo.zc { display: flex; flex-wrap: wrap; gap: 1.2em; align-items: flex-start; }
.zc .zc-left { flex: 1 1 330px; max-width: 420px; display: flex; flex-direction: column; gap: .7em; min-width: 0; }
.zc .zc-right { flex: 1.6 1 460px; min-width: 0; display: flex; flex-direction: column; gap: .5em; }
.zc .zc-h { font-weight: 700; margin-top: .2em; }
.zc .zc-row { display: flex; flex-wrap: wrap; gap: .35em; align-items: center; }
.zc .zc-row .zc-lab { min-width: 6.2em; font-size: .9em; color: #555; }
.zc .qb-btn { min-height: 36px; }
.zc .qb-btn.zc-on { background: var(--zc-c, #1f77b4); border-color: var(--zc-c, #1f77b4); color: #fff; }
.zc .qb-btn:disabled { opacity: .45; cursor: default; }
.zc .zc-go { font-weight: 700; border-color: #e8590c; }
.zc .zc-go:not(:disabled) { background: #e8590c; color: #fff; }
.zc .zc-bar { width: 100%; height: auto; }
.zc .zc-map { width: 100%; height: auto; border-radius: 6px; background: #eef2f6; }
.zc .zc-pred { display: flex; flex-wrap: wrap; gap: .3em; }
.zc .zc-pred .qb-btn { font-size: .8em; }
.zc .zc-pred .qb-btn.zc-sel { background: #1b2a3a; border-color: #1b2a3a; color: #fff; }
.zc .zc-status { font-size: .95em; min-height: 1.4em; }
.zc .zc-steps { margin: 0; padding-left: 1.4em; font-size: .9em; }
.zc .zc-steps li { margin: .15em 0; color: #333; }
.zc .zc-steps li.zc-now { font-weight: 600; color: #1b2a3a; }
.zc .zc-steps li .zc-t { color: #777; font-weight: 400; }
.zc .zc-result { border-left: 5px solid #ccc; padding: .3em .7em; background: #f6f7f9; border-radius: 4px; font-size: .93em; }
.zc .zc-result.zc-ok { border-color: #2b8a3e; }
.zc .zc-result.zc-no { border-color: #c92a2a; }
.zc .zc-result.zc-unc { border-color: #e8590c; }
.zc .zc-result p { margin: .3em 0; }
.zc .zc-select { font: inherit; font-size: .9em; padding: .2em; min-height: 36px; }
.zc .zc-note { font-size: .85em; color: #666; }
@media (max-width: 640px) {
  .qb-demo.zc { flex-direction: column; }
  .zc .zc-left, .zc .zc-right { max-width: none; width: 100%; flex-basis: auto; }
  .zc .zc-row .zc-lab { min-width: 100%; }
  .zc .qb-btn, .zc .zc-select { min-height: 44px; }
  .zc .qb-check input { width: 22px; height: 22px; }
}`;
  document.head.appendChild(st);
}

autoMount("zipcode", host => {
  addStyle();
  host.classList.add("zc");
  const pre0 = PRESETS.find(x => x.key === host.dataset.preset);
  let prot: Protein = { ...(pre0 ? pre0.p : PRESETS[0].p) };
  let prediction: Dest | null = null;
  let out: Outcome = sortProtein(prot);
  let t = 0, running = false, done = false, speed = 1;

  // ================= left: builder and prediction
  const left = htmlEl("div", "zc-left", "", host);
  htmlEl("div", "zc-h", "1. Build a protein", left);
  const presRow = htmlEl("div", "zc-row", "", left);
  const presSel = htmlEl("select", "zc-select", "", presRow);
  htmlEl("option", "", "Start from a real protein…", presSel).value = "";
  for (const p of PRESETS) htmlEl("option", "", p.label, presSel).value = p.key;
  const presNote = htmlEl("div", "zc-note", "", left);
  presSel.addEventListener("change", () => {
    const p = PRESETS.find(x => x.key === presSel.value);
    if (p) { prot = { ...p.p }; presNote.textContent = p.note; changed(); }
    presSel.blur();
  });

  const barSvg = svgEl("svg", { viewBox: "0 0 560 118", class: "zc-bar", role: "img" }, left);
  barSvg.setAttribute("aria-label", "The protein chain from N- to C-terminus with its sorting signals");

  function choiceRow(label: string, opts: { v: string; t: string; c: string }[], get: () => string, set: (v: string) => void) {
    const row = htmlEl("div", "zc-row", "", left);
    htmlEl("span", "zc-lab", label, row);
    const btns = opts.map(o => {
      const b = button(row, o.t, () => { set(o.v); changed(); });
      b.style.setProperty("--zc-c", o.c);
      return { b, v: o.v };
    });
    return () => btns.forEach(x => x.b.classList.toggle("zc-on", x.v === get() && x.v !== "none"));
  }
  const syncN = choiceRow("N-terminus", [
    { v: "none", t: "none", c: C.grey }, { v: "sp", t: "ER signal peptide", c: C.er }, { v: "mts", t: "mito presequence", c: C.mito }],
    () => prot.nterm, v => { prot.nterm = v as NTerm; });
  const midRow = htmlEl("div", "zc-row", "", left);
  htmlEl("span", "zc-lab", "Middle", midRow);
  const cTM = checkbox(midRow, "TM segment", prot.tm, v => { prot.tm = v; changed(); });
  const cNLS = checkbox(midRow, "NLS", prot.nls, v => { prot.nls = v; changed(); });
  const syncC = choiceRow("C-terminus", [
    { v: "none", t: "none", c: C.grey }, { v: "kdel", t: "KDEL", c: C.er }, { v: "pts1", t: "PTS1 (-SKL)", c: C.pex }],
    () => prot.cterm, v => { prot.cterm = v as CTerm; });
  const surfRow = htmlEl("div", "zc-row", "", left);
  htmlEl("span", "zc-lab", "Folded surface", surfRow);
  const cM6P = checkbox(surfRow, "M6P signal patch", prot.m6p, v => { prot.m6p = v; changed(); });
  const syncSize = choiceRow("Size", [
    { v: "small", t: "small (27 kDa, like GFP)", c: "#495057" }, { v: "large", t: "large (> 50 kDa)", c: "#495057" }],
    () => (prot.large ? "large" : "small"), v => { prot.large = v === "large"; });

  htmlEl("div", "zc-h", "2. Predict: where does it end up?", left);
  const predBox = htmlEl("div", "zc-pred", "", left);
  const predBtns = PREDICT.map(dst => {
    const b = button(predBox, DEST_NAME[dst], () => {
      prediction = dst;
      predBtns.forEach(x => x.b.classList.toggle("zc-sel", x.d === dst));
      syncRun();
    });
    return { b, d: dst };
  });

  // ================= right: map and controls
  const right = htmlEl("div", "zc-right", "", host);
  htmlEl("div", "zc-h", "3. Run and watch the route", right);
  const ctl = htmlEl("div", "zc-row", "", right);
  const bRun = button(ctl, "Run", () => start(), "zc-go");
  const bEnd = button(ctl, "Show the end now", () => { t = totalTime(out); finish(); });
  button(ctl, "Reset", () => { stopRun(); t = 0; done = false; drawAt(0); showSteps(); result.hidden = true; syncRun(); });
  const spLab = htmlEl("label", "zc-row", "", ctl);
  spLab.append("speed ");
  const spSel = htmlEl("select", "zc-select", "", spLab);
  for (const v of SPEEDS) htmlEl("option", "", v === 1 ? "1× (real time)" : v + "× real time", spSel).value = String(v);
  spSel.addEventListener("change", () => { speed = Number(spSel.value); spSel.blur(); });

  const map = svgEl("svg", { viewBox: `0 0 ${MW} ${MH}`, class: "zc-map", role: "img" }, right);
  map.setAttribute("aria-label", "Cartoon cell with nucleus, ER, Golgi, mitochondrion, peroxisome, endosome and lysosome");
  drawCell(map);
  const fx = svgEl("g", {}, map);
  const ribo = svgEl("g", {}, fx);
  svgEl("ellipse", { cx: 0, cy: -6, rx: 13, ry: 8, fill: "#adb5bd", stroke: C.text, "stroke-width": 1 }, ribo);
  svgEl("ellipse", { cx: 0, cy: 7, rx: 17, ry: 10, fill: "#ced4da", stroke: C.text, "stroke-width": 1 }, ribo);
  const ghost = svgEl("g", { opacity: 0.55 }, fx);
  svgEl("circle", { r: 9, fill: C.hi, stroke: C.text, "stroke-width": 1.5 }, ghost);
  const ves = svgEl("circle", { r: 17, fill: "none", "stroke-width": 3 }, fx);
  const dot = svgEl("g", {}, fx);
  svgEl("circle", { r: 9, fill: C.hi, stroke: C.text, "stroke-width": 1.5 }, dot);
  const tmBar = svgEl("rect", { x: -2.5, y: -13, width: 5, height: 26, fill: C.text }, dot);
  const qMark = svgEl("g", {}, fx);
  svgEl("circle", { r: 22, fill: "#fff", stroke: C.hi, "stroke-width": 3, "stroke-dasharray": "6 4" }, qMark);
  const qt = svgEl("text", { y: 9, "text-anchor": "middle", "font-size": 26, "font-weight": 700, fill: C.hi }, qMark);
  qt.textContent = "?";
  const clock = svgEl("text", { x: 886, y: 536, "font-size": 17, fill: C.text, "text-anchor": "end" }, map);

  const status = htmlEl("div", "zc-status", "", right);
  const steps = htmlEl("ol", "zc-steps", "", right);
  const result = htmlEl("div", "zc-result", "", right);
  result.hidden = true;
  htmlEl("div", "zc-note",
    "Cartoon cell, not to scale. Times are typical values for a mammalian cell at 37 °C, rounded; real proteins vary a lot. "
    + "The rules are the textbook ones: one protein, one route. Combinations without a clear textbook answer are marked as not predicted.", right);

  const loop = visibleLoop(host, 1 / 30, () => {
    if (!running) return;
    t += speed / 30;
    if (t >= totalTime(out)) finish();
  }, () => { drawAt(t); }, 4);
  loop.setPaused(true);

  // ================= logic
  function changed() {
    stopRun();
    out = sortProtein(prot);
    prediction = null; t = 0; done = false;
    predBtns.forEach(x => x.b.classList.remove("zc-sel"));
    result.hidden = true;
    syncControls(); drawBar(); drawAt(0); showSteps(); syncRun();
  }
  function syncControls() {
    syncN(); syncC(); syncSize();
    cTM.checked = prot.tm; cNLS.checked = prot.nls; cM6P.checked = prot.m6p;
    if (!PRESETS.some(p => JSON.stringify(p.p) === JSON.stringify(prot))) { presSel.value = ""; presNote.textContent = ""; }
  }
  function syncRun() {
    bRun.disabled = !prediction || running;
    bRun.textContent = prediction ? (done ? "Run again" : "Run") : "Run (predict first)";
    bEnd.disabled = !prediction || done;
  }
  function start() {
    if (!prediction) return;
    t = 0; done = false; running = true; result.hidden = true;
    loop.setPaused(false); syncRun();
  }
  function stopRun() { running = false; loop.setPaused(true); }
  function finish() {
    running = false; done = true; loop.setPaused(true);
    t = totalTime(out);
    drawAt(t); showSteps(); showResult(); drawBar(); syncRun();
  }

  /** Which step is active at time s, and how far through it (0..1). */
  function stepAt(s: number): { k: number; u: number } {
    let acc = 0;
    for (let k = 0; k < out.steps.length; k++) {
      const d = out.steps[k].dur;
      if (s < acc + d) return { k, u: d ? (s - acc) / d : 1 };
      acc += d;
    }
    return { k: out.steps.length - 1, u: 1 };
  }

  function drawAt(s: number) {
    const started = running || done;
    const { k, u } = stepAt(s);
    const st = out.steps[k];
    let pos: Pt = P.ribo, vesCol: string | undefined;
    if (started) {
      const leg = LEG[st.id];
      if (st.id === "stop") {
        const prev = k > 0 ? LEG[out.steps[k - 1].id].path : [P.cyto];
        pos = prev[prev.length - 1];
      } else {
        pos = along(leg.path, ease(u));
        vesCol = leg.ves;
      }
      // a secreted protein leaves the cell at the very end
      if (done && out.dest === "secreted") pos = P.out;
    }
    // ribosome: stays at its start, or rides to the ER during co-translational import
    let rp: Pt = P.ribo;
    const dock: Pt = [P.erSurf[0] + 8, P.erSurf[1] - 16];
    if (started && st.id === "transER") rp = along([P.ribo, dock], ease(Math.min(1, u * 1.6)));
    // after translation the ribosome lets go of the ER and drifts back
    else if (started && k === 1 && out.steps[0].id === "transER" && !done) rp = along([dock, P.ribo], ease(Math.min(1, u * 5)));
    ribo.setAttribute("transform", `translate(${rp[0]} ${rp[1]})`);
    // the protein grows while it is translated
    const grow = started && (st.id === "transCyto" || st.id === "transER") ? Math.max(0.25, u) : 1;
    dot.style.display = started ? "" : "none";
    dot.setAttribute("transform", `translate(${pos[0].toFixed(1)} ${pos[1].toFixed(1)}) scale(${grow.toFixed(2)})`);
    tmBar.style.display = prot.tm && out.dest !== "unclear" ? "" : "none";
    ves.style.display = vesCol ? "" : "none";
    if (vesCol) { ves.setAttribute("cx", pos[0].toFixed(1)); ves.setAttribute("cy", pos[1].toFixed(1)); ves.setAttribute("stroke", vesCol); ves.setAttribute("fill", vesCol === C.er ? C.erFill : C.golgiFill); ves.setAttribute("fill-opacity", "0.6"); }
    // small proteins spread into the nucleus by diffusion: a second copy goes in, one stays
    const gOn = started && out.dest === "cytonuc" && st.id === "diffuseNuc";
    ghost.style.display = gOn ? "" : "none";
    if (gOn) {
      const g = along([P.cyto, [300, 150], P.poreOut, P.poreIn, P.nuc2], ease(u));
      ghost.setAttribute("transform", `translate(${g[0]} ${g[1]})`);
      dot.setAttribute("transform", `translate(${P.cyto[0]} ${P.cyto[1]})`);
    }
    if (done && out.dest === "cytonuc") {
      ghost.style.display = "";
      ghost.setAttribute("opacity", "1");
      ghost.setAttribute("transform", `translate(${P.nuc2[0]} ${P.nuc2[1]})`);
      dot.setAttribute("transform", `translate(${P.cyto[0]} ${P.cyto[1]})`);
    } else ghost.setAttribute("opacity", "0.55");
    qMark.style.display = done && out.dest === "unclear" ? "" : "none";
    if (done && out.dest === "unclear") qMark.setAttribute("transform", `translate(${pos[0] + 40} ${pos[1] + 4})`);
    // clock and status
    clock.textContent = started ? `time since translation began: ${fmtTime(s)}   ·   ${speed}× real time` : "";
    if (running) {
      status.textContent = `Step ${k + 1} of ${out.steps.length}: ${st.text}`;
      if (lastK !== k) { lastK = k; showSteps(); }
    } else if (done) status.textContent = `Finished after ${fmtTime(totalTime(out))}.`;
    else status.textContent = prediction ? "Press Run. Time runs at real speed; choose a faster speed if you like." : "Choose a prediction first.";
  }
  let lastK = -1;

  function showSteps() {
    steps.innerHTML = "";
    if (!running && !done) { lastK = -1; return; }
    const { k } = stepAt(t);
    const shown = done ? out.steps.length : k + 1;
    for (let i = 0; i < shown; i++) {
      const s = out.steps[i];
      const li = htmlEl("li", i === k && running ? "zc-now" : "", s.text + " ", steps);
      if (s.dur) htmlEl("span", "zc-t", `(${fmtDur(s.dur)})`, li);
    }
  }

  function showResult() {
    const ok = prediction === out.dest;
    result.hidden = false;
    result.className = "zc-result " + (out.dest === "unclear" ? "zc-unc" : ok ? "zc-ok" : "zc-no");
    let h = `<p><b>Result: ${DEST_NAME[out.dest]}.</b> You predicted: ${prediction ? DEST_NAME[prediction] : "–"} `
      + (ok ? "<b style='color:#2b8a3e'>✓ right</b>" : "<b style='color:#c92a2a'>✗ not this time</b>") + "</p>";
    h += `<p>${out.why}</p>`;
    if (out.topology) h += `<p><i>Topology:</i> ${out.topology}</p>`;
    const ig = Object.entries(out.ignored) as [SignalKey, string][];
    if (ig.length) h += "<p><i>Signals without effect (grey on the protein):</i></p><ul>" + ig.map(([s, w]) => `<li><b>${SIG[s].short}</b>: ${w}</li>`).join("") + "</ul>";
    if (out.dest !== "unclear") h += `<p class="zc-note">Total time on this route: ${fmtDur(totalTime(out))}.</p>`;
    result.innerHTML = h;
  }

  // ---- the protein bar: N-terminus left, C-terminus right
  function drawBar() {
    barSvg.innerHTML = "";
    const y = 62, x0 = 40, x1 = 520;
    const lab = (x: number, yy: number, s: string, col: string, anchor = "middle", size = 17) => {
      const e = svgEl("text", { x, y: yy, "text-anchor": anchor, "font-size": size, fill: col, "font-weight": 700 }, barSvg);
      e.textContent = s;
      return e;
    };
    lab(18, y + 6, "N", C.text);
    lab(542, y + 6, "C", C.text);
    svgEl("line", { x1: x0, x2: x1, y1: y, y2: y, stroke: "#adb5bd", "stroke-width": 10, "stroke-linecap": "round" }, barSvg);
    const ign = (s: SignalKey) => done && s in out.ignored;
    const seg = (s: SignalKey, xa: number, xb: number, labY: number) => {
      const col = ign(s) ? C.grey : SIG[s].color;
      svgEl("rect", { x: xa, y: y - 9, width: xb - xa, height: 18, rx: 4, fill: col, opacity: ign(s) ? 0.5 : 1 }, barSvg);
      const tx = lab((xa + xb) / 2, labY, SIG[s].short, col);
      if (ign(s)) tx.setAttribute("text-decoration", "line-through");
    };
    if (prot.nterm !== "none") seg(prot.nterm, x0, x0 + 90, y + 34);
    if (prot.tm) seg("tm", 250, 290, y + 34);
    if (prot.nls) seg("nls", 170, 215, y - 18);
    if (prot.cterm !== "none") seg(prot.cterm, x1 - 52, x1, y + 34);
    if (prot.m6p) {
      const col = ign("m6p") ? C.grey : C.lys;
      svgEl("path", { d: `M 330 ${y - 6} q 30 -34 60 0`, fill: "none", stroke: col, "stroke-width": 7, "stroke-linecap": "round", opacity: ign("m6p") ? 0.5 : 1 }, barSvg);
      const tx = lab(360, y - 34, "M6P patch", col);
      if (ign("m6p")) tx.setAttribute("text-decoration", "line-through");
    }
    const sz = lab(280, 112, prot.large ? "large protein (> 50 kDa)" : "small protein (27 kDa)", "#495057", "middle", 15);
    sz.setAttribute("font-weight", "400");
    if (!has(prot).length) lab(280, y - 18, "no sorting signal", C.grey, "middle", 15).setAttribute("font-weight", "400");
  }

  presNote.textContent = pre0 ? pre0.note : "";
  if (pre0) presSel.value = pre0.key;
  syncControls(); drawBar(); drawAt(0); syncRun();
});

// ---- static cell cartoon
function drawCell(svg: SVGSVGElement) {
  const g = svgEl("g", { "font-family": "Helvetica, Arial, sans-serif" }, svg);
  const txt = (x: number, y: number, s: string, col: string, size = 16, anchor = "middle") => {
    const e = svgEl("text", { x, y, "font-size": size, fill: col, "text-anchor": anchor, "font-weight": 700 }, g);
    e.textContent = s;
  };
  txt(886, 30, "outside the cell", C.text, 18, "end");
  svgEl("rect", { x: 22, y: 44, width: 780, height: 470, rx: 70, fill: C.cyto, stroke: C.pm, "stroke-width": 6 }, g);
  txt(40, 30, "plasma membrane", C.pm, 18, "start");
  txt(470, 82, "cytosol", "#868e96", 19);
  // nucleus with double membrane and pores
  svgEl("ellipse", { cx: 215, cy: 275, rx: 128, ry: 112, fill: C.nucFill, stroke: C.nuc, "stroke-width": 3 }, g);
  svgEl("ellipse", { cx: 215, cy: 275, rx: 120, ry: 104, fill: "none", stroke: C.nuc, "stroke-width": 2 }, g);
  for (const a of [-95, -140, -40, 160, 120, 60]) {
    const r = a * Math.PI / 180;
    const x = 215 + 124 * Math.cos(r), y = 275 + 108 * Math.sin(r);
    svgEl("circle", { cx: x, cy: y, r: 6, fill: C.cyto, stroke: C.nuc, "stroke-width": 2 }, g);
  }
  txt(200, 350, "nucleus", C.nuc, 21);
  txt(222, 134, "nuclear pore", C.nuc, 16);
  // ER: a crescent of sheets to the right of the nucleus
  const erPath = (r1x: number, r1y: number, r2x: number, r2y: number) => {
    const a0 = -62 * Math.PI / 180, a1 = 62 * Math.PI / 180, cx = 215, cy = 275;
    const p = (rx: number, ry: number, a: number) => `${(cx + rx * Math.cos(a)).toFixed(1)} ${(cy + ry * Math.sin(a)).toFixed(1)}`;
    return `M ${p(r1x, r1y, a0)} A ${r1x} ${r1y} 0 0 1 ${p(r1x, r1y, a1)} L ${p(r2x, r2y, a1)} A ${r2x} ${r2y} 0 0 0 ${p(r2x, r2y, a0)} Z`;
  };
  svgEl("path", { d: erPath(150, 136, 182, 168), fill: C.erFill, stroke: C.er, "stroke-width": 3, "stroke-linejoin": "round" }, g);
  svgEl("path", { d: erPath(188, 174, 204, 190), fill: C.erFill, stroke: C.er, "stroke-width": 2.5, "stroke-linejoin": "round" }, g);
  txt(412, 402, "ER", C.er, 22, "start");
  // Golgi: four curved cisternae, cis facing the ER
  for (let i = 0; i < 4; i++) {
    const x = 520 + i * 26;
    svgEl("path", { d: `M ${x} 238 q -16 62 0 124 l 12 0 q -16 -62 0 -124 z`, fill: C.golgiFill, stroke: C.golgi, "stroke-width": 2.5 }, g);
  }
  txt(568, 224, "Golgi", C.golgi, 21);
  txt(510, 388, "cis", C.golgi, 16);
  txt(614, 388, "trans", C.golgi, 16);
  // endosome and lysosome
  svgEl("circle", { cx: 655, cy: 395, r: 22, fill: C.lysFill, stroke: C.lys, "stroke-width": 2.5 }, g);
  txt(684, 384, "endosome", C.lys, 16, "start");
  svgEl("circle", { cx: 720, cy: 450, r: 30, fill: C.lysFill, stroke: C.lys, "stroke-width": 3 }, g);
  txt(680, 492, "lysosome", C.lys, 19, "end");
  // mitochondrion: outer membrane and folded inner membrane
  svgEl("rect", { x: 228, y: 440, width: 180, height: 60, rx: 30, fill: C.mitoFill, stroke: C.mito, "stroke-width": 3 }, g);
  svgEl("path", { d: "M 250 470 q 0 -20 12 -20 q 12 0 12 20 q 0 20 12 20 q 12 0 12 -20 q 0 -20 12 -20 q 12 0 12 20 q 0 20 12 20 q 12 0 12 -20 q 0 -20 12 -20 q 12 0 12 20 q 0 20 12 20 q 12 0 12 -20",
    fill: "none", stroke: C.mito, "stroke-width": 2 }, g);
  txt(212, 477, "mitochondrion", C.mito, 19, "end");
  // peroxisome
  svgEl("circle", { cx: 652, cy: 120, r: 28, fill: C.pexFill, stroke: C.pex, "stroke-width": 3 }, g);
  txt(652, 84, "peroxisome", C.pex, 19, "middle");
  txt(470, 138, "ribosome", "#495057", 16);
}
