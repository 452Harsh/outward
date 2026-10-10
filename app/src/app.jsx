import { useEffect, useState } from 'preact/hooks';
import { getActiveChapter, getMeta, getProgress, setMeta } from './db/index.js';
import { getStory } from './engine/story.js';
import { resumeIfActive } from './lab/fieldtest.js';
import SafetyNote from './screens/SafetyNote.jsx';
import Setup from './screens/Setup.jsx';
import Home from './screens/Home.jsx';
import Chapter from './screens/Chapter.jsx';
import Summary from './screens/Summary.jsx';
import Settings from './screens/Settings.jsx';
import Diagnostics from './screens/Diagnostics.jsx';
import FieldTest from './screens/FieldTest.jsx';

const story = getStory();
const chapterById = (id) => story.chapters.find((c) => c.id === id);

export function App() {
  const [route, setRoute] = useState({ name: 'loading' });
  const [progress, setProgress] = useState(null);
  const [prefs, setPrefs] = useState({ timeBudget: 30, narration: true });

  useEffect(() => {
    (async () => {
      const [safetyAccepted, setupDone, savedPrefs, p, active] = await Promise.all([
        getMeta('safetyAccepted', false),
        getMeta('setupDone', false),
        getMeta('prefs', null),
        getProgress(story.id),
        getActiveChapter(),
      ]);
      if (savedPrefs) setPrefs(savedPrefs);
      setProgress(p);
      resumeIfActive();
      if (!safetyAccepted) return setRoute({ name: 'safety' });
      if (!setupDone) return setRoute({ name: 'setup' });
      // A chapter was in progress (e.g. Chrome killed the page in a pocket): pick it up.
      const ch = active && chapterById(active.chapterId);
      if (ch && !p.completed.includes(ch.id)) return setRoute({ name: 'chapter', chapter: ch, resume: active });
      setRoute({ name: 'home' });
    })();
  }, []);

  const go = (name, params = {}) => setRoute({ name, ...params });
  const updatePrefs = (next) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setMeta('prefs', merged);
  };
  const startChapter = async (chapter) => {
    const active = await getActiveChapter();
    go('chapter', { chapter, resume: active?.chapterId === chapter.id ? active : null });
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
          onStart={startChapter}
          onProgress={setProgress}
          onNavigate={go}
        />
      );
    case 'chapter':
      return (
        <Chapter
          key={route.chapter.id}
          story={story}
          chapter={route.chapter}
          resume={route.resume}
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
        <Summary story={story} chapter={route.chapter} session={route.session} progress={progress} onHome={() => go('home')} />
      );
    case 'settings':
      return <Settings prefs={prefs} onPrefs={updatePrefs} onNavigate={go} onBack={() => go('home')} />;
    case 'diagnostics':
      return <Diagnostics onBack={() => go('settings')} />;
    case 'fieldtest':
      return <FieldTest onBack={() => go('settings')} />;
    default:
      return <main class="screen center" aria-busy="true" />;
  }
}
