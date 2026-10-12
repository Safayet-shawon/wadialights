// Mechanical switch click, synthesised with Web Audio so no binary asset is needed.
// Nothing is created or played until a user gesture has called unlock().
let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem('wl-sound') !== 'off'; } catch { /* storage unavailable */ }

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
}

export const isSoundOn = () => enabled;

export function setSound(on) {
  enabled = on;
  try { localStorage.setItem('wl-sound', on ? 'on' : 'off'); } catch { /* ignore */ }
}

function noiseBurst(t, dur, freq, gain) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.4;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
}

function thump(t, from, to, dur, gain) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

/** two-stage pull-chain switch: latch, then the return tick. */
export function playClick() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + 0.005;
  noiseBurst(t, 0.012, 3400, 0.5);
  thump(t, 220, 70, 0.07, 0.5);
  thump(t, 3100, 2100, 0.05, 0.06);
  noiseBurst(t + 0.07, 0.01, 2400, 0.22);
  thump(t + 0.07, 160, 80, 0.05, 0.2);
}
