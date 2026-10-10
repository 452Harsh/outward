import { currentChapter } from '../engine/story.js';

export default function Summary({ story, chapter, session, progress, onHome }) {
  const minutes = Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000));
  const next = currentChapter(story, progress);

  return (
    <main class="screen">
      <header>
        <p class="eyebrow">Chapter {chapter.number} complete</p>
        <h1>{chapter.title}</h1>
      </header>

      <section class="stats">
        <div>
          <strong>{minutes}</strong>
          <span>{minutes === 1 ? 'minute' : 'minutes'} on this chapter</span>
        </div>
        <div>
          <strong>
            {progress.completed.length}/{story.chapters.length}
          </strong>
          <span>pages restored</span>
        </div>
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
