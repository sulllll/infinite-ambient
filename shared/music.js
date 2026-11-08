/* Infinite Ambient - generative music engine.

   Several loops each hold one soft note and repeat at their own length. No two
   lengths share a common beat, so the notes keep meeting in new combinations and the
   music never repeats exactly. Every eight to twelve minutes all loops move together
   to a related set of notes. Each scene gives its own note sets, loops, hall and
   echo. Everything is synthesised with the Web Audio API: no samples, no files.

   The engine needs only an audio context and an output node, so it also renders
   offline (OfflineAudioContext, or node-web-audio-api in tools/render-music.cjs). */
(function (root) {
'use strict';

function createAmbient(ctx, out, seed, cfg) {
  let s = (seed >>> 0) || 1;
  const rnd = () => {   // mulberry32: the same seed gives the same music
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (a, b) => a + (b - a) * rnd();
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const NYQ = ctx.sampleRate * 0.45;
  const bq = (type, f, q) => {
    const n = ctx.createBiquadFilter();
    n.type = type; n.frequency.value = Math.min(f, NYQ); n.Q.value = q;
    return n;
  };
  const SETS = cfg.sets, SEC = cfg.section || [480, 720], HOME = cfg.home || 0;
  const H = Object.assign({ secs: 7, decay: 2.1, bright: 0.85, dark: 0.78, wet: 0.85, dry: 0.45 }, cfg.hall);
  const E = Object.assign({ l: 1.37, r: 2.11, fb: 0.4, send: 0.3, lp: 1400, out: 0.7 }, cfg.echo);

  // Mix: a dry path and a long hall. The hall is generated noise that fades away and
  // loses its highs as it fades.
  const bus = ctx.createGain(), tone = bq('lowpass', cfg.tone || 4200, 0.5);
  const dry = ctx.createGain(), wet = ctx.createGain(), verb = ctx.createConvolver();
  dry.gain.value = H.dry; wet.gain.value = H.wet;
  {
    const sr = ctx.sampleRate, L = Math.round(H.secs * sr), b = ctx.createBuffer(2, L, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < L; i++) {
        const t = i / sr;
        lp += Math.max(0.03, H.bright - H.dark * Math.min(1, t / (H.secs * 0.8))) * ((rnd() * 2 - 1) - lp);
        d[i] = t < 0.02 ? 0 : lp * Math.min(1, (t - 0.02) / 0.08) * Math.exp(-(t - 0.02) / H.decay);
      }
    }
    verb.buffer = b;
  }
  bus.connect(tone);
  tone.connect(dry).connect(out);
  tone.connect(verb).connect(wet).connect(out);
  // Echo: left first, then right, then fading back and forth.
  const echo = ctx.createGain(), dl = ctx.createDelay(6), dr = ctx.createDelay(6);
  const efb = ctx.createGain(), elp = bq('lowpass', E.lp, 0.4), emix = ctx.createChannelMerger(2), eout = ctx.createGain();
  echo.gain.value = E.send; dl.delayTime.value = E.l; dr.delayTime.value = E.r; efb.gain.value = E.fb; eout.gain.value = E.out;
  echo.connect(dl); dl.connect(emix, 0, 0); dl.connect(dr); dr.connect(emix, 0, 1);
  dr.connect(elp).connect(efb).connect(dl);
  emix.connect(eout).connect(tone);
  // Tape wow: very slow wobbles in pitch, shared by every note.
  const wow = ctx.createGain();
  for (const [f, c] of cfg.wow || [[0.11, 4], [0.043, 3]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f; g.gain.value = c;
    o.connect(g).connect(wow); o.start();
  }

  // Every note builds a small graph. When all its sources end, it disconnects all of
  // it, including the links from the shared wow, so nothing builds up over hours.
  let live = 0, made = 0, on = true;
  function voice(oscs, nodes) {
    live++; made++;
    let left = oscs.length;
    for (const o of oscs) o.onended = () => {
      if (--left) return;
      for (const x of oscs) { try { wow.disconnect(x.detune); } catch (e) {} x.disconnect(); }
      for (const n of nodes) if (n) n.disconnect();
      live--;
    };
  }
  function osc(type, f, cents, t, stop) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = cents;
    wow.connect(o.detune);
    o.start(t); o.stop(stop);
    return o;
  }
  function pan(p) {
    if (!ctx.createStereoPanner) return ctx.createGain();
    const n = ctx.createStereoPanner();
    n.pan.value = Math.max(-1, Math.min(1, p));
    return n;
  }
  function send(node, o, def) {
    const a = o && o.echo != null ? o.echo : def;
    if (!(a > 0)) return null;
    const g = ctx.createGain();
    g.gain.value = a;
    node.connect(g).connect(echo);
    return g;
  }
  // Partials: [ratio, level, decay as a share of the note's ring time].
  function struck(t, f, v, ring, attack, parts, lpf) {
    const lp = bq('lowpass', lpf, 0.3), oscs = [], nodes = [lp];
    for (const [r, a, k] of parts) {
      if (f * r > NYQ) continue;
      const tau = ring * k, g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a * v, t + attack);
      g.gain.setTargetAtTime(0, t + attack, tau);
      const o = osc('sine', f * r, range(-3, 3), t, t + attack + tau * 7);
      o.connect(g).connect(lp);
      oscs.push(o); nodes.push(g);
    }
    return { lp, oscs, nodes };
  }

  const INSTR = {
    // Felt piano: four harmonics, struck softly; the upper ones fade first.
    piano(t, m, v, p, o) {
      const f = hz(m), ring = m < 62 ? 3.6 : m < 70 ? 3.0 : 2.4;
      const x = struck(t, f, v, ring, 0.015, [[1, 1, 1], [2, 0.3, 0.5], [3, 0.1, 0.3], [4.02, 0.04, 0.18]], Math.min(4500, f * 5));
      const pn = pan(p);
      x.lp.connect(pn); pn.connect(bus);
      voice(x.oscs, x.nodes.concat(pn, send(pn, o, 1)));
    },
    // Kalimba: a pure tone with the bright, quickly fading partials of a metal tine.
    pluck(t, m, v, p, o) {
      const f = hz(m), ring = (o && o.decay) || 1.6;
      const x = struck(t, f, v, ring, 0.003, [[1, 1, 1], [2, 0.12, 0.45], [5.4, 0.22, 0.09], [8.9, 0.07, 0.05]], Math.min(7000, f * 9));
      const pn = pan(p);
      x.lp.connect(pn); pn.connect(bus);
      voice(x.oscs, x.nodes.concat(pn, send(pn, o, 1)));
    },
    // Glass bell: frequency modulation at an inharmonic ratio gives a struck, glassy
    // tone. Its brightness fades faster than the tone itself.
    bell(t, m, v, p, o) {
      const f = hz(m), dec = (o && o.decay) || 4.5, end = t + 0.004 + dec * 7;
      const g = ctx.createGain(), g2 = ctx.createGain(), mg = ctx.createGain(), lp = bq('lowpass', Math.min(6500, f * 8), 0.3), pn = pan(p);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, dec);
      const car = osc('sine', f, range(-2, 2), t, end);
      const mod = ctx.createOscillator();
      mod.frequency.value = f * 3.51;
      mg.gain.setValueAtTime(f * 2.0, t); mg.gain.setTargetAtTime(f * 0.12, t, dec * 0.25);
      mod.connect(mg).connect(car.frequency); mod.start(t); mod.stop(end);
      const srcs = [car, mod];
      if (f * 2.76 < NYQ) {
        const p2 = osc('sine', f * 2.76, range(-3, 3), t, t + 0.004 + dec * 3);
        g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(v * 0.16, t + 0.004); g2.gain.setTargetAtTime(0, t + 0.004, dec * 0.4);
        p2.connect(g2).connect(lp); srcs.push(p2);
      }
      car.connect(g).connect(lp); lp.connect(pn); pn.connect(bus);
      voice(srcs, [g, g2, mg, lp, pn, send(pn, o, 1)]);
    },
    // Wordless choir: three slightly detuned saw waves shaped by the formants of a
    // soft "oo", "oh" or "aw". It swells in over a few seconds and fades slowly.
    choir(t, m, v, p, o) {
      const VOW = [[[300, 1], [870, 0.35], [2240, 0.08]], [[570, 1], [840, 0.55], [2410, 0.07]], [[440, 1], [1020, 0.4], [2240, 0.06]]];
      const f = hz(m), att = range(3, 5), hold = range(3, 6), rel = range(5, 8), end = t + att + hold + rel * 1.75;
      const g = ctx.createGain(), pn = pan(p), pre = bq('lowpass', 2600, 0.5), oscs = [], nodes = [g, pn, pre];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + att);
      g.gain.setValueAtTime(v, t + att + hold);
      g.gain.setTargetAtTime(0, t + att + hold, rel / 4);
      for (const c of [-8, 0, 7]) { const x = osc('sawtooth', f, c + range(-2, 2), t, end); x.connect(pre); oscs.push(x); }
      for (const [ff, a] of VOW[Math.floor(rnd() * VOW.length)]) {
        const b = bq('bandpass', ff, ff / 90), fg = ctx.createGain();
        fg.gain.value = a;
        pre.connect(b).connect(fg).connect(g);
        nodes.push(b, fg);
      }
      g.connect(pn).connect(bus);
      voice(oscs, nodes);
    },
    // Warm pad: two detuned saws and a triangle an octave down, through a low-pass
    // that opens as the note swells and closes as it fades.
    pad(t, m, v, p, o) {
      const f = hz(m), att = range(4, 7), hold = range(4, 8), rel = range(7, 10), end = t + att + hold + rel * 1.75;
      const g = ctx.createGain(), lp = bq('lowpass', f * 1.5, 0.7), pn = pan(p), oscs = [], nodes = [g, lp, pn];
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + att);
      g.gain.setValueAtTime(v, t + att + hold); g.gain.setTargetAtTime(0, t + att + hold, rel / 4);
      lp.frequency.setValueAtTime(Math.min(NYQ, f * 1.5), t);
      lp.frequency.linearRampToValueAtTime(Math.min(3200, f * 6), t + att);
      lp.frequency.setTargetAtTime(Math.min(NYQ, f * 1.2), t + att + hold, rel / 3);
      for (const [type, r, c, a] of [['sawtooth', 1, -6, 0.5], ['sawtooth', 1, 6, 0.5], ['triangle', 0.5, 0, 0.6]]) {
        const ag = ctx.createGain();
        ag.gain.value = a;
        const x = osc(type, f * r, c + range(-2, 2), t, end);
        x.connect(ag).connect(lp);
        oscs.push(x); nodes.push(ag);
      }
      lp.connect(g).connect(pn).connect(bus);
      voice(oscs, nodes);
    },
    // Low drone: root, sub-octave, fifth and octave, rising and falling so slowly that
    // it is felt more than heard. Each drone note overlaps the next.
    drone(t, m, v, p, o, len) {
      const f = hz(m), att = len * 0.35, dur = len * 1.3;
      const g = ctx.createGain(), pn = pan(p), oscs = [], nodes = [g, pn];
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + att);
      g.gain.setValueAtTime(v, t + dur - att);
      g.gain.linearRampToValueAtTime(0, t + dur);
      for (const [type, r, a] of [['sine', 0.5, 0.5], ['sine', 1, 1], ['triangle', 1.5, 0.22], ['sine', 2, 0.25]]) {
        if (f * r < 30) continue;   // too low to hear on most speakers; it only eats headroom
        const ag = ctx.createGain();
        ag.gain.value = a;
        const x = osc(type, f * r, range(-4, 4), t, t + dur + 0.1);
        x.connect(ag).connect(g);
        oscs.push(x); nodes.push(ag);
      }
      g.connect(pn).connect(bus);
      voice(oscs, nodes);
    },
    // Gliding call: a pure tone that slides up into its note, wavers, and sinks as it
    // fades, like a far-off whale.
    glide(t, m, v, p, o) {
      const f = hz(m), dur = range(7, 11);
      const g = ctx.createGain(), g2 = ctx.createGain(), lp = bq('lowpass', f * 3, 0.5), pn = pan(p);
      const vib = ctx.createOscillator(), vg = ctx.createGain();
      const o1 = osc('sine', f, 0, t, t + dur + 0.2), o2 = osc('sine', f * 2, 0, t, t + dur + 0.2);
      for (const [x, k] of [[o1, 1], [o2, 2]]) {
        x.frequency.setValueAtTime(f * k * 0.92, t);
        x.frequency.exponentialRampToValueAtTime(f * k, t + dur * 0.3);
        x.frequency.setValueAtTime(f * k, t + dur * 0.65);
        x.frequency.exponentialRampToValueAtTime(f * k * 0.95, t + dur);
      }
      vib.frequency.value = range(0.25, 0.45); vg.gain.value = 9;
      vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune);
      vib.start(t); vib.stop(t + dur + 0.2);
      g2.gain.value = 0.12;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.35);
      g.gain.setValueAtTime(v, t + dur * 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
      o1.connect(g); o2.connect(g2).connect(g);
      g.connect(lp).connect(pn); pn.connect(bus);
      voice([o1, o2, vib], [g, g2, lp, pn, vg, send(pn, o, 0.6)]);
    },
    // Sonar ping: a short pure tone with a long tail of echoes.
    ping(t, m, v, p, o) {
      const f = hz(m), dec = 0.9, g = ctx.createGain(), pn = pan(p);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.setTargetAtTime(0, t + 0.006, dec);
      const x = osc('sine', f, 0, t, t + 0.006 + dec * 7);
      x.connect(g).connect(pn); pn.connect(bus);
      voice([x], [g, pn, send(pn, o, 1.6)]);
    },
  };

  // Sections: which set of notes is in use at a given time. From the home set the
  // music moves to one of the others; from those it usually returns home.
  const t0 = ctx.currentTime, secs = [{ at: -Infinity, set: HOME }];
  let secEnd = t0 + range(SEC[0], SEC[1]);
  function setAt(t) {
    while (t >= secEnd) {
      const cur = secs[secs.length - 1].set;
      let nx = HOME;
      if (cur === HOME || rnd() < 0.4) { do nx = Math.floor(rnd() * SETS.length); while (nx === cur && SETS.length > 1); }
      secs.push({ at: secEnd, set: nx });
      if (secs.length > 6) secs.shift();
      secEnd += range(SEC[0], SEC[1]);
    }
    for (let i = secs.length - 1; i > 0; i--) if (t >= secs[i].at) return secs[i].set;
    return secs[0].set;
  }
  // loops: [instrument, place in the set, loop length (s), level, chance of silence, pan, options]
  const loops = cfg.loops.map(([kind, at, len, lv, rest, p, o], i) => ({ kind, at, len, lv, rest, p, o: o || {},
    next: t0 + (kind === 'drone' ? 0.5 : i === (cfg.first || 0) ? range(1, 3) : range(3, len)) }));
  const UP = cfg.octaveUp == null ? 0.08 : cfg.octaveUp, TOP = cfg.topNote || 88;
  function play(L, t) {
    let m = SETS[setAt(t)][L.at] + (L.o.oct || 0);
    if ((L.kind === 'piano' || L.kind === 'bell' || L.kind === 'pluck') && m + 12 <= TOP && rnd() < UP) m += 12;
    INSTR[L.kind](t, m, L.lv * range(0.75, 1), L.p + range(-0.08, 0.08), L.o, L.len);
  }
  // Schedules every note that starts before `until`. Notes whose time has already
  // passed, for example while the music was off, are skipped, not played late.
  function schedule(until) {
    const now = ctx.currentTime;
    for (const L of loops) {
      while (L.next < until) {
        const t = L.next;
        L.next += L.len * range(0.98, 1.02);
        if (!on || t < now - 0.05 || (L.rest && rnd() < L.rest)) continue;
        play(L, t);
      }
    }
  }
  return { schedule, setOn(b) { on = !!b; }, stats: () => ({ live, made, set: setAt(ctx.currentTime) }) };
}

root.createAmbient = createAmbient;
if (typeof module !== 'undefined' && module.exports) module.exports = createAmbient;
})(typeof window !== 'undefined' ? window : globalThis);
