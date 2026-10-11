import { useEffect, useState } from 'preact/hooks';
import { resetStory } from '../db/index.js';
import { downloadPack, fetchPackIndex, lockedBy } from '../engine/stories.js';
import { currentChapter, newProgress } from '../engine/story.js';
import { formatBytes } from '../lib/device.js';
import { sfx } from '../lib/sfx.js';
import Icon, { iconForFind } from '../ui/icons.jsx';
import Sprig from '../ui/Sprig.jsx';
import { TabBar } from '../ui/widgets.jsx';

const W = 300;
const STEP = 112;

/** Node positions for a winding trail, bottom (chapter 1) to top. */
function layout(n) {
  const h = n * STEP + 40;
  return {
    h,
    nodes: Array.from({ length: n }, (_, i) => ({ x: i % 2 ? 214 : 86, y: h - 56 - i * STEP })),
  };
}

function trailPath(nodes) {
  return nodes.reduce((d, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const a = nodes[i - 1];
    const my = (a.y + p.y) / 2;
    return `${d} C${a.x} ${my} ${p.x} ${my} ${p.x} ${p.y}`;
  }, '');
}

/** Quest map: each story is a trail; finished stops show what you found there. */
export default function Quest({ story, stories, progress, game, onSelectStory, onStoriesChanged, onProgress, onStart, onNavigate }) {
  const [offers, setOffers] = useState([]);
  const [locked, setLocked] = useState(null);
  const [dl, setDl] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const chapter = currentChapter(story, progress);
  const { h, nodes } = layout(story.chapters.length);
  const currentIndex = chapter ? story.chapters.indexOf(chapter) : -1;
  const doneCount = progress.completed.length;

  useEffect(() => {
    fetchPackIndex().then((index) => {
      const have = new Map(stories.map((s) => [s.id, s.version ?? 0]));
      setOffers(index.filter((p) => !have.has(p.id) || p.version > have.get(p.id)));
    });
  }, [stories]);
  useEffect(() => {
    lockedBy(story, stories).then(setLocked);
  }, [story, stories, progress]);

  const getPack = async (offer) => {
    setDl({ id: offer.id, done: 0, total: offer.bytes });
    try {
      await downloadPack(offer.id, { onProgress: (done, total) => setDl({ id: offer.id, done, total }) });
      setDl(null);
      sfx('found');
      await onStoriesChanged(offer.id);
    } catch (err) {
      setDl({ id: offer.id, error: String(err?.message ?? err) });
    }
  };

  const restart = async () => {
    await resetStory(story.id);
    onProgress(newProgress(story.id));
    setConfirmReset(false);
  };

  // Last completed chapter's path into the current one is drawn solid.
  const solid = trailPath(nodes.slice(0, Math.max(1, Math.min(nodes.length, doneCount + 1))));

  return (
    <main class="screen with-tabs">
      <header>
        <p class="eyebrow">Quest map</p>
        <h1>{story.title}</h1>
        <p class="lede">{story.tagline}</p>
      </header>

      {stories.length > 1 && (
        <nav class="story-switch" aria-label="Stories">
          {stories.map((s) => (
            <button key={s.id} class={s.id === story.id ? 'on' : ''} aria-pressed={s.id === story.id} onClick={() => onSelectStory(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
      )}

      {locked && (
        <p class="note">
          <b>Locked.</b> This story continues where {locked.title} ends. Finish it first.
        </p>
      )}

      <div class="trail">
        <svg class="map" viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`${story.title}: ${doneCount} of ${story.chapters.length} chapters done`}>
          <path d={trailPath(nodes)} fill="none" stroke="var(--line)" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 22" />
          {doneCount > 0 && <path d={solid} fill="none" stroke="var(--leaf)" stroke-width="10" stroke-linecap="round" />}
          {story.chapters.map((c, i) => {
            const p = nodes[i];
            const done = progress.completed.includes(c.id);
            const current = i === currentIndex && !locked;
            const icon = done ? iconForFind(progress.discoveries?.[c.id], c.id) : null;
            const labelX = p.x < W / 2 ? p.x + 36 : p.x - 36;
            return (
              <g key={c.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={current ? 28 : 24}
                  fill={done ? 'var(--surface)' : current ? 'var(--amber)' : 'var(--surface-2)'}
                  stroke={done || current ? '#17251f' : 'var(--muted)'}
                  stroke-width="3"
                  stroke-dasharray={done || current ? undefined : '5 5'}
                />
                {done && (
                  <svg x={p.x - 16} y={p.y - 16} width="32" height="32" viewBox="0 0 32 32">
                    <Icon name={icon} size={32} />
                  </svg>
                )}
                {!done && !current && (
                  <g color="var(--muted)">
                    <svg x={p.x - 12} y={p.y - 12} width="24" height="24" viewBox="0 0 32 32">
                      <Icon name="lock" size={24} />
                    </svg>
                  </g>
                )}
                <text x={labelX} y={p.y - 2} text-anchor={p.x < W / 2 ? 'start' : 'end'} font-family="var(--font-display)" font-weight="800" font-size="15" fill="var(--ink)">
                  {c.number}. {c.title}
                </text>
                <text x={labelX} y={p.y + 16} text-anchor={p.x < W / 2 ? 'start' : 'end'} font-size="12" fill="var(--muted)">
                  {done ? `“${(progress.discoveries?.[c.id] ?? '').slice(0, 26)}${(progress.discoveries?.[c.id] ?? '').length > 26 ? '…' : ''}”` : current ? 'You are here' : 'Locked'}
                </text>
              </g>
            );
          })}
        </svg>
        {currentIndex >= 0 && !locked && (
          <div class="here" style={{ left: `${(nodes[currentIndex].x / W) * 100}%`, top: `${((nodes[currentIndex].y - 16) / h) * 100}%` }}>
            <Sprig state="idle" size={64} label="Sprig is here" />
          </div>
        )}
      </div>

      {chapter && !locked && (
        <button class="btn primary big" onClick={() => onStart(chapter)}>
          {doneCount ? `Continue: chapter ${chapter.number}` : 'Start chapter 1'}
        </button>
      )}
      {!chapter &&
        (confirmReset ? (
          <div class="card">
            <p>Start {story.title} again from chapter 1? Your journal and badges stay.</p>
            <div class="stats2" style={{ marginTop: '12px' }}>
              <button class="btn" onClick={() => setConfirmReset(false)}>
                Keep it
              </button>
              <button class="btn primary" onClick={restart}>
                Start again
              </button>
            </div>
          </div>
        ) : (
          <button class="btn" onClick={() => setConfirmReset(true)}>
            Walk {story.title} again
          </button>
        ))}

      {offers.map((o) => (
        <section class="card offer" key={o.id}>
          <p class="eyebrow">{stories.some((s) => s.id === o.id) ? 'Story update' : 'New story'}</p>
          <h2>{o.title}</h2>
          <p>{o.tagline}</p>
          <p class="hint">
            {o.chapters} chapters · {formatBytes(o.bytes)} with narration · works offline once downloaded
          </p>
          {dl?.id === o.id && !dl.error ? (
            <progress max={dl.total || 1} value={dl.done} />
          ) : (
            <button class="btn primary" onClick={() => getPack(o)}>
              {dl?.id === o.id ? 'Try again' : 'Download'}
            </button>
          )}
          {dl?.id === o.id && dl.error && <p class="note warn">{dl.error}</p>}
        </section>
      ))}

      <p class="hint center-text">
        {game.badges.filter((b) => b.earnedAt).length} badges · {(game.meters / 1000).toFixed(1)} km walked in total
      </p>
      <TabBar on="quest" onNavigate={onNavigate} />
    </main>
  );
}
