import { useEffect, useState } from 'preact/hooks';
import { getFieldLog } from '../db/index.js';
import { defaultOptions, exportReport, getRun, startRun, stopRun, summarize } from '../lab/fieldtest.js';

const LABELS = {
  gps: 'GPS tracking',
  audio: 'Background audio (quiet wind)',
  tts: 'Spoken check every 2 min',
  generate: 'Model generation every 3 min',
};

export default function FieldTest({ onBack }) {
  const [run, setRun] = useState(null);
  const [options, setOptions] = useState(defaultOptions);
  const [summary, setSummary] = useState(null);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    setRun(await getRun());
    setSummary(summarize(await getFieldLog()));
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    setRun(await startRun(options));
    refresh();
  };
  const stop = async () => {
    await stopRun();
    refresh();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(await exportReport(), null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const active = run?.active;

  return (
    <main class="screen">
      <header class="bar">
        <button class="link" onClick={onBack}>
          ← Back
        </button>
        <span class="eyebrow">Screen-off field test</span>
      </header>

      {!active && (
        <>
          <p class="lede">
            Start the test, lock the phone, put it in your pocket and walk for 10 minutes. Then unlock and come back
            here.
          </p>
          <fieldset class="toggles">
            {Object.keys(LABELS).map((k) => (
              <label key={k}>
                <input type="checkbox" checked={options[k]} onChange={(e) => setOptions({ ...options, [k]: e.currentTarget.checked })} />
                {LABELS[k]}
              </label>
            ))}
          </fieldset>
        </>
      )}

      {summary && (
        <section class="card kv">
          <h2>{active ? 'Running' : 'Last run'}</h2>
          <dl>
            <dt>Duration</dt>
            <dd>
              {summary.minutes} min, {summary.hiddenMinutes} min screen off
            </dd>
            <dt>Page killed / frozen</dt>
            <dd>
              {summary.pageReloads} reloads · {summary.freezes} freezes
            </dd>
            <dt>Timers (10 s)</dt>
            <dd>
              {summary.heartbeats.visible} on · {summary.heartbeats.hidden} off · longest gap {summary.heartbeats.maxGapSec} s
            </dd>
            <dt>GPS</dt>
            <dd>
              {summary.gps.fixesVisible} fixes on · {summary.gps.fixesHidden} off · {summary.gps.resumeFixes} on resume ·{' '}
              {Math.round(summary.gps.meters)} m{summary.gps.errors ? ` · ${summary.gps.errors} errors` : ''}
            </dd>
            <dt>Audio</dt>
            <dd>
              {summary.audio.blocked
                ? 'Blocked'
                : summary.audio.hiddenPeriods.length
                  ? summary.audio.hiddenPeriods.map((p) => `${p.audioSec}/${p.wallSec} s played`).join(' · ')
                  : 'No screen-off period yet'}
            </dd>
            <dt>Speech</dt>
            <dd>
              {summary.tts.spokenHidden}/{summary.tts.requestedHidden} spoken while off
              {summary.tts.errors ? ` · ${summary.tts.errors} errors` : ''}
            </dd>
            <dt>Generation</dt>
            <dd>
              {summary.generation.finishedHidden}/{summary.generation.startedHidden} finished while off
              {summary.generation.errors ? ` · ${summary.generation.errors} errors` : ''}
            </dd>
          </dl>
        </section>
      )}

      <footer class="actions">
        {active ? (
          <button class="btn primary big" onClick={stop}>
            Stop test
          </button>
        ) : (
          <button class="btn primary big" onClick={start}>
            Start test
          </button>
        )}
        {summary && (
          <button class="btn" onClick={copy}>
            {copied ? 'Copied' : 'Copy full log'}
          </button>
        )}
      </footer>
    </main>
  );
}
