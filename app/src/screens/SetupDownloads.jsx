import { useRef, useState } from 'preact/hooks';
import { MODEL_SOURCE, downloadModel } from '../ai/llm.js';
import { downloadSpeech, speechBytes } from '../ai/stt.js';
import { formatBytes, getConnection } from '../lib/device.js';

/**
 * First-run download of everything the phone needs offline: the storyteller
 * model and the voice model. One button, exact sizes, one progress bar.
 */
export default function SetupDownloads({ model, needModel, needSpeech, onDone }) {
  const [state, setState] = useState('idle');
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState(null);
  const abort = useRef(null);
  const conn = getConnection();

  const parts = [
    needSpeech && { key: 'speech', label: 'Voice (Whisper tiny, speech to text)', bytes: speechBytes, source: 'Hugging Face' },
    needModel && {
      key: 'model',
      label: `Storyteller (${model.description.split('.')[0]})`,
      bytes: model.bytes,
      source: MODEL_SOURCE === 'render' && model.serveFromRender ? 'Outward server' : 'Hugging Face',
    },
  ].filter(Boolean);
  const total = parts.reduce((n, p) => n + p.bytes, 0);

  const start = async () => {
    setState('downloading');
    setError(null);
    abort.current = new AbortController();
    let base = 0;
    try {
      for (const p of parts) {
        setCurrent(p.label);
        const onProgress = (loaded) => setDone(base + loaded);
        if (p.key === 'speech') await downloadSpeech({ onProgress });
        else await downloadModel(model.id, { signal: abort.current.signal, onProgress });
        base += p.bytes;
        setDone(base);
      }
      setState('done');
      onDone();
    } catch (err) {
      setState(abort.current.signal.aborted ? 'idle' : 'error');
      if (!abort.current.signal.aborted) setError(String(err?.message ?? err));
    }
  };

  return (
    <section class="card download">
      <p class="eyebrow">Download once, then go offline</p>
      <ul class="parts">
        {parts.map((p) => (
          <li key={p.key}>
            <span>{p.label}</span>
            <span>
              {formatBytes(p.bytes)} · {p.source}
            </span>
          </li>
        ))}
      </ul>
      <p class="size">
        {formatBytes(total)} <span>({total.toLocaleString('en')} bytes in total)</span>
      </p>

      {state === 'idle' && (conn.type === 'cellular' || conn.saveData) && (
        <p class="note warn">You're on mobile data. Connect to Wi-Fi first if you can.</p>
      )}
      {state === 'downloading' && (
        <>
          <progress max={total} value={done} />
          <p class="hint">
            {current}: {formatBytes(done)} of {formatBytes(total)}. Keep this screen open.
          </p>
          <button class="btn" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        </>
      )}
      {state === 'error' && <p class="note warn">Download failed: {error}</p>}
      {(state === 'idle' || state === 'error') && (
        <button class="btn primary" onClick={start} disabled={!conn.online}>
          {state === 'error' ? 'Try again' : `Download ${formatBytes(total)}`}
        </button>
      )}
    </section>
  );
}
