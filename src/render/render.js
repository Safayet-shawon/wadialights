// Offline render harness. Open as render.html?clip=<id>&w=1920&h=1080 and call
// window.__R.renderFrame(i) for each frame: it returns a JPEG data-URL.
// Driven by tools/render.mjs (headless Chrome → ffmpeg). Fully deterministic: no clocks, no RAF.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials } from '../scene/materials.js';
import { CLIPS } from './clips.js';

const q = new URLSearchParams(location.search);
const id = q.get('clip');
const W = Number(q.get('w')) || 1920, H = Number(q.get('h')) || 1080;
const FPS = 30;

async function main() {
  const def = CLIPS[id];
  if (!def) throw new Error(`unknown clip ${id}`);
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = def.exposure ?? 0.92;

  const M = createMaterials({ lite: false });
  const ctx = { renderer, M, W, H, aspect: W / H, fps: FPS };
  const clip = await def.build(ctx);          // → { scene, camera, update(frame, t) }

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(clip.scene, clip.camera));
  const bloom = def.bloom ?? { strength: 0.35, radius: 0.6, threshold: 1.6 };
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), bloom.strength, bloom.radius, bloom.threshold));
  composer.addPass(new OutputPass());

  const frames = Math.round(def.duration * FPS);
  const first = def.firstFrame ?? 0;
  const last = def.lastFrame ?? frames;       // exclusive
  window.__R = {
    ready: true,
    fps: FPS,
    first, last,
    gl: renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? renderer.getContext().RENDERER),
    renderFrame(i) {
      clip.update(i, i / FPS);
      composer.render();
      return canvas.toDataURL('image/jpeg', 0.95);
    },
    /** advance simulation without rendering (for clips that continue another clip's physics) */
    step(i) { clip.update(i, i / FPS); },
  };
}

main().catch((e) => { window.__R = { error: String(e && e.stack || e) }; console.error(e); });
