// End-to-end check of every interactive feature against the production server (npm run build && node server/index.js).
//   node tools/test-features.mjs [desktop|mobile] [--base http://127.0.0.1:3100]
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';
const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://127.0.0.1:3100';
const out = resolve('test-shots'); mkdirSync(out, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const vp = mode === 'mobile' ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 810 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: vp, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/status of 50[3]/.test(m.text())) errors.push('console: ' + m.text()); });   // 503 = expected "no database" answer
const shot = (n) => page.screenshot({ path: `${out}/${mode}-feat-${n}.png` });
const goto = async (sel, off = 0) => { await page.evaluate((s, o) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY + o), sel, off); await sleep(1200); };
const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
const count = (sel) => page.$$eval(sel, (e) => e.length);

console.log(`features · ${mode} · ${base}`);
await page.goto(`${base}/?skip`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction("document.documentElement.dataset.stage === 'free'", { timeout: 60000 });
await sleep(800);

// ---- button styles
const styleOf = () => page.evaluate(() => document.documentElement.dataset.btn);
check('default button style is clay', (await styleOf()) === 'clay');
await goto('.footer', 0);
await page.click('#style-switch [data-btn="glass"]');
check('footer switch → glass', (await styleOf()) === 'glass');
await page.click('#style-switch [data-btn="fabric"]');
check('footer switch → fabric', (await styleOf()) === 'fabric');
await page.reload({ waitUntil: 'domcontentloaded' });
check('style persists across reload', (await styleOf()) === 'fabric');
await page.click('#style-switch [data-btn="clay"]').catch(() => {});

// ---- catalogue
await page.goto(`${base}/?skip`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction("document.documentElement.dataset.stage === 'free'", { timeout: 60000 });
await goto('#catalogue', 150);
await page.waitForFunction("document.querySelectorAll('#cat-grid .cat-card:not(.is-skeleton)').length > 0", { timeout: 15000 });
check('catalogue loads 6 cards from the API', (await count('#cat-grid .cat-card:not(.is-skeleton)')) === 6);
check('pager shows page 1 of 3', /Page 1 of 3/.test(await text('#cat-pager')), await text('#cat-pager'));
await shot('1-catalogue');
await page.click('#cat-pager [data-page="2"]');
await page.waitForFunction("/Page 2 of 3/.test(document.querySelector('#cat-pager').textContent)", { timeout: 8000 });
check('pagination → page 2', true);
await sleep(1000); await page.$eval('#cat-filters [data-cat="floor"]', (e) => e.click());
await page.waitForFunction("document.querySelectorAll('#cat-grid .cat-card:not(.is-skeleton)').length === 3", { timeout: 8000 });
check('category filter shows 3 floor lamps', true);
await page.$eval('#cat-filters [data-cat=""]', (e) => e.click());
await page.type('#cat-search', 'linen');
await sleep(120);
const requestsDuringTyping = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/products') && r.name.includes('q=')).length);
check('search is debounced (no request per keystroke)', requestsDuringTyping <= 1, `requests so far: ${requestsDuringTyping}`);
await page.waitForFunction("document.querySelectorAll('#cat-grid .cat-card:not(.is-skeleton)').length >= 1 && !document.querySelector('#cat-grid .cat-empty')", { timeout: 8000 });
check('search finds linen-shade lamps', true);
await page.$eval('#cat-search', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
await page.type('#cat-search', 'zzzzqq');
await page.waitForFunction("document.querySelector('#cat-grid .cat-empty')", { timeout: 8000 });
check('empty state for no match', true);
await page.$eval('#cat-search', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForFunction("document.querySelectorAll('#cat-grid .cat-card:not(.is-skeleton)').length === 6", { timeout: 8000 });

// ---- planner
await goto('#planner', 120);
await page.waitForFunction("document.querySelectorAll('#planner-kpis .kpi').length >= 6", { timeout: 15000 });
const kp = async () => page.$$eval('#planner-kpis .kpi dd', (e) => e.map((x) => x.textContent));
const k1 = await kp();
check('planner renders KPIs + heat map', k1.length >= 8 && (await page.$eval('#planner-map', (c) => c.width > 0)), k1.slice(0, 3).join(' | '));
await page.waitForFunction("/server/.test(document.querySelector('#planner-src').textContent)", { timeout: 10000 }).then(() => check('planner result comes from the server API', true)).catch(() => check('planner result comes from the server API', false));
await page.$eval('#planner-form [name=length]', (e) => { e.value = '9'; e.dispatchEvent(new Event('input', { bubbles: true })); });
await page.$eval('#planner-form [name=width]', (e) => { e.value = '7'; e.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(900);
const k2 = await kp();
check('bigger room → more fixtures', Number(k2[0]) > Number(k1[0]), `${k1[0]} → ${k2[0]}`);
await page.select('#pl-purpose', 'office');
check('purpose sets the target lux (500)', (await page.$eval('#pl-lux', (e) => e.value)) === '500');
await sleep(900);
await shot('2-planner');

// ---- send plan → quote
await page.click('#planner-send');
await sleep(1600);
check('plan is attached to the quote form', /Plan:/.test(await text('#quote-attach')), await text('#quote-attach'));
await shot('3-quote-attached');

// ---- quote form: client validation, then the API (no database here → honest 503 message)
await page.click('#quote-submit');
await sleep(300);
check('empty form shows field errors', (await text('[data-for="name"]')).length > 0 && (await text('[data-for="email"]')).length > 0);
await page.type('#quote-form [name=name]', 'Asha Rahman');
await page.type('#quote-form [name=email]', 'asha@example.com');
await page.type('#quote-form [name=message]', 'I need warm light for an office and a hallway.');
await page.click('#quote-submit');
await page.waitForFunction("document.querySelector('#quote-msg').textContent.length > 12 && !document.querySelector('#quote-msg').textContent.startsWith('Sending')", { timeout: 10000 });
const qm = await text('#quote-msg');
check('valid submit reaches the API (503 "database not connected" without a DB)', /database/i.test(qm) || /received/i.test(qm), qm);
await shot('4-quote-result');
await page.type('#news-form [name=email]', 'not-an-email');
await page.click('#news-form button[type=submit]');
await sleep(300);
check('newsletter rejects a bad email', /valid email/i.test(await text('#news-msg')));

// ---- request a quote from a catalogue card pre-fills the form
await goto('#catalogue', 150);
await page.click('#cat-grid [data-quote]');
await sleep(1600);
check('catalogue "Request a quote" attaches the product', /Product:/.test(await text('#quote-attach')), await text('#quote-attach'));

// ---- before / after wipe
await goto('#light', 120);
await sleep(2500);
const v0 = Number(await page.$eval('#dimmer', (e) => e.value));
const box = await page.$eval('#compare-stage', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
if (mode === 'mobile') { await page.touchscreen.touchStart(box.x + box.w * 0.3, box.y + box.h / 2); await page.touchscreen.touchMove(box.x + box.w * 0.85, box.y + box.h / 2); await page.touchscreen.touchEnd(); }
else { await page.mouse.move(box.x + box.w * 0.3, box.y + box.h / 2); await page.mouse.down(); await page.mouse.move(box.x + box.w * 0.85, box.y + box.h / 2, { steps: 6 }); await page.mouse.up(); }
await sleep(300);
const v1 = Number(await page.$eval('#dimmer', (e) => e.value));
check('dragging the wipe changes the light level', v1 > 70 && v1 !== v0, `${v0} → ${v1}`);
await page.click('#lights-off'); await sleep(1400);
check('"Lights off" animates the wipe to 0%', Number(await page.$eval('#dimmer', (e) => e.value)) === 0);
await page.click('#lights-on'); await sleep(1400);
check('"Lights on" animates the wipe to 100%', Number(await page.$eval('#dimmer', (e) => e.value)) === 100);
await shot('5-wipe');

// ---- featured turntable switch
await goto('#featured', 40);
await sleep(1500);
const op0 = await page.$eval('#v-table-on', (e) => getComputedStyle(e).opacity);
await page.click('#toggle-light'); await sleep(1100);
const op1 = await page.$eval('#v-table-on', (e) => getComputedStyle(e).opacity);
check('Switch off crossfades the turntable', Number(op0) > 0.9 && Number(op1) < 0.1, `${op0} → ${op1}`);

// ---- layout health
const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
check('no horizontal overflow', ov.sw <= ov.iw + 1, JSON.stringify(ov));
check('no console / page errors', errors.length === 0, errors.slice(0, 3).join(' · '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
