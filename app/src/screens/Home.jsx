import { useEffect, useState } from 'preact/hooks';
import { updateAvailable } from '../ai/llm.js';
import { lockedBy } from '../engine/stories.js';
import { currentChapter, missionHeadline } from '../engine/story.js';
import { formatBytes } from '../lib/device.js';
import { sfx } from '../lib/sfx.js';
import Sprig from '../ui/Sprig.jsx';
import { Bubble, Flame, TabBar, XPBar } from '../ui/widgets.jsx';

function greeting(game, story, chapter) {
  const h = new Date().getHours();
  if (game.daysSinceLast != null && game.daysSinceLast >= 3) return 'Zzz… a short walk would wake me up. Even 10 minutes counts.';
  if (!chapter) return `We finished ${story.title}! Pick our next adventure.`;
  if (game.today.outsideMin > 0) return 'Great walk today. Up for another page?';
  if (game.streak.current > 0) return `Keep your fire alive: day ${game.streak.current + 1} is one walk away.`;
  if (h < 11) return 'Morning light is the best light. Shall we?';
  if (h < 17) return `${story.title} is waiting. Got a little time?`;
  return 'A short walk before dark?';
}

/** Home: Sprig, the fire, the level, and one giant button. Nothing else competes. */
export default function Home({ story, stories, progress, game, onStart, onNavigate }) {
  const chapter = currentChapter(story, progress);
  const [update, setUpdate] = useState(null);
  const [locked, setLocked] = useState(null);
  const sleepy = game.daysSinceLast != null && game.daysSinceLast >= 3;

  useEffect(() => {
    updateAvailable().then(setUpdate, () => setUpdate(null));
  }, []);
  useEffect(() => {
    lockedBy(story, stories).then(setLocked);
  }, [story, stories, progress]);

  const go = () => {
    sfx('tap');
    if (!chapter || locked) return onNavigate('quest');
    onStart(chapter);
  };

  return (
    <main class="screen with-tabs">
      <header class="hud">
        <span class="lvl">Lv {game.level}</span>
        <XPBar {...game} />
        <Flame days={game.streak.current} size={36} />
      </header>

      <div class="stage-sprig grow">
        <Bubble>{locked ? `Finish ${locked.title} first, then this story opens.` : greeting(game, story, chapter)}</Bubble>
        <Sprig state={sleepy ? 'sleepy' : chapter ? 'idle' : 'celebrating'} size={196} />
      </div>

      {update && (
        <button class="note update" onClick={() => onNavigate('settings')}>
          A better storyteller is ready ({formatBytes(update.bytes)}, Wi-Fi recommended). Tap to update.
        </button>
      )}

      {chapter && !locked ? (
        <div class="teaser">
          <span class="k">Today's mission</span>
          <span class="v">{missionHeadline(chapter.mission.prompt)}</span>
          <span class="hint">
            {story.title} · Chapter {chapter.number}: {chapter.title}
          </span>
        </div>
      ) : null}

      {game.today.outsideMin > 0 && (
        <p class="today">
          Today: <b>{game.today.outsideMin} min</b> outside · <b>{game.today.screenMin} min</b> on screen
        </p>
      )}

      <button class="btn primary big" onClick={go}>
        {!chapter ? 'Choose next adventure' : locked ? 'See the quest map' : sleepy ? 'Wake Sprig up' : 'Start Adventure'}
      </button>

      <TabBar on="home" onNavigate={onNavigate} />
    </main>
  );
}
