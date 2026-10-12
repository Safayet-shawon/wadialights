# Opening films

Only the opening sequence is video; everything else on the site is photography (`/public/photos`).

| clip | what |
|---|---|
| `intro-pull` / `intro-pull-m` | The cord being pulled, all-intra (`-g 1`). Dragging the cord scrubs `currentTime`; past 60 % it plays on. `-m` = portrait (phones). |
| `intro` / `intro-m` | Ignition flicker → camera descent → every lamp comes on (8.7 s). Continues exactly where `intro-pull` ends; it then develops into the hero photograph. |

Each has `.mp4` (H.264), `.webm` (VP9) and a `.webp` poster. They are rendered offline from the site's own Three.js room
(`src/render/clips.js`, `src/scene/path.js`) by headless Chrome + ffmpeg:

```bash
npm run dev
node tools/render-all.mjs        # ~6 min on an integrated GPU
```

No HyperFrames project IDs exist: its `compose` is a cloud agent that authors its own compositions, so it cannot render this scene.
