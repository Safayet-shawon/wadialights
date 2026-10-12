// Offline video renderer.
//   node tools/render.mjs <clip> [--w 1920 --h 1080] [--out name] [--scrub] [--limit N] [--crf 24] [--base http://127.0.0.1:5173]
// Opens render.html in your real Chrome (GPU), steps through every frame deterministically and encodes
// MP4 + WebM + WebP poster into public/videos/ with ffmpeg-static. Needs `npm run dev` running.
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const clip = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const W = Number(opt('w', 1920)), H = Number(opt('h', 1080));
const out = opt('out', clip);
const base = opt('base', 'http://127.0.0.1:5173');
const limit = Number(opt('limit', 0));
const scrub = flag('scrub');                 // all-intra (-g 1) so currentTime scrubbing is instant
const maxBytes = Number(opt('max', 4 * 1024 * 1024));
let crf = Number(opt('crf', scrub ? 28 : 24));
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const outDir = resolve('public/videos');
mkdirSync(outDir, { recursive: true });

const run = (cmd, a) => new Promise((res, rej) => {
  const p = spawn(cmd, a, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}\n${err.slice(-1500)}`))));
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: W, height: H },
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--hide-scrollbars', '--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(`${base}/render.html?clip=${clip}&w=${W}&h=${H}`, { waitUntil: 'load' });
await page.waitForFunction('window.__R && (window.__R.ready || window.__R.error)', { timeout: 180000 });
const info = await page.evaluate(() => ({ error: window.__R.error, first: window.__R.first, last: window.__R.last, fps: window.__R.fps, gl: window.__R.gl }));
if (info.error) { console.error(info.error); await browser.close(); process.exit(1); }
console.log(`[${clip}] ${W}x${H} frames ${info.first}-${info.last - 1} @${info.fps}fps  GL: ${info.gl}`);

const tmp = mkdtempSync(join(tmpdir(), `frames-${clip}-`));
const total = limit ? Math.min(limit, info.last - info.first) : info.last - info.first;
for (let i = 0; i < info.first; i++) await page.evaluate((n) => window.__R.step(n), i);
const t0 = Date.now();
for (let n = 0; n < total; n++) {
  let data;
  for (let tries = 0; ; tries++) {
    try { data = await page.evaluate((i) => window.__R.renderFrame(i), info.first + n); break; }
    catch (e) { if (tries >= 2) throw e; console.error(`
  retry frame ${n}: ${e.message.slice(0, 60)}`); await new Promise((r) => setTimeout(r, 1500)); }
  }
  writeFileSync(join(tmp, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  if (n % 15 === 0) process.stdout.write(`\r  frame ${n + 1}/${total}  ${((Date.now() - t0) / (n + 1) / 1000).toFixed(2)} s/frame   `);
}
console.log();
await browser.close();

const mp4 = join(outDir, `${out}.mp4`), webm = join(outDir, `${out}.webm`), poster = join(outDir, `${out}.webp`);
for (let attempt = 0; attempt < 5; attempt++) {
  await run(ffmpegPath, ['-y', '-framerate', String(info.fps), '-i', join(tmp, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...(scrub ? ['-g', '1'] : ['-g', '60']), '-an', mp4]);
  const size = statSync(mp4).size;
  console.log(`  mp4 crf ${crf}: ${(size / 1048576).toFixed(2)} MB`);
  if (size <= maxBytes) break;
  crf += 3;
}
await run(ffmpegPath, ['-y', '-i', mp4, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(Math.min(crf + 8, 40)), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
  ...(scrub ? ['-g', '1'] : ['-g', '60']), '-an', webm]);
console.log(`  webm: ${(statSync(webm).size / 1048576).toFixed(2)} MB`);
await run(ffmpegPath, ['-y', '-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', poster]);
rmSync(tmp, { recursive: true, force: true });
console.log(`  done → public/videos/${out}.{mp4,webm,webp}`);
