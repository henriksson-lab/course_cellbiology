// Spindle checkpoint. A toy cell with 4 chromosomes in prometaphase. The student taps a
// kinetochore to attach it to the left pole, the right pole, both (merotelic) or none,
// or lets the microtubules search and capture by themselves. Unattached kinetochores
// keep the checkpoint "wait" signal on; Aurora B releases attachments without tension
// (can be switched off); taxol and monastrol arrest the cell; "force anaphase" switches
// the checkpoint off and shows missegregation. Rules-based (see model.ts); time runs at
// 1× real time by default.
// Options (data-*): seed, search ("1" = start with search and capture on).
import { autoMount, htmlEl, svgEl, button, checkbox, rng } from "../lib/ui";
import { visibleLoop, Loop } from "../lib/particles";
import { Sim, Chrom, newSim, step, cycle, attachAll, kind, tension, unattachedCount, daughters, R_CELL, Kind } from "./model";
import { CSS } from "./style";

const INK = "#1b2a3a", MT = "#555555", PM = "#8a6a12", CYTO = "#fbfaf5", NUC = "#6b4fa0", NUC_F = "#efebf7",
  WAIT = "#e8590c", OK = "#2b8a3e";
const COLORS = ["#6b4fa0", "#1c4fa0", "#2b8a3e", "#a8324a"];
const W = 660, H = 480, S = 19, CX = W / 2, CY = H / 2 + 4;   // 19 px per µm
const X = (x: number) => CX + x * S, Y = (y: number) => CY + y * S;
const SPEEDS = [1, 5, 10, 30];
const KIND_TEXT: Record<Kind, string> = {
  unattached: "unattached",
  monotelic: "one kinetochore attached (monotelic)",
  syntelic: "both to the same pole (syntelic)",
  amphitelic: "bioriented (amphitelic)",
  merotelic: "one kinetochore to both poles (merotelic)",
};
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

interface SearchMT { pole: 0 | 1; ang: number; len: number; grow: boolean; }

autoMount("spindle", host => {
  if (!document.getElementById("sp-style")) {
    const st = document.createElement("style"); st.id = "sp-style"; st.textContent = CSS; document.head.appendChild(st);
  }
  host.classList.add("sp");
  const d = host.dataset;
  const seed = Number(d.seed) || 1;
  let opts = { search: d.search === "1", correction: true, taxol: false, monopolar: false, checkpoint: true };
  let s: Sim = newSim(opts, seed);
  let speed = 1;
  let loop: Loop | null = null;
  const vr = rng(seed + 11);
  let smt: SearchMT[] = [];
  const initSearch = () => {
    smt = [];
    for (const pole of [0, 1] as const) for (let i = 0; i < 16; i++)
      smt.push({ pole, ang: (i + vr.unif()) / 16 * 2 * Math.PI, len: vr.unif() * 6, grow: vr.unif() < 0.6 });
  };
  initSearch();

  // ================= the cell
  const main = htmlEl("div", "sp-main", "", host);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "sp-cell", role: "img",
    "aria-label": "A dividing cell with a spindle, two poles and four chromosomes" }, main);
  const cellPath = svgEl("path", { fill: CYTO, stroke: PM, "stroke-width": 3 }, svg);
  const gNuc = svgEl("g", {}, svg);
  const gAster = svgEl("g", { stroke: MT, "stroke-width": 1.4, opacity: 0.35, "stroke-linecap": "round" }, svg);
  const gSearch = svgEl("g", { stroke: MT, "stroke-width": 1.4, opacity: 0.45, "stroke-linecap": "round" }, svg);
  const gIpole = svgEl("g", { stroke: MT, "stroke-width": 1.6, opacity: 0.6 }, svg);
  const gKfib = svgEl("g", { stroke: MT, "stroke-width": 1.6, "stroke-linecap": "round" }, svg);
  const gRing = svgEl("g", {}, svg);
  const gChr = svgEl("g", {}, svg);
  const gPole = svgEl("g", {}, svg);
  const gHit = svgEl("g", {}, svg);
  const gLab = svgEl("g", { "font-size": 19 }, svg);
  const phaseText = svgEl("text", { x: 12, y: 28, "font-size": 22, "font-weight": 700 }, gLab);
  const timeText = svgEl("text", { x: 12, y: 50, "font-size": 16, fill: "#555" }, gLab);
  const hintText = svgEl("text", { x: W / 2, y: H - 10, "text-anchor": "middle", "font-size": 17, fill: "#555" }, gLab);

  // chromosome elements
  interface ChrEls { arms: SVGRectElement[]; kts: SVGCircleElement[]; halo: SVGCircleElement[]; coh: SVGLineElement; hits: SVGRectElement[]; label: SVGTextElement; }
  const els: ChrEls[] = [];
  const buildChroms = () => {
    gChr.innerHTML = ""; gHit.innerHTML = ""; els.length = 0;
    s.chroms.forEach((c, ci) => {
      const g = svgEl("g", {}, gChr);
      const halo = [0, 1].map(() => svgEl("circle", { r: 0.5 * S, fill: WAIT, "fill-opacity": 0.25, stroke: WAIT, "stroke-width": 2.5 }, g));
      const arms = [0, 1].map(() => svgEl("rect", { width: 0.55 * S, height: c.len * S, rx: 0.27 * S, fill: COLORS[ci], stroke: INK, "stroke-width": 1 }, g));
      const coh = svgEl("line", { stroke: INK, "stroke-width": 3 }, g);
      const kts = [0, 1].map(() => svgEl("circle", { r: 0.2 * S, fill: INK }, g));
      const label = svgEl("text", { "font-size": 17, "text-anchor": "end", "dominant-baseline": "central", "font-weight": 700, fill: COLORS[ci] }, g);
      label.textContent = String(c.id);
      const hits = [0, 1].map(si => {
        const h = svgEl("rect", { class: "sp-hit", width: 1.6 * S, height: c.len * S + 0.8 * S }, gHit);
        h.addEventListener("pointerdown", ev => {
          ev.preventDefault();
          if (s.phase !== "pro" && s.phase !== "meta") return;
          cycle(s, ci, si);
          const a = s.chroms[ci].sis[si].att;
          const to = a[0] && a[1] ? "both poles" : a[0] ? (s.monopolar ? "the aster" : "the left pole") : a[1] ? "the right pole" : "nothing (detached)";
          s.events.push({ t: s.t, text: `you: chromosome ${c.id}, ${si === 0 ? "left" : "right"} kinetochore → ${to}` });
          loop?.redraw();
        });
        const t = svgEl("title", {}, h); t.textContent = `Chromosome ${c.id}, ${si === 0 ? "left" : "right"} kinetochore: tap to change its attachment`;
        return h;
      });
      els.push({ arms, kts, halo, coh, hits, label });
    });
  };
  buildChroms();

  const legend = htmlEl("div", "sp-legend", "", main);
  legend.innerHTML = `<span><i style="background:${WAIT};opacity:.6"></i>unattached kinetochore: makes the "wait" signal (Mad2)</span>` +
    `<span><i style="background:${INK}"></i>attached kinetochore</span><span><i style="background:${MT}"></i>microtubules, poles</span>`;

  const row1 = htmlEl("div", "sp-row", "", main);
  const bPause = button(row1, "Pause", () => { if (!loop) return; loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  button(row1, "Reset", () => reset());
  const spLab = htmlEl("label", "sp-speed", "time runs at ", row1);
  const sSpeed = htmlEl("select", "", "", spLab);
  for (const v of SPEEDS) { const o = htmlEl("option", "", v + "× real time", sSpeed); o.value = String(v); }
  sSpeed.addEventListener("change", () => { speed = Number(sSpeed.value); sSpeed.blur(); });
  const row2 = htmlEl("div", "sp-row", "", main);
  const cSearch = checkbox(row2, "Microtubules search and capture by themselves", opts.search, v => { opts.search = v; s.search = v; });
  const cCorr = checkbox(row2, "Tension correction (Aurora B)", true, v => { opts.correction = v; s.correction = v; });
  const cTaxol = checkbox(row2, "Taxol", false, v => { opts.taxol = v; s.taxol = v; });
  const cMona = checkbox(row2, "Monastrol (restarts the cell)", false, v => { opts.monopolar = v; reset(); });
  const row3 = htmlEl("div", "sp-row", "", main);
  const bAll = button(row3, "Attach all correctly", () => { attachAll(s); s.events.push({ t: s.t, text: "you: every chromosome attached to both poles" }); loop?.redraw(); });
  const bForce = button(row3, "Force anaphase now (checkpoint off)", () => {
    s.checkpoint = false; s.events.push({ t: s.t, text: "checkpoint switched OFF (Mad2 inhibited): the wait signal is gone" }); loop?.redraw();
  }, "sp-force");
  htmlEl("div", "qb-note", "Rules-based model of a toy cell with 4 chromosomes (a human cell has 46): " +
    "qualitatively right, timings illustrative. Tap the left or right half of a chromosome to change the attachment " +
    "of that kinetochore: none → left pole → right pole → both poles → none.", main);

  // ================= side panel
  const side = htmlEl("div", "sp-side", "", host);
  htmlEl("div", "sp-h", "Spindle assembly checkpoint", side);
  const sac = htmlEl("div", "sp-sac", "", side);
  const bars = htmlEl("div", "sp-bars", "", side);
  const mkBar = (name: string, color: string) => {
    const r = htmlEl("div", "sp-bar", "", bars);
    htmlEl("span", "", name, r);
    const bb = htmlEl("div", "sp-bb", "", r); const b = htmlEl("b", "", "", bb); b.style.background = color;
    const v = htmlEl("span", "sp-bv", "", r);
    return (x: number) => { b.style.width = (100 * x).toFixed(1) + "%"; v.textContent = Math.round(100 * x) + " %"; };
  };
  const barM = mkBar("Wait signal (MCC)", WAIT);
  const barA = mkBar("APC/C–Cdc20", OK);
  const barS = mkBar("Securin", "#868e96");
  const barC = mkBar("Cyclin B", "#495057");
  htmlEl("div", "sp-h", "Chromosomes", side);
  const chromList = htmlEl("div", "sp-chroms", "", side);
  const result = htmlEl("div", "sp-result", "", side);
  htmlEl("div", "sp-h", "What happened", side);
  const logEl = htmlEl("div", "sp-log", "", side);

  function reset() {
    s = newSim(opts, seed);
    initSearch();
    buildChroms();
    cSearch.checked = opts.search; cCorr.checked = opts.correction; cTaxol.checked = opts.taxol; cMona.checked = opts.monopolar;
    loop?.redraw();
  }

  // ================= drawing
  const cellOutline = () => {
    const a = R_CELL * (1 + 0.3 * s.elong), b = R_CELL * (1 - 0.12 * s.elong), p = s.furrow;
    let dpath = "";
    for (let i = 0; i <= 120; i++) {
      const th = i / 120 * 2 * Math.PI;
      const x = a * Math.cos(th);
      const y = b * Math.sin(th) * (1 - 0.97 * p * Math.exp(-((x / 3) ** 2)));
      dpath += (i ? "L" : "M") + X(x).toFixed(1) + " " + Y(y).toFixed(1);
    }
    cellPath.setAttribute("d", dpath + "Z");
    gRing.innerHTML = "";
    if (s.phase === "telo" || (s.phase === "done" && !s.monopolar)) {
      const yw = b * (1 - 0.97 * p);
      for (const sg of [-1, 1]) svgEl("line", { x1: X(-0.5), x2: X(0.5), y1: Y(sg * yw), y2: Y(sg * yw), stroke: "#c92a2a", "stroke-width": 7, "stroke-linecap": "round" }, gRing);
    }
  };
  const polePos = (p: 0 | 1): [number, number] => s.monopolar ? [0, p === 0 ? -0.4 : 0.4] : [s.poleX[p], 0];
  const line = (g: Element, x1: number, y1: number, x2: number, y2: number, extra: Record<string, string | number> = {}) =>
    svgEl("line", { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), ...extra }, g);

  function render() {
    cellOutline();
    // poles and asters
    gPole.innerHTML = ""; gAster.innerHTML = ""; gIpole.innerHTML = ""; gSearch.innerHTML = ""; gKfib.innerHTML = ""; gNuc.innerHTML = "";
    for (const p of [0, 1] as const) {
      const [px, py] = polePos(p);
      svgEl("circle", { cx: X(px), cy: Y(py), r: 0.45 * S, fill: MT }, gPole);
      if (p === 1 && s.monopolar) continue;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * 2 * Math.PI + 0.2;
        if (!s.monopolar && Math.cos(a) * (p === 0 ? 1 : -1) > 0.5) continue;   // asters point away from the middle
        line(gAster, px, py, px + 2.2 * Math.cos(a), py + 2.2 * Math.sin(a));
      }
    }
    if (!s.monopolar) {
      for (let i = 0; i < 4; i++) {
        const yo = -0.9 + i * 0.6;
        line(gIpole, s.poleX[0], 0, 1.4, yo * 0.9);
        line(gIpole, s.poleX[1], 0, -1.4, yo * 0.9 + 0.3);
      }
    }
    if (s.phase === "pro" || s.phase === "meta") {
      for (const m of smt) {
        if (s.monopolar && m.pole === 1) continue;
        const [px, py] = polePos(m.pole);
        line(gSearch, px, py, px + m.len * Math.cos(m.ang), py + m.len * Math.sin(m.ang));
      }
    }
    // chromosomes
    s.chroms.forEach((c: Chrom, ci) => {
      const e = els[ci];
      const k = kind(c);
      const sep = s.phase === "ana" || s.phase === "telo" || s.phase === "done";
      c.sis.forEach((x, si) => {
        const ax = X(x.x) - 0.275 * S, ay = Y(x.y) - c.len * S / 2;
        e.arms[si].setAttribute("x", ax.toFixed(1)); e.arms[si].setAttribute("y", ay.toFixed(1));
        // kinetochore on the outer side (towards the pole it faces)
        let kx = x.x + (si === 0 ? -0.35 : 0.35);
        if (sep && (x.att[0] !== x.att[1])) kx = x.x + (x.att[0] ? -0.35 : 0.35);
        e.kts[si].setAttribute("cx", X(kx).toFixed(1)); e.kts[si].setAttribute("cy", Y(x.y).toFixed(1));
        const unatt = !x.att[0] && !x.att[1];
        e.halo[si].setAttribute("cx", X(kx).toFixed(1)); e.halo[si].setAttribute("cy", Y(x.y).toFixed(1));
        e.halo[si].style.display = unatt && !sep ? "" : "none";
        // k-fibres: three microtubules per attachment
        for (const p of [0, 1] as const) if (x.att[p]) {
          const [px, py] = polePos(p);
          for (const o of [-0.15, 0, 0.15]) line(gKfib, px, py, kx, x.y + o);
        }
        const h = e.hits[si];
        h.setAttribute("x", (si === 0 ? X(c.x) - 1.6 * S : X(c.x)).toFixed(1));
        h.setAttribute("y", (Y(c.y) - c.len * S / 2 - 0.4 * S).toFixed(1));
        h.style.display = sep ? "none" : "";
      });
      e.coh.style.display = sep ? "none" : "";
      e.coh.setAttribute("x1", X(c.sis[0].x).toFixed(1)); e.coh.setAttribute("x2", X(c.sis[1].x).toFixed(1));
      e.coh.setAttribute("y1", Y(c.y).toFixed(1)); e.coh.setAttribute("y2", Y(c.y).toFixed(1));
      const lx = sep ? c.sis[0].x : c.x, ly = sep ? c.sis[0].y : c.y;
      e.label.setAttribute("x", (X(lx) - (sep ? 0.5 : 1.35) * S).toFixed(1)); e.label.setAttribute("y", (Y(ly) - c.len * S / 2 + 8).toFixed(1));
      void k;
    });
    // daughter nuclei
    if (s.phase === "done") {
      const sides = s.monopolar ? [-1] : [-1, 1];
      for (const sd of sides) {
        const xs = s.chroms.flatMap(c => c.sis.filter(x => x.side === sd && !x.micro).map(x => x));
        if (!xs.length) continue;
        const minx = Math.min(...xs.map(x => x.x)) - 1, maxx = Math.max(...xs.map(x => x.x)) + 1;
        const ys = xs.flatMap(x => { const L = s.chroms.find(c => c.sis.includes(x))!.len / 2; return [x.y - L, x.y + L]; });
        const miny = Math.min(...ys) - 0.6, maxy = Math.max(...ys) + 0.6;
        svgEl("ellipse", { cx: X((minx + maxx) / 2), cy: Y((miny + maxy) / 2), rx: (maxx - minx) / 2 * S * 1.15, ry: (maxy - miny) / 2 * S * 1.15,
          fill: NUC_F, stroke: NUC, "stroke-width": 2.5 }, gNuc);
      }
      for (const c of s.chroms) for (const x of c.sis) if (x.micro)
        svgEl("ellipse", { cx: X(x.x), cy: Y(x.y), rx: 0.9 * S, ry: (c.len / 2 + 0.5) * S, fill: NUC_F, stroke: NUC, "stroke-width": 2.5 }, gNuc);
    }

    // labels
    const U = unattachedCount(s);
    const ph = s.phase;
    const allAtt = U === 0;
    phaseText.textContent = ph === "pro" ? (s.t > 30 * 60 ? "Prometaphase: ARRESTED in mitosis" : "Prometaphase")
      : ph === "meta" ? "Metaphase" : ph === "ana" ? "Anaphase" : ph === "telo" ? (s.monopolar ? "Mitotic exit" : "Telophase and cytokinesis")
      : s.monopolar ? "Cytokinesis failed: one cell" : "Two daughter cells";
    timeText.textContent = `${Math.floor(s.t / 60)} min ${String(Math.floor(s.t % 60)).padStart(2, "0")} s after nuclear envelope breakdown`;
    hintText.textContent = ph === "pro" || ph === "meta"
      ? (s.monopolar ? "Monastrol: kinesin-5 blocked, the poles never separated" : "Tap the left or right half of a chromosome to attach that kinetochore")
      : "";

    // side panel
    sac.className = "sp-sac " + (ph === "pro" || ph === "meta" ? (s.checkpoint && !allAtt ? "sp-wait" : "sp-go") : "");
    sac.textContent = !s.checkpoint && (ph === "pro" || ph === "meta") ? "Checkpoint OFF: APC/C–Cdc20 is free whatever the kinetochores do"
      : ph === "pro" || ph === "meta"
        ? (allAtt ? "Every kinetochore is attached: no wait signal, APC/C–Cdc20 destroys securin and cyclin B"
          : `WAIT: ${U} kinetochore${U > 1 ? "s" : ""} unattached → Mad2 makes the MCC, which blocks APC/C–Cdc20`)
        : "Securin is gone: separase has cut cohesin";
    barM(s.M / 0.8 > 1 ? 1 : s.M / 0.8); barA(s.apc); barS(s.securin); barC(s.cyclinB);
    chromList.innerHTML = "";
    s.chroms.forEach((c, ci) => {
      const k = kind(c);
      const r = htmlEl("div", "", "", chromList);
      const sw = htmlEl("i", "", "", r); sw.style.background = COLORS[ci];
      const good = k === "amphitelic" && tension(s, c);
      const bad = k === "syntelic" || k === "merotelic";
      if (s.phase === "ana" || s.phase === "telo" || s.phase === "done") {
        const dest = c.sis.map(x => x.lag ? "lagging in the middle" : x.att[0] ? (s.monopolar ? "the aster" : "left pole") : x.att[1] ? "right pole" : "nowhere (unattached, stays put)");
        const ok = !s.monopolar && !c.sis.some(x => x.lag) && dest[0] !== dest[1] && !dest.includes("nowhere (unattached, stays put)");
        r.append(`${c.id}: sister chromatids → ${dest[0] === dest[1] ? "both to " + dest[0] : dest[0] + " and " + dest[1]}`);
        r.className = ok ? "sp-ok" : "sp-bad";
        return;
      }
      r.append(`${c.id}: ${KIND_TEXT[k]}${k === "amphitelic" ? (tension(s, c) ? ", under tension" : ", no tension (taxol)") : ""}`);
      r.className = good ? "sp-ok" : bad ? "sp-bad" : "";
    });
    const ds = daughters(s);
    if (ds.length) {
      result.innerHTML = "";
      htmlEl("div", "sp-h", s.monopolar ? "Result: one cell" : "Result: two daughter cells", result);
      ds.forEach((dd, i) => {
        const name = s.monopolar ? "The cell" : i === 0 ? "Left daughter" : "Right daughter";
        const cnt = dd.counts.map((n, j) => `chr ${j + 1}: ${n}`).join(", ");
        const verdict = s.monopolar ? "every chromosome twice (tetraploid)" :
          dd.normal ? "one copy of each: normal" :
          (dd.counts.every(v => v === 1) ? `right numbers, but ${dd.micro} in a micronucleus` : `ANEUPLOID${dd.micro ? ` (${dd.micro} in a micronucleus)` : ""}`);
        const r = htmlEl("div", dd.normal ? "sp-ok" : "sp-bad", "", result);
        r.textContent = `${name}: ${cnt} → ${verdict}`;
      });
    } else result.innerHTML = "";
    logEl.innerHTML = "";
    for (const ev of s.events.slice(-6).reverse()) htmlEl("div", "", `${mmss(ev.t)}  ${ev.text}`, logEl);
    const early = ph === "pro" || ph === "meta";
    bAll.disabled = !early; bForce.disabled = !early || !s.checkpoint;
  }

  function tick(dt: number) {
    let left = dt;
    while (left > 1e-9) { const h = Math.min(1, left); step(s, h); left -= h; }
    // searching microtubules: dynamic instability (visual only), frozen by taxol
    if (!s.taxol) for (const m of smt) {
      const [px, py] = polePos(m.pole), ux = Math.cos(m.ang), uy = Math.sin(m.ang), pu = px * ux + py * uy;
      const lmax = -pu + Math.sqrt(Math.max(0, pu * pu - px * px - py * py + (R_CELL - 0.6) ** 2));
      if (m.grow) { m.len += 0.2 * dt; if (m.len >= lmax || vr.unif() < 0.02 * dt) { m.len = Math.min(m.len, lmax); m.grow = false; } }
      else { m.len -= 0.4 * dt; if (m.len <= 0.2) { m.len = 0.2; m.grow = true; m.ang = vr.unif() * 2 * Math.PI; } else if (vr.unif() < 0.01 * dt) m.grow = true; }
    }
  }
  loop = visibleLoop(host, 1 / 30, () => tick(speed / 30), render, 3);
  render();
});
