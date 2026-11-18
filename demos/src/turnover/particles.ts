// Optional particle view for the turnover demo (off by default): one cell with the
// target (blue) and bystander (grey) molecules. New molecules fade in where ribosomes make
// them; destroyed ones travel into the nearest proteasome, or fade (lysosome, dilution).
// Time runs at 1× real time by default; faster speeds are a choice.
import { htmlEl, button } from "../lib/ui";
import { pointRenderer, makePoints, visibleLoop, hexRGB } from "../lib/particles";
import { Setup } from "./model";
import { TurnoverSim, W, H, CELL, NUC, PROTEASOMES, GROW_S, PROT_S, FADE_S } from "./sim";

export const COL = { target: "#1971c2", bystander: "#6c757d", drug: "#e8590c" };
const SPEEDS: [number, string][] = [
  [1, "1× real time"], [10, "10×"], [60, "60× (1 min per s)"], [600, "600× (10 min per s)"], [3600, "3600× (1 h per s)"],
];

export interface Trace { t: number[]; a: number[]; b: number[] }

export function mountParticles(box: HTMLElement, s0: Setup, tEnd0: number, m0: number,
  onTrace: (tr: Trace, tNow: number) => void) {
  const wrap = htmlEl("div", "tn-pwrap", "", box);
  const row = htmlEl("div", "tn-prow", "", wrap);
  const play = button(row, "Pause", () => { running = !running; loop.setPaused(!running); play.textContent = running ? "Pause" : "Play"; });
  button(row, "Restart", () => { reset(); });
  const sel = htmlEl("select", "tn-select", "", row);
  for (const [v, lab] of SPEEDS) { const o = htmlEl("option", "", lab, sel); o.value = String(v); }
  sel.value = "1";
  sel.addEventListener("change", () => { speed = Number(sel.value); sel.blur(); });
  const stage = htmlEl("div", "tn-pstage", "", wrap);
  const bg = htmlEl("canvas", "tn-pcanvas", "", stage);
  const glc = htmlEl("canvas", "tn-pcanvas", "", stage);
  const info = htmlEl("div", "qb-readout tn-pinfo", "", wrap);
  htmlEl("div", "qb-note", "Each dot is one molecule (or a few, see above). Molecules are made and destroyed at random times, "
    + "with the same rates as the curves; the thin wobbly lines on the plot are this cell's counts. Blue: target; grey: bystander. "
    + "Destroyed molecules travel into a proteasome (dark barrels) or fade (lysosome, or diluted by division). Positions are not to scale: "
    + "real proteins cross a cell in seconds.", wrap);

  let s = s0, tEnd = tEnd0, m = m0, speed = 1, running = true;
  let sim = new TurnoverSim(s, m);
  let tr: Trace = { t: [], a: [], b: [] };
  const rend = pointRenderer(glc, W, H);
  const pts = makePoints(12000);
  const ctx = bg.getContext("2d")!;
  const rgb = [hexRGB(COL.target), hexRGB(COL.bystander)];

  function record() { tr.t.push(sim.t); tr.a.push(sim.count(0)); tr.b.push(sim.count(1)); }
  function reset() {
    sim = new TurnoverSim(s, m);
    tr = { t: [], a: [], b: [] }; record();
    onTrace(tr, sim.t); loop.redraw();
  }

  function step() {
    if (sim.t >= tEnd) return;
    const dtH = Math.min(speed / 3600 / 60, tEnd - sim.t);
    sim.step(dtH, 1 / 60);
    if (sim.t - tr.t[tr.t.length - 1] >= tEnd / 400 || sim.t >= tEnd) { record(); onTrace(tr, sim.t); }
  }

  function render() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(bg.clientWidth * dpr), h = Math.round(bg.clientHeight * dpr);
    if (bg.width !== w || bg.height !== h) { bg.width = w; bg.height = h; }
    const k = w / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); ctx.ellipse(CELL.cx, CELL.cy, CELL.rx, CELL.ry, 0, 0, 6.2832);
    ctx.fillStyle = "#fbfaf5"; ctx.fill(); ctx.strokeStyle = "#8a6a12"; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(NUC.cx, NUC.cy, NUC.rx, NUC.ry, 0, 0, 6.2832);
    ctx.fillStyle = "#efebf7"; ctx.fill(); ctx.strokeStyle = "#6b4fa0"; ctx.lineWidth = 0.4; ctx.stroke();
    ctx.fillStyle = "#6b4fa0"; ctx.font = "2.6px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("nucleus", NUC.cx, NUC.cy + 1);
    const blocked = s.btz && s.btzBlock > 0 && sim.t >= s.tAdd;
    for (const [px, py] of PROTEASOMES) {
      ctx.fillStyle = "#495057";
      for (let j = 0; j < 4; j++) ctx.fillRect(px - 1.9 + j * 1, py - 1.1, 0.8, 2.2);
      if (blocked) { ctx.strokeStyle = COL.drug; ctx.lineWidth = 0.45; ctx.strokeRect(px - 2.4, py - 1.6, 4.8, 3.2); }
    }
    let n = 0;
    for (let i = 0; i < 2; i++) for (const d of sim.alive[i]) {
      if (n >= pts.pos.length / 2) break;
      const g = Math.min(1, d.age / GROW_S);
      pts.pos[2 * n] = d.x; pts.pos[2 * n + 1] = d.y; pts.size[n] = 1.0 * (0.3 + 0.7 * g);
      const c = rgb[i]; pts.col[4 * n] = c[0]; pts.col[4 * n + 1] = c[1]; pts.col[4 * n + 2] = c[2]; pts.col[4 * n + 3] = Math.round(255 * (0.25 + 0.75 * g));
      n++;
    }
    for (const an of sim.anims) {
      if (n >= pts.pos.length / 2) break;
      const f = an.kind === "prot" ? an.t / PROT_S : an.t / FADE_S;
      const e = f * f * (3 - 2 * f);
      pts.pos[2 * n] = an.x0 + (an.x1 - an.x0) * e; pts.pos[2 * n + 1] = an.y0 + (an.y1 - an.y0) * e;
      pts.size[n] = 1.0 * (1 - 0.6 * f);
      const c = rgb[an.w]; pts.col[4 * n] = c[0]; pts.col[4 * n + 1] = c[1]; pts.col[4 * n + 2] = c[2];
      pts.col[4 * n + 3] = Math.round(255 * (an.kind === "prot" ? 1 - 0.5 * f : 1 - f));
      n++;
    }
    pts.n = n; rend.draw(pts);
    const hh = Math.floor(sim.t), mm = Math.floor((sim.t - hh) * 60);
    info.textContent = `cell time ${hh} h ${String(mm).padStart(2, "0")} min${sim.t >= tEnd ? " (end of the plot)" : ""} · time runs at ${speed}× real time\n`
      + `target ${fmt(sim.count(0))}  ·  bystander ${fmt(sim.count(1))} molecules  ·  each dot = ${m} molecule${m > 1 ? "s" : ""}`
      + (rend.webgl ? "" : "  ·  (no WebGL: slower drawing)");
  }

  const loop = visibleLoop(stage, 1 / 60, step, render, 3);
  record(); onTrace(tr, 0);
  return {
    update(s1: Setup, tEnd1: number, m1: number) { s = s1; tEnd = tEnd1; m = m1; reset(); },
    destroy() { loop.setPaused(true); wrap.remove(); },
  };
}

export const fmt = (v: number) => v < 10 ? (Math.round(v * 10) / 10).toString()
  : Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
