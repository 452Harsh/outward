import note from '@outward/content/safety/note.json';

export default function SafetyNote({ firstRun, onDone }) {
  return (
    <main class="screen">
      <header>
        <p class="eyebrow">Outward</p>
        <h1>{note.title}</h1>
      </header>
      <ul class="safety-list">
        {note.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <footer class="actions">
        <button class="btn primary" onClick={onDone}>
          {firstRun ? 'I understand' : 'Back'}
        </button>
      </footer>
    </main>
  );
}
