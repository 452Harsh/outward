// Small wrappers around device APIs. All of them degrade silently when unsupported.

export const haptics = {
  missionStart: [200, 100, 200],
  found: [80],
  chapterEnd: [300, 150, 300, 150, 600],
};

export function buzz(pattern) {
  navigator.vibrate?.(pattern);
}

// Phase 1 narration uses the device's built-in voice. Phase 3 swaps fixed
// narration for cached ElevenLabs audio.
export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export async function detectWebGPU() {
  if (!navigator.gpu) return { supported: false, f16: false, reason: 'WebGPU is not available in this browser' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: false, f16: false, reason: 'No compatible GPU adapter' };
    return { supported: true, f16: adapter.features.has('shader-f16') };
  } catch (err) {
    return { supported: false, f16: false, reason: String(err?.message ?? err) };
  }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

/** Whether the service worker is active and the app shell + story are precached. */
export async function getOfflineStatus() {
  if (!('serviceWorker' in navigator)) return { supported: false, ready: false };
  const reg = await withTimeout(navigator.serviceWorker.ready, 8000);
  if (!reg?.active) return { supported: true, ready: false };
  const keys = await caches.keys();
  return { supported: true, ready: keys.some((k) => k.includes('precache')) };
}

export async function getStorageInfo() {
  const persisted = (await navigator.storage?.persist?.()) ?? false;
  const est = (await navigator.storage?.estimate?.()) ?? {};
  return { persisted, usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

export function getConnection() {
  const c = navigator.connection;
  return { online: navigator.onLine, type: c?.type, effectiveType: c?.effectiveType, saveData: !!c?.saveData };
}

export function formatBytes(n) {
  if (!n) return '0 MB';
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`;
}
