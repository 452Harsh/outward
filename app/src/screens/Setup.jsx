import { useEffect, useState } from 'preact/hooks';
import { getMeta, setMeta } from '../db/index.js';
import { getChosenModel, isInstalled } from '../ai/llm.js';
import { detectWebGPU, formatBytes, getOfflineStatus, getStorageInfo, isAndroid } from '../lib/device.js';
import BatteryTip from './BatteryTip.jsx';
import ModelDownload from './ModelDownload.jsx';

export default function Setup({ onDone }) {
  const [offline, setOffline] = useState(null);
  const [storage, setStorage] = useState(null);
  const [gpu, setGpu] = useState(null);
  const [model, setModel] = useState(null);
  const [modelReady, setModelReady] = useState(null);
  const [skipped, setSkipped] = useState(false);
  const [showTip, setShowTip] = useState(false);

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
    getChosenModel().then(async (m) => {
      if (cancelled) return;
      setModel(m);
      setModelReady(await isInstalled(m).catch(() => false));
    });
    getMeta('batteryTipSeen', false).then((seen) => !cancelled && setShowTip(isAndroid() && !seen));
    return () => {
      cancelled = true;
    };
  }, []);

  const devMode = import.meta.env.DEV;
  const appReady = offline?.ready || devMode || offline?.supported === false;
  const ready = appReady && (modelReady || skipped);

  return (
    <main class="screen">
      <header>
        <p class="eyebrow">Setup</p>
        <h1>{ready ? 'Ready. No internet needed.' : 'Getting Outward ready'}</h1>
        <p class="lede">Outward downloads everything once, then works in airplane mode.</p>
      </header>

      <ul class="checklist">
        <li class={offline?.ready ? 'done' : 'pending'}>
          <span>App and story</span>
          <span>{offline?.ready ? 'Saved offline' : offline === null ? 'Checking…' : devMode ? 'Dev mode' : 'Saving…'}</span>
        </li>
        <li class={modelReady ? 'done' : 'pending'}>
          <span>Storyteller</span>
          <span>{modelReady ? 'Saved offline' : skipped ? 'Pre-written story' : model ? formatBytes(model.bytes) : '…'}</span>
        </li>
        <li class={gpu === null ? 'pending' : gpu.supported ? 'done' : 'warn'}>
          <span>GPU (WebGPU)</span>
          <span>{gpu === null ? 'Checking…' : gpu.supported ? 'Supported' : 'Not supported, using CPU'}</span>
        </li>
        <li class={storage?.persisted ? 'done' : 'pending'}>
          <span>Storage</span>
          <span>{storage ? `${storage.persisted ? 'Persistent' : 'Best effort'} · ${formatBytes(storage.quota)} free` : '…'}</span>
        </li>
      </ul>

      {model && modelReady === false && !skipped && (
        <>
          <ModelDownload model={model} onInstalled={() => setModelReady(true)} />
          <button class="link" onClick={() => setSkipped(true)}>
            Skip for now and use the pre-written story
          </button>
        </>
      )}

      {gpu && !gpu.supported && (
        <p class="note warn">
          This browser has no WebGPU ({gpu.reason}). The storyteller still runs on the CPU, a little slower.
        </p>
      )}
      {offline && !offline.supported && <p class="note warn">This browser can't save the app for offline use.</p>}

      {showTip && (
        <BatteryTip
          onDismiss={() => {
            setShowTip(false);
            setMeta('batteryTipSeen', true);
          }}
        />
      )}

      <footer class="actions">
        <button class="btn primary big" onClick={onDone} disabled={!ready}>
          {ready ? 'Begin' : 'Finish setup to begin'}
        </button>
      </footer>
    </main>
  );
}
