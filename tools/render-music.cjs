// Renders a scene's music offline and reports its levels, so changes to the music can
// be checked without listening for hours.
//
//   npm install node-web-audio-api
//   node tools/render-music.cjs <scene> [seconds=120] [sampleRate=24000] [seed=1] [out.wav]
//
// It schedules the music much as the page does (see the note at the loop below),
// checks for invalid samples, counts the notes still sounding each minute (which must
// stay small: every note frees its nodes when it ends) and prints the level and the
// loudness (LUFS) of the music bus at the scene's default level, before the master
// volume. The scenes' musicGain values are set so that their loudness matches.
const fs = require('fs');
const path = require('path');
const NA = require('node-web-audio-api');
const createAmbient = require('../shared/music.js');
const { loudness } = require('./loudness.cjs');

const [id, D = '120', SR = '24000', SEED = '1', OUT] = process.argv.slice(2);
if (!id) { console.error('usage: render-music.cjs <scene> [seconds] [sampleRate] [seed] [out.wav]'); process.exit(2); }
let cfg = null;
new Function('InfiniteScene', fs.readFileSync(path.join(__dirname, '..', id, 'scene.js'), 'utf8'))(c => { cfg = c; });
const dur = +D, sr = +SR;
const db = x => (x > 0 ? 20 * Math.log10(x) : -Infinity).toFixed(1);

(async () => {
  const ctx = new NA.OfflineAudioContext(2, Math.round(dur * sr), sr);
  const bus = ctx.createGain();
  bus.gain.value = 0.7 * 0.7 * (cfg.musicGain || 1.6);   // default music level, as the page sets it
  bus.connect(ctx.destination);
  const t0 = Date.now();
  const music = createAmbient(ctx, bus, +SEED, cfg.music);
  // The page schedules every second, six seconds ahead. Here it is every five seconds,
  // eleven ahead: the notes are the same kind, and each pause of the offline render
  // can cost up to a second on Windows, so fewer pauses keep a long render quick.
  const perMin = [], sets = [];
  for (let t = 0; t < dur; t += 5) {
    ctx.suspend(t).then(() => {
      music.schedule(t + 11);
      const st = music.stats();
      if (!sets.length || sets[sets.length - 1].set !== st.set) sets.push({ t, set: st.set });
      if (t % 60 === 0) perMin.push(st.live);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const a = buf.getChannelData(0), b = buf.getChannelData(1);
  let peak = 0, sum = 0, bad = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) { bad++; continue; }
    peak = Math.max(peak, Math.abs(a[i]), Math.abs(b[i]));
    sum += a[i] * a[i] + b[i] * b[i];
  }
  const rms = Math.sqrt(sum / (a.length * 2));
  const st = music.stats();
  console.log(JSON.stringify({ scene: id, seconds: dur, sampleRate: sr, renderMs: Date.now() - t0, notes: st.made,
    liveEachMinute: perMin, sets, peakDb: +db(peak), rmsDb: +db(rms), ...loudness([a, b], sr), invalidSamples: bad }));
  if (OUT) {
    const g = 0.89 / peak, n = buf.length, o = Buffer.alloc(44 + n * 4);
    o.write('RIFF', 0); o.writeUInt32LE(36 + n * 4, 4); o.write('WAVEfmt ', 8); o.writeUInt32LE(16, 16);
    o.writeUInt16LE(1, 20); o.writeUInt16LE(2, 22); o.writeUInt32LE(sr, 24); o.writeUInt32LE(sr * 4, 28);
    o.writeUInt16LE(4, 32); o.writeUInt16LE(16, 34); o.write('data', 36); o.writeUInt32LE(n * 4, 40);
    for (let i = 0; i < n; i++) {
      o.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(a[i] * g * 32767))), 44 + i * 4);
      o.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(b[i] * g * 32767))), 46 + i * 4);
    }
    fs.writeFileSync(OUT, o);
  }
})().catch(e => { console.error(e); process.exit(1); });
