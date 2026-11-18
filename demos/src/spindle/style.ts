// Styles for the spindle-checkpoint demo. Injected once by main.ts (demos/demo.css is
// shared and not edited by this demo).
export const CSS = `
.qb-demo.sp { align-items: flex-start; }
.sp .sp-main { flex: 1 1 560px; min-width: 0; max-width: 700px; display: flex; flex-direction: column; gap: .5em; }
.sp .sp-cell { width: 100%; height: auto; background: #fff; border: 1px solid #e3e0d4; border-radius: 6px; touch-action: manipulation; }
.sp .sp-hit { fill: transparent; cursor: pointer; }
.sp .sp-legend { display: flex; flex-wrap: wrap; gap: .2em 1em; font-size: .85em; }
.sp .sp-legend i { display: inline-block; width: .8em; height: .8em; margin-right: .35em; vertical-align: -.05em; border-radius: 50%; }
.sp .sp-row { display: flex; flex-wrap: wrap; gap: .35em .9em; align-items: center; }
.sp .sp-row .qb-btn { min-height: 36px; }
.sp .sp-speed { display: inline-flex; align-items: center; gap: .3em; font-size: .9em; }
.sp .sp-speed select { font: inherit; padding: .15em .3em; min-height: 32px; }
.sp .qb-btn.sp-force { border-color: #e8590c; color: #b03d00; }
.sp .qb-btn:disabled { opacity: .45; cursor: default; }
.sp .sp-side { flex: 1 1 300px; min-width: 0; max-width: 420px; display: flex; flex-direction: column; gap: .5em; }
.sp .sp-h { font-weight: 700; }
.sp .sp-sac { border-radius: 6px; padding: .45em .6em; font-weight: 600; background: var(--qb-panel); border-left: 6px solid #adb5bd; }
.sp .sp-sac.sp-wait { border-left-color: #e8590c; }
.sp .sp-sac.sp-go { border-left-color: #2b8a3e; }
.sp .sp-bars { display: flex; flex-direction: column; gap: .3em; font-size: .9em; }
.sp .sp-bar { display: grid; grid-template-columns: 10.5em 1fr 3em; column-gap: .5em; align-items: center; }
.sp .sp-bar span { white-space: nowrap; }
.sp .sp-bb { height: .85em; background: #eef0f3; border-radius: 3px; overflow: hidden; }
.sp .sp-bb b { display: block; height: 100%; border-radius: 3px; }
.sp .sp-bv { text-align: right; font-variant-numeric: tabular-nums; }
.sp .sp-chroms { display: flex; flex-direction: column; gap: .15em; font-size: .9em; }
.sp .sp-chroms i { display: inline-block; width: .5em; height: 1em; margin-right: .4em; vertical-align: -.1em; border-radius: 2px; }
.sp .sp-bad { color: #b03d00; }
.sp .sp-ok { color: #2b8a3e; }
.sp .sp-result { background: var(--qb-panel); border-radius: 6px; padding: .45em .6em; font-size: .92em; }
.sp .sp-result:empty { display: none; }
.sp .sp-log { font-size: .82em; color: var(--qb-muted); display: flex; flex-direction: column; gap: .1em; min-height: 6em; }
.sp .sp-status { font-size: .85em; color: var(--qb-muted); font-variant-numeric: tabular-nums; }
@media (max-width: 640px) {
  .sp .sp-main, .sp .sp-side { max-width: 100%; width: 100%; flex-basis: auto; }
  .sp .sp-row .qb-btn { min-height: 44px; }
  .sp .sp-bar { grid-template-columns: 9.5em 1fr 3em; }
}
`;
