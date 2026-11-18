// Shared helpers for particle demos (frap, uptake, cellbattery):
//  - a point renderer: WebGL (thousands of round dots per frame), with a Canvas2D
//    fallback when WebGL is not available. No textures, no network: works from file://.
//  - an animation loop that runs only while the demo is on screen and the tab is visible,
//    with a fixed simulation step (so a run with a given seed is reproducible at any fps).

export interface Points {
  /** x, y in world units (2 floats per point) */
  pos: Float32Array;
  /** diameter in world units (1 float per point) */
  size: Float32Array;
  /** colour as RGBA bytes (4 per point) */
  col: Uint8Array;
  n: number;
}

export function makePoints(cap: number): Points {
  return { pos: new Float32Array(cap * 2), size: new Float32Array(cap), col: new Uint8Array(cap * 4), n: 0 };
}

/** Parse "#rrggbb" into [r, g, b]. */
export function hexRGB(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export interface PointRenderer {
  readonly webgl: boolean;
  /** Draw the points; the world rectangle [0,worldW]×[0,worldH] fills the canvas. */
  draw(p: Points): void;
  setWorld(w: number, h: number): void;
}

const VS = `
attribute vec2 a_pos; attribute float a_size; attribute vec4 a_col;
uniform vec2 u_world; uniform float u_px;
varying vec4 v_col;
void main() {
  vec2 c = a_pos / u_world * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  gl_PointSize = max(1.5, a_size * u_px);
  v_col = a_col;
}`;
const FS = `
precision mediump float;
varying vec4 v_col;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = 1.0 - smoothstep(0.38, 0.5, d);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(v_col.rgb * v_col.a * a, v_col.a * a);
}`;

/**
 * A renderer on `canvas`. `bg` is the clear colour (RGBA 0–1); alpha 0 gives a
 * transparent canvas, so a picture underneath shows through.
 */
export function pointRenderer(canvas: HTMLCanvasElement, worldW: number, worldH: number,
  bg: [number, number, number, number] = [0, 0, 0, 0]): PointRenderer {
  let W = worldW, H = worldH;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
  } catch { gl = null; }

  if (gl) {
    const g = gl;
    const sh = (type: number, src: string) => {
      const s = g.createShader(type)!; g.shaderSource(s, src); g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s) || "shader");
      return s;
    };
    const prog = g.createProgram()!;
    g.attachShader(prog, sh(g.VERTEX_SHADER, VS)); g.attachShader(prog, sh(g.FRAGMENT_SHADER, FS));
    g.linkProgram(prog); g.useProgram(prog);
    const aPos = g.getAttribLocation(prog, "a_pos"), aSize = g.getAttribLocation(prog, "a_size"), aCol = g.getAttribLocation(prog, "a_col");
    const uWorld = g.getUniformLocation(prog, "u_world"), uPx = g.getUniformLocation(prog, "u_px");
    const bPos = g.createBuffer(), bSize = g.createBuffer(), bCol = g.createBuffer();
    g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    return {
      webgl: true,
      setWorld(w, h) { W = w; H = h; },
      draw(p) {
        fit();
        g.viewport(0, 0, canvas.width, canvas.height);
        g.clearColor(bg[0] * bg[3], bg[1] * bg[3], bg[2] * bg[3], bg[3]);
        g.clear(g.COLOR_BUFFER_BIT);
        if (!p.n) return;
        g.uniform2f(uWorld, W, H);
        g.uniform1f(uPx, canvas.width / W);
        g.bindBuffer(g.ARRAY_BUFFER, bPos); g.bufferData(g.ARRAY_BUFFER, p.pos.subarray(0, p.n * 2), g.DYNAMIC_DRAW);
        g.enableVertexAttribArray(aPos); g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0);
        g.bindBuffer(g.ARRAY_BUFFER, bSize); g.bufferData(g.ARRAY_BUFFER, p.size.subarray(0, p.n), g.DYNAMIC_DRAW);
        g.enableVertexAttribArray(aSize); g.vertexAttribPointer(aSize, 1, g.FLOAT, false, 0, 0);
        g.bindBuffer(g.ARRAY_BUFFER, bCol); g.bufferData(g.ARRAY_BUFFER, p.col.subarray(0, p.n * 4), g.DYNAMIC_DRAW);
        g.enableVertexAttribArray(aCol); g.vertexAttribPointer(aCol, 4, g.UNSIGNED_BYTE, true, 0, 0);
        g.drawArrays(g.POINTS, 0, p.n);
      },
    };
  }

  // Canvas2D fallback: slower, fine for a few thousand points.
  const ctx = canvas.getContext("2d")!;
  return {
    webgl: false,
    setWorld(w, h) { W = w; H = h; },
    draw(p) {
      fit();
      const sx = canvas.width / W, sy = canvas.height / H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bg[3] > 0) {
        ctx.fillStyle = `rgba(${bg[0] * 255},${bg[1] * 255},${bg[2] * 255},${bg[3]})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      for (let i = 0; i < p.n; i++) {
        const c = p.col, k = 4 * i;
        if (!c[k + 3]) continue;
        ctx.fillStyle = `rgba(${c[k]},${c[k + 1]},${c[k + 2]},${c[k + 3] / 255})`;
        const r = Math.max(0.75, p.size[i] * sx / 2);
        ctx.beginPath(); ctx.arc(p.pos[2 * i] * sx, p.pos[2 * i + 1] * sy, r, 0, 6.2832); ctx.fill();
      }
    },
  };
}

export interface Loop {
  /** pause or resume by the user (the loop also pauses itself when off screen) */
  setPaused(p: boolean): void;
  readonly paused: boolean;
  /** draw one frame now (e.g. after a control changed while paused) */
  redraw(): void;
}

/**
 * Run `step()` a whole number of times per frame (fixed step `dt` seconds of real time,
 * at most `maxSteps` per frame), then `render()`. Runs only while `el` is on screen and
 * the page is visible, so a demo further down the page costs nothing.
 */
export function visibleLoop(el: Element, dt: number, step: () => void, render: () => void, maxSteps = 4): Loop {
  let onScreen = false, userPaused = false, raf = 0, last = 0, acc = 0;
  const active = () => onScreen && !userPaused && !document.hidden;
  const frame = (t: number) => {
    raf = 0;
    if (!active()) { last = 0; return; }
    if (last) acc += Math.min(0.1, (t - last) / 1000);
    else acc += dt;
    last = t;
    let k = 0;
    while (acc >= dt && k < maxSteps) { step(); acc -= dt; k++; }
    if (k === maxSteps) acc = 0;
    render();
    raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf && active()) raf = requestAnimationFrame(frame); };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; kick(); }, { rootMargin: "50px" }).observe(el);
  } else { onScreen = true; }
  document.addEventListener("visibilitychange", kick);
  kick();
  return {
    setPaused(p) { userPaused = p; kick(); },
    get paused() { return userPaused; },
    redraw() { if (!raf || !active()) render(); },
  };
}

/** Fast Gaussian pairs from a uniform generator (Box–Muller, both outputs used). */
export function gaussPairs(unif: () => number) {
  let spare = 0, has = false;
  return () => {
    if (has) { has = false; return spare; }
    const u = 1 - unif(), v = unif();
    const r = Math.sqrt(-2 * Math.log(u)), a = 6.283185307179586 * v;
    spare = r * Math.sin(a); has = true;
    return r * Math.cos(a);
  };
}
