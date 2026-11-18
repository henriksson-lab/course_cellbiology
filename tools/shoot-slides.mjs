#!/usr/bin/env -S node --experimental-websocket
// Screenshot every slide of a rendered reveal.js deck with one headless Chrome.
// Usage (Node 20 needs the flag; Node 22+ does not): node --experimental-websocket tools/shoot-slides.mjs docs/<unit>/lec.html <outdir> [first] [last]
// Also prints slides whose content runs past the bottom edge.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const [deck, outdir, first = "0", last = "999"] = process.argv.slice(2);
if (!deck || !outdir) { console.error("usage: shoot-slides.mjs <deck.html> <outdir> [first] [last]"); process.exit(1); }
fs.mkdirSync(outdir, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shoot-"));
const chrome = spawn("google-chrome", ["--headless=new", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1280,720", "about:blank"],
  { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.value;

await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "file://" + path.resolve(deck) });
for (let i = 0; i < 50; i++) { await sleep(200); if (await evaluate("!!(window.Reveal && Reveal.isReady && Reveal.isReady())")) break; }
await evaluate("document.fonts.ready.then(() => true)");
const total = await evaluate("Reveal.getTotalSlides()");
const over = [];
for (let n = Math.max(0, +first); n < Math.min(total, +last + 1); n++) {
  await evaluate(`Reveal.slide(${n})`);
  await sleep(600);
  const o = await evaluate(`(() => { const s = Reveal.getCurrentSlide(); return Math.round(s.scrollHeight - Reveal.getConfig().height); })()`);
  if (o > 5) over.push(`slide ${n + 1}: ${o}px too tall`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(outdir, `s${String(n + 1).padStart(2, "0")}.png`), Buffer.from(shot.data, "base64"));
}
console.log(`${total} slides captured to ${outdir}`);
console.log(over.length ? "Overflow:\n  " + over.join("\n  ") : "No overflow detected.");
ws.close(); chrome.kill();
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
