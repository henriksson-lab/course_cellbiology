// FRAP lab. A membrane patch seen from above with thousands of fluorescent molecules doing
// 2D random walks. Tap to bleach a spot; the recovery curve (fraction of bright molecules
// in the spot) is fitted with the exact curve for a circular bleach (Soumpasis), giving the
// mobile fraction, t½ and D. Second mode: Frye–Edidin cell fusion (two colours mix).
// Options (data-*): mode = frap|fusion, mol = lipid|small|large, seed, n.
import { autoMount, htmlEl, svgEl, slider, button, presets, checkbox, Slider } from "../lib/ui";
import { pointRenderer, makePoints, visibleLoop, hexRGB } from "../lib/particles";
import { Sim, MOLS, MolKey, Mode, Fluidity, DEFAULT_FLUID, SPOT_R, FUSION_R, fluidity, analyse, soumpasis, Sample, Analysis } from "./sim";

const GREEN = hexRGB("#5ee27f"), DARK = hexRGB("#4a524c"), RED = hexRGB("#ff5a5f"), MOUSE = hexRGB("#3fcf5c"), YELLOW = hexRGB("#ffd43b");
const PW = 440, PH = 230, ML = 50, MR = 14, MT = 12, MB = 40;
const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 240, 600];
const FUSION_SPEED = 1;                 // default: real time (students can speed up)

function niceCeil(v: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (f * e >= v) return f * e;
  return 10 * e;
}
const fmtT = (s: number) => s >= 100 ? s.toFixed(0) : s >= 10 ? s.toFixed(1) : s.toFixed(2);

autoMount("frap", host => {
  host.classList.add("fr");
  const d = host.dataset;
  const seed = Number(d.seed) || 1;
  let mode: Mode = d.mode === "fusion" ? "fusion" : "frap";
  let mol: MolKey = (d.mol as MolKey) in MOLS ? d.mol as MolKey : "lipid";
  let n = Number(d.n) || 8000;
  let immobile = 0;
  const fluid: Fluidity = { ...DEFAULT_FLUID };
  let speed = MOLS[mol].speed;
  let sim!: Sim;
  let samples: Sample[] = [], pre = 1, fit: Analysis | null = null, lastFit = 0;
  let follow = -1, followPick = 0;
  let track: number[] = [];
  let mix: Sample[] = [];

  // ---- view
  const view = htmlEl("div", "fr-view", "", host);
  const modeRow = htmlEl("div", "qb-presets", "", view);
  const bFrap = button(modeRow, "FRAP", () => setMode("frap"));
  const bFus = button(modeRow, "Cell fusion (Frye–Edidin)", () => setMode("fusion"));
  const stage = htmlEl("div", "fr-stage", "", view);
  const glc = htmlEl("canvas", "fr-canvas", "", stage);
  const ovl = htmlEl("canvas", "fr-canvas", "", stage);
  glc.setAttribute("aria-label", "Membrane seen from above with fluorescent molecules");
  const status = htmlEl("div", "fr-status", "", view);
  const hint = htmlEl("div", "qb-note", "", view);
  const tools = htmlEl("div", "qb-presets", "", view);
  const bPause = button(tools, "Pause", () => { loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  const bFollow = button(tools, "Follow one molecule", () => {
    if (follow >= 0 && bFollow.classList.contains("active")) { follow = -1; track = []; bFollow.classList.remove("active"); loop.redraw(); return; }
    // pick a mobile molecule (seeded: the k-th mobile one in a fixed order)
    const step = 7919;
    for (let k = 0; k < sim.n; k++) {
      const i = ((followPick + k) * step) % sim.n;
      if (!sim.fixed[i]) { follow = i; followPick += k + 1; break; }
    }
    track = [sim.x[follow], sim.y[follow]];
    bFollow.classList.add("active"); loop.redraw();
  });
  const bReset = button(tools, "Reset", () => rebuild());

  // ---- side panel
  const side = htmlEl("div", "qb-panel fr-side", "", host);
  const plotTitle = htmlEl("div", "fr-title", "", side);
  const svg = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "fr-plot" }, side);
  const axes = svgEl("g", {}, svg);
  const gPlateau = svgEl("line", { stroke: "#868e96", "stroke-dasharray": "4 4" }, svg);
  const gFit = svgEl("path", { fill: "none", stroke: "#e8590c", "stroke-width": 2.5, "stroke-dasharray": "7 4" }, svg);
  const gData = svgEl("path", { fill: "none", stroke: "#2b8a3e", "stroke-width": 1.6 }, svg);
  const gHalf = svgEl("g", {}, svg);
  const readout = htmlEl("div", "qb-readout", "", side);

  const molBox = htmlEl("div", "", "", side);
  htmlEl("div", "fr-h", "Molecule", molBox);
  const molBtns = presets(molBox, (Object.keys(MOLS) as MolKey[]).map(k => ({
    label: k === "lipid" ? "lipid" : k === "small" ? "small protein" : "large protein",
    apply: () => { mol = k; speed = mode === "frap" ? MOLS[k].speed : FUSION_SPEED; sSpeed.value = String(speed); rebuild(); },
  })));
  const sImm = slider(side, "immobile (anchored)", 0, 0.9, 0.05, immobile, v => { immobile = v; rebuild(); }, v => Math.round(v * 100) + " %");
  const sN = slider(side, "molecules", 1000, 40000, 1000, n, v => { n = v; rebuild(); }, v => (v / 1000) + "k");
  const flBox = htmlEl("div", "fr-fluid", "", side);
  htmlEl("div", "fr-h", "Membrane fluidity (qualitative)", flBox);
  const fl: Slider[] = [
    slider(flBox, "tail length", 14, 24, 2, fluid.tail, v => { fluid.tail = v; setD(); }, v => v + " C"),
    slider(flBox, "double bonds", 0, 3, 1, fluid.db, v => { fluid.db = v; setD(); }, v => String(v)),
    slider(flBox, "cholesterol", 0, 0.5, 0.05, fluid.chol, v => { fluid.chol = v; setD(); }, v => Math.round(v * 100) + " %"),
    slider(flBox, "temperature", 0, 40, 1, fluid.temp, v => { fluid.temp = v; setD(); }, v => v + " °C"),
  ];
  const fluidOut = htmlEl("div", "qb-note", "", flBox);
  button(flBox, "Default membrane", () => {
    Object.assign(fluid, DEFAULT_FLUID);
    fl[0].set(fluid.tail); fl[1].set(fluid.db); fl[2].set(fluid.chol); fl[3].set(fluid.temp); setD();
  });
  const spRow = htmlEl("label", "qb-slider", "", side);
  htmlEl("span", "qb-slider-name", "time runs at", spRow);
  const sSpeed = htmlEl("select", "fr-select", "", spRow);
  for (const v of SPEEDS) { const o = htmlEl("option", "", v + "× real time", sSpeed); o.value = String(v); }
  sSpeed.value = String(speed);
  sSpeed.addEventListener("change", () => { speed = Number(sSpeed.value); sSpeed.blur(); });
  const note = htmlEl("div", "qb-note", "", side);

  // ---- rendering
  const pts = makePoints(40001);
  const rend = pointRenderer(glc, 15, 15, [0.04, 0.05, 0.06, 1]);
  const octx = ovl.getContext("2d")!;

  function setD() {
    sim.setD(mol, fluid);
    const f = fluidity(fluid);
    fluidOut.textContent = `fluidity × ${f >= 0.1 ? f.toFixed(2) : f.toFixed(3)} of the default membrane → D(${mode === "frap" ? MOLS[mol].name : "protein"}) = ${fmtD(sim.D)} µm²/s`;
  }
  const fmtD = (D: number) => D >= 0.1 ? D.toFixed(2) : D >= 0.01 ? D.toFixed(3) : D.toPrecision(2);

  function setMode(m: Mode) {
    mode = m;
    if (m === "fusion" && mol === "lipid") mol = "small";
    speed = m === "frap" ? MOLS[mol].speed : FUSION_SPEED;
    sSpeed.value = String(speed);
    rebuild();
  }

  function rebuild() {
    sim = new Sim({ n, mode, mol, fluid, immobile, seed });
    rend.setWorld(sim.W, sim.H);
    samples = []; mix = []; fit = null; follow = -1; track = []; followPick = 0;
    bFollow.classList.remove("active");
    bFrap.classList.toggle("active", mode === "frap"); bFus.classList.toggle("active", mode === "fusion");
    molBtns.forEach((b, k) => b.classList.toggle("active", (Object.keys(MOLS) as MolKey[])[k] === mol));
    if (mode === "frap") {
      plotTitle.textContent = "Recovery: fraction of the molecules in the spot that are bright";
      hint.textContent = "Click or tap the membrane to bleach a spot (radius 1.5 µm). Tap again to bleach a new spot.";
      note.textContent = "Model: each molecule takes random steps (2D diffusion); bleached molecules go dark but keep moving. "
        + "Anchored molecules only jiggle in a small corral (as if held by the cytoskeleton). The patch is 15 µm wide and "
        + "wraps around at the edges. The fluidity sliders change the step size by a qualitative rule (shorter or kinked "
        + "tails and warmth: more fluid; long saturated tails and cold: gel; cholesterol: a buffer), not by measured "
        + "values. The fit is the exact curve for a circular bleach: D = 0.224 w²/t½ with w = 1.5 µm.";
    } else {
      plotTitle.textContent = "Mixing: red (human) molecules in the left half of the cell";
      hint.textContent = "A mouse cell (green surface proteins) fused with a human cell (red). Watch the colours mix. Try 37 °C, then the cold.";
      note.textContent = "Model: the same random walk on the membrane of the fused cell, drawn as a flat disc 40 µm across "
        + "(a simplification of the surface of a sphere). The molecules cannot leave the cell. Fully mixed = 50 % red in each half. "
        + "Time is simulated, in minutes.";
    }
    setD();
    drawAxes();
    loop?.redraw();
  }

  // ---- plot
  let xMax = 10;
  const sx = (t: number) => ML + t / xMax * (PW - ML - MR);
  const yLo = () => mode === "frap" ? 0 : 0.4, yHi = () => mode === "frap" ? 1.1 : 1.0;
  const sy = (f: number) => MT + (1 - (f - yLo()) / (yHi() - yLo())) * (PH - MT - MB);
  function drawAxes() {
    axes.innerHTML = "";
    const x0 = ML, x1 = PW - MR, y0 = PH - MB;
    svgEl("line", { x1: x0, x2: x1, y1: y0, y2: y0, class: "axis" }, axes);
    svgEl("line", { x1: x0, x2: x0, y1: MT, y2: y0, class: "axis" }, axes);
    const unit = mode === "frap" ? 1 : 60;
    const ticks = 5, step = xMax / unit / ticks;
    for (let k = 0; k <= ticks; k++) {
      const v = k * step, X = sx(v * unit);
      svgEl("line", { x1: X, x2: X, y1: y0, y2: y0 + 4, class: "axis" }, axes);
      const t = svgEl("text", { x: X, y: y0 + 18, "font-size": 13, "text-anchor": "middle" }, axes);
      t.textContent = +v.toPrecision(3) + "";
    }
    const yt = mode === "frap" ? [0, 0.25, 0.5, 0.75, 1] : [0.5, 0.75, 1];
    for (const v of yt) {
      const Y = sy(v);
      svgEl("line", { x1: x0, x2: x1, y1: Y, y2: Y, class: "grid" }, axes);
      const t = svgEl("text", { x: x0 - 6, y: Y + 4, "font-size": 13, "text-anchor": "end" }, axes);
      t.textContent = Math.round(v * 100) + " %";
    }
    const xl = svgEl("text", { x: (x0 + x1) / 2, y: PH - 6, "font-size": 13, "text-anchor": "middle" }, axes);
    xl.textContent = mode === "frap" ? "time after the bleach (s)" : "time after fusion (min)";
  }

  function updatePlot() {
    const ser = mode === "frap" ? samples : mix;
    const tNow = ser.length ? ser[ser.length - 1].t : 0;
    const want = niceCeil(Math.max(speed * 10, tNow * 1.05, 1e-3));
    if (want !== xMax) { xMax = want; drawAxes(); }
    // polyline, at most ~500 vertices
    const stride = Math.max(1, Math.floor(ser.length / 500));
    let p = "";
    for (let i = 0; i < ser.length; i += stride) p += (p ? "L" : "M") + sx(ser[i].t).toFixed(1) + "," + sy(ser[i].f).toFixed(1);
    gData.setAttribute("d", p);
    gData.setAttribute("stroke", mode === "frap" ? "#2b8a3e" : "#c92a2a");
    gHalf.innerHTML = "";
    if (mode === "frap" && fit && fit.shown) {
      let q = "";
      for (let k = 0; k <= 120; k++) {
        const t = xMax * k / 120;
        q += (q ? "L" : "M") + sx(t).toFixed(1) + "," + sy(fit.f0 + (fit.plateau - fit.f0) * soumpasis(t, fit.tauD)).toFixed(1);
      }
      gFit.setAttribute("d", q);
      for (const [a, v] of [["y1", sy(fit.plateau)], ["y2", sy(fit.plateau)], ["x1", ML], ["x2", PW - MR]] as const) gPlateau.setAttribute(a, String(v));
      gPlateau.style.display = "";
      const hy = sy(fit.f0 + (fit.plateau - fit.f0) / 2), hx = sx(fit.thalf);
      if (fit.thalf < xMax) {
        svgEl("line", { x1: hx, x2: hx, y1: hy, y2: PH - MB, stroke: "#e8590c", "stroke-dasharray": "2 3" }, gHalf);
        svgEl("circle", { cx: hx, cy: hy, r: 4, fill: "#e8590c" }, gHalf);
        const t = svgEl("text", { x: hx + 6, y: PH - MB - 6, "font-size": 13, fill: "#e8590c" }, gHalf);
        t.textContent = "t½"; (t as SVGTextElement).style.fill = "#e8590c";
      }
    } else { gFit.setAttribute("d", ""); gPlateau.style.display = "none"; }
  }

  function updateReadout() {
    if (mode === "fusion") {
      const m = mix.length ? mix[mix.length - 1].f : 1;
      readout.textContent = `time after fusion: ${(sim.t / 60).toFixed(1)} min\n`
        + `red molecules in the left half: ${(m * 100).toFixed(0)} %\n`
        + `mixing done: ${Math.max(0, Math.min(100, (1 - m) / 0.5 * 100)).toFixed(0)} %`;
      return;
    }
    if (!sim.spot) { readout.textContent = "Tap the membrane to bleach a spot."; return; }
    const tNow = sim.t - sim.spot.t;
    const cur = samples.length ? samples[samples.length - 1].f : 0;
    let s = `time after bleach: ${fmtT(tNow)} s\nbright in spot now: ${(cur * 100).toFixed(0)} %\n`;
    if (fit && fit.shown) {
      s += `fit${fit.ok ? "" : " (provisional: keep watching)"}:\n`
        + `  plateau ${(fit.plateau * 100).toFixed(0)} %  → mobile fraction ${(fit.mobile * 100).toFixed(0)} %\n`
        + `  t½ = ${fmtT(fit.thalf)} s  → D = 0.224 w²/t½ = ${fmtD(fit.D)} µm²/s`;
    } else s += "fit: waiting for more data …";
    readout.textContent = s;
  }

  // ---- interaction: bleach
  stage.addEventListener("pointerdown", ev => {
    if (mode !== "frap") return;
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * sim.W, y = (ev.clientY - r.top) / r.height * sim.H;
    pre = sim.spotFraction(x, y);
    sim.bleach(x, y);
    samples = [{ t: 0, f: sim.spotFraction(x, y) }];
    fit = null; lastFit = 0;
    loop.redraw();
  });

  // ---- simulation step (60 per real second)
  function step() {
    const dt = speed / 60;
    sim.step(dt);
    if (mode === "frap" && sim.spot) {
      samples.push({ t: sim.t - sim.spot.t, f: sim.spotFraction(sim.spot.x, sim.spot.y) });
      if (samples.length > 6000) samples = samples.filter((_, i) => i % 2 === 0 || i === samples.length - 1);
    }
    if (mode === "fusion") {
      if (!mix.length || sim.t - mix[mix.length - 1].t >= speed / 30) mix.push({ t: sim.t, f: sim.redLeft() });
    }
    if (follow >= 0) {
      const lx = track[track.length - 2], ly = track[track.length - 1];
      const nx = sim.x[follow], ny = sim.y[follow];
      if (Math.abs(nx - lx) > sim.W / 2 || Math.abs(ny - ly) > sim.H / 2) track.push(NaN, NaN);
      track.push(nx, ny);
      if (track.length > 12000) track.splice(0, 2000);
    }
  }

  let frames = 0;
  function render() {
    // points
    const N = sim.n, sz = sim.mol.size * (sim.W / 15) * (mode === "fusion" ? 0.75 : 1);
    pts.n = N;
    for (let i = 0; i < N; i++) {
      pts.pos[2 * i] = sim.x[i]; pts.pos[2 * i + 1] = sim.y[i];
      pts.size[i] = sz;
      const c = mode === "frap" ? (sim.label[i] ? DARK : GREEN) : (sim.label[i] ? RED : MOUSE);
      const k = 4 * i; pts.col[k] = c[0]; pts.col[k + 1] = c[1]; pts.col[k + 2] = c[2]; pts.col[k + 3] = 255;
    }
    if (follow >= 0) {      // draw the followed molecule last, larger, in yellow
      const k = N;
      pts.pos[2 * k] = sim.x[follow]; pts.pos[2 * k + 1] = sim.y[follow]; pts.size[k] = Math.max(sz * 2.2, 0.35 * sim.W / 15);
      pts.col[4 * k] = YELLOW[0]; pts.col[4 * k + 1] = YELLOW[1]; pts.col[4 * k + 2] = YELLOW[2]; pts.col[4 * k + 3] = 255;
      pts.n = N + 1;
    }
    rend.draw(pts);

    // overlay: spot, cell outline, track, scale bar
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(ovl.clientWidth * dpr), h = Math.round(ovl.clientHeight * dpr);
    if (ovl.width !== w || ovl.height !== h) { ovl.width = w; ovl.height = h; }
    const k = w / sim.W;
    octx.clearRect(0, 0, w, h);
    octx.lineWidth = 2 * dpr;
    if (mode === "frap" && sim.spot) {
      octx.strokeStyle = "rgba(255,255,255,.8)"; octx.setLineDash([6 * dpr, 5 * dpr]);
      octx.beginPath(); octx.arc(sim.spot.x * k, sim.spot.y * k, SPOT_R * k, 0, 6.2832); octx.stroke();
      octx.setLineDash([]);
    }
    if (mode === "fusion") {
      octx.strokeStyle = "rgba(255,255,255,.55)";
      octx.beginPath(); octx.arc(FUSION_R * k, FUSION_R * k, FUSION_R * k - dpr, 0, 6.2832); octx.stroke();
    }
    if (follow >= 0 && track.length > 2) {
      octx.strokeStyle = "rgba(255,212,59,.85)"; octx.lineWidth = 1.5 * dpr;
      octx.beginPath(); let pen = false;
      for (let i = 0; i < track.length; i += 2) {
        const X = track[i], Y = track[i + 1];
        if (Number.isNaN(X)) { pen = false; continue; }
        if (pen) octx.lineTo(X * k, Y * k); else { octx.moveTo(X * k, Y * k); pen = true; }
      }
      octx.stroke();
    }
    const bar = mode === "frap" ? 2 : 10;
    octx.fillStyle = "rgba(0,0,0,.65)"; octx.fillRect(w - 20 * dpr - bar * k, h - 38 * dpr, bar * k + 16 * dpr, 32 * dpr);
    octx.fillStyle = "#fff"; octx.fillRect(w - 12 * dpr - bar * k, h - 14 * dpr, bar * k, 4 * dpr);
    octx.font = `${13 * dpr}px system-ui, sans-serif`; octx.textAlign = "right";
    octx.fillText(bar + " µm", w - 12 * dpr, h - 20 * dpr);

    const clock = mode === "frap" ? `t = ${fmtT(sim.t)} s` : `t = ${(sim.t / 60).toFixed(1)} min`;
    status.textContent = `${clock} · time runs at ${speed}× real time${rend.webgl ? "" : " · (no WebGL: slower drawing)"}`;
    // fit about twice a second
    frames++;
    if (mode === "frap" && sim.spot && (frames - lastFit > 30 || !fit) && samples.length >= 20) {
      const stride = Math.max(1, Math.floor(samples.length / 600));
      fit = analyse(pre, samples.filter((_, i) => i % stride === 0));
      lastFit = frames;
    }
    updatePlot();
    updateReadout();
  }

  let loop: ReturnType<typeof visibleLoop>;
  rebuild();
  loop = visibleLoop(host, 1 / 60, step, render, 3);
  loop.redraw();
});
