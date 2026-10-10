import { useEffect, useState } from 'preact/hooks';
import { detectWebGPU, formatBytes, getConnection, getOfflineStatus, getStorageInfo } from '../lib/device.js';

// Downloads listed here grow in later phases (story model, voice model, narration audio).
export default function Setup({ onDone }) {
  const [offline, setOffline] = useState(null);
  const [storage, setStorage] = useState(null);
  const [gpu, setGpu] = useState(null);
  const conn = getConnection();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const status = await getOfflineStatus();
      if (cancelled) return;
      setOffline(status);
      if (status.supported && !status.ready) setTimeout(check, 1500);
    };
    check();
    getStorageInfo().then((s) => !cancelled && setStorage(s));
    detectWebGPU().then((g) => !cancelled && setGpu(g));
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = offline?.ready;
  const devMode = import.meta.env.DEV;

  return (
    <main class="screen">
      <header>
        <p class="eyebrow">Setup</p>
        <h1>{ready ? 'Ready. No internet needed.' : 'Getting Outward ready'}</h1>
        <p class="lede">Outward downloads everything once, then works in airplane mode.</p>
      </header>

      <ul class="checklist">
        <li class={ready ? 'done' : 'pending'}>
          <span>App and story</span>
          <span>{ready ? 'Saved offline' : offline === null ? 'Checking…' : 'Saving…'}</span>
        </li>
        <li class={gpu === null ? 'pending' : gpu.supported ? 'done' : 'warn'}>
          <span>On-device AI (WebGPU)</span>
          <span>
            {gpu === null ? 'Checking…' : gpu.supported ? (gpu.f16 ? 'Supported' : 'Supported (f32)') : 'Not supported'}
          </span>
        </li>
        <li class={storage?.persisted ? 'done' : 'pending'}>
          <span>Storage</span>
          <span>
            {storage ? `${storage.persisted ? 'Persistent' : 'Best effort'} · ${formatBytes(storage.quota)} free` : '…'}
          </span>
        </li>
      </ul>

      {gpu && !gpu.supported && (
        <p class="note warn">
          This browser can't run the AI storyteller ({gpu.reason}). Stories still work with pre-written narration.
          For the full experience use Chrome on Android, or Safari on iOS 26+.
        </p>
      )}
      {conn.type === 'cellular' || conn.saveData ? (
        <p class="note warn">You're on mobile data. The AI model is large, so connect to Wi-Fi for the first download.</p>
      ) : null}
      {offline && !offline.supported && <p class="note warn">This browser can't save the app for offline use.</p>}
      {devMode && <p class="note">Dev server: offline caching only works in a production build (npm run build && npm start).</p>}

      <footer class="actions">
        <button class="btn primary" onClick={onDone} disabled={!ready && !devMode && offline?.supported !== false}>
          {ready ? 'Begin' : 'Waiting for download…'}
        </button>
      </footer>
    </main>
  );
}
