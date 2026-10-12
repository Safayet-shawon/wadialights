# Pre-rendered films

Every clip on the site is rendered offline from the site's own Three.js room and lamp models
(PBR materials, tungsten point lights, soft shadows, bloom, ACES tone mapping), frame by frame, at 30 fps:

```bash
npm run dev                          # keep this running
node tools/render-all.mjs            # all clips (~30–40 min on an integrated GPU)
node tools/render-all.mjs hero lamp  # only clips whose name contains a word
node tools/render.mjs hero --w 1920 --h 1080     # one clip
```

Each render produces `name.mp4` (H.264), `name.webm` (VP9) and `name.webp` (poster = first frame), all ≤ 4 MB.
Scrubbed clips (`intro-pull`, `table-lamp-*`) are all-intra (`-g 1`). Camera paths and light timelines live in
`src/scene/path.js` and `src/render/clips.js`.

## HyperFrames
No HyperFrames project IDs: HyperFrames' `compose` is a cloud agent that authors its own motion-graphics
compositions from a text prompt, so it cannot render this site's Three.js scene with identical camera paths,
seamless loops or all-intra scrub clips. The renderer above (headless Chrome + ffmpeg-static) was used instead.

## Files
| clip | mp4 MB | webm MB | what |
|---|---|---|---|
| `craft-brass` | 0.52 | 0.27 | Macro: light raking across turned brass. |
| `craft-glass` | 0.38 | 0.19 | Macro: filament glowing through frosted glass. |
| `craft-patina` | 0.54 | 0.29 | Macro: aged brass with verdigris catching the light. |
| `craft-walnut-linen` | 0.22 | 0.10 | Macro: light through linen over walnut. |
| `hero-m` | 2.03 | 1.79 | Seamless 8 s loop of the lit sitting room; starts on the intro's last frame. (portrait 1080×1920 for phones) |
| `hero` | 1.92 | 1.55 | Seamless 8 s loop of the lit sitting room; starts on the intro's last frame. |
| `intro-m` | 2.21 | 1.98 | Ignition flicker → camera descent → every lamp comes on (8.7 s). Continues exactly where intro-pull ends. (portrait 1080×1920 for phones) |
| `intro-pull-m` | 0.23 | 0.19 | Cord pull, all-intra (-g 1). Dragging the cord scrubs currentTime; past the threshold it plays on. (portrait 1080×1920 for phones) |
| `intro-pull` | 0.22 | 0.16 | Cord pull, all-intra (-g 1). Dragging the cord scrubs currentTime; past the threshold it plays on. |
| `intro` | 2.09 | 1.78 | Ignition flicker → camera descent → every lamp comes on (8.7 s). Continues exactly where intro-pull ends. |
| `lamp-1` | 0.39 | 0.16 | Collection plate I: pendant. 20° orbit, light gently rising and falling, seamless loop. |
| `lamp-2` | 0.69 | 0.25 | Plate II: wall sconce. |
| `lamp-3` | 0.61 | 0.35 | Plate III: table lamp. |
| `lamp-4` | 0.31 | 0.15 | Plate IV: floor lamp. |
| `lamp-5` | 0.92 | 0.67 | Plate V: ceiling fixture. |
| `room-lit-m` | 2.03 | 1.79 | Comparison film B: every lamp on. (portrait 1080×1920 for phones) |
| `room-lit` | 1.92 | 1.55 | Comparison film B: every lamp on. |
| `room-unlit-m` | 1.91 | 1.75 | Comparison film A: grey dusk. Same camera move as room-lit; crossfaded by the "Turn the lights up" control. (portrait 1080×1920 for phones) |
| `room-unlit` | 1.77 | 1.55 | Comparison film A: grey dusk. Same camera move as room-lit; crossfaded by the "Turn the lights up" control. |
| `table-lamp-off` | 3.39 | 2.86 | Same camera path, unlit. Crossfaded by Switch off / on. |
| `table-lamp-on` | 2.80 | 3.24 | Featured fixture: 360° turntable, lit. All-intra (-g 1) so dragging can scrub currentTime. |

Sizes: 1920×1080 (hero/intro/room), 1080×1920 (`-m`, phones), 1080×1350 (collection plates),
960×960 (craft specimens), 720×900 (turntable). Film grain is not baked in (it would multiply file size);
the page's CSS grain overlay is used instead.
