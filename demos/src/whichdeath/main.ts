// "Which death is it?": an experimental-logic game for the lecture on regulated necrosis.
// A case gives a stimulus and a cell type. The student designs experiments (with or without
// the stimulus, plus any inhibitors), chooses readouts, runs them, reads the results table
// and then names the type of cell death. The feedback says which results decide the case
// and whether the student's own experiments already showed it.
// The results come from a rule table (model.ts) of textbook experimental logic, not from a
// simulation. No animation.
// Options (data-*): case = id of the case to start with (default "sts").
import { autoMount, htmlEl, svgEl, button, checkbox } from "../lib/ui";
import {
  CASES, Case, mysteryCase, INHIBS, Inhib, READOUTS, Readout, Condition, measure, resolve,
  DEATHS, DEATH_LABEL, Death, DECISIVE, Morph, MORPH_TEXT, condKey,
} from "./model";

const CSS = `
.qb-demo.wd { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: .8em; }
.qb-demo.wd > * { min-width: 0; max-width: 100%; }
.wd .wd-cases { display: flex; flex-wrap: wrap; gap: .35em; }
.wd .wd-cases .qb-btn { min-height: 36px; }
.wd .wd-case { background: var(--qb-panel); border-radius: 8px; padding: .55em .8em; border-left: 5px solid #6b4fa0; }
.wd .wd-case-title { font-weight: 700; font-size: 1.1em; }
.wd .wd-case-line { margin-top: .2em; }
.wd .wd-row { display: flex; flex-wrap: wrap; gap: 1em; align-items: flex-start; }
.wd .wd-box { flex: 1 1 260px; min-width: 0; border: 1px solid #d5d8dd; border-radius: 8px; padding: .5em .7em; display: flex; flex-direction: column; gap: .3em; }
.wd .wd-h { font-weight: 700; font-size: .95em; }
.wd .wd-sub { font-size: .8em; color: var(--qb-muted); margin-left: 1.5em; margin-top: -.25em; }
.wd .qb-check { min-height: 30px; }
.wd .qb-check input { width: 18px; height: 18px; accent-color: #e8590c; }
.wd .wd-actions { display: flex; flex-wrap: wrap; gap: .5em; align-items: center; }
.qb-demo.wd .qb-btn.wd-run { background: #1b2a3a; color: #fff; border-color: #1b2a3a; font-weight: 600; font-size: 1em; min-height: 40px; padding: .3em 1em; }
.qb-demo.wd .qb-btn.wd-run:hover { background: #33475c; }
.wd .wd-tablewrap { overflow-x: auto; border: 1px solid #d5d8dd; border-radius: 8px; }
.wd table.wd-table { border-collapse: collapse; width: 100%; font-size: .88em; }
.wd .wd-table th, .wd .wd-table td { border-bottom: 1px solid #e6e8eb; padding: .3em .45em; text-align: left; vertical-align: middle; }
.wd .wd-table th { background: var(--qb-panel); font-weight: 600; white-space: nowrap; }
.wd .wd-table td.wd-cond { min-width: 9em; font-weight: 600; }
.wd .wd-table td.wd-na { color: #b0b4ba; }
.wd .wd-chip { display: inline-block; border-radius: 4px; padding: .05em .4em; white-space: nowrap; }
.wd .wd-l0 { background: #eef0f2; color: #3c4650; }
.wd .wd-l1 { background: #fde8d7; color: #8a3b06; }
.wd .wd-l3 { background: #e8590c; color: #fff; font-weight: 600; }
.wd .wd-morph { display: flex; align-items: center; gap: .4em; min-width: 190px; }
.wd .wd-morph svg { flex: 0 0 56px; width: 56px; height: 56px; }
.wd .wd-morph span { font-size: .85em; }
.wd .wd-avpi { display: flex; flex-direction: column; gap: .15em; min-width: 150px; }
.wd .wd-avbar { display: flex; height: 10px; border-radius: 3px; overflow: hidden; width: 140px; }
.wd .wd-empty { padding: .7em; color: var(--qb-muted); }
.wd .wd-verdict { display: flex; flex-wrap: wrap; gap: .35em; }
.wd .wd-verdict .qb-btn { min-height: 40px; font-size: .95em; }
.wd .wd-feedback { border-radius: 8px; padding: .6em .8em; background: var(--qb-panel); }
.wd .wd-feedback[hidden] { display: none; }
.wd .wd-feedback.ok { border-left: 5px solid #2b8a3e; }
.wd .wd-feedback.bad { border-left: 5px solid #c92a2a; }
.wd .wd-feedback ul { margin: .3em 0 0 1.1em; padding: 0; }
.wd .wd-feedback li { margin: .15em 0; }
.wd .wd-done { color: #2b8a3e; font-weight: 600; }
.wd .wd-miss { color: #a85d00; font-weight: 600; }
.wd details.wd-rules { font-size: .9em; }
.wd details.wd-rules summary { cursor: pointer; font-weight: 600; min-height: 30px; }
.wd .wd-legend { display: flex; flex-wrap: wrap; gap: .8em; font-size: .8em; color: var(--qb-muted); align-items: center; }
.wd .wd-sw { display: inline-block; width: 12px; height: 10px; border-radius: 2px; margin-right: .25em; vertical-align: -1px; }
@media (max-width: 640px) { .wd .qb-btn { min-height: 44px; } .wd .qb-check { min-height: 40px; } }
`;

function injectCSS() {
  if (document.getElementById("wd-style")) return;
  const s = document.createElement("style");
  s.id = "wd-style"; s.textContent = CSS;
  document.head.appendChild(s);
}

const AV_COL = ["#cfd5dc", "#f2b134", "#c92a2a"]; // live, AV+PI−, PI+

/** A small drawing of the cell's shape for the morphology readout (course colour key). */
function morphIcon(parent: Element, m: Morph): void {
  const s = svgEl("svg", { viewBox: "0 0 64 64", role: "img", "aria-label": MORPH_TEXT[m] }, parent);
  const PM = "#8a6a12", CYT = "#fbfaf5", NUC = "#6b4fa0", NUCF = "#efebf7", MITO = "#a8324a", MITOF = "#f8e9ec";
  const mito = (x: number, y: number, rx: number, ry: number, dense = false) =>
    svgEl("ellipse", { cx: x, cy: y, rx, ry, fill: dense ? MITO : MITOF, stroke: MITO, "stroke-width": 1.2 }, s);
  switch (m) {
    case "normal":
      svgEl("ellipse", { cx: 32, cy: 34, rx: 28, ry: 19, fill: CYT, stroke: PM, "stroke-width": 2 }, s);
      svgEl("ellipse", { cx: 30, cy: 34, rx: 10, ry: 8, fill: NUCF, stroke: NUC, "stroke-width": 1.8 }, s);
      mito(48, 30, 5, 2.4); mito(16, 40, 5, 2.4); mito(44, 43, 4.5, 2.2);
      break;
    case "apoptotic":
      svgEl("circle", { cx: 30, cy: 32, r: 15, fill: CYT, stroke: PM, "stroke-width": 2 }, s);
      for (const [x, y, r] of [[44, 24, 4], [42, 42, 4.5], [18, 42, 3.5], [20, 20, 3.5]] as const)
        svgEl("circle", { cx: x, cy: y, r, fill: CYT, stroke: PM, "stroke-width": 1.6 }, s);
      for (const [x, y, r] of [[27, 29, 3.4], [33, 34, 3], [26, 36, 2.6]] as const)
        svgEl("circle", { cx: x, cy: y, r, fill: NUC }, s);
      for (const [x, y, r] of [[54, 52, 5], [10, 54, 4]] as const) {
        svgEl("circle", { cx: x, cy: y, r, fill: CYT, stroke: PM, "stroke-width": 1.6 }, s);
        svgEl("circle", { cx: x, cy: y, r: r * .4, fill: NUC }, s);
      }
      break;
    case "swollen":
      svgEl("circle", { cx: 32, cy: 32, r: 26, fill: CYT, stroke: PM, "stroke-width": 2, "stroke-dasharray": "22 5 30 4 40 6" }, s);
      svgEl("ellipse", { cx: 31, cy: 32, rx: 9, ry: 8, fill: NUCF, stroke: NUC, "stroke-width": 1.8 }, s);
      mito(46, 22, 5, 3.5); mito(18, 44, 5, 3.5);
      for (const [x, y] of [[60, 14], [62, 22], [4, 50]] as const) svgEl("circle", { cx: x, cy: y, r: 1.6, fill: PM }, s);
      break;
    case "pyroptotic":
      svgEl("ellipse", { cx: 30, cy: 38, rx: 24, ry: 17, fill: CYT, stroke: PM, "stroke-width": 2 }, s);
      for (const [x, y, r] of [[48, 16, 10], [16, 18, 8]] as const)
        svgEl("circle", { cx: x, cy: y, r, fill: "#ffffff", stroke: PM, "stroke-width": 1.6 }, s);
      svgEl("circle", { cx: 28, cy: 39, r: 6, fill: NUC }, s);
      for (const x of [14, 24, 36, 44]) svgEl("rect", { x: x - 1, y: 53.2, width: 2.4, height: 3.4, fill: "#e8590c" }, s);
      break;
    case "ferroptotic":
      svgEl("circle", { cx: 32, cy: 32, r: 22, fill: CYT, stroke: PM, "stroke-width": 2, "stroke-dasharray": "50 5 40 6" }, s);
      svgEl("ellipse", { cx: 30, cy: 30, rx: 8.5, ry: 7.5, fill: NUCF, stroke: NUC, "stroke-width": 1.8 }, s);
      mito(44, 40, 3, 1.8, true); mito(20, 42, 3, 1.8, true); mito(42, 22, 2.8, 1.7, true); mito(30, 46, 2.8, 1.7, true);
      break;
    case "lysed":
      svgEl("circle", { cx: 32, cy: 32, r: 24, fill: "none", stroke: PM, "stroke-width": 1.4, "stroke-opacity": .45, "stroke-dasharray": "6 6" }, s);
      for (const [x, y, r] of [[22, 26, 2.5], [38, 36, 2], [30, 44, 1.8], [44, 22, 1.6], [16, 42, 1.6], [28, 32, 3]] as const)
        svgEl("circle", { cx: x, cy: y, r, fill: "#9a8d6a" }, s);
      break;
  }
}

interface Run { cond: Condition; reads: Set<Readout>; }

function condLabel(c: Case, cond: Condition): string {
  const parts: string[] = [cond.stimulus ? c.stimulus : "no stimulus (control)"];
  for (const i of INHIBS) if (cond.inhib.has(i.id)) parts.push("+ " + i.name);
  return parts.join(" ");
}

autoMount("whichdeath", host => {
  injectCSS();
  host.classList.add("wd");
  let mysteryN = 0;
  let cur: Case = CASES.find(c => c.id === host.dataset.case) ?? CASES[0];
  let runs: Run[] = [];

  // ---- case chooser
  htmlEl("div", "wd-h", "1. Choose a case", host);
  const caseRow = htmlEl("div", "wd-cases", "", host);
  const caseBtns: HTMLButtonElement[] = [];
  const pick = (c: Case, b: HTMLButtonElement) => {
    caseBtns.forEach(x => x.classList.toggle("active", x === b));
    cur = c; runs = []; feedback.hidden = true; showCase(); renderTable();
  };
  for (const c of CASES) {
    const b = button(caseRow, c.label, () => pick(c, b));
    caseBtns.push(b);
    if (c === cur) b.classList.add("active");
  }
  const mb = button(caseRow, "Mystery compound", () => { pick(mysteryCase(mysteryN), mb); mysteryN++; });
  caseBtns.push(mb);

  const caseCard = htmlEl("div", "wd-case", "", host);
  function showCase() {
    caseCard.innerHTML = "";
    htmlEl("div", "wd-case-title", "Stimulus: " + cur.stimulus, caseCard);
    htmlEl("div", "wd-case-line", "Cells: " + cur.cells, caseCard);
    htmlEl("div", "wd-case-line", cur.story, caseCard);
    htmlEl("div", "wd-case-line qb-note",
      `Readouts are taken ${cur.hours < 1 ? Math.round(cur.hours * 60) + " min" : cur.hours + " h"} after the stimulus. Inhibitors are added 1 h before it.`, caseCard);
  }

  // ---- experiment builder
  htmlEl("div", "wd-h", "2. Design an experiment and run it (as many as you like)", host);
  const row = htmlEl("div", "wd-row", "", host);
  const boxT = htmlEl("div", "wd-box", "", row);
  htmlEl("div", "wd-h", "Treatment", boxT);
  let stim = true;
  const stimBox = checkbox(boxT, "Add the stimulus", true, v => { stim = v; });
  htmlEl("div", "wd-sub", "Untick for a control without it.", boxT);
  const inhib = new Set<Inhib>();
  const inhBoxes: HTMLInputElement[] = [];
  for (const i of INHIBS) {
    inhBoxes.push(checkbox(boxT, i.name, false, v => { if (v) inhib.add(i.id); else inhib.delete(i.id); }));
    htmlEl("div", "wd-sub", i.what, boxT);
  }
  const boxR = htmlEl("div", "wd-box", "", row);
  htmlEl("div", "wd-h", "Readouts", boxR);
  const reads = new Set<Readout>(["morph", "avpi"]);
  for (const r of READOUTS) {
    checkbox(boxR, r.name, reads.has(r.id), v => { if (v) reads.add(r.id); else reads.delete(r.id); });
  }
  const actions = htmlEl("div", "wd-actions", "", host);
  button(actions, "Run experiment", () => {
    const cond: Condition = { stimulus: stim, inhib: new Set(inhib) };
    const k = condKey(cond);
    const old = runs.find(r => condKey(r.cond) === k);
    if (old) reads.forEach(r => old.reads.add(r));     // same condition again: add the new readouts
    else runs.push({ cond, reads: new Set(reads) });
    renderTable();
  }, "wd-run");
  button(actions, "Clear results", () => { runs = []; feedback.hidden = true; renderTable(); });
  button(actions, "Reset treatment", () => {
    stim = true; stimBox.checked = true; inhib.clear(); inhBoxes.forEach(b => (b.checked = false));
  });

  // ---- results table
  htmlEl("div", "wd-h", "3. Results", host);
  const tableWrap = htmlEl("div", "wd-tablewrap", "", host);
  const legend = htmlEl("div", "wd-legend", "", host);
  legend.innerHTML =
    `<span>Annexin V / PI bar:</span><span><i class="wd-sw" style="background:${AV_COL[0]}"></i>live (AV⁻PI⁻)</span>` +
    `<span><i class="wd-sw" style="background:${AV_COL[1]}"></i>AV⁺PI⁻ (PS outside, membrane intact)</span>` +
    `<span><i class="wd-sw" style="background:${AV_COL[2]}"></i>PI⁺ (membrane broken)</span>` +
    `<span><span class="wd-chip wd-l3">strong</span> clearly positive</span>`;

  function renderTable() {
    tableWrap.innerHTML = "";
    if (!runs.length) { htmlEl("div", "wd-empty", "No experiments yet. Choose a treatment and readouts, then press Run experiment.", tableWrap); return; }
    const used = READOUTS.filter(r => runs.some(x => x.reads.has(r.id)));
    const t = htmlEl("table", "wd-table", "", tableWrap);
    const hr = htmlEl("tr", "", "", htmlEl("thead", "", "", t));
    htmlEl("th", "", "Condition", hr);
    for (const r of used) htmlEl("th", "", r.short, hr);
    const tb = htmlEl("tbody", "", "", t);
    for (const run of runs) {
      const tr = htmlEl("tr", "", "", tb);
      htmlEl("td", "wd-cond", condLabel(cur, run.cond), tr);
      for (const r of used) {
        const td = htmlEl("td", "", "", tr);
        if (!run.reads.has(r.id)) { td.className = "wd-na"; td.textContent = "not measured"; continue; }
        const res = measure(cur, run.cond, r.id);
        if (r.id === "morph" && res.morph) {
          const d = htmlEl("div", "wd-morph", "", td);
          morphIcon(d, res.morph);
          htmlEl("span", "", res.text, d);
        } else if (r.id === "avpi" && res.avpi) {
          const d = htmlEl("div", "wd-avpi", "", td);
          const bar = htmlEl("div", "wd-avbar", "", d);
          res.avpi.forEach((v, j) => { const seg = htmlEl("span", "", "", bar); seg.style.width = v + "%"; seg.style.background = AV_COL[j]; });
          htmlEl("span", "", res.text, d);
        } else {
          htmlEl("span", "wd-chip wd-l" + res.level, res.text, td);
        }
      }
    }
  }

  // ---- verdict and feedback
  htmlEl("div", "wd-h", "4. Which death is it?", host);
  const vRow = htmlEl("div", "wd-verdict", "", host);
  const vBtns: HTMLButtonElement[] = [];
  for (const d of DEATHS) {
    const b = button(vRow, DEATH_LABEL[d], () => { vBtns.forEach(x => x.classList.toggle("active", x === b)); judge(d); });
    vBtns.push(b);
  }
  const feedback = htmlEl("div", "wd-feedback", "", host);
  feedback.hidden = true;

  /** What the student's own experiments have shown so far. */
  function checklist(ans: Death): { ok: boolean; text: string }[] {
    const dec = DECISIVE[ans];
    const viab = (r: Run) => r.reads.has("avpi") || r.reads.has("morph");
    const items: { ok: boolean; text: string }[] = [];
    items.push({ ok: runs.some(r => !r.cond.stimulus && viab(r)), text: "a control without the stimulus (viability or morphology)" });
    items.push({ ok: runs.some(r => r.cond.stimulus && r.cond.inhib.size === 0 && viab(r)), text: "the stimulus alone, with a viability readout" });
    if (dec.marker && dec.marker !== "avpi") {
      const name = READOUTS.find(r => r.id === dec.marker)!.name;
      items.push({ ok: runs.some(r => r.cond.stimulus && r.reads.has(dec.marker!) && resolve(cur, r.cond).fate === ans),
        text: `the decisive marker, ${name}, in cells given the stimulus` });
    }
    if (dec.rescue) {
      const name = INHIBS.find(i => i.id === dec.rescue)!.name;
      const extra = cur.program === "extrinsic" ? " (here together with necrostatin-1)" : "";
      items.push({ ok: runs.some(r => r.cond.stimulus && r.cond.inhib.has(dec.rescue!) && viab(r) && resolve(cur, r.cond).fate === "none"),
        text: `rescue: stimulus + ${name}${extra}, with a viability readout that shows live cells` });
    }
    if (ans === "accidental") {
      const tried = new Set<Inhib>();
      runs.forEach(r => { if (r.cond.stimulus && viab(r)) r.cond.inhib.forEach(i => tried.add(i)); });
      items.push({ ok: tried.size >= 3, text: `no rescue by the inhibitors (you tried ${tried.size} of 4)` });
    }
    if (ans === "none") {
      items.push({ ok: runs.some(r => r.cond.stimulus && r.reads.has("casp3")) || runs.some(r => r.cond.stimulus && r.reads.has("pmlkl")),
        text: "at least one death marker in cells given the stimulus (to be sure nothing is starting)" });
    }
    return items;
  }

  function judge(guess: Death) {
    const ans = cur.answer;
    feedback.hidden = false;
    feedback.className = "wd-feedback " + (guess === ans ? "ok" : "bad");
    feedback.innerHTML = "";
    const head = htmlEl("div", "qb-big", "", feedback);
    if (guess === ans) head.textContent = `Correct: ${DEATH_LABEL[ans]}.`;
    else head.textContent = `Not ${DEATH_LABEL[guess].toLowerCase()}. ` + (runs.length ? "Look again at your results." : "Run some experiments first.");
    if (guess !== ans) {
      // A hint, not the answer: what would the guess have predicted?
      const dg = DECISIVE[guess];
      htmlEl("div", "wd-case-line", `If it were ${DEATH_LABEL[guess].toLowerCase()}, you would expect: ${dg.text}`, feedback);
      htmlEl("div", "wd-case-line", "Which of these do your results contradict? Measure what you have not measured yet.", feedback);
      return;
    }
    htmlEl("div", "wd-case-line", "The decisive results: " + (cur.decisive ?? DECISIVE[ans].text), feedback);
    const notes = new Set<string>();
    runs.forEach(r => { const n = resolve(cur, r.cond).note; if (n) notes.add(n); });
    if (notes.size) htmlEl("div", "wd-case-line", "In your experiments: " + [...notes].join(" "), feedback);
    const items = checklist(ans);
    htmlEl("div", "wd-case-line", "Have your own experiments shown it?", feedback);
    const ul = htmlEl("ul", "", "", feedback);
    for (const it of items) {
      const li = htmlEl("li", "", "", ul);
      htmlEl("span", it.ok ? "wd-done" : "wd-miss", it.ok ? "done: " : "missing: ", li);
      li.append(it.text);
    }
    if (items.every(i => i.ok)) htmlEl("div", "wd-case-line", "A complete argument: a control, a marker and a rescue that agree.", feedback);
    else htmlEl("div", "wd-case-line", "A right answer is not yet a proof: run the missing experiments, as you would before writing it in a report.", feedback);
  }

  // ---- the rule table, stated openly
  const det = htmlEl("details", "wd-rules", "", host);
  htmlEl("summary", "", "How the results are made (the rule table)", det);
  const ul = htmlEl("ul", "", "", det);
  for (const t of [
    "The results come from a rule table based on the textbook experimental logic, not from a simulation. Numbers are illustrative, with a small fixed noise.",
    "Each stimulus starts one programme. An inhibitor rescues the cells only if it blocks a step that programme needs (all or none).",
    "Apoptosis: cleaved caspase-3, annexin V⁺ PI⁻ cells, shrinkage and blebs; blocked by z-VAD. After TNF + cycloheximide, z-VAD switches the cells to necroptosis (they express RIPK3).",
    "Necroptosis: phospho-MLKL, early PI⁺, swelling; blocked by necrostatin-1, not by z-VAD.",
    "Pyroptosis: cleaved gasdermin D, large IL-1β release (only in primed macrophages), swelling with balloons; blocked by MCC950 and by z-VAD (which also blocks caspase-1).",
    "Ferroptosis: lipid peroxides, small dense mitochondria; blocked by ferrostatin-1.",
    "Accidental necrosis (detergent): everything breaks at once; nothing rescues.",
    "Simplified: real cells often show mixed or partial death, inhibitors are not perfectly specific (necrostatin-1 and z-VAD have off-target effects), and timing matters.",
  ]) htmlEl("li", "", t, ul);

  showCase();
  renderTable();
});
