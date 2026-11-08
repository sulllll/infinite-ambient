/* Nebula Drift: a slow flight through glowing clouds of gas between the stars. The
   nebula is a stack of thin sheets facing the camera, each a warped noise field with
   its own colour, composited near to far. As the camera moves forward each sheet
   passes and a new one fades in far ahead, so the parallax feels like depth. Far
   stars sit on the sky; nearer bright stars live on the sheets and drift past. */
InfiniteScene({
  id: 'nebula',
  title: 'Nebula Drift',
  subtitle: 'Through the clouds between the stars',
  speed: [0, 0, 0.8],
  period: [8192, 8192, 8192],   // a whole number of sheets (8192 / 4 = 2048)
  loops: [1530, 2410, 3190, 4470],
  scale: 0.5,
  musicGain: 1.1,
  music: {
    sets: [
      [41, 48, 53, 60, 64, 67, 71, 76, 79],   // F major seventh with a raised fourth
      [36, 43, 48, 55, 62, 64, 67, 74, 79],   // C with the ninth
      [33, 45, 52, 57, 59, 64, 71, 72, 76],   // A minor with the ninth
      [38, 45, 50, 57, 60, 64, 69, 72, 76],   // D minor ninth
    ],
    loops: [
      ['drone', 0, 79.1, 0.20, 0, 0],
      ['pad', 1, 51.3, 0.15, 0, -0.35],
      ['pad', 2, 63.7, 0.12, 0, 0.4],
      ['choir', 3, 45.7, 0.18, 0, 0.1],
      ['bell', 6, 19.3, 0.12, 0.4, 0.55],
      ['bell', 7, 27.1, 0.11, 0.4, -0.55],
      ['bell', 8, 31.9, 0.09, 0.5, 0],
      ['piano', 5, 39.1, 0.20, 0.3, -0.2],
      ['piano', 4, 47.3, 0.18, 0.35, 0.25],
    ],
    first: 7,
    hall: { secs: 10, decay: 3.4, bright: 0.9, dark: 0.7, wet: 1.0, dry: 0.3 },
    echo: { l: 1.91, r: 2.83, fb: 0.45, send: 0.3, lp: 1800 },
    tone: 6000,
    wow: [[0.08, 3], [0.031, 3]],
  },
  frag: `
const float FOV = 1.15;
const float SP = 4.0;      // distance between sheets
const int NS = 10;         // sheets in view

vec3 palette(float x) {   // deep violet, magenta, rose, teal
  vec3 a = vec3(0.45, 0.25, 0.55), b = vec3(0.45, 0.35, 0.40), c = vec3(1.0, 1.0, 1.0), d = vec3(0.00, 0.25, 0.55);
  return a + b * cos(TAU * (c * x + d));
}
vec4 sheet(vec3 rd, float z, float idx, float pxA) {
  vec3 h = hash33(vec3(mod(idx, 2048.0), 5.0, 9.0));
  vec2 pt = rd.xy * (z / rd.z);
  vec2 q = pt * 0.07 + h.xy * 180.0;
  vec2 w = vec2(fbm2(q * 0.5 + loop2(uLoop.x, 0.8), 2), fbm2(q * 0.5 + vec2(9.1, 2.7) + loop2(uLoop.y, 0.8), 2));
  vec2 qw = q + 2.4 * (w - 0.5);
  float d = fbm2(qw, 4);
  float gas = smoothstep(0.52, 0.84, d);
  // thin bright filaments along the ridges of a second field
  float rid = 1.0 - abs(2.0 * fbm2(qw * 2.0 + 13.0, 3) - 1.0);
  float fil = pow(rid, 6.0) * smoothstep(0.38, 0.6, d);
  // dark lanes of dust in front of the glow
  float dust = smoothstep(0.56, 0.64, fbm2(q * 2.0 + 4.0 * (w - 0.5) + 31.0, 3)) * smoothstep(0.3, 0.6, d);
  // pink through violet and blue to teal; the triangle wave keeps the colours continuous
  float hue = h.z + 0.35 * d + 0.08 * sin(TAU * uLoop.z);
  vec3 base = palette(0.62 * abs(fract(hue) * 2.0 - 1.0));
  vec3 c = base * (gas * (0.3 + 0.5 * w.x) + fil * 0.9) + vec3(1.0, 0.86, 0.92) * pow(gas, 3.0) * 0.12;
  c *= 1.0 - 0.85 * dust;
  // a few nearer stars on each sheet
  vec2 cell = floor(pt / 5.0), f = pt / 5.0 - cell;
  vec3 s = hash33(vec3(cell, mod(idx, 2048.0) + 4096.0));
  if (s.z < 0.07) {
    float r = max(pxA * z / 5.0 * 1.3, 0.004);
    float dd = length(f - (0.2 + 0.6 * s.xy));
    vec3 tint = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), s.y);
    c += tint * (exp(-dd * dd / (r * r)) * 3.0 + exp(-dd / (r * 6.0)) * 0.12) * (0.4 + 0.6 * s.x);
  }
  return vec4(c, gas * 0.3 + dust * 0.6);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float pxA = 1.0 / (uRes.y * FOV);
  float yaw = 0.12 * sin(TAU * uLoop.z) + 0.12 * uLook.x;
  float pitch = 0.08 * sin(TAU * uLoop.w) - 0.08 * uLook.y;
  vec3 rd = viewRay(frag, FOV, yaw, pitch);
  // a slow roll, so the clouds turn gently around the line of flight
  float roll = 0.12 * sin(TAU * uLoop.y);
  rd.xy = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * rd.xy;
  vec3 col = vec3(0.004, 0.003, 0.010) + 0.012 * vec3(0.4, 0.3, 0.8) * fbm2(rd.xy / max(rd.z, 0.2) * 1.5 + 50.0, 3);
  col += starsAt(rd, 300.0, 0.12, pxA) * 0.9;
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  if (rd.z > 0.05) {
    float base = floor(uCam.z / SP), fr = fract(uCam.z / SP);
    for (int k = 0; k < NS; k++) {
      float z = (float(k) + 1.0 - fr) * SP;
      float fade = smoothstep(0.3, SP * 1.6, z) * (1.0 - smoothstep(SP * (float(NS) - 3.0), SP * float(NS), z));
      if (fade < 0.01) continue;   // a sheet still fading in or out adds nothing
      vec4 s = sheet(rd, z, base + float(k) + 1.0, pxA);
      acc += trans * s.rgb * fade * 0.18;
      trans *= 1.0 - s.a * fade * 0.6;
    }
  }
  col = col * trans + acc;
  fragColor = finish(col * 1.1);
}
`,
});
