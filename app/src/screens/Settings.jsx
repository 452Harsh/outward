import { useEffect, useState } from 'preact/hooks';
import { registry } from '@outward/content/models';
import { getInstalled, setChosenModel } from '../ai/llm.js';
import { detectWebGPU, formatBytes } from '../lib/device.js';
import ModelDownload from './ModelDownload.jsx';

export default function Settings({ prefs, onPrefs, onNavigate, onBack }) {
  const [installed, setInstalled] = useState(undefined);
  const [gpu, setGpu] = useState(null);
  const [switchTo, setSwitchTo] = useState(null);

  useEffect(() => {
    getInstalled().then(setInstalled);
    detectWebGPU().then(setGpu);
  }, []);

  const models = Object.entries(registry.models).map(([id, m]) => ({ id, ...m }));

  return (
    <main class="screen">
      <header class="bar">
        <button class="link" onClick={onBack}>
          ← Home
        </button>
        <span class="eyebrow">Settings</span>
      </header>

      <section class="card">
        <p class="eyebrow">Storyteller</p>
        <p class="hint">One model is kept on the phone. Switching downloads the new one, then deletes the old one.</p>
        <ul class="options">
          {models.map((m) => {
            const current = installed?.id === m.id;
            const blocked = m.requiresWebGPU && gpu && !gpu.supported;
            return (
              <li key={m.id} class={current ? 'on' : ''}>
                <div>
                  <strong>{m.label}</strong>
                  <span>
                    {m.description} {formatBytes(m.bytes)}
                    {m.serveFromRender ? '' : ', from Hugging Face'}.
                  </span>
                </div>
                {current ? (
                  <span class="badge">Installed</span>
                ) : (
                  <button class="btn" disabled={blocked || installed === undefined} onClick={() => setSwitchTo(m)}>
                    {blocked ? 'Needs WebGPU' : 'Use this'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {switchTo && (
        <ModelDownload
          key={switchTo.id}
          model={switchTo}
          cta={`Download ${formatBytes(switchTo.bytes)}`}
          onInstalled={async (rec) => {
            await setChosenModel(rec.id);
            setInstalled(rec);
            setSwitchTo(null);
          }}
        />
      )}

      <nav class="links stacked">
        <button class="link" onClick={() => onPrefs({ narration: !prefs.narration })}>
          Narration: {prefs.narration ? 'on' : 'off'}
        </button>
        <button class="link" onClick={() => onPrefs({ practice: !prefs.practice })}>
          Practice mode (no walk needed, not counted): {prefs.practice ? 'on' : 'off'}
        </button>
        <button class="link" onClick={() => onNavigate('diagnostics')}>
          Diagnostics
        </button>
        <button class="link" onClick={() => onNavigate('fieldtest')}>
          Screen-off field test
        </button>
        <button class="link" onClick={() => onNavigate('setup')}>
          Offline status
        </button>
        <button class="link" onClick={() => onNavigate('safety', { firstRun: false })}>
          Safety
        </button>
      </nav>
    </main>
  );
}
