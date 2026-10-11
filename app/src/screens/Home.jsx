import { useEffect, useState } from 'preact/hooks';
import { getSessions, resetStory } from '../db/index.js';
import { updateAvailable } from '../ai/llm.js';
import { formatBytes } from '../lib/device.js';
import { streakDays, totals } from '../engine/activity.js';
import { TIME_BUDGETS, currentChapter, newProgress } from '../engine/story.js';
import { downloadPack, fetchPackIndex, lockedBy } from '../engine/stories.js';

export default function Home({ story, stories, onSelectStory, onStoriesChanged, progress, prefs, onPrefs, onStart, onProgress, onNavigate }) {
  const chapter = currentChapter(story, progress);
  const [stats, setStats] = useState(null);
  const [update, setUpdate] = useState(null);
  const [offers, setOffers] = useState([]);
  const [locked, setLocked] = useState(null);
  const [dl, setDl] = useState(null); // { id, done, total } | { id, error }
  useEffect(() => {
    updateAvailable().then(setUpdate, () => setUpdate(null));
  }, []);
  useEffect(() => {
    // New or updated story packs from the story factory (when online).
    fetchPackIndex().then((index) => {
      const have = new Map(stories.map((s) => [s.id, s.version ?? 0]));
      setOffers(index.filter((p) => !have.has(p.id) || p.version > have.get(p.id)));
    });
  }, [stories]);
  useEffect(() => {
    lockedBy(story, stories).then(setLocked);
  }, [story, stories, progress]);

  const getPack = async (offer) => {
    setDl({ id: offer.id, done: 0, total: offer.bytes });
    try {
      await downloadPack(offer.id, { onProgress: (done, total) => setDl({ id: offer.id, done, total }) });
      setDl(null);
      await onStoriesChanged(offer.id);
      onPrefs({ storyId: offer.id });
    } catch (err) {
      setDl({ id: offer.id, error: String(err?.message ?? err) });
    }
  };
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

      {stories.length > 1 && (
        <nav class="story-switch" aria-label="Stories">
          {stories.map((s) => (
            <button key={s.id} class={s.id === story.id ? 'on' : ''} aria-pressed={s.id === story.id} onClick={() => onSelectStory(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
      )}

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

      {locked ? (
        <section class="card">
          <p class="eyebrow">Locked</p>
          <h2>Finish {locked.title} first</h2>
          <p>This story continues where that one ends.</p>
        </section>
      ) : chapter ? (
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
            <h2>Story complete</h2>
            <p>You filled every page of {story.title}.{offers.length || stories.length > 1 ? ' Another atlas is waiting.' : ''}</p>
          </section>
          <footer class="actions">
            <button class="btn" onClick={restart}>
              Start again
            </button>
          </footer>
        </>
      )}

      {offers.map((o) => (
        <section class="card offer" key={o.id}>
          <p class="eyebrow">{stories.some((s) => s.id === o.id) ? 'Story update' : 'New story'}</p>
          <h2>{o.title}</h2>
          <p>{o.tagline}</p>
          <p class="hint">
            {o.chapters} chapters · {formatBytes(o.bytes)} with narration · works offline once downloaded
          </p>
          {dl?.id === o.id && !dl.error ? (
            <progress max={dl.total || 1} value={dl.done} />
          ) : (
            <button class="btn" onClick={() => getPack(o)}>
              {dl?.id === o.id ? 'Try again' : 'Download'}
            </button>
          )}
          {dl?.id === o.id && dl.error && <p class="note warn">{dl.error}</p>}
        </section>
      ))}

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
