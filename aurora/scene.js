/* Aurora Drift: a slow glide over a frozen lake at night under folding curtains of
   aurora, with snow drifts on the ice, far mountains and a sky full of stars. The ice
   mirrors the sky. The curtains are a vertical extrusion of thin folds in a warped
   noise field, marched through their height for every pixel. */
InfiniteScene({
  id: 'aurora',
  title: 'Aurora Drift',
  subtitle: 'A frozen lake under the northern lights',
  speed: [0, 0, 0.9],
  period: [32768, 32768, 32768],   // every noise scale used repeats within 32768 units
  loops: [1170, 1830, 2950, 4130],
  scale: 0.5,
  musicGain: 1.55,
  bed: { color: 'pink', lp: [260, 950], level: 0.4, gain: 1.1, label: 'Wind' },
  music: {
    sets: [
      [40, 47, 52, 59, 62, 66, 71, 74, 78],   // E minor with the ninth
      [36, 43, 48, 59, 64, 66, 71, 74, 79],   // C major seventh with a raised fourth
      [43, 50, 55, 59, 62, 69, 71, 74, 81],   // G with the ninth
      [45, 52, 57, 60, 64, 67, 71, 76, 79],   // A minor ninth
    ],
    loops: [
      ['drone', 0, 71.3, 0.20, 0, 0],
      ['pad', 1, 47.9, 0.15, 0, -0.3],
      ['choir', 3, 53.3, 0.22, 0, -0.4],
      ['choir', 4, 61.7, 0.18, 0.2, 0.45],
      ['bell', 6, 17.9, 0.15, 0.35, 0.5],
      ['bell', 7, 23.3, 0.14, 0.3, -0.5],
      ['bell', 8, 29.9, 0.11, 0.4, 0.1],
      ['piano', 5, 37.7, 0.24, 0.3, -0.2],
      ['bell', 5, 41.3, 0.11, 0.25, 0.3, { oct: 12 }],
    ],
    first: 7,
    hall: { secs: 8, decay: 2.6, bright: 0.9, dark: 0.8, wet: 0.9, dry: 0.4 },
    echo: { l: 1.73, r: 2.57, fb: 0.42, send: 0.3, lp: 1700 },
    tone: 5200,
    wow: [[0.09, 3], [0.037, 2]],
  },
  frag: `
const float FOV = 1.25;
const float BASE = 6.0, TOP = 30.0;     // the curtains' lower edge and top, in units

// Thin folds where a warped noise field crosses its middle, with fine vertical rays.
// wid widens the folds and calms the rays where the samples along a ray lie far
// apart, as they do near the horizon, so the glow there is smooth instead of grainy.
// Dividing by wid keeps the total light of a fold the same.
float field(vec2 xz, vec2 warp, float wid) {
  vec2 q = xz / 64.0;
  float n = fbm2(q + 1.8 * (warp - 0.5) + loop2(uLoop.x, 0.35), 3);
  float a1 = (n - 0.5) / (0.03 * wid), a2 = (n - 0.37) / (0.018 * wid);   // squared by hand: pow() of a negative number is undefined
  float band = (exp(-a1 * a1) + 0.45 * exp(-a2 * a2)) / wid;
  float rays = 0.4 + 0.6 * mix(0.5, noise2(q * 32.0 + loop2(uLoop.y, 6.0)), 1.0 / wid);
  return band * rays;
}
vec2 warpAt(vec2 xz) {
  vec2 q = xz / 64.0;
  return vec2(fbm2(q * 0.5 + loop2(uLoop.y, 1.3), 3), fbm2(q * 0.5 + vec2(5.2, 1.3) + loop2(uLoop.z, 1.1), 3));
}
// blur widens the folds further, for the reflection in the rough ice.
vec3 aurora(vec3 ro, vec3 rd, int steps, float jit, float blur) {
  if (rd.y < 0.004) return vec3(0.0);
  vec3 pm = ro + rd * ((0.5 * (BASE + TOP) - ro.y) / rd.y);
  vec2 warp = warpAt(pm.xz);
  // ground distance between two samples; past five units the folds start to widen
  float gap = (TOP - BASE) / float(steps) * length(rd.xz) / rd.y;
  float wid = max(1.0, gap / 5.0) * blur;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    if (i >= steps) break;
    float hf = (float(i) + jit) / float(steps);
    float h = BASE + (TOP - BASE) * hf;
    vec3 p = ro + rd * ((h - ro.y) / rd.y);
    float k = field(p.xz, warp, wid) * exp(-hf * 2.4) * smoothstep(0.0, 0.05, hf);
    vec3 c = mix(vec3(0.10, 1.00, 0.42), vec3(0.62, 0.22, 1.00), smoothstep(0.18, 0.9, hf));
    acc += c * k;
  }
  float breathe = 0.75 + 0.25 * sin(TAU * uLoop.w);
  return acc * (3.6 / float(steps)) * breathe * smoothstep(0.004, 0.09, rd.y);
}
float ridge(vec3 rd) {   // far mountains, as a height above the horizon
  float az = atan(rd.x, rd.z) / TAU;
  float m = fbm2(vec2(az * 32.0, 4.5), 4);
  return 0.008 + 0.075 * m * m * m;
}
vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.0);
  return mix(vec3(0.020, 0.032, 0.060), vec3(0.002, 0.005, 0.016), pow(y, 0.45));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float pxA = 1.0 / (uRes.y * FOV);
  float yaw = 0.08 * sin(TAU * uLoop.z) + 0.14 * uLook.x;
  float pitch = 0.17 + 0.03 * sin(TAU * uLoop.w) - 0.07 * uLook.y;
  vec3 rd = viewRay(frag, FOV, yaw, pitch);
  vec3 ro = vec3(9.0 * sin(TAU * uLoop.z), 1.7, uCam.z);
  float jit = hash31(vec3(frag, 7.0));
  vec3 glow = aurora(ro, normalize(vec3(0.1, 1.0, 0.6)), 4, 0.5, 1.0);   // light the aurora casts on the ground
  vec3 horizon = vec3(0.016, 0.030, 0.048) + glow * 0.35;
  vec3 col;
  if (rd.y >= 0.0) {
    float r = ridge(rd);
    if (rd.y < r) {
      float rim = smoothstep(r - 0.006, r, rd.y);
      col = mix(vec3(0.004, 0.008, 0.014), vec3(0.020, 0.045, 0.050) + glow * 0.25, rim * 0.7);
    } else {
      col = sky(rd) + starsAt(rd, 230.0, 0.10, pxA) * smoothstep(0.0, 0.12, rd.y);
      col += aurora(ro, rd, 24, jit, 1.0);
    }
    col = mix(col, horizon, exp(-max(rd.y, 0.0) * 55.0) * 0.7);
  } else {
    float t = -ro.y / rd.y;
    vec3 p = ro + rd * t;
    vec2 g = p.xz;
    float snow = smoothstep(0.46, 0.64, fbm2(g / 8.0 + 3.0, 4));
    float n0 = fbm2(g * 0.5, 2), n1 = fbm2(g * 0.5 + vec2(0.06, 0.0), 2), n2 = fbm2(g * 0.5 + vec2(0.0, 0.06), 2);
    float nk = 0.5 * exp(-t / 45.0);   // far ice reads as smooth; its bumps would only sparkle
    vec3 nrm = normalize(vec3((n0 - n1) * nk, 1.0, (n0 - n2) * nk));
    vec3 rr = reflect(rd, nrm);
    rr.y = abs(rr.y);
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, nrm), 0.0), 5.0);
    vec3 refl;
    float rgr = ridge(rr);
    if (rr.y < rgr) refl = vec3(0.004, 0.008, 0.014);
    else refl = sky(rr) + aurora(p, rr, 10, jit, 1.5) + starsAt(rr, 230.0, 0.10, pxA) * 0.5;
    vec3 ice = vec3(0.002, 0.006, 0.010) + refl * (0.22 + 0.78 * fres);
    vec3 drift = vec3(0.020, 0.030, 0.046) + glow * (0.18 + 0.18 * nrm.y);
    col = mix(ice, drift, snow * smoothstep(250.0, 40.0, t));
    col = mix(col, horizon, 1.0 - exp(-t * 0.005));
  }
  fragColor = finish(col * 1.15);
}
`,
});
