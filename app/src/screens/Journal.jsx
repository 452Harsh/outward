import { useEffect, useState } from 'preact/hooks';
import { getPhoto } from '../db/index.js';
import Icon, { BADGE_BG, iconForFind } from '../ui/icons.jsx';
import Sprig from '../ui/Sprig.jsx';
import { TabBar } from '../ui/widgets.jsx';


function Photo({ id, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u;
    getPhoto(id).then((b) => {
      if (b) setUrl((u = URL.createObjectURL(b)));
    });
    return () => u && URL.revokeObjectURL(u);
  }, [id]);
  return url ? <img src={url} alt={alt} loading="lazy" /> : null;
}

/** Discovery journal (one card per find) and the badge shelf. */
export default function Journal({ sessions, stories, game, onNavigate }) {
  const [tab, setTab] = useState('journal');
  const chapterOf = (s) => stories.find((x) => x.id === s.storyId)?.chapters.find((c) => c.id === s.chapterId);
  const finds = [...sessions].filter((s) => s.discovery).sort((a, b) => b.endedAt - a.endedAt);
  const earned = game.badges.filter((b) => b.earnedAt).length;

  return (
    <main class="screen with-tabs">
      <header>
        <p class="eyebrow">Your adventure log</p>
        <h1>{tab === 'journal' ? `${finds.length} finds` : `${earned} of ${game.badges.length} badges`}</h1>
      </header>

      <div class="tabs" role="tablist" aria-label="Journal sections">
        <button role="tab" aria-selected={tab === 'journal'} onClick={() => setTab('journal')}>
          Journal
        </button>
        <button role="tab" aria-selected={tab === 'badges'} onClick={() => setTab('badges')}>
          Badges
        </button>
      </div>

      {tab === 'journal' &&
        (finds.length ? (
          <div class="journal">
            {finds.map((s) => {
              const ch = chapterOf(s);
              return (
                <article class="jcard" key={s.id}>
                  <div class="ph">
                    <Photo id={s.id} alt={`Photo of ${s.discovery}`} />
                    <Icon name={iconForFind(s.discovery, s.chapterId)} size={40} />
                  </div>
                  <div class="q">“{s.discovery}”</div>
                  <div class="m">
                    {ch ? `Ch ${ch.number} · ` : ''}
                    {((s.meters ?? 0) / 1000).toFixed(1)} km · {new Date(s.endedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    {s.place ? ` · ${s.place}` : ''}
                    {s.practice ? ' · practice' : ''}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div class="empty">
            <Sprig state="idle" size={110} />
            <p>Your finds will collect here. Each mission adds a card.</p>
          </div>
        ))}

      {tab === 'badges' && (
        <div class="badge-grid">
          {game.badges.map((b) => (
            <div class={`badge ${b.earnedAt ? '' : 'locked'}`} key={b.id}>
              <div class="disc" style={b.earnedAt ? { background: BADGE_BG[b.icon] } : undefined}>
                <Icon name={b.icon} size={34} />
              </div>
              <span class="name">{b.earnedAt ? b.name : '?'}</span>
              <span class="when">{b.earnedAt ? new Date(b.earnedAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : b.desc}</span>
            </div>
          ))}
        </div>
      )}

      <TabBar on="journal" onNavigate={onNavigate} />
    </main>
  );
}
