import { resetStory } from '../db/index.js';
import { TIME_BUDGETS, currentChapter, newProgress } from '../engine/story.js';

export default function Home({ story, progress, prefs, onPrefs, onStart, onProgress, onNavigate }) {
  const chapter = currentChapter(story, progress);

  const restart = async () => {
    if (!confirm('Start the story again from chapter 1?')) return;
    await resetStory(story.id);
    onProgress(newProgress(story.id));
  };

  return (
    <main class="screen">
      <header>
        <p class="eyebrow">Outward</p>
        <h1>{story.title}</h1>
        <p class="lede">{story.tagline}</p>
      </header>

      <ol class="chapter-dots" aria-label="Chapters">
        {story.chapters.map((c) => (
          <li
            key={c.id}
            class={progress.completed.includes(c.id) ? 'done' : c.id === chapter?.id ? 'current' : ''}
            aria-label={`Chapter ${c.number}: ${c.title}`}
          />
        ))}
      </ol>

      {chapter ? (
        <>
          <section class="card">
            <p class="eyebrow">Chapter {chapter.number}</p>
            <h2>{chapter.title}</h2>
          </section>

          <fieldset class="segmented">
            <legend>How long do you have?</legend>
            {TIME_BUDGETS.map((m) => (
              <label key={m} class={prefs.timeBudget === m ? 'on' : ''}>
                <input
                  type="radio"
                  name="time"
                  checked={prefs.timeBudget === m}
                  onChange={() => onPrefs({ timeBudget: m })}
                />
                {m} min
              </label>
            ))}
          </fieldset>

          <footer class="actions">
            <button class="btn primary big" onClick={() => onStart(chapter)}>
              Start chapter {chapter.number}
            </button>
          </footer>
        </>
      ) : (
        <>
          <section class="card">
            <h2>Season complete</h2>
            <p>You filled every page of the atlas. A second atlas is waiting.</p>
          </section>
          <footer class="actions">
            <button class="btn" onClick={restart}>
              Start again
            </button>
          </footer>
        </>
      )}

      <nav class="links">
        <button class="link" onClick={() => onPrefs({ narration: !prefs.narration })}>
          Narration: {prefs.narration ? 'on' : 'off'}
        </button>
        <button class="link" onClick={() => onNavigate('safety', { firstRun: false })}>
          Safety
        </button>
        <button class="link" onClick={() => onNavigate('setup')}>
          Offline status
        </button>
      </nav>
    </main>
  );
}
