import { useEffect, useMemo, useState } from 'preact/hooks';
import { getActiveChapter, getMeta, getProgress, getSessions, setMeta } from './db/index.js';
import { gameState } from './engine/game.js';
import { bundledStory, installedStories } from './engine/stories.js';
import { resumeIfActive } from './lab/fieldtest.js';
import { setSfxEnabled } from './lib/sfx.js';
import Welcome from './screens/Welcome.jsx';
import Setup from './screens/Setup.jsx';
import Home from './screens/Home.jsx';
import Chapter from './screens/Chapter.jsx';
import Complete from './screens/Complete.jsx';
import Quest from './screens/Quest.jsx';
import Journal from './screens/Journal.jsx';
import Settings from './screens/Settings.jsx';
import Diagnostics from './screens/Diagnostics.jsx';
import FieldTest from './screens/FieldTest.jsx';

const DEFAULT_PREFS = { timeBudget: 30, narration: true, theme: 'system', sfx: true };

export function App() {
  const [route, setRoute] = useState({ name: 'loading' });
  const [stories, setStories] = useState([bundledStory()]);
  const [story, setStory] = useState(bundledStory());
  const [progress, setProgress] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  // Game state (XP, level, badges, streak) is derived from stored sessions.
  const lastChapterOf = useMemo(() => Object.fromEntries(stories.map((s) => [s.id, s.chapters.at(-1).id])), [stories]);
  const game = useMemo(() => gameState(sessions, lastChapterOf), [sessions, lastChapterOf]);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'light' || prefs.theme === 'dark') root.setAttribute('data-theme', prefs.theme);
    else root.removeAttribute('data-theme');
    setSfxEnabled(prefs.sfx !== false);
  }, [prefs.theme, prefs.sfx]);

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
  const refreshSessions = async () => setSessions(await getSessions());

  useEffect(() => {
    (async () => {
      const [safetyAccepted, setupDone, savedPrefs, active, list, all] = await Promise.all([
        getMeta('safetyAccepted', false),
        getMeta('setupDone', false),
        getMeta('prefs', null),
        getActiveChapter(),
        installedStories(),
        getSessions(),
      ]);
      if (savedPrefs) setPrefs({ ...DEFAULT_PREFS, ...savedPrefs });
      setStories(list);
      setSessions(all);
      const s = await selectStory(active?.storyId ?? savedPrefs?.storyId ?? list[0].id, list);
      const p = await getProgress(s.id);
      resumeIfActive();
      if (!safetyAccepted) return setRoute({ name: 'welcome' });
      if (!setupDone) return setRoute({ name: 'setup' });
      // A chapter was in progress (e.g. Chrome killed the page in a pocket): pick it up.
      const ch = active && s.chapters.find((c) => c.id === active.chapterId);
      if (ch && !p.completed.includes(ch.id)) return setRoute({ name: 'chapter', chapter: ch, resume: active });
      setRoute({ name: 'home' });
    })();
  }, []);

  const go = (name, params = {}) => {
    window.scrollTo(0, 0);
    setRoute({ name, ...params });
  };
  const updatePrefs = (next) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setMeta('prefs', merged);
  };
  const startChapter = async (chapter) => {
    const active = await getActiveChapter();
    go('chapter', { chapter, resume: active?.chapterId === chapter.id ? active : null });
  };
  const chooseStory = (id) => {
    selectStory(id);
    updatePrefs({ storyId: id });
  };
  const shared = { story, stories, progress, prefs, game, sessions, onPrefs: updatePrefs, onNavigate: go };

  switch (route.name) {
    case 'welcome':
    case 'safety':
      return (
        <Welcome
          firstRun={route.name === 'welcome'}
          onDone={async () => {
            await setMeta('safetyAccepted', true);
            go((await getMeta('setupDone', false)) ? (route.name === 'safety' ? 'settings' : 'home') : 'setup');
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
      return <Home {...shared} onStart={startChapter} />;
    case 'quest':
      return (
        <Quest
          {...shared}
          onSelectStory={chooseStory}
          onStoriesChanged={refreshStories}
          onProgress={setProgress}
          onStart={startChapter}
        />
      );
    case 'journal':
      return <Journal {...shared} />;
    case 'chapter':
      return (
        <Chapter
          key={route.chapter.id}
          story={story}
          chapter={route.chapter}
          resume={route.resume}
          prefs={prefs}
          onPrefs={updatePrefs}
          progress={progress}
          onExit={() => go('home')}
          onComplete={async (nextProgress, session) => {
            setProgress(nextProgress);
            const before = game;
            await refreshSessions();
            go('complete', { chapter: route.chapter, session, before });
          }}
        />
      );
    case 'complete':
      return <Complete {...shared} chapter={route.chapter} session={route.session} before={route.before} onHome={() => go('home')} />;
    case 'settings':
      return <Settings {...shared} />;
    case 'diagnostics':
      return <Diagnostics onBack={() => go('settings')} />;
    case 'fieldtest':
      return <FieldTest onBack={() => go('settings')} />;
    default:
      return <main class="screen center" aria-busy="true" />;
  }
}
