import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import * as llm from '../ai/llm.js';
import { getSessions } from '../db/index.js';
import Sprig from '../ui/Sprig.jsx';
import { buildMessages } from '../engine/prompt.js';
import { getStory } from '../engine/story.js';
import { detectWebGPU, formatBytes, getDeviceInfo, getStorageInfo } from '../lib/device.js';

const yes = (v) => (v ? 'Yes' : 'No');

export default function Diagnostics({ onBack }) {
  const [gpu, setGpu] = useState(null);
  const [storage, setStorage] = useState(null);
  const [model, setModel] = useState(undefined);
  const [bench, setBench] = useState([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [fps, setFps] = useState(null);
  const [fpsRunning, setFpsRunning] = useState(false);

  // Animation smoothness: run Sprig's busiest states for 5 s and measure frames.
  const runFps = () => {
    setFpsRunning(true);
    setFps(null);
    const gaps = [];
    let last = performance.now();
    const end = last + 5000;
    const tick = (t) => {
      gaps.push(t - last);
      last = t;
      if (t < end) requestAnimationFrame(tick);
      else {
        gaps.shift();
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        setFps({ fps: Math.round(1000 / avg), janky: Math.round((100 * gaps.filter((g) => g > 25).length) / gaps.length), frames: gaps.length });
        setFpsRunning(false);
      }
    };
    requestAnimationFrame(tick);
  };
  const device = getDeviceInfo();

  useEffect(() => {
    detectWebGPU().then(setGpu);
    getStorageInfo().then(setStorage);
    llm.getInstalled().then(setModel, () => setModel(null));
    getSessions().then((all) => setSessions(all.slice(-10)));
  }, []);

  // Load + generate the same chapter-1 prompt on GPU and CPU.
  const runBenchmark = async () => {
    setRunning(true);
    setBench([]);
    const messages = buildMessages(getStory().chapters[0], 'rainwater running down a drain');
    const modes = gpu?.supported ? [true, false] : [false];
    const results = [];
    for (const useGpu of modes) {
      try {
        await llm.unload();
        const info = await llm.loadModel({ gpu: useGpu });
        const r = await llm.generate(messages, { maxTokens: 120 });
        results.push({ backend: useGpu ? 'GPU' : 'CPU', ...info, ...r });
      } catch (err) {
        results.push({ backend: useGpu ? 'GPU' : 'CPU', error: String(err?.message ?? err) });
      }
      setBench([...results]);
    }
    await llm.unload();
    setRunning(false);
  };

  const report = { device, gpu, storage, model, bench, fps, sessions };
  const byModel = sessions.filter((s) => s.continuationSource === 'model').length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main class="screen">
      <header class="bar">
        <button class="link" onClick={onBack}>
          ← Back
        </button>
        <span class="eyebrow">Diagnostics</span>
      </header>

      <section class="card kv">
        <h2>WebGPU</h2>
        {gpu === null ? (
          <p>Checking…</p>
        ) : (
          <dl>
            <dt>Supported</dt>
            <dd>{gpu.supported ? 'Yes' : `No (${gpu.reason})`}</dd>
            {gpu.supported && (
              <>
                <dt>shader-f16</dt>
                <dd>{yes(gpu.f16)}</dd>
                <dt>Vendor</dt>
                <dd>{gpu.vendor || 'n/a'}</dd>
                <dt>Architecture</dt>
                <dd>{gpu.architecture || 'n/a'}</dd>
                <dt>Device</dt>
                <dd>{gpu.device || gpu.description || 'hidden by browser'}</dd>
                <dt>Fallback adapter</dt>
                <dd>{yes(gpu.fallbackAdapter)}</dd>
                <dt>Max buffer</dt>
                <dd>{formatBytes(gpu.limits.maxBufferSize)}</dd>
                <dt>Max storage binding</dt>
                <dd>{formatBytes(gpu.limits.maxStorageBufferBindingSize)}</dd>
              </>
            )}
          </dl>
        )}
      </section>

      <section class="card kv">
        <h2>Device</h2>
        <dl>
          <dt>deviceMemory</dt>
          <dd>{device.deviceMemoryGB ? `${device.deviceMemoryGB} GB (browser caps at 8)` : 'n/a'}</dd>
          <dt>CPU cores</dt>
          <dd>{device.cores ?? 'n/a'}</dd>
          <dt>Multi-thread ready</dt>
          <dd>{yes(device.crossOriginIsolated)}</dd>
          <dt>Installed app</dt>
          <dd>{yes(device.standalone)}</dd>
          <dt>Storage</dt>
          <dd>
            {storage ? `${formatBytes(storage.usage)} used of ${formatBytes(storage.quota)}, ${storage.persisted ? 'persistent' : 'best effort'}` : '…'}
          </dd>
          <dt>Model</dt>
          <dd>{model === undefined ? '…' : model ? `${model.id} (${model.version})` : 'none'}</dd>
        </dl>
      </section>

      <section class="card kv">
        <h2>Storyteller speed</h2>
        {bench.map((b) => (
          <dl key={b.backend}>
            <dt>{b.backend}</dt>
            <dd>
              {b.error
                ? `Failed: ${b.error}`
                : `load ${(b.loadMs / 1000).toFixed(1)} s · prompt ${b.promptPerSec} tok/s · write ${b.tokensPerSec} tok/s · ${b.tokens} tokens in ${(b.ms / 1000).toFixed(1)} s · ${b.threads} threads`}
            </dd>
          </dl>
        ))}
        {bench[0]?.text && <p class="sample">“{bench[0].text.trim()}”</p>}
        <button class="btn" onClick={runBenchmark} disabled={running || !model}>
          {running ? 'Running…' : model ? 'Run benchmark' : 'Download a model first'}
        </button>
      </section>

      <section class="card kv">
        <h2>Animation smoothness</h2>
        {fpsRunning && (
          <div class="stats2">
            <Sprig state="walking" step={0.5} size={110} />
            <Sprig state="celebrating" size={110} />
          </div>
        )}
        {fps && (
          <dl>
            <dt>Frame rate</dt>
            <dd>{fps.fps} fps</dd>
            <dt>Slow frames</dt>
            <dd>
              {fps.janky}% over 25 ms ({fps.frames} frames)
            </dd>
          </dl>
        )}
        <button class="btn" onClick={runFps} disabled={fpsRunning}>
          {fpsRunning ? 'Measuring for 5 s…' : 'Test animation smoothness'}
        </button>
      </section>

      <section class="card kv">
        <h2>Recent chapters</h2>
        {sessions.length ? (
          <dl>
            <dt>Written on phone</dt>
            <dd>
              {byModel} of {sessions.length}
            </dd>
            {sessions.map((s) => (
              <Fragment key={s.id}>
                <dt>{s.chapterId}</dt>
                <dd>
                  {s.continuationSource === 'model'
                    ? `model · ${s.generation?.tokensPerSec ?? '?'} tok/s`
                    : `pre-written (${s.continuationReason ?? 'n/a'})`}
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p>No chapters played yet.</p>
        )}
      </section>

      <footer class="actions">
        <button class="btn primary" onClick={copy}>
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </footer>
    </main>
  );
}
