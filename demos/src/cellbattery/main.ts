// The cell battery: each ion's Nernst potential as a line on a voltage scale, and the
// membrane potential from the Goldman (GHK) equation as a moving marker. Sliders for the
// inside and outside concentrations of K⁺, Na⁺ and Cl⁻ and for how many channels of each
// kind are open (relative permeability). Presets from the lecture. An optional particle
// view (particles.ts, off by default) shows ions crossing open channels, sampled from the
// GHK fluxes; delete that file and the two marked lines below to remove it.
// Options (data-*): preset = rest|hyperK|ap|lidocaine|cftrClosed|cftrOpen, particles = on.
import { autoMount, htmlEl, svgEl, slider, checkbox, presets, Slider } from "../lib/ui";
import { State, Ion, IONS, NAME, COLOR, LECTURE, RTF, nernst, ghk, fluxes, effP, Z } from "./model";
import { mountParticles } from "./particles";          // optional particle view (1/2)

const SW = 600, SH = 236, XL = 30, XR = 570, AY = 112;
const VMIN = -120, VMAX = 100;
const sx = (v: number) => XL + (Math.max(VMIN, Math.min(VMAX, v)) - VMIN) / (VMAX - VMIN) * (XR - XL);
const clone = (s: State): State => ({ cin: { ...s.cin }, cout: { ...s.cout }, P: { ...s.P }, lidocaine: s.lidocaine });
const sign = (v: number, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
const fmtP = (p: number) => p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p >= 0.1 ? p.toFixed(2) : p.toFixed(3);

const PRESETS: { key: string; label: string; make: () => State; text: string }[] = [
  { key: "rest", label: "Resting cell", make: () => clone(LECTURE),
    text: "Lecture values. At rest many K⁺ leak channels are open, a few Na⁺ and Cl⁻ channels." },
  { key: "hyperK", label: "High outside K⁺ (hyperkalaemia)", make: () => { const s = clone(LECTURE); s.cout.K = 8; return s; },
    text: "Blood K⁺ raised from 5 to 8 mM, as in kidney failure. Normal range about 3.5–5 mM." },
  { key: "ap", label: "Na⁺ channels open (action-potential peak)", make: () => { const s = clone(LECTURE); s.P.Na = 6; return s; },
    text: "Voltage-gated Na⁺ channels open: for a moment the membrane is far more permeable to Na⁺ than to K⁺." },
  { key: "lidocaine", label: "Lidocaine + the same stimulus", make: () => { const s = clone(LECTURE); s.P.Na = 6; s.lidocaine = true; return s; },
    text: "The Na⁺ channels are told to open, but lidocaine blocks their pore from inside. Only the resting Na⁺ leak is left." },
  { key: "cftrClosed", label: "Epithelial cell, CFTR closed", make: () => { const s = clone(LECTURE); s.cin.Cl = 50; return s; },
    text: "An airway epithelial cell loads Cl⁻ in (a Na⁺–K⁺–2Cl⁻ symporter on the blood side), to about 50 mM. CFTR is closed." },
  { key: "cftrOpen", label: "CFTR open (Cl⁻ channel)", make: () => { const s = clone(LECTURE); s.cin.Cl = 50; s.P.Cl = 3; return s; },
    text: "Protein kinase A and ATP open CFTR: many Cl⁻ channels in the apical membrane." },
];

autoMount("cellbattery", host => {
  host.classList.add("cb");
  const d = host.dataset;
  let st: State = (PRESETS.find(p => p.key === d.preset) ?? PRESETS[0]).make();

  // ---- main view
  const main = htmlEl("div", "cb-main", "", host);
  const big = htmlEl("div", "cb-vm", "", main);
  const svg = svgEl("svg", { viewBox: `0 0 ${SW} ${SH}`, class: "cb-scale" }, main);
  svgEl("rect", { x: XL, y: AY - 70, width: sx(0) - XL, height: 70, fill: "#f1f3f5" }, svg);
  svgEl("line", { x1: XL, x2: XR, y1: AY, y2: AY, stroke: "#1b2a3a", "stroke-width": 2 }, svg);
  for (let v = VMIN; v <= VMAX; v += 20) {
    svgEl("line", { x1: sx(v), x2: sx(v), y1: AY, y2: AY + (v % 40 ? 5 : 8), stroke: "#1b2a3a" }, svg);
    if (v % 40) continue;
    const t = svgEl("text", { x: sx(v), y: AY + 26, "font-size": 17, "text-anchor": "middle" }, svg);
    t.textContent = v === 0 ? "0" : sign(v);
  }
  const ax = svgEl("text", { x: (XL + XR) / 2, y: SH - 4, "font-size": 15, "text-anchor": "middle" }, svg);
  ax.textContent = "voltage inside the cell, relative to outside (mV)";
  const eLines: Record<Ion, { g: SVGGElement; line: SVGLineElement; lab: SVGTextElement }> = {} as never;
  IONS.forEach(ion => {
    const g = svgEl("g", { class: "cb-move" }, svg);
    const line = svgEl("line", { x1: 0, x2: 0, y1: AY - 62, y2: AY, stroke: COLOR[ion], "stroke-width": 3 }, g);
    const lab = svgEl("text", { x: 0, y: 0, "font-size": 17, "font-weight": 700, "text-anchor": "middle" }, g);
    lab.style.fill = COLOR[ion];
    eLines[ion] = { g, line, lab };
  });
  const vm = svgEl("g", { class: "cb-move" }, svg);
  svgEl("path", { d: "M0,0 L-11,20 L11,20 Z", fill: "#e8590c", transform: `translate(0 ${AY + 34})` }, vm);
  svgEl("line", { x1: 0, x2: 0, y1: AY - 70, y2: AY + 34, stroke: "#e8590c", "stroke-width": 2.5, "stroke-dasharray": "5 3" }, vm);
  const vmLab = svgEl("text", { x: 0, y: AY + 74, "font-size": 18, "font-weight": 700, "text-anchor": "middle" }, vm);
  vmLab.style.fill = "#e8590c";

  const tWrap = htmlEl("div", "cb-twrap", "", main);
  const table = htmlEl("table", "cb-table", "", tWrap);
  table.innerHTML = "<thead><tr><th>ion</th><th>in (mM)</th><th>out (mM)</th><th>E (mV)</th><th>open</th><th>Vm − E</th><th>net flow</th></tr></thead>";
  const tbody = htmlEl("tbody", "", "", table);
  const rows: Record<Ion, HTMLTableCellElement[]> = {} as never;
  IONS.forEach(ion => {
    const tr = htmlEl("tr", "", "", tbody);
    const cells = Array.from({ length: 7 }, () => htmlEl("td", "", "", tr));
    cells[0].innerHTML = `<b style="color:${COLOR[ion]}">${NAME[ion]}</b>`;
    rows[ion] = cells;
  });
  const formula = htmlEl("div", "qb-readout cb-formula", "", main);
  const presetText = htmlEl("div", "qb-note", "", main);
  // optional particle view (2/2): remove this block to drop it
  let part: { update(s: State, V: number): void; destroy(): void } | null = null;
  checkbox(main, "Show ions moving through the open channels (particle view)", d.particles === "on", v => {
    if (v && !part) part = mountParticles(partBox, st, ghk(st));
    if (!v && part) { part.destroy(); part = null; }
  });
  const partBox = htmlEl("div", "cb-particles", "", main);
  if (d.particles === "on") part = mountParticles(partBox, st, ghk(st));

  // ---- controls
  const panel = htmlEl("div", "qb-panel cb-panel", "", host);
  htmlEl("div", "cb-h", "Presets", panel);
  const pBtns = presets(panel, PRESETS.map(p => ({ label: p.label, apply: () => { st = p.make(); presetText.textContent = p.text; syncSliders(); update(); } })));
  const cLido = checkbox(panel, "lidocaine (blocks the Na⁺ channels that open)", st.lidocaine, v => { st.lidocaine = v; update(); });
  const sl: Record<Ion, Slider[]> = {} as never;
  // permeability slider on a log scale: value = log10(P)
  IONS.forEach(ion => {
    const box = htmlEl("div", "cb-ion", "", panel);
    box.style.borderLeftColor = COLOR[ion];
    const h = htmlEl("div", "cb-h", NAME[ion], box); h.style.color = COLOR[ion];
    sl[ion] = [
      slider(box, "inside", 1, 200, 1, st.cin[ion], v => { st.cin[ion] = v; update(); }, v => v + " mM"),
      slider(box, "outside", 1, 200, 1, st.cout[ion], v => { st.cout[ion] = v; update(); }, v => v + " mM"),
      slider(box, "open channels", -3, 2, 0.01, Math.log10(st.P[ion]), v => { st.P[ion] = +Math.pow(10, v).toPrecision(2); update(); }, v => fmtP(+Math.pow(10, v).toPrecision(2))),
    ];
  });
  htmlEl("div", "qb-note", "Open channels = permeability relative to K⁺ at rest (log scale). Only the ratios matter.", panel);

  function syncSliders() {
    IONS.forEach(ion => { sl[ion][0].set(st.cin[ion]); sl[ion][1].set(st.cout[ion]); sl[ion][2].set(Math.log10(st.P[ion])); });
    cLido.checked = st.lidocaine;
  }

  function update() {
    const V = ghk(st);
    const P = effP(st);
    big.innerHTML = `Membrane potential <span style="color:#e8590c">${sign(V)} mV</span>`;
    vm.setAttribute("transform", `translate(${sx(V)} 0)`);
    vmLab.textContent = `Vm ${sign(V)} mV` + (V < VMIN || V > VMAX ? " (off scale)" : "");
    // Nernst lines, labels in two rows so they do not overlap
    const E: Record<Ion, number> = { K: nernst(st, "K"), Na: nernst(st, "Na"), Cl: nernst(st, "Cl") };
    const order = [...IONS].sort((a, b) => E[a] - E[b]);
    let lastX = -1e9, row = 0;
    for (const ion of order) {
      const x = sx(E[ion]);
      row = x - lastX < 92 ? 1 - row : 0;
      lastX = x;
      const L = eLines[ion];
      L.g.setAttribute("transform", `translate(${x} 0)`);
      L.lab.setAttribute("y", String(AY - 70 - row * 22));
      L.lab.innerHTML = `E<tspan font-size="12" dy="4">${ion}</tspan><tspan dy="-4"> ${sign(E[ion])}${E[ion] < VMIN || E[ion] > VMAX ? " (off scale)" : ""}</tspan>`;
      L.line.setAttribute("y1", String(AY - 66 - row * 22));
    }
    // table
    let maxNet = 1e-9;
    const net: Record<Ion, number> = { K: 0, Na: 0, Cl: 0 };
    IONS.forEach(ion => { const f = fluxes(st, ion, V); net[ion] = f.eff - f.inf; maxNet = Math.max(maxNet, Math.abs(net[ion])); });
    IONS.forEach(ion => {
      const c = rows[ion];
      c[1].textContent = String(st.cin[ion]);
      c[2].textContent = String(st.cout[ion]);
      c[3].textContent = sign(E[ion]);
      c[4].textContent = fmtP(P[ion]) + (ion === "Na" && st.lidocaine && st.P.Na > P.Na ? " (block)" : "");
      c[5].textContent = sign(V - E[ion]);
      const rel = Math.abs(net[ion]) / maxNet;
      const dir = rel < 0.02 ? "≈ 0" : net[ion] > 0 ? "out" : "in";
      c[6].innerHTML = `<span class="cb-bar" style="width:${(rel * 44).toFixed(0)}px;background:${COLOR[ion]}"></span> ${dir}`;
    });
    // formulas with the numbers
    const Pk = P.K, Pn = P.Na, Pc = P.Cl;
    formula.textContent =
      `Nernst: E = (${RTF.toFixed(1)} mV / z) · ln(c_out / c_in)\n`
      + IONS.map(ion => `  E${NAME[ion]} = ${(RTF / Z[ion]).toFixed(1)} × ln(${st.cout[ion]}/${st.cin[ion]}) = ${sign(E[ion], 1)} mV`).join("\n")
      + `\nGoldman: Vm = ${RTF.toFixed(1)} × ln[(PK·Kout + PNa·Naout + PCl·Clin) / (PK·Kin + PNa·Nain + PCl·Clout)]\n`
      + `  = ${RTF.toFixed(1)} × ln[(${fmtP(Pk)}·${st.cout.K} + ${fmtP(Pn)}·${st.cout.Na} + ${fmtP(Pc)}·${st.cin.Cl}) / (${fmtP(Pk)}·${st.cin.K} + ${fmtP(Pn)}·${st.cin.Na} + ${fmtP(Pc)}·${st.cout.Cl})]\n`
      + `  = ${sign(V, 1)} mV`;
    pBtns.forEach(b => b.classList.remove("active"));
    part?.update(st, V);                                 // optional particle view
  }

  const p0 = PRESETS.find(p => p.key === d.preset) ?? PRESETS[0];
  presetText.textContent = p0.text;
  pBtns[PRESETS.indexOf(p0)].classList.add("active");
  update();
  pBtns[PRESETS.indexOf(p0)].classList.add("active");
  // presets() highlights the clicked button; update() clears it, so re-mark after presets apply
  pBtns.forEach((b, k) => b.addEventListener("click", () => b.classList.add("active")));
});
