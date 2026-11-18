// Flow cytometry gating game. A simulated blood sample: draw or adjust a gate on forward
// vs side scatter, then read the CD4/CD8 quadrants of the gated cells. "Check my gate"
// compares the result with the true composition of the simulated sample.
// Options (data-*): sample = healthy|hiv, seed.
import { autoMount, htmlEl, svgEl, button, checkbox, presets, svgPoint, draggable } from "../lib/ui";
import { SAMPLES, simulate, inPoly, quadrant, Cell, CellType, Quad } from "./sim";

const VB = 420, ML = 58, MR = 12, MT = 12, MB = 50;
const PW = VB - ML - MR, PH = VB - MT - MB;
const TYPE_COL: Record<CellType, string> = { debris: "#8c8c8c", lymph: "#1f77b4", mono: "#9467bd", gran: "#e8790c" };
const TYPE_NAME: Record<CellType, string> = { debris: "debris", lymph: "lymphocytes", mono: "monocytes", gran: "granulocytes" };
const Q_NAME: Record<Quad, string> = { CD4: "CD4 T cells (CD4+ CD8−)", CD8: "CD8 T cells (CD4− CD8+)", DN: "neither (CD4− CD8−)", DP: "both (CD4+ CD8+)" };
const START_GATE: [number, number][] = [[200, 40], [650, 40], [650, 420], [200, 420]];
const pct = (a: number, b: number) => (b ? (100 * a / b) : 0);
const f0 = (v: number) => v.toFixed(0) + " %";

interface Plot { wrap: HTMLDivElement; canvas: HTMLCanvasElement; svg: SVGSVGElement; layer: SVGGElement }

function makePlot(parent: Element, title: string, xlab: string, ylab: string,
  xticks: [number, string][], yticks: [number, string][], sx: (v: number) => number, sy: (v: number) => number): Plot {
  const box = htmlEl("div", "fg-plotbox", "", parent);
  htmlEl("div", "fg-title", title, box);
  const wrap = htmlEl("div", "fg-wrap", "", box);
  const canvas = htmlEl("canvas", "fg-canvas", "", wrap);
  canvas.width = VB * 2; canvas.height = VB * 2;
  const svg = svgEl("svg", { viewBox: `0 0 ${VB} ${VB}`, class: "fg-svg" }, wrap);
  svgEl("rect", { x: ML, y: MT, width: PW, height: PH, fill: "none", class: "axis" }, svg);
  for (const [v, t] of xticks) {
    svgEl("line", { x1: sx(v), x2: sx(v), y1: MT + PH, y2: MT + PH + 5, class: "axis" }, svg);
    const e = svgEl("text", { x: sx(v), y: MT + PH + 20, "font-size": 14, "text-anchor": "middle" }, svg); e.textContent = t;
  }
  for (const [v, t] of yticks) {
    svgEl("line", { x1: ML - 5, x2: ML, y1: sy(v), y2: sy(v), class: "axis" }, svg);
    const e = svgEl("text", { x: ML - 8, y: sy(v) + 5, "font-size": 14, "text-anchor": "end" }, svg); e.textContent = t;
  }
  const xl = svgEl("text", { x: ML + PW / 2, y: VB - 8, "font-size": 15, "text-anchor": "middle" }, svg); xl.textContent = xlab;
  const yl = svgEl("text", { x: 16, y: MT + PH / 2, "font-size": 15, "text-anchor": "middle", transform: `rotate(-90 16 ${MT + PH / 2})` }, svg);
  yl.textContent = ylab;
  const layer = svgEl("g", {}, svg);
  return { wrap, canvas, svg, layer };
}

autoMount("flowgate", host => {
  host.classList.add("fg");
  let sampleKey = host.dataset.sample && SAMPLES[host.dataset.sample] ? host.dataset.sample : "healthy";
  const seed = Number(host.dataset.seed) || 1;
  let cells: Cell[] = simulate(SAMPLES[sampleKey], seed);
  let gate: [number, number][] = START_GATE.map(p => [...p] as [number, number]);
  let t4 = 2.0, t8 = 2.0;
  let showTypes = false, drawing = false, checked = false;

  // scales: scatter 0–1023 linear; fluorescence log10 0–4.5
  const sx1 = (v: number) => ML + v / 1023 * PW, sy1 = (v: number) => MT + PH - v / 1023 * PH;
  const ix1 = (x: number) => (x - ML) / PW * 1023, iy1 = (y: number) => (MT + PH - y) / PH * 1023;
  const sx2 = (v: number) => ML + v / 4.5 * PW, sy2 = (v: number) => MT + PH - v / 4.5 * PH;
  const ix2 = (x: number) => (x - ML) / PW * 4.5, iy2 = (y: number) => (MT + PH - y) / PH * 4.5;
  const lin: [number, string][] = [0, 256, 512, 768, 1023].map(v => [v, String(v === 1023 ? "1k" : v)]);
  const logT: [number, string][] = [0, 1, 2, 3, 4].map(v => [v, v === 0 ? "1" : "10" + "⁰¹²³⁴"[v]]);

  const plots = htmlEl("div", "fg-plots", "", host);
  const p1 = makePlot(plots, "1. All events: draw the lymphocyte gate", "forward scatter (size) →", "side scatter (granularity) →", lin, lin, sx1, sy1);
  const p2 = makePlot(plots, "2. Gated cells: CD4 and CD8", "CD4 antibody fluorescence →", "CD8 antibody fluorescence →", logT, logT, sx2, sy2);

  // ---- gate polygon (plot 1)
  const gPoly = svgEl("polygon", { class: "fg-gate" }, p1.layer);
  const gHandles = svgEl("g", {}, p1.layer);
  const lasso = svgEl("polyline", { class: "fg-lasso" }, p1.layer);
  const drawRect = svgEl("rect", { x: ML, y: MT, width: PW, height: PH, fill: "transparent", class: "fg-drawrect" }, p1.svg);
  const gLabel = svgEl("text", { "font-size": 15, class: "fg-gatelabel" }, p1.layer);

  function buildHandles() {
    gHandles.innerHTML = "";
    gate.forEach((p, k) => {
      const h = svgEl("g", { class: "fg-handle" }, gHandles);
      svgEl("circle", { r: 18, fill: "transparent" }, h);
      svgEl("circle", { r: 7, class: "handle", stroke: "#1b2a3a" }, h);
      h.setAttribute("transform", `translate(${sx1(p[0])},${sy1(p[1])})`);
      draggable(h as unknown as SVGElement, e => svgPoint(p1.svg, e), (x, y) => {
        gate[k] = [Math.min(1023, Math.max(0, ix1(x))), Math.min(1023, Math.max(0, iy1(y)))];
        update();
      });
    });
  }
  // drag the whole gate
  gPoly.style.cursor = "move"; gPoly.style.touchAction = "none";
  gPoly.addEventListener("pointerdown", ev => {
    if (drawing) return;
    ev.preventDefault();
    gPoly.setPointerCapture(ev.pointerId);
    let [lx, ly] = svgPoint(p1.svg, ev);
    const move = (e: PointerEvent) => {
      const [x, y] = svgPoint(p1.svg, e);
      const dx = (x - lx) / PW * 1023, dy = -(y - ly) / PH * 1023;
      lx = x; ly = y;
      gate = gate.map(([a, b]) => [a + dx, b + dy] as [number, number]);
      update();
    };
    const up = () => { gPoly.removeEventListener("pointermove", move); gPoly.removeEventListener("pointerup", up); gPoly.removeEventListener("pointercancel", up); };
    gPoly.addEventListener("pointermove", move); gPoly.addEventListener("pointerup", up); gPoly.addEventListener("pointercancel", up);
  });
  // lasso: draw a new gate
  drawRect.style.touchAction = "none";
  drawRect.addEventListener("pointerdown", ev => {
    if (!drawing) return;
    ev.preventDefault();
    drawRect.setPointerCapture(ev.pointerId);
    const pts: [number, number][] = [svgPoint(p1.svg, ev)];
    const move = (e: PointerEvent) => {
      const q = svgPoint(p1.svg, e), l = pts[pts.length - 1];
      if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 3) pts.push(q);
      lasso.setAttribute("points", pts.map(p => p.join(",")).join(" "));
    };
    const up = () => {
      drawRect.removeEventListener("pointermove", move); drawRect.removeEventListener("pointerup", up); drawRect.removeEventListener("pointercancel", up);
      lasso.setAttribute("points", "");
      setDrawing(false);
      if (pts.length >= 3) {
        // simplify: keep points at least 18 viewBox units apart, at most 10 vertices
        const kept: [number, number][] = [pts[0]];
        for (const p of pts) { const l = kept[kept.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) >= 18) kept.push(p); }
        const step = Math.ceil(kept.length / 10);
        const poly = kept.filter((_, i) => i % step === 0);
        if (poly.length >= 3) {
          gate = poly.map(([x, y]) => [Math.min(1023, Math.max(0, ix1(x))), Math.min(1023, Math.max(0, iy1(y)))] as [number, number]);
          buildHandles();
        }
      }
      update();
    };
    drawRect.addEventListener("pointermove", move); drawRect.addEventListener("pointerup", up); drawRect.addEventListener("pointercancel", up);
  });

  // ---- quadrant cross (plot 2)
  const qv = svgEl("line", { y1: MT, y2: MT + PH, class: "fg-quad" }, p2.layer);
  const qh = svgEl("line", { x1: ML, x2: ML + PW, class: "fg-quad" }, p2.layer);
  const qLabels: Record<Quad, SVGTextElement> = {
    CD8: svgEl("text", { x: ML + 8, y: MT + 22, "font-size": 16, class: "fg-qlab" }, p2.layer),
    DP: svgEl("text", { x: ML + PW - 8, y: MT + 22, "font-size": 16, "text-anchor": "end", class: "fg-qlab" }, p2.layer),
    DN: svgEl("text", { x: ML + 8, y: MT + PH - 10, "font-size": 16, class: "fg-qlab" }, p2.layer),
    CD4: svgEl("text", { x: ML + PW - 8, y: MT + PH - 10, "font-size": 16, "text-anchor": "end", class: "fg-qlab" }, p2.layer),
  };
  const qHandle = svgEl("g", { class: "fg-handle" }, p2.layer);
  svgEl("circle", { r: 20, fill: "transparent" }, qHandle);
  svgEl("circle", { r: 8, class: "handle", stroke: "#e8590c" }, qHandle);
  draggable(qHandle as unknown as SVGElement, e => svgPoint(p2.svg, e), (x, y) => {
    t4 = Math.min(4.3, Math.max(0.2, ix2(x))); t8 = Math.min(4.3, Math.max(0.2, iy2(y)));
    update();
  });

  // ---- panel
  const panel = htmlEl("div", "qb-panel fg-panel", "", host);
  const sampleRow = presets(panel, Object.entries(SAMPLES).map(([k, s]) => ({
    label: s.name, apply: () => { sampleKey = k; cells = simulate(SAMPLES[k], seed); checked = false; update(); },
  })));
  sampleRow.forEach((b, i) => b.classList.toggle("active", Object.keys(SAMPLES)[i] === sampleKey));
  const row = htmlEl("div", "qb-presets", "", panel);
  const bDraw = button(row, "Draw a new gate", () => setDrawing(!drawing));
  button(row, "Reset gate", () => { gate = START_GATE.map(p => [...p] as [number, number]); t4 = t8 = 2; checked = false; buildHandles(); update(); });
  button(row, "Check my gate", () => { checked = true; update(); }, "fg-check");
  checkbox(panel, "show the true cell types (colours)", showTypes, v => { showTypes = v; update(); });
  const legend = htmlEl("div", "fg-legend", "", panel);
  for (const t of ["lymph", "mono", "gran", "debris"] as CellType[]) {
    const s = htmlEl("span", "", TYPE_NAME[t], legend); s.style.setProperty("--dot", TYPE_COL[t]);
  }
  const readout = htmlEl("div", "qb-readout", "", panel);
  const feedback = htmlEl("div", "fg-feedback", "", panel);
  htmlEl("div", "qb-note", "Drag the corners or the whole gate, or press “Draw a new gate” and draw around a cloud. "
    + "Drag the orange point to move the quadrant lines. Simulated data, illustrative numbers.", panel);

  function setDrawing(on: boolean) {
    drawing = on;
    bDraw.classList.toggle("active", on);
    bDraw.textContent = on ? "Drawing: drag around a cloud…" : "Draw a new gate";
    drawRect.style.pointerEvents = on ? "all" : "none";
    p1.wrap.classList.toggle("fg-drawing", on);
  }

  // ---- drawing
  const ctx1 = p1.canvas.getContext("2d")!, ctx2 = p2.canvas.getContext("2d")!;
  function dots(ctx: CanvasRenderingContext2D, list: Cell[], xy: (c: Cell) => [number, number], col: (c: Cell) => string) {
    ctx.clearRect(0, 0, VB * 2, VB * 2);
    for (const c of list) {
      const [x, y] = xy(c);
      ctx.fillStyle = col(c);
      ctx.fillRect(x * 2 - 1.6, y * 2 - 1.6, 3.2, 3.2);
    }
  }

  function update() {
    const inGate = cells.map(c => inPoly(c.fsc, c.ssc, gate));
    const gated = cells.filter((_, i) => inGate[i]);
    dots(ctx1, cells, c => [sx1(c.fsc), sy1(c.ssc)],
      showTypes ? (c => TYPE_COL[c.type]) : (c => (inPoly(c.fsc, c.ssc, gate) ? "rgba(31,119,180,.75)" : "rgba(60,60,60,.45)")));
    dots(ctx2, gated, c => [sx2(c.cd4), sy2(c.cd8)], showTypes ? (c => TYPE_COL[c.type]) : (() => "rgba(31,119,180,.7)"));
    legend.style.display = showTypes ? "" : "none";

    gPoly.setAttribute("points", gate.map(([a, b]) => `${sx1(a)},${sy1(b)}`).join(" "));
    gHandles.querySelectorAll<SVGGElement>(".fg-handle").forEach((h, k) => {
      if (gate[k]) h.setAttribute("transform", `translate(${sx1(gate[k][0])},${sy1(gate[k][1])})`);
    });
    const top = gate.reduce((a, b) => (b[1] > a[1] ? b : a));
    gLabel.setAttribute("x", String(sx1(top[0]))); gLabel.setAttribute("y", String(sy1(top[1]) - 10));
    gLabel.textContent = `gate: ${f0(pct(gated.length, cells.length))}`;

    qv.setAttribute("x1", String(sx2(t4))); qv.setAttribute("x2", String(sx2(t4)));
    qh.setAttribute("y1", String(sy2(t8))); qh.setAttribute("y2", String(sy2(t8)));
    qHandle.setAttribute("transform", `translate(${sx2(t4)},${sy2(t8)})`);
    const q: Record<Quad, number> = { CD4: 0, CD8: 0, DN: 0, DP: 0 };
    for (const c of gated) q[quadrant(c, t4, t8)]++;
    for (const k of Object.keys(q) as Quad[]) qLabels[k].textContent = f0(pct(q[k], gated.length));

    readout.textContent =
      `events in gate: ${gated.length} of ${cells.length} (${f0(pct(gated.length, cells.length))})\n` +
      (Object.keys(q) as Quad[]).map(k => `${Q_NAME[k].padEnd(25)} ${f0(pct(q[k], gated.length)).padStart(5)}`).join("\n") +
      `\nCD4/CD8 ratio: ${q.CD8 ? (q.CD4 / q.CD8).toFixed(2) : "–"}`;

    feedback.innerHTML = "";
    if (checked) check(gated, q);
  }

  function check(gated: Cell[], q: Record<Quad, number>) {
    const lymph = cells.filter(c => c.type === "lymph");
    const lymphIn = gated.filter(c => c.type === "lymph").length;
    const purity = pct(lymphIn, gated.length), recovery = pct(lymphIn, lymph.length);
    const truth: Record<Quad, number> = { CD4: 0, CD8: 0, DN: 0, DP: 0 };
    for (const c of lymph) truth[c.sub as Quad]++;
    const line = (cls: string, html: string) => { const d = htmlEl("div", cls, "", feedback); d.innerHTML = html; };
    line("", `<b>Purity</b>: ${f0(purity)} of the gated events are lymphocytes. <b>Recovery</b>: the gate holds ${f0(recovery)} of all lymphocytes.`);
    const others = (["mono", "gran", "debris"] as CellType[]).map(t => [t, gated.filter(c => c.type === t).length] as const).filter(([, n]) => n > 0);
    if (purity < 95 && others.length) {
      line("fg-bad", "Not pure: the gate also holds " + others.map(([t, n]) => `${n} ${TYPE_NAME[t]}`).join(", ")
        + ". Monocytes carry a little CD4 and granulocytes carry neither marker, so they distort the percentages.");
    } else line("fg-ok", "Pure lymphocyte gate.");
    if (recovery < 70) line("fg-bad", "The gate misses many lymphocytes: fewer cells counted means more random error.");
    // does a quadrant line cut through a population?
    const pos4 = gated.filter(c => c.type === "lymph" && (c.sub === "CD4" || c.sub === "DP"));
    const neg4 = gated.filter(c => c.type === "lymph" && (c.sub === "CD8" || c.sub === "DN"));
    const pos8 = gated.filter(c => c.type === "lymph" && (c.sub === "CD8" || c.sub === "DP"));
    const neg8 = gated.filter(c => c.type === "lymph" && (c.sub === "CD4" || c.sub === "DN"));
    const cut = (a: Cell[], f: (c: Cell) => boolean) => (a.length ? pct(a.filter(f).length, a.length) : 0);
    if (cut(pos4, c => c.cd4 < t4) > 3 || cut(neg4, c => c.cd4 >= t4) > 3)
      line("fg-bad", "The vertical (CD4) line cuts through a cloud: put it in the gap between the negative and the positive cells.");
    else if (cut(pos8, c => c.cd8 < t8) > 3 || cut(neg8, c => c.cd8 >= t8) > 3)
      line("fg-bad", "The horizontal (CD8) line cuts through a cloud: put it in the gap between the negative and the positive cells.");
    const rows = (Object.keys(q) as Quad[]).map(k =>
      `<tr><td>${Q_NAME[k]}</td><td>${f0(pct(q[k], gated.length))}</td><td>${f0(pct(truth[k], lymph.length))}</td></tr>`).join("");
    line("", `<table class="fg-table"><tr><th></th><th>yours</th><th>true</th></tr>${rows}</table>`);
    const err = Math.max(...(Object.keys(q) as Quad[]).map(k => Math.abs(pct(q[k], gated.length) - pct(truth[k], lymph.length))));
    line(err <= 2 ? "fg-ok" : "fg-bad", err <= 2 ? "All four percentages are within 2 points of the truth. Well gated!"
      : `Your percentages differ from the truth by up to ${err.toFixed(0)} points.`);
  }

  setDrawing(false);
  buildHandles();
  update();
});
