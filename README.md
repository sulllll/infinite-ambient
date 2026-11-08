# Infinite Ambient

Endless scenes that you drift through, each with its own instrumental soundtrack. The scenes run in a web browser with nothing to install. They are built to stay on all day as a live wallpaper.

Live gallery: <https://sulllll.github.io/infinite-ambient/>

## Scenes

| Scene | What you see | Music |
|---|---|---|
| <img src="thumbs/aurora.jpg" width="240" alt="Aurora curtains over a frozen lake"><br>[Aurora Drift](https://sulllll.github.io/infinite-ambient/aurora/) | A slow glide over a frozen lake at night, under folding curtains of aurora. Snow drifts lie on the ice, far mountains stand on the horizon, and the ice mirrors the sky. | Soft solo piano after Debussy’s *Clair de lune*. |
| <img src="thumbs/abyss.jpg" width="240" alt="Glowing jellyfish in deep water"><br>[Abyss](https://sulllll.github.io/infinite-ambient/abyss/) | An endless drift through deep water. Faint shafts of light fall from far above, marine snow streams past, and soft glowing jellies pulse in the dark. | Submerged strings after Bach’s Cello Suite No. 1 prelude. |
| <img src="thumbs/dunes.jpg" width="240" alt="Sand dunes under a low sun"><br>[Dune Sea](https://sulllll.github.io/infinite-ambient/dunes/) | A low flight over endless sand dunes at the golden hour. The sun rises a little and sinks again over about 32 minutes, so the light moves between gold and dusk. | Sparse, warm tones after Satie’s *Gymnopédie No. 1*. |
| <img src="thumbs/nebula.jpg" width="240" alt="Clouds of gas between stars"><br>[Nebula Drift](https://sulllll.github.io/infinite-ambient/nebula/) | A slow flight through glowing clouds of gas between the stars. Near stars drift past, and far stars stay on the sky. | Slowly overlapping tones after Pachelbel’s *Canon in D*. |

[Nightscape](https://github.com/sulllll/Nightscape) is the first scene of this kind: a flight above a sea of clouds at night, with a felt piano and a soft choir. It lives in its own repository, a fork of WeebLabs/Nightscape with added music. This repository holds only new code. It contains no code or assets from WeebLabs/Nightscape.

## Using a scene

Open the live gallery or open `index.html` in a local checkout. Serve the checkout over HTTP to preview the same sample-accurate audio loop as the live site.

- Sound starts when you click or press a key. Browsers do not play sound before that.
- <kbd>G</kbd> opens the settings. <kbd>F</kbd> or a double-click toggles full screen. <kbd>S</kbd> turns the sound on and off. <kbd>Esc</kbd> closes the settings.
- The settings set the volume, music, ambient effects, continuous wind or water where present, frame rate (15, 30 or 60 fps) and resolution (automatic, or fixed between 40% and 100%). Each scene keeps its own settings in the browser.

URL options:

| Option | Effect |
|---|---|
| `?fps=15` | Frame rate: 15, 30 or 60 fps. |
| `?scale=0.5` | A fixed resolution, from 0.2 to 1 of the window size. |
| `?t=600` | Start at this time, in seconds. |
| `?mute` | No sound. |
| `?wallpaper` | Keep playing while the page is visible and out of focus. Hidden pages still pause. |
| `?nohint` | No hint about the sound and the keys. |
| `?shot` | Draw a few frames and stop, for screenshots. |

## As a wallpaper

- Windows: [Lively Wallpaper](https://github.com/rocksdanister/lively) (free) can show a web page as the desktop. Add a scene by its address with `?wallpaper`.
- macOS: [Plash](https://github.com/sindresorhus/Plash) (free) can show a web page as the desktop. Use a scene address with `?wallpaper`.
- Any system: open a scene in its own full-screen browser window. The page tries to start the sound at once. Chrome allows that only when it starts with the autoplay switch:

```
chrome --autoplay-policy=no-user-gesture-required --kiosk https://sulllll.github.io/infinite-ambient/aurora/?wallpaper
```

Wallpaper apps differ in whether they let a page start sound without a click.

## Running for days

- The frame rate is capped at 30 fps by default. At 15 fps the graphics card does half the work.
- Drawing stops while the page is hidden. Music and effects pause when the page is hidden or loses focus, then resume together when you return. Wallpaper mode also plays while the visible page is out of focus.
- The automatic resolution keeps the graphics work near a fixed budget: 6 ms per frame, or 8 ms for Dune Sea. It reads the browser's GPU timer (`EXT_disjoint_timer_query_webgl2`). Without that timer, it lowers the resolution when frames come late and never raises it above the scene's default.
- Travel wraps at the scene's world period, and every slow motion is a closed loop. The numbers sent to the GPU stay small, so the picture never degrades.
- A lost graphics context is rebuilt. If the browser does not give it back within 15 seconds, the page reloads.
- Each scene downloads and decodes its soundtrack and effects once. The browser loops both in memory on the same audio clock.

Graphics work per frame, measured with the GPU timer on Intel Arc 140V integrated graphics (Chrome on Windows):

| Scene | One frame at 672 × 706 pixels | Default resolution |
|---|---|---|
| Abyss | 1.2 ms | 65% |
| Aurora Drift | 2.1 ms | 50% |
| Nebula Drift | 2.4 ms | 50% |
| Dune Sea | 7.8 ms | 55% |

672 × 706 pixels is about the pixel count of a 1920 × 1080 screen at 50% resolution. With the automatic resolution at 30 fps, the measured work stayed between 2.5 and 9 ms per frame in every scene.

## Music

We extracted an audio excerpt from each video below. SheetSage2 transcribed each melody, and [YuE2-3B](https://huggingface.co/m-a-p/YuE2-3B) generated a new instrumental arrangement. The published FLAC files contain the new arrangements with a crossfade at the loop seam. The tracks are level-matched near −18.7 LUFS before the volume controls.

Synthesized effects enter in quieter passages of each score. Listen for ice rings in Aurora Drift, pressure swells in Abyss, sand brushing in Dune Sea, and distant glints in Nebula Drift.

Aurora Drift and Dune Sea also have two quiet bursts of simulated cockpit radio per loop. Each exchange lasts under one second and sits on the ambient effects slider.

| Scene | Classical reference | Source recording and credit |
|---|---|---|
| Aurora Drift | Claude Debussy, *Clair de lune* | [RagtimeDorianHenry, 0:02–1:56](https://www.youtube.com/watch?v=gmOqjIku0pM) · [Public Domain Mark on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Clair_de_Lune_by_Claude_Debussy_(1905,_piano_solo).opus) |
| Abyss | J. S. Bach, Cello Suite No. 1, Prelude | [Philip Milman, funded by Ludwig and Schlatt, 0:02–1:54](https://www.youtube.com/watch?v=e_J14fbBluE) · [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Dune Sea | Erik Satie, *Gymnopédie No. 1* | [Kevin MacLeod, 0:02–1:57](https://www.youtube.com/watch?v=YlTQSg4so8k) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Nebula Drift | Johann Pachelbel, *Canon in D* | [Kevin MacLeod, 0:21–2:17](https://www.youtube.com/watch?v=dL8zEaUn2Qs) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

## Tools

`tools/render-music.cjs` renders the earlier procedural score for a scene. It reports invalid samples, note counts and loudness, and can write a WAV file.

```
npm install node-web-audio-api
node tools/render-music.cjs aurora 900 48000 7 aurora.wav
```

The arguments are the scene, the length in seconds, the sample rate, the seed and the output file. Only the scene is required.

`tools/loudness.cjs` measures the integrated loudness of a 16-bit WAV file (ITU-R BS.1770, with gating):

```
node tools/loudness.cjs aurora.wav
```

## Layout

```
index.html           the gallery
shared/scene.js      the runtime: WebGL 2, frame rate, automatic resolution, settings panel, sound
shared/music.js      the earlier procedural music engine for offline rendering
shared/style.css     styles for the settings panel and the hint
audio/               the soundtrack and effects loops served by GitHub Pages
<scene>/index.html   one page for each scene
<scene>/scene.js     the scene: its settings, its score and its fragment shader
thumbs/              pictures for the gallery
tools/               offline music render and loudness meter
```

## Adding a scene

Copy a scene folder and change its `scene.js`. A scene calls `InfiniteScene({ ... })` with these settings:

- `id`, `title`, `subtitle`: the names. `id` also keys the saved settings.
- `speed`: the travel in units per second. `period`: the world period, a size at which every noise scale in the scene repeats.
- `loops`: four loop lengths in seconds for the slow motions. The shader reads them as `uLoop`, each from 0 to 1.
- `scale`, `scaleMin`, `scaleMax`, `gpuBudget`: the default resolution, its limits and the budget in milliseconds per frame.
- `bed`: the optional ambience noise. Place the level-matched soundtrack at `audio/<id>-yue2.flac` and the optional matching-length effects loop at `audio/<id>-effects.flac`.
- `frag`: the body of the GLSL fragment shader. The runtime adds helpers for noise, stars, the view ray and tone mapping.

The GLSL sits inside a JavaScript template literal, so it must not contain a backtick, not even in a comment.

## Licence

No licence has been chosen yet.

Made with WebGL 2 and the Web Audio API. Audio files come from the same site.
