// Measure mode of the cell explorer (opt-in with data-mode="measure"): a counting frame
// and a grid of test points over the EM slice. The student marks the points that fall
// on each organelle (stereology by point counting), then checks the count against the
// computer's count and the area of the outlines, and compares with the volume-fraction
// table of the cell tour. Tap or hover anywhere for the pH and free Ca²⁺ of that
// compartment; the outlines can be coloured by pH or Ca²⁺.
import { htmlEl, svgEl, button, rng } from "../lib/ui";
import type { OrgClass } from "./classes";
import { Cat, CATS, CAT_OF, MShape, Rect, loadShapes, classify, classifyNear, gridPoints, pointCounts, areas, total, zeroCounts, NM_PER_PX, Counts } from "./measure";
import { COMPARTMENTS, COMP, Compartment, phColour, caColour } from "./compartments";

export interface MeasureHost {
  panel: HTMLElement;
  svg: SVGSVGElement;
  shapes: { cls: OrgClass; el?: SVGPathElement }[];
  W: number; H: number;
  scale(): number;
  show(r: Rect): void;          // zoom the view to a rectangle (image px)
}

const FRAMES: { label: string; r: Rect; note: string }[] = [
  { label: "Whole cell (centre)", r: { x0: 320, y0: 300, x1: 2900, y1: 1600 },
    note: "31 × 16 µm: the nucleus and the cytoplasm around it." },
  { label: "Cytoplasm, left", r: { x0: 340, y0: 430, x1: 1140, y1: 1570 },
    note: "10 × 14 µm of cytoplasm beside the nucleus." },
  { label: "Cytoplasm, above the nucleus", r: { x0: 900, y0: 180, x1: 2850, y1: 430 },
    note: "23 × 3 µm: a thin band between the nucleus and the cell edge." },
];
const SPACINGS = [2, 1, 0.5];   // µm
const MARKABLE: Cat[] = ["nucleus", "er", "golgi", "mito", "endolyso", "ld"];
const SHORT: Record<Cat, string> = {
  nucleus: "Nucleus", er: "ER", golgi: "Golgi", mito: "Mitochondria", endolyso: "Endosome / lysosome",
  ld: "Lipid droplet", cytosol: "Cytosol",
};

const CSS = `
.qb-demo.cx.cxm-host { flex-wrap: nowrap; }
.cx.cxm-host .cx-panel { width: 100%; }
.cx .cxm-row { display: flex; flex-wrap: wrap; align-items: center; gap: .35em .5em; }
.cx .cxm-lab { font-weight: 600; min-width: 4.5em; }
.cx .cxm-cat.qb-btn { border-width: 2px; }
.cx .cxm-cat.qb-btn.active { color: #fff; }
.cx .cxm-tablewrap { overflow-x: auto; }
.cx table.cxm-table { border-collapse: collapse; font-size: .88em; width: 100%; min-width: 40em; margin: 0; }
.cx .cxm-table th, .cx .cxm-table td { border-bottom: 1px solid var(--qb-grid); padding: .25em .45em; text-align: left; vertical-align: top; }
.cx .cxm-table th { font-weight: 600; background: var(--qb-panel); }
.cx .cxm-table td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.cx .cxm-table tr.cxm-total td { font-weight: 600; border-bottom: none; }
.cx .cxm-table tr.cxm-ref td { color: var(--qb-muted); }
.cx .cxm-table tr.cxm-hl td { background: #fff4e6; }
.cx .cxm-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: .35em; vertical-align: baseline; }
.cx .cxm-info { background: var(--qb-panel); border-radius: 6px; padding: .45em .7em; font-size: .92em; min-height: 3.2em; }
.cx .cxm-info b { font-weight: 700; }
.cx .cxm-legend { display: flex; flex-wrap: wrap; gap: .3em .8em; font-size: .85em; }
.cx .cxm-legend span { display: inline-flex; align-items: center; gap: .3em; }
.cx .cxm-chip { display: inline-block; width: 14px; height: 14px; border-radius: 3px; border: 1px solid #999; }
.cx .cxm-g .cxm-dim { fill: #000; fill-opacity: .4; }
.cx .cxm-g .cxm-frame { fill: none; stroke: #e8590c; stroke-width: 3px; vector-effect: non-scaling-stroke; }
.cx .cxm-g .cxm-cross-bg { fill: none; stroke: #000; stroke-opacity: .7; stroke-width: 4px; vector-effect: non-scaling-stroke; }
.cx .cxm-g .cxm-cross { fill: none; stroke: #ffe066; stroke-width: 2px; vector-effect: non-scaling-stroke; }
.cx .cxm-g .cxm-mark { stroke: #fff; stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
.cx .cxm-g .cxm-wrong { fill: none; stroke: #ff1f1f; stroke-width: 3px; vector-effect: non-scaling-stroke; }
.cx .cxm-nolines .cx-layer path { stroke-opacity: 0; }
.cx .cxm-feedback:empty { display: none; }
@media (pointer: coarse) { .cx.cxm-host .qb-btn { min-height: 44px; } }
`;

export function createMeasure(h: MeasureHost) {
  if (!document.getElementById("cxm-style")) {
    const st = document.createElement("style"); st.id = "cxm-style"; st.textContent = CSS;
    document.head.appendChild(st);
  }
  h.panel.parentElement?.classList.add("cxm-host");
  const mshapes: MShape[] = loadShapes();
  const umPx = 1000 / NM_PER_PX;   // image px per µm

  // ---------------- state
  let frameIdx = 0, spIdx = 0, seed = 1;
  let active: Cat = "mito";
  let colourBy: "organelle" | "ph" | "ca" = "organelle";
  let pts: [number, number][] = [];
  let truth: Cat[] = [];
  let truthCounts: Counts = zeroCounts();
  let areaCounts: Counts | null = null;
  let marks = new Map<number, Cat>();
  let revealed = false;
  let wrong: number[] = [];
  let hoverCat: Compartment["id"] | null = null;

  // ---------------- SVG overlay
  const g = svgEl("g", { class: "cxm-g" }, h.svg);
  g.style.display = "none";
  const dim = svgEl("path", { class: "cxm-dim", "fill-rule": "evenodd" }, g);
  const frameEl = svgEl("rect", { class: "cxm-frame" }, g);
  const crossBg = svgEl("path", { class: "cxm-cross-bg" }, g);
  const cross = svgEl("path", { class: "cxm-cross" }, g);
  const markG = svgEl("g", {}, g);
  const wrongG = svgEl("g", {}, g);

  // ---------------- panel
  const pane = htmlEl("div", "cx-pane", "", h.panel);
  pane.hidden = true;
  htmlEl("div", "qb-note", "Count organelles the way electron microscopists do: tap every grid point (yellow cross) that lies on the organelle you have chosen. "
    + "Unmarked points count as cytosol. Points on an organelle ÷ all points in the frame = the share of the area it covers.", pane);

  const rowF = htmlEl("div", "cxm-row", "", pane);
  htmlEl("span", "cxm-lab", "Frame", rowF);
  const fBtns = FRAMES.map((f, i) => button(rowF, f.label, () => { frameIdx = i; newGrid(true); }, "cx-small"));
  const rowG = htmlEl("div", "cxm-row", "", pane);
  htmlEl("span", "cxm-lab", "Grid", rowG);
  const gBtns = SPACINGS.map((sp, i) => button(rowG, `${sp} µm`, () => { spIdx = i; newGrid(false); }, "cx-small"));
  button(rowG, "Move the grid", () => { seed++; newGrid(false); }, "cx-small");
  const gridNote = htmlEl("span", "qb-note", "", rowG);

  const rowC = htmlEl("div", "cxm-row", "", pane);
  htmlEl("span", "cxm-lab", "Mark", rowC);
  const cBtns = new Map<Cat, HTMLButtonElement>();
  for (const c of MARKABLE) {
    const b = button(rowC, SHORT[c], () => { active = c; paintCatButtons(); }, "cx-small cxm-cat");
    cBtns.set(c, b);
  }

  const rowA = htmlEl("div", "cxm-row", "", pane);
  button(rowA, "Check my count", () => check());
  button(rowA, "Count all for me", () => countAll());
  button(rowA, "Clear marks", () => { marks.clear(); revealed = false; wrong = []; feedback.textContent = ""; drawMarks(); renderTable(); });
  const feedback = htmlEl("div", "cxm-feedback", "", pane);

  const rowV = htmlEl("div", "cxm-row", "", pane);
  htmlEl("span", "cxm-lab", "Show", rowV);
  const linesLab = htmlEl("label", "cx-check", "", rowV);
  const linesInp = htmlEl("input", "", "", linesLab);
  linesInp.type = "checkbox"; linesInp.checked = true;
  linesLab.append("outlines");
  linesInp.addEventListener("change", () => { h.svg.classList.toggle("cxm-nolines", !linesInp.checked); linesInp.blur(); });
  const vBtns = ([["organelle", "Organelles"], ["ph", "Colour by pH"], ["ca", "Colour by Ca²⁺"]] as const).map(([k, t]) =>
    button(rowV, t, () => { colourBy = k; paintColours(); }, "cx-small"));
  const legend = htmlEl("div", "cxm-legend", "", pane);

  const info = htmlEl("div", "cxm-info", "", pane);
  const tableWrap = htmlEl("div", "cxm-tablewrap", "", pane);
  htmlEl("div", "qb-note", "pH and free Ca²⁺: typical values for a mammalian cell. Cell tour: the rough share of cell volume in a liver cell, from the table in the cell-tour lecture. "
    + "Outline area: the exact area of the outlines inside the frame. The outlines are machine predictions checked by eye; small vesicles and peroxisomes are not outlined.", pane);

  // ---------------- grid
  function frame(): Rect { return FRAMES[frameIdx].r; }
  function newGrid(zoom: boolean) {
    const r = rng(seed * 7919 + 13);
    const ox = r.unif(), oy = r.unif();
    const sp = SPACINGS[spIdx] * umPx;
    pts = gridPoints(frame(), sp, ox, oy);
    ({ cats: truth, counts: truthCounts } = pointCounts(pts, mshapes));
    areaCounts = null;
    marks = new Map(); revealed = false; wrong = []; feedback.textContent = "";
    fBtns.forEach((b, i) => b.classList.toggle("active", i === frameIdx));
    gBtns.forEach((b, i) => b.classList.toggle("active", i === spIdx));
    gridNote.textContent = `${pts.length} points · ${FRAMES[frameIdx].note}`;
    const f = frame();
    setRectAttrs(frameEl, f);
    dim.setAttribute("d", `M-2000,-2000H${h.W + 2000}V${h.H + 2000}H-2000Z M${f.x0},${f.y0}H${f.x1}V${f.y1}H${f.x0}Z`);
    if (zoom) h.show(f);
    drawGrid(); drawMarks(); renderTable();
  }
  function setRectAttrs(el: SVGRectElement, f: Rect) {
    el.setAttribute("x", String(f.x0)); el.setAttribute("y", String(f.y0));
    el.setAttribute("width", String(f.x1 - f.x0)); el.setAttribute("height", String(f.y1 - f.y0));
  }
  let lastArm = 0;
  function arm(): number {
    const sp = SPACINGS[spIdx] * umPx;
    return Math.min(sp * 0.28, 11 / h.scale());
  }
  function drawGrid() {
    const a = arm(); lastArm = a;
    const d = pts.map(([x, y]) => `M${(x - a).toFixed(1)},${y.toFixed(1)}h${(2 * a).toFixed(1)}M${x.toFixed(1)},${(y - a).toFixed(1)}v${(2 * a).toFixed(1)}`).join("");
    crossBg.setAttribute("d", d); cross.setAttribute("d", d);
  }
  function drawMarks() {
    const a = arm();
    markG.innerHTML = ""; wrongG.innerHTML = "";
    for (const [i, c] of marks) {
      svgEl("circle", { cx: pts[i][0], cy: pts[i][1], r: a * 0.75, fill: COMP[c].colour, class: "cxm-mark" }, markG);
    }
    for (const i of wrong) svgEl("circle", { cx: pts[i][0], cy: pts[i][1], r: a * 1.6, class: "cxm-wrong" }, wrongG);
  }
  function onZoom() {
    if (g.style.display === "none") return;
    const a = arm();
    if (Math.abs(a - lastArm) / lastArm > 0.15) { drawGrid(); drawMarks(); }
  }

  // ---------------- counting
  function userCounts(): Counts {
    const c = zeroCounts();
    for (const v of marks.values()) c[v]++;
    c.cytosol = pts.length - marks.size;
    return c;
  }
  /** Compare the marks with the outlines, only for the organelles the student has
   *  marked at least once (so one can count just the mitochondria). */
  function check() {
    const counted = new Set(marks.values());
    if (!counted.size) {
      feedback.textContent = "Mark some points first: choose an organelle under Mark, then tap the grid points that lie on it.";
      return;
    }
    wrong = [];
    pts.forEach(([x, y], i) => {
      const mine = marks.get(i) ?? "cytosol", t = truth[i];
      if (mine === t || !(counted.has(mine) || counted.has(t))) return;
      if (classifyNear(x, y, 3, mshapes).has(mine)) return;   // on an edge: either is fine
      wrong.push(i);
    });
    revealed = true;
    if (!areaCounts) areaCounts = areas(frame(), mshapes);
    const uc = userCounts();
    const per = MARKABLE.filter(c => counted.has(c)).map(c => `${SHORT[c]}: you ${uc[c]}, computer ${truthCounts[c]}`).join("; ");
    const notYet = MARKABLE.filter(c => !counted.has(c) && truthCounts[c] > 0).map(c => c === "er" ? "ER" : SHORT[c].toLowerCase());
    feedback.textContent = per + ". " + (wrong.length === 0
      ? "Every point agrees with the outlines."
      : `Red rings: ${wrong.length} point${wrong.length > 1 ? "s" : ""} to look at again (zoom in).`)
      + (notYet.length ? ` Not counted yet: ${notYet.join(", ")}.` : "");
    drawMarks(); renderTable();
  }
  function countAll() {
    marks = new Map();
    truth.forEach((c, i) => { if (c !== "cytosol") marks.set(i, c); });
    wrong = [];
    revealed = true;
    if (!areaCounts) areaCounts = areas(frame(), mshapes);
    feedback.textContent = "Every point marked by the computer from the outlines.";
    drawMarks(); renderTable();
  }
  function tap(x: number, y: number) {
    // nearest grid point within reach marks it; elsewhere, tell what is there
    const sp = SPACINGS[spIdx] * umPx;
    const reach = Math.min(sp / 2, 22 / h.scale());
    let best = -1, bd = Infinity;
    pts.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && bd <= reach) {
      if (marks.get(best) === active) marks.delete(best); else marks.set(best, active);
      wrong = wrong.filter(i => i !== best);
      drawMarks(); renderTable();
      showInfo(classify(pts[best][0], pts[best][1], mshapes));
      return;
    }
    showInfo(classify(x, y, mshapes));
  }
  function hover(x: number, y: number) {
    const c = x < 0 || y < 0 || x > h.W || y > h.H ? null : classify(x, y, mshapes);
    if (c !== hoverCat) showInfo(c);
  }

  // ---------------- display
  function showInfo(id: Compartment["id"] | null) {
    hoverCat = id;
    info.innerHTML = "";
    if (!id) { htmlEl("span", "qb-note", "Point at (or tap) any part of the cell to see the pH and free Ca²⁺ of that compartment.", info); renderTable(); return; }
    const c = COMP[id];
    const head = htmlEl("div", "", "", info);
    const nm = htmlEl("b", "", c.name, head); nm.style.color = c.colour === "#868e96" ? "#495057" : c.colour;
    head.append(` · pH ${c.phText} · free Ca²⁺ ${c.caText}`);
    htmlEl("div", "", c.why, info);
    renderTable();
  }
  const pct = (k: number, n: number) => n ? (100 * k / n).toFixed(1) + " %" : "–";
  const cnt = (k: number, n: number) => `${k} (${pct(k, n)})`;
  function renderTable() {
    tableWrap.innerHTML = "";
    const t = htmlEl("table", "cxm-table", "", tableWrap);
    const hr = htmlEl("tr", "", "", htmlEl("thead", "", "", t));
    for (const s of ["Compartment", "Your count", "Computer count", "Outline area", "Cell tour (liver)", "pH", "Free Ca²⁺"]) htmlEl("th", "", s, hr);
    const tb = htmlEl("tbody", "", "", t);
    const uc = userCounts(), n = pts.length;
    const aT = areaCounts ? total(areaCounts) : 0;
    for (const c of COMPARTMENTS) {
      const tr = htmlEl("tr", c.id === "outside" ? "cxm-ref" : "", "", tb);
      if (c.id === hoverCat) tr.classList.add("cxm-hl");
      const td0 = htmlEl("td", "", "", tr);
      const dot = htmlEl("span", "cxm-dot", "", td0); dot.style.background = c.colour;
      td0.append(c.name);
      const cat = (CATS as string[]).includes(c.id) ? c.id as Cat : null;
      htmlEl("td", "num", cat ? cnt(uc[cat], n) : (c.counted ? "" : "–"), tr);
      htmlEl("td", "num", cat && revealed ? cnt(truthCounts[cat], n) : (cat ? "?" : "–"), tr);
      htmlEl("td", "num", cat && revealed && areaCounts ? pct(areaCounts[cat], aT) : (cat ? "?" : "–"), tr);
      htmlEl("td", "", c.tour, tr);
      htmlEl("td", "", c.phText, tr);
      htmlEl("td", "", c.caText, tr);
    }
    const tr = htmlEl("tr", "cxm-total", "", tb);
    htmlEl("td", "", "All points in the frame", tr);
    htmlEl("td", "num", String(n), tr);
    htmlEl("td", "num", String(n), tr);
    const f = frame();
    htmlEl("td", "num", `${((f.x1 - f.x0) / umPx).toFixed(0)} × ${((f.y1 - f.y0) / umPx).toFixed(0)} µm`, tr);
    htmlEl("td", "", "", tr); htmlEl("td", "", "", tr); htmlEl("td", "", "", tr);
  }
  function paintCatButtons() {
    for (const [c, b] of cBtns) {
      const on = c === active;
      b.classList.toggle("active", on);
      b.style.borderColor = COMP[c].colour;
      b.style.background = on ? COMP[c].colour : "";
    }
  }
  function compOfClass(id: string): Compartment {
    if (id === "ne") return COMP.er;            // the envelope lumen is ER lumen
    return COMP[CAT_OF[id] ?? "cytosol"];
  }
  function paintColours() {
    vBtns.forEach((b, i) => b.classList.toggle("active", ["organelle", "ph", "ca"][i] === colourBy));
    for (const sh of h.shapes) {
      if (!sh.el) continue;
      if (colourBy === "organelle" || sh.cls.id === "pm") { sh.el.style.fill = ""; sh.el.style.fillOpacity = ""; continue; }
      const c = compOfClass(sh.cls.id);
      const col = colourBy === "ph" ? phColour(c.ph) : caColour(c.caUM);
      sh.el.style.fill = col ?? "none";
      sh.el.style.fillOpacity = col ? ".6" : "0";
    }
    legend.innerHTML = "";
    const item = (col: string | null, txt: string) => {
      const sp = htmlEl("span", "", "", legend);
      const chip = htmlEl("span", "cxm-chip", "", sp);
      chip.style.background = col ?? "transparent";
      sp.append(txt);
    };
    if (colourBy === "ph") {
      item(phColour(4.8), "pH 4.5–5"); item(phColour(6.4), "pH 6–6.7"); item(null, "pH 7.2 (as cytosol)");
      item(phColour(8), "pH 8"); item(phColour(null), "no water (lipid droplet)");
    } else if (colourBy === "ca") {
      item(null, "≈ 0.1 µM (as cytosol)"); item(caColour(200), "0.1–0.3 mM"); item(caColour(500), "≈ 0.5 mM");
      item(phColour(null), "no water (lipid droplet)");
    }
  }

  // ---------------- enter / leave
  function enter() {
    g.style.display = "";
    pane.hidden = false;
    paintCatButtons();
    if (!pts.length) newGrid(true); else h.show(frame());
    paintColours();
    showInfo(null);
  }
  function leave() {
    g.style.display = "none";
    pane.hidden = true;
    h.svg.classList.remove("cxm-nolines"); linesInp.checked = true;
    colourBy = "organelle"; paintColours();
  }
  return { pane, enter, leave, tap, hover, onZoom, showFrame: () => h.show(frame()) };
}
