// Dose–response with agonists and antagonists. Receptor occupancy follows the binding
// isotherm; a competitive antagonist raises the apparent K_d by (1 + [B]/K_B) (Gaddum),
// a non-competitive antagonist removes a fraction [N]/([N]+K_N) of the working receptors.
// Response = efficacy × occupancy (simple model: no receptor reserve, no amplification).
// Options (data-*): kd (nM), efficacy (0–1), comp (nM), noncomp (nM).
// Not embedded yet: meant for the signalling lectures (principles of cell communication, GPCRs).
import { autoMount, htmlEl, svgEl, slider, presets, checkbox } from "../lib/ui";

const W = 540, H = 340, ML = 58, MR = 30, MT = 14, MB = 52;
const PW = W - ML - MR, PH = H - MT - MB;
const LMIN = -2, LMAX = 5;          // log10 of agonist concentration in nM: 10 pM … 100 µM
const KB = 10, KN = 10;             // antagonist dissociation constants (nM)

const fmtC = (nM: number) => nM >= 1000 ? +(nM / 1000).toPrecision(2) + " µM" : nM >= 1 ? +nM.toPrecision(2) + " nM" : +(nM * 1000).toPrecision(2) + " pM";

export function model(A: number, kd: number, eff: number, B: number, N: number) {
  const kApp = kd * (1 + B / KB);
  const occ = A / (A + kApp);
  const active = 1 / (1 + N / KN);
  return { occ, resp: eff * occ * active, ec50: kApp, max: eff * active };
}

autoMount("doseresponse", host => {
  const d = host.dataset;
  const init = { kd: Number(d.kd) || 10, eff: Number(d.efficacy) || 1, comp: Number(d.comp) || 0, noncomp: Number(d.noncomp) || 0 };
  let s = { ...init };
  let showOcc = true;

  const plot = htmlEl("div", "qb-plot", "", host);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` }, plot);
  const sx = (l: number) => ML + (l - LMIN) / (LMAX - LMIN) * PW;
  const sy = (v: number) => MT + PH - v * PH;
  for (let l = LMIN; l <= LMAX; l++) {
    svgEl("line", { x1: sx(l), x2: sx(l), y1: MT, y2: MT + PH, class: "grid" }, svg);
    const t = svgEl("text", { x: sx(l), y: MT + PH + 20, "font-size": 13, "text-anchor": "middle" }, svg);
    t.textContent = fmtC(Math.pow(10, l));
  }
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svgEl("line", { x1: ML, x2: ML + PW, y1: sy(v), y2: sy(v), class: "grid" }, svg);
    const t = svgEl("text", { x: ML - 6, y: sy(v) + 4, "font-size": 13, "text-anchor": "end" }, svg);
    t.textContent = Math.round(v * 100) + " %";
  }
  svgEl("rect", { x: ML, y: MT, width: PW, height: PH, fill: "none", class: "axis" }, svg);
  const xl = svgEl("text", { x: ML + PW / 2, y: H - 8, "font-size": 14, "text-anchor": "middle" }, svg);
  xl.textContent = "agonist concentration (log scale) →";
  const ref = svgEl("path", { fill: "none", stroke: "#999", "stroke-width": 2, "stroke-dasharray": "2 4" }, svg);
  const occP = svgEl("path", { fill: "none", stroke: "var(--qb-c1)", "stroke-width": 2, "stroke-dasharray": "7 5" }, svg);
  const respP = svgEl("path", { fill: "none", stroke: "var(--qb-c2)", "stroke-width": 3.5 }, svg);
  const ecLine = svgEl("line", { stroke: "var(--qb-c2)", "stroke-width": 1.5, "stroke-dasharray": "3 3" }, svg);
  const ecDot = svgEl("circle", { r: 5, fill: "var(--qb-c2)" }, svg);
  const legend = htmlEl("div", "qb-note", "", plot);
  legend.innerHTML = '<span style="color:var(--qb-c2)">━ response</span> · <span style="color:var(--qb-c1)">╍ receptors occupied</span> · <span style="color:#999">┈ agonist alone (reference)</span>';

  const panel = htmlEl("div", "qb-panel", "", host);
  const toL = (v: number) => Math.log10(v), fromL = (l: number) => Math.pow(10, l);
  const sKd = slider(panel, "agonist K_d", -1, 3, 0.1, toL(s.kd), l => { s.kd = fromL(l); draw(); }, l => fmtC(fromL(l)));
  const sEff = slider(panel, "efficacy", 0.1, 1, 0.05, s.eff, v => { s.eff = v; draw(); }, v => v.toFixed(2));
  const off = (l: number) => (l <= -0.999 ? 0 : fromL(l));
  const sC = slider(panel, "competitive antag.", -1, 3, 0.1, s.comp ? toL(s.comp) : -1, l => { s.comp = off(l); draw(); }, l => (off(l) ? fmtC(off(l)) : "none"));
  const sN = slider(panel, "non-competitive", -1, 3, 0.1, s.noncomp ? toL(s.noncomp) : -1, l => { s.noncomp = off(l); draw(); }, l => (off(l) ? fmtC(off(l)) : "none"));
  const set = (v: Partial<typeof s>) => {
    s = { ...s, ...v };
    sKd.set(toL(s.kd)); sEff.set(s.eff);
    sC.set(s.comp ? toL(s.comp) : -1); sN.set(s.noncomp ? toL(s.noncomp) : -1);
    // slider outputs show the formatted value through the set() above only as numbers; refresh
    sC.input.dispatchEvent(new Event("input")); sN.input.dispatchEvent(new Event("input"));
    sKd.input.dispatchEvent(new Event("input")); sEff.input.dispatchEvent(new Event("input"));
  };
  presets(panel, [
    { label: "Full agonist", apply: () => set({ eff: 1, comp: 0, noncomp: 0 }) },
    { label: "Partial agonist", apply: () => set({ eff: 0.4, comp: 0, noncomp: 0 }) },
    { label: "+ competitive antagonist", apply: () => set({ comp: 100, noncomp: 0 }) },
    { label: "+ non-competitive", apply: () => set({ comp: 0, noncomp: 30 }) },
    { label: "Reset", apply: () => set({ ...init }) },
  ]);
  checkbox(panel, "show receptor occupancy", showOcc, v => { showOcc = v; draw(); });
  const readout = htmlEl("div", "qb-readout", "", panel);
  htmlEl("div", "qb-note", "Simple model, illustrative numbers: response proportional to occupancy (no spare receptors). "
    + "Antagonist K_B = K_N = 10 nM.", panel);

  function curve(f: (A: number) => number): string {
    let p = "";
    for (let i = 0; i <= 200; i++) {
      const l = LMIN + (LMAX - LMIN) * i / 200;
      p += (i ? "L" : "M") + sx(l).toFixed(1) + "," + sy(f(fromL(l))).toFixed(1);
    }
    return p;
  }
  function draw() {
    const m = (A: number) => model(A, s.kd, s.eff, s.comp, s.noncomp);
    ref.setAttribute("d", curve(A => model(A, s.kd, s.eff, 0, 0).resp));
    respP.setAttribute("d", curve(A => m(A).resp));
    occP.setAttribute("d", curve(A => m(A).occ));
    occP.style.display = showOcc ? "" : "none";
    const r = m(1);
    const lx = Math.min(LMAX, Math.max(LMIN, toL(r.ec50)));
    ecLine.setAttribute("x1", String(sx(lx))); ecLine.setAttribute("x2", String(sx(lx)));
    ecLine.setAttribute("y1", String(sy(0))); ecLine.setAttribute("y2", String(sy(r.max / 2)));
    ecDot.setAttribute("cx", String(sx(lx))); ecDot.setAttribute("cy", String(sy(r.max / 2)));
    readout.textContent =
      `EC50 = ${fmtC(r.ec50)}   (agonist alone: ${fmtC(s.kd)})\n` +
      `maximal response = ${Math.round(r.max * 100)} %\n` +
      `shift of EC50: × ${(r.ec50 / s.kd).toFixed(1)}`;
  }
  draw();
});
