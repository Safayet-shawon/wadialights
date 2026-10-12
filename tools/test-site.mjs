// Drives the real site in real Chrome (GPU, real video decoding) and saves screenshots to /tmp-style folder.
//   node tools/test-site.mjs [desktop|mobile] [--base http://127.0.0.1:5173] [--skip]
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';
const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://127.0.0.1:5173';
const out = resolve('test-shots'); mkdirSync(out, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vp = mode === 'mobile' ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 810 };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: vp,
  args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (['error'].includes(m.type())) errors.push('console: ' + m.text()); });
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url().split('/').slice(-2).join('/')));
const shot = async (name) => { await page.screenshot({ path: `${out}/${mode}-${name}.png` }); console.log('  shot', name); };

await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
await sleep(900); await shot('1-loader');
await page.waitForFunction("document.documentElement.dataset.stage === 'dark' && !document.getElementById('loader')", { timeout: 60000 });
await sleep(600); await shot('2-dark');

// pull the cord with a real pointer drag
const hit = await page.$eval('#cord-hit', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
console.log('  cord handle at', Math.round(hit.x), Math.round(hit.y));
if (mode === 'mobile') {
  // real touch events (what a phone sends), not mouse events
  const ts = page.touchscreen;
  await ts.touchStart(hit.x, hit.y);
  for (let i = 1; i <= 12; i++) { await ts.touchMove(hit.x, hit.y + i * 14); await sleep(16); if (i === 4) await shot('3-dragging'); }
  await ts.touchEnd();
} else {
  await page.mouse.move(hit.x, hit.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(hit.x, hit.y + i * 14); await sleep(16); if (i === 4) await shot('3-dragging'); }
  await page.mouse.up();
}
const times = {};
const t0 = Date.now();
for (let i = 0; i < 200; i++) {
  const st = await page.evaluate(() => document.documentElement.dataset.stage);
  if (!(st in times)) times[st] = ((Date.now() - t0) / 1000).toFixed(1);
  if (st === 'flicker' && !times.shotFlicker) { times.shotFlicker = 1; await sleep(300); await shot('4-flicker'); }
  if (st === 'descent' && !times.shotDescent) { times.shotDescent = 1; await sleep(1500); await shot('5-descent'); }
  if (st === 'free') break;
  await sleep(100);
}
console.log('  stage timeline (s after release):', JSON.stringify(times));
await sleep(1500); await shot('6-hero');

const tops = await page.evaluate(() => Object.fromEntries(['#collection', '#craft', '#light', '#featured', '#contact'].map((s) => [s, document.querySelector(s).getBoundingClientRect().top + scrollY])));
const heroMeta = await page.evaluate(() => ({ heroPlaying: !document.getElementById('v-hero').paused, scrollW: document.documentElement.scrollWidth, innerW: innerWidth }));
console.log('  hero', JSON.stringify(heroMeta));
for (const [sel, name] of [['#collection', '7-collection'], ['#craft', '8-craft'], ['#light', '9-light'], ['#featured', '10-featured'], ['#contact', '11-footer']]) {
  await page.evaluate((y) => window.scrollTo(0, y), tops[sel] + (sel === '#collection' ? 500 : sel === '#light' ? 120 : 40));
  await sleep(2600); await shot(name);
}
const vids = await page.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({ id: v.id || v.className.split(' ')[0] + ':' + (v.dataset.clip || ''), clip: (v.currentSrc || '').split('/').pop(), playing: !v.paused, t: +v.currentTime.toFixed(1), rs: v.readyState })));
console.log('  videos', JSON.stringify(vids.filter((v) => v.clip)));
console.log('  errors:', errors.length ? errors : 'none');
await browser.close();
