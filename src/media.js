// Small helpers for the pre-rendered videos in /public/videos (see tools/render.mjs).
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isPortrait = () => window.innerHeight > window.innerWidth * 1.1;
export const suffix = () => (isPortrait() ? '-m' : '');

/** webm first (smaller), mp4 as the universal fallback; the poster is the first frame as WebP. */
export function setSources(video, name) {
  if (video.dataset.loaded === name) return;
  video.dataset.loaded = name;
  video.poster = `/videos/${name}.webp`;
  video.innerHTML = '';
  for (const [ext, type] of [['webm', 'video/webm; codecs="vp9"'], ['mp4', 'video/mp4']]) {
    const s = document.createElement('source');
    s.src = `/videos/${name}.${ext}`; s.type = type;
    video.appendChild(s);
  }
  video.load();
}

export function whenReady(video, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) return resolve();
    const t = setTimeout(() => reject(new Error(`video timeout: ${video.dataset.loaded}`)), timeoutMs);
    video.addEventListener('loadeddata', () => { clearTimeout(t); resolve(); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(t); reject(new Error(`video error: ${video.dataset.loaded}`)); }, { once: true });
  });
}
