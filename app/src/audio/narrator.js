// Narration: pre-recorded ElevenLabs clips through one <audio> element (keeps
// playing with the screen off, with lock-screen controls via Media Session),
// and the device voice for text the model writes on the fly.
//
// It also publishes what is being said, so Sprig's mouth and the captions can
// follow along: onNarration() for the line and current word, onMouth() for a
// 0..1 mouth value per frame. Clip loudness comes from decoding the cached file
// (not from routing playback through Web Audio, which could silence narration
// when Chrome suspends a pocketed page).
import manifest from '@outward/content/audio/manifest.json';

let el = null;
let raf = 0;
let mouthTarget = 0;
let mouthNow = 0;
let state = { active: false, text: '', words: [], index: -1, source: null };
const lineListeners = new Set();
const mouthListeners = new Set();
const envelopes = new Map();

/** Narration for the bundled story; factory packs carry their own { base, clips }. */
export const bundledAudio = { base: '/audio/', clips: manifest.clips };

export const hasClip = (id, audio = bundledAudio) => Boolean(audio.clips?.[id]);

export function onNarration(fn) {
  lineListeners.add(fn);
  fn(state);
  return () => lineListeners.delete(fn);
}

export function onMouth(fn) {
  mouthListeners.add(fn);
  return () => mouthListeners.delete(fn);
}

function emit(patch) {
  const next = { ...state, ...patch };
  if (next.active === state.active && next.index === state.index && next.text === state.text) return;
  state = next;
  for (const f of lineListeners) f(state);
}

function setMouth(v) {
  for (const f of mouthListeners) f(v);
}

const wordsOf = (text) => String(text ?? '').split(/\s+/).filter(Boolean);

function player() {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.addEventListener('ended', finish);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => el.play());
      navigator.mediaSession.setActionHandler('pause', () => el.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        el.currentTime = Math.max(0, el.currentTime - 10);
      });
    }
  }
  return el;
}

function setNowPlaying(title) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: 'The Archivist',
    album: 'Outward',
    artwork: [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }],
  });
}

/** 20 loudness values per second for a clip, decoded once and kept in memory. */
async function envelope(url) {
  if (envelopes.has(url)) return envelopes.get(url);
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    const audio = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(bytes);
    const data = audio.getChannelData(0);
    const step = Math.floor(audio.sampleRate / 20);
    const track = [];
    for (let i = 0; i < data.length; i += step) {
      let sum = 0;
      const end = Math.min(i + step, data.length);
      for (let j = i; j < end; j++) sum += data[j] * data[j];
      track.push(Math.sqrt(sum / (end - i)));
    }
    const peak = Math.max(...track) || 1;
    const env = track.map((v) => Math.min(1, (v / peak) * 1.3));
    envelopes.set(url, env);
    return env;
  } catch {
    envelopes.set(url, null);
    return null;
  }
}

/** Index of the word being spoken, spreading words over the clip by length. */
function wordAt(words, fraction) {
  const weights = words.map((w) => w.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < words.length; i++) {
    acc += weights[i];
    if (acc / total >= fraction) return i;
  }
  return words.length - 1;
}

function loop(env) {
  cancelAnimationFrame(raf);
  const tick = () => {
    if (!state.active) return;
    if (state.source === 'clip' && el) {
      const t = el.currentTime;
      const d = el.duration || 1;
      mouthNow = env ? env[Math.min(env.length - 1, Math.floor(t * 20))] ?? 0 : 0.35 + 0.3 * Math.abs(Math.sin(t * 9));
      if (el.paused) mouthNow = 0;
      emit({ index: wordAt(state.words, t / d) });
    } else {
      // Device voice: each word boundary opens the mouth, then it relaxes.
      mouthNow += (mouthTarget - mouthNow) * 0.35;
      mouthTarget *= 0.86;
    }
    setMouth(mouthNow);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function finish() {
  cancelAnimationFrame(raf);
  mouthTarget = 0;
  mouthNow = 0;
  setMouth(0);
  emit({ active: false, index: state.words.length - 1 });
}

function speakVoice(text) {
  const words = wordsOf(text);
  emit({ active: true, text, words, index: -1, source: 'voice' });
  if (!('speechSynthesis' in window)) {
    finish();
    return 'none';
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.onboundary = (e) => {
    if (e.name && e.name !== 'word') return;
    const before = text.slice(0, e.charIndex);
    emit({ index: wordsOf(before).length });
    mouthTarget = 1;
  };
  u.onend = finish;
  u.onerror = finish;
  speechSynthesis.speak(u);
  loop(null);
  return 'voice';
}

/**
 * Play a fixed narration clip, or read `text` with the device voice if the
 * clip hasn't been generated yet.
 * @returns {Promise<'clip'|'voice'|'none'>}
 */
export async function playClip(id, text, title = 'Outward', audio = bundledAudio) {
  stopNarration();
  const clip = audio?.clips?.[id];
  if (!clip) return speakVoice(text);
  const url = `${audio.base}${clip.file}`;
  const a = player();
  a.src = url;
  setNowPlaying(title);
  emit({ active: true, text, words: wordsOf(text), index: -1, source: 'clip' });
  try {
    const [env] = await Promise.all([envelope(url), a.play()]);
    loop(env);
    return 'clip';
  } catch {
    return speakVoice(text);
  }
}

/** Model-written text has no recording; it is read by the device voice. */
export function speakText(text) {
  stopNarration();
  return speakVoice(text);
}

export function stopNarration() {
  if (el) el.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (state.active) finish();
}
