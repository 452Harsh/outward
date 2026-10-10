// Continuous background audio + Media Session. Chrome keeps pages that are
// playing audio alive with the screen off; this is the mechanism narration
// (phase 3) will use. For now it plays a quiet generated wind bed.

let audio = null;

function windWav(seconds = 12, rate = 16000) {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  // Brown noise with a slow swell, faded at both ends so the loop is seamless.
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    const swell = 0.6 + 0.4 * Math.sin((2 * Math.PI * i) / n);
    const fade = Math.min(1, i / 1600, (n - i) / 1600);
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, last * 3.5 * swell * fade)) * 32767, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * @param {(type: string, data?: object) => void} log
 */
export async function startAmbient(log, { volume = 0.25 } = {}) {
  if (audio) return audio;
  const el = new Audio(URL.createObjectURL(windWav()));
  el.loop = true;
  el.volume = volume;
  for (const ev of ['playing', 'pause', 'ended', 'stalled', 'suspend', 'error']) {
    el.addEventListener(ev, () => log(`audio_${ev}`, { at: Math.round(el.currentTime * 10) / 10 }));
  }
  audio = el;
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Walking: The Quiet Atlas',
      artist: 'Outward',
      artwork: [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => audio?.play());
    navigator.mediaSession.setActionHandler('pause', () => audio?.pause());
  }
  await audio.play();
  return audio;
}

/** Seconds of audio actually played (loops counted), for continuity checks. */
let playedBase = 0;
let lastTime = 0;
export function audioProgress() {
  if (!audio) return null;
  if (audio.currentTime < lastTime) playedBase += audio.duration || 0;
  lastTime = audio.currentTime;
  return { playing: !audio.paused, played: Math.round((playedBase + audio.currentTime) * 10) / 10 };
}

export function stopAmbient() {
  if (!audio) return;
  audio.pause();
  URL.revokeObjectURL(audio.src);
  audio = null;
  playedBase = 0;
  lastTime = 0;
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
}
