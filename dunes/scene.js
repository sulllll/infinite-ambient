/* Dune Sea: a low flight over endless sand dunes at the golden hour. The sun hangs
   just above the horizon, rising and sinking a little over half an hour, so the
   light moves between gold and dusk. The dunes are a height field: long asymmetric
   ridges, gentle on the windward side and steep on the slip face, warped by noise
   and laid over broad swells, ray-marched for every pixel. */
InfiniteScene({
  id: 'dunes',
  title: 'Dune Sea',
  subtitle: 'Endless dunes at the golden hour',
  speed: [0, 0, 1.6],
  period: [32768, 32768, 32768],   // every noise scale and ridge used repeats within 32768 units
  loops: [1310, 2090, 2630, 1900],
  scale: 0.55,
  scaleMin: 0.3,
  gpuBudget: 8,   // the heaviest scene per pixel: a little more work per frame keeps it sharp
  musicGain: 2.6,
  bed: { color: 'pink', lp: [380, 1300], level: 0.35, gain: 1.0, label: 'Desert wind' },
  music: {
    sets: [
      [38, 45, 50, 57, 62, 64, 66, 69, 71],   // D with the sixth and ninth
      [35, 42, 47, 54, 59, 62, 66, 69, 73],   // B minor seventh
      [31, 38, 43, 50, 55, 59, 64, 67, 69],   // G with the sixth and ninth
      [33, 40, 45, 52, 57, 59, 62, 64, 69],   // A suspended
    ],
    loops: [
      ['drone', 0, 69.7, 0.20, 0, 0],
      ['pad', 2, 44.3, 0.15, 0, -0.3],
      ['pad', 3, 57.1, 0.11, 0.2, 0.35],
      ['pluck', 5, 13.7, 0.20, 0.45, 0.4],
      ['pluck', 6, 17.3, 0.18, 0.4, -0.45],
      ['pluck', 7, 19.9, 0.16, 0.5, 0.15],
      ['pluck', 8, 23.1, 0.14, 0.55, -0.1],
      ['piano', 4, 33.7, 0.22, 0.3, 0.2],
      ['choir', 4, 63.3, 0.14, 0.3, -0.15],
    ],
    first: 3,
    hall: { secs: 6, decay: 1.8, bright: 0.9, dark: 0.6, wet: 0.7, dry: 0.55 },
    echo: { l: 0.91, r: 1.43, fb: 0.35, send: 0.28, lp: 2200 },
    tone: 5500,
    wow: [[0.12, 4], [0.05, 2]],
  },
  frag: `
const float FOV = 1.35;
const float FAR = 340.0;

vec3 sunDir() {
  float e = 0.045 + 0.075 * (0.5 + 0.5 * sin(TAU * uLoop.w));   // elevation in radians
  float az = -0.30 + 0.06 * sin(TAU * uLoop.z);
  return normalize(vec3(sin(az) * cos(e), sin(e), cos(az) * cos(e)));
}
// Height of the sand at (x, z). Ridges cross the path diagonally; z / 16 keeps them
// whole over the world period.
float sand(vec2 p, int oct) {
  vec2 q = p / 32.0;
  float w = fbm2(q * 0.5, 2);
  float u = p.x / 11.0 + p.y / 16.0 + 2.3 * w;
  float f = fract(u);
  float s = f < 0.72 ? f / 0.72 : (1.0 - f) / 0.28;
  float crest = s * s * (3.0 - 2.0 * s);
  float amp = 0.5 + 0.5 * noise2(q + 3.1);
  return 2.7 * crest * amp + 3.4 * fbm2(q * 0.25 + 7.7, oct);
}
float march(vec3 ro, vec3 rd, float jit) {
  float t = 0.6 + 0.3 * jit, prev = 0.0;
  for (int i = 0; i < 128; i++) {
    vec3 p = ro + rd * t;
    float d = p.y - sand(p.xz, 3);
    if (d < 0.002 * t) {
      float a = prev, b = t;   // refine between the last two samples
      for (int j = 0; j < 5; j++) { float m = 0.5 * (a + b); vec3 pm = ro + rd * m; if (pm.y - sand(pm.xz, 3) < 0.0) b = m; else a = m; }
      return b;
    }
    if (p.y > 7.5 && rd.y > 0.0) return -1.0;
    prev = t;
    // Slip faces slope up to about 1.6, so near the camera a third of the height gap
    // cannot jump a crest. Far away the steps grow, to save the budget.
    t += max(0.05 + 0.004 * t, d * mix(0.32, 0.7, smoothstep(40.0, 200.0, t)));
    if (t > FAR) return -1.0;
  }
  return t;   // out of steps: the ray is skimming the sand, so shade the sand where it is
}
vec3 skyCol(vec3 rd, vec3 sd) {
  float y = max(rd.y, 0.0), e = sd.y;
  float dusk = smoothstep(0.12, 0.04, e);
  vec3 zen = mix(vec3(0.06, 0.12, 0.30), vec3(0.05, 0.05, 0.18), dusk);
  vec3 hor = mix(vec3(0.95, 0.45, 0.18), vec3(0.88, 0.32, 0.24), dusk);
  vec3 c = mix(hor, zen, pow(y, 0.4));
  float sv = max(dot(rd, sd), 0.0);
  c += vec3(1.0, 0.55, 0.25) * (0.45 * pow(sv, 8.0) + 0.35 * pow(sv, 64.0));
  c += vec3(1.0, 0.85, 0.6) * smoothstep(0.99984, 0.99993, sv) * 6.0;   // the sun's disc
  return c;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float yaw = 0.09 * sin(TAU * uLoop.z) + 0.14 * uLook.x;
  float pitch = -0.07 + 0.02 * sin(TAU * uLoop.y) - 0.06 * uLook.y;
  vec3 rd = viewRay(frag, FOV, yaw, pitch);
  vec3 ro = vec3(14.0 * sin(TAU * uLoop.z), 8.2 + 0.5 * sin(TAU * uLoop.x), uCam.z);
  vec3 sd = sunDir();
  vec3 sunC = vec3(1.0, 0.58, 0.28) * (2.6 + 1.0 * smoothstep(0.04, 0.12, sd.y));
  float jit = ign(frag);
  vec3 col = skyCol(rd, sd);
  float stars = smoothstep(0.08, 0.05, sd.y);
  if (stars > 0.0) col += starsAt(rd, 240.0, 0.4, 1.0 / (uRes.y * FOV)) * stars * smoothstep(0.15, 0.5, rd.y) * 0.8;
  float t = march(ro, rd, jit);
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    float e = 0.02 + 0.002 * t;
    float h0 = sand(p.xz, 5);
    vec3 n = normalize(vec3(h0 - sand(p.xz + vec2(e, 0.0), 5), e, h0 - sand(p.xz + vec2(0.0, e), 5)));
    // fine wind ripples, fading with distance
    float rip = sin(p.x * 3.4 + p.z * (TAU / 4.0) + 3.0 * noise2(p.xz * 0.5)) * smoothstep(60.0, 5.0, t);
    n = normalize(n + vec3(0.06 * rip, 0.0, 0.02 * rip));
    // soft shadow toward the sun
    float sh = 1.0, st = 0.4;
    for (int i = 0; i < 10; i++) {
      vec3 q = p + sd * st;
      sh = min(sh, 8.0 * (q.y - sand(q.xz, 2)) / st);
      st += 0.6 + st * 0.35;
      if (sh < 0.0 || q.y > 7.0) break;
    }
    sh = clamp(sh, 0.0, 1.0);
    float dif = clamp(dot(n, sd) * 0.9 + 0.1, 0.0, 1.0);
    vec3 alb = vec3(0.90, 0.52, 0.28) * (0.9 + 0.2 * noise2(p.xz * 0.125));
    vec3 amb = mix(vec3(0.10, 0.13, 0.28), vec3(0.22, 0.18, 0.22), 0.5 + 0.5 * n.y) * 0.6;
    col = alb * (sunC * dif * sh + amb);
    col += vec3(1.0, 0.7, 0.45) * pow(max(dot(reflect(rd, n), sd), 0.0), 24.0) * 0.15 * sh;
    vec3 fogc = skyCol(normalize(vec3(rd.x, 0.0, rd.z)), sd);   // the sky right at the horizon, so far sand meets it without a seam
    col = mix(col, fogc, max(1.0 - exp(-t * 0.0028), smoothstep(FAR * 0.55, FAR, t)));
  }
  fragColor = finish(col * 0.8);
}
`,
});
