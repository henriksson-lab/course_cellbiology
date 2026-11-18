// Styles for the GPCR cascade demo, injected once at mount (demos/demo.css is shared and
// not edited by single demos). Builds on the shared .qb-demo classes.
export const CSS = `
.qb-demo.gc { align-items: flex-start; }
.qb-demo.gc .gc-main { flex: 1 1 460px; min-width: 0; max-width: 680px; display: flex; flex-direction: column; gap: .45em; }
.qb-demo.gc .gc-panel { flex: 1 1 300px; max-width: 680px; min-width: 0; }
.qb-demo.gc .gc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5em; }
.qb-demo.gc .gc-bar .qb-btn { min-height: 40px; font-size: .9em; }
.qb-demo.gc .gc-play { min-width: 6.5em; font-weight: 600; }
.qb-demo.gc .gc-speed select { font: inherit; font-size: .9em; padding: .2em .3em; min-height: 40px; }
.qb-demo.gc .gc-clock { font-family: ui-monospace, monospace; font-size: .9em; font-variant-numeric: tabular-nums; }
.qb-demo.gc .gc-sch { width: 100%; height: auto; border: 1px solid #ccd; border-radius: 6px; }
.qb-demo.gc .gc-plot { width: 100%; height: auto; cursor: ew-resize; }
.qb-demo.gc .gc-fade { transition: opacity .4s ease; }
.qb-demo.gc .gc-col { transition: fill .4s ease; }
.qb-demo.gc .gc-move { transition: transform .4s ease; }
.qb-demo.gc .gc-h { font-weight: 700; }
.qb-demo.gc .gc-box { display: flex; flex-direction: column; gap: .3em; border-left: 4px solid #dee2e6; padding-left: .6em; }
.qb-demo.gc .gc-ptext { min-height: 2.6em; }
.qb-demo.gc .qb-presets .qb-btn { min-height: 36px; }
.qb-demo.gc .gc-twrap { overflow-x: auto; max-width: 100%; }
.qb-demo.gc .gc-table { border-collapse: collapse; font-size: .85em; width: 100%; font-variant-numeric: tabular-nums; }
.qb-demo.gc .gc-table th, .qb-demo.gc .gc-table td { padding: .2em .4em; text-align: right; border-bottom: 1px solid #e3e3e3; }
.qb-demo.gc .gc-table th:first-child, .qb-demo.gc .gc-table td:first-child { text-align: left; }
.qb-demo.gc .gc-table td:not(:first-child) { white-space: nowrap; }
.qb-demo.gc .gc-total { font-size: .85em; }
.qb-demo.gc .qb-slider { grid-template-columns: 8.5em minmax(6em, 1fr) 5.4em; }
.qb-demo.gc .qb-slider-name { white-space: normal; }
@media (max-width: 640px) {
  .qb-demo.gc .gc-main, .qb-demo.gc .gc-panel { width: 100%; max-width: 100%; flex-basis: auto; }
  .qb-demo.gc .qb-slider { grid-template-columns: 7.5em minmax(5em, 1fr) 5.2em; }
}
`;
