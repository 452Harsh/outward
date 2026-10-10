import { useEffect, useRef, useState } from 'preact/hooks';
import { getInstalled, loadModel } from '../ai/llm.js';
import { addSession, clearActiveChapter, saveActiveChapter, saveProgress } from '../db/index.js';
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
      },
  );
  const [busy, setBusy] = useState(false);
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
    return () => {
      stop();
      stopNarration();
    };
  }, []);

  const advance = (to = nextStep(stateRef.current.step)) => {
    update({ step: to });
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
    const clean = cleanDiscovery(s.discovery);
    const session = {
      storyId: story.id,
      chapterId: chapter.id,
      startedAt: s.startedAt,
      endedAt: Date.now(),
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

  const meters = Math.round(walk?.meters ?? 0);

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
            {meters > 0 && <p class="hint">Walked so far: {meters} m</p>}
          </section>
          <footer class="actions">
            <button class="btn primary big" onClick={() => advance()}>
              I found it
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
