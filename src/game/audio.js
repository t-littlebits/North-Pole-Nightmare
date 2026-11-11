// Synthesised sound effects + a tiny festive tune. No audio files needed.
import { getSettings } from '../lib/settings.js';

let ctx = null;
const last = {};
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0) {
  const c = ac();
  if (!c) return;
  const s = getSettings();
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol * s.volume, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const SFX = {
  shoot: () => tone(520, 0.06, 'square', 0.05, 320),
  hit: () => tone(180, 0.05, 'sawtooth', 0.05, 90),
  kill: () => tone(300, 0.09, 'triangle', 0.09, 120),
  gem: () => tone(880, 0.05, 'sine', 0.06, 1320),
  hurt: () => tone(140, 0.2, 'sawtooth', 0.14, 60),
  special: () => { tone(220, 0.25, 'sawtooth', 0.12, 660); tone(330, 0.3, 'square', 0.07, 990); },
  boom: () => tone(110, 0.25, 'sawtooth', 0.16, 40),
  present: () => { tone(660, 0.08, 'square', 0.09); tone(880, 0.08, 'square', 0.09, null, 0.08); tone(1320, 0.14, 'square', 0.09, null, 0.16); },
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.1, null, i * 0.09)),
  boss: () => { tone(98, 0.6, 'sawtooth', 0.18, 70); tone(147, 0.6, 'square', 0.1, 100, 0.05); },
  wave: () => { tone(392, 0.12, 'triangle', 0.1); tone(523, 0.18, 'triangle', 0.1, null, 0.12); },
  over: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, null, i * 0.22)),
  click: () => tone(700, 0.04, 'square', 0.05),
  claim: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'square', 0.09, null, i * 0.08))
};

export function sfx(name) {
  if (!getSettings().sfx) return;
  const now = performance.now();
  const gap = name === 'hit' || name === 'shoot' || name === 'gem' || name === 'kill' ? 55 : 0;
  if (gap && now - (last[name] || 0) < gap) return;
  last[name] = now;
  SFX[name]?.();
}

// "Jingle Bells" (public domain), looped quietly in the background.
const E = 329.63, G = 392, C = 261.63, D = 293.66, F = 349.23, A = 440;
const TUNE = [
  [E, 1], [E, 1], [E, 2], [E, 1], [E, 1], [E, 2], [E, 1], [G, 1], [C, 1.5], [D, 0.5], [E, 4],
  [F, 1], [F, 1], [F, 1.5], [F, 0.5], [F, 1], [E, 1], [E, 1], [E, 0.5], [E, 0.5], [E, 1], [D, 1], [D, 1], [E, 1], [D, 2], [G, 2],
  [E, 1], [E, 1], [E, 2], [E, 1], [E, 1], [E, 2], [E, 1], [G, 1], [C, 1.5], [D, 0.5], [E, 4],
  [F, 1], [F, 1], [F, 1.5], [F, 0.5], [F, 1], [E, 1], [E, 1], [E, 0.5], [E, 0.5], [G, 1], [G, 1], [F, 1], [D, 1], [C, 4], [A, 0]
];
let musicTimer = null;
let musicOn = false;

export function startMusic() {
  if (musicOn || !getSettings().music) return;
  musicOn = true;
  let i = 0;
  const beat = 0.21;
  const step = () => {
    if (!musicOn) return;
    if (!getSettings().music) { stopMusic(); return; }
    const [f, len] = TUNE[i % TUNE.length];
    if (len > 0) tone(f, len * beat * 0.9, 'triangle', 0.07);
    i++;
    musicTimer = setTimeout(step, Math.max(1, len) * beat * 1000);
  };
  step();
}
export function stopMusic() {
  musicOn = false;
  clearTimeout(musicTimer);
}
