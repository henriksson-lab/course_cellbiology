// GPCR cascade: a hormone pulse acts through a Gs-coupled receptor → Gαs → adenylyl cyclase →
// cAMP → PKA. The whole 10-minute run is computed at once (model.ts) and drawn as stacked time
// courses, so every slider change shows its consequence immediately. A time cursor drives a
// schematic of the cell; "Play" moves the cursor at 1× real time by default (faster on request),
// or the student drags it along the plots. An amplification table gives molecules per cell at
// each step. Grey curves: a normal cell given the same pulse, for comparison.
// Options (data-*): preset = normal|long|slowgtp|fastgtp|ctx|pde|blocker|blocker100; t = cursor time (s).
import { autoMount, htmlEl, svgEl, slider, button, checkbox, presets, rng, svgPoint, Slider } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import * as M from "./model";
import { CSS } from "./style";

const COL = {
  ink: "#1b2a3a", hormone: "#1971c2", rec: "#5f3dc4", des: "#868e96", gα: "#c77c02", gαOn: "#fcc419",
  camp: "#2f9e44", pka: "#0b7285", drug: "#e8590c", ref: "#c3c9cf",
  mem: "#8a6a12", memFill: "#f6f0de", out: "#eef4fa", cyt: "#fbfaf5",
};
const SPEEDS = [1, 2, 5, 10, 30];

// ---- presets
const PRESETS: { key: string; label: string; p: Partial<M.Params>; text: string }[] = [
  { key: "normal", label: "Normal cell, 1 min pulse", p: {},
    text: "A 1-minute pulse of hormone at 10 × K_d. Watch each step switch on, then off again after the pulse." },
  { key: "long", label: "Long exposure (5 min)", p: { duration: 300 },
    text: "The hormone stays for 5 minutes. GRK and arrestin desensitise the receptors: the response fades although the hormone is still there." },
  { key: "slowgtp", label: "Slow GTPase", p: { kGTP: 0.01 },
    text: "Gα hydrolyses its GTP five times more slowly. The signal lasts long after the hormone has gone." },
  { key: "fastgtp", label: "Fast GTPase (as with an RGS protein)", p: { kGTP: 1 },
    text: "Gα hydrolyses GTP within about a second (RGS proteins do this for many Gi and Gq pathways). Each Gα is active only briefly: the signal is weak and fast." },
  { key: "ctx", label: "Cholera toxin", p: { ctx: true },
    text: "Cholera toxin has modified every Gαs (ADP-ribosylation): it cannot hydrolyse GTP. Once on, Gαs stays on, even after the hormone is gone." },
  { key: "pde", label: "PDE inhibitor (theophylline)", p: { pdeInhib: true },
    text: "A PDE inhibitor (theophylline, or caffeine at high doses) cuts phosphodiesterase activity to a third. cAMP rises higher and falls more slowly." },
  { key: "blocker", label: "β-blocker", p: { blocker: true },
    text: "A β-blocker (competitive antagonist) at 100 × its K_B occupies most receptors without activating them." },
  { key: "blocker100", label: "β-blocker + 10 × more hormone", p: { blocker: true, dose: 100 },
    text: "The same β-blocker, but 10 times more hormone. A competitive antagonist can be outcompeted." },
];

const fmtN = (v: number) => {
  if (v >= 1e9) return +(v / 1e9).toPrecision(2) + " billion";
  if (v >= 1e6) return +(v / 1e6).toPrecision(2) + " million";
  if (v >= 1000) return String(Math.round(v / (v >= 1e4 ? 1000 : 100)) * (v >= 1e4 ? 1000 : 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return Math.round(v).toString();
};
const fmtGain = (v: number) => v >= 10 ? "× " + Math.round(v) : v >= 1 ? "× " + v.toFixed(1) : "× " + v.toFixed(2);
const fmtDose = (v: number) => v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
const fmtRate = (v: number) => v >= 0.1 ? v.toFixed(2) : v.toFixed(3);
const halfLife = (k: number) => k > 0 ? Math.LN2 / k : Infinity;
const fmtHalf = (s: number) => !isFinite(s) ? "never" : s >= 100 ? Math.round(s) + " s" : s >= 10 ? s.toFixed(0) + " s" : s.toFixed(1) + " s";

function injectCSS() {
  if (document.getElementById("gc-style")) return;
  const st = document.createElement("style");
  st.id = "gc-style";
  st.textContent = CSS;
  document.head.appendChild(st);
}

autoMount("gpcrcascade", host => {
  injectCSS();
  host.classList.add("gc");
  const d = host.dataset;
  const p0 = PRESETS.find(p => p.key === d.preset) ?? PRESETS[0];
  let p: M.Params = { ...M.DEFAULTS, ...p0.p };
  let run = M.simulate(p), ref = M.simulate(refParams(p));
  let t = Math.max(0, Math.min(M.T_END, Number(d.t) || 0)), playing = false, speed = 1, showRef = true;

  function refParams(q: M.Params): M.Params { return { ...M.DEFAULTS, dose: q.dose, duration: q.duration }; }

  // ================= main column
  const main = htmlEl("div", "gc-main", "", host);
  const bar = htmlEl("div", "gc-bar", "", main);
  const bPlay = button(bar, "▶ Play", () => setPlaying(!playing), "gc-play");
  const spLab = htmlEl("label", "gc-speed", "", bar);
  const sSpeed = htmlEl("select", "", "", spLab);
  for (const v of SPEEDS) { const o = htmlEl("option", "", v + "× real time", sSpeed); o.value = String(v); }
  sSpeed.value = "1";
  sSpeed.addEventListener("change", () => { speed = Number(sSpeed.value); sSpeed.blur(); });
  button(bar, "⟲ Back to 0 s", () => { t = 0; setPlaying(false); draw(); });
  const clock = htmlEl("span", "gc-clock", "", bar);

  // ---- schematic
  const SW = 640, SHt = 300, MY0 = 74, MY1 = 104;
  const sch = svgEl("svg", { viewBox: `0 0 ${SW} ${SHt}`, class: "gc-sch", role: "img",
    "aria-label": "Schematic of the cell at the cursor time: receptors in the membrane, G proteins, adenylyl cyclase, cAMP and PKA" }, main);
  svgEl("rect", { x: 0, y: 0, width: SW, height: MY0, fill: COL.out }, sch);
  svgEl("rect", { x: 0, y: MY1, width: SW, height: SHt - MY1, fill: COL.cyt }, sch);
  svgEl("rect", { x: 0, y: MY0, width: SW, height: MY1 - MY0, fill: COL.memFill }, sch);
  svgEl("line", { x1: 0, x2: SW, y1: MY0, y2: MY0, stroke: COL.mem, "stroke-width": 2 }, sch);
  svgEl("line", { x1: 0, x2: SW, y1: MY1, y2: MY1, stroke: COL.mem, "stroke-width": 2 }, sch);
  const lab = (x: number, y: number, s: string, anchor = "start", size = 14, fill = COL.ink, bold = false) => {
    const e = svgEl("text", { x, y, "font-size": size, "text-anchor": anchor, "font-weight": bold ? 700 : 400 }, sch);
    e.style.fill = fill; e.textContent = s; return e;
  };
  lab(8, 18, "outside", "start", 13, "#5c6b7a");
  lab(SW - 8, SHt - 8, "cytosol", "end", 13, "#5c6b7a");
  const R = rng(7);

  // hormone and blocker molecules outside (fixed seeded positions)
  const NH = 14, NB = 10;
  const hormoneDots = Array.from({ length: NH }, (_, i) => {
    const x = 70 + (i + R.unif() * 0.8) * (520 / NH), y = 16 + R.unif() * 44;
    return svgEl("circle", { cx: x, cy: y, r: 5, fill: COL.hormone, class: "gc-fade" }, sch);
  });
  const blockerDots = Array.from({ length: NB }, (_, i) => {
    const x = 80 + (i + R.unif() * 0.8) * (500 / NB), y = 18 + R.unif() * 40;
    return svgEl("rect", { x: x - 4.5, y: y - 4.5, width: 9, height: 9, fill: COL.drug, transform: `rotate(45 ${x} ${y})`, class: "gc-fade" }, sch);
  });

  // receptors (6): 7 helices crossing the membrane
  const NR = 6;
  const recX = Array.from({ length: NR }, (_, i) => 34 + i * 40);
  const recs = recX.map(x => {
    const g = svgEl("g", {}, sch);
    const body = svgEl("rect", { x: x - 14, y: MY0 - 8, width: 28, height: MY1 - MY0 + 16, rx: 6, stroke: COL.ink, "stroke-width": 1.5, class: "gc-col" }, g);
    for (let k = 1; k < 7; k++) svgEl("line", { x1: x - 14 + k * 4, x2: x - 14 + k * 4, y1: MY0 - 4, y2: MY1 + 4, stroke: COL.ink, "stroke-opacity": 0.35 }, g);
    const lig = svgEl("circle", { cx: x, cy: MY0 - 14, r: 5.5, fill: COL.hormone, class: "gc-fade" }, g);
    const blk = svgEl("rect", { x: x - 5, y: MY0 - 19, width: 10, height: 10, fill: COL.drug, transform: `rotate(45 ${x} ${MY0 - 14})`, class: "gc-fade" }, g);
    const pho = svgEl("g", { class: "gc-fade" }, g);
    svgEl("circle", { cx: x + 12, cy: MY1 + 14, r: 7, fill: "#fff", stroke: COL.ink, "stroke-width": 1.2 }, pho);
    const pt = svgEl("text", { x: x + 12, y: MY1 + 18.5, "font-size": 11, "text-anchor": "middle", "font-weight": 700 }, pho); pt.textContent = "P";
    const arr = svgEl("path", { d: `M${x - 13},${MY1 + 12} q13,22 26,0 l-5,0 q-8,12 -16,0 z`, fill: "#495057", class: "gc-fade" }, g);
    return { body, lig, blk, pho, arr };
  });
  lab(recX[0] - 14, MY1 + 64, "receptors (GPCR)", "start", 14);
  lab(recX[0] - 14, MY1 + 80, "P + arrestin = desensitised", "start", 13, "#5c6b7a");

  // G proteins (10) under the membrane
  const NG = 10, GX0 = 282, GDX = 26;
  const gps = Array.from({ length: NG }, (_, i) => {
    const x = GX0 + i * GDX;
    const bg = svgEl("ellipse", { cx: x + 6, cy: MY1 + 10, rx: 7, ry: 6, fill: "#495057" }, sch);
    const g = svgEl("g", { class: "gc-move" }, sch);
    const a = svgEl("ellipse", { cx: x, cy: MY1 + 13, rx: 10, ry: 8, stroke: COL.ink, "stroke-width": 1.2, class: "gc-col" }, g);
    const tox = svgEl("rect", { x: x - 4, y: MY1 + 9, width: 8, height: 8, fill: COL.drug, stroke: COL.ink, "stroke-width": 1, transform: `rotate(45 ${x} ${MY1 + 13})`, class: "gc-fade" }, g);
    return { bg, g, a, tox };
  });
  lab(GX0 - 10, MY1 + 64, "Gαs (yellow = GTP, on)", "start", 14);
  const gLab2 = lab(GX0 - 10, MY1 + 80, "dark = βγ", "start", 13, "#5c6b7a");

  // adenylyl cyclase (2)
  const acs = [560, 604].map(x => {
    const r = svgEl("rect", { x: x - 15, y: MY0 - 6, width: 30, height: MY1 - MY0 + 22, rx: 7, stroke: COL.ink, "stroke-width": 1.5, class: "gc-col" }, sch);
    return r;
  });
  lab(582, MY0 - 12, "adenylyl cyclase", "middle", 13);

  // cAMP (up to 48 dots) in the cytosol
  const NC = 48;
  const campDots = Array.from({ length: NC }, () => {
    const x = 262 + R.unif() * 330, y = MY1 + 120 + R.unif() * 64;
    return svgEl("circle", { cx: x, cy: y, r: 3.6, fill: COL.camp, class: "gc-fade" }, sch);
  });
  const campLab = lab(262, MY1 + 108, "cAMP", "start", 14, COL.camp, true);

  // PKA (4 holoenzymes: 2 R + 2 C each)
  const pkas = Array.from({ length: 4 }, (_, i) => {
    const x = 26 + (i % 2) * 90, y = MY1 + 118 + Math.floor(i / 2) * 38;
    svgEl("rect", { x, y, width: 22, height: 13, rx: 4, fill: "#ced4da", stroke: COL.ink, "stroke-width": 1 }, sch);
    svgEl("rect", { x, y: y + 15, width: 22, height: 13, rx: 4, fill: "#ced4da", stroke: COL.ink, "stroke-width": 1 }, sch);
    const cs = [0, 1].map(k => {
      const g = svgEl("g", { class: "gc-move" }, sch);
      const c = svgEl("circle", { cx: x + 31, cy: y + 6.5 + k * 15, r: 7, stroke: COL.ink, "stroke-width": 1, class: "gc-col" }, g);
      return { g, c };
    });
    return cs;
  }).flat();
  lab(26, MY1 + 108, "PKA: R (grey) holds C", "start", 14, COL.pka, true);

  // PDE
  const pdeG = svgEl("g", {}, sch);
  svgEl("path", { d: "M0,0 L13,-8 A15,15 0 1,0 13,8 Z", fill: "#868e96", stroke: COL.ink, "stroke-width": 1 }, pdeG);
  const pdeLab = svgEl("text", { x: -4, y: 4.5, "font-size": 11, "font-weight": 700, "text-anchor": "middle" }, pdeG); pdeLab.textContent = "PDE";
  pdeLab.style.fill = "#fff";
  const pdeX = svgEl("path", { d: "M-14,-12 L12,12 M12,-12 L-14,12", stroke: COL.drug, "stroke-width": 4, "stroke-linecap": "round", class: "gc-fade" }, pdeG);
  pdeG.setAttribute("transform", `translate(228 ${MY1 + 152})`);
  const schNote = htmlEl("div", "qb-note", "Icons show fractions (6 receptors, 10 Gαs, 4 PKA, up to 48 cAMP), not molecule numbers. Molecules per cell are in the table.", main);

  // ---- stacked time courses
  const PW = 580, XL = 58, XR = 566;
  const sx = (s: number) => XL + s / M.T_END * (XR - XL);
  interface Strip { key: string; title: string; unit: string; y0: number; h: number; max: number; color: string; svgLabel?: SVGTextElement }
  const strips: Strip[] = [];
  let yy = 6;
  const addStrip = (key: string, title: string, unit: string, h: number, color: string) => {
    const s: Strip = { key, title, unit, y0: yy + 20, h, max: 1, color };
    strips.push(s); yy += h + 34; return s;
  };
  const sH = addStrip("H", "Hormone outside", "× K_d", 34, COL.hormone);
  const sR = addStrip("R", "Active receptors", "%", 62, COL.rec);
  const sG = addStrip("G", "Active Gαs (GTP)", "%", 62, COL.gα);
  const sC = addStrip("C", "cAMP", "µM", 62, COL.camp);
  const sP = addStrip("P", "Active PKA", "%", 62, COL.pka);
  const PH = yy + 26;
  const plot = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "gc-plot", role: "img",
    "aria-label": "Time courses of hormone, active receptors, active G alpha, cAMP and active PKA" }, main);
  const axesG = svgEl("g", {}, plot);
  const curveG = svgEl("g", {}, plot);
  const cursor = svgEl("line", { y1: 8, y2: PH - 28, stroke: COL.ink, "stroke-width": 1.5, "stroke-dasharray": "4 3" }, plot);
  const cursorDots = strips.map(s => svgEl("circle", { r: 4.5, fill: s.color, stroke: "#fff", "stroke-width": 1.5 }, plot));
  const xlab = svgEl("text", { x: (XL + XR) / 2, y: PH - 4, "font-size": 14, "text-anchor": "middle" }, plot);
  xlab.textContent = "time (s); drag on the plots to move the cursor";
  for (const s of strips) {
    const tl = svgEl("text", { x: XL, y: s.y0 - 6, "font-size": 15, "font-weight": 700 }, plot);
    tl.style.fill = s.color; s.svgLabel = tl;
  }
  plot.style.touchAction = "pan-y";
  let dragging = false;
  const scrub = (ev: PointerEvent) => {
    const [x] = svgPoint(plot, ev);
    t = Math.max(0, Math.min(M.T_END, (x - XL) / (XR - XL) * M.T_END));
    draw();
  };
  plot.addEventListener("pointerdown", ev => { dragging = true; setPlaying(false); plot.setPointerCapture(ev.pointerId); scrub(ev); });
  plot.addEventListener("pointermove", ev => { if (dragging) scrub(ev); });
  plot.addEventListener("pointerup", () => { dragging = false; });
  plot.addEventListener("pointercancel", () => { dragging = false; });
  htmlEl("div", "qb-note gc-legend", "Coloured: this cell. Grey: a normal cell given the same hormone pulse. Dashed grey in the receptor panel: desensitised receptors.", main);

  // ================= control panel
  const panel = htmlEl("div", "qb-panel gc-panel", "", host);
  htmlEl("div", "gc-h", "Presets", panel);
  const pBtns = presets(panel, PRESETS.map(pr => ({ label: pr.label, apply: () => applyPreset(pr) })));
  const presetText = htmlEl("div", "qb-note gc-ptext", p0.text, panel);

  const box1 = htmlEl("div", "gc-box", "", panel);
  htmlEl("div", "gc-h", "Hormone pulse", box1);
  const sDose = slider(box1, "dose", -1, 2, 0.05, Math.log10(p.dose), v => { p.dose = +Math.pow(10, v).toPrecision(2); recompute(); }, v => fmtDose(+Math.pow(10, v).toPrecision(2)) + "×K_d");
  const sDur = slider(box1, "duration", 5, 300, 5, p.duration, v => { p.duration = v; recompute(); }, v => v + " s");

  const box2 = htmlEl("div", "gc-box", "", panel);
  htmlEl("div", "gc-h", "Switching off", box2);
  const sGTP = slider(box2, "Gα GTPase", Math.log10(0.005), 0, 0.01, Math.log10(p.kGTP), v => { p.kGTP = +Math.pow(10, v).toPrecision(2); recompute(); }, v => fmtRate(+Math.pow(10, v).toPrecision(2)) + "/s");
  const sPDE = slider(box2, "PDE activity", Math.log10(0.02), Math.log10(2), 0.01, Math.log10(p.kPDE), v => { p.kPDE = +Math.pow(10, v).toPrecision(2); recompute(); }, v => fmtRate(+Math.pow(10, v).toPrecision(2)) + "/s");
  const sDes = slider(box2, "arrestin (desens.)", 0, 0.05, 0.002, p.kDes, v => { p.kDes = v; recompute(); }, v => v.toFixed(3) + "/s");
  const halfOut = htmlEl("div", "qb-note", "", box2);

  const box3 = htmlEl("div", "gc-box", "", panel);
  htmlEl("div", "gc-h", "Drugs and toxins", box3);
  const cCtx = checkbox(box3, "cholera toxin (Gαs stuck on)", p.ctx, v => { p.ctx = v; recompute(); });
  const cPde = checkbox(box3, "PDE inhibitor (theophylline)", p.pdeInhib, v => { p.pdeInhib = v; recompute(); });
  const cBlk = checkbox(box3, "β-blocker (antagonist)", p.blocker, v => { p.blocker = v; recompute(); });
  checkbox(panel, "show a normal cell in grey", true, v => { showRef = v; drawCurves(); });

  htmlEl("div", "gc-h", "Amplification: molecules per cell", panel);
  const tWrap = htmlEl("div", "gc-twrap", "", panel);
  const table = htmlEl("table", "gc-table", "", tWrap);
  table.innerHTML = "<thead><tr><th>step</th><th>now</th><th>peak</th><th>gain per step</th></tr></thead>";
  const tbody = htmlEl("tbody", "", "", table);
  const ROWS = ["hormone bound", "active receptors", "active Gαs", "cAMP", "free PKA C subunits", "glucose released / s"];
  const cells = ROWS.map(name => {
    const tr = htmlEl("tr", "", "", tbody);
    const c = [0, 1, 2, 3].map(() => htmlEl("td", "", "", tr));
    c[0].textContent = name;
    return c;
  });
  const totalOut = htmlEl("div", "qb-readout gc-total", "", panel);
  htmlEl("div", "qb-note", "Simplified model with illustrative numbers (one liver-like cell of 2 pL: 10 000 receptors, 100 000 Gαs, 0.4 µM PKA). Qualitatively right, not a fit to data. The steps from PKA to glucose (phosphorylase kinase, glycogen phosphorylase) are lumped together.", panel);

  // ================= behaviour
  function setPlaying(v: boolean) {
    playing = v;
    if (v && t >= M.T_END - 1e-6) t = 0;
    bPlay.textContent = v ? "❚❚ Pause" : "▶ Play";
    bPlay.classList.toggle("active", v);
    loop.setPaused(!v);
    draw();
  }

  function applyPreset(pr: typeof PRESETS[number]) {
    p = { ...M.DEFAULTS, ...pr.p };
    presetText.textContent = pr.text;
    sDose.set(Math.log10(p.dose)); sDur.set(p.duration);
    sGTP.set(Math.log10(p.kGTP)); sPDE.set(Math.log10(p.kPDE)); sDes.set(p.kDes);
    cCtx.checked = p.ctx; cPde.checked = p.pdeInhib; cBlk.checked = p.blocker;
    recompute(true);
  }

  function recompute(fromPreset = false) {
    run = M.simulate(p);
    ref = M.simulate(refParams(p));
    if (!fromPreset) { pBtns.forEach(b => b.classList.remove("active")); presetText.textContent = "Your own settings."; }
    drawCurves();
    const kG = p.ctx ? 0 : p.kGTP, kP = p.kPDE * (p.pdeInhib ? M.K.pdeInhibFactor : 1);
    halfOut.textContent = `Half-lives: Gα–GTP ${fmtHalf(halfLife(kG))}, cAMP ${fmtHalf(halfLife(kP))}` + (p.kDes > 0 ? `; desensitisation under full stimulation ${fmtHalf(halfLife(p.kDes))}` : "; no desensitisation");
    // amplification (each row at its own peak)
    const pk = (a: Float64Array) => M.peak(a).v;
    const peaks = [
      pk(run.O) * M.N.receptors, pk(run.R) * M.N.receptors, pk(run.G) * M.N.gs,
      pk(run.C) * M.N.perMicroM, pk(run.P) * M.N.pkaC, pk(run.P) * M.N.pkaC * M.N.glcPerPKA,
    ];
    cells.forEach((c, i) => {
      c[2].textContent = fmtN(peaks[i]);
      c[3].textContent = i < 2 ? "" : peaks[i - 1] > 0 ? fmtGain(peaks[i] / peaks[i - 1]) : "";
    });
    cells[2][3].title = "per active receptor";
    const last = run.t.length - 1;
    const basalGlc = run.P[0] * M.N.pkaC * M.N.glcPerPKA * M.T_END;
    const extra = run.glc[last] - basalGlc;
    const bound = peaks[0];
    totalOut.textContent = p.ctx
      ? `Glucose released in 10 min: ${fmtN(run.glc[last])} (resting cell: ${fmtN(basalGlc)}). With cholera toxin the cascade does not need the hormone to stay on.`
      : `Extra glucose released in 10 min: ${fmtN(Math.max(0, extra))}\n= ${bound > 1 ? fmtN(Math.max(0, extra) / bound) : "–"} per hormone molecule bound at the peak`;
    draw();
  }

  function drawCurves() {
    axesG.innerHTML = ""; curveG.innerHTML = "";
    // y scales
    sH.max = Math.max(1, p.dose) * 1.15;
    sR.max = 1; sG.max = 1; sP.max = 1;
    const cMax = Math.max(M.peak(run.C).v, showRef ? M.peak(ref.C).v : 0, 2);
    sC.max = niceCeil(cMax * 1.05);
    for (const s of strips) {
      const y = (v: number) => s.y0 + s.h - Math.min(1.02, v / s.max) * s.h;
      svgEl("rect", { x: XL, y: s.y0, width: XR - XL, height: s.h, fill: "#fff", stroke: "#dee2e6" }, axesG);
      for (let tt = 0; tt <= M.T_END; tt += 60) svgEl("line", { x1: sx(tt), x2: sx(tt), y1: s.y0, y2: s.y0 + s.h, class: "grid" }, axesG);
      const ticks = s.key === "H" ? [0, p.dose] : [0, s.max / 2, s.max];
      for (const v of ticks) {
        const tx = svgEl("text", { x: XL - 6, y: y(v) + 5, "font-size": 13, "text-anchor": "end" }, axesG);
        tx.textContent = s.unit === "%" ? Math.round(v * 100) + "%" : s.key === "H" ? (v === 0 ? "0" : fmtDose(v)) : String(+v.toPrecision(2));
      }
      if (s.key === "H") {
        if (p.blocker) {
          const r = svgEl("rect", { x: XL, y: s.y0 + s.h - 6, width: XR - XL, height: 6, fill: COL.drug, "fill-opacity": 0.6 }, axesG);
          r.setAttribute("aria-label", "β-blocker present");
        }
        const x0 = sx(M.T_START), x1 = sx(Math.min(M.T_END, M.T_START + p.duration));
        svgEl("rect", { x: x0, y: y(p.dose), width: x1 - x0, height: s.y0 + s.h - y(p.dose), fill: COL.hormone, "fill-opacity": 0.75 }, curveG);
        continue;
      }
      const path = (r: M.Run, key: keyof M.Run, scale = 1) => {
        const a = r[key] as Float64Array;
        let dd = "";
        for (let i = 0; i < a.length; i += 2) dd += (i ? "L" : "M") + sx(r.t[i]).toFixed(1) + "," + y(a[i] * scale).toFixed(1);
        const iL = a.length - 1;
        dd += "L" + sx(r.t[iL]).toFixed(1) + "," + y(a[iL] * scale).toFixed(1);
        return dd;
      };
      if (showRef) svgEl("path", { d: path(ref, s.key as keyof M.Run), fill: "none", stroke: COL.ref, "stroke-width": 4, "stroke-linejoin": "round" }, curveG);
      if (s.key === "R") svgEl("path", { d: path(run, "D"), fill: "none", stroke: COL.des, "stroke-width": 2, "stroke-dasharray": "6 4" }, curveG);
      svgEl("path", { d: path(run, s.key as keyof M.Run), fill: "none", stroke: s.color, "stroke-width": 2.5, "stroke-linejoin": "round" }, curveG);
    }
    const last = strips[strips.length - 1];
    for (let tt = 0; tt <= M.T_END; tt += 60) {
      const tx = svgEl("text", { x: sx(tt), y: last.y0 + last.h + 17, "font-size": 13, "text-anchor": "middle" }, axesG);
      tx.textContent = String(tt);
    }
  }

  function niceCeil(v: number): number {
    const e = Math.pow(10, Math.floor(Math.log10(v)));
    for (const f of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (f * e >= v - 1e-9) return f * e;
    return 10 * e;
  }

  function draw() {
    const H = M.at(run, "H", t), O = M.at(run, "O", t), D = M.at(run, "D", t), Rs = M.at(run, "R", t);
    const G = M.at(run, "G", t), C = M.at(run, "C", t), P = M.at(run, "P", t);
    clock.textContent = `t = ${t.toFixed(0)} s` + (H > 0 ? " · hormone present" : t < M.T_START ? " · before the pulse" : " · hormone washed away");
    // cursor
    cursor.setAttribute("x1", String(sx(t))); cursor.setAttribute("x2", String(sx(t)));
    const vals: Record<string, number> = { H, R: Rs, G, C, P };
    strips.forEach((s, i) => {
      const v = vals[s.key];
      const y = s.y0 + s.h - Math.min(1.02, v / s.max) * s.h;
      cursorDots[i].setAttribute("cx", String(sx(t))); cursorDots[i].setAttribute("cy", String(y));
      const txt = s.unit === "%" ? Math.round(v * 100) + "%" : s.key === "H" ? fmtDose(v) + " × K_d" : v.toFixed(2) + " µM";
      s.svgLabel!.textContent = `${s.title}: ${txt}` + (s.key === "R" ? ` · desensitised ${Math.round(D * 100)}%` : "");
    });
    // schematic: hormone and blocker outside
    const nH = H > 0 ? Math.max(1, Math.round(NH * H / (H + 3))) : 0;
    hormoneDots.forEach((e, i) => e.style.opacity = i < nH ? "1" : "0");
    blockerDots.forEach(e => e.style.opacity = p.blocker ? "1" : "0");
    // receptors: desensitised first, then active, then blocked, then empty
    const b = p.blocker ? M.K.blockerB : 0;
    const nD = Math.round(NR * D), nA = Math.min(NR - nD, Math.round(NR * Rs));
    const nBound = Math.round(NR * O);
    const nBlk = Math.min(NR - nD - nA, Math.round(NR * (b / (1 + H + b))));
    recs.forEach((r, i) => {
      const des = i < nD, act = !des && i < nD + nA, blk = !des && !act && i < nD + nA + nBlk;
      r.body.style.fill = act ? "#d0bfff" : des ? "#dee2e6" : "#fff";
      r.lig.style.opacity = act || (des && i < nBound) ? "1" : "0";
      r.blk.style.opacity = blk ? "1" : "0";
      r.pho.style.opacity = des ? "1" : "0";
      r.arr.style.opacity = des ? "1" : "0";
    });
    // G proteins
    const nG = Math.round(NG * G);
    gps.forEach((g, i) => {
      const on = i < nG;
      g.a.style.fill = on ? COL.gαOn : "#ced4da";
      g.g.setAttribute("transform", on ? "translate(3 22)" : "translate(0 0)");
      g.tox.style.opacity = p.ctx ? "1" : "0";
    });
    acs.forEach((a, i) => a.style.fill = G > (i === 0 ? 0.15 : 0.45) ? "#ffe066" : "#fff");
    // cAMP
    const nC = Math.min(NC, Math.round(NC * C / 10));
    campDots.forEach((e, i) => e.style.opacity = i < nC ? "1" : "0");
    campLab.textContent = `cAMP ${C.toFixed(1)} µM` + (C > 10 ? " (dots capped)" : "");
    // PKA: free C subunits move away and light up
    const nP = Math.round(8 * P);
    pkas.forEach((c, i) => {
      const free = i < nP;
      c.c.style.fill = free ? COL.pka : "#adb5bd";
      c.g.setAttribute("transform", free ? `translate(18 ${(i % 2 ? 1 : -1) * 3})` : "translate(0 0)");
    });
    pdeX.style.opacity = p.pdeInhib ? "1" : "0";
    gLab2.textContent = p.ctx ? "dark = βγ; ◆ = cholera toxin mark on Gαs" : "dark = βγ";
    // table "now" column
    const now = [O * M.N.receptors, Rs * M.N.receptors, G * M.N.gs, C * M.N.perMicroM, P * M.N.pkaC, P * M.N.pkaC * M.N.glcPerPKA];
    cells.forEach((c, i) => c[1].textContent = fmtN(now[i]));
  }

  // animation loop: 60 steps per second of real time; time runs at `speed`× real time
  const loop = visibleLoop(host, 1 / 60, () => {
    if (!playing) return;
    t += speed / 60;
    if (t >= M.T_END) { t = M.T_END; setPlaying(false); }
  }, () => draw());
  loop.setPaused(true);

  pBtns[PRESETS.indexOf(p0)].classList.add("active");
  recompute(true);
  void schNote;
});
