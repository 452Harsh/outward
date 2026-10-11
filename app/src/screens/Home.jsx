import { useEffect, useState } from 'preact/hooks';
import { getSessions, resetStory } from '../db/index.js';
import { updateAvailable } from '../ai/llm.js';
import { formatBytes } from '../lib/device.js';
import { streakDays, totals } from '../engine/activity.js';
import { TIME_BUDGETS, currentChapter, newProgress } from '../engine/story.js';

export default function Home({ story, progress, prefs, onPrefs, onStart, onProgress, onNavigate }) {
  const chapter = currentChapter(story, progress);
  const [stats, setStats] = useState(null);
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    updateAvailable().then(setUpdate, () => setUpdate(null));
  }, []);
  useEffect(() => {
    getSessions().then((all) => setStats({ streak: streakDays(all), ...totals(all) }));
  }, [progress]);

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

      {update && (
        <button class="note update" onClick={() => onNavigate('settings')}>
          A better storyteller is ready ({formatBytes(update.bytes)}, Wi-Fi recommended). Tap to update.
        </button>
      )}

      {stats?.chapters > 0 && (
        <section class="strip" aria-label="Your time outside">
          <div>
            <strong>{stats.streak}</strong>
            <span>day streak</span>
          </div>
          <div>
            <strong>{stats.meters >= 1000 ? `${(stats.meters / 1000).toFixed(1)} km` : `${stats.meters} m`}</strong>
            <span>walked</span>
          </div>
          <div>
            <strong>{stats.outsideMin} min</strong>
            <span>outside{stats.screenFreePct != null ? `, ${stats.screenFreePct}% phone-free` : ''}</span>
          </div>
        </section>
      )}

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
        <button class="link" onClick={() => onNavigate('settings')}>
          Settings
        </button>
        <button class="link" onClick={() => onNavigate('safety', { firstRun: false })}>
          Safety
        </button>
      </nav>
    </main>
  );
}
