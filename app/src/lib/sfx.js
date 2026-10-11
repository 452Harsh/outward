// Tiny sound effects synthesised with Web Audio: no audio files to download.
// Only played in direct response to a tap or a finished mission (screen on).
let ctx = null;
let enabled = true;

export function setSfxEnabled(on) {
  enabled = on;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.12 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

const SOUNDS = {
  tap: (t) => tone(520, t, 0.08, { type: 'triangle', gain: 0.08 }),
  found: (t) => [660, 880].forEach((f, i) => tone(f, t + i * 0.09, 0.25)),
  complete: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.35, { type: 'triangle' })),
  levelup: (t) => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.08, 0.4, { type: 'square', gain: 0.05 })),
  badge: (t) => [988, 1319].forEach((f, i) => tone(f, t + i * 0.12, 0.5, { gain: 0.1 })),
};

export function sfx(name) {
  if (!enabled || document.hidden || !SOUNDS[name]) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name](ctx.currentTime + 0.01);
  } catch {
    // Sound is decoration; never break the app over it.
  }
}
