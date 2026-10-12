// Renders every site video in sequence (needs `npm run dev` running). ~20 min on an integrated GPU.
//   node tools/render-all.mjs            all clips
//   node tools/render-all.mjs hero lamp  only clips whose output name contains a given word
import { spawnSync } from 'node:child_process';

const L = ['--w', '1920', '--h', '1080'], P = ['--w', '1080', '--h', '1920'];
const S = ['--w', '1080', '--h', '1350'];       // 4:5 product plates
const Q = ['--w', '960', '--h', '960'];         // square craft specimens
const T = ['--w', '720', '--h', '900', '--scrub'];
const jobs = [
  ['intro-pull', ...L, '--scrub', '--max', '6000000'],
  ['intro-pull', ...P, '--scrub', '--out', 'intro-pull-m', '--max', '6000000'],
  ['intro', ...L, '--crf', '25'],
  ['intro', ...P, '--out', 'intro-m', '--crf', '25'],
  ['hero', ...L], ['hero', ...P, '--out', 'hero-m'],
  ['room-unlit', ...L], ['room-lit', ...L],
  ['room-unlit', ...P, '--out', 'room-unlit-m'], ['room-lit', ...P, '--out', 'room-lit-m'],
  ...['pendant', 'sconce', 'table', 'floor', 'ceiling'].map((k, i) => [`lamp-${k}`, ...S, '--out', `lamp-${i + 1}`]),
  ...['glass', 'brass', 'patina', 'walnut-linen'].map((k) => [`craft-${k}`, ...Q]),
  ['table-lamp-on', ...T], ['table-lamp-off', ...T],
];
const only = process.argv.slice(2);
for (const job of jobs) {
  const name = job.includes('--out') ? job[job.indexOf('--out') + 1] : job[0];
  if (only.length && !only.some((o) => name.includes(o))) continue;
  console.log(`\n=== ${name} ===`);
  const r = spawnSync('node', ['tools/render.mjs', ...job, ...(process.env.RENDER_BASE ? ['--base', process.env.RENDER_BASE] : [])], { stdio: 'inherit' });
  if (r.status !== 0) console.error(`!! ${name} failed (exit ${r.status})`);
}
console.log('\nall done');
