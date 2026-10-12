// Lighting planner UI. The maths lives in server/lib (lumen method + matrix least-squares); this file
// shows an instant in-browser result, then asks /api/plan for the same calculation (cached server-side).
import { plan as localPlan, PURPOSES } from '../server/lib/lighting.js';
import { postJSON } from './api.js';
import { debounce, $, esc } from './util.js';
import { openQuote } from './forms.js';

let seq = 0, luxTouched = false, last = null;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (n) => Number(n).toLocaleString('en-US');

function values() {
  const fd = new FormData($('#planner-form'));
  return Object.fromEntries([...fd.entries()].map(([k, v]) => [k, v === '' ? undefined : v]));
}

/* dim graphite → warm yellow → white, like the logo */
const STOPS = [[0, [23, 23, 26]], [0.45, [110, 110, 112]], [0.75, [245, 184, 0]], [1, [255, 248, 220]]];
function ramp(t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i], k = (t - t0) / (t1 - t0);
      return c0.map((c, j) => Math.round(c + (c1[j] - c) * k));
    }
  }
  return STOPS[STOPS.length - 1][1];
}

function drawMap(r) {
  const canvas = $('#planner-map');
  const { length: L, width: W, targetLux } = r.input;
  const cw = 640, ch = clamp(Math.round((cw * W) / L), 220, 640);
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const { cols, rows, lux } = r.grid;
  const sx = cw / cols, sy = ch / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const [R, G, B] = ramp(lux[j * cols + i] / (targetLux * 1.7));
      ctx.fillStyle = `rgb(${R},${G},${B})`;
      ctx.fillRect(i * sx, j * sy, Math.ceil(sx) + 1, Math.ceil(sy) + 1);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, cw - 2, ch - 2);
  ctx.font = '600 15px "Barlow Condensed", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  r.layout.forEach((f, i) => {
    const x = (f.x / L) * cw, y = (f.y / W) * ch;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#111112'; ctx.fill(); ctx.strokeStyle = '#F5B800'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#F5B800'; ctx.fillText(String(i + 1), x, y + 0.5);
  });
}

function kpis(r) {
  const e = r.energy, q = r.result, eq = q.equal, tu = q.tuned;
  const rows = [
    ['Fixtures', r.lumenMethod.fixtures, `lumen method says ${r.lumenMethod.fixturesExact}`],
    ['Average light', `${fmt(tu.avgLux)} lux`, `target ${fmt(r.input.targetLux)} lux`],
    ['Evenness (min ÷ avg)', `${tu.uniformity}`, `${eq.uniformity} with equal output, matrix-tuned`],
    ['Lowest / highest', `${fmt(tu.minLux)} / ${fmt(tu.maxLux)} lux`, `room index ${r.room.roomIndex} · UF ${r.room.utilisation}`],
    ['Power', `${fmt(e.watts)} W`, `${fmt(e.incandescentWatts)} W if incandescent`],
    ['Energy per year', `${fmt(e.kwhPerYear)} kWh`, `${fmt(e.withAutomationKwh)} kWh with automation`],
    ['Running cost per year', fmt(e.costPerYear), `${fmt(e.costWithAutomation)} with automation`],
    ['CO₂ avoided per year', `${fmt(e.co2SavedKg)} kg`, 'vs incandescent, with automation'],
  ];
  $('#planner-kpis').innerHTML = rows.map(([k, v, s]) => `<div class="kpi"><dt>${esc(k)}</dt><dd>${esc(v)}</dd><small>${esc(s)}</small></div>`).join('');
  $('#planner-notes').innerHTML = r.notes.map((n, i) => `<li${r.capped && i === 0 ? ' class="warn"' : ''}>${esc(n)}</li>`).join('');
}

function render(r, source) {
  last = r;
  drawMap(r);
  kpis(r);
  $('#planner-src').textContent = source === 'server' ? 'Calculated on the server' : 'Calculated in your browser';
  $('#planner-map').setAttribute('aria-label', `Heat map of the ${r.input.length} by ${r.input.width} metre room: ${r.lumenMethod.fixtures} fixtures, average ${r.result.tuned.avgLux} lux`);
}

async function run() {
  const v = values();
  const mine = ++seq;
  try { render(localPlan(v), 'browser'); } catch (e) { console.warn('planner', e); return; }     // instant preview
  const res = await postJSON('/api/plan', v, { timeout: 6000 });
  if (mine === seq && res.ok && res.data?.grid) render(res.data, 'server');
}

export function initPlanner() {
  const sel = $('#pl-purpose'), lux = $('#pl-lux');
  sel.innerHTML = Object.entries(PURPOSES).map(([k, p]) => `<option value="${k}" ${k === 'living' ? 'selected' : ''}>${esc(p.label)} (${p.lux} lux)</option>`).join('');
  lux.value = PURPOSES.living.lux;
  sel.addEventListener('change', () => { if (!luxTouched) lux.value = PURPOSES[sel.value].lux; });
  lux.addEventListener('input', () => { luxTouched = true; });
  const debounced = debounce(run, 220);
  $('#planner-form').addEventListener('input', debounced);
  $('#planner-form').addEventListener('submit', (e) => e.preventDefault());
  $('#planner-send').addEventListener('click', () => {
    if (!last) return;
    const { input, lumenMethod, result, energy, tunedLumens, layout } = last;
    const compact = { input, fixtures: lumenMethod.fixtures, tunedLumens, layout, avgLux: result.tuned.avgLux, uniformity: result.tuned.uniformity, energy };
    openQuote({ plan: compact, room: PURPOSES[input.purpose]?.label });
  });
  run();
}
