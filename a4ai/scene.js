/* A4AI Sky Field: the A4AI logo as a tall sky-blue metal monument in a green field,
   under clouds that never stop drifting. One day passes in about twenty minutes:
   morning, noon, a warm evening, then a night of stars in which the logo lights up.
   The logo is exact: its symbol is circles and bars, its letters are the polygons of
   the vector logo, both measured in millimetres of the artwork and extruded into a slab.
   The clouds are a marched slab of noise, lit by one extra sample towards the sun. */
InfiniteScene({
  id: 'a4ai',
  title: 'A4AI Sky Field',
  subtitle: 'The A4AI logo under drifting clouds',
  speed: [3.2, 0, 1.1],             // wind: how far the clouds travel each second
  period: [32768, 32768, 32768],
  loops: [1230, 1790, 2890, 4210],  // day, cloud cover, camera sway, breathing
  scale: 0.5,
  musicGain: 1.0,
  bed: { color: 'pink', lp: [240, 900], level: 0.3, gain: 0.9, label: 'Wind' },
  frag: `
const float FOV = 1.12;
const float K = 0.6;                    // metres per millimetre of the logo artwork
const float ZL = 150.0, TH = 9.0;       // the slab: distance from the camera path, half thickness
const float CB = 240.0, CT = 860.0;     // cloud base and top
const vec2 HUB = vec2(-7.15, 87.16);    // symbol centre, mm (x from the wordmark centre, y up from its foot)
const float HUB_R = 11.75, NODE_R = 7.13, SPOKE = 2.2875;
const vec2 NODE[8] = vec2[8](vec2(40.54, 0.0), vec2(33.375, 33.375), vec2(0.0, 23.7), vec2(-26.304, 26.304),
                             vec2(-26.26, 0.0), vec2(-26.255, -26.255), vec2(0.0, -33.46), vec2(21.56, -21.56));
const vec2 PA[11] = vec2[11](vec2(-50.03, 0.0), vec2(-37.13, 33.57), vec2(-30.23, 33.57), vec2(-17.33, 0.0), vec2(-23.46, 0.0),
                             vec2(-26.43, 7.74), vec2(-40.93, 7.74), vec2(-43.90, 0.0), vec2(0.0), vec2(0.0), vec2(0.0));
const vec2 HA[11] = vec2[11](vec2(-38.80, 13.28), vec2(-28.56, 13.28), vec2(-33.68, 26.59), vec2(0.0), vec2(0.0), vec2(0.0),
                             vec2(0.0), vec2(0.0), vec2(0.0), vec2(0.0), vec2(0.0));
const vec2 P4[11] = vec2[11](vec2(-1.74, 33.57), vec2(4.19, 33.57), vec2(4.19, 10.29), vec2(7.89, 10.29), vec2(7.89, 4.67),
                             vec2(4.19, 4.67), vec2(4.19, 0.0), vec2(-1.60, 0.0), vec2(-1.60, 4.67), vec2(-16.92, 4.67), vec2(-16.92, 10.29));
const vec2 H4[11] = vec2[11](vec2(-10.50, 10.29), vec2(-1.60, 10.29), vec2(-1.60, 23.95), vec2(0.0), vec2(0.0), vec2(0.0),
                             vec2(0.0), vec2(0.0), vec2(0.0), vec2(0.0), vec2(0.0));

float sdPoly(vec2 p, vec2 v[11], int n) {
  float d = dot(p - v[0], p - v[0]), s = 1.0;
  for (int i = 0, j = n - 1; i < n; j = i, i++) {
    vec2 e = v[j] - v[i], w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}
float sdSeg(vec2 p, vec2 b) { return length(p - b * clamp(dot(p, b) / dot(b, b), 0.0, 1.0)); }
float sdLetterA(vec2 p) { return max(sdPoly(p, PA, 8), -sdPoly(p, HA, 3)); }
// The logo in its own plane, in millimetres. Negative inside.
float logoPart(vec2 p, bool word) {
  float d = 1e3;
  if (word) {
    d = min(sdLetterA(p), sdLetterA(p - vec2(58.09, 0.0)));
    d = min(d, max(sdPoly(p, P4, 11), -sdPoly(p, H4, 3)));
    vec2 q = abs(p - vec2(46.95, 16.785)) - vec2(3.09, 16.785);
    d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  } else {
    vec2 q = p - HUB;
    d = length(q) - HUB_R;
    for (int i = 0; i < 8; i++) d = min(d, min(length(q - NODE[i]) - NODE_R, sdSeg(q, NODE[i]) - SPOKE));
  }
  return d;
}
float logo2(vec2 p) { return logoPart(p, p.y < 40.0); }
float logoBoth(vec2 p) { return min(logoPart(p, true), logoPart(p, false)); }
float slab(vec3 p) {
  vec2 w = vec2(logo2(p.xy / K) * K, abs(p.z - ZL) - TH);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.25;
}

// ---- sky
vec3 sunDir(float day) {
  float el = 0.24 + 0.52 * sin(TAU * day);                 // above the horizon for about two thirds of the day
  float az = 2.35 + 0.5 * sin(TAU * day + 1.0);
  return normalize(vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)));
}
vec3 skyCol(vec3 rd, vec3 sun, float dayk, float dusk) {
  float y = max(rd.y, 0.0);
  vec3 zen = mix(vec3(0.004, 0.008, 0.022), vec3(0.045, 0.21, 0.70), dayk);
  vec3 hor = mix(vec3(0.016, 0.026, 0.052), vec3(0.42, 0.68, 0.97), dayk);
  hor = mix(hor, vec3(1.0, 0.52, 0.24), dusk * 0.75);
  vec3 c = mix(hor, zen, pow(y, 0.55));
  float sd = max(dot(rd, sun), 0.0);
  c += mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.95, 0.85), dayk) * (0.35 * pow(sd, 12.0) + 2.5 * pow(sd, 700.0)) * smoothstep(-0.08, 0.05, sun.y);
  return c;
}
float cloudDensity(vec3 p, float cover) {
  float h = (p.y - CB) / (CT - CB);
  vec2 g = p.xz + uCam.xz;
  float big = smoothstep(0.50, 0.74, fbm2(g / 2048.0, 4) + cover);      // where a cloud stands, and how tall it grows
  float top = mix(0.30, 1.0, big);
  float prof = smoothstep(0.0, 0.07, h) * smoothstep(top, top * 0.45, h);
  float n = fbm3(vec3(g / 256.0, p.y / 210.0 + uLoop.w * 2.0), 5);
  return clamp((big * 0.66 + n * 0.60 - 0.86) * prof * 7.0, 0.0, 1.0);
}
// rgb = light scattered towards the eye, a = what is left of the sky behind
vec4 clouds(vec3 ro, vec3 rd, vec3 sun, vec3 sunCol, vec3 amb, float cover, float jit, int steps) {
  if (rd.y < 0.02) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0 = (CB - ro.y) / rd.y, t1 = (CT - ro.y) / rd.y;
  float dt = (t1 - t0) / float(steps), tr = 1.0;
  float silver = 1.0 + 1.3 * pow(max(dot(rd, sun), 0.0), 6.0);          // bright edges towards the sun
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 28; i++) {
    if (i >= steps || tr < 0.03) break;
    vec3 p = ro + rd * (t0 + dt * (float(i) + jit));
    float d = cloudDensity(p, cover);
    if (d > 0.005) {
      float shade = exp(-1.2 * cloudDensity(p + sun * 45.0, cover) - 0.9 * cloudDensity(p + sun * 130.0, cover) - 0.5 * d);
      float h = (p.y - CB) / (CT - CB);
      vec3 lit = sunCol * shade * 1.5 * silver + amb * (0.42 + 0.50 * h);
      float a = 1.0 - exp(-d * dt * 0.03);
      acc += tr * a * lit; tr *= 1.0 - a;
    }
  }
  float far = exp(-t0 * 0.00016);                          // far clouds fade into the horizon haze
  return vec4(acc * far, 1.0 - (1.0 - tr) * far);
}
float ridge(vec3 rd) {
  float az = atan(rd.x, rd.z) / TAU;
  float m = fbm2(vec2(az * 28.0, 2.5), 4);
  return 0.012 + 0.07 * m * m;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float pxA = 1.0 / (uRes.y * FOV);
  float day = uLoop.x;
  vec3 sun = sunDir(day);
  float dayk = smoothstep(-0.12, 0.22, sun.y);                               // 0 at night, 1 by day
  float dusk = smoothstep(0.32, 0.02, sun.y) * smoothstep(-0.2, 0.0, sun.y); // warm light near the horizon
  vec3 sunCol = mix(vec3(1.0, 0.50, 0.22), vec3(1.0, 0.96, 0.88), smoothstep(0.0, 0.35, sun.y)) * dayk;
  vec3 moon = normalize(vec3(-0.45, 0.55, 0.7));
  vec3 keyDir = dayk > 0.02 ? sun : moon;
  vec3 keyCol = sunCol + vec3(0.10, 0.14, 0.24) * (1.0 - dayk);
  vec3 amb = mix(vec3(0.020, 0.030, 0.060), vec3(0.50, 0.66, 0.92), dayk) + vec3(0.35, 0.16, 0.06) * dusk;
  float cover = 0.0 + 0.05 * sin(TAU * uLoop.y);

  // the camera stays in the field in front of the logo and sways slowly from side to side
  vec3 ro = vec3(30.0 * sin(TAU * uLoop.z), 1.5 + 0.4 * sin(TAU * uLoop.w), 0.0);
  float yaw = atan(-ro.x, ZL) * 0.85 + 0.10 * uLook.x;
  float pitch = (uRes.x > uRes.y ? 0.20 : 0.27) + 0.012 * sin(TAU * uLoop.w * 2.0) - 0.06 * uLook.y;
  vec3 rd = viewRay(frag, FOV, yaw, pitch);
  float jit = fract(ign(frag) + mod(uFrame, 16.0) * 0.61803);
  float glowk = 1.0 - dayk;                                                  // the lamps of the logo come on at night
  float turn = TAU * uTime / 600.0;                                          // closes after the 600 s wrap of uTime
  vec3 horizon = skyCol(normalize(vec3(rd.x, 0.02, rd.z)), sun, dayk, dusk);

  // ---- the logo: march only through its bounding box
  float tHit = -1.0;
  vec3 lo = vec3(-33.0, -1.0, ZL - TH - 0.5), hi = vec3(33.0, 78.5, ZL + TH + 0.5);
  vec3 ta = (lo - ro) / rd, tb = (hi - ro) / rd;
  vec3 tmn = min(ta, tb), tmx = max(ta, tb);
  float tn = max(max(tmn.x, tmn.y), tmn.z), tf = min(min(tmx.x, tmx.y), tmx.z);
  if (tf > max(tn, 0.0)) {
    float t = max(tn, 0.0);
    for (int i = 0; i < 56; i++) {
      float d = slab(ro + rd * t);
      if (d < 0.02) { tHit = t; break; }
      t += d;
      if (t > tf) break;
    }
  }

  vec3 col;
  if (tHit > 0.0) {
    vec3 p = ro + rd * tHit;
    vec2 e = vec2(0.03, 0.0);
    vec3 n = normalize(vec3(slab(p + e.xyy) - slab(p - e.xyy), slab(p + e.yxy) - slab(p - e.yxy), slab(p + e.yyx) - slab(p - e.yyx)));
    vec2 m = p.xy / K;
    float d2 = logo2(m);
    float face = smoothstep(0.6, 0.9, -n.z);                                 // the front of the slab
    float seam = smoothstep(0.03, 0.0, abs(fract(m.y / 6.5) - 0.5) - 0.47) * face;   // thin joints between the plates
    float bevel = smoothstep(-1.2, -0.1, d2) * face;                         // the bright chamfer along the outline
    vec3 r = reflect(rd, n);
    float ry = r.y;
    r.y = abs(r.y);
    vec3 env = skyCol(r, sun, dayk, dusk);
    vec4 cl = clouds(p, r, sun, sunCol, amb, cover, 0.5, 8);
    env = env * cl.a + cl.rgb;
    env = mix(env, vec3(0.05, 0.16, 0.03) * (0.2 + dayk), smoothstep(0.05, -0.3, ry));   // the field below
    float ndv = max(dot(-rd, n), 0.0), ndl = max(dot(n, keyDir), 0.0);
    float F = mix(0.16, 1.0, pow(1.0 - ndv, 5.0));
    vec3 tint = mix(vec3(0.025, 0.13, 0.36), vec3(0.10, 0.45, 0.92), face); // deep blue sides, sky-blue front
    col = tint * (keyCol * ndl * 0.95 + amb * 0.55) * (1.0 - 0.6 * F) + env * F * (0.55 + 0.45 * face);
    col *= 1.0 - 0.20 * seam;
    col += keyCol * bevel * 0.30 * (0.3 + ndl) + keyCol * pow(max(dot(r, keyDir), 0.0), 90.0) * 0.8;
    // at night a thin line of light runs round the outline and a lamp glows in every round part
    vec3 lampCol = vec3(0.35, 0.78, 1.0);
    float lamp = 0.0;
    if (m.y > 40.0) {
      vec2 q = m - HUB;
      float rn = length(q) * 0.72;
      for (int i = 0; i < 8; i++) rn = min(rn, length(q - NODE[i]));
      lamp = smoothstep(2.7, 2.1, rn);
    }
    float pulse = 0.7 + 0.3 * sin(turn * 5.0 + m.x * 0.08);
    col += lampCol * lamp * face * (0.06 + 2.2 * glowk) * pulse;
    col += lampCol * smoothstep(0.5, 0.0, abs(d2 + 0.9)) * face * 1.5 * glowk;
    col = mix(col, horizon, 1.0 - exp(-tHit * 0.0005));
  } else if (rd.y >= 0.0) {
    float rg = ridge(rd);
    if (rd.y < rg) {
      col = mix(vec3(0.03, 0.10, 0.04) * (0.18 + dayk), horizon, 0.62);
    } else {
      col = skyCol(rd, sun, dayk, dusk);
      col += starsAt(rd, 210.0, 0.10, pxA) * glowk * smoothstep(0.0, 0.15, rd.y);
      vec4 cl = clouds(ro, rd, sun, sunCol, amb, cover, jit, 22);
      col = col * cl.a + cl.rgb;
    }
    if (glowk > 0.02 && rd.z > 0.01) {                                       // a soft halo round the lit logo at night
      vec3 ph = ro + rd * ((ZL - ro.z) / rd.z);
      col += vec3(0.35, 0.78, 1.0) * glowk * 0.22 * exp(-max(logoBoth(ph.xy / K), 0.0) / 6.0);
    }
    col = mix(col, horizon, exp(-max(rd.y, 0.0) * 42.0) * 0.30);
  } else {
    float t = -ro.y / rd.y;
    vec3 p = ro + rd * t;
    vec2 g = p.xz + vec2(0.0, 2000.0);
    float tuft = fbm2(g / 24.0, 4);
    float blades = noise2(g * vec2(7.0, 1.3) + loop2(uLoop.w, 0.6)) * exp(-t / 55.0);
    float wind = fbm2((g + uCam.xz * 2.5) / 40.0, 2);                       // lighter bands that move across the field
    vec3 grass = mix(vec3(0.022, 0.085, 0.012), vec3(0.11, 0.30, 0.035), tuft);
    grass *= 0.72 + 0.5 * blades + 0.35 * smoothstep(0.52, 0.75, wind);
    vec3 flowers = vec3(0.95, 0.95, 0.85) * step(0.985, noise2(g * 2.3)) * exp(-t / 60.0);
    float shadow = cloudDensity(vec3(p.xz, CB + 90.0).xzy + sun * (CB / max(sun.y, 0.25)), cover);
    float light = (0.30 + 0.95 * max(sun.y, 0.0) * (1.0 - 0.6 * shadow)) * dayk + 0.035;
    col = (grass + flowers * 0.5) * (keyCol * light + amb * 0.30);
    // the foot of the logo: a soft dark contact, and at night a pool of its light
    vec2 foot = vec2(max(abs(p.x) - 30.0, 0.0), max(abs(p.z - ZL) - TH, 0.0));
    float fd = length(foot);
    col *= 0.55 + 0.45 * smoothstep(0.0, 16.0, fd);
    col += vec3(0.05, 0.16, 0.26) * glowk * exp(-fd / 22.0) * (0.5 + tuft);
    col = mix(col, horizon, 1.0 - exp(-t * 0.0017));
  }
  // one person in the field, for scale
  vec2 px = vec2(-15.0, ZL - 36.0);
  float tp = dot(px - ro.xz, rd.xz) / dot(rd.xz, rd.xz);
  if (tp > 0.0 && (tHit < 0.0 || tp < tHit)) {
    vec3 pp = ro + rd * tp;
    float dx = length(pp.xz - px);
    bool inside = (pp.y > 0.0 && pp.y < 1.48 && dx < 0.23) || length(vec2(dx, pp.y - 1.64)) < 0.15;
    if (inside) col = mix(col, vec3(0.012, 0.016, 0.028) + amb * 0.03, 0.94);
  }
  fragColor = finish(pow(col, vec3(1.06)) * 1.05);
}
`,
});
