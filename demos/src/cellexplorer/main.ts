// Cell explorer: one FIB-SEM plane through a HeLa cell (OpenOrganelle jrc_hela-2) with
// organelle outlines from the COSEM segmentations (checked and corrected by hand).
// Pan/zoom with mouse, wheel and touch (CSS transform on a plain <img> + SVG overlay),
// toggle layers, tap an organelle for a description, scale bar, and a quiz mode.
// Options (data-*): img = URL of the EM image (required), height = viewer height in px,
// mode = "measure" adds a third mode, Measure (point counting, pH and Ca²⁺ per
// compartment; see measureui.ts), and starts in it. Without it the explorer has only
// Explore and Find the organelle.
import { autoMount, htmlEl, svgEl, button, rng } from "../lib/ui";
import { CLASSES, OrgClass } from "./classes";
import { createMeasure } from "./measureui";
import data from "./outlines.json";

type Ring = number[][];
interface Shape { cls: OrgClass; rings: Ring[]; bbox: [number, number, number, number]; area: number; el?: SVGPathElement }

const W = data.width, H = data.height, NM = data.nmPerPx;

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function inRing(x: number, y: number, r: Ring): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distRing(x: number, y: number, r: Ring): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = r[j], [bx, by] = r[i];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}
const pathD = (rings: Ring[]) => rings.map(r => "M" + r.map(p => p[0] + "," + p[1]).join("L") + "Z").join("");

function niceLength(maxNm: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(maxNm)));
  return [5, 2, 1].map(f => f * e).find(v => v <= maxNm) ?? e;
}
const fmtNm = (nm: number) => nm >= 1000 ? +(nm / 1000).toPrecision(3) + " µm" : Math.round(nm) + " nm";

autoMount("cellexplorer", host => {
  host.classList.add("cx");
  const imgUrl = host.dataset.img || "";
  const viewH = Number(host.dataset.height) || 0;
  const withMeasure = host.dataset.mode === "measure";

  // ---------------- data
  const shapes: Shape[] = [];
  const shapesData = data.shapes as Record<string, number[][][][]>;
  for (const cls of CLASSES) {
    for (const rings of shapesData[cls.id] ?? []) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const area = ringArea(rings[0]) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0);
      shapes.push({ cls, rings, bbox: [x0, y0, x1, y1], area });
    }
  }
  const visible = new Map<string, boolean>(CLASSES.map(c => [c.id, true]));

  // ---------------- layout
  const view = htmlEl("div", "cx-view", "", host);
  if (viewH) view.style.height = viewH + "px";
  else view.style.aspectRatio = `${W} / ${H}`;
  const stage = htmlEl("div", "cx-stage", "", view);
  stage.style.width = W + "px"; stage.style.height = H + "px";
  const img = htmlEl("img", "cx-img", "", stage);
  img.src = imgUrl; img.alt = "Electron micrograph: one slice through a HeLa cell (FIB-SEM)";
  img.width = W; img.height = H; img.draggable = false;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "cx-svg" }, stage);
  const layerG = new Map<string, SVGGElement>();
  for (const c of CLASSES) {
    const g = svgEl("g", { stroke: c.colour, fill: c.colour, class: "cx-layer" + (c.band ? " cx-band" : "") }, svg);
    layerG.set(c.id, g);
  }
  for (const s of shapes) {
    s.el = svgEl("path", { d: pathD(s.rings), "fill-rule": "evenodd" }, layerG.get(s.cls.id)!);
  }
  const fx = svgEl("g", { class: "cx-fx" }, svg);   // flashes, hints, quiz feedback

  const tools = htmlEl("div", "cx-tools", "", view);
  const zin = button(tools, "+", () => zoomAt(vw() / 2, vh() / 2, 1.6));
  const zout = button(tools, "−", () => zoomAt(vw() / 2, vh() / 2, 1 / 1.6));
  const zfit = button(tools, "⤢", () => fit());
  zin.title = "Zoom in"; zout.title = "Zoom out"; zfit.title = "Show the whole slice";
  zin.setAttribute("aria-label", "Zoom in"); zout.setAttribute("aria-label", "Zoom out"); zfit.setAttribute("aria-label", "Show the whole slice");
  const scaleBox = htmlEl("div", "cx-scale", "", view);
  const scaleBar = htmlEl("div", "cx-scalebar", "", scaleBox);
  const scaleTxt = htmlEl("div", "cx-scaletxt", "", scaleBox);
  const banner = htmlEl("div", "cx-banner", "", view);
  banner.hidden = true;

  const panel = htmlEl("div", "cx-panel", "", host);
  const modeRow = htmlEl("div", "qb-presets", "", panel);
  const bExplore = button(modeRow, "Explore", () => setMode("explore"));
  const bQuiz = button(modeRow, "Find the organelle", () => setMode("quiz"));
  const bMeasure = withMeasure ? button(modeRow, "Measure", () => setMode("measure")) : null;

  const explorePane = htmlEl("div", "cx-pane cx-explore", "", panel);
  const layersHead = htmlEl("div", "cx-layers-head", "", explorePane);
  htmlEl("span", "cx-h", "Layers", layersHead);
  button(layersHead, "all", () => setAll(true), "cx-small");
  button(layersHead, "none", () => setAll(false), "cx-small");
  const layerList = htmlEl("div", "cx-layers", "", explorePane);
  const checks = new Map<string, HTMLInputElement>();
  for (const c of CLASSES) {
    const lab = htmlEl("label", "cx-check", "", layerList);
    const inp = htmlEl("input", "", "", lab);
    inp.type = "checkbox"; inp.checked = true;
    inp.style.accentColor = c.colour;
    inp.addEventListener("change", () => { setLayer(c.id, inp.checked); inp.blur(); });
    const sw = htmlEl("span", "cx-swatch", "", lab); sw.style.borderColor = c.colour;
    lab.append(c.name);
    checks.set(c.id, inp);
  }
  const info = htmlEl("div", "cx-info", "", explorePane);
  showInfo(null);

  const quizPane = htmlEl("div", "cx-pane", "", panel);
  quizPane.hidden = true;

  // ---------------- view transform
  let s = 1, tx = 0, ty = 0, sMin = 0.05;
  const S_MAX = 3;
  const vw = () => view.clientWidth, vh = () => view.clientHeight;
  function apply() {
    // keep at least part of the image in view
    const m = 60;
    tx = Math.min(vw() - m, Math.max(m - W * s, tx));
    ty = Math.min(vh() - m, Math.max(m - H * s, ty));
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    // scale bar: the longest 1-2-5 length that fits in 120 screen px
    const nmPerScreenPx = NM / s;
    const len = niceLength(nmPerScreenPx * 120);
    scaleBar.style.width = (len / nmPerScreenPx).toFixed(1) + "px";
    scaleTxt.textContent = `${fmtNm(len)} · field of view ${fmtNm(nmPerScreenPx * vw())}`;
    measure?.onZoom();
  }
  function fit() {
    s = Math.min(vw() / W, vh() / H);
    sMin = s * 0.8;
    tx = (vw() - W * s) / 2; ty = (vh() - H * s) / 2;
    apply();
  }
  function zoomAt(x: number, y: number, f: number) {
    const ns = Math.min(S_MAX, Math.max(sMin, s * f));
    tx = x - (x - tx) * ns / s; ty = y - (y - ty) * ns / s; s = ns;
    apply();
  }
  /** Centre the view on image point (ix, iy) at scale ns. */
  function centreOn(ix: number, iy: number, ns = s) {
    s = Math.min(S_MAX, Math.max(sMin, ns));
    tx = vw() / 2 - ix * s; ty = vh() / 2 - iy * s;
    apply();
  }
  // pointer position in viewport CSS pixels (robust to CSS transforms, e.g. reveal.js)
  function local(ev: { clientX: number; clientY: number }): [number, number] {
    const r = view.getBoundingClientRect();
    const k = r.width / (view.offsetWidth || 1);
    return [(ev.clientX - r.left) / k, (ev.clientY - r.top) / k];
  }
  const toImage = (x: number, y: number): [number, number] => [(x - tx) / s, (y - ty) / s];

  // ---------------- pointer: pan, pinch, tap
  const pts = new Map<number, [number, number]>();
  let downAt: [number, number] | null = null, moved = false;
  view.addEventListener("pointerdown", ev => {
    if ((ev.target as Element).closest(".cx-tools")) return;
    view.setPointerCapture(ev.pointerId);
    pts.set(ev.pointerId, local(ev));
    if (pts.size === 1) { downAt = local(ev); moved = false; } else moved = true;
    view.classList.add("cx-grabbing");
  });
  view.addEventListener("pointermove", ev => {
    const prev = pts.get(ev.pointerId);
    if (!prev) return;
    const cur = local(ev);
    if (pts.size === 1) {
      tx += cur[0] - prev[0]; ty += cur[1] - prev[1];
      if (downAt && Math.hypot(cur[0] - downAt[0], cur[1] - downAt[1]) > 6) moved = true;
      pts.set(ev.pointerId, cur);
      apply();
    } else if (pts.size === 2) {
      const other = [...pts.entries()].find(([id]) => id !== ev.pointerId)![1];
      const d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
      const d1 = Math.hypot(cur[0] - other[0], cur[1] - other[1]);
      const m0 = [(prev[0] + other[0]) / 2, (prev[1] + other[1]) / 2];
      const m1 = [(cur[0] + other[0]) / 2, (cur[1] + other[1]) / 2];
      pts.set(ev.pointerId, cur);
      tx += m1[0] - m0[0]; ty += m1[1] - m0[1];
      if (d0 > 0) zoomAt(m1[0], m1[1], d1 / d0); else apply();
    }
  });
  const end = (ev: PointerEvent) => {
    if (!pts.has(ev.pointerId)) return;
    const wasTap = pts.size === 1 && !moved && ev.type === "pointerup";
    pts.delete(ev.pointerId);
    if (!pts.size) view.classList.remove("cx-grabbing");
    if (wasTap) tap(...toImage(...local(ev)));
  };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);
  // hover (mouse only): the measure mode shows the compartment under the pointer
  view.addEventListener("pointermove", ev => {
    if (mode !== "measure" || ev.pointerType !== "mouse" || pts.size) return;
    measure?.hover(...toImage(...local(ev)));
  });
  view.addEventListener("wheel", ev => {
    ev.preventDefault();
    const dy = ev.deltaMode === 1 ? ev.deltaY * 30 : ev.deltaMode === 2 ? ev.deltaY * 300 : ev.deltaY;
    const [x, y] = local(ev);
    zoomAt(x, y, Math.exp(-dy * 0.0015));
  }, { passive: false });

  // ---------------- hit testing
  /** Shapes under image point (x, y); `tol` (image px) widens thin membranes and tiny objects. */
  function hits(x: number, y: number, onlyVisible: boolean): Shape[] {
    const tol = 7 / s;
    const out: Shape[] = [];
    for (const sh of shapes) {
      if (onlyVisible && !visible.get(sh.cls.id)) continue;
      const [x0, y0, x1, y1] = sh.bbox;
      if (x < x0 - tol || x > x1 + tol || y < y0 - tol || y > y1 + tol) continue;
      let inside = false;
      for (const r of sh.rings) if (inRing(x, y, r)) inside = !inside;
      if (!inside && (sh.cls.band || sh.area < 400)) inside = sh.rings.some(r => distRing(x, y, r) < tol);
      if (inside) out.push(sh);
    }
    // the most specific first: thin bands, then the smallest area
    return out.sort((a, b) => (b.cls.band ? 1 : 0) - (a.cls.band ? 1 : 0) || a.area - b.area);
  }

  let selected: Shape | null = null;
  function select(sh: Shape | null) {
    selected?.el?.classList.remove("cx-sel");
    selected = sh;
    sh?.el?.classList.add("cx-sel");
    showInfo(sh?.cls ?? null);
  }
  function showInfo(c: OrgClass | null) {
    info.innerHTML = "";
    if (!c) {
      htmlEl("div", "qb-note", "Tap or click an outlined organelle to read what it is. "
        + "Drag to move, use the wheel, pinch or the + / − buttons to zoom.", info);
      return;
    }
    const h = htmlEl("div", "cx-info-name", c.name, info); h.style.color = c.colour;
    htmlEl("p", "", c.text, info);
    const em = htmlEl("p", "", "", info); htmlEl("b", "", "In EM: ", em); em.append(c.em);
    const lec = htmlEl("p", "", "", info); htmlEl("b", "", "More in: ", lec); lec.append(c.lecture);
  }

  function flash(sh: Shape, cls: string, ms: number) {
    const p = svgEl("path", { d: pathD(sh.rings), "fill-rule": "evenodd", class: cls, stroke: sh.cls.colour, fill: sh.cls.colour }, fx);
    if (sh.area < 3000 && !sh.cls.band) {
      const [x0, y0, x1, y1] = sh.bbox;
      svgEl("circle", { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2 + 30 / s, class: cls + " cx-ring" }, fx);
    }
    window.setTimeout(() => { p.remove(); fx.querySelectorAll(".cx-ring").forEach(e => e.remove()); }, ms);
  }

  function tap(x: number, y: number) {
    if (mode === "quiz") { quizTap(x, y); return; }
    if (mode === "measure") { measure?.tap(x, y); return; }
    const h = hits(x, y, true);
    select(h[0] ?? null);
  }

  // ---------------- layers
  function setLayer(id: string, on: boolean) {
    visible.set(id, on);
    layerG.get(id)!.style.display = on ? "" : "none";
    checks.get(id)!.checked = on;
    if (selected && selected.cls.id === id && !on) select(null);
  }
  function setAll(on: boolean) { for (const c of CLASSES) setLayer(c.id, on); }

  // ---------------- quiz: "find the organelle"
  type Mode = "explore" | "quiz" | "measure";
  let mode: Mode = "explore";
  const quizClasses = CLASSES.filter(c => shapes.some(sh => sh.cls === c));
  let order: OrgClass[] = [], round = 0, score = 0, misses = 0, seed = 1;
  const qPrompt = htmlEl("div", "qb-big cx-prompt", "", quizPane);
  const qFeedback = htmlEl("div", "cx-feedback", "", quizPane);
  const qStatus = htmlEl("div", "qb-readout", "", quizPane);
  const qBtns = htmlEl("div", "qb-presets", "", quizPane);
  const bHint = button(qBtns, "Hint", () => hint());
  const bSkip = button(qBtns, "Show me", () => reveal());
  const bNext = button(qBtns, "Next", () => nextRound());
  button(qBtns, "New quiz", () => { seed++; startQuiz(); });
  htmlEl("div", "qb-note", "The outlines are hidden. Pan and zoom as you like, then tap the organelle. "
    + "A first-try answer scores a point.", quizPane);

  function startQuiz() {
    const r = rng(seed);
    order = quizClasses.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r.unif() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    round = 0; score = 0;
    fit();
    showRound();
  }
  function showRound() {
    misses = 0;
    fx.innerHTML = "";
    if (round >= order.length) {
      qPrompt.textContent = `Done: ${score} of ${order.length} on the first try.`;
      qFeedback.textContent = score >= order.length - 2 ? "Very good: you can read an electron micrograph."
        : "Switch to Explore and look at the ones you missed, then try a new quiz.";
      qStatus.textContent = "";
      bHint.disabled = bSkip.disabled = bNext.disabled = true;
      return;
    }
    bHint.disabled = bSkip.disabled = false; bNext.disabled = true;
    qPrompt.textContent = `Find ${order[round].quizName}`;
    qFeedback.textContent = ""; qFeedback.className = "cx-feedback";
    qStatus.textContent = `Question ${round + 1} of ${order.length} · score ${score}`;
  }
  let answered = false;
  function quizTap(x: number, y: number) {
    if (round >= order.length || answered) return;
    const target = order[round];
    const h = hits(x, y, false);
    const hit = h.find(sh => sh.cls === target);
    if (hit) {
      if (misses === 0) score++;
      flash(hit, "cx-good", 2500);
      qFeedback.textContent = `Yes: ${target.name.toLowerCase()}. ${target.em}`;
      qFeedback.className = "cx-feedback cx-ok";
      finish();
    } else {
      misses++;
      const what = h[0] ? `That is ${h[0].cls.quizName}, not ${target.quizName}.` : "Nothing outlined there.";
      if (h[0]) flash(h[0], "cx-bad", 1200);
      qFeedback.textContent = what + (misses >= 2 ? " Try the hint." : " Try again.");
      qFeedback.className = "cx-feedback cx-no";
    }
    qStatus.textContent = `Question ${round + 1} of ${order.length} · score ${score}`;
  }
  function finish() { answered = true; bNext.disabled = false; bHint.disabled = bSkip.disabled = true; }
  function nextRound() { answered = false; round++; showRound(); }
  function hint() {
    const target = order[round];
    qFeedback.textContent = "Hint: " + target.em;
    qFeedback.className = "cx-feedback";
    misses = Math.max(misses, 1);
  }
  function reveal() {
    const target = order[round];
    const list = shapes.filter(sh => sh.cls === target);
    const big = list.reduce((a, b) => (b.area > a.area ? b : a));
    if (list.length <= 3 || target.band || big.area > 50000) {
      const [x0, y0, x1, y1] = big.bbox;
      const ns = target.band || big.area > 50000 ? s : Math.max(s, Math.min(vw(), vh()) / (Math.max(x1 - x0, y1 - y0) * 12));
      centreOn((x0 + x1) / 2, (y0 + y1) / 2, ns);
    }
    for (const sh of list) flash(sh, "cx-good", 3500);
    misses = Math.max(misses, 1);
    qFeedback.textContent = `Here: ${target.em}`;
    qFeedback.className = "cx-feedback";
    finish();
  }

  function setMode(m: Mode) {
    mode = m;
    bExplore.classList.toggle("active", m === "explore");
    bQuiz.classList.toggle("active", m === "quiz");
    bMeasure?.classList.toggle("active", m === "measure");
    if (m !== "measure") measure?.leave();
    explorePane.hidden = m !== "explore";
    quizPane.hidden = m !== "quiz";
    svg.classList.toggle("cx-quiz", m === "quiz");
    select(null);
    fx.innerHTML = "";
    answered = false;
    banner.hidden = m !== "quiz";
    banner.textContent = "Quiz: outlines hidden";
    if (m === "quiz") startQuiz();
    if (m === "measure") measure?.enter();
  }

  // ---------------- measure mode (opt-in)
  const measure = withMeasure ? createMeasure({
    panel, svg, shapes, W, H,
    scale: () => s,
    show: r => {
      const ns = Math.min(vw() / (r.x1 - r.x0), vh() / (r.y1 - r.y0)) * 0.96;
      centreOn((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, ns);
    },
  }) : null;

  setMode(withMeasure ? "measure" : "explore");
  /** The starting view: the whole slice, or the counting frame in measure mode. */
  function home() { fit(); if (mode === "measure") measure?.showFrame(); }
  const ro = new ResizeObserver(() => { if (!view.dataset.ready) { view.dataset.ready = "1"; home(); } else apply(); });
  ro.observe(view);
  home();
});
