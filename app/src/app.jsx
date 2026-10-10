import { useEffect, useState } from 'preact/hooks';
import { getMeta, getProgress, setMeta } from './db/index.js';
import { getStory } from './engine/story.js';
import SafetyNote from './screens/SafetyNote.jsx';
import Setup from './screens/Setup.jsx';
import Home from './screens/Home.jsx';
import Chapter from './screens/Chapter.jsx';
import Summary from './screens/Summary.jsx';

const story = getStory();

export function App() {
  const [route, setRoute] = useState({ name: 'loading' });
  const [progress, setProgress] = useState(null);
  const [prefs, setPrefs] = useState({ timeBudget: 30, narration: true });

  useEffect(() => {
    (async () => {
      const [safetyAccepted, setupDone, savedPrefs, p] = await Promise.all([
        getMeta('safetyAccepted', false),
        getMeta('setupDone', false),
        getMeta('prefs', null),
        getProgress(story.id),
      ]);
      if (savedPrefs) setPrefs(savedPrefs);
      setProgress(p);
      setRoute({ name: !safetyAccepted ? 'safety' : !setupDone ? 'setup' : 'home' });
    })();
  }, []);

  const go = (name, params = {}) => setRoute({ name, ...params });
  const updatePrefs = (next) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setMeta('prefs', merged);
  };

  switch (route.name) {
    case 'safety':
      return (
        <SafetyNote
          firstRun={route.firstRun !== false}
          onDone={async () => {
            await setMeta('safetyAccepted', true);
            go((await getMeta('setupDone', false)) ? 'home' : 'setup');
          }}
        />
      );
    case 'setup':
      return (
        <Setup
          onDone={async () => {
            await setMeta('setupDone', true);
            go('home');
          }}
        />
      );
    case 'home':
      return (
        <Home
          story={story}
          progress={progress}
          prefs={prefs}
          onPrefs={updatePrefs}
          onStart={(chapter) => go('chapter', { chapter })}
          onProgress={setProgress}
          onNavigate={go}
        />
      );
    case 'chapter':
      return (
        <Chapter
          story={story}
          chapter={route.chapter}
          prefs={prefs}
          progress={progress}
          onExit={() => go('home')}
          onComplete={(nextProgress, session) => {
            setProgress(nextProgress);
            go('summary', { chapter: route.chapter, session });
          }}
        />
      );
    case 'summary':
      return (
        <Summary
          story={story}
          chapter={route.chapter}
          session={route.session}
          progress={progress}
          onHome={() => go('home')}
        />
      );
    default:
      return <main class="screen center" aria-busy="true" />;
  }
}
