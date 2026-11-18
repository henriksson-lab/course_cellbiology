// Optional particle view for the cell battery (off by default). Ions on both sides of a
// membrane with K⁺, Na⁺ and Cl⁻ channels; ions cross open channels one at a time, in each
// direction at rates proportional to the GHK unidirectional fluxes, so the net direction
// and the balance of charge follow the numbers in the main view. Self-contained: remove
// this file and its two uses in main.ts to drop the particle view.
import { htmlEl, rng } from "../lib/ui";
import { pointRenderer, makePoints, visibleLoop, hexRGB, gaussPairs } from "../lib/particles";
import { State, Ion, IONS, NAME, COLOR, fluxes, effP } from "./model";

const W = 100, H = 50, OUT_Y1 = 21, IN_Y0 = 29;
const MM_PER_DOT = 2;
const MAXCH = 6;
const GROUP: Record<Ion, number> = { K: 6, Na: 38, Cl: 70 };    // x where each ion's channels start
const SP = 4.2;

interface Dot { ion: Ion; x: number; y: number; transit: number; tx0: number; ty0: number; tx1: number; ty1: number }

export const openChannels = (P: number) => P <= 0 ? 0 : Math.max(0, Math.min(MAXCH, Math.round(1.8 * Math.log10(P) + 4)));

export function mountParticles(box: HTMLElement, st0: State, V0: number) {
  const wrap = htmlEl("div", "cb-pwrap", "", box);
  const stage = htmlEl("div", "cb-pstage", "", wrap);
  const bg = htmlEl("canvas", "cb-pcanvas", "", stage);
  const glc = htmlEl("canvas", "cb-pcanvas", "", stage);
  const info = htmlEl("div", "qb-readout cb-pinfo", "", wrap);
  htmlEl("div", "qb-note", "Each dot is about 2 mM of ions. Ions cross one at a time, in both directions; the rates follow the GHK equation "
    + "(sped up or slowed down so you can follow them). So few ions cross that the concentrations do not change: each ion "
    + "that crosses is replaced far from the membrane. Open channels drawn grow with the log of the permeability (not to scale).", wrap);

  const r = rng(7), gauss = gaussPairs(r.unif);
  let st = st0, V = V0;
  const dots: Dot[] = [];
  const counts: Record<Ion, { o: number[]; i: number[] }> = { K: { o: [0], i: [0] }, Na: { o: [0], i: [0] }, Cl: { o: [0], i: [0] } };
  let t = 0, t0 = 0;

  function populate() {
    dots.length = 0;
    for (const ion of IONS) {
      for (const [c, y0, y1] of [[st.cout[ion], 0, OUT_Y1], [st.cin[ion], IN_Y0, H]] as const) {
        const n = Math.round(c / MM_PER_DOT);
        for (let k = 0; k < n; k++) dots.push({ ion, x: r.unif() * W, y: y0 + 0.5 + r.unif() * (y1 - y0 - 1), transit: 0, tx0: 0, ty0: 0, tx1: 0, ty1: 0 });
      }
    }
  }
  const key = (s: State) => IONS.map(i => s.cin[i] + "/" + s.cout[i]).join(",");
  let lastKey = key(st);
  populate();

  const rend = pointRenderer(glc, W, H);
  const pts = makePoints(2000);
  const ctx = bg.getContext("2d")!;
  const rgb: Record<Ion, [number, number, number]> = { K: hexRGB(COLOR.K), Na: hexRGB(COLOR.Na), Cl: hexRGB(COLOR.Cl) };

  function step() {
    t += 1 / 60;
    for (const d of dots) {
      if (d.transit > 0) {
        d.transit -= 1 / 12;
        const f = Math.max(0, 1 - d.transit);
        d.x = d.tx0 + (d.tx1 - d.tx0) * f; d.y = d.ty0 + (d.ty1 - d.ty0) * f;
        continue;
      }
      let x = d.x + 0.35 * gauss(), y = d.y + 0.35 * gauss();
      if (x < 0) x += W; else if (x >= W) x -= W;
      if (d.y < OUT_Y1) { if (y < 0) y = -y; if (y > OUT_Y1 - 0.3) y = 2 * (OUT_Y1 - 0.3) - y; }
      else { if (y > H) y = 2 * H - y; if (y < IN_Y0 + 0.3) y = 2 * (IN_Y0 + 0.3) - y; }
      d.x = x; d.y = y;
    }
    // crossing events: rate ∝ GHK unidirectional flux; scale so the busiest direction has ≤ 25 per s
    const P = effP(st);
    const f = IONS.map(ion => fluxes(st, ion, V));
    let mx = 0; for (const q of f) mx = Math.max(mx, q.eff, q.inf);
    const k = Math.min(0.2, 25 / Math.max(mx, 1e-9));
    IONS.forEach((ion, j) => {
      if (openChannels(P[ion]) === 0) return;
      for (const [rate, from] of [[f[j].eff * k, 1], [f[j].inf * k, 0]] as const) {
        if (r.unif() < 1 - Math.exp(-rate / 60)) cross(ion, from);
      }
    });
    const sec = Math.floor(t);
    for (const ion of IONS) { const c = counts[ion]; while (c.o.length <= sec) { c.o.push(0); c.i.push(0); } }
  }

  function cross(ion: Ion, from: number) {
    const n = openChannels(effP(st)[ion]);
    const cx = GROUP[ion] + SP * Math.floor(r.unif() * n) + SP / 2;
    // nearest free dot of this ion on the source side
    let best: Dot | null = null, bd = Infinity;
    for (const d of dots) {
      if (d.ion !== ion || d.transit > 0 || (d.y < OUT_Y1 ? 0 : 1) !== from) continue;
      let dx = Math.abs(d.x - cx); if (dx > W / 2) dx = W - dx;
      const dy = from === 0 ? OUT_Y1 - d.y : d.y - IN_Y0, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return;
    const yEnd = from === 0 ? IN_Y0 + 1 : OUT_Y1 - 1;
    Object.assign(best, { transit: 1, tx0: cx, ty0: from === 0 ? OUT_Y1 - 1 : IN_Y0 + 1, tx1: cx, ty1: yEnd });
    // keep the concentrations: a dot of the same ion far away on the far side goes back to the source side
    const far = dots.filter(d => d.ion === ion && d !== best && d.transit <= 0 && (from === 0 ? d.y > IN_Y0 + 8 : d.y < OUT_Y1 - 8));
    if (far.length) {
      const d = far[Math.floor(r.unif() * far.length)];
      d.x = r.unif() * W; d.y = from === 0 ? 0.5 + r.unif() * 4 : H - 0.5 - r.unif() * 4;
    }
    const c = counts[ion], sec = Math.floor(t);
    while (c.o.length <= sec) { c.o.push(0); c.i.push(0); }
    if (from === 1) c.o[sec]++; else c.i[sec]++;
  }

  function render() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(bg.clientWidth * dpr), h = Math.round(bg.clientHeight * dpr);
    if (bg.width !== w || bg.height !== h) { bg.width = w; bg.height = h; }
    const s = w / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = "#eef4fa"; ctx.fillRect(0, 0, W, OUT_Y1);
    ctx.fillStyle = "#fbfaf5"; ctx.fillRect(0, IN_Y0, W, H - IN_Y0);
    ctx.fillStyle = "#f6f0de"; ctx.fillRect(0, OUT_Y1, W, IN_Y0 - OUT_Y1);
    ctx.strokeStyle = "#8a6a12"; ctx.lineWidth = 0.3;
    for (const y of [OUT_Y1, IN_Y0]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const P = effP(st);
    for (const ion of IONS) {
      const n = openChannels(P[ion]), nAsked = openChannels(st.P[ion]);
      for (let k = 0; k < MAXCH; k++) {
        const x = GROUP[ion] + SP * k + SP / 2;
        const open = k < n, blocked = !open && k < nAsked;
        ctx.fillStyle = open ? COLOR[ion] : blocked ? "#e8590c" : "#ced4da";
        ctx.fillRect(x - 1.6, OUT_Y1 - 0.4, 1.0, IN_Y0 - OUT_Y1 + 0.8);
        ctx.fillRect(x + 0.6, OUT_Y1 - 0.4, 1.0, IN_Y0 - OUT_Y1 + 0.8);
        if (!open) { ctx.fillRect(x - 0.6, (OUT_Y1 + IN_Y0) / 2 - 0.6, 1.2, 1.2); }
      }
      ctx.fillStyle = COLOR[ion]; ctx.font = "bold 2.6px system-ui, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(NAME[ion] + " channels", GROUP[ion] + 0.5, IN_Y0 + 3.2);
    }
    ctx.fillStyle = "#1b2a3a"; ctx.font = "2.6px system-ui, sans-serif";
    ctx.fillText("outside", 1, 3); ctx.fillText("inside", 1, H - 1);
    let n = 0;
    for (const d of dots) {
      pts.pos[2 * n] = d.x; pts.pos[2 * n + 1] = d.y; pts.size[n] = d.transit > 0 ? 1.6 : 1.1;
      const c = rgb[d.ion]; pts.col[4 * n] = c[0]; pts.col[4 * n + 1] = c[1]; pts.col[4 * n + 2] = c[2]; pts.col[4 * n + 3] = 255;
      n++;
    }
    pts.n = n; rend.draw(pts);
    // rates over the last 10 s
    const sec = Math.floor(t), span = Math.min(10, sec - t0);
    info.textContent = span < 1 ? "counting crossings …" : IONS.map(ion => {
      let o = 0, i = 0; for (let k = sec - span; k < sec; k++) { o += counts[ion].o[k] || 0; i += counts[ion].i[k] || 0; }
      return `${NAME[ion].padEnd(3)} out ${(o / span).toFixed(1).padStart(5)}/s   in ${(i / span).toFixed(1).padStart(5)}/s`;
    }).join("\n");
  }

  const loop = visibleLoop(stage, 1 / 60, step, render, 3);
  return {
    update(s: State, v: number) {
      st = { cin: { ...s.cin }, cout: { ...s.cout }, P: { ...s.P }, lidocaine: s.lidocaine }; V = v;
      const k = key(st); if (k !== lastKey) { lastKey = k; populate(); }
      for (const ion of IONS) { counts[ion] = { o: [], i: [] }; }
      t = Math.floor(t); t0 = t;
      loop.redraw();
    },
    destroy() { loop.setPaused(true); wrap.remove(); },
  };
}
