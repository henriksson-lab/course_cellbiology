// Dose–response with real drugs. Two drugs compete for the same receptor (binding isotherm);
// the response follows the operational model (amplification, spare receptors), see model.ts.
// The x-axis is either drug 1 (a dose–response curve: EC50) or drug 2 added to a fixed
// concentration of drug 1 (an inhibition curve: IC50). Receptors can be removed
// (desensitisation, irreversible blocker), and amplification switched off (then EC50 = K_d).
// No animation: the curves change only when the student moves a control.
// Options (data-*): scenario = one of the SCENARIOS keys below.
import { autoMount, htmlEl, svgEl, slider, presets, checkbox, button } from "../lib/ui";
import { Drug, Cell, RECEPTORS, ReceptorKey, respond, midpoint, fmtC, maxAlone, tauFromMax } from "./model";

const W = 540, H = 360, ML = 80, MR = 30, MT = 14, MB = 60;
const PW = W - ML - MR, PH = H - MT - MB;
const LMIN = -3, LMAX = 5;          // log10 concentration in nM: 1 pM … 100 µM
const C_RESP = "#1b2a3a", C_OCC1 = "#1f77b4", C_OCC2 = "#e8590c", C_REF = "#999";

interface State {
  rec: ReceptorKey; d1: Drug; d2: Drug | null;
  c1: number; c2: number;            // fixed concentrations (nM): c1 used when x = drug 2, c2 when x = drug 1
  xDrug: 1 | 2; cell: Cell;
}
const drug = (rec: ReceptorKey, name: string): Drug => ({ ...RECEPTORS[rec].drugs.find(d => d.name === name)! });

const SCENARIOS: { key: string; label: string; make: () => State; text: string }[] = [
  { key: "morphine", label: "Morphine (full agonist)",
    make: () => ({ rec: "opioid", d1: drug("opioid", "morphine"), d2: null, c1: 1, c2: 0, xDrug: 1, cell: { receptors: 1, amplification: true } }),
    text: "Morphine on the μ-opioid receptor of a nerve cell. Compare the response curve with the occupancy curve: thanks to amplification, half of the maximal response needs only a few per cent of the receptors." },
  { key: "bup", label: "Buprenorphine (partial agonist)",
    make: () => ({ rec: "opioid", d1: drug("opioid", "buprenorphine"), d2: null, c1: 1, c2: 0, xDrug: 1, cell: { receptors: 1, amplification: true } }),
    text: "Buprenorphine binds the μ-opioid receptor more tightly than morphine (lower Kd), but switches it on less well: even with every receptor occupied, the response stays at half. Used against pain and to treat opioid addiction." },
  { key: "naloxoneShift", label: "Morphine + naloxone",
    make: () => ({ rec: "opioid", d1: drug("opioid", "morphine"), d2: drug("opioid", "naloxone"), c1: 1, c2: 15, xDrug: 1, cell: { receptors: 1, amplification: true } }),
    text: "Naloxone (15 nM, ten times its Kd) competes with morphine for the same site. Enough morphine still wins: the curve moves to the right, but reaches the same top." },
  { key: "naloxoneRescue", label: "Naloxone reverses morphine",
    make: () => ({ rec: "opioid", d1: drug("opioid", "morphine"), d2: drug("opioid", "naloxone"), c1: 1, c2: 0, xDrug: 2, cell: { receptors: 1, amplification: true } }),
    text: "Think of an overdose: morphine at 1 nM switches on almost all of the response (dotted line). The x-axis is now the naloxone concentration. Naloxone, the emergency antidote, pushes morphine off the receptors." },
  { key: "bupBlocks", label: "Buprenorphine on top of morphine",
    make: () => ({ rec: "opioid", d1: drug("opioid", "morphine"), d2: drug("opioid", "buprenorphine"), c1: 1, c2: 0, xDrug: 2, cell: { receptors: 1, amplification: true } }),
    text: "A patient with morphine in the body gets buprenorphine (x-axis). Buprenorphine binds tighter, replaces morphine on the receptors, and switches them on only half-way." },
  { key: "betablocker", label: "Noradrenaline + metoprolol",
    make: () => ({ rec: "beta", d1: drug("beta", "noradrenaline"), d2: drug("beta", "metoprolol"), c1: 100, c2: 250, xDrug: 1, cell: { receptors: 1, amplification: true } }),
    text: "Heart muscle: noradrenaline from nerves acts on β₁-adrenergic receptors and speeds up the heart. Metoprolol, a beta-blocker, competes with noradrenaline for the same site. 250 nM is in the range of blood levels in treated patients." },
];

const CSS = `
.dr .dr-plot { flex: 1 1 360px; min-width: 0; max-width: 600px; }
.dr .dr-panel { flex: 1 1 320px; min-width: 0; max-width: 440px; }
.dr .dr-title { font-weight: 600; margin-bottom: .2em; }
.dr .dr-svg { width: 100%; height: auto; }
.dr .dr-legend { display: flex; flex-wrap: wrap; gap: .1em 1em; font-size: .88em; }
.dr .dr-legend span { white-space: nowrap; }
.dr .dr-row { display: grid; grid-template-columns: 4.6em minmax(0, 1fr); gap: .5em; align-items: center; }
.dr .dr-row b { font-weight: 600; }
.dr select { font: inherit; font-size: .95em; padding: .2em .3em; min-height: 40px; width: 100%; color: var(--qb-fg); background: var(--qb-bg); }
.dr .qb-presets .qb-btn { min-height: 40px; }
.dr .qb-slider { grid-template-columns: 8.4em minmax(0, 1fr) 4.9em; }
.dr .qb-slider-name { white-space: normal; }
.dr details { border-top: 1px solid #ddd; padding-top: .4em; }
.dr details > summary { cursor: pointer; font-weight: 600; min-height: 32px; }
.dr details[open] > div { display: flex; flex-direction: column; gap: .55em; margin-top: .3em; }
.dr .dr-h { font-weight: 600; font-size: .95em; margin-top: .2em; }
.dr .dr-scenario { margin-top: .4em; }
@media (max-width: 640px) {
  .dr .dr-plot, .dr .dr-panel { max-width: 100%; width: 100%; flex-basis: auto; }
  .dr .qb-slider { grid-template-columns: 7em minmax(0, 1fr) 4.6em; }
}`;

autoMount("doseresponse", host => {
  host.classList.add("dr");
  if (!document.getElementById("dr-style")) {
    const st = document.createElement("style"); st.id = "dr-style"; st.textContent = CSS; document.head.appendChild(st);
  }
  const start = SCENARIOS.find(s => s.key === host.dataset.scenario) ?? SCENARIOS[0];
  let s: State = start.make();
  let scenarioText = start.text;
  const toL = Math.log10, fromL = (l: number) => Math.pow(10, l);

  // ---- plot
  const plot = htmlEl("div", "dr-plot", "", host);
  const title = htmlEl("div", "dr-title", "", plot);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "dr-svg", role: "img" }, plot);
  const sx = (l: number) => ML + (Math.max(LMIN, Math.min(LMAX, l)) - LMIN) / (LMAX - LMIN) * PW;
  const sy = (v: number) => MT + PH - v * PH;
  for (let l = LMIN; l <= LMAX; l++) {
    svgEl("line", { x1: sx(l), x2: sx(l), y1: MT, y2: MT + PH, class: "grid" }, svg);
    svgEl("line", { x1: sx(l), x2: sx(l), y1: MT + PH, y2: MT + PH + 5, class: "axis" }, svg);
    if ((l - LMIN) % 2) continue;
    const t = svgEl("text", { x: sx(l), y: MT + PH + 22, "font-size": 16, "text-anchor": "middle" }, svg);
    t.textContent = fmtC(fromL(l));
  }
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svgEl("line", { x1: ML, x2: ML + PW, y1: sy(v), y2: sy(v), class: "grid" }, svg);
    const t = svgEl("text", { x: ML - 6, y: sy(v) + 5, "font-size": 16, "text-anchor": "end" }, svg);
    t.textContent = Math.round(v * 100) + " %";
  }
  svgEl("rect", { x: ML, y: MT, width: PW, height: PH, fill: "none", class: "axis" }, svg);
  const xl = svgEl("text", { x: ML + PW / 2, y: H - 10, "font-size": 17, "text-anchor": "middle" }, svg);
  const yl = svgEl("text", { x: 16, y: MT + PH / 2, "font-size": 17, "text-anchor": "middle", transform: `rotate(-90 16 ${MT + PH / 2})` }, svg);
  yl.textContent = "response or occupancy";
  const ref = svgEl("path", { fill: "none", stroke: C_REF, "stroke-width": 2.5, "stroke-dasharray": "2 4" }, svg);
  const occ1 = svgEl("path", { fill: "none", stroke: C_OCC1, "stroke-width": 2, "stroke-dasharray": "8 5" }, svg);
  const occ2 = svgEl("path", { fill: "none", stroke: C_OCC2, "stroke-width": 2, "stroke-dasharray": "8 5" }, svg);
  const respP = svgEl("path", { fill: "none", stroke: C_RESP, "stroke-width": 3.5 }, svg);
  const kdMark = svgEl("g", {}, svg);
  svgEl("path", { d: "M0,0 L-7,-12 L7,-12 Z", fill: C_OCC1 }, kdMark);
  const kdLab = svgEl("text", { x: 0, y: -16, "font-size": 16, "text-anchor": "middle", "font-weight": 700 }, kdMark);
  kdLab.textContent = "K";
  const sub = svgEl("tspan", { dy: 4, "font-size": 12 }, kdLab); sub.textContent = "d";
  const ecLine = svgEl("line", { stroke: C_RESP, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  const ecDot = svgEl("circle", { r: 6, fill: "#fff", stroke: C_RESP, "stroke-width": 3 }, svg);
  const ecLab = svgEl("text", { "font-size": 17, "font-weight": 700 }, svg);
  const legend = htmlEl("div", "dr-legend", "", plot);
  const scen = htmlEl("div", "qb-note dr-scenario", "", plot);

  // ---- panel
  const panel = htmlEl("div", "qb-panel dr-panel", "", host);
  htmlEl("div", "dr-h", "Scenarios", panel);
  const scenBtns = presets(panel, SCENARIOS.map(sc => ({ label: sc.label, apply: () => { s = sc.make(); scenarioText = sc.text; sync(); } })));
  scenBtns[SCENARIOS.indexOf(start)].classList.add("active");
  const clearActive = () => scenBtns.forEach(b => b.classList.remove("active"));

  htmlEl("div", "dr-h", "Receptor and drugs", panel);
  const recRow = htmlEl("div", "dr-row", "", panel);
  htmlEl("b", "", "receptor", recRow);
  const recSel = htmlEl("select", "", "", recRow);
  for (const k of Object.keys(RECEPTORS) as ReceptorKey[]) recSel.add(new Option(RECEPTORS[k].label, k));
  const row1 = htmlEl("div", "dr-row", "", panel);
  htmlEl("b", "", "drug 1", row1).style.color = C_OCC1;
  const sel1 = htmlEl("select", "", "", row1);
  const row2 = htmlEl("div", "dr-row", "", panel);
  htmlEl("b", "", "drug 2", row2).style.color = C_OCC2;
  const sel2 = htmlEl("select", "", "", row2);
  const fillSelects = () => {
    sel1.innerHTML = ""; sel2.innerHTML = "";
    sel2.add(new Option("none", ""));
    for (const d of RECEPTORS[s.rec].drugs) {
      sel1.add(new Option(`${d.name}: ${d.role}`, d.name));
      sel2.add(new Option(`${d.name}: ${d.role}`, d.name));
    }
  };
  const blurAfter = (e: HTMLSelectElement) => e.addEventListener("change", () => e.blur());
  [recSel, sel1, sel2].forEach(blurAfter);
  recSel.addEventListener("change", () => {
    const rec = recSel.value as ReceptorKey;
    const ds = RECEPTORS[rec].drugs;
    s = { ...s, rec, d1: { ...ds[0] }, d2: null, xDrug: 1, c1: rec === "beta" ? 100 : 1, c2: 0 };
    scenarioText = ""; clearActive(); sync();
  });
  sel1.addEventListener("change", () => { s.d1 = drug(s.rec, sel1.value); scenarioText = ""; clearActive(); sync(); });
  sel2.addEventListener("change", () => {
    s.d2 = sel2.value ? drug(s.rec, sel2.value) : null;
    if (s.d2 && s.xDrug === 1 && s.c2 === 0) s.c2 = 10 * s.d2.kd;
    if (!s.d2) s.xDrug = 1;
    scenarioText = ""; clearActive(); sync();
  });

  htmlEl("div", "dr-h", "What is on the x-axis?", panel);
  const modeRow = htmlEl("div", "qb-presets", "", panel);
  const modeA = button(modeRow, "drug 1: dose–response (EC50)", () => { s.xDrug = 1; clearActive(); sync(); });
  const modeB = button(modeRow, "drug 2: inhibition (IC50)", () => {
    if (!s.d2) { s.d2 = { ...RECEPTORS[s.rec].drugs.find(d => d.tau === 0)! }; }
    s.xDrug = 2; clearActive(); sync();
  });
  // fixed concentration of the drug that is not on the x-axis; left end of drug 2's slider = none
  const NONE = LMIN - 0.5;
  const sConc = slider(panel, "", NONE, LMAX, 0.1, 0, l => {
    if (s.xDrug === 1) s.c2 = l <= NONE + 0.01 ? 0 : fromL(l); else s.c1 = fromL(l);
    clearActive(); draw();
  }, l => (l <= NONE + 0.01 && s.xDrug === 1 ? "none" : fmtC(fromL(l))));
  const concName = sConc.input.parentElement!.querySelector(".qb-slider-name") as HTMLElement;
  const readout = htmlEl("div", "qb-readout", "", panel);

  const det = htmlEl("details", "", "", panel);
  htmlEl("summary", "", "Change the drugs and the cell", det);
  const dbox = htmlEl("div", "", "", det);
  const MAXM = 0.98;
  const sKd1 = slider(dbox, "drug 1 Kd", LMIN, LMAX, 0.05, 0, l => { s.d1.kd = fromL(l); edited(); }, l => fmtC(fromL(l)));
  const sM1 = slider(dbox, "drug 1 efficacy (max alone)", 0, MAXM, 0.01, 0, m => { s.d1.tau = tauFromMax(m); edited(); }, m => Math.round(m * 100) + " %");
  const sKd2 = slider(dbox, "drug 2 Kd", LMIN, LMAX, 0.05, 0, l => { if (s.d2) s.d2.kd = fromL(l); edited(); }, l => fmtC(fromL(l)));
  const sM2 = slider(dbox, "drug 2 efficacy (max alone)", 0, MAXM, 0.01, 0, m => { if (s.d2) s.d2.tau = tauFromMax(m); edited(); }, m => Math.round(m * 100) + " %");
  const sRec = slider(dbox, "receptors left", 0.01, 1, 0.01, 1, v => { s.cell.receptors = v; clearActive(); draw(); }, v => Math.round(v * 100) + " %");
  htmlEl("div", "qb-note", "Fewer receptors: desensitisation (receptors taken into the cell) or an irreversible blocker.", dbox);
  const cbAmp = checkbox(dbox, "amplification (spare receptors)", true, v => { s.cell.amplification = v; clearActive(); draw(); });
  function edited() { clearActive(); scenarioText = ""; draw(); }

  htmlEl("div", "qb-note",
    "Model: the binding isotherm for two drugs competing for one site, and the operational model of Black and Leff for the response. "
    + "Kd values are rounded literature values (they vary several-fold between assays); efficacies and amplification are illustrative. "
    + "Equilibrium only: buprenorphine's very slow release from the receptor is not modelled.", panel);

  // ---- drawing
  function sync() {
    recSel.value = s.rec; fillSelects();
    sel1.value = s.d1.name; sel2.value = s.d2 ? s.d2.name : "";
    sRec.set(s.cell.receptors); cbAmp.checked = s.cell.amplification;
    draw();
  }
  function curve(f: (c: number) => number): string {
    let p = "";
    for (let i = 0; i <= 240; i++) {
      const l = LMIN + (LMAX - LMIN) * i / 240;
      p += (i ? "L" : "M") + sx(l).toFixed(1) + "," + sy(f(fromL(l))).toFixed(1);
    }
    return p;
  }
  const lib = (d: Drug) => RECEPTORS[s.rec].drugs.find(x => x.name === d.name);
  const label = (d: Drug) => { const o = lib(d); return o && o.kd === d.kd && o.tau === d.tau ? d.name : d.name + " (edited)"; };

  function draw() {
    const { d1, d2, cell } = s;
    if (!d2) s.xDrug = 1;
    const x1 = s.xDrug === 1;
    // sliders that show the drugs
    sKd1.set(toL(d1.kd)); sM1.set(Math.min(MAXM, maxAlone(d1.tau)));
    sKd2.set(toL(d2 ? d2.kd : 1)); sM2.set(d2 ? Math.min(MAXM, maxAlone(d2.tau)) : 0);
    sKd2.input.disabled = sM2.input.disabled = !d2;
    modeA.classList.toggle("active", x1); modeB.classList.toggle("active", !x1);
    const n1 = label(d1), n2 = d2 ? label(d2) : "";
    concName.textContent = x1 ? `${d2 ? n2 : "drug 2"} added` : `${n1} present`;
    sConc.set(x1 ? (s.c2 > 0 ? toL(s.c2) : NONE) : toL(s.c1));
    sConc.input.disabled = x1 && !d2;
    title.textContent = `${RECEPTORS[s.rec].short}: ` + (x1
      ? `${n1}` + (d2 && s.c2 > 0 ? ` with ${fmtC(s.c2)} ${n2}` : " alone")
      : `${n2} added to ${fmtC(s.c1)} ${n1}`);
    xl.textContent = (x1 ? n1 : n2) + " concentration (log scale)";

    const at = (c: number) => x1 ? respond(d1, c, d2, s.c2, cell) : respond(d1, s.c1, d2, c, cell);
    respP.setAttribute("d", curve(c => at(c).resp));
    occ1.setAttribute("d", curve(c => at(c).p1));
    const show2 = !!d2 && (!x1 || s.c2 > 0);
    occ2.setAttribute("d", show2 ? curve(c => at(c).p2) : "");
    // reference: drug 1 alone in a normal cell (x = drug 1), or the level with drug 1 alone (x = drug 2)
    const full: Cell = { receptors: 1, amplification: cell.amplification };
    const refF = x1 ? (c: number) => respond(d1, c, null, 0, full).resp : () => respond(d1, s.c1, null, 0, cell).resp;
    const changed = x1 ? (show2 || cell.receptors < 1) : true;
    ref.setAttribute("d", changed ? curve(refF) : "");

    const xd = x1 ? d1 : d2!;
    const lk = toL(xd.kd);
    kdMark.style.display = lk >= LMIN && lk <= LMAX ? "" : "none";
    kdMark.setAttribute("transform", `translate(${sx(lk)} ${MT + PH})`);
    (kdMark.firstChild as SVGPathElement).setAttribute("fill", x1 ? C_OCC1 : C_OCC2);
    kdLab.style.fill = x1 ? C_OCC1 : C_OCC2;

    const mp = midpoint(c => at(c).resp);
    const word = mp.rising ? "EC50" : "IC50";
    const lines: string[] = [];
    if (mp.c50 !== null && toL(mp.c50) >= LMIN && toL(mp.c50) <= LMAX) {
      const lx = toL(mp.c50), yv = (mp.lo + mp.hi) / 2;
      ecLine.setAttribute("x1", String(sx(lx))); ecLine.setAttribute("x2", String(sx(lx)));
      ecLine.setAttribute("y1", String(sy(0))); ecLine.setAttribute("y2", String(sy(yv)));
      ecDot.setAttribute("cx", String(sx(lx))); ecDot.setAttribute("cy", String(sy(yv)));
      const right = sx(lx) < ML + PW - 70;
      ecLab.setAttribute("x", String(sx(lx) + (right ? 10 : -10)));
      ecLab.setAttribute("y", String(sy(yv) + (mp.rising ? -8 : 18)));
      ecLab.setAttribute("text-anchor", right ? "start" : "end");
      ecLab.textContent = word;
      [ecLine, ecDot, ecLab].forEach(e => e.style.display = "");
    } else [ecLine, ecDot, ecLab].forEach(e => e.style.display = "none");

    if (mp.c50 === null) lines.push(`no ${x1 ? "effect" : "change"} over this range`);
    else lines.push(`${word} = ${fmtC(mp.c50)}`);
    lines.push(`Kd of ${xd.name} = ${fmtC(xd.kd)}`);
    if (mp.c50 !== null) lines.push(`occupancy at ${word}: ${Math.round((x1 ? at(mp.c50).p1 : at(mp.c50).p2) * 100)} %`);
    lines.push(`response: ${Math.round(mp.lo * 100)} % → ${Math.round(mp.hi * 100)} %`);
    if (x1 && changed && mp.c50 !== null) {
      const r0 = midpoint(refF).c50;
      if (r0) lines.push(`EC50 shift: × ${(mp.c50 / r0).toFixed(1)}`);
    }
    readout.textContent = lines.join("\n");

    legend.innerHTML =
      `<span style="color:${C_RESP}">━ response</span>` +
      `<span style="color:${C_OCC1}">╍ receptors with ${n1}</span>` +
      (show2 ? `<span style="color:${C_OCC2}">╍ receptors with ${n2}</span>` : "") +
      (changed ? `<span style="color:#777">┈ ${x1 ? `${n1} alone` + (cell.receptors < 1 ? ", all receptors" : "") : `${n1} alone`}</span>` : "") +
      `<span style="color:${x1 ? C_OCC1 : C_OCC2}">▼ K<sub>d</sub> of ${x1 ? n1 : n2}</span>`;
    scen.textContent = scenarioText;
  }
  sync();
});
