import { useEffect, useRef, useState } from 'preact/hooks';
import { getInstalled, loadModel } from '../ai/llm.js';
import { addSession, clearActiveChapter, saveActiveChapter, saveProgress } from '../db/index.js';
import { missionGate, newScreenClock, onVisibility, screenMs } from '../engine/activity.js';
import { TIME_BUDGETS, cleanDiscovery, completeChapter, nextStep } from '../engine/story.js';
import { continueStory } from '../engine/storyteller.js';
import { clipId, missionText } from '@outward/content/audio/clips.js';
import { onNarration, playClip, speakText, stopNarration } from '../audio/narrator.js';
import { buzz, haptics } from '../lib/device.js';
import { sfx } from '../lib/sfx.js';
import { emptyWalk, haversine, trackWalk } from '../sensors/geo.js';
import Icon from '../ui/icons.jsx';
import Sprig from '../ui/Sprig.jsx';
import { Bubble } from '../ui/widgets.jsx';
import VoiceInput from './VoiceInput.jsx';

/** Load the storyteller into memory while the screen is still on. */
function preloadModel() {
  getInstalled()
    .then((rec) => rec && loadModel())
    .catch(() => {});
}

/** Live captions: highlights words as they are spoken; shows the full text otherwise. */
function Captions({ text, class: cls = '' }) {
  const [n, setN] = useState(null);
  useEffect(() => onNarration((s) => setN(s.active && s.text === text ? s : null)), [text]);
  const words = text.split(/\s+/);
  return (
    <div class={`bubble story ${cls}`} aria-live="off">
      {/* Full text always readable; the word being spoken is highlighted. */}
      {n && n.index >= 0 ? (
        <>
          {words.slice(0, n.index).join(' ')} <span class="now">{words[n.index]}</span> {words.slice(n.index + 1).join(' ')}
        </>
      ) : (
        text
      )}
    </div>
  );
}

/** True while narration is playing, so Sprig can switch to speaking. */
function useSpeaking() {
  const [on, setOn] = useState(false);
  useEffect(() => onNarration((s) => setOn(s.active)), []);
  return on;
}

const fmtTime = (ms) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function Chapter({ story, chapter, prefs, onPrefs, progress, resume, onExit, onComplete }) {
  const [state, setState] = useState(
    () =>
      resume ?? {
        storyId: story.id,
        chapterId: chapter.id,
        step: 'intro',
        discovery: '',
        continuation: null,
        startedAt: Date.now(),
        timeBudget: prefs.timeBudget,
        walk: emptyWalk(),
        screen: newScreenClock(Date.now()),
        missionStartedAt: null,
        pocketed: false,
        practice: !!prefs.practice,
      },
  );
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [waving, setWaving] = useState(false);
  const [speed, setSpeed] = useState({ mps: 0, at: 0 });
  const stateRef = useRef(state);
  const lastFix = useRef(null);
  const speaking = useSpeaking();

  // Every change is written to IndexedDB at once: if Chrome kills the page in
  // a pocket, reopening the app resumes at the same step.
  const update = (patch) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setState(next);
    saveActiveChapter(next);
    return next;
  };

  const title = `Chapter ${chapter.number}: ${chapter.title}`;
  const narrate = (part, text) => prefs.narration && playClip(clipId(chapter.id, part), text, title, story.audio);
  const { step, discovery, continuation, walk } = state;
  // Older saved chapters set missionStartedAt on entering the mission; treat them as pocketed.
  const pocketed = state.pocketed ?? Boolean(state.missionStartedAt);

  useEffect(() => {
    saveActiveChapter(stateRef.current);
    if (stateRef.current.step === 'intro') narrate('intro', chapter.intro);
    preloadModel();
    const stop = trackWalk(stateRef.current.walk, (w, info) => {
      update({ walk: w });
      // Walking pace for Sprig's step speed (screen on only; hidden pages get no fixes).
      if (info?.fix) {
        const prev = lastFix.current;
        if (prev && info.fix.t > prev.t) setSpeed({ mps: haversine(prev, info.fix) / ((info.fix.t - prev.t) / 1000), at: Date.now() });
        lastFix.current = info.fix;
      }
    });
    // Screen time: saved on every change, so it survives the page being killed.
    const onVis = () => {
      const t = Date.now();
      update({ screen: onVisibility(stateRef.current.screen ?? newScreenClock(t), document.visibilityState === 'visible', t) });
      setNow(t);
    };
    document.addEventListener('visibilitychange', onVis);
    if (stateRef.current.screen) onVis();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop();
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
      stopNarration();
    };
  }, []);

  const advance = (to = nextStep(stateRef.current.step)) => {
    sfx('tap');
    update({ step: to });
    if (to === 'mission') narrate('mission', missionText(chapter));
    else if (to === 'describe') {
      buzz(haptics.found);
      sfx('found');
      stopNarration();
    } else if (to === 'cliffhanger') narrate('cliffhanger', chapter.cliffhanger);
  };

  const ready = () => {
    sfx('tap');
    buzz(haptics.missionStart);
    stopNarration();
    update({ pocketed: true, missionStartedAt: stateRef.current.missionStartedAt ?? Date.now() });
    setWaving(true);
    setTimeout(() => setWaving(false), 6000);
  };

  const pickTime = (m) => {
    update({ timeBudget: m });
    onPrefs?.({ timeBudget: m });
  };

  // The only model call in a chapter. It runs right after the user describes
  // their find, with the screen on, so nothing needs generating in a pocket.
  const tellStory = async () => {
    sfx('tap');
    setBusy(true);
    const result = await continueStory({ chapter, discovery });
    setBusy(false);
    update({ continuation: result, step: 'continuation' });
    if (prefs.narration) speakText(result.text);
  };

  const finish = async () => {
    stopNarration();
    buzz(haptics.chapterEnd);
    const s = stateRef.current;
    const endedAt = Date.now();
    const clean = cleanDiscovery(s.discovery);
    const session = {
      storyId: story.id,
      chapterId: chapter.id,
      startedAt: s.startedAt,
      endedAt,
      screenMs: s.screen ? screenMs(s.screen, endedAt) : null,
      path: s.walk?.path ?? [],
      practice: !!s.practice,
      timeBudget: s.timeBudget,
      discovery: clean,
      continuationSource: s.continuation?.source ?? 'template',
      continuationReason: s.continuation?.reason ?? null,
      generation: s.continuation?.stats ?? null,
      meters: Math.round(s.walk?.meters ?? 0),
    };
    const next = completeChapter(progress, chapter.id, clean);
    const [, id] = await Promise.all([saveProgress(next), addSession(session), clearActiveChapter()]);
    onComplete(next, { ...session, id });
  };

  const gate = missionGate({ chapter, timeBudget: state.timeBudget, walk, missionStartedAt: state.missionStartedAt, now, practice: state.practice });
  const moving = speed.mps > 0.4 && now - speed.at < 20000;

  return (
    <main class="screen" data-step={step}>
      <header class="bar">
        <button class="link" onClick={onExit} aria-label="Leave chapter, progress is saved">
          ← Home
        </button>
        <span class="eyebrow">
          Ch {chapter.number} · {chapter.title}
        </span>
      </header>

      {step === 'intro' && (
        <>
          <div class="stage-sprig">
            <Sprig state={speaking ? 'speaking' : 'idle'} voice={speaking} size={150} />
          </div>
          <Captions text={chapter.intro} />
          <footer class="actions">
            <button class="btn primary big" onClick={() => advance()}>
              Show me the mission
            </button>
          </footer>
        </>
      )}

      {step === 'mission' && !pocketed && (
        <>
          <div class="stage-sprig">
            <Sprig state={speaking ? 'speaking' : 'ready'} voice={speaking} size={130} />
          </div>
          <section class="mission-card" aria-label="Your mission">
            <span class="k">Mission · chapter {chapter.number}</span>
            <span class="v">{chapter.mission.prompt}</span>
            <span class="safe">
              <Icon name="shield" size={18} />
              {chapter.mission.safetyNote}
            </span>
          </section>
          <fieldset class="segmented">
            <legend>How long do you have?</legend>
            {TIME_BUDGETS.map((m) => (
              <label key={m} class={state.timeBudget === m ? 'on' : ''}>
                <input type="radio" name="time" checked={state.timeBudget === m} onChange={() => pickTime(m)} />
                {m} min
              </label>
            ))}
          </fieldset>
          <footer class="actions">
            <button class="btn primary big" onClick={ready}>
              I'm ready
            </button>
          </footer>
        </>
      )}

      {step === 'mission' && pocketed && waving && (
        <button class="pocket" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setWaving(false)}>
          <Sprig state="wave" size={190} />
          <span class="big">Pocket your phone</span>
          <span class="hint">
            I'll keep counting your steps.
            <br />
            Take me out when you've found it.
          </span>
        </button>
      )}

      {step === 'mission' && pocketed && !waving && (
        <>
          <div class="stage-sprig">
            <Sprig state={moving ? 'walking' : 'idle'} step={1.05 / Math.max(0.6, speed.mps)} size={150} />
          </div>
          <div class="stats2">
            <div class="stat">
              <b>{gate.meters} m</b>
              <span>of {gate.need} m</span>
            </div>
            <div class="stat">
              <b>{fmtTime(now - (state.missionStartedAt ?? now))}</b>
              <span>minutes out</span>
            </div>
          </div>
          <div class="walk-progress" aria-live="polite">
            <div class="trailbar" role="progressbar" aria-valuemin="0" aria-valuemax={gate.need} aria-valuenow={Math.min(gate.meters, gate.need)}>
              <span style={{ width: `${Math.min(100, (gate.meters / gate.need) * 100)}%` }} />
            </div>
            <p class="hint">
              {gate.ready
                ? gate.by === 'distance'
                  ? 'Far enough! Whenever you find it, tell me.'
                  : gate.by === 'practice'
                    ? 'Practice mode: no walk needed.'
                    : 'No GPS signal, so time outside counts instead.'
                : gate.gps
                  ? `${gate.toGo} m more, then look around. Back in the pocket!`
                  : `Waiting for GPS… or keep walking about ${gate.waitMin} more min.`}
            </p>
          </div>
          <p class="hint center-text">{chapter.mission.prompt}</p>
          <footer class="actions">
            <button class="btn primary big" onClick={() => advance()} disabled={!gate.ready}>
              {gate.ready ? 'I found it!' : `${gate.toGo} m to go`}
            </button>
          </footer>
        </>
      )}

      {step === 'describe' && (
        <>
          {busy ? (
            <div class="stage-sprig grow">
              <Bubble>Writing your page… (on this phone)</Bubble>
              <Sprig state="thinking" size={170} />
            </div>
          ) : (
            <>
              <VoiceInput onTranscript={(text) => update({ discovery: text })} />
              <label for="discovery" class="hint">
                Or type what you found:
              </label>
              <textarea
                id="discovery"
                rows={2}
                maxLength={280}
                placeholder={`e.g. ${chapter.mission.examples[0]}`}
                value={discovery}
                onInput={(e) => update({ discovery: e.currentTarget.value })}
              />
            </>
          )}
          <footer class="actions">
            <button class="btn primary big" disabled={busy || discovery.trim().length < 3} onClick={tellStory}>
              {busy ? 'The atlas is listening…' : 'Tell the atlas'}
            </button>
          </footer>
        </>
      )}

      {step === 'continuation' && continuation && (
        <>
          <div class="stage-sprig">
            <Sprig state={speaking ? 'speaking' : 'idle'} voice={speaking} size={130} />
          </div>
          <Captions text={continuation.text} />
          <p class="provenance" data-reason={continuation.reason ?? ''}>
            {continuation.source === 'model'
              ? `Written on this phone in ${(continuation.stats.ms / 1000).toFixed(1)} s · ${continuation.stats.gpu ? 'GPU' : 'CPU'}`
              : 'Pre-written'}
            {import.meta.env.DEV && continuation.reason ? ` (${continuation.reason})` : ''}
          </p>
          <footer class="actions">
            <button class="btn primary big" onClick={() => advance()}>
              Continue
            </button>
          </footer>
        </>
      )}

      {step === 'cliffhanger' && (
        <>
          <div class="stage-sprig">
            <Sprig state={speaking ? 'speaking' : 'thinking'} voice={speaking} size={130} />
          </div>
          <Captions text={chapter.cliffhanger} class="cliffhanger" />
          <footer class="actions">
            <button class="btn primary big" onClick={finish}>
              Finish chapter
            </button>
          </footer>
        </>
      )}
    </main>
  );
}
