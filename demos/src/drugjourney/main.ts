import { autoMount, htmlEl, svgEl, button, releaseFocus } from "../lib/ui";
import { Mode, Scenario, SCENARIOS, STAGES, readouts, stageText } from "./story";

const C={ink:"#1b2a3a",pm:"#8a6a12",cyto:"#fbfaf5",nucleus:"#6b4fa0",er:"#2a7f8f",golgi:"#d9822b",endo:"#2e8b57",mito:"#a8324a",drug:"#e8590c",muted:"#697586",signal:"#1c4fa0"};
const CSS=`
.qb-demo.dj { display:block; max-width:100%; color:${C.ink}; }
.dj * { box-sizing:border-box; }
.dj .dj-toolbar,.dj .dj-navigation { display:flex; flex-wrap:wrap; gap:.5em; align-items:center; }
.dj .qb-btn { min-height:44px; font-size:.94em; }
.dj .qb-btn:disabled { opacity:.5; cursor:default; }
.dj .qb-btn:focus-visible,.dj select:focus-visible { outline:3px solid ${C.signal}; outline-offset:2px; }
.dj .dj-toolbar { margin-bottom:.7em; }
.dj .dj-scenario { display:flex; flex-wrap:wrap; align-items:center; gap:.45em; margin:.7em 0; }
.dj select { min-height:44px; max-width:100%; font:inherit; color:${C.ink}; background:white; border:1px solid #9aa5b1; border-radius:5px; padding:.35em .5em; }
.dj .dj-stops { display:flex; flex-wrap:wrap; gap:.35em; margin:.7em 0 1em; }
.dj .dj-stops .qb-btn { text-align:left; }
.dj .dj-layout { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:1em; align-items:start; }
.dj .dj-map { width:100%; height:auto; border:1px solid #d8dee7; border-radius:8px; background:white; }
.dj .dj-panel { min-width:0; border-left:4px solid ${C.drug}; padding:0 0 0 .8em; }
.dj .dj-panel h3 { font-size:1.18em; margin:0 0 .4em; }
.dj .dj-panel p { margin:.6em 0; }
.dj .dj-where { color:${C.muted}; font-size:.91em; }
.dj .dj-change { background:#fff3e8; border:1px solid #f1b58f; border-radius:5px; padding:.65em; }
.dj .dj-links { display:flex; flex-wrap:wrap; gap:.4em .8em; font-size:.92em; }
.dj .dj-links a { min-height:44px; display:inline-flex; align-items:center; overflow-wrap:anywhere; }
.dj .dj-caption { font-size:.84em; color:${C.muted}; margin:.4em 0 .8em; }
.dj .dj-readout-title { font-size:1em; font-weight:600; margin:1em 0 .5em; }
.dj .dj-readouts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.55em; }
.dj .dj-readout { border:1px solid #d4dce5; border-top:4px solid ${C.endo}; border-radius:6px; padding:.65em; overflow-wrap:anywhere; }
.dj .dj-readout.reduced { border-top-color:${C.drug}; }
.dj .dj-readout strong { display:block; font-size:1.05em; margin:.35em 0; }
.dj .dj-readout small { display:block; color:${C.muted}; font-size:.85em; }
.dj .dj-note { font-size:.88em; color:${C.muted}; margin:.8em 0 0; }
@media(max-width:720px) { .dj .dj-layout { grid-template-columns:minmax(0,1fr); } }
@media(max-width:450px) { .dj .dj-readouts { grid-template-columns:minmax(0,1fr); } .dj .dj-scenario { display:block; } .dj .dj-scenario select { width:100%; margin-top:.3em; } }
`;

function injectCss(){
 if(document.getElementById("drugjourney-style"))return;
 const s=document.createElement("style");s.id="drugjourney-style";s.textContent=CSS;document.head.appendChild(s);
}

autoMount("drugjourney",host=>{
 injectCss();host.classList.add("dj");
 let mode:Mode=host.dataset.mode==="imatinib"?"imatinib":"mrna";
 let index=0,scenario:Scenario="baseline";
 const toolbar=htmlEl("div","dj-toolbar","",host);
 const modeButtons=([['mrna','mRNA–LNP'],['imatinib','Imatinib']] as const).map(([value,label])=>button(toolbar,label,()=>{mode=value;index=0;scenario="baseline";setOptions();render();}));
 const scenarioLabel=htmlEl("label","dj-scenario","What if? ",host);
 const selector=htmlEl("select","","",scenarioLabel);selector.setAttribute("aria-label","What-if scenario");
 selector.addEventListener("change",()=>{scenario=selector.value as Scenario;render();});releaseFocus(selector);
 function setOptions(){selector.replaceChildren();for(const option of SCENARIOS[mode]){const o=htmlEl("option","",option.label,selector);o.value=option.key;}selector.value=scenario;}
 const stops=htmlEl("nav","dj-stops","",host);stops.setAttribute("aria-label","Journey stops");
 const layout=htmlEl("div","dj-layout","",host);
 const mapBox=htmlEl("div","","",layout);
 const map=svgEl("svg",{viewBox:"0 0 560 420",class:"dj-map",role:"img","aria-label":"Cell map"},mapBox);
 htmlEl("p","dj-caption","Numbers follow the teaching story. Orange marks delivery/target steps; blue marks downstream effects. Lines are schematic, not physical tracks or measured times.",mapBox);
 const panel=htmlEl("section","dj-panel","",layout);panel.setAttribute("aria-live","polite");panel.setAttribute("aria-atomic","true");
 const navigation=htmlEl("div","dj-navigation","",host);
 const prev=button(navigation,"Previous",()=>{if(index>0){index--;render();}});
 const next=button(navigation,"Next",()=>{if(index<STAGES[mode].length-1){index++;render();}});
 button(navigation,"Reset journey",()=>{index=0;scenario="baseline";selector.value=scenario;render();});
 const progress=htmlEl("span","dj-where","",navigation);
 htmlEl("div","dj-readout-title","Predicted outcomes after the route — qualitative comparisons, not measurements",host);
 const results=htmlEl("div","dj-readouts","",host);
 const note=htmlEl("p","dj-note","",host);

 function text(x:number,y:number,words:string,size=18,color=C.ink,anchor="middle",parent:Element=map){
  const e=svgEl("text",{x,y,"font-size":size,"text-anchor":anchor},parent);e.style.fill=color;e.textContent=words;return e;
 }
 function drawMap(){
  map.replaceChildren();
  const title=svgEl("title",{},map);title.textContent=`${mode==="mrna"?"mRNA–LNP":"Imatinib"}: stop ${index+1}, ${STAGES[mode][index].label}. ${scenario==="baseline"?"Baseline route.":"What-if comparison selected; dashed path denotes impaired progression or effect."}`;
  map.setAttribute("aria-label",title.textContent);
  svgEl("rect",{x:25,y:50,width:480,height:310,rx:80,fill:C.cyto,stroke:C.pm,"stroke-width":4},map);
  text(110,33,"outside cell",18,C.pm);
  text(310,77,"cytosol",18,C.pm);
  svgEl("circle",{cx:140,cy:150,r:57,fill:"#efebf7",stroke:C.nucleus,"stroke-width":2},map);text(140,mode==="imatinib"?115:155,"nucleus",18,C.nucleus);
  // Spatial references stay visible; neither route sends its cargo into the nucleus.
  const organelles=svgEl("g",{opacity:mode==="mrna"?1:.38},map);
  svgEl("ellipse",{cx:440,cy:115,rx:36,ry:29,fill:"#e3f3ea",stroke:C.endo,"stroke-width":2},organelles);
  text(438,173,"endosome",18,C.endo,"middle",organelles);
  for(let y=238;y<=282;y+=15)svgEl("path",{d:`M210,${y} C225,${y-12} 265,${y+12} 287,${y}`,fill:"none",stroke:C.er,"stroke-width":8,"stroke-linecap":"round"},organelles);
  text(245,315,"ER",20,C.er,"middle",organelles);
  for(let x=370;x<=402;x+=12)svgEl("path",{d:`M${x},233 Q${x-16},260 ${x},287`,fill:"none",stroke:C.golgi,"stroke-width":7,"stroke-linecap":"round"},organelles);
  text(390,315,"Golgi",18,C.golgi,"middle",organelles);
  svgEl("ellipse",{cx:105,cy:293,rx:40,ry:21,fill:"#f8e9ec",stroke:C.mito,"stroke-width":2},map);
  svgEl("path",{d:"M79,293 L90,285 99,300 111,285 121,301 132,292",fill:"none",stroke:C.mito,"stroke-width":2},map);
  text(105,333,"mitochondrion",16,C.mito);
  if(mode==="mrna"){
   svgEl("path",{d:"M286,190 Q300,177 314,190 Q321,204 307,211 L290,211 Q279,202 286,190",fill:"#ede8da",stroke:C.ink,"stroke-width":2},map);
   text(345,231,"ribosome",16,C.ink);
   text(413,409,"immune cells",18,C.signal);
  }else{
   svgEl("rect",{x:263,y:180,width:80,height:40,rx:8,fill:"#fff3e8",stroke:C.drug,"stroke-width":2},map);
   text(303,173,"BCR–ABL1",18,C.drug);
   text(278,348,"signalling",18,C.signal);
  }
  const stages=STAGES[mode];
  const affected=scenario==="escape"?2:scenario==="targeting"?3:scenario==="traffic"?4:scenario==="efflux"?1:scenario==="resistant"?2:99;
  for(let k=1;k<stages.length;k++){
   let points=[stages[k-1].point,stages[k].point];
   if(mode==="mrna"&&k===5)points=[stages[4].point,[390,260],stages[5].point];
   // For imatinib, the drug route ends at the cytosolic target; later connectors
   // represent signal and fate consequences, not drug movement into the nucleus.
   if(mode==="imatinib"&&k===4)points=[stages[3].point,[218,325],[195,210],stages[4].point];
   const color=(mode==="imatinib"&&k>=3)||(mode==="mrna"&&k===6)?C.signal:C.drug;
   svgEl("polyline",{points:points.map(p=>p.join(",")).join(" "),fill:"none",stroke:k<=index?color:"#b8c2ce","stroke-width":k<=index?4:2,"stroke-dasharray":k>=affected?"5 5":"",opacity:k<=index?1:.6},map);
  }
  stages.forEach((stage,k)=>{
   const [x,y]=stage.point;const active=k===index;
   svgEl("circle",{cx:x,cy:y,r:active?16:12,fill:active?C.drug:"white",stroke:k>=affected?C.drug:C.ink,"stroke-width":active?3:1.5},map);
   const e=text(x,y+6,String(k+1),active?20:17,active?"white":C.ink);e.setAttribute("font-weight","700");
  });
 }
 function render(){
  modeButtons.forEach((b,k)=>{const chosen=k===(mode==="mrna"?0:1);b.classList.toggle("active",chosen);b.setAttribute("aria-pressed",String(chosen));});
  stops.replaceChildren();STAGES[mode].forEach((stage,k)=>{const b=button(stops,`${k+1}. ${stage.label}`,()=>{index=k;render();});b.classList.toggle("active",k===index);if(k===index)b.setAttribute("aria-current","step");});
  const stage=STAGES[mode][index];const explanation=stageText(mode,index,scenario);
  panel.replaceChildren();htmlEl("h3","",`${index+1}. ${stage.title}`,panel);htmlEl("div","dj-where",`${stage.compartment} · ${stage.elo}`,panel);htmlEl("p","",explanation.text,panel);
  if(explanation.changed)htmlEl("p","dj-change",explanation.changed,panel);
  const evidence=htmlEl("p","","",panel);const strong=htmlEl("strong","","What would you measure? ",evidence);void strong;evidence.append(stage.evidence);
  const links=htmlEl("div","dj-links","",panel);for(const [label,href]of stage.links){const a=htmlEl("a","",label,links);a.href=href;}
  prev.disabled=index===0;next.disabled=index===STAGES[mode].length-1;progress.textContent=`Stop ${index+1} of ${STAGES[mode].length} · no clock`;
  results.replaceChildren();for(const r of readouts(mode,scenario)){const box=htmlEl("div","dj-readout"+(r.reduced?" reduced":""),"",results);htmlEl("div","",r.label,box);htmlEl("strong","",r.value,box);htmlEl("small","",r.detail,box);}
  note.textContent=mode==="mrna"?"Model: one successfully delivered, responsive cell in the baseline story. Uptake, escape, translation, intact surface antigen, peptide–MHC presentation and immunity are distinct observations. Perturbations change one process at a time; only uptake, translation and intact surface antigen are compared here. No RNA/protein folding kinetics, cell-to-cell variation, dose, efficacy or inevitable cell death is predicted.":"Model: a BCR–ABL1-dependent cell, with sufficient extracellular drug in the baseline story. Perturbations change access or target susceptibility one at a time. Transport, binding, signalling and fate are qualitative; pharmacokinetics, doses, alternative targets and bypass pathways are not simulated. Neither arrest nor apoptosis is guaranteed.";
  drawMap();
 }
 setOptions();render();
});
