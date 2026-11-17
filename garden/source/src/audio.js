// ============================================================================
// audio: procedural underwater ambience (no sample files)
// ============================================================================
// A fixed Web Audio graph, built at once (or on the first click / key / touch where the browser asks for one) and
// driven by a 10 Hz timer, not the frame loop. Layers: rumble, surface wash, water rush (follows camera speed),
// drone, bubbles, chimes and distant whale calls.
// The settings panel sets four levels, as in the other Infinite Ambient scenes: the volume, music (drone and chimes),
// ambient effects (bubbles and whale calls) and water (rumble, wash and rush). At the default levels the balance is
// the original one, as loud as the other scenes. Sound pauses while the page is hidden or out of focus (?wallpaper:
// only while hidden).
let AC, OUT, MUS, FXB, BED;
const VOL = 0.78; // master level at full volume: about -18.5 LUFS, peaks near -5.5 dBFS
function mkSound(ac) {
  const sr = ac.sampleRate;
  // node of class C with options o, connected to every node / param in `to`; sources start at once
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  // seamless brown noise loop (the end cross-fades into the start)
  const nb = noise(11, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; if (i < n) d[i] = b * 3.5; else { const k = (i - n) / 4096; d[i - n] = d[i - n] * k + b * 3.5 * (1 - k); } } });
  // reverb impulse: 5 s of noise that fades out and gets darker
  const ir = noise(5, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (rnd() * 2 - 1 - b) * (0.04 + 0.5 * exp(-t * 2)); d[i] = b * (1 - exp(-t * 30)) * exp(-t * 1.5) * (1 - i / n); } });

  const lim = N(DynamicsCompressorNode, { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim), wet = N(ConvolverNode, { buffer: ir }, out);
  // one level per settings slider; each sends to the reverb after its level, so the reverb follows it
  const bus = (send) => { const g = G(0, out); if (send) g.connect(G(send, wet)); return g; };
  MUS = [bus(1.5), bus(1.2)]; FXB = [bus(0.12), bus(2)]; BED = bus(0);
  const src = (playbackRate, ...to) => N(AudioBufferSourceNode, { buffer: nb, loop: true, playbackRate }, ...to);
  // rumble
  const rum = G(0.34, BED); src(1, BQ('lowpass', 150, 0.7, rum)); lfo(0.07, 0.11, rum.gain); lfo(0.113, 0.08, rum.gain);
  // surface wash + water rush: the same noise played at another speed, so the loops never line up
  const wash = G(0.25, BED), wave = G(1, wash), rush = G(0, BED), rushF = BQ('bandpass', 300, 0.9, rush);
  src(0.63, BQ('bandpass', 420, 0.5, wave), rushF); lfo(0.09, 0.3, wave.gain); lfo(0.151, 0.25, wave.gain);
  // drone: stacked fifths on D, each note a pair of slightly detuned sines that slowly beat
  const pad = MUS[0];
  [73.42, 110, 164.81, 246.94, 369.99].forEach((f, i) => { const g = G(0.022 - i * 0.003, pad); N(OscillatorNode, { frequency: f }, g); N(OscillatorNode, { frequency: f + rr(0.03, 0.11) }, g); });
  // pooled voices: oscillator -> envelope -> pan -> their level (dry + reverb)
  const pool = (n, to, type) => Array.from({ length: n }, () => { const p = N(StereoPannerNode, {}, to), g = G(0, p); return { p, g, o: N(OscillatorNode, { type }, g) }; });
  const bub = pool(4, FXB[0]), chime = pool(3, MUS[1]), whale = pool(2, FXB[1], 'triangle');
  // one note: pitch glides f0 -> f1 over dur, level rises to vol in att then dies away
  const play = (vs, t, f0, f1, dur, vol, att) => {
    const v = vs.shift(), f = v.o.frequency, g = v.g.gain; vs.push(v);
    v.p.pan.setValueAtTime(rr(-0.7, 0.7), t);
    f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + att); g.setTargetAtTime(0, t + att, (dur - att) / 5);
  };
  const NOTES = [0, 2, 5, 7, 9, 12, 14, 17, 19]; // D major pentatonic, in semitones above A4
  let lt = ac.currentTime, tB = lt + 1.5, tC = lt + 5, tW = lt + 12, lx = F[CX], ly = F[CY], lz = F[CZ];
  levels(1);
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    let v = hypot(F[CX] - lx, F[CY] - ly, F[CZ] - lz) / dt; if (v > 60) v = 0; // ignore jumps to a viewpoint
    lt = now; lx = F[CX]; ly = F[CY]; lz = F[CZ];
    rush.gain.setTargetAtTime(0.5 * pow(min(v / 26, 1), 1.2), t, 0.3); rushF.frequency.setTargetAtTime(220 + v * 14, t, 0.3);
    const s = clamp(1 + ly / 30, 0, 1); wash.gain.setTargetAtTime(0.25 + 0.55 * s * s, t, 0.5);
    if (t > tB) { // a burst of 1-6 bubbles: short rising blips, smaller bubbles higher and shorter
      let tt = t;
      for (let n = 1 + rnd() * rnd() * 6 | 0; n--;) { const f = rr(380, 1300); play(bub, tt, f, f * rr(1.4, 2.2), 0.05 + 40 / f, rr(0.03, 0.08), 0.006); tt += rr(0.07, 0.2); }
      tB = tt + rr(0.5, 5);
    }
    if (t > tC) { const f = 440 * pow(2, NOTES[rnd() * 9 | 0] / 12); play(chime, t, f, f, 5, rr(0.02, 0.04), 0.03); tC = t + rr(2.5, 9); }
    if (t > tW) { // a phrase of 2-3 slow glides
      let tt = t;
      for (let n = 2 + rnd() * 2 | 0; n--;) { const f = rr(170, 380), d = rr(1.6, 3.2); play(whale, tt, f, f * rr(0.6, 1.7), d, 0.08, d * 0.4); tt += d * 0.8; }
      tW = tt + rr(20, 50);
    }
  };
}
// the panel's levels: the volume and music follow the other scenes; effects and water are the original mix at 60% and 50%
function levels(fade) {
  if (!OUT) return;
  const now = AC.currentTime, k = fade || 0.15;
  OUT.gain.setTargetAtTime(S.sound && !MUTE ? VOL * S.volume * S.volume : 0, now, k);
  for (const g of MUS) g.gain.setTargetAtTime(S.music * S.music / 0.49, now, 0.3);
  for (const g of FXB) g.gain.setTargetAtTime(S.effects / 0.6, now, 0.3);
  BED.gain.setTargetAtTime(S.bed * S.bed * 4, now, 0.3);
}
let pageOn = true;
const canPlay = () => pageOn && !document.hidden && (WALL || document.hasFocus());
const live = () => !!AC && AC.state === 'running' && S.sound && !MUTE && canPlay();
// builds the graph once and resumes it where the browser allows; called at start and on every click / key / touch
function sound() {
  if (!S.sound || MUTE || !canPlay() || !window.AudioContext) return;
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); AC.addEventListener('statechange', sync); }
  if (AC.state !== 'running') AC.resume().then(() => { if (!S.sound || !canPlay()) pause(); sync(); }, () => {});
  levels(1.5);
}
const pause = () => { if (AC && AC.state === 'running') AC.suspend().then(sync, () => {}); };
function setSound(on) {
  S.sound = on; saveS();
  if (on) sound();
  else if (AC) { levels(0.3); setTimeout(() => { if (!S.sound) pause(); }, 1500); }
  sync();
}
IA.levels = () => levels(); IA.sound = setSound; IA.live = live;
const gesture = (e) => { if (e.type === 'keydown' && (e.key.toLowerCase() === 's' || e.code === 'KeyM')) return; if (!live()) sound(); };
addEventListener('pointerdown', gesture, true);
addEventListener('keydown', gesture, true);
const follow = () => (canPlay() ? sound() : pause());
document.addEventListener('visibilitychange', follow);
addEventListener('focus', follow);
addEventListener('blur', () => { if (!WALL) pause(); });
addEventListener('pagehide', () => { pageOn = false; pause(); });
addEventListener('pageshow', () => { pageOn = true; follow(); });
// Some browsers allow sound without a click, for example Chrome started with
// --autoplay-policy=no-user-gesture-required as a kiosk or wallpaper.
sound();
sync();
