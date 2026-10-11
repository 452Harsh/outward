import { useEffect, useState } from 'preact/hooks';
import { getActiveChapter, getMeta, getProgress, setMeta } from './db/index.js';
import { bundledStory, installedStories } from './engine/stories.js';
import { resumeIfActive } from './lab/fieldtest.js';
import SafetyNote from './screens/SafetyNote.jsx';
import Setup from './screens/Setup.jsx';
import Home from './screens/Home.jsx';
import Chapter from './screens/Chapter.jsx';
import Summary from './screens/Summary.jsx';
import Settings from './screens/Settings.jsx';
import Diagnostics from './screens/Diagnostics.jsx';
import FieldTest from './screens/FieldTest.jsx';

export function App() {
  const [route, setRoute] = useState({ name: 'loading' });
  const [stories, setStories] = useState([bundledStory()]);
  const [story, setStory] = useState(bundledStory());
  const [progress, setProgress] = useState(null);
  const [prefs, setPrefs] = useState({ timeBudget: 30, narration: true });

  const selectStory = async (id, list = stories) => {
    const s = list.find((x) => x.id === id) ?? list[0];
    setStory(s);
    setProgress(await getProgress(s.id));
    return s;
  };
  const refreshStories = async (selectId) => {
    const list = await installedStories();
    setStories(list);
    if (selectId) await selectStory(selectId, list);
    return list;
  };

  useEffect(() => {
    (async () => {
      const [safetyAccepted, setupDone, savedPrefs, active, list] = await Promise.all([
        getMeta('safetyAccepted', false),
        getMeta('setupDone', false),
        getMeta('prefs', null),
        getActiveChapter(),
        installedStories(),
      ]);
      if (savedPrefs) setPrefs(savedPrefs);
      setStories(list);
      const s = await selectStory(active?.storyId ?? savedPrefs?.storyId ?? list[0].id, list);
      const p = await getProgress(s.id);
      resumeIfActive();
      if (!safetyAccepted) return setRoute({ name: 'safety' });
      if (!setupDone) return setRoute({ name: 'setup' });
      // A chapter was in progress (e.g. Chrome killed the page in a pocket): pick it up.
      const ch = active && s.chapters.find((c) => c.id === active.chapterId);
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
          stories={stories}
          onSelectStory={(id) => {
            selectStory(id);
            updatePrefs({ storyId: id });
          }}
          onStoriesChanged={refreshStories}
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
