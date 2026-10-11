import { useEffect, useState } from 'preact/hooks';
import { registry } from '@outward/content/models';
import { getInstalled, setChosenModel } from '../ai/llm.js';
import { detectWebGPU, formatBytes } from '../lib/device.js';
import Sprig from '../ui/Sprig.jsx';
import { Flame, TabBar, XPBar } from '../ui/widgets.jsx';
import ModelDownload from './ModelDownload.jsx';

const THEMES = [
  ['system', 'Auto'],
  ['light', 'Day'],
  ['dark', 'Evening'],
];

export default function Settings({ prefs, onPrefs, onNavigate, game }) {
  const [installed, setInstalled] = useState(undefined);
  const [gpu, setGpu] = useState(null);
  const [switchTo, setSwitchTo] = useState(null);

  useEffect(() => {
    getInstalled().then(setInstalled);
    detectWebGPU().then(setGpu);
  }, []);

  const models = Object.entries(registry.models).map(([id, m]) => ({ id, ...m }));

  return (
    <main class="screen with-tabs">
      <section class="card" aria-label="Your explorer profile">
        <div class="hud">
          <Sprig state="idle" size={70} />
          <div class="grow" style={{ display: 'grid', gap: '6px' }}>
            <h2>
              Lv {game.level} · {game.rank}
            </h2>
            <XPBar {...game} compact />
          </div>
        </div>
        <div class="stats2" style={{ marginTop: '12px' }}>
          <div class="stat">
            <b>{(game.meters / 1000).toFixed(1)} km</b>
            <span>walked in total</span>
          </div>
          <div class="stat" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Flame days={game.streak.current} size={30} label={false} />
            <div>
              <b>{game.streak.best}</b>
              <span>best streak (days)</span>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="switch-row">
          <span>Theme</span>
          <span class="seg3" role="group" aria-label="Theme">
            {THEMES.map(([k, label]) => (
              <button key={k} aria-pressed={(prefs.theme ?? 'system') === k} onClick={() => onPrefs({ theme: k })}>
                {label}
              </button>
            ))}
          </span>
        </div>
        <div class="switch-row">
          <span>Sound effects</span>
          <span class="seg3" role="group" aria-label="Sound effects">
            <button aria-pressed={prefs.sfx !== false} onClick={() => onPrefs({ sfx: true })}>
              On
            </button>
            <button aria-pressed={prefs.sfx === false} onClick={() => onPrefs({ sfx: false })}>
              Off
            </button>
          </span>
        </div>
        <div class="switch-row">
          <span>Narration</span>
          <span class="seg3" role="group" aria-label="Narration">
            <button aria-pressed={prefs.narration !== false} onClick={() => onPrefs({ narration: true })}>
              On
            </button>
            <button aria-pressed={prefs.narration === false} onClick={() => onPrefs({ narration: false })}>
              Off
            </button>
          </span>
        </div>
      </section>

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
                  <span class="badge-ok">Installed</span>
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
      <TabBar on="settings" onNavigate={onNavigate} />
    </main>
  );
}
