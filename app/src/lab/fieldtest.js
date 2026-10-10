// Screen-off field test: logs what keeps working when the phone is pocketed.
// Every event goes to IndexedDB immediately, so the log survives Chrome
// freezing or killing the page.
import { clearFieldLog, getFieldLog, getMeta, logField, setMeta } from '../db/index.js';
import { generate } from '../ai/llm.js';
import { emptyWalk, trackWalk } from '../sensors/geo.js';
import { audioProgress, startAmbient, stopAmbient } from './audio.js';

const HEARTBEAT_MS = 10_000;
const TTS_EVERY_MS = 2 * 60_000;
const GEN_EVERY_MS = 3 * 60_000;

let stopFns = [];

export const defaultOptions = { gps: true, audio: true, tts: true, generate: false };

export async function getRun() {
  return getMeta('labRun', null);
}

export async function startRun(options = defaultOptions) {
  await clearFieldLog();
  const run = { active: true, startedAt: Date.now(), options };
  await setMeta('labRun', run);
  await logField('start', { options, ua: navigator.userAgent });
  await attach(run);
  return run;
}

/** Re-attach listeners after a reload (the page was killed mid-run). */
export async function resumeIfActive() {
  const run = await getRun();
  if (!run?.active || stopFns.length) return run;
  await logField('page_reloaded');
  await attach(run);
  return run;
}

export async function stopRun() {
  for (const f of stopFns) f();
  stopFns = [];
  stopAmbient();
  const run = await getRun();
  await logField('stop');
  await setMeta('labRun', { ...run, active: false, endedAt: Date.now() });
}

async function attach(run) {
  const { options } = run;
  let lastBeat = Date.now();

  const beat = setInterval(() => {
    const now = Date.now();
    logField('heartbeat', { gapMs: now - lastBeat, audio: audioProgress() });
    lastBeat = now;
  }, HEARTBEAT_MS);
  stopFns.push(() => clearInterval(beat));

  const onVis = () => logField('visibility', { state: document.visibilityState, audio: audioProgress() });
  const onFreeze = () => logField('freeze');
  const onResume = () => logField('resume');
  const onHide = (e) => logField('pagehide', { persisted: e.persisted });
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('freeze', onFreeze);
  document.addEventListener('resume', onResume);
  window.addEventListener('pagehide', onHide);
  stopFns.push(() => {
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('freeze', onFreeze);
    document.removeEventListener('resume', onResume);
    window.removeEventListener('pagehide', onHide);
  });

  if (options.gps) {
    const saved = (await getMeta('labWalk', null)) ?? emptyWalk();
    stopFns.push(
      trackWalk(saved, (walk, info) => {
        setMeta('labWalk', walk);
        if (info.error) logField('gps_error', { error: info.error });
        else logField('gps_fix', { acc: Math.round(info.fix.acc), resumed: !!info.resumed, meters: Math.round(walk.meters) });
      }),
    );
  }

  // Not awaited: play() can stay pending (e.g. autoplay rules) and must not block the UI.
  if (options.audio) {
    startAmbient((type, data) => logField(type, data)).catch((err) =>
      logField('audio_blocked', { error: String(err?.message ?? err) }),
    );
  }

  if (options.tts && 'speechSynthesis' in window) {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      const u = new SpeechSynthesisUtterance(`Outward check ${n}. ${n * 2} minutes.`);
      const started = Date.now();
      u.onstart = () => logField('tts_start', { n });
      u.onend = () => logField('tts_end', { n, ms: Date.now() - started });
      u.onerror = (e) => logField('tts_error', { n, error: e.error });
      logField('tts_request', { n });
      speechSynthesis.speak(u);
    }, TTS_EVERY_MS);
    stopFns.push(() => clearInterval(t));
  }

  if (options.generate) {
    const t = setInterval(async () => {
      logField('gen_start');
      try {
        const r = await generate([{ role: 'user', content: 'Describe a quiet park in two sentences.' }], { maxTokens: 60 });
        logField('gen_end', { ms: r.ms, tokensPerSec: r.tokensPerSec, gpu: r.gpu });
      } catch (err) {
        logField('gen_error', { error: String(err?.message ?? err) });
      }
    }, GEN_EVERY_MS);
    stopFns.push(() => clearInterval(t));
  }
}

/**
 * Turn a raw event log into answers: what kept working while hidden?
 * Pure function so it can be unit-tested.
 */
export function summarize(events) {
  if (!events.length) return null;
  const start = events[0].t;
  const end = events.at(-1).t;
  const count = (type, hidden) => events.filter((e) => e.type === type && (hidden === undefined || e.hidden === hidden)).length;

  // Hidden intervals from visibility events.
  let hiddenMs = 0;
  let hiddenSince = null;
  const audioGaps = [];
  for (const e of events) {
    if (e.type !== 'visibility') continue;
    if (e.state === 'hidden') hiddenSince = e;
    else if (hiddenSince) {
      const wall = (e.t - hiddenSince.t) / 1000;
      hiddenMs += e.t - hiddenSince.t;
      if (hiddenSince.audio && e.audio) {
        audioGaps.push({ wallSec: Math.round(wall), audioSec: Math.round(e.audio.played - hiddenSince.audio.played) });
      }
      hiddenSince = null;
    }
  }

  const beats = events.filter((e) => e.type === 'heartbeat');
  const maxGapMs = Math.max(0, ...beats.map((b) => b.gapMs));
  const resumed = events.filter((e) => e.type === 'gps_fix' && e.resumed);
  const lastFix = [...events].reverse().find((e) => e.type === 'gps_fix');

  return {
    minutes: Math.round((end - start) / 600) / 100,
    hiddenMinutes: Math.round(hiddenMs / 600) / 100,
    pageReloads: count('page_reloaded'),
    freezes: count('freeze'),
    heartbeats: { visible: beats.filter((b) => !b.hidden).length, hidden: beats.filter((b) => b.hidden).length, maxGapSec: Math.round(maxGapMs / 1000) },
    gps: {
      fixesVisible: count('gps_fix', false),
      fixesHidden: count('gps_fix', true),
      resumeFixes: resumed.length,
      meters: lastFix?.meters ?? 0,
      errors: count('gps_error'),
    },
    audio: { blocked: count('audio_blocked') > 0, pauses: count('audio_pause'), hiddenPeriods: audioGaps },
    tts: {
      requestedHidden: count('tts_request', true),
      spokenHidden: count('tts_end', true),
      errors: count('tts_error'),
    },
    generation: {
      startedHidden: count('gen_start', true),
      finishedHidden: count('gen_end', true),
      errors: count('gen_error'),
    },
  };
}

export async function exportReport() {
  const events = await getFieldLog();
  return { summary: summarize(events), run: await getRun(), events };
}
