import { useEffect, useState } from 'preact/hooks';
import { getSessions } from '../db/index.js';
import { streakDays } from '../engine/activity.js';
import { currentChapter } from '../engine/story.js';
import WalkMap from './WalkMap.jsx';

export default function Summary({ story, chapter, session, progress, onHome }) {
  const totalMs = session.endedAt - session.startedAt;
  const minutes = Math.max(1, Math.round(totalMs / 60000));
  const screenMin = Math.round((session.screenMs ?? 0) / 60000);
  const awayPct = session.screenMs != null && totalMs > 0 ? Math.round(100 * (1 - session.screenMs / totalMs)) : null;
  const next = currentChapter(story, progress);
  const [streak, setStreak] = useState(null);
  useEffect(() => {
    getSessions().then((all) => setStreak(streakDays(all)));
  }, []);

  return (
    <main class="screen">
      <header>
        <p class="eyebrow">Chapter {chapter.number} complete</p>
        <h1>{chapter.title}</h1>
      </header>

      <section class="stats">
        <div>
          <strong>{minutes}</strong>
          <span>{minutes === 1 ? 'minute' : 'minutes'} outside</span>
        </div>
        <div>
          <strong>{screenMin}</strong>
          <span>
            {screenMin === 1 ? 'minute' : 'minutes'} on screen{awayPct != null ? ` · ${awayPct}% phone-free` : ''}
          </span>
        </div>
        <div>
          <strong>{session.meters >= 1000 ? (session.meters / 1000).toFixed(1) : session.meters ?? 0}</strong>
          <span>{session.meters >= 1000 ? 'km' : 'metres'} walked</span>
        </div>
        <div>
          <strong>
            {progress.completed.length}/{story.chapters.length}
          </strong>
          <span>pages restored</span>
        </div>
        <div>
          <strong>{streak ?? '…'}</strong>
          <span>{streak === 1 ? 'day' : 'days'} in a row</span>
        </div>
      </section>

      {session.practice && <p class="note">Practice mode: this chapter doesn't count toward your stats or streak.</p>}

      <section class="card">
        <p class="eyebrow">Your walk</p>
        <WalkMap path={session.path} />
      </section>

      <section class="card">
        <p class="eyebrow">You found</p>
        <p class="discovery">“{session.discovery}”</p>
      </section>

      <section class="card">
        {next ? (
          <>
            <p class="eyebrow">Unlocked</p>
            <h2>
              Chapter {next.number}: {next.title}
            </h2>
          </>
        ) : (
          <h2>The atlas is complete.</h2>
        )}
      </section>

      <footer class="actions">
        <button class="btn primary big" onClick={onHome}>
          Done
        </button>
      </footer>
    </main>
  );
}
