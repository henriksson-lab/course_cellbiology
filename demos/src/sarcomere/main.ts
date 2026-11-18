// Sarcomere. A drawn sarcomere (Z-discs, thin and thick filaments, myosin heads) whose
// length the student sets; band labels (A, I, H) update. Below: the length–tension curve
// (Gordon, Huxley & Julian 1966 shape) with the current point (draggable), and the three
// factors that multiply to the active force: filament overlap, binding sites exposed by
// Ca²⁺ (troponin–tropomyosin) and myosin heads available (HCM mutation, mavacamten).
// The heads go through the cross-bridge cycle at 1× real time (about one cycle per
// second per head; the muscle is held at fixed length, so nothing slides).
// Geometry is accurate in shape; Ca²⁺ and drug effects are qualitative (see model.ts).
// Options (data-*): preset = relaxed|optimal|stretched|short|hcm|mava|rigor, seed.
import { autoMount, htmlEl, svgEl, slider, button, presets, checkbox, rng, svgPoint, Slider } from "../lib/ui";
import { visibleLoop } from "../lib/particles";
import {
  Cond, THICK, BARE, THIN, ZW, SL_MIN, SL_MAX, BP, lengthFactor, exposed, available, force,
  bands, overlap, AVAIL_CONTROL, T,
} from "./model";
import { CSS } from "./style";

const MYO = "#3d5a99", MYO_LIGHT = "#c3cce0", ACTIN = "#555555", INK = "#1b2a3a", CA = "#c2255c", DRUG = "#e8590c";
// ---- sarcomere drawing geometry (px)
const W = 1000, H = 404, PX = 250, CX = W / 2;          // 250 px per µm
const THICK_Y = [150, 260], GAP = 55, HEADS_PER_HALF = 11;
const THIN_Y = [THICK_Y[0] - GAP, (THICK_Y[0] + THICK_Y[1]) / 2, THICK_Y[1] + GAP];
const UNIT = 0.1;                                       // troponin–tropomyosin unit drawn every 0.1 µm
// ---- length–tension plot
const PW = 520, PH = 270, ML = 56, MR = 14, MT = 14, MB = 46, FMAX = 1.4;
const px = (sl: number) => ML + (sl - SL_MIN) / (SL_MAX - SL_MIN) * (PW - ML - MR);
const py = (f: number) => PH - MB - f / FMAX * (PH - MT - MB);
const SPEEDS = [0.1, 0.25, 1];

type State = 0 | 1 | 2 | 3 | 4;   // 0 detached cocked, 1 attached pre-stroke, 2 power stroke, 3 attached post-stroke, 4 detached re-cocking
interface Head {
  row: number; side: -1 | 1; half: -1 | 1; d: number;   // d = distance from the M-line (µm)
  park: number; s: State; t: number; dur: number;
  g: SVGGElement; neck: SVGLineElement; ball: SVGCircleElement; dot: SVGCircleElement;
}

const PRESETS: { key: string; label: string; c: Cond; text: string }[] = [
  { key: "relaxed", label: "Relaxed (rest Ca²⁺)", c: { sl: 2.1, ca: 0.1, hcm: false, dose: 0, atp: true },
    text: "Resting cytosolic Ca²⁺ (0.1 µM): tropomyosin covers the binding sites on actin. The heads are cocked and ready, but cannot bind." },
  { key: "optimal", label: "Full activation, optimal length", c: { sl: 2.1, ca: 10, hcm: false, dose: 0, atp: true },
    text: "Ca²⁺ released from the sarcoplasmic reticulum (10 µM) moves tropomyosin. Every head in the overlap can work: maximal force." },
  { key: "stretched", label: "Stretched to 3.0 µm", c: { sl: 3.0, ca: 10, hcm: false, dose: 0, atp: true },
    text: "Thin filaments pulled out of the A band: fewer heads face a thin filament, so less force." },
  { key: "short", label: "Short (1.7 µm)", c: { sl: 1.7, ca: 10, hcm: false, dose: 0, atp: true },
    text: "Thin filaments from the two halves overlap each other, and the thick filaments are close to the Z-discs: force falls." },
  { key: "hcm", label: "HCM mutation", c: { sl: 2.1, ca: 10, hcm: true, dose: 0, atp: true },
    text: "A hypertrophic cardiomyopathy mutation in cardiac myosin: fewer heads are parked, more heads cycle, the heart muscle pulls too hard." },
  { key: "mava", label: "HCM + mavacamten", c: { sl: 2.1, ca: 10, hcm: true, dose: 0.3, atp: true },
    text: "Mavacamten binds myosin and parks heads in the folded, switched-off state (orange dot). Force comes back towards normal." },
  { key: "rigor", label: "No ATP (rigor)", c: { sl: 2.1, ca: 0.1, hcm: false, dose: 0, atp: false },
    text: "Without ATP, heads bind and finish their stroke, but cannot let go: ATP binding is what releases a head. The muscle is locked (rigor mortis)." },
];

autoMount("sarcomere", host => {
  if (!document.getElementById("sm-style")) {
    const st = document.createElement("style"); st.id = "sm-style"; st.textContent = CSS; document.head.appendChild(st);
  }
  host.classList.add("sm");
  const d = host.dataset;
  const R = rng(Number(d.seed) || 7);
  const p0 = PRESETS.find(p => p.key === d.preset) ?? PRESETS[1];
  const c: Cond = { ...p0.c };
  let speed = 1, simT = 0;

  // ================= sarcomere view
  const main = htmlEl("div", "sm-main", "", host);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "sm-sarc", role: "img",
    "aria-label": "A sarcomere: two Z-discs, thin filaments, thick filaments with myosin heads" }, main);
  const gBands = svgEl("g", {}, svg);
  const gThin = svgEl("g", {}, svg);
  const gThick = svgEl("g", {}, svg);
  const gHeads = svgEl("g", {}, svg);
  const gZ = svgEl("g", {}, svg);
  const gLab = svgEl("g", { "font-size": 17 }, svg);

  // Z-discs (drawn as zig-zag lines), M-line
  const zPaths = [0, 1].map(() => svgEl("path", { fill: "none", stroke: INK, "stroke-width": 5, "stroke-linejoin": "round" }, gZ));
  const mLine = svgEl("line", { x1: CX, x2: CX, y1: THIN_Y[0] - 22, y2: THIN_Y[2] + 22, stroke: INK, "stroke-width": 2, "stroke-dasharray": "5 4" }, gZ);
  // thick filaments: backbone plus bare-zone marker
  const thickEls = THICK_Y.map(y => svgEl("rect", { y: y - 5, height: 10, rx: 5, fill: MYO }, gThick));
  // thin filaments: for each row, one from the left Z-disc and one from the right Z-disc
  interface ThinEl { line: SVGLineElement; units: { tm: SVGLineElement; tn: SVGCircleElement; u: number }[] }
  const nUnits = Math.round(THIN / UNIT);
  const thin: ThinEl[][] = THIN_Y.map(y => [-1, 1].map(side => {
    const yy = y + side * 3;
    const line = svgEl("line", { y1: yy, y2: yy, stroke: ACTIN, "stroke-width": 6, "stroke-linecap": "round" }, gThin);
    const units = Array.from({ length: nUnits }, () => {
      const tm = svgEl("line", { stroke: INK, "stroke-width": 2.4, "stroke-linecap": "round" }, gThin);
      const tn = svgEl("circle", { r: 3.6, stroke: INK, "stroke-width": 1.2 }, gThin);
      return { tm, tn, u: R.unif() };
    });
    return { line, units };
  }));

  // heads
  const heads: Head[] = [];
  const spacing = (THICK / 2 - BARE / 2) / HEADS_PER_HALF;
  THICK_Y.forEach((_, row) => {
    for (const half of [-1, 1] as const) for (const side of [-1, 1] as const) for (let k = 0; k < HEADS_PER_HALF; k++) {
      const g = svgEl("g", {}, gHeads);
      const neck = svgEl("line", { stroke: MYO, "stroke-width": 3, "stroke-linecap": "round" }, g);
      const ball = svgEl("circle", { r: 5.5, fill: MYO }, g);
      const dot = svgEl("circle", { r: 3, fill: DRUG }, g);
      heads.push({ row, side, half, d: BARE / 2 + (k + 0.5) * spacing + (side > 0 ? spacing * 0.3 : 0),
        park: R.unif(), s: 0, t: R.unif() * 0.5, dur: 0, g, neck, ball, dot });
    }
  });

  // band brackets
  const bracket = () => {
    const g = svgEl("g", {}, gBands);
    const p = svgEl("path", { fill: "none", stroke: INK, "stroke-width": 1.6 }, g);
    const t = svgEl("text", { "font-size": 17, "text-anchor": "middle" }, g);
    return { g, p, t };
  };
  const brA = bracket(), brH = bracket(), brI1 = bracket(), brI2 = bracket();
  const zLab = [0, 1].map(() => { const t = svgEl("text", { "font-size": 16, "text-anchor": "middle", y: H - 8 }, gLab); t.textContent = "Z-disc"; return t; });
  const mLab = svgEl("text", { x: CX, y: H - 8, "font-size": 16, "text-anchor": "middle" }, gLab); mLab.textContent = "M-line";
  const warn = svgEl("text", { x: CX, y: THICK_Y[0] + GAP / 2 + 6, "font-size": 16, "text-anchor": "middle", fill: DRUG, "font-weight": 700 }, gLab);

  // legend + status under the drawing
  const legend = htmlEl("div", "sm-legend", "", main);
  legend.innerHTML =
    `<span><i style="background:${MYO}"></i>myosin (thick filament, heads)</span>`
    + `<span><i style="background:${ACTIN}"></i>actin (thin filament)</span>`
    + `<span><i style="background:${INK};height:3px"></i>tropomyosin</span>`
    + `<span><i class="sm-round" style="background:${CA}"></i>troponin with Ca²⁺</span>`
    + `<span><i class="sm-round" style="background:${MYO_LIGHT}"></i>parked head</span>`
    + `<span><i class="sm-round" style="background:${DRUG}"></i>mavacamten</span>`;
  const status = htmlEl("div", "sm-status", "", main);
  const tools = htmlEl("div", "qb-presets", "", main);
  const bPause = button(tools, "Pause", () => { if (!loop) return; loop.setPaused(!loop.paused); bPause.textContent = loop.paused ? "Run" : "Pause"; });
  const spLab = htmlEl("label", "sm-speed", "time runs at ", tools);
  const sSpeed = htmlEl("select", "", "", spLab);
  for (const v of SPEEDS) { const o = htmlEl("option", "", v + "× real time", sSpeed); o.value = String(v); }
  sSpeed.value = "1";
  sSpeed.addEventListener("change", () => { speed = Number(sSpeed.value); sSpeed.blur(); });

  // ================= right side: plot + factors
  const side = htmlEl("div", "sm-side", "", host);
  htmlEl("div", "sm-h", "Length–tension curve (muscle held at fixed length)", side);
  const plot = svgEl("svg", { viewBox: `0 0 ${PW} ${PH}`, class: "sm-plot" }, side);
  const pLeg = htmlEl("div", "sm-legend", "", side);
  pLeg.innerHTML = `<span><i style="background:repeating-linear-gradient(90deg,#868e96 0 6px,transparent 6px 10px);height:3px"></i>normal muscle, full Ca²⁺</span>`
    + `<span><i style="background:${MYO};height:3px"></i>with your settings</span>`
    + `<span><i class="sm-round" style="background:${DRUG}"></i>this sarcomere (drag)</span>`;
  const factors = htmlEl("div", "sm-factors", "", side);
  const presetText = htmlEl("div", "qb-note sm-ptext", "", side);

  // axes
  for (let f = 0; f <= 1.4001; f += 0.2) {
    svgEl("line", { x1: ML, x2: PW - MR, y1: py(f), y2: py(f), class: "grid" }, plot);
    const t = svgEl("text", { x: ML - 7, y: py(f) + 5, "font-size": 15, "text-anchor": "end" }, plot);
    t.textContent = String(Math.round(f * 100));
  }
  for (let s = 1.5; s <= 3.51; s += 0.5) {
    svgEl("line", { x1: px(s), x2: px(s), y1: PH - MB, y2: PH - MB + 6, class: "axis" }, plot);
    const t = svgEl("text", { x: px(s), y: PH - MB + 22, "font-size": 15, "text-anchor": "middle" }, plot);
    t.textContent = s.toFixed(1);
  }
  svgEl("line", { x1: ML, x2: PW - MR, y1: PH - MB, y2: PH - MB, class: "axis" }, plot);
  svgEl("line", { x1: ML, x2: ML, y1: MT, y2: PH - MB, class: "axis" }, plot);
  const xl = svgEl("text", { x: (ML + PW - MR) / 2, y: PH - 6, "font-size": 15, "text-anchor": "middle" }, plot);
  xl.textContent = "sarcomere length (µm)";
  const yl = svgEl("text", { x: 0, y: 0, "font-size": 15, "text-anchor": "middle", transform: `translate(15 ${(MT + PH - MB) / 2}) rotate(-90)` }, plot);
  yl.textContent = "active force (% of normal max.)";
  const curve = (f: (s: number) => number) => {
    let s = "";
    for (let i = 0; i <= 260; i++) { const sl = SL_MIN + (SL_MAX - SL_MIN) * i / 260; s += (i ? "L" : "M") + px(sl).toFixed(1) + "," + py(f(sl)).toFixed(1); }
    return s;
  };
  svgEl("path", { d: curve(lengthFactor), fill: "none", stroke: "#868e96", "stroke-width": 2, "stroke-dasharray": "6 4" }, plot);
  const cur = svgEl("path", { fill: "none", stroke: MYO, "stroke-width": 3 }, plot);
  const vline = svgEl("line", { y1: MT, y2: PH - MB, stroke: DRUG, "stroke-width": 1.5, "stroke-dasharray": "3 3" }, plot);
  const hit = svgEl("rect", { x: ML, y: MT, width: PW - ML - MR, height: PH - MT - MB, fill: "transparent" }, plot);
  const pt = svgEl("circle", { r: 9, fill: DRUG, stroke: "#fff", "stroke-width": 2.5 }, plot);
  const ptLab = svgEl("text", { "font-size": 15, "font-weight": 700, fill: DRUG }, plot);
  // drag anywhere on the plot to set the length
  hit.style.cursor = "ew-resize"; hit.style.touchAction = "none"; pt.style.touchAction = "none"; pt.style.cursor = "ew-resize";
  const dragTo = (ev: PointerEvent) => {
    const [x] = svgPoint(plot, ev);
    const sl = SL_MIN + (x - ML) / (PW - ML - MR) * (SL_MAX - SL_MIN);
    c.sl = Math.round(Math.max(SL_MIN, Math.min(SL_MAX, sl)) * 100) / 100;
    sSL.set(c.sl); clearPreset(); update();
  };
  for (const el of [hit, pt] as SVGElement[]) {
    el.addEventListener("pointerdown", ev => {
      ev.preventDefault(); el.setPointerCapture(ev.pointerId); dragTo(ev);
      const mv = (e: PointerEvent) => dragTo(e);
      const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    });
  }

  // ================= controls
  const panel = htmlEl("div", "qb-panel sm-panel", "", host);
  htmlEl("div", "sm-h", "Presets", panel);
  const pBtns = presets(panel, PRESETS.map(p => ({ label: p.label, apply: () => {
    Object.assign(c, p.c); presetText.textContent = p.text; syncControls(); update();
  } })));
  const sSL = slider(panel, "sarcomere length", SL_MIN, SL_MAX, 0.01, c.sl, v => { c.sl = v; clearPreset(); update(); }, v => v.toFixed(2) + " µm");
  const caToS = (ca: number) => Math.log10(ca), sToCa = (s: number) => +Math.pow(10, s).toPrecision(2);
  const sCa = slider(panel, "cytosolic Ca²⁺", -1.3, 1.3, 0.01, caToS(c.ca), v => { c.ca = sToCa(v); clearPreset(); update(); }, v => fmtCa(sToCa(v)) + " µM");
  const cHcm = checkbox(panel, "HCM mutation in cardiac myosin (more heads active)", c.hcm, v => { c.hcm = v; clearPreset(); update(); });
  const sDose = slider(panel, "mavacamten", 0, 1, 0.05, c.dose, v => { c.dose = v; clearPreset(); update(); }, v => v === 0 ? "none" : Math.round(v * 100) + " %");
  const cAtp = checkbox(panel, "ATP present (untick: no ATP, rigor)", c.atp, v => { c.atp = v; clearPreset(); update(); });
  htmlEl("div", "qb-note", "The shape of the length–tension curve comes from filament geometry (frog muscle, Gordon, Huxley & Julian 1966). "
    + "The Ca²⁺ and mavacamten effects are qualitative: right direction, illustrative numbers. Mavacamten dose is in % of the maximal effect.", panel);

  function fmtCa(v: number) { return v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0); }
  function clearPreset() { pBtns.forEach(b => b.classList.remove("active")); presetText.textContent = ""; }
  function syncControls() { sSL.set(c.sl); sCa.set(caToS(c.ca)); cHcm.checked = c.hcm; sDose.set(c.dose); cAtp.checked = c.atp; }

  // ================= geometry helpers
  const zx = (k: -1 | 1) => CX + k * (c.sl / 2) * PX;         // centre x of a Z-disc
  const exp = () => exposed(c.ca);
  const avail = () => available(c.hcm, c.dose);
  /** thin-filament unit under the tip of head h, or null if no thin filament from its own Z-disc reaches it */
  function siteUnit(h: Head) {
    const thinTip = c.sl / 2 - ZW / 2 - THIN;          // distance of the thin tip from the M-line (own half)
    if (h.d < thinTip) return null;
    if (h.d > c.sl / 2 - ZW / 2) return null;           // beyond the Z-disc (very short sarcomere)
    const fromZ = c.sl / 2 - ZW / 2 - h.d;              // distance from the own Z-disc
    const r = h.side < 0 ? h.row : h.row + 1;
    const fil = thin[r][h.half < 0 ? 0 : 1];
    return fil.units[Math.min(nUnits - 1, Math.max(0, Math.floor(fromZ / UNIT)))];
  }
  const isParked = (h: Head) => c.atp && h.park > avail();
  const unitOpen = (u: { u: number }) => u.u < exp();

  // ================= simulation (stochastic cycle per head)
  function enter(h: Head, s: State) {
    h.s = s; h.t = 0;
    const r = 0.6 + 0.8 * R.unif();
    h.dur = s === 1 ? T.pRelease * r : s === 2 ? T.stroke : s === 3 ? T.adp * r : s === 4 ? T.recock * r : 0;
  }
  function step(dt: number) {
    simT += dt;
    for (const h of heads) {
      h.t += dt;
      if (h.s === 0) {
        if (isParked(h)) continue;
        const u = siteUnit(h);
        if (!u) continue;
        if (!c.atp || unitOpen(u)) { if (R.unif() < T.bindRate * dt) enter(h, 1); }
      } else if (h.s === 1) { if (h.t >= h.dur) enter(h, 2); }
      else if (h.s === 2) { if (h.t >= h.dur) enter(h, 3); }
      else if (h.s === 3) {
        if (!siteUnit(h)) { enter(h, 4); continue; }     // filament pulled away (length changed)
        if (c.atp && h.t >= h.dur) enter(h, 4);           // ATP binds: head lets go
      } else if (h.s === 4) {
        if (c.atp && h.t >= h.dur) enter(h, 0);           // hydrolysis re-cocks the lever
        else if (!c.atp && h.t >= h.dur) enter(h, 0);
      }
    }
  }

  // ================= drawing
  function bracketAt(b: ReturnType<typeof bracket>, x0: number, x1: number, y: number, up: boolean, label: string) {
    const show = x1 - x0 > 2;
    b.g.style.display = show ? "" : "none";
    if (!show) return;
    const tk = up ? 7 : -7;
    b.p.setAttribute("d", `M${x0},${y + tk}L${x0},${y}L${x1},${y}L${x1},${y + tk}`);
    setT(b.t, (x0 + x1) / 2, up ? y - 6 : y + 19, label);
  }
  function setT(t: SVGTextElement, x: number, y: number, s: string) { t.setAttribute("x", String(x)); t.setAttribute("y", String(y)); t.textContent = s; }

  function drawStatic() {
    const zl = zx(-1), zr = zx(1);
    const zz = (x: number) => { let s = `M${x},${THIN_Y[0] - 26}`; for (let y = THIN_Y[0] - 26, k = 0; y < THIN_Y[2] + 26; y += 12, k++) s += `L${x + (k % 2 ? -5 : 5)},${y + 12}`; return s; };
    zPaths[0].setAttribute("d", zz(zl)); zPaths[1].setAttribute("d", zz(zr));
    zLab[0].setAttribute("x", String(zl)); zLab[1].setAttribute("x", String(zr));
    // thick filaments: cannot be longer than the space between the Z-discs
    const half = Math.min(THICK / 2, c.sl / 2 - ZW / 2) * PX;
    thickEls.forEach(e => { e.setAttribute("x", String(CX - half)); e.setAttribute("width", String(2 * half)); });
    // thin filaments and their regulatory units
    const e = exp();
    THIN_Y.forEach((y, r) => [0, 1].forEach(k => {
      const s = k === 0 ? 1 : -1;                      // direction from its Z-disc into the sarcomere
      const z = k === 0 ? zl : zr;
      const x0 = z + s * (ZW / 2) * PX, x1 = z + s * (ZW / 2 + THIN) * PX;
      const yy = y + (k === 0 ? -3 : 3);
      const f = thin[r][k];
      setAttrs(f.line, { x1: x0, x2: x1 });
      f.units.forEach((u, i) => {
        const a = x0 + s * (i + 0.15) * UNIT * PX, b = x0 + s * (i + 0.85) * UNIT * PX;
        const open = c.atp ? u.u < e : true;            // in rigor, bound heads push tropomyosin aside
        const dy = open ? (k === 0 ? -6 : 6) : 0;
        setAttrs(u.tm, { x1: a, x2: b, y1: yy + dy, y2: yy + dy });
        const ca = u.u < e;
        setAttrs(u.tn, { cx: (a + b) / 2, cy: yy + (k === 0 ? -7 : 7) + dy * 0.2, fill: ca ? CA : "#fff" });
      });
    }));
    // bands: A band (thick filament), H zone (no thin), I bands (no thick)
    const yTop = THIN_Y[0] - 36, yBot = THIN_Y[2] + 28;
    const b = bands(c.sl);
    bracketAt(brA, CX - half, CX + half, yTop, true, `A band ${b.A.toFixed(2)} µm`);
    const hHalf = Math.max(0, c.sl / 2 - ZW / 2 - THIN) * PX;
    bracketAt(brH, CX - hHalf, CX + hHalf, yBot, false, hHalf * 2 > 60 ? `H zone ${b.H.toFixed(2)}` : "");
    const iw = Math.max(0, (c.sl - THICK) / 2) * PX;
    bracketAt(brI1, zl, zl + iw, yBot, false, iw > 70 ? `I ${(b.I / 2).toFixed(2)}` : iw > 14 ? "I" : "");
    bracketAt(brI2, zr - iw, zr, yBot, false, iw > 70 ? `I ${(b.I / 2).toFixed(2)}` : iw > 14 ? "I" : "");
    warn.textContent = c.sl < BP.knee ? "thick filaments pressed against the Z-discs" : "";
    mLab.style.display = c.sl < 1.5 ? "none" : "";
  }

  function setAttrs(el: Element, a: Record<string, number | string>) { for (const k in a) el.setAttribute(k, String(a[k])); }

  function drawHeads() {
    const dAvail = c.dose > 0, a0 = available(c.hcm, 0);
    for (const h of heads) {
      const bx = CX + (h.half) * h.d * PX;
      const yt = THICK_Y[h.row];
      const by = yt + h.side * 5;
      const toM = -h.half;                                  // +1: towards the M-line in x
      const reach = GAP - 9;                               // tip touches the thin filament
      let tx: number, ty: number, col = MYO, op = 1;
      const parked = h.s === 0 && isParked(h);
      if (parked) {
        tx = bx + toM * 15; ty = yt + h.side * 9; col = MYO_LIGHT;
      } else if (h.s === 0) {
        tx = bx - toM * 9; ty = yt + h.side * reach * 0.62; op = 0.7;
      } else if (h.s === 1) {
        tx = bx - toM * 9; ty = yt + h.side * reach;
      } else if (h.s === 2) {
        const f = smooth(Math.min(1, h.t / h.dur));
        tx = bx + toM * (-9 + 20 * f); ty = yt + h.side * reach;
      } else if (h.s === 3) {
        tx = bx + toM * 11; ty = yt + h.side * reach;
      } else {
        const f = c.atp ? smooth(Math.min(1, h.t / Math.max(1e-6, h.dur))) : 0;
        tx = bx + toM * (11 - 20 * f); ty = yt + h.side * reach * (0.62 + 0.2 * (1 - f)); op = 0.7;
      }
      // heads beyond a Z-disc (very short sarcomere) are hidden
      const inside = h.d <= c.sl / 2 - ZW / 2;
      h.g.style.display = inside ? "" : "none";
      setAttrs(h.neck, { x1: bx, y1: by, x2: tx, y2: ty, stroke: col });
      setAttrs(h.ball, { cx: tx, cy: ty, fill: col });
      h.g.setAttribute("opacity", String(op));
      h.dot.style.display = parked && dAvail && h.park <= a0 ? "" : "none";       // parked by the drug
      if (h.dot.style.display === "") setAttrs(h.dot, { cx: tx, cy: ty });
    }
  }
  const smooth = (f: number) => f * f * (3 - 2 * f);

  function counts() {
    let inOv = 0, att = 0;
    for (const h of heads) {
      if (siteUnit(h)) inOv++;
      if (h.s >= 1 && h.s <= 3) att++;
    }
    return { inOv, att };
  }

  // ================= update of everything that depends on the controls
  function update() {
    drawStatic();
    const e = exp(), a = avail(), L = lengthFactor(c.sl), F = force(c);
    cur.setAttribute("d", curve(sl => lengthFactor(sl) * e * a / AVAIL_CONTROL));
    const fy = c.atp ? F : 0;
    setAttrs(pt, { cx: px(c.sl), cy: py(Math.min(FMAX, fy)) });
    setAttrs(vline, { x1: px(c.sl), x2: px(c.sl) });
    const lx = px(c.sl) + (c.sl > 3.1 ? -12 : 12);
    setAttrs(ptLab, { x: lx, y: Math.max(MT + 14, py(Math.min(FMAX, fy)) - 12), "text-anchor": c.sl > 3.1 ? "end" : "start" });
    ptLab.textContent = c.atp ? `${Math.round(F * 100)} %` : "rigor";
    const ov = overlap(c.sl);
    const bar = (label: string, v: number, note: string, color: string) =>
      `<div class="sm-f"><span class="sm-fl">${label}</span><span class="sm-fb"><b style="width:${Math.min(100, v * 100).toFixed(1)}%;background:${color}"></b></span><span class="sm-fv">${Math.round(v * 100)} %</span><span class="sm-fn">${note}</span></div>`;
    factors.innerHTML =
      bar("filament overlap", L, c.sl >= BP.plateau0 ? `${ov.toFixed(2)} of 0.70 µm per half` : "thin filaments collide", MYO)
      + bar("sites exposed", c.atp ? e : 1, c.atp ? `Ca²⁺ ${fmtCa(c.ca)} µM` : "rigor heads push tropomyosin aside", CA)
      + bar("heads available", c.atp ? a : 1, c.atp ? (c.hcm ? "HCM " : "normal ") + (c.dose > 0 ? "+ mavacamten" : "") : "no ATP: none parked", c.dose > 0 ? DRUG : MYO_LIGHT)
      + `<div class="sm-force">${c.atp
        ? `Active force = ${L.toFixed(2)} × ${e.toFixed(2)} × ${a.toFixed(2)} / ${AVAIL_CONTROL.toFixed(2)} = <b>${Math.round(F * 100)} %</b> of normal maximum`
        : `<b>Rigor:</b> heads stay bound after the stroke, the muscle is stiff and cannot relax or cycle`}</div>`;
    loop?.redraw();
  }

  function render() {
    drawHeads();
    const k = counts();
    status.textContent = `heads facing a thin filament: ${k.inOv} of ${heads.length} · attached now: ${k.att} · time runs at ${speed}× real time (${simT.toFixed(1)} s)`;
  }

  let loop: ReturnType<typeof visibleLoop> | undefined;
  presetText.textContent = p0.text;
  pBtns[PRESETS.indexOf(p0)].classList.add("active");
  update();
  loop = visibleLoop(host, 1 / 60, () => step(speed / 60), render, 3);
  loop.redraw();
});
