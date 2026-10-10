import { useEffect, useRef, useState } from 'preact/hooks';
import { addSession, saveProgress } from '../db/index.js';
import { cleanDiscovery, completeChapter, nextStep } from '../engine/story.js';
import { continueStory } from '../engine/storyteller.js';
import { buzz, haptics, speak, stopSpeaking } from '../lib/device.js';

export default function Chapter({ story, chapter, prefs, progress, onExit, onComplete }) {
  const [step, setStep] = useState('intro');
  const [discovery, setDiscovery] = useState('');
  const [continuation, setContinuation] = useState(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());

  const narrate = (text) => prefs.narration && speak(text);

  // Narrate the intro once the screen opens (it was reached by a tap, so audio is allowed).
  useEffect(() => {
    narrate(chapter.intro);
    return stopSpeaking;
  }, []);

  const advance = (to = nextStep(step)) => {
    setStep(to);
    if (to === 'mission') {
      buzz(haptics.missionStart);
      narrate(`${chapter.mission.prompt} ${chapter.mission.safetyNote}`);
    } else if (to === 'describe') {
      buzz(haptics.found);
      stopSpeaking();
    } else if (to === 'cliffhanger') {
      narrate(chapter.cliffhanger);
    }
  };

  const tellStory = async () => {
    setBusy(true);
    const result = await continueStory({ story, chapter, discovery });
    setContinuation(result);
    setBusy(false);
    advance('continuation');
    narrate(result.text);
  };

  const finish = async () => {
    stopSpeaking();
    buzz(haptics.chapterEnd);
    const clean = cleanDiscovery(discovery);
    const session = {
      storyId: story.id,
      chapterId: chapter.id,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      timeBudget: prefs.timeBudget,
      discovery: clean,
      continuationSource: continuation?.source ?? 'template',
    };
    const next = completeChapter(progress, chapter.id, clean);
    await Promise.all([saveProgress(next), addSession(session)]);
    onComplete(next, session);
  };

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
            <label for="discovery" class="eyebrow">
              What did you find?
            </label>
            <textarea
              id="discovery"
              rows={3}
              maxLength={280}
              placeholder={`e.g. ${chapter.mission.examples[0]}`}
              value={discovery}
              onInput={(e) => setDiscovery(e.currentTarget.value)}
              autoFocus
            />
          </section>
          <footer class="actions">
            <button class="btn primary big" disabled={busy || discovery.trim().length < 3} onClick={tellStory}>
              {busy ? 'The atlas is listening…' : 'Tell the atlas'}
            </button>
          </footer>
        </>
      )}

      {step === 'continuation' && (
        <>
          <article class="story">
            <p>{continuation.text}</p>
          </article>
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
