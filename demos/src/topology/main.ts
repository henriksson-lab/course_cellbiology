// Topology builder. The student builds a protein from segments (signal sequence, stop-transfer,
// signal-anchor with its charges before or after, loops, domains), or picks a real example,
// and watches it being made by a ribosome, targeted by SRP, threaded through the translocon
// into the ER membrane, glycosylated, checked, and carried by vesicles to the cell surface.
// The close-up always shows the cytosol on top, so the student sees that the side that faced
// the ER lumen ends up outside the cell. Rules and timeline: model.ts. Time runs at 1× real
// time by default (translation ~5 aa/s; ER, Golgi: minutes), with faster speeds as a choice.
// Options (data-*): example = a1at|ldlr|tfr|cyp3a4|b2ar|glut1|cftr|custom; misfolded = on;
// t = start time in seconds (paused there; for screenshots).
import { autoMount, htmlEl, svgEl, button, checkbox } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import {
  Seg, TmLabel, Topology, Timeline, Placed, Side, Dest, PhaseKey, EXAMPLES, LABEL_NAME, ROLE_NAME, TUNNEL,
  topology, timeline, phaseAt, residuesAt, sideName,
} from "./model";

// ---------------------------------------------------------------- colours (course key)
const INK = "#1b2a3a", CYTO = "#fbfaf5";
const C_SS = "#e8590c", C_SA = "#3b5bdb", C_ST = "#c92a2a", C_SRP = "#f59f00";
const THEME = {
  er: { mem: "#2a7f8f", fill: "#e6f3f5", lum: "ER lumen", memName: "ER membrane" },
  ves1: { mem: "#2a7f8f", fill: "#e6f3f5", lum: "vesicle lumen", memName: "vesicle membrane (from the ER)" },
  golgi: { mem: "#d9822b", fill: "#fbeedd", lum: "Golgi lumen", memName: "Golgi membrane" },
  ves2: { mem: "#d9822b", fill: "#fbeedd", lum: "vesicle lumen", memName: "vesicle membrane (to the surface)" },
  pm: { mem: "#8a6a12", fill: "#dbe7f3", lum: "outside the cell", memName: "plasma membrane" },
};
const SPEEDS = [1, 2, 5, 10, 30, 100, 300];
const STEPS: { keys: PhaseKey[]; label: string }[] = [
  { keys: ["free"], label: "translation" },
  { keys: ["srp"], label: "SRP targeting" },
  { keys: ["trans", "release", "post"], label: "into the membrane" },
  { keys: ["fold"], label: "folding & checks" },
  { keys: ["erad"], label: "ERAD" },
  { keys: ["toGolgi"], label: "to the Golgi" },
  { keys: ["golgi"], label: "Golgi" },
  { keys: ["toPM"], label: "to the surface" },
];

// ---------------------------------------------------------------- close-up geometry
const W = 640, H = 440, MT = 170, MB = 206, PX = 420;
const FREE: P = [200, 92], DOCK: P = [PX, MT - 2];
type P = [number, number];
const NUC: P = [78, 168];   // map of the cell
const MAP = { er: [152, 168] as P, golgi: [206, 196] as P, pm: [289, 246] as P, cyt: [170, 82] as P, erad: [228, 70] as P };
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lp = (a: P, b: P, f: number): P => [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (f: number) => { f = clamp01(f); return f * f * (3 - 2 * f); };
const isTM = (s: Seg) => s.kind === "tm" || s.kind === "ss";
const domD = (len: number) => Math.max(22, Math.min(110, 5.2 * Math.sqrt(len)));
const segW = (s: Seg) => isTM(s) ? 28 : s.kind === "loop" ? Math.max(22, Math.min(60, 10 + s.len * 0.8)) : domD(s.len) + 16;
const tmColor = (p: Placed) => p.role === "ss" ? C_SS : p.role === "st" ? C_ST : C_SA;
const fmtClock = (t: number) => { const s = Math.floor(t); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`; };

// one drawable piece of the chain: TM (a→b line), loop (a, c control, b), domain (a, c centre, b, r)
interface G { kind: "tm" | "loop" | "dom"; a: P; b: P; c: P; r: number; col: string; glyc: number; side: Side | "none"; aFree: boolean; bFree: boolean; p: Placed }

const CSS = `
.qb-demo.tp { display: block; }
.tp .tp-h { font-weight: 700; font-size: .95em; margin: .2em 0 .25em; }
.tp .tp-build { display: flex; flex-direction: column; gap: .45em; }
.tp .tp-row { display: flex; flex-wrap: wrap; gap: .35em; align-items: center; }
.tp .qb-btn { min-height: 36px; }
.tp .tp-add .qb-btn { border-width: 2px; }
.tp .tp-chips { display: flex; flex-wrap: wrap; gap: .3em; align-items: center; min-height: 48px;
  padding: .35em .5em; border: 1px dashed #adb5bd; border-radius: 8px; background: #fff; }
.tp .tp-term { font-weight: 700; color: ${INK}; }
.tp .tp-chip { display: inline-flex; align-items: center; gap: .15em; border: 2px solid #868e96; border-radius: 18px;
  padding: 0 .1em 0 .65em; font-size: .85em; background: #fff; color: ${INK}; min-height: 36px; font: inherit; font-size: .85em; }
.tp .tp-chip-main { cursor: pointer; background: none; border: none; font: inherit; color: inherit; padding: .3em 0; min-height: 34px; }
.tp .tp-chip-x { cursor: pointer; background: none; border: none; font-size: 1.15em; line-height: 1; color: #868e96; min-width: 32px; min-height: 34px; }
.tp .tp-chip-x:hover { color: #c92a2a; }
.tp .tp-views { display: flex; flex-wrap: wrap; gap: 1em; margin-top: .8em; align-items: flex-start; }
.tp .tp-close { flex: 2 1 420px; min-width: 0; max-width: 680px; }
.tp .tp-mapbox { flex: 1 1 220px; min-width: 0; max-width: 300px; }
.tp .tp-svg { display: block; width: 100%; height: auto; border: 1px solid #ccd; border-radius: 6px; background: ${CYTO}; }
.tp .tp-svg text { fill: ${INK}; }
.tp .tp-title { font-weight: 600; font-size: .95em; margin-bottom: .25em; }
.tp .tp-ctrl { margin-top: .6em; }
.tp .tp-select { font: inherit; font-size: .9em; padding: .2em .3em; min-height: 36px; }
.tp .tp-steps { display: flex; flex-wrap: wrap; gap: .25em; font-size: .8em; margin-top: .5em; }
.tp .tp-steps span { padding: .1em .55em; border-radius: 10px; background: #f1f3f5; color: #868e96; }
.tp .tp-steps span.done { color: ${INK}; }
.tp .tp-steps span.on { background: #e8590c; color: #fff; }
.tp .tp-status { margin-top: .4em; min-height: 2.7em; }
.tp .tp-clock { font-family: ui-monospace, monospace; font-size: .85em; color: #555; }
.tp .tp-result { margin-top: .8em; display: flex; flex-direction: column; gap: .45em; }
.tp .tp-cls { font-size: 1.1em; font-weight: 700; }
.tp .tp-table { border-collapse: collapse; font-size: .88em; width: 100%; }
.tp .tp-table th, .tp .tp-table td { text-align: left; padding: .2em .45em; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
.tp .tp-twrap { overflow-x: auto; max-width: 100%; }
.tp .tp-msg { border-left: 4px solid #3b5bdb; padding: .1em .6em; font-size: .9em; }
.tp .tp-msg.warn { border-color: #c92a2a; color: #a61e1e; }
.tp .tp-sw { display: inline-block; width: .8em; height: .8em; border-radius: 2px; vertical-align: -.05em; margin-right: .2em; }
.tp .tp-legend { display: flex; flex-wrap: wrap; gap: .2em 1em; font-size: .85em; margin-top: .3em; }
@media (max-width: 640px) {
  .tp .tp-mapbox { max-width: 240px; flex-basis: 100%; margin: 0 auto; }
  .tp .tp-table { font-size: .8em; }
}`;

function injectStyle() {
  if (document.getElementById("tp-style")) return;
  const st = document.createElement("style");
  st.id = "tp-style"; st.textContent = CSS;
  document.head.appendChild(st);
}

autoMount("topology", host => {
  injectStyle();
  host.classList.add("tp");
  const d = host.dataset;

  // ---------------------------------------------------------------- state
  let ex = EXAMPLES.find(e => e.key === d.example) ?? (d.example === "custom" ? null : EXAMPLES[1]);
  let segs: Seg[] = ex ? ex.segs.map(s => ({ ...s })) : [{ kind: "ss", len: 24 }, { kind: "dom", len: 150 }, { kind: "tm", len: 21, label: "st" }, { kind: "loop", len: 20 }];
  let erResident = ex ? ex.dest === "er" : false;
  let misfolded = false;
  let top: Topology = topology(segs);
  let tl: Timeline = timeline(top, dest(), misfolded);
  let t = 0, speed = 1;

  function dest(): Dest { return erResident ? "er" : "surface"; }

  // ---------------------------------------------------------------- builder UI
  const build = htmlEl("div", "tp-build", "", host);
  htmlEl("div", "tp-h", "Real examples", build);
  const exRow = htmlEl("div", "tp-row", "", build);
  const exBtns = EXAMPLES.map(e => button(exRow, e.label, () => loadExample(e.key)));
  const exText = htmlEl("div", "qb-note", "", build);
  htmlEl("div", "tp-h", "Your protein, N-terminus → C-terminus (tap a TM segment to change its type, × to remove)", build);
  const chips = htmlEl("div", "tp-chips", "", build);
  htmlEl("div", "tp-h", "Add at the C-terminus", build);
  const addRow = htmlEl("div", "tp-row tp-add", "", build);
  const bSS = button(addRow, "+ signal sequence (at the N-terminus)", () => { if (segs[0]?.kind !== "ss") segs.unshift({ kind: "ss", len: 24 }); changed(); });
  bSS.style.borderColor = C_SS;
  button(addRow, "+ stop-transfer", () => addSeg({ kind: "tm", len: 21, label: "st" })).style.borderColor = C_ST;
  button(addRow, "+ signal-anchor, + before", () => addSeg({ kind: "tm", len: 21, label: "saIn" })).style.borderColor = C_SA;
  button(addRow, "+ signal-anchor, + after", () => addSeg({ kind: "tm", len: 21, label: "saOut" })).style.borderColor = C_SA;
  button(addRow, "+ short loop (20 aa)", () => addSeg({ kind: "loop", len: 20 }));
  button(addRow, "+ domain (150 aa)", () => addSeg({ kind: "dom", len: 150 }));
  button(addRow, "Clear", () => { segs = []; changed(); });
  const optRow = htmlEl("div", "tp-row", "", build);
  const cMis = checkbox(optRow, "misfolded (disease mutation)", false, v => { misfolded = v; restart(false); });
  const cRes = checkbox(optRow, "ER-resident (has an ER retention signal)", erResident, v => { erResident = v; ex = null; markExample(); restart(false); });
  const legend = htmlEl("div", "tp-legend", "", build);
  legend.innerHTML = `<span><span class="tp-sw" style="background:${C_SS}"></span>signal sequence</span>`
    + `<span><span class="tp-sw" style="background:${C_SA}"></span>signal-anchor / start-transfer</span>`
    + `<span><span class="tp-sw" style="background:${C_ST}"></span>stop-transfer</span>`
    + `<span><span class="tp-sw" style="background:${C_SRP}"></span>SRP</span>`
    + `<span>sugar tree = N-glycan</span>`;

  // ---------------------------------------------------------------- views
  const views = htmlEl("div", "tp-views", "", host);
  const closeBox = htmlEl("div", "tp-close", "", views);
  const closeTitle = htmlEl("div", "tp-title", "", closeBox);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "tp-svg", role: "img", "aria-label": "Close-up of a membrane with the protein" }, closeBox);
  const mapBox = htmlEl("div", "tp-mapbox", "", views);
  htmlEl("div", "tp-title", "Where it is in the cell", mapBox);
  const map = svgEl("svg", { viewBox: "0 0 300 330", class: "tp-svg", role: "img", "aria-label": "Map of the cell" }, mapBox);

  // static parts of the close-up
  const bgLum = svgEl("rect", { x: 0, y: MB, width: W, height: H - MB }, svg);
  const memBand = svgEl("rect", { x: 0, y: MT, width: W, height: MB - MT, opacity: 0.35 }, svg);
  const memTop = svgEl("line", { x1: 0, x2: W, y1: MT, y2: MT, "stroke-width": 3 }, svg);
  const memBot = svgEl("line", { x1: 0, x2: W, y1: MB, y2: MB, "stroke-width": 3 }, svg);
  const txt = (x: number, y: number, s: string, size = 18, anchor = "start", parent: Element = svg, weight = "normal") => {
    const e = svgEl("text", { x, y, "font-size": size, "text-anchor": anchor, "font-weight": weight }, parent);
    e.textContent = s; return e;
  };
  txt(12, 28, "cytosol", 18, "start", svg, "bold").setAttribute("font-style", "italic");
  const lumLabel = txt(12, H - 14, "", 18, "start", svg, "bold");
  const memLabel = txt(W - 10, MT - 10, "", 16, "end");
  // translocon + SRP receptor
  const translocon = svgEl("g", {}, svg);
  svgEl("rect", { x: PX - 22, y: MT - 6, width: 13, height: MB - MT + 12, rx: 5, fill: "#adb5bd", stroke: INK, "stroke-width": 1.5 }, translocon);
  svgEl("rect", { x: PX + 9, y: MT - 6, width: 13, height: MB - MT + 12, rx: 5, fill: "#adb5bd", stroke: INK, "stroke-width": 1.5 }, translocon);
  const srpR = svgEl("rect", { x: PX - 70, y: MT - 14, width: 26, height: 18, rx: 4, fill: "#ffe8a8", stroke: INK, "stroke-width": 1.5 }, translocon);
  const transLab = txt(PX + 30, MB + 24, "translocon (Sec61)", 16, "start", translocon);
  const srpRLab = txt(PX - 76, MT - 22, "SRP receptor", 16, "end", translocon);
  void srpR;
  const chainG = svgEl("g", {}, svg);
  const ribo = svgEl("g", {}, svg);
  svgEl("line", { x1: -60, x2: 126, y1: -50, y2: -50, stroke: "#868e96", "stroke-width": 3 }, ribo);
  svgEl("ellipse", { cx: 20, cy: -66, rx: 40, ry: 17, fill: "#dee2e6", stroke: INK, "stroke-width": 1.5, "fill-opacity": 0.92 }, ribo);
  svgEl("ellipse", { cx: 14, cy: -27, rx: 50, ry: 27, fill: "#ced4da", stroke: INK, "stroke-width": 1.5, "fill-opacity": 0.92 }, ribo);
  txt(14, -21, "ribosome", 15, "middle", ribo);
  txt(132, -56, "mRNA", 15, "start", ribo).setAttribute("fill", "#555");
  const srp = svgEl("g", {}, svg);
  svgEl("path", { d: "M -4 2 C -30 -4, -58 6, -72 -8 L -66 -18 C -52 -8, -28 -16, 2 -10 Z", fill: C_SRP, stroke: INK, "stroke-width": 1.5 }, srp);
  txt(-74, -24, "SRP", 16, "start", srp, "bold");
  const extraG = svgEl("g", {}, svg);       // proteasome, labels
  const termG = svgEl("g", {}, svg);        // N / C labels on top

  // map
  buildMap();
  const marker = svgEl("g", {}, map);
  const vesicle = svgEl("circle", { r: 13, fill: "none", "stroke-width": 3 }, marker);
  svgEl("circle", { r: 6, fill: "#e8590c", stroke: INK, "stroke-width": 1.2 }, marker);
  const markLab = svgEl("text", { x: 0, y: -14, "font-size": 15, "font-weight": 700, "text-anchor": "middle", stroke: "#fff", "stroke-width": 4, "paint-order": "stroke" }, marker);
  markLab.textContent = "your protein";
  const mapProt = svgEl("g", { opacity: 0 }, map);   // proteasome on the map (ERAD)
  drawProteasome(mapProt, 236, 104, 0.7);

  // ---------------------------------------------------------------- controls
  const ctrl = htmlEl("div", "tp-row tp-ctrl", "", closeBox);
  const bMake = button(ctrl, "▶ Make it (from the start)", () => restart(true));
  bMake.style.fontWeight = "600";
  const bPause = button(ctrl, "Pause", () => { loop.setPaused(!loop.paused); syncPause(); });
  button(ctrl, "Next step ⏭", () => {
    const ph = phaseAt(tl, t);
    if (Number.isFinite(ph.t1)) { t = ph.t1 + 1e-6; loop.redraw(); }
  });
  const spLab = htmlEl("label", "tp-row", "", ctrl);
  spLab.append("time runs at ");
  const sSpeed = htmlEl("select", "tp-select", "", spLab);
  for (const v of SPEEDS) { const o = htmlEl("option", "", v + "× real time", sSpeed); o.value = String(v); }
  sSpeed.value = "1";
  sSpeed.addEventListener("change", () => { speed = Number(sSpeed.value); sSpeed.blur(); });
  const steps = htmlEl("div", "tp-steps", "", closeBox);
  const stepEls = STEPS.map(s => htmlEl("span", "", s.label, steps));
  const status = htmlEl("div", "tp-status", "", closeBox);
  const clock = htmlEl("div", "tp-clock", "", closeBox);
  const result = htmlEl("div", "tp-result", "", host);
  htmlEl("div", "qb-note", "Model: textbook rules for co-translational insertion (signal sequence at the N-terminus; the first TM segment is the signal-anchor, its orientation set by the positive charges; later TM segments alternate stop-transfer and start-transfer). Segment lengths of the examples are rounded; times are typical (translation about 5 amino acids per second; minutes in the ER and the Golgi), the SRP step is illustrative. Drawing not to scale.", host);

  // ---------------------------------------------------------------- builder logic
  function addSeg(s: Seg) { if (segs.length < 30) segs.push(s); changed(); }
  function changed() { ex = null; markExample(); renderChips(); restart(false); }
  function markExample() {
    exBtns.forEach((b, k) => b.classList.toggle("active", ex !== null && EXAMPLES[k] === ex));
    exText.textContent = ex ? ex.text : "Your own protein. Press ▶ Make it, or change the segments first.";
  }
  function loadExample(key: string) {
    ex = EXAMPLES.find(e => e.key === key) ?? null;
    if (!ex) return;
    segs = ex.segs.map(s => ({ ...s }));
    erResident = ex.dest === "er"; cRes.checked = erResident;
    markExample(); renderChips(); restart(false);
  }
  function chipName(s: Seg): string {
    if (s.kind === "ss") return "signal sequence";
    if (s.kind === "tm") return s.label === "st" ? "stop-transfer" : s.label === "saIn" ? "signal-anchor, + before" : "signal-anchor, + after";
    return (s.name ? s.name + ", " : s.kind === "loop" ? "loop, " : "domain, ") + s.len + " aa";
  }
  function renderChips() {
    chips.innerHTML = "";
    htmlEl("span", "tp-term", "N", chips);
    if (!segs.length) htmlEl("span", "qb-note", "(empty: add segments below, or pick an example)", chips);
    segs.forEach((s, i) => {
      const c = htmlEl("span", "tp-chip", "", chips);
      c.style.borderColor = s.kind === "ss" ? C_SS : s.kind === "tm" ? (s.label === "st" ? C_ST : C_SA) : "#868e96";
      const m = htmlEl("button", "tp-chip-main", chipName(s), c);
      m.type = "button";
      if (s.kind === "tm") {
        m.title = "tap to change: stop-transfer → signal-anchor + before → signal-anchor + after";
        m.addEventListener("click", () => {
          const order: TmLabel[] = ["st", "saIn", "saOut"];
          s.label = order[(order.indexOf(s.label ?? "st") + 1) % 3];
          m.blur(); changed();
        });
      } else m.style.cursor = "default";
      const x = htmlEl("button", "tp-chip-x", "×", c);
      x.type = "button"; x.setAttribute("aria-label", "remove " + chipName(s));
      x.addEventListener("click", () => { segs.splice(i, 1); x.blur(); changed(); });
    });
    htmlEl("span", "tp-term", "C", chips);
    bSS.disabled = segs[0]?.kind === "ss";
  }

  function restart(play: boolean) {
    top = topology(segs);
    tl = timeline(top, dest(), misfolded && top.targeted);
    t = 0;
    cMis.disabled = !top.targeted;
    if (play) loop.setPaused(false); else loop.setPaused(true);
    syncPause();
    loop.redraw();
  }
  function syncPause() { bPause.textContent = loop.paused ? "Run" : "Pause"; }

  // ---------------------------------------------------------------- the frame
  function step() {
    if (!segs.length) return;
    const endT = tl.tEnd + 40;
    if (t < endT) t = Math.min(endT, t + speed / 60);
  }

  function render() {
    chainG.innerHTML = ""; termG.innerHTML = ""; extraG.innerHTML = "";
    if (!segs.length) {
      ribo.setAttribute("opacity", "0"); srp.setAttribute("opacity", "0");
      applyTheme("er"); status.textContent = "Add segments, or pick an example."; clock.textContent = ""; result.innerHTML = "";
      return;
    }
    const ph = phaseAt(tl, t);
    const pT = (k: PhaseKey) => tl.phases.find(p => p.key === k);
    const made = residuesAt(tl, top, t);
    const rel = pT("release")!;
    // residues outside the ribosome
    const emerged = t < rel.t0 ? Math.max(0, made - TUNNEL)
      : Math.min(top.total, lerp(Math.max(0, top.total - TUNNEL), top.total, clamp01((t - rel.t0) / (rel.t1 - rel.t0))));
    // anchor (where the newest residue comes out) and the morph from dangling to membrane
    let anchor: P = FREE, tMorph = Infinity;
    const srpP = pT("srp"), postP = pT("post");
    if (srpP) { anchor = lp(FREE, DOCK, ease((t - srpP.t0) / (srpP.t1 - srpP.t0))); tMorph = srpP.t1; }
    else if (postP) { anchor = lp(FREE, DOCK, ease((t - postP.t0) / (postP.t1 - postP.t0))); tMorph = postP.t1; }
    const morph = ease((t - tMorph) / 2);
    // fit the finished protein into the view
    const fit = top.targeted ? ease((t - rel.t0) / (rel.t1 - rel.t0)) : 0;

    // phase-dependent theme
    const theme = !top.targeted ? "er" : ph.key === "toGolgi" ? "ves1" : ph.key === "golgi" ? "golgi" : ph.key === "toPM" ? "ves2"
      : ph.key === "end" && (tl.end === "surface" || tl.end === "secreted") ? "pm" : "er";
    applyTheme(theme);
    const glycState = glycanState(ph.key, t, ph.t0, ph.t1);

    // ribosome and SRP
    const riboOut = ease((t - rel.t0) / (rel.t1 - rel.t0));
    const ra = anchor;
    ribo.setAttribute("transform", `translate(${ra[0]} ${ra[1] - 40 * riboOut})`);
    ribo.setAttribute("opacity", String(1 - riboOut));
    const sigShown = top.targeted && !top.postTranslational && srpP ? (t >= srpP.t0 ? 1 - ease((t - srpP.t1) / 1.5) : 0) : 0;
    srp.setAttribute("transform", `translate(${ra[0]} ${ra[1] + 6 - 30 * ease((t - (srpP?.t1 ?? 0)) / 1.5)})`);
    srp.setAttribute("opacity", String(sigShown));
    const showLabels = ph.key === "free" || ph.key === "srp";
    translocon.setAttribute("opacity", String(top.targeted ? 1 - fit : 1));
    transLab.setAttribute("opacity", showLabels ? "1" : "0");
    srpRLab.setAttribute("opacity", ph.key === "srp" ? "1" : "0");

    // geometry
    const gs = geometry(emerged, anchor, morph, fit, t);
    // fading for ERAD and secretion drift
    let alpha = 1, dy = 0;
    const eradP = pT("erad");
    if (eradP && t >= eradP.t0) alpha = 1 - 0.85 * ease((t - eradP.t0) / (eradP.t1 - eradP.t0));
    if (tl.end === "secreted" && ph.key === "end") dy = 40 * ease((t - tl.tEnd) / 30);
    chainG.setAttribute("opacity", String(alpha));
    chainG.setAttribute("transform", `translate(0 ${dy})`);
    termG.setAttribute("opacity", String(alpha));
    termG.setAttribute("transform", `translate(0 ${dy})`);
    drawChain(gs, glycState);
    drawTermini(gs, emerged);
    if (eradP && t >= eradP.t0) {
      const g = svgEl("g", { opacity: ease((t - eradP.t0) / 60) }, extraG);
      drawProteasome(g, 120, 110, 1);
      txt(120, 160, "proteasome", 16, "middle", g);
    }

    // map
    updateMap(ph.key, t, ph.t0, ph.t1);

    // text
    closeTitle.textContent = `Close-up: ${THEME[theme].memName}, cytosol on top`;
    let st = ph.text;
    if (ph.key === "free" || ph.key === "trans") {
      const cur = top.placed.find(p => made < p.end) ?? top.placed[top.placed.length - 1];
      st += ` Made: ${Math.floor(made)} of ${top.total} amino acids (now segment ${cur.i + 1}: ${chipName(cur.seg)}).`;
    }
    status.textContent = st;
    clock.textContent = `time since translation started: ${fmtClock(t)} · time runs at ${speed}× real time`;
    const curStep = STEPS.findIndex(s => s.keys.includes(ph.key));
    const reached = (k: number) => STEPS[k].keys.some(key => { const p = pT(key); return p && t >= p.t1; });
    stepEls.forEach((el, k) => {
      const exists = STEPS[k].keys.some(key => pT(key));
      el.style.display = exists ? "" : "none";
      el.className = k === curStep ? "on" : reached(k) ? "done" : "";
    });
    renderResult(ph.key, t);
  }

  function applyTheme(k: keyof typeof THEME) {
    const th = THEME[k];
    bgLum.setAttribute("fill", th.fill);
    memBand.setAttribute("fill", th.mem);
    memTop.setAttribute("stroke", th.mem);
    memBot.setAttribute("stroke", th.mem);
    lumLabel.textContent = th.lum;
    memLabel.textContent = th.memName;
  }

  // glycan look: 0 = as transferred (3 glucoses), 1 = glucoses trimmed, 2 = complex (Golgi)
  function glycanState(k: PhaseKey, tt: number, t0: number, t1: number): number {
    if (k === "free" || k === "srp" || k === "trans" || k === "release" || k === "post") return 0;
    if (k === "fold") return (tt - t0) / (t1 - t0) < 0.3 ? 0 : 1;
    if (k === "erad" || k === "toGolgi") return 1;
    if (k === "golgi") return (tt - t0) / (t1 - t0) < 0.5 ? 1 : 2;
    if (k === "end") return tl.end === "er" || tl.end === "erad" ? 1 : 2;
    return 2;
  }

  // ---------------------------------------------------------------- chain geometry
  function geometry(emerged: number, anchor: P, morph: number, fit: number, tt: number): G[] {
    const pl = top.placed;
    const w = pl.map(p => segW(p.seg));
    const u0: number[] = []; let acc = 0;
    for (const x of w) { u0.push(acc); acc += x; }
    const uTotal = acc;
    // frontier in layout units
    let U = 0;
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i];
      if (emerged >= p.end) U = u0[i] + w[i];
      else if (emerged > p.start) U = u0[i] + w[i] * (emerged - p.start) / p.seg.len;
    }
    // fit: once finished, centre the mature protein and squeeze it if it is wide
    const uLeft = top.cleaved ? u0[1] ?? 0 : 0;
    const span = uTotal - uLeft;
    const s = Math.min(1, (W - 170) / Math.max(1, span));
    // while it is being made, squeeze the made part so that it fits left of the ribosome
    const ssFade = top.cleaved ? ease((tt - ssCutTime()) / 8) : 0;
    const uVis0 = lerp(0, uLeft, ssFade);
    const sl = Math.min(1, (anchor[0] - 40) / Math.max(1, U - uVis0));
    const xRaw = (u: number) => anchor[0] - (U - u) * sl;
    const xFit = (u: number) => (W - 170) / 2 + 40 + s * (u - (uLeft + uTotal) / 2);
    const X = (u: number) => lerp(xRaw(u), xFit(u), fit);
    const sc = lerp(Math.max(0.55, sl), Math.max(0.55, s), fit);
    const yLine = anchor[1] + 18;          // dangling chain height (below the ribosome exit)
    const out: G[] = [];
    // cleavage of the signal sequence: once 30 residues have followed it into the lumen
    const ssCut = top.cleaved && emerged > pl[0].end + 30;
    const ssCutT = top.cleaved ? ssCutTime() : Infinity;

    // membrane-layout endpoints of each TM (N-end and C-end)
    const tmEnds: Record<number, { N: P; C: P; x: number }> = {};
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i];
      if (!isTM(p.seg) || emerged <= p.start) continue;
      const frac = Math.min(1, (emerged - p.start) / p.seg.len);
      const x = frac < 1 ? anchor[0] : X(u0[i] + w[i]);
      const top_: P = [x, MT], bot: P = [x, MB];
      const nUp = p.side === "cyt" || p.role === "ss";
      if (frac < 1) {
        const tip: P = [x, MT + (MB - MT) * frac];
        tmEnds[i] = nUp ? { N: top_, C: tip, x } : { N: tip, C: top_, x };
      } else tmEnds[i] = nUp ? { N: top_, C: bot, x } : { N: bot, C: top_, x };
    }
    const sideY = (sd: Side) => sd === "lum" ? MB : MT;
    const sgn = (sd: Side) => sd === "lum" ? 1 : -1;
    const exitPt = (sd: Side): P => sd === "lum" ? [anchor[0], MB] : [anchor[0] - 8, MT - 4];

    for (let i = 0; i < pl.length; i++) {
      const p = pl[i];
      if (emerged <= p.start) break;
      const frac = Math.min(1, (emerged - p.start) / p.seg.len);
      const xa = X(u0[i]), xb = X(u0[i] + w[i] * frac);
      // dangling (cytosol, before docking)
      let dg: G;
      if (isTM(p.seg)) {
        const x2 = Math.min(anchor[0] - 4, xb);
        dg = { kind: "tm", a: [x2 - (xb - xa), yLine], b: [x2, yLine], c: [x2, yLine], r: 0, col: tmColor(p), glyc: 0, side: "none", aFree: false, bFree: false, p };
      } else if (p.seg.kind === "loop") {
        dg = { kind: "loop", a: [xa, yLine], b: [xb, yLine], c: [(xa + xb) / 2, yLine + 22], r: 0, col: INK, glyc: 0, side: "none", aFree: false, bFree: false, p };
      } else {
        const D = domD(p.seg.len) * Math.sqrt(frac);
        dg = { kind: "dom", a: [xa, yLine], b: [xb, yLine], c: [(xa + xb) / 2, yLine + D / 2 + 6], r: D / 2, col: INK, glyc: 0, side: "none", aFree: false, bFree: false, p };
      }
      if (morph <= 0) { out.push(dg); continue; }
      // membrane layout
      let mg: G;
      if (isTM(p.seg)) {
        const e = tmEnds[i];
        mg = { kind: "tm", a: e.N, b: e.C, c: e.N, r: 0, col: tmColor(p), glyc: 0, side: "none", aFree: false, bFree: false, p };
        if (p.role === "ss" && ssCut) {
          // cut off: drift left in the membrane and fade (degraded)
          const f = ease((tt - ssCutT) / 8);
          mg.a = [e.N[0] - 30 * f, e.N[1]]; mg.b = [e.C[0] - 30 * f, e.C[1]];
          mg.col = f >= 1 ? "none" : C_SS;
          mg.r = 1 - f;  // used as opacity for the cut signal sequence
        }
      } else {
        const sd = p.side;
        const prev = i > 0 ? tmEnds[i - 1] : undefined;
        const prevIsSS = i > 0 && pl[i - 1].role === "ss";
        const next = tmEnds[i + 1];
        let a: P, b: P, aFree = false, bFree = false;
        if (prev && !(prevIsSS && ssCut)) a = prev.C;
        else { a = [xa, sideY(sd) + sgn(sd) * 10]; aFree = true; if (prevIsSS && ssCut && prev) a = [prev.x, sideY(sd) + sgn(sd) * 10]; }
        if (frac < 1) b = exitPt(sd);
        else if (next) b = next.N;
        else if (i === pl.length - 1 || emerged <= pl[i + 1].start) {
          if (i === pl.length - 1) { b = [Math.min(anchor[0], X(u0[i] + w[i])), sideY(sd) + sgn(sd) * 10]; bFree = true; }
          else b = exitPt(sd);
        } else b = exitPt(sd);
        if (p.seg.kind === "loop") {
          const depth = (6 + Math.min(64, p.seg.len * 1.1)) * Math.min(1, frac * 1.5) * sc;
          const cx = (a[0] + b[0]) / 2;
          let c: P = [cx, sideY(sd) + sgn(sd) * 2 * depth];
          if (aFree) { a = [b[0] - Math.max(18, w[i] * sc), sideY(sd) + sgn(sd) * depth]; c = [(a[0] + b[0]) / 2, sideY(sd) + sgn(sd) * depth * 1.4]; }
          if (bFree) { b = [a[0] + Math.max(18, w[i] * sc), sideY(sd) + sgn(sd) * depth]; c = [(a[0] + b[0]) / 2, sideY(sd) + sgn(sd) * depth * 1.4]; }
          mg = { kind: "loop", a, b, c, r: 0, col: INK, glyc: p.glycans, side: sd, aFree, bFree, p };
        } else {
          const D = domD(p.seg.len) * Math.sqrt(frac) * sc;
          let cx = (a[0] + b[0]) / 2;
          if (aFree) cx = b[0] - D / 2 - 10;
          if (bFree) cx = a[0] + D / 2 + 10;
          if (frac < 1 && sd === "lum") cx = Math.min(cx, anchor[0] - D / 2 - 4);
          if (sd === "cyt" && fit === 0) cx = Math.min(cx, anchor[0] - D / 2 - 44);   // keep clear of the ribosome
          const c: P = [cx, sideY(sd) + sgn(sd) * (D / 2 + 16)];
          if (aFree) a = [cx - D / 2 - 4, sideY(sd) + sgn(sd) * 8];
          if (bFree) b = [cx + D / 2 + 4, sideY(sd) + sgn(sd) * 8];
          mg = { kind: "dom", a, b, c, r: D / 2, col: INK, glyc: p.glycans, side: sd, aFree, bFree, p };
        }
      }
      if (morph >= 1) { out.push(mg); continue; }
      out.push({ ...mg, a: lp(dg.a, mg.a, morph), b: lp(dg.b, mg.b, morph), c: lp(dg.c, mg.c, morph), r: lerp(dg.r, mg.r, morph), glyc: morph > 0.9 ? mg.glyc : 0 });
    }
    // glycans only once the chain is in the lumen, at the translocon (after docking)
    if (morph < 1) for (const g of out) g.glyc = morph > 0.9 ? g.glyc : 0;
    return out;
  }

  // time at which the signal sequence is cut (30 residues after it emerged into the lumen)
  function ssCutTime(): number {
    const target = top.placed[0].end + 30 + TUNNEL;   // residues made
    if (target >= top.total) return tl.phases.find(p => p.key === "release")!.t0;
    return tl.tDock + (target - tl.targetRes) / 5;
  }

  function drawChain(gs: G[], glycState: number) {
    // loops and stalks first, then TMs, then domain blobs, then glycans
    for (const g of gs) {
      if (g.kind === "loop") svgEl("path", { d: `M${g.a[0]},${g.a[1]} Q${g.c[0]},${g.c[1]} ${g.b[0]},${g.b[1]}`, fill: "none", stroke: INK, "stroke-width": 3, "stroke-linecap": "round" }, chainG);
      if (g.kind === "dom") svgEl("path", { d: `M${g.a[0]},${g.a[1]} L${g.c[0]},${g.c[1]} L${g.b[0]},${g.b[1]}`, fill: "none", stroke: INK, "stroke-width": 3, "stroke-linejoin": "round" }, chainG);
    }
    for (const g of gs) {
      if (g.kind !== "tm" || g.col === "none") continue;
      const e = svgEl("line", { x1: g.a[0], y1: g.a[1], x2: g.b[0], y2: g.b[1], stroke: g.col, "stroke-width": 13, "stroke-linecap": "round" }, chainG);
      if (g.p.role === "ss" && g.r > 0 && g.r < 1) e.setAttribute("opacity", String(g.r));
    }
    for (const g of gs) {
      if (g.kind !== "dom" || g.r <= 0) continue;
      svgEl("circle", { cx: g.c[0], cy: g.c[1], r: g.r, fill: "#dee2e6", stroke: INK, "stroke-width": 2 }, chainG);
      if (g.r > 40 && g.p.seg.name) {
        // name inside a big domain, shortened
        const words = g.p.seg.name.split(" ");
        const lines = g.p.seg.name.length * 7 > 1.7 * g.r && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [g.p.seg.name];
        lines.forEach((ln, k) => txt(g.c[0], g.c[1] + 5 + (k - (lines.length - 1) / 2) * 16, ln, 13, "middle", chainG));
      }
    }
    for (const g of gs) {
      if (!g.glyc || g.side !== "lum") continue;
      const n = g.glyc;
      if (g.kind === "dom") {
        // spread around the lower half of the domain, pointing away from it
        const step = Math.min(40, 120 / n);
        for (let k = 0; k < n; k++) {
          const ang = (90 + (k - (n - 1) / 2) * step) * Math.PI / 180;
          drawGlycan(chainG, g.c[0] + g.r * Math.cos(ang), g.c[1] + g.r * Math.sin(ang), glycState, ang * 180 / Math.PI - 90);
        }
      } else {
        const base: P = [0.25 * g.a[0] + 0.5 * g.c[0] + 0.25 * g.b[0], 0.25 * g.a[1] + 0.5 * g.c[1] + 0.25 * g.b[1]];
        for (let k = 0; k < n; k++) drawGlycan(chainG, base[0] + (k - (n - 1) / 2) * 14, base[1], glycState, 0);
      }
    }
  }

  function drawTermini(gs: G[], emerged: number) {
    const mature = gs.filter(g => g.p.role !== "ss");
    if (!mature.length) {
      const ss = gs.find(g => g.p.role === "ss");
      if (ss) { const gg = svgEl("g", { transform: `translate(${ss.a[0] - 14} ${ss.a[1]})` }, termG); svgEl("circle", { r: 12, fill: "#fff", stroke: INK, "stroke-width": 2 }, gg); const e = svgEl("text", { y: 5.5, "font-size": 16, "font-weight": 700, "text-anchor": "middle" }, gg); e.textContent = "N"; }
      return;
    }
    const first = mature[0], last = mature[mature.length - 1];
    const lab = (pt: P, s: string, dir: number) => {
      const g = svgEl("g", { transform: `translate(${pt[0]} ${pt[1] + dir * 14})` }, termG);
      svgEl("circle", { r: 12, fill: "#fff", stroke: INK, "stroke-width": 2 }, g);
      const e = svgEl("text", { y: 5.5, "font-size": 16, "font-weight": 700, "text-anchor": "middle" }, g);
      e.textContent = s;
    };
    const endDir = (g: G, end: "N" | "C"): number => {
      if (g.side === "none") return 1;
      return g.side === "lum" ? 1 : -1;
    };
    const tmDir = (pt: P) => pt[1] >= (MT + MB) / 2 ? 1 : -1;
    // N-terminus: free end of the first mature piece (or the ss start before cleavage)
    const ssG = gs.find(g => g.p.role === "ss" && g.col !== "none");
    if (ssG && first.aFree === false && first.kind !== "tm") lab(ssG.a, "N", tmDir(ssG.a));
    else if (first.kind === "tm") lab(first.a, "N", first.side === "none" ? 1 : tmDir(first.a));
    else lab(first.side === "none" ? [first.a[0] - 4, first.a[1]] : first.a, "N", first.side === "none" ? 0 : endDir(first, "N"));
    if (emerged >= top.total - 0.01) {
      if (last.kind === "tm") lab(last.b, "C", last.side === "none" ? 1 : tmDir(last.b));
      else lab(last.side === "none" ? [last.b[0] + 4, last.b[1]] : last.b, "C", last.side === "none" ? 0 : endDir(last, "C"));
    }
  }

  // ---------------------------------------------------------------- map of the cell
  function buildMap() {
    svgEl("rect", { x: 0, y: 0, width: 300, height: 330, fill: "#dbe7f3" }, map);
    svgEl("rect", { x: 8, y: 8, width: 281, height: 314, rx: 40, fill: CYTO, stroke: "#8a6a12", "stroke-width": 4 }, map);
    // ER: cisternae around the nucleus (right side), continuous with the nuclear envelope
    for (const r of [62, 74, 86]) {
      const a0 = -72 * Math.PI / 180, a1 = 72 * Math.PI / 180;
      svgEl("path", { d: `M ${NUC[0] + r * Math.cos(a0)},${NUC[1] + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${NUC[0] + r * Math.cos(a1)},${NUC[1] + r * Math.sin(a1)}`, fill: "none", stroke: "#2a7f8f", "stroke-width": 5, "stroke-linecap": "round", opacity: 0.85 }, map);
    }
    svgEl("circle", { cx: NUC[0], cy: NUC[1], r: 50, fill: "#efebf7", stroke: "#6b4fa0", "stroke-width": 3 }, map);
    const t1 = svgEl("text", { x: NUC[0], y: NUC[1] + 5, "font-size": 15, "text-anchor": "middle" }, map); t1.textContent = "nucleus";
    // Golgi stack
    for (let k = 0; k < 4; k++)
      svgEl("path", { d: `M ${190 + k * 9},${170 - k * 3} q 20 26 0 54`, fill: "none", stroke: "#d9822b", "stroke-width": 5, "stroke-linecap": "round" }, map);
    const lab = (x: number, y: number, s: string, col: string, anchor = "start") => {
      const e = svgEl("text", { x, y, "font-size": 15, "font-weight": 700, "text-anchor": anchor }, map); e.textContent = s; e.style.fill = col;
    };
    lab(112, 276, "ER", "#2a7f8f");
    lab(192, 246, "Golgi", "#b5651d");
    lab(272, 32, "plasma membrane", "#8a6a12", "end");
    lab(150, 308, "cytosol", INK);
  }
  function updateMap(k: PhaseKey, tt: number, t0: number, t1: number) {
    const f = Number.isFinite(t1) ? ease((tt - t0) / (t1 - t0)) : 1;
    let pos: P = MAP.er, ves = "none";
    if (!top.targeted) pos = MAP.cyt;
    else if (k === "free" || k === "srp" || (k === "release" && top.postTranslational)) pos = k === "srp" ? lp(MAP.cyt, MAP.er, f) : MAP.cyt;
    else if (k === "post") pos = lp(MAP.cyt, MAP.er, f);
    else if (k === "toGolgi") { pos = lp(MAP.er, MAP.golgi, f); ves = "#2a7f8f"; }
    else if (k === "golgi") pos = MAP.golgi;
    else if (k === "toPM") { pos = lp(MAP.golgi, MAP.pm, f); ves = "#d9822b"; }
    else if (k === "erad") pos = lp(MAP.er, MAP.erad, f);
    else if (k === "end") {
      if (tl.end === "surface") pos = MAP.pm;
      else if (tl.end === "secreted") pos = lp(MAP.pm, [295, 300], ease((tt - tl.tEnd) / 30));
      else if (tl.end === "erad") pos = MAP.erad;
      else if (tl.end === "cytosol") pos = MAP.cyt;
    }
    marker.setAttribute("transform", `translate(${pos[0]} ${pos[1]})`);
    vesicle.setAttribute("stroke", ves);
    // label above the marker, kept inside the cell
    markLab.setAttribute("x", String(Math.max(60, Math.min(235, pos[0])) - pos[0]));
    markLab.setAttribute("y", "-14");
    const eradOn = k === "erad" || (k === "end" && tl.end === "erad");
    mapProt.setAttribute("opacity", eradOn ? "1" : "0");
    marker.setAttribute("opacity", k === "end" && tl.end === "erad" ? "0.3" : "1");
  }

  // ---------------------------------------------------------------- result panel
  let lastResultKey = "";
  function renderResult(k: PhaseKey, tt: number) {
    const inMembrane = top.targeted && (k !== "free" && k !== "srp" && k !== "trans" && !(k === "release" && tt < tl.phases.find(p => p.key === "release")!.t1 - 0.01) && k !== "post");
    const atSurface = k === "end" && (tl.end === "surface" || tl.end === "secreted");
    const pastGolgi = (() => { const g = tl.phases.find(p => p.key === "golgi"); return !!g && tt >= (g.t0 + g.t1) / 2; })();
    const key = `${inMembrane}|${atSurface}|${pastGolgi}|${k === "end"}|${segs.length}|${JSON.stringify(segs)}|${misfolded}|${erResident}`;
    if (key === lastResultKey) return;
    lastResultKey = key;
    result.innerHTML = "";
    htmlEl("div", "tp-h", "Result", result);
    for (const w of top.warn) htmlEl("div", "tp-msg warn", w, result);
    if (!top.targeted) {
      htmlEl("div", "tp-cls", top.cls, result);
      htmlEl("div", "", "Without a signal sequence or a hydrophobic segment, SRP never binds: the ribosome stays free and the protein stays in the cytosol.", result);
      return;
    }
    if (!inMembrane && !(k === "end")) {
      htmlEl("div", "", "Predict first: which segment will SRP bind? Which way will each TM segment face? Where will the N- and C-terminus be at the end? The answer appears when the protein is in the ER.", result);
      return;
    }
    htmlEl("div", "tp-cls", top.cls, result);
    const fin: "er" | "surface" = atSurface ? "surface" : "er";
    const where = top.secreted ? "" : ` N-terminus: <b>${sideName(top.nSide, fin)}</b>; C-terminus: <b>${sideName(top.cSide, fin)}</b>`
      + (atSurface ? ` (in the ER: ${sideName(top.nSide, "er")} and ${sideName(top.cSide, "er")}).`
        : tl.end === "er" || tl.end === "erad" ? ". (It does not reach the surface; if it did, its ER-lumen side would face the outside of the cell.)"
        : ". At the cell surface the ER-lumen side will face the outside of the cell.");
    const p1 = htmlEl("div", "", "", result);
    p1.innerHTML = (top.secreted ? "No TM segment: the whole chain went into the lumen, and it leaves the cell by secretion." : `${top.nTM} TM segment${top.nTM > 1 ? "s" : ""}.`) + where;
    const tw = htmlEl("div", "tp-twrap", "", result);
    const tb = htmlEl("table", "tp-table", "", tw);
    tb.innerHTML = `<thead><tr><th>#</th><th>segment (your name)</th><th>what it did</th><th>side in the ER</th><th>${atSurface ? "at the cell surface" : "later, at the surface"}</th></tr></thead>`;
    const body = htmlEl("tbody", "", "", tb);
    for (const p of top.placed) {
      const tr = htmlEl("tr", "", "", body);
      const did = p.role ? ROLE_NAME[p.role] : p.side === "lum" ? `in the lumen${p.glycans ? `, ${p.glycans} N-glycan${p.glycans > 1 ? "s" : ""}` : ""}` : "in the cytosol";
      const side = (fin2: "er" | "surface") => p.role === "ss" ? "cut off" : isTM(p.seg) ? `membrane (N-end: ${sideName(p.side, fin2)})` : sideName(p.side, fin2);
      const name = p.seg.kind === "tm" ? LABEL_NAME[p.seg.label ?? "st"] : chipName(p.seg);
      tr.innerHTML = `<td>${p.i + 1}</td><td>${name}</td><td>${did}</td><td>${side("er")}</td><td>${top.secreted || tl.end === "er" || tl.end === "erad" ? "–" : side("surface")}</td>`;
    }
    for (const n of top.notes) htmlEl("div", "tp-msg", n, result);
    // experiments
    const cyt = top.placed.filter(p => !isTM(p.seg) && p.side === "cyt").reduce((a, p) => a + p.seg.len, 0);
    const lum = top.placed.filter(p => !isTM(p.seg) && p.side === "lum").reduce((a, p) => a + p.seg.len, 0);
    const gly = top.placed.reduce((a, p) => a + p.glycans, 0);
    const exp = htmlEl("div", "tp-msg", "", result);
    exp.innerHTML = `<b>Topology tests.</b> Protease added outside sealed ER vesicles (microsomes) cuts the cytosolic parts: <b>${cyt} aa</b> exposed, <b>${lum} aa</b> protected in the lumen. `
      + (gly ? `N-glycans: <b>${gly}</b>, all on the lumen side. Endo H (cuts only ER-type glycans): <b>${pastGolgi ? "resistant" : "sensitive"}</b>${pastGolgi ? " (the glycans were rebuilt in the Golgi)" : " (the protein has not yet passed the Golgi)"}.`
        : "No N-glycans: Endo H has nothing to cut.");
    if (misfolded && ex?.misfoldText) htmlEl("div", "tp-msg warn", ex.misfoldText, result);
    else if (misfolded) htmlEl("div", "tp-msg warn", "Misfolded: ER quality control keeps it in the ER and ERAD degrades it, whatever its topology.", result);
  }

  // ---------------------------------------------------------------- start
  const loop = visibleLoop(svg, 1 / 60, step, render);
  markExample(); renderChips();
  if (d.misfolded === "on") { misfolded = true; cMis.checked = true; }
  restart(false);
  if (d.t) { t = Number(d.t) || 0; loop.redraw(); }   // start at a given time (for screenshots and slides)
});

// ---------------------------------------------------------------- small glyphs
// N-glycan in the symbol nomenclature for glycans (SNFG): GlcNAc blue square, mannose green
// circle, glucose blue circle, galactose yellow circle, sialic acid purple diamond.
function drawGlycan(parent: Element, x: number, y: number, state: number, rot: number) {
  const g = svgEl("g", { transform: `translate(${x} ${y}) rotate(${rot.toFixed(1)}) scale(0.85)` }, parent);
  const sq = (cx: number, cy: number) => svgEl("rect", { x: cx - 3.5, y: cy - 3.5, width: 7, height: 7, fill: "#0072bc", stroke: INK, "stroke-width": 0.8 }, g);
  const ci = (cx: number, cy: number, col: string) => svgEl("circle", { cx, cy, r: 3.6, fill: col, stroke: INK, "stroke-width": 0.8 }, g);
  const di = (cx: number, cy: number) => svgEl("path", { d: `M${cx},${cy - 4.5} L${cx + 4.5},${cy} L${cx},${cy + 4.5} L${cx - 4.5},${cy} Z`, fill: "#a54399", stroke: INK, "stroke-width": 0.8 }, g);
  svgEl("path", { d: state === 2 ? "M0,0 V22 M0,22 L-7,30 V46 M0,22 L7,30 V46" : "M0,0 V22 M0,22 L-7,30 V38 M0,22 L7,30 V38" + (state === 0 ? " M-7,38 V58" : ""), stroke: INK, "stroke-width": 1, fill: "none" }, g);
  sq(0, 6); sq(0, 14); ci(0, 22, "#00a651");
  if (state === 2) { sq(-7, 30); sq(7, 30); ci(-7, 38, "#ffd400"); ci(7, 38, "#ffd400"); di(-7, 46); di(7, 46); }
  else {
    ci(-7, 30, "#00a651"); ci(7, 30, "#00a651"); ci(-7, 38, "#00a651"); ci(7, 38, "#00a651");
    if (state === 0) { ci(-7, 45, "#0072bc"); ci(-7, 52, "#0072bc"); ci(-7, 59, "#0072bc"); }
  }
}

function drawProteasome(parent: Element, x: number, y: number, s: number) {
  const g = svgEl("g", { transform: `translate(${x} ${y}) scale(${s})` }, parent);
  for (let k = 0; k < 4; k++) svgEl("rect", { x: -26, y: -24 + k * 12, width: 52, height: 11, rx: 4, fill: k === 0 || k === 3 ? "#868e96" : "#adb5bd", stroke: INK, "stroke-width": 1.2 }, g);
}
