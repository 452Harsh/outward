import { useEffect, useRef, useState } from 'preact/hooks';
import { getInstalled, loadModel } from '../ai/llm.js';
import { addSession, clearActiveChapter, saveActiveChapter, saveProgress } from '../db/index.js';
import { missionGate, newScreenClock, onVisibility, screenMs } from '../engine/activity.js';
import { cleanDiscovery, completeChapter, nextStep } from '../engine/story.js';
import { continueStory } from '../engine/storyteller.js';
import { clipId, missionText } from '@outward/content/audio/clips.js';
import { playClip, speakText, stopNarration } from '../audio/narrator.js';
import { buzz, haptics } from '../lib/device.js';
import { emptyWalk, trackWalk } from '../sensors/geo.js';
import VoiceInput from './VoiceInput.jsx';

/** Load the storyteller into memory while the screen is still on. */
function preloadModel() {
  getInstalled()
    .then((rec) => rec && loadModel())
    .catch(() => {});
}

export default function Chapter({ story, chapter, prefs, progress, resume, onExit, onComplete }) {
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
        practice: !!prefs.practice,
      },
  );
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const stateRef = useRef(state);

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
  const narrate = (part, text) => prefs.narration && playClip(clipId(chapter.id, part), text, title);
  const { step, discovery, continuation, walk } = state;

  useEffect(() => {
    saveActiveChapter(stateRef.current);
    if (stateRef.current.step === 'intro') narrate('intro', chapter.intro);
    preloadModel();
    const stop = trackWalk(stateRef.current.walk, (w) => update({ walk: w }));
    // Screen time: saved on every change, so it survives the page being killed.
    const onVis = () => {
      const t = Date.now();
      update({ screen: onVisibility(stateRef.current.screen ?? newScreenClock(t), document.visibilityState === 'visible', t) });
      setNow(t);
    };
    document.addEventListener('visibilitychange', onVis);
    if (stateRef.current.screen) onVis();
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      stop();
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
      stopNarration();
    };
  }, []);

  const advance = (to = nextStep(stateRef.current.step)) => {
    update(to === 'mission' && !stateRef.current.missionStartedAt ? { step: to, missionStartedAt: Date.now() } : { step: to });
    if (to === 'mission') {
      buzz(haptics.missionStart);
      narrate('mission', missionText(chapter));
    } else if (to === 'describe') {
      buzz(haptics.found);
      stopNarration();
    } else if (to === 'cliffhanger') {
      narrate('cliffhanger', chapter.cliffhanger);
    }
  };

  // The only model call in a chapter. It runs right after the user describes
  // their find, with the screen on, so nothing needs generating in a pocket.
  const tellStory = async () => {
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
    await Promise.all([saveProgress(next), addSession(session), clearActiveChapter()]);
    onComplete(next, session);
  };

  const gate = missionGate({
    chapter,
    timeBudget: state.timeBudget,
    walk,
    missionStartedAt: state.missionStartedAt,
    now,
    practice: state.practice,
  });

  return (
    <main class="screen" data-step={step}>
      <header class="bar">
        <button class="link" onClick={onExit} aria-label="Leave chapter">
          ← Home
        </button>
        <span class="eyebrow">
          Chapter {chapter.number} · {chapter.title}
        </span>
      </header>

      {step === 'intro' && (
        <>
          <article class="story">
            <p>{chapter.intro}</p>
          </article>
          <footer class="actions">
            <button class="btn primary big" onClick={() => advance()}>
              I'm outside. Give me the mission
            </button>
          </footer>
        </>
      )}

      {step === 'mission' && (
        <>
          <section class="mission">
            <p class="eyebrow">Your mission</p>
            <h2>{chapter.mission.prompt}</h2>
            <p class="note safe">{chapter.mission.safetyNote}</p>
            <p class="hint">Put your phone in your pocket. Take it out when you've found it.</p>
            <div class="walk-progress" aria-live="polite">
              <progress max={gate.need} value={Math.min(gate.meters, gate.need)} />
              <p class="hint">
                {gate.ready
                  ? gate.by === 'distance'
                    ? `${gate.meters} m walked. Whenever you find it, tell the atlas.`
                    : gate.by === 'practice'
                      ? 'Practice mode: no walk needed.'
                      : 'No GPS signal, so time outside counts instead.'
                  : gate.gps
                    ? `${gate.meters} of ${gate.need} m. Walk ${gate.toGo} m more, then look around.`
                    : `Waiting for GPS… or keep walking about ${gate.waitMin} more min.`}
              </p>
            </div>
          </section>
          <footer class="actions">
            <button class="btn primary big" onClick={() => advance()} disabled={!gate.ready}>
              {gate.ready ? 'I found it' : `Keep walking (${gate.toGo} m)`}
            </button>
          </footer>
        </>
      )}

      {step === 'describe' && (
        <>
          <section class="mission">
            <p class="eyebrow">What did you find?</p>
            <VoiceInput onTranscript={(text) => update({ discovery: text })} />
            <label for="discovery" class="hint">
              Or type it:
            </label>
            <textarea
              id="discovery"
              rows={3}
              maxLength={280}
              placeholder={`e.g. ${chapter.mission.examples[0]}`}
              value={discovery}
              onInput={(e) => update({ discovery: e.currentTarget.value })}
            />
          </section>
          <footer class="actions">
            <button class="btn primary big" disabled={busy || discovery.trim().length < 3} onClick={tellStory}>
              {busy ? 'The atlas is listening…' : 'Tell the atlas'}
            </button>
          </footer>
        </>
      )}

      {step === 'continuation' && continuation && (
        <>
          <article class="story">
            <p>{continuation.text}</p>
          </article>
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
          <article class="story cliffhanger">
            <p>{chapter.cliffhanger}</p>
          </article>
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
