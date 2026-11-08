// Integrated loudness (LUFS, ITU-R BS.1770): K-weighting, 400 ms blocks with 75%
// overlap, the absolute gate at -70 LUFS and the relative gate 10 LU down. The scenes'
// music is matched with it, because plain RMS overrates music with a lot of low bass.
//
//   node tools/loudness.cjs <file.wav>      (16-bit PCM)
function biquad(b, a, x) {
  const y = new Float32Array(x.length), b0 = b[0] / a[0], b1 = b[1] / a[0], b2 = b[2] / a[0], a1 = a[1] / a[0], a2 = a[2] / a[0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}
function kWeight(x, fs) {
  let w = 2 * Math.PI * 1681.974450955533 / fs, c = Math.cos(w), al = Math.sin(w) / (2 * 0.7071752369554193);
  const A = Math.pow(10, 3.99984385397 / 40), sA = Math.sqrt(A);
  const s = biquad([A * ((A + 1) + (A - 1) * c + 2 * sA * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * sA * al)],
    [(A + 1) - (A - 1) * c + 2 * sA * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * sA * al], x);
  w = 2 * Math.PI * 38.13547087613982 / fs; c = Math.cos(w); al = Math.sin(w) / (2 * 0.5003270373253953);
  return biquad([(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al], s);
}
// Returns { lufs, maxShort }: the integrated loudness and the loudest 3-second window.
function loudness(chans, fs) {
  const k = chans.map(x => kWeight(x, fs)), n = k[0].length;
  const cum = new Float64Array(n + 1);   // running sum of squares over all channels
  for (let i = 0; i < n; i++) { let s = 0; for (const c of k) s += c[i] * c[i]; cum[i + 1] = cum[i] + s; }
  const L = m => -0.691 + 10 * Math.log10(m), mean = a => a.reduce((s, m) => s + m, 0) / a.length;
  const blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs), z = [];
  for (let s = 0; s + blk <= n; s += hop) z.push((cum[s + blk] - cum[s]) / blk);
  const g1 = z.filter(m => m > 0 && L(m) > -70);
  if (!g1.length) return { lufs: -Infinity, maxShort: -Infinity };
  const rel = L(mean(g1)) - 10, g2 = g1.filter(m => L(m) > rel);
  let top = 0;
  for (let s = 0, w = 3 * fs; s + w <= n; s += fs) top = Math.max(top, (cum[s + w] - cum[s]) / w);
  return { lufs: +L(mean(g2)).toFixed(1), maxShort: +L(top).toFixed(1) };
}
module.exports = { loudness };

if (require.main === module) {
  const buf = require('fs').readFileSync(process.argv[2]);
  let p = 12, fs = 0, ch = 0, bits = 0, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), sz = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') { ch = buf.readUInt16LE(p + 10); fs = buf.readUInt32LE(p + 12); bits = buf.readUInt16LE(p + 22); }
    if (id === 'data') { data = buf.subarray(p + 8, p + 8 + sz); break; }
    p += 8 + sz + (sz & 1);
  }
  if (bits !== 16 || !data) { console.error('16-bit PCM WAV only'); process.exit(2); }
  const n = Math.floor(data.length / (2 * ch)), chans = Array.from({ length: ch }, () => new Float32Array(n));
  let sum = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = data.readInt16LE((i * ch + c) * 2) / 32768; chans[c][i] = v; sum += v * v; }
  console.log(JSON.stringify({ file: process.argv[2], sampleRate: fs, seconds: +(n / fs).toFixed(1), rmsDb: +(10 * Math.log10(sum / (n * ch))).toFixed(1), ...loudness(chans, fs) }));
}
