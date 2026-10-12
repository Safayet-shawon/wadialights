// Regenerates public/videos/README.md from what is actually in the folder.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'public/videos';
const notes = {
  'intro-pull': 'Cord pull, all-intra (-g 1). Dragging the cord scrubs currentTime; past the threshold it plays on.',
  intro: 'Ignition flicker → camera descent → every lamp comes on (8.7 s). Continues exactly where intro-pull ends.',
  hero: 'Seamless 8 s loop of the lit sitting room; starts on the intro\'s last frame.',
  'room-unlit': 'Comparison film A: grey dusk. Same camera move as room-lit; crossfaded by the "Turn the lights up" control.',
  'room-lit': 'Comparison film B: every lamp on.',
  'lamp-1': 'Collection plate I: pendant. 20° orbit, light gently rising and falling, seamless loop.',
  'lamp-2': 'Plate II: wall sconce.', 'lamp-3': 'Plate III: table lamp.', 'lamp-4': 'Plate IV: floor lamp.', 'lamp-5': 'Plate V: ceiling fixture.',
  'craft-glass': 'Macro: filament glowing through frosted glass.',
  'craft-brass': 'Macro: light raking across turned brass.',
  'craft-patina': 'Macro: aged brass with verdigris catching the light.',
  'craft-walnut-linen': 'Macro: light through linen over walnut.',
  'table-lamp-on': 'Featured fixture: 360° turntable, lit. All-intra (-g 1) so dragging can scrub currentTime.',
  'table-lamp-off': 'Same camera path, unlit. Crossfaded by Switch off / on.',
};
const files = readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort();
const mb = (f) => { try { return (statSync(join(dir, f)).size / 1048576).toFixed(2); } catch { return '–'; } };
const rows = files.map((f) => {
  const n = f.replace('.mp4', ''), base = n.replace(/-m$/, '');
  const note = (notes[base] || '') + (n.endsWith('-m') ? ' (portrait 1080×1920 for phones)' : '');
  return `| \`${n}\` | ${mb(`${n}.mp4`)} | ${mb(`${n}.webm`)} | ${note} |`;
});
writeFileSync(join(dir, 'README.md'), `# Pre-rendered films

Every clip on the site is rendered offline from the site's own Three.js room and lamp models
(PBR materials, tungsten point lights, soft shadows, bloom, ACES tone mapping), frame by frame, at 30 fps:

\`\`\`bash
npm run dev                          # keep this running
node tools/render-all.mjs            # all clips (~30–40 min on an integrated GPU)
node tools/render-all.mjs hero lamp  # only clips whose name contains a word
node tools/render.mjs hero --w 1920 --h 1080     # one clip
\`\`\`

Each render produces \`name.mp4\` (H.264), \`name.webm\` (VP9) and \`name.webp\` (poster = first frame), all ≤ 4 MB.
Scrubbed clips (\`intro-pull\`, \`table-lamp-*\`) are all-intra (\`-g 1\`). Camera paths and light timelines live in
\`src/scene/path.js\` and \`src/render/clips.js\`.

## HyperFrames
No HyperFrames project IDs: HyperFrames' \`compose\` is a cloud agent that authors its own motion-graphics
compositions from a text prompt, so it cannot render this site's Three.js scene with identical camera paths,
seamless loops or all-intra scrub clips. The renderer above (headless Chrome + ffmpeg-static) was used instead.

## Files
| clip | mp4 MB | webm MB | what |
|---|---|---|---|
${rows.join('\n')}

Sizes: 1920×1080 (hero/intro/room), 1080×1920 (\`-m\`, phones), 1080×1350 (collection plates),
960×960 (craft specimens), 720×900 (turntable). Film grain is not baked in (it would multiply file size);
the page's CSS grain overlay is used instead.
`);
console.log(`wrote ${join(dir, 'README.md')} (${files.length} clips)`);
