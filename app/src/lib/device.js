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

let gpuPromise = null;

/** WebGPU support plus adapter details (cached; requesting an adapter is not free). */
export function detectWebGPU() {
  gpuPromise ??= (async () => {
    if (!navigator.gpu) return { supported: false, f16: false, reason: 'WebGPU is not available in this browser' };
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return { supported: false, f16: false, reason: 'No compatible GPU adapter' };
      const info = adapter.info ?? {};
      const l = adapter.limits;
      return {
        supported: true,
        f16: adapter.features.has('shader-f16'),
        fallbackAdapter: !!(info.isFallbackAdapter ?? adapter.isFallbackAdapter),
        vendor: info.vendor || '',
        architecture: info.architecture || '',
        device: info.device || '',
        description: info.description || '',
        features: [...adapter.features].sort(),
        limits: {
          maxBufferSize: l.maxBufferSize,
          maxStorageBufferBindingSize: l.maxStorageBufferBindingSize,
          maxComputeWorkgroupStorageSize: l.maxComputeWorkgroupStorageSize,
          maxComputeInvocationsPerWorkgroup: l.maxComputeInvocationsPerWorkgroup,
        },
      };
    } catch (err) {
      return { supported: false, f16: false, reason: String(err?.message ?? err) };
    }
  })();
  return gpuPromise;
}

export function getDeviceInfo() {
  return {
    // Chrome caps deviceMemory at 8 (GB) and rounds down for privacy.
    deviceMemoryGB: navigator.deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null,
    crossOriginIsolated: !!window.crossOriginIsolated,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    android: /Android/i.test(navigator.userAgent),
    userAgent: navigator.userAgent,
  };
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

/** Decimal units (1 MB = 1,000,000 bytes), matching Hugging Face and download sizes. */
export function formatBytes(n) {
  if (!n) return '0 MB';
  return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(n / 1e6).toFixed(1)} MB`;
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}
