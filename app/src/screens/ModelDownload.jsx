import { useRef, useState } from 'preact/hooks';
import { formatBytes, getConnection } from '../lib/device.js';
import { MODEL_SOURCE, downloadModel } from '../ai/llm.js';

/** Download card for one model: exact size, Wi-Fi warning, progress, cancel, retry. */
export default function ModelDownload({ model, installed, onInstalled, cta = 'Download' }) {
  const [state, setState] = useState(installed ? 'done' : 'idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const abort = useRef(null);
  const conn = getConnection();
  const onMobileData = conn.type === 'cellular' || conn.saveData;
  const source = MODEL_SOURCE === 'render' && model.serveFromRender ? 'Outward server' : 'Hugging Face';

  const start = async () => {
    setState('downloading');
    setError(null);
    setProgress(0);
    abort.current = new AbortController();
    try {
      const rec = await downloadModel(model.id, {
        signal: abort.current.signal,
        onProgress: (done, total) => setProgress(done / total),
      });
      setState('done');
      onInstalled?.(rec);
    } catch (err) {
      setState(abort.current.signal.aborted ? 'idle' : 'error');
      if (!abort.current.signal.aborted) setError(String(err?.message ?? err));
    }
  };

  return (
    <section class="card download">
      <p class="eyebrow">Storyteller model</p>
      <h2>{model.description}</h2>
      <p class="size">
        {formatBytes(model.bytes)} <span>({model.bytes.toLocaleString('en')} bytes) · from {source}</span>
      </p>

      {state === 'idle' && onMobileData && <p class="note warn">You're on mobile data. Connect to Wi-Fi first if you can.</p>}
      {state === 'idle' && !conn.online && <p class="note warn">You're offline. Connect to download.</p>}

      {state === 'downloading' && (
        <>
          <progress max="1" value={progress} />
          <p class="hint">
            {formatBytes(progress * model.bytes)} of {formatBytes(model.bytes)}. Keep this screen open.
          </p>
          <button class="btn" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </>
      )}
      {state === 'error' && <p class="note warn">Download failed: {error}</p>}
      {state === 'done' && <p class="note safe">Saved on this phone. Works offline.</p>}
      {(state === 'idle' || state === 'error') && (
        <button class="btn primary" onClick={start} disabled={!conn.online}>
          {state === 'error' ? 'Try again' : cta}
        </button>
      )}
    </section>
  );
}
