/* Abyss: an endless drift through deep water. Faint shafts of light fall from far
   above, marine snow streams past in many layers, and soft glowing jellies pulse in
   the dark. Particles and jellies sit on planes facing the camera; as the camera
   moves forward each plane passes and a new one appears far ahead. */
InfiniteScene({
  id: 'abyss',
  title: 'Abyss',
  subtitle: 'Drifting through the deep sea',
  speed: [0, 0, 0.45],
  period: [4800, 4800, 4800],   // a whole number of particle and jelly planes
  loops: [890, 1410, 2270, 3610],
  scale: 0.65,
  musicGain: 1.3,
  bed: { color: 'brown', lp: [110, 360], level: 0.45, gain: 1.4, label: 'Water' },
  music: {
    sets: [
      [33, 40, 45, 52, 57, 60, 64, 69, 76],   // A minor
      [29, 36, 41, 48, 53, 57, 59, 64, 72],   // F with a raised fourth
      [26, 38, 45, 50, 53, 57, 60, 64, 69],   // D minor ninth
      [24, 36, 43, 48, 52, 55, 59, 62, 67],   // C major ninth
    ],
    loops: [
      ['drone', 0, 83.1, 0.18, 0, 0],
      ['drone', 1, 97.3, 0.09, 0, 0.3],
      ['pad', 2, 55.1, 0.13, 0, -0.3],
      ['glide', 5, 37.3, 0.16, 0.45, -0.5],
      ['glide', 6, 49.7, 0.12, 0.5, 0.55],
      ['ping', 8, 21.7, 0.10, 0.35, 0.3],
      ['choir', 3, 61.9, 0.16, 0.1, 0.2],
      ['piano', 7, 31.3, 0.16, 0.4, -0.25],
      ['ping', 7, 43.9, 0.07, 0.5, -0.6],
    ],
    first: 7,
    hall: { secs: 9, decay: 3.0, bright: 0.6, dark: 0.55, wet: 0.95, dry: 0.35 },
    echo: { l: 2.31, r: 3.47, fb: 0.48, send: 0.25, lp: 900 },
    tone: 2600,
    wow: [[0.07, 6], [0.029, 4]],
  },
  frag: `
const float FOV = 1.2;
const float SP = 1.6;     // spacing of marine-snow planes (4800 / 1.6 = 3000 planes)
const float JP = 6.0;     // spacing of jelly planes (800 planes)
const vec3 LIGHT = vec3(0.18, 0.95, 0.25);

vec3 water(vec3 rd) {
  float up = rd.y;
  vec3 deep = vec3(0.000, 0.002, 0.006), mid = vec3(0.002, 0.020, 0.040), high = vec3(0.010, 0.075, 0.105);
  vec3 c = mix(deep, mid, smoothstep(-0.6, 0.15, up));
  c = mix(c, high, smoothstep(0.15, 0.95, up));
  // shafts of light converging on the surface far above
  vec3 L = normalize(LIGHT);
  float cl = dot(rd, L);
  vec3 a = normalize(cross(L, vec3(0.0, 0.0, 1.0))), b = cross(L, a);
  float ang = atan(dot(rd, b), dot(rd, a)) / TAU;
  float sh = fbm2(vec2(ang * 48.0, 0.0) + loop2(uLoop.x, 2.5), 3);
  sh = pow(smoothstep(0.35, 0.85, sh), 2.0);
  c += vec3(0.06, 0.26, 0.30) * sh * pow(max(cl, 0.0), 2.0) * (0.75 + 0.25 * sin(TAU * uLoop.w));
  c += vec3(0.02, 0.09, 0.10) * pow(max(cl, 0.0), 12.0);
  return c;
}
// One plane of particles at distance z ahead: soft dots, one per cell at most.
vec3 snowPlane(vec3 rd, float z, float idx, float pxA) {
  vec2 pt = rd.xy * (z / rd.z) + vec2(0.0, uLoop.x * 64.0 * 0.5);   // falling slowly, 64 cells per loop
  float cell = 0.5;
  vec2 c = floor(pt / cell), f = pt / cell - c;
  vec3 h = hash33(vec3(c, mod(idx, 3000.0)));
  if (h.z > 0.14) return vec3(0.0);
  vec2 o = 0.2 + 0.6 * h.xy;
  float r = (0.006 + 0.012 * h.x) / cell;
  float px = pxA * z / cell * 1.2;
  float w = max(r, px);
  float d = length(f - o);
  float k = exp(-d * d / (w * w)) * (r * r) / (w * w);
  return vec3(0.45, 0.62, 0.70) * k * (0.3 + 0.7 * h.y);
}
// One plane of jellies: a soft glowing bell with trailing threads, pulsing slowly.
vec3 jellyPlane(vec3 rd, float z, float idx) {
  vec2 pt = rd.xy * (z / rd.z);
  float cell = 7.0;
  vec2 c = floor(pt / cell), f = pt / cell - c;
  vec3 h = hash33(vec3(c + 11.0, mod(idx, 800.0)));
  if (h.z > 0.16) return vec3(0.0);
  vec2 o = vec2(0.3 + 0.4 * h.x, 0.45 + 0.25 * h.y);
  float sz = (0.6 + 0.6 * h.y) / cell;
  // fade out before the cell's edge, so no glow is cut off by the next cell
  float edge = smoothstep(0.0, 0.1, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  vec2 q = (f - o) / sz;
  q.y += 0.15 * sin(TAU * (uLoop.z * 3.0 + h.x));
  float pulse = 0.55 + 0.45 * sin(TAU * (uLoop.y * 37.0 + h.x * 7.0));
  float bell = smoothstep(1.0, 0.55, length(q * vec2(1.0, 1.35 - 0.15 * pulse))) * step(-0.15, q.y);
  float rr = (length(q * vec2(1.0, 1.35)) - 0.92) / 0.08;   // squared by hand: pow() of a negative number is undefined
  float rim = exp(-rr * rr) * step(-0.1, q.y);
  float threads = 0.0;
  for (int i = 0; i < 4; i++) {
    float x0 = -0.55 + 0.37 * float(i);
    float wig = 0.08 * sin(q.y * 5.0 + TAU * (uLoop.z * 5.0 + h.y) + float(i));
    threads += exp(-abs(q.x - x0 - wig) * 40.0) * smoothstep(-2.4, -0.1, q.y) * step(q.y, -0.05) * (1.0 + q.y * 0.35);
  }
  float halo = exp(-dot(q, q) * 0.9) * 0.35;
  vec3 tint = mix(vec3(0.25, 0.85, 1.0), vec3(0.85, 0.40, 1.0), h.x);
  return tint * (bell * 0.35 + rim * 0.9 + threads * 0.35 + halo) * pulse * 1.6 * edge;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float pxA = 1.0 / (uRes.y * FOV);
  float yaw = 0.10 * sin(TAU * uLoop.z) + 0.12 * uLook.x;
  float pitch = 0.05 * sin(TAU * uLoop.w) - 0.07 * uLook.y;
  vec3 rd = viewRay(frag, FOV, yaw, pitch);
  vec3 col = water(rd);
  if (rd.z > 0.05) {
    // marine snow, near to far; nearer planes fade in from nothing as they approach
    float base = floor(uCam.z / SP), fr = fract(uCam.z / SP);
    for (int k = 0; k < 14; k++) {
      float z = (float(k) + 1.0 - fr) * SP;
      float fade = smoothstep(0.0, 1.2, z) * (1.0 - smoothstep(SP * 9.0, SP * 14.0, z));
      col += snowPlane(rd, z, base + float(k) + 1.0, pxA) * fade * exp(-z * 0.09);
    }
    float jb = floor(uCam.z / JP), jf = fract(uCam.z / JP);
    for (int k = 0; k < 7; k++) {
      float z = (float(k) + 1.0 - jf) * JP;
      float fade = smoothstep(0.0, 4.0, z) * (1.0 - smoothstep(JP * 4.5, JP * 7.0, z));
      col += jellyPlane(rd, z, jb + float(k) + 1.0) * fade * exp(-z * 0.05) * 0.9;
    }
  }
  fragColor = finish(col * 1.2);
}
`,
});
