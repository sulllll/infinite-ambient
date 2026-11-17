// ============================================================================
// Infinite Ambient: settings, the settings panel and the keys
// ============================================================================
// The scene drifts on its own, as the other Infinite Ambient scenes do: G settings, F or a double-click full
// screen, S sound, Esc closes the settings. Enter (or the button in the settings) lets you swim freely as in the
// original Abyssal Garden; Esc goes back to the drift.
// URL options as in the other scenes: ?t=<seconds> ?scale=<0.2-1> ?fps=<15|30|60> ?mute ?nohint ?wallpaper ?shot
const URLQ = new URLSearchParams(location.search);
const IA_KEY = 'infinite-ambient:garden:v1';
const S = Object.assign({ sound: true, volume: 0.6, music: 0.7, effects: 0.6, bed: 0.5, fps: 30, quality: 0 },
  (() => { try { return JSON.parse(localStorage.getItem(IA_KEY) || '{}') || {}; } catch { return {}; } })());
if (URLQ.get('fps')) S.fps = +URLQ.get('fps') || 30;
const FIXED = URLQ.get('scale') ? Math.min(1, Math.max(0.2, +URLQ.get('scale') || 1)) : 0;
const MUTE = URLQ.has('mute'), SHOT = URLQ.has('shot'), WALL = URLQ.has('wallpaper');
const T0 = Math.max(0, +(URLQ.get('t') || 0) || 0);
const saveS = () => { try { localStorage.setItem(IA_KEY, JSON.stringify(S)); } catch {} };
// filled in by main.js and audio.js once they exist
const IA = { levels() {}, sound() {}, res() {}, swim() {}, unswim() {}, live: () => false, state: '' };
let swim = false; // free swimming instead of the drift

{
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
  const row = (id, label) => `<div class="ia-row"><label for="ia-${id}">${label}<output id="ia-${id}-v"></output></label><input type="range" id="ia-${id}" min="0" max="1" step="0.01"></div>`;
  const el = document.createElement('div');
  el.innerHTML = `
    <div id="ia-hint"><b>Abyssal Garden</b> &middot; click for sound &middot; G settings &middot; Enter to swim &middot; F full screen</div>
    <button id="ia-btn" type="button" aria-label="Settings" title="Settings (G)">${ICON}</button>
    <div id="ia-panel" role="dialog" aria-label="Abyssal Garden settings">
      <div class="ia-title">Abyssal Garden</div>
      <div class="ia-sub">Drifting through a kelp garden</div>
      <label class="ia-check"><input type="checkbox" id="ia-sound"> Sound</label>
      ${row('volume', 'Volume')}
      ${row('music', 'Music')}
      ${row('effects', 'Ambient effects')}
      ${row('bed', 'Water')}
      <div class="ia-sec">Swim</div>
      <div class="ia-btns"><button type="button" id="ia-swim">Swim freely</button></div>
      <div class="ia-note" id="ia-swim-note"></div>
      <div class="ia-sec">Display</div>
      <div class="ia-row"><label for="ia-fps">Frame rate</label>
        <select id="ia-fps"><option value="15">15 fps (lowest power)</option><option value="30">30 fps</option><option value="60">60 fps</option></select></div>
      <div class="ia-row"><label for="ia-quality">Resolution</label>
        <select id="ia-quality"><option value="0">Automatic</option><option value="40">40%</option><option value="50">50%</option><option value="60">60%</option><option value="70">70%</option><option value="85">85%</option><option value="100">100%</option></select></div>
      <div class="ia-row"><label for="ia-detail">Detail (reloads the page)</label>
        <select id="ia-detail"><option value="2">Low</option><option value="1">Medium</option><option value="0">High</option></select></div>
      <div class="ia-stats"><span>Drawing at</span><b id="ia-res">-</b><span>Frame rate</span><b id="ia-rate">-</b><span>Graphics work</span><b id="ia-gpu">-</b></div>
      <div class="ia-btns"><button type="button" id="ia-full">Full screen</button><a href="../index.html">All scenes</a></div>
      <div class="ia-note" id="ia-note"></div>
      <div class="ia-note">Based on <a href="https://github.com/Noniv/abyssal-garden" target="_blank" rel="noopener">Abyssal Garden</a> by Maksymilian Dendura (MIT License).</div>
    </div>`;
  document.body.appendChild(el);
}
const $ia = (id) => document.getElementById(id);
if (SHOT) $ia('ia-btn').style.display = 'none';
const panelOpen = () => document.body.classList.contains('panel');
let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!panelOpen()) document.body.classList.add('idle'); }, 3000);
}
const togglePanel = () => { document.body.classList.toggle('panel'); wake(); };
const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };
$ia('ia-btn').addEventListener('click', () => { if (swim && mob) IA.unswim(); else togglePanel(); });
$ia('ia-full').addEventListener('click', fullscreen);
$ia('ia-swim').addEventListener('click', () => (swim ? IA.unswim() : IA.swim()));
$ia('c').addEventListener('dblclick', () => { if (!swim) fullscreen(); });
// smoothed pointer position, -1..1, which the drifting camera follows a little (F[TLX], F[TLY] in main.js)
const lookT = new Float64Array(2);
addEventListener('pointermove', (e) => { lookT[0] = e.clientX / innerWidth * 2 - 1; lookT[1] = e.clientY / innerHeight * 2 - 1; wake(); });
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (swim) { if (e.code === 'Escape') IA.unswim(); else if (e.code === 'KeyM') IA.sound(!(S.sound && IA.live())); return; }
  const k = e.key.toLowerCase();
  if (k === 'g') togglePanel();
  else if (k === 'f') fullscreen();
  else if (k === 's') IA.sound(!(S.sound && IA.live()));
  else if (k === 'escape') document.body.classList.remove('panel');
  else if (k === 'enter' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') IA.swim();
});

const sliders = ['volume', 'music', 'effects', 'bed'];
function sync() {
  $ia('ia-sound').checked = S.sound;
  for (const k of sliders) { $ia('ia-' + k).value = S[k]; $ia('ia-' + k + '-v').textContent = S[k] === 0 ? 'off' : Math.round(S[k] * 100) + '%'; }
  $ia('ia-fps').value = String(S.fps);
  $ia('ia-quality').value = String(S.quality);
  $ia('ia-detail').value = String(LV);
  $ia('ia-swim').textContent = swim ? 'Back to the drift' : 'Swim freely';
  $ia('ia-swim-note').textContent = swim ? (mob ? 'Hold to swim forward, slide to steer, second finger to go faster.' : 'W A S D swim, Q / E down and up, Shift faster, 1 to 6 viewpoints, M sound. Esc goes back to the drift.')
    : 'Enter or this button. The drift picks up where it left off.';
  let note = 'S turns the sound on or off.';
  if (!window.AudioContext) note = 'This browser has no Web Audio.';
  else if (MUTE) note = 'Sound is off for this address (?mute).';
  else if (S.sound && !IA.live()) note = 'Click anywhere to start the sound.';
  $ia('ia-note').textContent = note;
}
document.body.addEventListener('input', (e) => {
  const id = e.target.id;
  if (!id.startsWith('ia-')) return;
  if (id === 'ia-sound') { IA.sound(e.target.checked); return; }
  if (id === 'ia-fps') S.fps = +e.target.value;
  else if (id === 'ia-quality') { S.quality = +e.target.value; IA.res(); }
  else if (id === 'ia-detail') { keep(KQ, e.target.value); location.reload(); return; }
  else if (sliders.includes(id.slice(3))) { S[id.slice(3)] = parseFloat(e.target.value); IA.levels(); }
  saveS(); sync();
});
sync();
wake();
