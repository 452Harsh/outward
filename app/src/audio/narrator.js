// Narration: pre-recorded ElevenLabs clips through one <audio> element (keeps
// playing with the screen off, with lock-screen controls via Media Session),
// and the device voice for text the model writes on the fly.
import manifest from '@outward/content/audio/manifest.json';
import { speak, stopSpeaking } from '../lib/device.js';

let el = null;

function player() {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
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
    album: 'Outward: The Quiet Atlas',
    artwork: [{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' }],
  });
}

export const hasClip = (id) => Boolean(manifest.clips[id]);

/**
 * Play a fixed narration clip, or read `fallbackText` with the device voice
 * if the clip hasn't been generated yet.
 * @returns {Promise<'clip'|'voice'>}
 */
export async function playClip(id, fallbackText, title = 'Outward') {
  stopNarration();
  const clip = manifest.clips[id];
  if (!clip) {
    speak(fallbackText);
    return 'voice';
  }
  const a = player();
  a.src = `/audio/${clip.file}`;
  setNowPlaying(title);
  try {
    await a.play();
    return 'clip';
  } catch {
    speak(fallbackText);
    return 'voice';
  }
}

/** Model-written text has no recording; it is read by the device voice. */
export function speakText(text) {
  stopNarration();
  speak(text);
}

export function stopNarration() {
  if (el) el.pause();
  stopSpeaking();
}
