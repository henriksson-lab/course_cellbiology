// Resolution and the diffraction limit: two point sources, each blurred into an Airy
// spot by the lens. Change their distance, the wavelength and the numerical aperture
// (or switch to electrons) and see when two spots merge into one.
// Options (data-*): mode = light|electrons, lambda (nm), na, d (nm).
import { autoMount, htmlEl, slider, presets, checkbox, button, svgEl, Slider } from "../lib/ui";
import { airy, rayleigh, sparrow, profile, dipRatio, wavelengthRGB } from "./optics";

type Mode = "light" | "electrons";
const E_LAMBDA = 0.0037;           // nm, electrons accelerated through 100 kV
const N = 260;                     // canvas pixels per side

interface Range { dMin: number; dMax: number; dStep: number; fov: number; unit: string }
const RANGES: Record<Mode, Range> = {
  light: { dMin: 20, dMax: 1400, dStep: 10, fov: 1600, unit: "nm" },
  electrons: { dMin: 0.05, dMax: 3, dStep: 0.01, fov: 4, unit: "nm" },
};

function fmtLen(nm: number): string {
  if (nm >= 1000) return (nm / 1000).toFixed(nm >= 10000 ? 0 : 2).replace(/\.?0+$/, "") + " µm";
  if (nm >= 10) return Math.round(nm) + " nm";
  if (nm >= 1) return nm.toFixed(1) + " nm";
  return nm.toFixed(2) + " nm";
}

autoMount("resolution", host => {
  let mode: Mode = host.dataset.mode === "electrons" ? "electrons" : "light";
  const init = {
    lambda: Number(host.dataset.lambda) || 520,
    na: Number(host.dataset.na) || 1.4,
    d: Number(host.dataset.d) || 300,
  };
  let lambda = init.lambda, na = init.na, d = init.d;
  let alpha = 0.01;                 // electron aperture angle (rad) = NA in vacuum
  let showTrue = true;

  // ---- left: image + profile ----
  const plot = htmlEl("div", "qb-plot res-plot", "", host);
  const imgWrap = htmlEl("div", "res-imgwrap", "", plot);
  const canvas = htmlEl("canvas", "res-canvas", "", imgWrap);
  canvas.width = N; canvas.height = N;
  canvas.setAttribute("aria-label", "Simulated camera image of two point sources");
  const overlay = svgEl("svg", { viewBox: `0 0 ${N} ${N}`, class: "res-overlay" }, imgWrap);
  const mark1 = svgEl("circle", { r: 3.5, fill: "none", stroke: "#fff", "stroke-width": 1.5 }, overlay);
  const mark2 = svgEl("circle", { r: 3.5, fill: "none", stroke: "#fff", "stroke-width": 1.5 }, overlay);
  const sbLine = svgEl("rect", { height: 4, fill: "#fff" }, overlay);
  const sbText = svgEl("text", { "font-size": 14, fill: "#fff", "text-anchor": "end" }, overlay);
  (sbText as SVGTextElement).style.fill = "#fff";
  htmlEl("div", "qb-note", "Drag on the image to move the two points apart or together.", plot);

  const W = 360, H = 170, ml = 8, mr = 8, mt = 14, mb = 26;
  const prof = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "res-profile" }, plot);
  svgEl("line", { x1: ml, x2: W - mr, y1: H - mb, y2: H - mb, class: "axis" }, prof);
  const halfLine = svgEl("line", { x1: ml, x2: W - mr, class: "grid", "stroke-dasharray": "3 3" }, prof);
  const p1 = svgEl("path", { fill: "none", "stroke-width": 1.5, "stroke-dasharray": "5 4" }, prof);
  const p2 = svgEl("path", { fill: "none", "stroke-width": 1.5, "stroke-dasharray": "5 4" }, prof);
  const ps = svgEl("path", { fill: "none", "stroke-width": 3 }, prof);
  const axLab = svgEl("text", { x: W / 2, y: H - 6, "font-size": 13, "text-anchor": "middle" }, prof);
  axLab.textContent = "intensity along the line through both points";

  // ---- right: controls ----
  const panel = htmlEl("div", "qb-panel", "", host);
  const modeRow = htmlEl("div", "qb-presets", "", panel);
  const bLight = button(modeRow, "Light", () => setMode("light"));
  const bElec = button(modeRow, "Electrons (TEM)", () => setMode("electrons"));

  const sliders = htmlEl("div", "res-sliders", "", panel);
  let sD: Slider, sL: Slider | null = null, sNA: Slider | null = null, sA: Slider | null = null;

  const status = htmlEl("div", "qb-big res-status", "", panel);
  const readout = htmlEl("div", "qb-readout", "", panel);
  checkbox(panel, "show the true positions", showTrue, v => { showTrue = v; draw(); });
  const presetBox = htmlEl("div", "", "", panel);
  const note = htmlEl("div", "qb-note", "", panel);

  function buildSliders() {
    sliders.innerHTML = ""; presetBox.innerHTML = "";
    const r = RANGES[mode];
    d = Math.min(r.dMax, Math.max(r.dMin, d));
    sD = slider(sliders, "distance d", r.dMin, r.dMax, r.dStep, d, v => { d = v; draw(); }, fmtLen);
    if (mode === "light") {
      sL = slider(sliders, "wavelength λ", 400, 700, 10, lambda, v => { lambda = v; draw(); }, v => v + " nm");
      sNA = slider(sliders, "NA", 0.1, 1.4, 0.05, na, v => { na = v; draw(); }, v => v.toFixed(2));
      sA = null;
      presets(presetBox, [
        { label: "Dry 10× (NA 0.25)", apply: () => set({ na: 0.25 }) },
        { label: "Dry 40× (NA 0.65)", apply: () => set({ na: 0.65 }) },
        { label: "Oil 100× (NA 1.4)", apply: () => set({ na: 1.4 }) },
        { label: "Blue 450 nm", apply: () => set({ lambda: 450 }) },
        { label: "Red 650 nm", apply: () => set({ lambda: 650 }) },
        { label: "Reset", apply: () => set({ lambda: init.lambda, na: init.na, d: init.d }) },
      ]);
      note.textContent = "Light: NA = n·sin θ, where θ is half the angle of the light cone the objective collects "
        + "and n the refractive index between lens and sample (air 1.0, oil 1.52). Display brightness is "
        + "compressed so that the faint rings are visible.";
    } else {
      sL = null; sNA = null;
      sA = slider(sliders, "aperture angle", 0.002, 0.02, 0.001, alpha, v => { alpha = v; draw(); },
        v => (v * 1000).toFixed(0) + " mrad");
      presets(presetBox, [
        { label: "Reset", apply: () => { alpha = 0.01; d = 0.5; sA!.set(alpha); sD.set(d); draw(); } },
      ]);
      note.textContent = "Electrons accelerated through 100 kV have a wavelength of about 0.004 nm. Lens "
        + "errors force a tiny aperture (about 0.01 rad), so the limit is about 0.2 nm, not 0.004 nm. "
        + "In stained sections of cells the sample itself limits detail to about 1–2 nm.";
    }
    bLight.classList.toggle("active", mode === "light");
    bElec.classList.toggle("active", mode === "electrons");
  }

  function set(v: { lambda?: number; na?: number; d?: number }) {
    if (v.lambda !== undefined) { lambda = v.lambda; sL?.set(lambda); }
    if (v.na !== undefined) { na = v.na; sNA?.set(na); }
    if (v.d !== undefined) { d = v.d; sD.set(d); }
    draw();
  }

  function setMode(m: Mode) {
    if (m === mode) return;
    mode = m;
    d = m === "light" ? init.d : 0.5;
    buildSliders(); draw();
  }

  // drag on the image: the pointer sets the half-distance from the centre
  canvas.style.touchAction = "none";
  overlay.style.touchAction = "none";
  const drag = (ev: PointerEvent) => {
    const rect = imgWrap.getBoundingClientRect();
    const fx = (ev.clientX - rect.left) / rect.width - 0.5;
    const r = RANGES[mode];
    const nd = Math.abs(fx) * 2 * r.fov;
    d = Math.min(r.dMax, Math.max(r.dMin, Math.round(nd / r.dStep) * r.dStep));
    sD.set(d); draw();
  };
  imgWrap.addEventListener("pointerdown", ev => {
    ev.preventDefault();
    imgWrap.setPointerCapture(ev.pointerId);
    drag(ev);
    const up = () => {
      imgWrap.removeEventListener("pointermove", drag);
      imgWrap.removeEventListener("pointerup", up);
      imgWrap.removeEventListener("pointercancel", up);
    };
    imgWrap.addEventListener("pointermove", drag);
    imgWrap.addEventListener("pointerup", up);
    imgWrap.addEventListener("pointercancel", up);
  });

  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(N, N);

  function draw() {
    const r = RANGES[mode];
    const lam = mode === "light" ? lambda : E_LAMBDA;
    const ap = mode === "light" ? na : alpha;
    const dR = rayleigh(lam, ap), dS = sparrow(lam, ap);
    const fov = r.fov, px = fov / N;
    const k = 2 * Math.PI * ap / lam;
    const [cr, cg, cb] = mode === "light" ? wavelengthRGB(lam) : [235, 235, 235];

    // image: incoherent sum of two Airy patterns, brightness compressed (gamma 0.5)
    // so the rings show. Normalise to the brightest point of the sum.
    const peak = Math.max(1, 2 * profile(0, d, lam, ap)[0]);
    let maxI = 0;
    const buf = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const y = (j + 0.5 - N / 2) * px;
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5 - N / 2) * px;
        const r1 = Math.hypot(x + d / 2, y), r2 = Math.hypot(x - d / 2, y);
        const v = airy(k * r1) + airy(k * r2);
        buf[j * N + i] = v;
        if (v > maxI) maxI = v;
      }
    }
    const norm = Math.max(maxI, peak * 0.5, 1e-9);
    for (let p = 0; p < N * N; p++) {
      const g = Math.sqrt(Math.min(1, buf[p] / norm));
      imgData.data[4 * p] = cr * g; imgData.data[4 * p + 1] = cg * g;
      imgData.data[4 * p + 2] = cb * g; imgData.data[4 * p + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    const c1 = N / 2 - d / 2 / px, c2 = N / 2 + d / 2 / px;
    for (const [m, cx] of [[mark1, c1], [mark2, c2]] as const) {
      m.setAttribute("cx", String(cx)); m.setAttribute("cy", String(N / 2));
      m.style.display = showTrue ? "" : "none";
    }
    // scale bar: a 1-2-5 length about a fifth of the field
    const target = fov / 5;
    const e = Math.pow(10, Math.floor(Math.log10(target)));
    const len = [1, 2, 5, 10].map(f => f * e).filter(v => v <= target).pop() ?? e;
    const lpx = len / px;
    sbLine.setAttribute("x", String(N - 14 - lpx)); sbLine.setAttribute("y", String(N - 16));
    sbLine.setAttribute("width", String(lpx));
    sbText.setAttribute("x", String(N - 14)); sbText.setAttribute("y", String(N - 22));
    sbText.textContent = fmtLen(len);

    // profile plot
    let top = 1;
    for (let i = 0; i <= 100; i++) { const [u, v] = profile((i / 100 - 0.5) * fov, d, lam, ap); top = Math.max(top, u + v); }
    const yOf = (I: number) => H - mb - (I / (top * 1.05)) * (H - mb - mt);
    const xOf = (i: number) => ml + (i / 300) * (W - ml - mr);
    let a1 = "", a2 = "", as = "";
    for (let i = 0; i <= 300; i++) {
      const x = (i / 300 - 0.5) * fov;
      const [u, v] = profile(x, d, lam, ap);
      const X = xOf(i).toFixed(1);
      a1 += (i ? "L" : "M") + X + "," + yOf(u).toFixed(1);
      a2 += (i ? "L" : "M") + X + "," + yOf(v).toFixed(1);
      as += (i ? "L" : "M") + X + "," + yOf(u + v).toFixed(1);
    }
    const col = `rgb(${cr},${cg},${cb})`;
    const dark = mode === "light" ? `rgb(${cr * 0.7},${cg * 0.7},${cb * 0.7})` : "#555";
    p1.setAttribute("d", a1); p2.setAttribute("d", a2); as && ps.setAttribute("d", as);
    p1.setAttribute("stroke", col); p2.setAttribute("stroke", col); ps.setAttribute("stroke", dark);
    halfLine.setAttribute("y1", String(yOf(1))); halfLine.setAttribute("y2", String(yOf(1)));

    // verdict
    const dip = dipRatio(d, lam, ap);
    let verdict: string, cls: string;
    if (d >= dR) { verdict = "Resolved: two spots"; cls = "res-ok"; }
    else if (d > dS) { verdict = "Below the Rayleigh limit: a faint dip only"; cls = "res-mid"; }
    else { verdict = "Not resolved: one blob"; cls = "res-bad"; }
    status.textContent = verdict;
    status.className = "qb-big res-status " + cls;
    const lamTxt = mode === "light" ? `λ = ${lam} nm, NA = ${ap.toFixed(2)}` : `λ = 0.0037 nm, NA ≈ ${ap.toFixed(3)}`;
    readout.textContent =
      `${lamTxt}\n` +
      `limit 0.61 λ/NA = ${fmtLen(dR)}\n` +
      `distance d = ${fmtLen(d)} = ${(d / dR).toFixed(2)} × limit\n` +
      `dip between peaks: ${dip >= 0.999 ? "none" : Math.round((1 - dip) * 100) + " %"}`;
  }

  buildSliders();
  draw();
});
