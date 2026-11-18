// Styles for the sarcomere demo. Injected once by main.ts (demos/demo.css is shared and
// not edited by this demo).
export const CSS = `
.qb-demo.sm { align-items: flex-start; }
.sm .sm-main { flex: 1 1 100%; min-width: 0; display: flex; flex-direction: column; gap: .4em; }
.sm .sm-sarc { width: 100%; height: auto; background: #fbfaf5; border: 1px solid #e3e0d4; border-radius: 6px; }
.sm .sm-legend { display: flex; flex-wrap: wrap; gap: .2em 1em; font-size: .85em; }
.sm .sm-legend i { display: inline-block; width: 1.1em; height: .5em; margin-right: .35em; vertical-align: middle; border-radius: 2px; }
.sm .sm-legend i.sm-round { width: .7em; height: .7em; border-radius: 50%; }
.sm .sm-status { font-size: .85em; color: var(--qb-muted); font-variant-numeric: tabular-nums; }
.sm .sm-speed { display: inline-flex; align-items: center; gap: .3em; font-size: .9em; }
.sm .sm-speed select { font: inherit; padding: .15em .3em; min-height: 32px; }
.sm .sm-side { flex: 1 1 380px; min-width: 0; max-width: 560px; display: flex; flex-direction: column; gap: .4em; }
.sm .sm-plot { width: 100%; height: auto; }
.sm .sm-plot .grid { stroke: #e9ecef; }
.sm .sm-plot .axis { stroke: #444; }
.sm .sm-h { font-weight: 700; }
.sm .sm-panel { flex: 1 1 300px; max-width: 440px; }
.sm .sm-factors { display: flex; flex-direction: column; gap: .3em; font-size: .9em; }
.sm .qb-slider { grid-template-columns: auto 1fr 4.6em; }
.sm .qb-slider output { white-space: nowrap; }
.sm .sm-f { display: grid; grid-template-columns: max-content 1fr 3.4em; grid-template-rows: auto auto; column-gap: .5em; align-items: center; }
.sm .sm-fl { white-space: nowrap; }
.sm .sm-fb { height: .85em; background: #eef0f3; border-radius: 3px; overflow: hidden; }
.sm .sm-fb b { display: block; height: 100%; border-radius: 3px; transition: width .3s ease-out; }
.sm .sm-fv { white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.sm .sm-fn { grid-column: 2 / 4; font-size: .85em; color: var(--qb-muted); }
.sm .sm-force { margin-top: .2em; background: var(--qb-panel); border-radius: 6px; padding: .4em .6em; font-variant-numeric: tabular-nums; }
.sm .sm-ptext { min-height: 2.6em; }
.sm .qb-presets .qb-btn { min-height: 36px; }
@media (max-width: 640px) {
  .sm .sm-side, .sm .sm-panel { max-width: 100%; width: 100%; flex-basis: auto; }
  .sm .qb-presets .qb-btn { min-height: 44px; }
  .sm .sm-f { font-size: .95em; }
}
`;
