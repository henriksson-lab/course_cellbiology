// Diagnose the defect: a case game for the disease casebook lecture. Each case shows
// clinical and cellular findings one at a time; the student picks the broken process, then
// a fitting therapy type. Feedback explains each choice and links to the lecture (by topic)
// where the cell biology was taught. Case logic only: no animation.
// Options (data-*): case = key of the case to open first (see cases.ts).
import { autoMount, htmlEl, button } from "../lib/ui";
import {
  CASES, PROCESSES, THERAPIES, Case, Grade, ProcessKey, TherapyKey, judgeProcess, judgeTherapy, score,
} from "./cases";

const GRADE_TXT: Record<Grade, string> = { right: "✓ fits", partly: "◐ partly", wrong: "✗ no" };
const MAX = CASES.length * score(1, 1);

interface State {
  shown: number;                 // findings revealed
  proc: ProcessKey[];            // process choices in order
  procDone: boolean;
  ther: TherapyKey[];
  therDone: boolean;
  points: number;
}

let styled = false;
function addStyle() {
  if (styled) return;
  styled = true;
  const st = document.createElement("style");
  st.textContent = `
.qb-demo.dx { display: flex; flex-direction: column; gap: .8em; align-items: stretch; }
.dx .dx-top { display: flex; flex-wrap: wrap; gap: .35em; align-items: center; }
.dx .dx-top .qb-btn { min-width: 2.6em; min-height: 40px; font-weight: 600; }
.dx .dx-top .qb-btn.dx-cur { outline: 3px solid #1b2a3a; outline-offset: 1px; }
.dx .dx-top .qb-btn.dx-solved { background: #e6f4ea; border-color: #2b8a3e; color: #1b5e20; }
.dx .dx-score { margin-left: auto; font-weight: 600; }
.dx .dx-main { display: flex; flex-wrap: wrap; gap: 1.2em; align-items: flex-start; }
.dx .dx-left { flex: 1 1 360px; min-width: 0; display: flex; flex-direction: column; gap: .55em; }
.dx .dx-right { flex: 1.2 1 420px; min-width: 0; display: flex; flex-direction: column; gap: .55em; }
.dx .dx-title { font-size: 1.2em; font-weight: 700; color: #1b2a3a; }
.dx .dx-disease { font-weight: 700; color: #2b8a3e; }
.dx .dx-find { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .4em; }
.dx .dx-find li { background: #f6f7f9; border-radius: 6px; padding: .45em .6em; border-left: 4px solid #adb5bd; }
.dx .dx-lev { display: inline-block; font-size: .78em; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; margin-right: .45em; color: #495057; }
.dx .dx-find li.lv-Clinic { border-left-color: #8a6a12; }
.dx .dx-find li.lv-Body { border-left-color: #c2255c; }
.dx .dx-find li.lv-Tissue { border-left-color: #d9822b; }
.dx .dx-find li.lv-Cell { border-left-color: #2a7f8f; }
.dx .dx-find li.lv-Molecule { border-left-color: #6b4fa0; }
.dx .dx-h { font-weight: 700; margin-top: .3em; }
.dx .dx-opts { display: flex; flex-direction: column; gap: .3em; }
.dx .dx-opts .qb-btn { text-align: left; min-height: 38px; padding: .3em .7em; line-height: 1.25; }
.dx .dx-opts .qb-btn:disabled { cursor: default; }
.dx .dx-opts .qb-btn.g-right { background: #e6f4ea; border-color: #2b8a3e; color: #1b5e20; }
.dx .dx-opts .qb-btn.g-partly { background: #fff4e0; border-color: #a86b00; color: #6b4500; }
.dx .dx-opts .qb-btn.g-wrong { background: #fdecec; border-color: #c92a2a; color: #8a1c1c; }
.dx .dx-fb { border-left: 5px solid #ccc; background: #f6f7f9; border-radius: 4px; padding: .35em .7em; font-size: .95em; }
.dx .dx-fb p { margin: .3em 0; }
.dx .dx-fb.g-right { border-color: #2b8a3e; }
.dx .dx-fb.g-partly { border-color: #a86b00; }
.dx .dx-fb.g-wrong { border-color: #c92a2a; }
.dx .dx-chip { display: inline-block; border: 1.5px solid #e8590c; color: #b8460a; border-radius: 999px; padding: 0 .55em; margin: 0 .3em .2em 0; font-size: .85em; font-weight: 600; }
.dx .dx-note { font-size: .85em; color: #666; }
.dx .dx-go { font-weight: 700; border-color: #e8590c; background: #e8590c; color: #fff; }
.dx .dx-go:disabled { opacity: .45; background: #fff; color: #888; border-color: #ccc; cursor: default; }
.dx a { color: #1c4fa0; }
@media (max-width: 640px) {
  .dx .dx-main { flex-direction: column; }
  .dx .dx-left, .dx .dx-right { flex-basis: auto; width: 100%; }
  .dx .qb-btn { min-height: 44px; }
  .dx .dx-score { margin-left: 0; width: 100%; }
}`;
  document.head.appendChild(st);
}

autoMount("casebook", host => {
  addStyle();
  host.classList.add("dx");
  const states: State[] = CASES.map(() => ({ shown: 1, proc: [], procDone: false, ther: [], therDone: false, points: 0 }));
  let cur = Math.max(0, CASES.findIndex(c => c.key === host.dataset.case));

  // ---- top bar: case buttons and score
  const top = htmlEl("div", "dx-top", "", host);
  htmlEl("span", "", "Case:", top);
  const caseBtns = CASES.map((c, i) => {
    const b = button(top, String(i + 1), () => { cur = i; render(); });
    b.title = c.title;
    b.setAttribute("aria-label", `Case ${i + 1}: ${c.title}`);
    return b;
  });
  const scoreEl = htmlEl("span", "dx-score", "", top);

  const main = htmlEl("div", "dx-main", "", host);
  const left = htmlEl("div", "dx-left", "", main);
  const right = htmlEl("div", "dx-right", "", main);

  function render() {
    const c = CASES[cur], s = states[cur];
    caseBtns.forEach((b, i) => {
      b.classList.toggle("dx-cur", i === cur);
      b.classList.toggle("dx-solved", states[i].therDone);
    });
    const total = states.reduce((a, x) => a + x.points, 0);
    const solved = states.filter(x => x.therDone).length;
    scoreEl.textContent = `Solved ${solved} of ${CASES.length} · points ${total} of ${MAX}`;
    renderLeft(c, s);
    renderRight(c, s);
  }

  // ---- left: the case and its findings
  function renderLeft(c: Case, s: State) {
    left.innerHTML = "";
    htmlEl("div", "dx-title", `Case ${cur + 1}: ${c.title}`, left);
    if (s.procDone) htmlEl("div", "dx-disease", c.disease, left);
    const ul = htmlEl("ul", "dx-find", "", left);
    const n = s.procDone ? c.findings.length : s.shown;
    for (let i = 0; i < n; i++) {
      const f = c.findings[i];
      const li = htmlEl("li", "lv-" + f.level.split(" ")[0], "", ul);
      htmlEl("span", "dx-lev", f.level, li);
      li.append(f.text);
    }
    if (!s.procDone) {
      const more = button(left, `Show next finding (${s.shown} of ${c.findings.length} shown)`, () => {
        s.shown = Math.min(c.findings.length, s.shown + 1); render();
      });
      more.disabled = s.shown >= c.findings.length;
      htmlEl("div", "dx-note", "You may answer at any time. Fewer wrong guesses give more points; extra findings cost nothing.", left);
    } else if (s.therDone) {
      const nxt = CASES.findIndex((_, i) => i > cur && !states[i].therDone);
      const first = nxt >= 0 ? nxt : states.findIndex(x => !x.therDone);
      if (first >= 0) button(left, `Next case (${first + 1}) →`, () => { cur = first; render(); }, "dx-go");
      else htmlEl("div", "dx-disease", "All cases solved. Compare the categories: which ones were loss of function, and which therapy types fit them?", left);
    }
  }

  // ---- right: step 1 (process), then step 2 (therapy)
  function renderRight(c: Case, s: State) {
    right.innerHTML = "";
    htmlEl("div", "dx-h", "Step 1. Which process in the cell is broken?", right);
    const po = htmlEl("div", "dx-opts", "", right);
    for (const p of PROCESSES) {
      const tried = s.proc.includes(p.key);
      const g = tried ? judgeProcess(c, p.key).grade : null;
      const b = button(po, p.label + (g ? `  ${GRADE_TXT[g]}` : ""), () => pickProcess(p.key));
      if (g) b.classList.add("g-" + g);
      b.disabled = s.procDone || tried;
    }
    if (s.proc.length) {
      const last = s.proc[s.proc.length - 1];
      const fb = judgeProcess(c, last);
      const box = htmlEl("div", "dx-fb g-" + fb.grade, "", right);
      htmlEl("p", "", fb.text, box);
      if (s.procDone) {
        const p = htmlEl("p", "", "", box);
        htmlEl("b", "", "Category: ", p);
        for (const k of c.category) htmlEl("span", "dx-chip", k, p);
        htmlEl("p", "", c.explain, box);
        const lp = htmlEl("p", "", "", box);
        htmlEl("b", "", "Where you learned this: ", lp);
        c.lectures.forEach((l, i) => {
          if (i) lp.append("; ");
          if (l.href) { const a = htmlEl("a", "", l.topic, lp); a.href = l.href; } else lp.append(l.topic);
        });
      }
    }
    if (!s.procDone) return;

    htmlEl("div", "dx-h", "Step 2. Which therapy type fits this defect?", right);
    const to = htmlEl("div", "dx-opts", "", right);
    for (const t of THERAPIES) {
      const tried = s.ther.includes(t.key);
      const g = tried ? judgeTherapy(c, t.key).grade : null;
      const b = button(to, t.label + (g ? `  ${GRADE_TXT[g]}` : ""), () => pickTherapy(t.key));
      if (g) b.classList.add("g-" + g);
      b.disabled = tried;
    }
    if (s.ther.length) {
      const last = s.ther[s.ther.length - 1];
      const fb = judgeTherapy(c, last);
      const box = htmlEl("div", "dx-fb g-" + fb.grade, "", right);
      htmlEl("p", "", fb.text, box);
      if (s.therDone) {
        const p = htmlEl("p", "", "", box);
        htmlEl("i", "", c.therapyExplain, p);
        htmlEl("p", "dx-note", "Click the other therapy types to read why they fit or not.", box);
      }
    }
  }

  function pickProcess(k: ProcessKey) {
    const c = CASES[cur], s = states[cur];
    if (s.procDone || s.proc.includes(k)) return;
    s.proc.push(k);
    if (judgeProcess(c, k).grade === "right") s.procDone = true;
    render();
  }

  function pickTherapy(k: TherapyKey) {
    const c = CASES[cur], s = states[cur];
    if (s.ther.includes(k)) return;
    s.ther.push(k);
    if (!s.therDone && judgeTherapy(c, k).grade === "right") {
      s.therDone = true;
      s.points = score(s.proc.length, s.ther.length);
    }
    render();
  }

  render();
});
