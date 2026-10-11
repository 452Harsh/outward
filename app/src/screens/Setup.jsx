import { useEffect, useRef, useState } from 'preact/hooks';
import { getMeta, setMeta } from '../db/index.js';
import { MODEL_SOURCE, downloadModel, getChosenModel, isInstalled } from '../ai/llm.js';
import { downloadSpeech, isSpeechInstalled, speechBytes } from '../ai/stt.js';
import { detectWebGPU, formatBytes, getConnection, getOfflineStatus, getStorageInfo, isAndroid } from '../lib/device.js';
import { sfx } from '../lib/sfx.js';
import Icon from '../ui/icons.jsx';
import Sprig from '../ui/Sprig.jsx';
import { Bubble } from '../ui/widgets.jsx';
import BatteryTip from './BatteryTip.jsx';

/** First launch: Sprig packs the backpack while the storyteller and voice download. */
export default function Setup({ onDone }) {
  const [offline, setOffline] = useState(null);
  const [storage, setStorage] = useState(null);
  const [gpu, setGpu] = useState(null);
  const [model, setModel] = useState(null);
  const [modelReady, setModelReady] = useState(null);
  const [speechReady, setSpeechReady] = useState(null);
  const [skipped, setSkipped] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [dl, setDl] = useState({ state: 'idle', speech: 0, model: 0, error: null });
  const abort = useRef(null);
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
    getChosenModel().then(async (m) => {
      if (cancelled) return;
      setModel(m);
      setModelReady(await isInstalled(m).catch(() => false));
    });
    isSpeechInstalled().then((ok) => !cancelled && setSpeechReady(ok), () => setSpeechReady(false));
    getMeta('batteryTipSeen', false).then((seen) => !cancelled && setShowTip(isAndroid() && !seen));
    return () => {
      cancelled = true;
    };
  }, []);

  const devMode = import.meta.env.DEV;
  const appReady = offline?.ready || devMode || offline?.supported === false;
  const ready = appReady && ((modelReady && speechReady) || skipped);
  const needBytes = (speechReady ? 0 : speechBytes) + (modelReady || !model ? 0 : model.bytes);
  const packing = dl.state === 'downloading';

  const download = async () => {
    sfx('tap');
    setDl({ state: 'downloading', speech: 0, model: 0, error: null });
    abort.current = new AbortController();
    try {
      if (!speechReady) {
        await downloadSpeech({ onProgress: (done, total) => setDl((d) => ({ ...d, speech: done / total })) });
        setSpeechReady(true);
      }
      if (!modelReady) {
        await downloadModel(model.id, {
          signal: abort.current.signal,
          onProgress: (done, total) => setDl((d) => ({ ...d, model: done / total })),
        });
        setModelReady(true);
      }
      setDl((d) => ({ ...d, state: 'done' }));
      sfx('complete');
    } catch (err) {
      setDl((d) => ({ ...d, state: abort.current.signal.aborted ? 'idle' : 'error', error: String(err?.message ?? err) }));
    }
  };

  const pct = (v) => `${Math.round(v * 100)}%`;
  const items = [
    { key: 'app', label: 'App and story', done: offline?.ready || devMode, status: offline?.ready ? 'packed' : devMode ? 'dev mode' : 'packing…' },
    {
      key: 'voice',
      label: `Voice (${formatBytes(speechBytes)})`,
      done: speechReady,
      status: speechReady ? 'packed' : packing ? pct(dl.speech) : skipped ? 'typing only' : 'to pack',
    },
    {
      key: 'model',
      label: `Storyteller (${model ? formatBytes(model.bytes) : '…'})`,
      done: modelReady,
      status: modelReady ? 'packed' : packing ? pct(dl.model) : skipped ? 'pre-written story' : 'to pack',
    },
  ];

  return (
    <main class="screen">
      <div class="stage-sprig">
        <Bubble>
          {ready
            ? 'All packed! From here on, no internet needed.'
            : packing
              ? 'Packing the backpack… keep this screen open.'
              : `Let me pack for our first walk. It's ${formatBytes(needBytes)}, once.`}
        </Bubble>
        <Sprig state={ready ? 'celebrating' : packing ? 'ready' : 'idle'} size={150} />
      </div>

      <ul class="pack-list" aria-label="Backpack">
        {items.map((it) => (
          <li key={it.key} class={it.done ? 'done' : ''}>
            {it.done ? (
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12l5 5L20 6" stroke="var(--good)" stroke-width="3" fill="none" />
              </svg>
            ) : (
              <Icon name="map" size={20} />
            )}
            {it.label}
            <b>{it.status}</b>
          </li>
        ))}
      </ul>

      {packing && <progress max="1" value={((dl.speech * speechBytes) + dl.model * (model?.bytes ?? 0)) / Math.max(1, needBytes)} />}
      {dl.state === 'error' && <p class="note warn">Download stopped: {dl.error}. Check the connection and try again.</p>}
      {!ready && !packing && (conn.type === 'cellular' || conn.saveData) && (
        <p class="note warn">You're on mobile data. Connect to Wi-Fi first if you can.</p>
      )}
      {gpu && !gpu.supported && <p class="note">No WebGPU here, so the storyteller runs on the CPU, a little slower.</p>}
      {storage && <p class="hint center-text">{storage.persisted ? 'Saved permanently' : 'Saved'} on this phone · {formatBytes(storage.quota)} free</p>}

      {showTip && (
        <BatteryTip
          onDismiss={() => {
            setShowTip(false);
            setMeta('batteryTipSeen', true);
          }}
        />
      )}

      <footer class="actions">
        {ready ? (
          <button class="btn primary big" onClick={onDone}>
            Let's go
          </button>
        ) : packing ? (
          <button class="btn big" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        ) : (
          <>
            <button class="btn primary big" onClick={download} disabled={!conn.online || !model || needBytes === 0}>
              {dl.state === 'error' ? 'Try again' : `Pack ${formatBytes(needBytes)}`}
            </button>
            <button class="link" onClick={() => setSkipped(true)}>
              Skip for now (pre-written story, typing only)
            </button>
          </>
        )}
      </footer>
      <p class="hint center-text">
        Storyteller from {MODEL_SOURCE === 'render' && model?.serveFromRender ? 'the Outward server' : 'Hugging Face'}, voice from Hugging Face.
      </p>
    </main>
  );
}
