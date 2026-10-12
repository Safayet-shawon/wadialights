// Generates the social-share card and app icons with headless Chrome (uses the real hero frame + logo).
//   node tools/make-assets.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const font = (w) => pathToFileURL(resolve(`node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-${w}-normal.woff2`)).href;
const hero = pathToFileURL(resolve('public/videos/hero.webp')).href;

const BULB = (c = '#F5B800', sw = 6) => `<svg viewBox="0 0 80 124" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M62 18C34 2 6 22 12 50c3 14 14 20 16 32h22c2-12 12-18 16-32"/><path d="M46 30C32 24 24 38 30 48c4 7 10 8 10 18"/><path d="M28 92l28-6"/><path d="M30 102l26-6"/><path d="M34 112l18-4"/></g></svg>`;

const og = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:BC;font-weight:700;src:url(${font(700)})}@font-face{font-family:BC;font-weight:600;src:url(${font(600)})}
html,body{margin:0;width:1200px;height:630px;background:#0a0a0b;overflow:hidden}
.bg{position:absolute;inset:0;background:url(${hero}) center/cover;filter:brightness(.55) saturate(1.1)}
.sh{position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,8,9,.92) 0,rgba(8,8,9,.55) 55%,rgba(8,8,9,.15))}
.c{position:absolute;left:72px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;font-family:BC;color:#f2f2f0}
.logo{display:flex;align-items:center;gap:22px;margin-bottom:48px}.logo svg{height:124px}
.dots{align-self:stretch;margin:8px 0;border-left:5px dotted #b9b9bb}
.w{font-weight:700;font-size:112px;line-height:.86;letter-spacing:3px;color:#b9b9bb}.w em{font-style:normal;color:#F5B800}
.s{font-weight:600;font-size:30px;letter-spacing:7px;text-transform:uppercase;color:#b9b9bb;margin-top:12px}
h1{margin:0;font-weight:700;font-size:92px;line-height:.98;text-transform:uppercase;letter-spacing:1px}h1 b{color:#F5B800}
</style><div class="bg"></div><div class="sh"></div><div class="c">
<div class="logo">${BULB()}<i class="dots"></i><div><div class="w">WA<em>D</em>IA</div><div class="s">Lights &amp; Automation</div></div></div>
<h1>A light that feels<br>like <b>home.</b></h1></div>`;

const icon = (size, pad) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${size}px;height:${size}px;background:#0a0a0b}
body{display:grid;place-items:center}svg{height:${Math.round(size * pad)}px}</style>${BULB('#F5B800', 7)}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const tmp = resolve('tools/_tmp.html');

async function render(html, w, h, file, type = 'png', quality) {
  writeFileSync(tmp, html);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: file, type, ...(quality ? { quality } : {}) });
  console.log('  wrote', file);
}
mkdirSync('public', { recursive: true });
await render(og, 1200, 630, 'public/og-image.jpg', 'jpeg', 86);
await render(icon(512, 0.66), 512, 512, 'public/icon-512.png');
await render(icon(192, 0.66), 192, 192, 'public/icon-192.png');
await render(icon(180, 0.6), 180, 180, 'public/apple-touch-icon.png');
await browser.close();
import('node:fs').then(({ rmSync }) => rmSync(tmp, { force: true }));
