// Protein turnover: amount of a target protein and a bystander protein over time, from the
// exact solution of dP/dt = k_s − k_d·P (model.ts). Set synthesis rate and half-life; start
// from zero (gene switched on) or at steady state; at a chosen time add cycloheximide (all
// synthesis stops: a chase), bortezomib (proteasome blocked: degradation of both proteins
// slows) or a PROTAC (extra degradation of the target only). A draggable cursor reads values.
// Optional particle view (particles.ts, off by default): one cell, molecules made and
// destroyed at random with the same rates, 1× real time by default.
// Options (data-*): preset = on|chx|btz|protac|both, particles = on.
import { autoMount, htmlEl, svgEl, slider, checkbox, presets, button, svgPoint } from "../lib/ui";
import { Setup, Which, rates, steady, amount, halfLife, timeToFraction, LN2, F_PROT, DOUBLING } from "./model";
import { mountParticles, COL, fmt, Trace } from "./particles";

const CSS = `
.tn .tn-main { flex: 1 1 520px; min-width: 0; max-width: 720px; display: flex; flex-direction: column; gap: .5em; }
.tn .tn-panel { flex: 1 1 300px; max-width: 400px; }
.tn .tn-plot { width: 100%; height: auto; touch-action: pan-y; }
.tn .tn-h { font-weight: 700; }
.tn .tn-box { border-left: 4px solid; padding-left: .6em; display: flex; flex-direction: column; gap: .3em; }
.tn .tn-seg { display: flex; flex-wrap: wrap; gap: .35em; align-items: center; }
.tn .tn-formula { font-size: .8em; white-space: pre-wrap; }
.tn .tn-pstage { position: relative; width: 100%; aspect-ratio: 100 / 56; border-radius: 6px; overflow: hidden; border: 1px solid #ccd; background: #fff; }
.tn .tn-pcanvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.tn .tn-prow { display: flex; flex-wrap: wrap; gap: .4em; align-items: center; margin-bottom: .4em; }
.tn .tn-pinfo { margin-top: .4em; }
.tn .tn-select { font: inherit; font-size: .85em; padding: .2em .3em; border-radius: 6px; }
.tn .tn-twrap { overflow-x: auto; max-width: 100%; }
.tn .tn-table { border-collapse: collapse; font-size: .88em; width: 100%; font-variant-numeric: tabular-nums; }
.tn .tn-table th, .tn .tn-table td { padding: .2em .45em; text-align: right; border-bottom: 1px solid #e3e3e3; }
.tn .tn-table th { font-weight: 600; font-size: .9em; vertical-align: bottom; }
.tn .tn-table td:first-child, .tn .tn-table th:first-child { text-align: left; white-space: nowrap; }
.tn .tn-table tr.tn-after td { background: #fdf3ec; }
.tn .tn-table tr.tn-after td:first-child { padding-left: 1.2em; font-size: .92em; }
.tn .tn-handle { cursor: ew-resize; touch-action: none; }
@media (max-width: 640px) {
  .tn .tn-main, .tn .tn-panel { width: 100%; max-width: 100%; flex-basis: auto; }
  .tn .tn-formula { font-size: .72em; }
}`;

function injectCss() {
  if (document.getElementById("tn-css")) return;
  const st = document.createElement("style");
  st.id = "tn-css"; st.textContent = CSS;
  document.head.appendChild(st);
}

const BASE = (): Setup => ({
  target: { ks: 1000, thalf: 2 }, bystander: { ks: 100, thalf: 20 },
  start: "steady", chx: false, btz: false, btzBlock: 0.9, protac: false, kProtac: 2, tAdd: 4, divide: false,
});
const PRESETS: { key: string; label: string; win: number; make: () => Setup; text: string }[] = [
  { key: "on", label: "Gene switched on", win: 24, make: () => ({ ...BASE(), start: "zero" }),
    text: "Both genes are switched on at 0 h. The two proteins reach the same steady state, but at very different speeds." },
  { key: "chx", label: "Cycloheximide chase", win: 24, make: () => ({ ...BASE(), chx: true }),
    text: "At 4 h cycloheximide stops all translation. Only degradation is left: read the half-lives from the decay." },
  { key: "btz", label: "Bortezomib", win: 48, make: () => ({ ...BASE(), btz: true }),
    text: "At 4 h bortezomib blocks 90 % of proteasome activity. Degradation slows for both proteins." },
  { key: "protac", label: "PROTAC", win: 24, make: () => ({ ...BASE(), protac: true }),
    text: "At 4 h a PROTAC brings an E3 ligase to the target: extra ubiquitination and destruction of the target only." },
  { key: "both", label: "PROTAC + bortezomib", win: 24, make: () => ({ ...BASE(), protac: true, btz: true }),
    text: "The PROTAC and bortezomib together. Does the target still disappear?" },
];
const WINDOWS = [12, 24, 48, 96];
const copy = (s: Setup): Setup => ({ ...s, target: { ...s.target }, bystander: { ...s.bystander } });

// plot geometry
const VW = 640, VH = 330, PL = 82, PR = 100, PT = 30, PB = 48;
const X0 = PL, X1 = VW - PR, Y0 = VH - PB, Y1 = PT;

const fmtT = (h: number) => h < 1 ? `${Math.round(h * 60)} min` : h < 10 ? `${h.toFixed(1)} h` : h < 72 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(1)} days`;
const fmtK = (k: number) => k >= 0.1 ? k.toFixed(3) : k.toPrecision(2);
const round2 = (v: number) => +v.toPrecision(2);

function niceCeil(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= v) return f * p;
  return 10 * p;
}

autoMount("turnover", host => {
  injectCss();
  host.classList.add("tn");
  const d = host.dataset;
  const p0 = PRESETS.find(p => p.key === d.preset) ?? PRESETS[0];
  let s: Setup = p0.make();
  let win = p0.win, logY = false;
  let cursorT = 0;
  const cursorFor = () => { cursorT = s.start === "zero" && !(s.chx || s.btz || s.protac) ? 2 : Math.min(win, s.tAdd + 2); };
  let trace: Trace | null = null, traceNow = 0;

  // ---- main column
  const main = htmlEl("div", "tn-main", "", host);
  const svg = svgEl("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "tn-plot", role: "img",
    "aria-label": "Amount of target and bystander protein over time" }, main);
  const gStatic = svgEl("g", {}, svg);
  const gTrace = svgEl("g", {}, svg);
  const gCursor = svgEl("g", {}, svg);
  const cursorRead = htmlEl("div", "qb-readout", "", main);
  const tWrap = htmlEl("div", "tn-twrap", "", main);
  const table = htmlEl("table", "tn-table", "", tWrap);
  const formula = htmlEl("div", "qb-readout tn-formula", "", main);
  const presetText = htmlEl("div", "qb-note", "", main);
  htmlEl("div", "qb-note", "Exact solution of dP/dt = k_s − k_d·P for each protein. Dotted lines: steady states before the drugs. "
    + `Simplified: constant synthesis; every molecule has the same chance per hour of being destroyed; ${Math.round(F_PROT * 100)} % of each protein's own `
    + "degradation goes through the proteasome and the rest through lysosomes; drugs act at once. Illustrative numbers.", main);

  let part: ReturnType<typeof mountParticles> | null = null;
  checkbox(main, "Show the molecules in one cell (particle view)", d.particles === "on", v => {
    if (v && !part) { part = mountParticles(partBox, copy(s), win, perDot(), onTrace); draw(); }
    if (!v && part) { part.destroy(); part = null; trace = null; drawTrace(); }
  });
  const partBox = htmlEl("div", "", "", main);

  // ---- controls
  const panel = htmlEl("div", "qb-panel tn-panel", "", host);
  htmlEl("div", "tn-h", "Presets", panel);
  const pBtns = presets(panel, PRESETS.map(p => ({ label: p.label, apply: () => {
    s = p.make(); win = p.win; presetText.textContent = p.text; cursorFor(); sync(); changed(true);
  } })));

  const protBox = (w: Which, name: string) => {
    const box = htmlEl("div", "tn-box", "", panel);
    box.style.borderLeftColor = COL[w];
    const h = htmlEl("div", "tn-h", name, box); h.style.color = COL[w];
    const ks = slider(box, "made per hour", 10, 2000, 10, s[w].ks, v => { s[w].ks = v; changed(); }, v => String(v));
    const th = slider(box, "half-life", Math.log10(0.25), Math.log10(48), 0.01, Math.log10(s[w].thalf),
      v => { s[w].thalf = round2(Math.pow(10, v)); changed(); }, v => fmtT(round2(Math.pow(10, v))));
    return { ks, th };
  };
  const sT = protBox("target", "Target protein");
  const sB = protBox("bystander", "Bystander protein");

  const startBox = htmlEl("div", "tn-seg", "", panel);
  htmlEl("span", "", "Start:", startBox);
  const bZero = button(startBox, "from zero (gene on at 0 h)", () => { s.start = "zero"; sync(); changed(); });
  const bSteady = button(startBox, "at steady state", () => { s.start = "steady"; sync(); changed(); });

  const drugBox = htmlEl("div", "tn-box", "", panel);
  drugBox.style.borderLeftColor = COL.drug;
  const dh = htmlEl("div", "tn-h", "Drugs", drugBox); dh.style.color = COL.drug;
  const sAdd = slider(drugBox, "added at", 0, win, 0.5, s.tAdd, v => { s.tAdd = v; changed(); }, v => v + " h");
  const cChx = checkbox(drugBox, "cycloheximide (stops all synthesis)", s.chx, v => { s.chx = v; changed(); });
  const cBtz = checkbox(drugBox, "bortezomib (blocks the proteasome)", s.btz, v => { s.btz = v; changed(); });
  const sBlock = slider(drugBox, "block", 0, 100, 5, s.btzBlock * 100, v => { s.btzBlock = v / 100; changed(); }, v => v + " %");
  const cPro = checkbox(drugBox, "PROTAC (destroys the target only)", s.protac, v => { s.protac = v; changed(); });
  const sPro = slider(drugBox, "PROTAC k", 0, 5, 0.1, s.kProtac, v => { s.kProtac = v; changed(); }, v => v.toFixed(1) + "/h");

  const winBox = htmlEl("div", "tn-seg", "", panel);
  htmlEl("span", "", "Time axis:", winBox);
  const wBtns = WINDOWS.map(w => button(winBox, w + " h", () => { win = w; sync(); changed(true); }));
  const cLog = checkbox(panel, "log scale for the amount", logY, v => { logY = v; draw(); });
  const cDiv = checkbox(panel, `dividing cells (doubling every ${DOUBLING} h: dilution)`, s.divide, v => { s.divide = v; changed(); });

  function sync() {
    sT.ks.set(s.target.ks); sT.th.set(Math.log10(s.target.thalf));
    sB.ks.set(s.bystander.ks); sB.th.set(Math.log10(s.bystander.thalf));
    bZero.classList.toggle("active", s.start === "zero"); bSteady.classList.toggle("active", s.start === "steady");
    sAdd.input.max = String(win); if (s.tAdd > win) s.tAdd = win; sAdd.set(s.tAdd);
    cChx.checked = s.chx; cBtz.checked = s.btz; sBlock.set(Math.round(s.btzBlock * 100)); cPro.checked = s.protac; sPro.set(s.kProtac);
    wBtns.forEach((b, i) => b.classList.toggle("active", WINDOWS[i] === win));
    cLog.checked = logY; cDiv.checked = s.divide;
  }

  // molecules per dot in the particle view, so that at most ~4000 dots are drawn
  function perDot(): number {
    let mx = 0;
    for (let i = 0; i <= 200; i++) { const t = win * i / 200; mx = Math.max(mx, amount(s, "target", t) + amount(s, "bystander", t)); }
    for (const m of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (mx / m <= 4000) return m;
    return 10000;
  }

  function onTrace(tr: Trace, now: number) { trace = tr; traceNow = now; drawTrace(); }

  function changed(presetClick = false) {
    if (!presetClick) pBtns.forEach(b => b.classList.remove("active"));
    if (cursorT > win) cursorT = win;
    draw();
    part?.update(copy(s), win, perDot());
  }

  // ---- plot
  let yMax = 1, yMinLog = 1;
  const sx = (t: number) => X0 + t / win * (X1 - X0);
  const sy = (v: number) => {
    if (!logY) return Y0 - Math.max(0, v) / yMax * (Y0 - Y1);
    const lv = Math.log10(Math.max(v, yMinLog)), a = Math.log10(yMinLog), b = Math.log10(yMax);
    return Y0 - (lv - a) / (b - a) * (Y0 - Y1);
  };
  const anyDrug = () => s.chx || s.btz || s.protac;
  const drugNames = () => [s.chx && "cycloheximide", s.btz && "bortezomib", s.protac && "PROTAC"].filter(Boolean).join(" + ");

  function draw() {
    gStatic.replaceChildren();
    const N = 480;
    const curves: Record<Which, number[]> = { target: [], bystander: [] };
    let mx = 0;
    for (const w of ["target", "bystander"] as Which[]) for (let i = 0; i <= N; i++) {
      const v = amount(s, w, win * i / N); curves[w].push(v); mx = Math.max(mx, v);
    }
    for (const w of ["target", "bystander"] as Which[]) mx = Math.max(mx, steady(rates(s, w, false)));
    if (logY) { yMax = Math.pow(10, Math.ceil(Math.log10(mx * 1.05))); yMinLog = yMax / 1e4; }
    else yMax = niceCeil(mx * 1.05);

    // drug period shading
    if (anyDrug() && s.tAdd < win) {
      svgEl("rect", { x: sx(s.tAdd), y: Y1, width: X1 - sx(s.tAdd), height: Y0 - Y1, fill: COL.drug, "fill-opacity": 0.06 }, gStatic);
    }
    // grid and axes
    const yt: number[] = [];
    if (logY) for (let v = yMinLog; v <= yMax * 1.001; v *= 10) yt.push(v);
    else { const st = niceCeil(yMax / 5.5); for (let v = 0; v <= yMax * 1.001; v += st) yt.push(v); }
    for (const v of yt) {
      svgEl("line", { x1: X0, x2: X1, y1: sy(v), y2: sy(v), class: "grid" }, gStatic);
      const t = svgEl("text", { x: X0 - 8, y: sy(v) + 5, "font-size": 15, "text-anchor": "end" }, gStatic);
      t.textContent = fmt(v);
    }
    const step = win <= 12 ? 2 : win <= 24 ? 4 : win <= 48 ? 8 : 12;
    for (let t = 0; t <= win; t += step) {
      svgEl("line", { x1: sx(t), x2: sx(t), y1: Y0, y2: Y0 + 5, class: "axis" }, gStatic);
      const tx = svgEl("text", { x: sx(t), y: Y0 + 22, "font-size": 15, "text-anchor": "middle" }, gStatic);
      tx.textContent = String(t);
    }
    svgEl("line", { x1: X0, x2: X1, y1: Y0, y2: Y0, class: "axis" }, gStatic);
    svgEl("line", { x1: X0, x2: X0, y1: Y0, y2: Y1, class: "axis" }, gStatic);
    const xl = svgEl("text", { x: (X0 + X1) / 2, y: VH - 6, "font-size": 15, "text-anchor": "middle" }, gStatic);
    xl.textContent = "time (hours)";
    const yl = svgEl("text", { x: 0, y: 0, "font-size": 15, "text-anchor": "middle", transform: `translate(14 ${(Y0 + Y1) / 2}) rotate(-90)` }, gStatic);
    yl.textContent = "molecules per cell";
    // drug marker
    if (anyDrug() && s.tAdd <= win) {
      svgEl("line", { x1: sx(s.tAdd), x2: sx(s.tAdd), y1: Y0, y2: Y1 - 4, stroke: COL.drug, "stroke-width": 2, "stroke-dasharray": "6 4" }, gStatic);
      const right = sx(s.tAdd) < (X0 + X1) / 2;
      const lab = svgEl("text", { x: sx(s.tAdd) + (right ? 6 : -6), y: Y1 - 10, "font-size": 15, "font-weight": 700, "text-anchor": right ? "start" : "end" }, gStatic);
      lab.style.fill = COL.drug; lab.textContent = "+ " + drugNames();
    }
    // steady states before drugs (dotted)
    for (const w of ["target", "bystander"] as Which[]) {
      const ss = steady(rates(s, w, false));
      if (ss <= yMax && (!logY || ss >= yMinLog))
        svgEl("line", { x1: X0, x2: X1, y1: sy(ss), y2: sy(ss), stroke: COL[w], "stroke-width": 1.5, "stroke-dasharray": "2 4" }, gStatic);
    }
    // curves (bystander under target)
    const ends: { w: Which; y: number }[] = [];
    for (const w of ["bystander", "target"] as Which[]) {
      const c = curves[w];
      const dd = c.map((v, i) => `${i ? "L" : "M"}${sx(win * i / N).toFixed(1)},${sy(v).toFixed(1)}`).join("");
      svgEl("path", { d: dd, fill: "none", stroke: COL[w], "stroke-width": 3.5, "stroke-dasharray": w === "bystander" ? "10 5" : "none",
        "stroke-linejoin": "round", opacity: trace ? 0.55 : 1 }, gStatic);
      ends.push({ w, y: sy(c[N]) });
    }
    // end labels, kept apart
    ends.sort((a, b) => a.y - b.y);
    if (ends[1].y - ends[0].y < 20) { const m = (ends[0].y + ends[1].y) / 2; ends[0].y = m - 10; ends[1].y = m + 10; }
    for (const e of ends) {
      const t = svgEl("text", { x: X1 + 6, y: Math.max(Y1 + 4, Math.min(Y0 - 2, e.y)) + 5, "font-size": 15, "font-weight": 700 }, gStatic);
      t.style.fill = COL[e.w]; t.textContent = e.w;
    }
    drawTrace(); drawCursor(); writeFormula();
  }

  function drawTrace() {
    gTrace.replaceChildren();
    if (!trace || trace.t.length < 1) return;
    const tr = trace;
    for (const [arr, w] of [[tr.b, "bystander"], [tr.a, "target"]] as const) {
      const dd = arr.map((v, i) => `${i ? "L" : "M"}${sx(Math.min(win, tr.t[i])).toFixed(1)},${sy(v).toFixed(1)}`).join("");
      svgEl("path", { d: dd, fill: "none", stroke: COL[w], "stroke-width": 1.6 }, gTrace);
    }
    svgEl("line", { x1: sx(Math.min(win, traceNow)), x2: sx(Math.min(win, traceNow)), y1: Y0, y2: Y1, stroke: "#1b2a3a", "stroke-width": 1, opacity: 0.6 }, gTrace);
  }

  // cursor: drag the handle, or tap/click anywhere on the plot
  function drawCursor() {
    gCursor.replaceChildren();
    const x = sx(cursorT);
    svgEl("line", { x1: x, x2: x, y1: Y0, y2: Y1, stroke: "#1b2a3a", "stroke-width": 1.5, "stroke-dasharray": "3 3" }, gCursor);
    for (const w of ["target", "bystander"] as Which[]) {
      const c = svgEl("circle", { cx: x, cy: sy(amount(s, w, cursorT)), r: 5.5, fill: "#fff", "stroke-width": 2.5 }, gCursor);
      c.style.stroke = COL[w];
    }
    const h = svgEl("g", { class: "tn-handle" }, gCursor);
    svgEl("rect", { x: x - 22, y: Y0 - 22, width: 44, height: 44, fill: "transparent" }, h);
    svgEl("path", { d: `M${x},${Y0 - 2} l-9,14 h18 z`, fill: "#1b2a3a" }, h);
    h.addEventListener("pointerdown", ev => {
      ev.preventDefault(); ev.stopPropagation();
      dragging = true; svg.setPointerCapture(ev.pointerId); moveCursor(ev);
    });
    writeCursor();
  }
  let dragging = false;
  const moveCursor = (ev: PointerEvent) => {
    const [x] = svgPoint(svg, ev);
    cursorT = Math.max(0, Math.min(win, Math.round((x - X0) / (X1 - X0) * win * 20) / 20));
    drawCursor();
  };
  svg.addEventListener("pointerdown", ev => {
    const [x, y] = svgPoint(svg, ev);
    if (x < X0 - 10 || x > X1 + 10 || y < Y1 - 10 || y > Y0 + 30) return;
    if (ev.pointerType === "mouse") { dragging = true; svg.setPointerCapture(ev.pointerId); }
    moveCursor(ev);
  });
  svg.addEventListener("pointermove", ev => { if (dragging) moveCursor(ev); });
  const stop = () => { dragging = false; };
  svg.addEventListener("pointerup", stop); svg.addEventListener("pointercancel", stop);

  function writeCursor() {
    const ref = (w: Which) => {
      const v = amount(s, w, cursorT);
      if (anyDrug() && cursorT > s.tAdd) {
        const a = amount(s, w, s.tAdd);
        return `${fmt(v)} (${a > 0 ? Math.round(100 * v / a) + " % of its amount when the drugs were added" : "–"})`;
      }
      const ss = steady(rates(s, w, false));
      return `${fmt(v)} (${Math.round(100 * v / ss)} % of steady state)`;
    };
    cursorRead.textContent = `cursor at t = ${cursorT.toFixed(cursorT % 1 ? (cursorT * 10) % 1 ? 2 : 1 : 0)} h\n`
      + `target    ${ref("target")}\nbystander ${ref("bystander")}`;
  }

  function writeFormula() {
    const head = "<thead><tr><th></th><th>made per h (k<sub>s</sub>)</th><th>k<sub>d</sub> per h</th><th>half-life</th>"
      + "<th>steady state k<sub>s</sub>/k<sub>d</sub></th><th>90 % of the way in</th></tr></thead>";
    const row = (label: string, w: Which, after: boolean) => {
      const r = rates(s, w, after);
      return `<tr${after ? ' class="tn-after"' : ""}><td style="color:${COL[w]}"><b>${label}</b></td><td>${fmt(r.ks)}</td><td>${fmtK(r.kd)}</td>`
        + `<td>${fmtT(halfLife(r))}</td><td>${fmt(steady(r))}</td><td>${fmtT(timeToFraction(r, 0.9))}</td></tr>`;
    };
    let body = "";
    for (const w of ["target", "bystander"] as Which[]) {
      body += row(w, w, false);
      if (anyDrug()) body += row(`after ${s.tAdd} h`, w, true);
    }
    table.innerHTML = head + "<tbody>" + body + "</tbody>";
    const lines: string[] = [];
    const t = s.target, r1 = rates(s, "target", false);
    lines.push(`Target: k_d = ln2 / t½ = 0.693 / ${fmtT(t.thalf)} = ${fmtK(LN2 / t.thalf)} per h`
      + (s.divide ? `, plus ${fmtK(r1.kDil)} for dilution = ${fmtK(r1.kd)}` : "")
      + `;  steady state = ${fmt(t.ks)} / ${fmtK(r1.kd)} = ${fmt(steady(r1))}`);
    if (anyDrug()) for (const w of ["target", "bystander"] as Which[]) {
      const r2 = rates(s, w, true);
      const parts = [`${fmtK(r2.kProt)} proteasome${s.protac && w === "target" ? " (incl. PROTAC)" : ""}`, `${fmtK(r2.kOther)} lysosome`];
      if (s.divide) parts.push(`${fmtK(r2.kDil)} dilution`);
      lines.push(`After the drugs, ${w}: k_d = ${parts.join(" + ")} = ${fmtK(r2.kd)} per h`);
    }
    formula.textContent = lines.join("\n");
  }

  cursorFor();
  sync();
  presetText.textContent = p0.text;
  pBtns[PRESETS.indexOf(p0)].classList.add("active");
  draw();
  if (d.particles === "on") { part = mountParticles(partBox, copy(s), win, perDot(), onTrace); draw(); }
});
