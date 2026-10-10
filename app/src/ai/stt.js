// On-device speech-to-text (Whisper tiny.en). Nothing leaves the phone.
import { getSpeechModel } from '@outward/content/models';
import { getMeta, setMeta } from '../db/index.js';

const CACHE = 'transformers-cache';
const speech = getSpeechModel();
let worker = null;
let nextId = 0;
const pending = new Map();

function call(type, payload = {}, onProgress) {
  worker ??= new Worker(new URL('./stt.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.type === 'progress') return p.onProgress?.(data.loaded);
    pending.delete(data.id);
    data.type === 'error' ? p.reject(new Error(data.error)) : p.resolve(data);
  };
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type, ...payload }, payload.audio ? [payload.audio.buffer] : []);
  });
}

const fileUrl = (path) => `https://huggingface.co/${speech.repo}/resolve/${speech.revision}/${path}`;

export const speechBytes = speech.bytes;

/** True when every Whisper file for the current revision is in the cache. */
export async function isSpeechInstalled() {
  if (!('caches' in self)) return false;
  const cache = await caches.open(CACHE);
  const hits = await Promise.all(speech.files.map((f) => cache.match(fileUrl(f.path))));
  return hits.every(Boolean);
}

export async function downloadSpeech({ onProgress } = {}) {
  await call('load', {}, (loaded) => onProgress?.(Math.min(loaded, speech.bytes), speech.bytes));
  // Drop files from older revisions so a new version doesn't double the storage.
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    if (req.url.includes(`/${speech.repo}/`) && !req.url.includes(speech.revision)) await cache.delete(req);
  }
  await setMeta('speech', { id: speech.id, revision: speech.revision, installedAt: Date.now() });
}

export async function getSpeechRecord() {
  return getMeta('speech', null);
}

/**
 * @param {Float32Array} audio mono PCM at 16 kHz
 * @returns {Promise<{text: string, ms: number}>}
 */
export async function transcribe(audio) {
  const { text, ms } = await call('transcribe', { audio });
  return { text: cleanTranscript(text), ms };
}

/** Whisper marks silence and noise like "[BLANK_AUDIO]" or "(wind blowing)". */
export function cleanTranscript(text) {
  return String(text ?? '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
