/* Infinite Ambient - shared runtime.

   Each scene is one full-screen WebGL 2 fragment shader plus a music setting. This
   file draws it at a capped frame rate and an adaptive resolution, recovers from a
   lost GPU context, runs a small settings panel, and plays an ambience noise bed
   with a decoded soundtrack from the same site.

   Built for running for days as a wallpaper:
   - the frame rate is capped (30 fps by default), and drawing stops while hidden;
   - where the browser offers a GPU timer, the automatic resolution keeps the graphics
     work near a fixed budget per frame (6 ms by default), so the load stays low even
     on a fast card, and a lower frame rate really does save power;
   - travel wraps at the scene's world period and every animation runs on closed
     loops, so the numbers sent to the GPU stay small and the image never degrades;
   - a lost GPU context is rebuilt, or the page reloads if it is not given back;
   - one audio source loops the decoded soundtrack independently of drawing.

   URL options: ?t=<seconds> start time, ?scale=<0.2-1> fixed resolution,
   ?fps=<15|30|60>, ?mute (no audio), ?nohint,
   ?shot (draw a few frames and stop, for screenshots). */
(function () {
'use strict';

const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec2 uRes;        // drawing buffer size in pixels
uniform float uTime;      // seconds, wrapped every 600 s: use only for small flicker
uniform vec4 uLoop;       // phases (0..1) of four slow closed loops
uniform vec3 uCam;        // travelled distance, wrapped at the scene's world period
uniform vec2 uLook;       // smoothed pointer position, -1..1
uniform float uFrame;
uniform sampler2D uNoise; // 256 x 256 random texels, read with texelFetch
out vec4 fragColor;

const float TAU = 6.28318530718;

uint pcgHash(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float hash31(vec3 c) { uvec3 u = uvec3(ivec3(floor(c)) + 65536); return float(pcgHash(u.x + pcgHash(u.y + pcgHash(u.z)))) * (1.0 / 4294967295.0); }
vec3 hash33(vec3 c) { return vec3(hash31(c), hash31(c + vec3(17.0, 59.0, 113.0)), hash31(c + vec3(83.0, 7.0, 41.0))); }

// Value noise from the texture. It repeats every 256 units on each axis, and so
// does every octave above it, which keeps wrapped worlds seamless.
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  ivec2 a = ivec2(mod(i, 256.0)), b = (a + 1) & 255;
  float v00 = texelFetch(uNoise, a, 0).r, v10 = texelFetch(uNoise, ivec2(b.x, a.y), 0).r;
  float v01 = texelFetch(uNoise, ivec2(a.x, b.y), 0).r, v11 = texelFetch(uNoise, b, 0).r;
  return mix(mix(v00, v10, u.x), mix(v01, v11, u.x), u.y);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  ivec2 a = ivec2(mod(i.xy + vec2(37.0, 17.0) * i.z, 256.0)), b = (a + 1) & 255;
  vec2 v00 = texelFetch(uNoise, a, 0).rg, v10 = texelFetch(uNoise, ivec2(b.x, a.y), 0).rg;
  vec2 v01 = texelFetch(uNoise, ivec2(a.x, b.y), 0).rg, v11 = texelFetch(uNoise, b, 0).rg;
  vec2 v = mix(mix(v00, v10, u.x), mix(v01, v11, u.x), u.y);
  return mix(v.x, v.y, u.z);
}
float fbm2(vec2 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * noise2(p); n += a; p = p * 2.0 + vec2(17.0, 31.0); a *= 0.5; }
  return s / n;
}
float fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * noise3(p); n += a; p = p * 2.0 + vec3(17.0, 31.0, 7.0); a *= 0.5; }
  return s / n;
}
// A closed path through noise space: as phase goes 0..1 the offset returns to start.
vec2 loop2(float phase, float r) { return r * vec2(cos(TAU * phase), sin(TAU * phase)); }
// Interleaved gradient noise: a fixed, even dither pattern.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 viewRay(vec2 frag, float fov, float yaw, float pitch) {
  vec3 v = normalize(vec3((frag - 0.5 * uRes) / uRes.y, fov));
  vec3 d = vec3(v.x, v.y * cos(pitch) + v.z * sin(pitch), -v.y * sin(pitch) + v.z * cos(pitch));
  return vec3(d.x * cos(yaw) + d.z * sin(yaw), d.y, -d.x * sin(yaw) + d.z * cos(yaw));
}
// Stars on the sky sphere: one possible star per cell, k cells per radian.
vec3 starsAt(vec3 rd, float k, float keep, float pxA) {
  vec3 p = rd * k, c = floor(p), f = fract(p) - 0.5;
  vec3 h = hash33(c);
  if (h.x > keep) return vec3(0.0);
  float d = length(f - (h - 0.5) * 0.6);
  float w = max(k * pxA * 0.9, 0.02);
  float b = 0.08 + 0.92 * pow(h.y, 6.0);
  float tw = 0.78 + 0.22 * sin(uTime * (0.7 + 2.5 * h.z) + h.y * 60.0);
  vec3 tint = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.82, 1.0), h.z);
  return tint * b * tw * exp(-d * d / (w * w));
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// Tone map, vignette, gamma, and a little grain that also hides banding.
vec4 finish(vec3 col) {
  vec2 q = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  col *= 1.0 - 0.16 * dot(q, q);
  col = pow(aces(col), vec3(1.0 / 2.2));
  float g = hash31(vec3(gl_FragCoord.xy, mod(uFrame, 61.0))) - 0.5;
  return vec4(col + g * (1.6 / 255.0), 1.0);
}
#line 1
`;

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';

window.InfiniteScene = function (cfg) {
  const Q = new URLSearchParams(location.search);
  const STORE = 'infinite-ambient:' + cfg.id + ':v1';
  const S = Object.assign({ sound: true, volume: 0.6, music: 0.7, bed: cfg.bed ? cfg.bed.level : 0, fps: 30, quality: 0 }, load());
  if (Q.get('fps')) S.fps = +Q.get('fps') || 30;
  const fixedScale = Q.get('scale') ? Math.min(1, Math.max(0.2, +Q.get('scale'))) : 0;
  const MUTE = Q.has('mute');
  if (Q.has('shot')) document.getElementById('c').style.transition = 'none';   // for screenshots
  function load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }

  /* ---- page furniture ---- */
  const canvas = document.getElementById('c');
  const row = (id, label) => `<div class="ia-row"><label for="ia-${id}">${label}<output id="ia-${id}-v"></output></label><input type="range" id="ia-${id}" min="0" max="1" step="0.01"></div>`;
  const ui = document.createElement('div');
  ui.innerHTML = `
    <div id="ia-hint"><b>${cfg.title}</b> &middot; click for sound &middot; G settings &middot; F full screen</div>
    <button id="ia-btn" type="button" aria-label="Settings" title="Settings (G)">${ICON}</button>
    <div id="ia-panel" role="dialog" aria-label="${cfg.title} settings">
      <div class="ia-title">${cfg.title}</div>
      <div class="ia-sub">${cfg.subtitle || ''}</div>
      <label class="ia-check"><input type="checkbox" id="ia-sound"> Sound</label>
      ${row('volume', 'Volume')}
      ${row('music', 'Music')}
      ${cfg.bed ? row('bed', cfg.bed.label || 'Ambience') : ''}
      <div class="ia-sec">Display</div>
      <div class="ia-row"><label for="ia-fps">Frame rate</label>
        <select id="ia-fps"><option value="15">15 fps (lowest power)</option><option value="30">30 fps</option><option value="60">60 fps</option></select></div>
      <div class="ia-row"><label for="ia-quality">Resolution</label>
        <select id="ia-quality"><option value="0">Automatic</option><option value="40">40%</option><option value="50">50%</option><option value="60">60%</option><option value="70">70%</option><option value="85">85%</option><option value="100">100%</option></select></div>
      <div class="ia-stats"><span>Drawing at</span><b id="ia-res">-</b><span>Frame rate</span><b id="ia-rate">-</b><span>Graphics work</span><b id="ia-gpu">-</b></div>
      <div class="ia-btns"><button type="button" id="ia-full">Full screen</button><a href="../index.html">All scenes</a></div>
      <div class="ia-note" id="ia-note"></div>
    </div>
    <div id="ia-err" role="alert"></div>`;
  document.body.appendChild(ui);
  const $ = id => document.getElementById(id);
  if (Q.has('shot')) $('ia-btn').style.display = 'none';
  function fail(msg) { const e = $('ia-err'); e.textContent = msg; e.style.display = 'block'; console.error(msg); }

  /* ---- GPU ---- */
  let gl = null, prog = null, U = {}, lost = false, lostAt = 0, TQ = null, gpuQ = null;
  function noiseTexels() {
    let s = 0x2F6E2B1;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    const N = 256, r = new Uint8Array(N * N), d = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) r[i] = Math.floor(rnd() * 256);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, j = ((y + 17) & 255) * N + ((x + 37) & 255);
      d[i * 4] = r[i]; d[i * 4 + 1] = r[j]; d[i * 4 + 2] = Math.floor(rnd() * 256); d[i * 4 + 3] = Math.floor(rnd() * 256);
    }
    return d;
  }
  const TEXELS = noiseTexels();
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) { fail('Shader error\n' + gl.getShaderInfoLog(sh)); return null; }
    return sh;
  }
  function initGL() {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'default' });
    if (!gl) { fail('This browser has no WebGL 2, which this scene needs.'); return false; }
    TQ = gl.getExtension('EXT_disjoint_timer_query_webgl2'); gpuQ = null;
    const vs = compile(gl.VERTEX_SHADER, '#version 300 es\nin vec2 aPos;\nvoid main() { gl_Position = vec4(aPos, 0.0, 1.0); }');
    const fs = compile(gl.FRAGMENT_SHADER, PRELUDE + cfg.frag);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) { fail('Link error\n' + gl.getProgramInfoLog(prog)); prog = null; return false; }
    gl.useProgram(prog);
    const vao = gl.createVertexArray(), buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, TEXELS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    U = {};
    for (const n of ['uRes', 'uTime', 'uLoop', 'uCam', 'uLook', 'uFrame', 'uNoise']) U[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(U.uNoise, 0);
    return true;
  }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; lostAt = performance.now(); gpuQ = null; });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; initGL(); });
  // If the browser does not give the context back, start again from a fresh page.
  setInterval(() => { if (lost && performance.now() - lostAt > 15000) location.reload(); }, 5000);

  /* ---- time, travel and drawing ---- */
  let t = Math.max(0, +(Q.get('t') || 0) || 0);
  const speed = cfg.speed || [0, 0, 1], period = cfg.period || [4096, 4096, 4096], loopT = cfg.loops || [600, 900, 1500, 2400];
  const frac = x => x - Math.floor(x);
  const wrap = (x, P) => { const y = x % P; return y < 0 ? y + P : y; };
  let scale = fixedScale || (S.quality ? S.quality / 100 : cfg.scale || 0.6), frameN = 0;
  const look = [0, 0], lookT = [0, 0];
  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(64, Math.round(innerWidth * dpr * scale)), h = Math.max(64, Math.round(innerHeight * dpr * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uTime, t % 600);
    gl.uniform4f(U.uLoop, frac(t / loopT[0]), frac(t / loopT[1]), frac(t / loopT[2]), frac(t / loopT[3]));
    gl.uniform3f(U.uCam, wrap(speed[0] * t, period[0]), wrap(speed[1] * t, period[1]), wrap(speed[2] * t, period[2]));
    gl.uniform2f(U.uLook, look[0], look[1]);
    gl.uniform1f(U.uFrame, frameN % 65536);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    frameN++;
  }
  let lastDraw = 0, lastRaf = 0, rafAvg = 16.7, first = true, shown = false, drawn = 0;
  const perf = { sum: 0, n: 0, good: 0 };
  // Graphics load: with a GPU timer, one frame in thirty is timed on the card itself.
  const GPU_BUDGET = cfg.gpuBudget || 6;   // milliseconds of graphics work per frame
  let gpuAvg = 0, gpuN = 0;
  function timedDraw() {
    if (!TQ || gpuQ || frameN % 30 !== 0) { draw(); return; }
    gpuQ = gl.createQuery();
    gl.beginQuery(TQ.TIME_ELAPSED_EXT, gpuQ);
    draw();
    gl.endQuery(TQ.TIME_ELAPSED_EXT);
  }
  function readGpuTimer() {
    if (!gpuQ || !gl.getQueryParameter(gpuQ, gl.QUERY_RESULT_AVAILABLE)) return;
    const ns = gl.getQueryParameter(gpuQ, gl.QUERY_RESULT), bad = gl.getParameter(TQ.GPU_DISJOINT_EXT);
    gl.deleteQuery(gpuQ); gpuQ = null;
    if (bad || !(ns > 0)) return;
    gpuAvg = gpuN ? gpuAvg + (ns / 1e6 - gpuAvg) * 0.3 : ns / 1e6;
    gpuN++;
  }
  const still = Q.has('shot');   // screenshots: a few frames at the given time, then stop
  function frame(now) {
    if (still && drawn >= 4) return;
    requestAnimationFrame(frame);
    if (lastRaf) rafAvg += (Math.min(now - lastRaf, 100) - rafAvg) * 0.05;
    lastRaf = now;
    if (!gl || lost || !prog) return;
    const minDt = 1000 / S.fps, since = now - lastDraw;
    if (!first && since < minDt - 3) return;
    const dt = first || still ? 0 : Math.min(since, 250) / 1000;
    first = false; lastDraw = now;
    t += dt;
    const k = Math.min(1, dt * 1.2);
    look[0] += (lookT[0] - look[0]) * k; look[1] += (lookT[1] - look[1]) * k;
    readGpuTimer(); timedDraw(); drawn++;
    if (!shown && frameN > 2) { shown = true; canvas.classList.add('on'); }
    adapt(since, minDt);
  }
  // Automatic resolution, checked every three seconds. Frames that come late always
  // step it down. With a GPU timer it then holds the timed work near GPU_BUDGET; the
  // budget is per frame, so at 15 fps the card works half as much as at 30 fps.
  // Without a timer the load is unknown, so it only grows back to the scene's default.
  function adapt(since, minDt) {
    if (fixedScale || S.quality || frameN < 20) return;
    perf.sum += since; perf.n++;
    if (perf.sum < 3000) return;
    const avg = perf.sum / perf.n;
    perf.sum = perf.n = 0;
    const expect = Math.max(minDt, Math.ceil((minDt - 3) / rafAvg) * rafAvg);
    const lo = cfg.scaleMin || 0.35, hi = cfg.scaleMax || 0.8, base = cfg.scale || 0.6;
    if (avg > expect * 1.3) { if (scale > lo) { scale = Math.max(lo, scale - 0.07); gpuN = 0; } perf.good = 0; return; }
    if (TQ && gpuN >= 3) {
      // the work grows with the square of the scale
      if (gpuAvg > GPU_BUDGET * 1.15 && scale > lo) { scale = Math.max(lo, scale * Math.max(0.85, Math.sqrt(GPU_BUDGET / gpuAvg))); gpuN = 0; }
      else if (gpuAvg < GPU_BUDGET * 0.7 && scale < hi && avg < expect * 1.1) { scale = Math.min(hi, scale + 0.03); gpuN = 0; }
      return;
    }
    if (TQ) return;
    if (avg < expect * 1.1) { if (++perf.good >= 4 && scale < base) { scale = Math.min(base, scale + 0.04); perf.good = 0; } }
    else perf.good = 0;
  }

  /* ---- input ---- */
  let idleTimer = 0;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!document.body.classList.contains('panel')) document.body.classList.add('idle'); }, 3000);
  }
  addEventListener('pointermove', e => { lookT[0] = e.clientX / innerWidth * 2 - 1; lookT[1] = e.clientY / innerHeight * 2 - 1; wake(); });
  const togglePanel = () => { document.body.classList.toggle('panel'); wake(); };
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); };
  $('ia-btn').addEventListener('click', togglePanel);
  $('ia-full').addEventListener('click', fullscreen);
  canvas.addEventListener('dblclick', fullscreen);
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'g') togglePanel();
    else if (k === 'f') fullscreen();
    else if (k === 's') setSound(!(S.sound && live()));
    else if (k === 'escape') document.body.classList.remove('panel');
  });

  /* ---- sound ---- */
  const AC = window.AudioContext || window.webkitAudioContext;
  let au = null;
  const trackUrl = new URL(`../audio/${cfg.id}-yue2.flac`, document.baseURI);
  function noise(ctx, secs, colour) {
    const sr = ctx.sampleRate, L = Math.round(secs * sr), F = Math.round(0.5 * sr), buf = ctx.createBuffer(2, L, sr);
    for (let ch = 0; ch < 2; ch++) {
      const a = new Float32Array(L + F);
      let b0 = 0, b1 = 0, b2 = 0, br = 0;
      for (let i = 0; i < L + F; i++) {
        const w = Math.random() * 2 - 1;
        if (colour === 'brown') { br = (br + 0.02 * w) / 1.02; a[i] = br * 3.2; continue; }
        // three one-pole filters approximate pink noise (-3 dB per octave)
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.06;
      }
      const d = buf.getChannelData(ch);
      for (let i = 0; i < L; i++) d[i] = i < F ? a[i] * Math.sqrt(i / F) + a[L + i] * Math.sqrt(1 - i / F) : a[i];
    }
    return buf;
  }
  function makeBed(ctx, dest, b) {
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), bus = ctx.createGain();
    src.buffer = noise(ctx, 11, b.color); src.loop = true;
    hp.type = 'highpass'; hp.frequency.value = b.hp || 30;
    lp.type = 'lowpass'; lp.frequency.value = b.lp[0]; lp.Q.value = 0.4;
    g.gain.value = 0.6; bus.gain.value = 0;
    src.connect(hp).connect(lp).connect(g).connect(bus).connect(dest);
    src.start();
    return {
      bus,
      // gusts from three slow swells whose periods never line up
      update(now) {
        const x = Math.max(0, Math.min(1, 0.5 + 0.25 * Math.sin(now * 0.071 + 1.1) + 0.15 * Math.sin(now * 0.193 + 0.3) + 0.1 * Math.sin(now * 0.437 + 2.0)));
        lp.frequency.setTargetAtTime(b.lp[0] + (b.lp[1] - b.lp[0]) * x, now, 1.0);
        g.gain.setTargetAtTime(0.45 + 0.55 * x, now, 1.0);
      },
    };
  }
  function buildAudio() {
    const ctx = new AC();
    const master = ctx.createGain(), comp = ctx.createDynamicsCompressor(), musicBus = ctx.createGain();
    master.gain.value = 0; musicBus.gain.value = 0;
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 1.0;
    master.connect(comp).connect(ctx.destination);
    musicBus.connect(master);
    const bed = cfg.bed ? makeBed(ctx, master, cfg.bed) : null;
    au = { ctx, master, musicBus, bed, trackState: 'idle' };
    ctx.addEventListener('statechange', sync);
    if (bed) setInterval(() => { if (live()) bed.update(ctx.currentTime); }, 500);
  }
  async function loadTrack() {
    if (au.trackState === 'loading' || (au.trackState === 'ready' && !au.media?.paused)) return;
    au.trackState = 'loading';
    sync();
    try {
      if (location.protocol === 'file:') {
        // Local files cannot be fetched by some browsers.
        au.media ||= new Audio(trackUrl.href);
        au.media.loop = true;
        levels();
        await au.media.play();
        if (!S.sound) au.media.pause();
      } else {
        const response = await fetch(trackUrl);
        if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
        const buffer = await au.ctx.decodeAudioData(await response.arrayBuffer());
        const source = au.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(au.musicBus);
        source.start();
      }
      au.trackState = 'ready';
    } catch (error) {
      au.trackState = 'failed';
      console.error('Could not load soundtrack.', error);
    }
    sync();
  }
  function levels(fade) {
    if (!au) return;
    const now = au.ctx.currentTime;
    au.master.gain.setTargetAtTime(S.sound ? S.volume * S.volume : 0, now, fade || 0.15);
    au.musicBus.gain.setTargetAtTime(S.music * S.music * 1.6, now, 0.3);
    if (au.media) au.media.volume = S.sound ? Math.min(1, (S.music * S.volume) ** 2 * 1.6) : 0;
    if (au.bed) au.bed.bus.gain.setTargetAtTime(S.bed * S.bed * (cfg.bed.gain || 1), now, 0.3);
  }
  const live = () => !!au && au.ctx.state === 'running' && S.sound;
  function startSound() {
    if (!S.sound || !AC || MUTE) return;
    if (!au) { try { buildAudio(); } catch (e) { au = null; return; } }
    if (au.ctx.state !== 'running') au.ctx.resume().then(sync, () => {});
    levels(1.5);
    loadTrack();
    sync();
  }
  function setSound(on) {
    S.sound = on; save();
    if (on) startSound();
    else if (au) {
      levels(0.3);
      au.media?.pause();
      setTimeout(() => { if (!S.sound && au) au.ctx.suspend().then(sync); }, 1500);
    }
    sync();
  }
  const gesture = e => {
    if (e.type === 'keydown' && e.key.toLowerCase() === 's') return;
    if (!live() || au.trackState === 'failed') startSound();
  };
  addEventListener('pointerdown', gesture, true);
  addEventListener('keydown', gesture, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && au && S.sound) au.ctx.resume().then(sync, () => {});
  });

  /* ---- settings panel ---- */
  const sliders = ['volume', 'music'].concat(cfg.bed ? ['bed'] : []);
  function sync() {
    $('ia-sound').checked = S.sound;
    for (const k of sliders) { $('ia-' + k).value = S[k]; $('ia-' + k + '-v').textContent = S[k] === 0 ? 'off' : Math.round(S[k] * 100) + '%'; }
    $('ia-fps').value = String(S.fps);
    $('ia-quality').value = String(S.quality);
    let note = 'S turns the sound on or off.';
    if (!AC) note = 'This browser has no Web Audio.';
    else if (S.sound && !MUTE) {
      if (!live()) note = 'Click anywhere to start the sound.';
      else if (au.trackState === 'loading') note = 'Loading soundtrack…';
      else if (au.trackState === 'failed') note = 'Soundtrack failed to load. Click to retry.';
    }
    $('ia-note').textContent = note;
  }
  ui.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'ia-sound') { setSound(e.target.checked); return; }
    if (id === 'ia-fps') { S.fps = +e.target.value; perf.sum = perf.n = 0; }
    else if (id === 'ia-quality') { S.quality = +e.target.value; if (S.quality) scale = S.quality / 100; }
    else if (id.startsWith('ia-') && sliders.includes(id.slice(3))) { S[id.slice(3)] = parseFloat(e.target.value); levels(); }
    save(); sync();
  });
  setInterval(() => {
    $('ia-res').textContent = canvas.width + ' x ' + canvas.height + ' (' + Math.round(scale * 100) + '%)';
    $('ia-rate').textContent = drawn + ' fps';
    $('ia-gpu').textContent = !TQ ? 'not measured' : gpuAvg ? gpuAvg.toFixed(1) + ' ms a frame' : '-';
    drawn = 0;
  }, 1000);

  /* ---- start ---- */
  if (initGL()) requestAnimationFrame(frame);
  sync();
  wake();
  if (!Q.has('nohint')) { const h = $('ia-hint'); setTimeout(() => h.classList.add('on'), 1200); setTimeout(() => h.classList.remove('on'), 8000); }
  // Some browsers allow sound without a click, for example Chrome started with
  // --autoplay-policy=no-user-gesture-required as a kiosk or wallpaper.
  startSound();

  // Hooks for testing: draw a frame at a given time and measure it.
  window.__scene = {
    get time() { return t; }, set time(v) { t = v; },
    get scale() { return scale; },
    probe(at) {
      if (at != null) t = at;
      draw();
      const w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0, lo = 255, hi = 0;
      for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; s += l; if (l < lo) lo = l; if (l > hi) hi = l; }
      return { w, h, mean: +(s / (w * h)).toFixed(1), min: lo, max: hi };
    },
    get gpuAvg() { return gpuAvg; },
    // Time of one frame on the graphics card, from n frames in a GPU timer query.
    // Resolves to null if the browser has no timer or the reading was disturbed.
    gpuMs(n) {
      n = n || 20;
      if (!TQ) return Promise.resolve(null);
      const q = gl.createQuery();
      gl.beginQuery(TQ.TIME_ELAPSED_EXT, q);
      for (let i = 0; i < n; i++) draw();
      gl.endQuery(TQ.TIME_ELAPSED_EXT);
      return new Promise(res => {
        const poll = () => {
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return setTimeout(poll, 30);
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT), bad = gl.getParameter(TQ.GPU_DISJOINT_EXT);
          gl.deleteQuery(q);
          res(bad ? null : +(ns / n / 1e6).toFixed(2));
        };
        poll();
      });
    },
  };
};
})();
