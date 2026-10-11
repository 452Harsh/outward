import note from '@outward/content/safety/note.json';
import { sfx } from '../lib/sfx.js';
import Icon from '../ui/icons.jsx';
import Sprig from '../ui/Sprig.jsx';
import { Bubble } from '../ui/widgets.jsx';

/** First launch: Sprig says hello and walks you through the trail rules. Also reachable from Me → Safety. */
export default function Welcome({ firstRun, onDone }) {
  return (
    <main class="screen">
      <div class="stage-sprig">
        <Bubble>
          {firstRun
            ? "Hi! I'm Sprig. I'll walk with you, tell the story, and cheer when you find things. First, our trail rules."
            : 'Our trail rules, any time you need them.'}
        </Bubble>
        <Sprig state="wave" size={150} />
      </div>
      <h1>{note.title}</h1>
      <ul class="rules">
        {note.points.map((p) => (
          <li key={p}>
            <Icon name="shield" size={22} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <footer class="actions">
        <button
          class="btn primary big"
          onClick={() => {
            sfx('tap');
            onDone();
          }}
        >
          {firstRun ? "Got it, let's pack" : 'Back'}
        </button>
      </footer>
    </main>
  );
}
