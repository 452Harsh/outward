import { useEffect, useMemo, useState } from 'preact/hooks';
import { getPhoto, savePhoto, updateSession } from '../db/index.js';
import { levelInfo } from '../engine/game.js';
import { currentChapter } from '../engine/story.js';
import { buzz, haptics } from '../lib/device.js';
import { compressPhoto } from '../lib/photo.js';
import { sfx } from '../lib/sfx.js';
import Icon, { BADGE_BG } from '../ui/icons.jsx';
import Sprig from '../ui/Sprig.jsx';
import { Confetti, CountUp, XPBar } from '../ui/widgets.jsx';
import WalkMap from './WalkMap.jsx';

/** Mission complete: the trophy stat, XP, level-ups, badges, and the new journal card. */
export default function Complete({ story, chapter, session, before, game, progress, onHome }) {
  const mine = game.perSession.get(session.id) ?? { xp: 0, parts: [], badges: [] };
  const newBadges = game.badges.filter((b) => mine.badges.includes(b.id));
  const prev = before ?? levelInfo(Math.max(0, game.xp - mine.xp));
  const leveledUp = game.level > prev.level;
  const [showLevel, setShowLevel] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [place, setPlace] = useState(session.place ?? '');
  const next = currentChapter(story, progress);

  const totalMs = session.endedAt - session.startedAt;
  const outsideMin = Math.max(1, Math.round(totalMs / 60000));
  const screenMin = Math.round((session.screenMs ?? 0) / 60000);
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);

  useEffect(() => {
    sfx('complete');
    buzz(haptics.chapterEnd);
    getPhoto(session.id).then((b) => b && setPhoto(b));
    let t1;
    let t2;
    if (newBadges.length) t1 = setTimeout(() => sfx('badge'), 1300);
    if (leveledUp) {
      t2 = setTimeout(() => {
        setShowLevel(true);
        sfx('levelup');
        buzz([80, 60, 80, 60, 240]);
      }, 1700);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  useEffect(() => () => photoUrl && URL.revokeObjectURL(photoUrl), [photoUrl]);

  const addPhoto = async (e) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const blob = await compressPhoto(file);
    await savePhoto(session.id, blob);
    setPhoto(blob);
  };

  return (
    <main class="screen">
      <Confetti fire />
      <div class="stage-sprig">
        <Sprig state="celebrating" size={130} />
      </div>
      <header class="center-text">
        <p class="eyebrow">Chapter {chapter.number} complete</p>
        <h1>{chapter.title}</h1>
      </header>

      <section class="trophy" aria-label="Your walk">
        <span class="k">This adventure</span>
        <div>
          <b>
            <CountUp to={outsideMin} />
          </b>
          <span>{outsideMin === 1 ? 'minute' : 'minutes'} outside</span>
        </div>
        <div>
          <b>
            <CountUp to={screenMin} />
          </b>
          <span>{screenMin === 1 ? 'minute' : 'minutes'} on screen</span>
        </div>
      </section>
      {game.today.outsideMin > outsideMin && (
        <p class="today">
          Today in total: <b>{game.today.outsideMin} min</b> outside · <b>{game.today.screenMin} min</b> on screen
        </p>
      )}

      {session.practice ? (
        <p class="note">Practice mode: no XP, streak or badges for this one.</p>
      ) : (
        <>
          <div class="xp-gain" aria-label={`${mine.xp} XP earned`}>
            +<CountUp to={mine.xp} ms={1200} /> XP
          </div>
          <div class="xp-parts">
            {mine.parts.map((p) => (
              <span key={p.label}>
                {p.label} +{p.xp}
              </span>
            ))}
          </div>
          <div class="hud">
            <span class="lvl">Lv {game.level}</span>
            <XPBar {...game} fromProgress={leveledUp ? 0 : prev.progress} />
          </div>
        </>
      )}

      {newBadges.map((b) => (
        <div class="newbadge" key={b.id}>
          <div class="disc" style={{ background: BADGE_BG[b.icon] }}>
            <Icon name={b.icon} size={30} />
          </div>
          <div>
            <b>New badge: {b.name}</b>
            <div class="hint">{b.desc}</div>
          </div>
        </div>
      ))}

      <article class="find-card" aria-label="New journal card">
        {photoUrl && <img src={photoUrl} alt={`Your photo of ${session.discovery}`} />}
        <div class="q">“{session.discovery}”</div>
        <div class="m">
          Added to your journal · {(session.meters / 1000).toFixed(1)} km ·{' '}
          {new Date(session.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
        <div class="row">
          <input
            type="text"
            aria-label="Place name (optional)"
            placeholder="Place name"
            value={place}
            maxLength={60}
            onInput={(e) => setPlace(e.currentTarget.value)}
            onBlur={() => updateSession(session.id, { place: place.trim() || null })}
          />
          <label class="btn file-btn">
            {photo ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" capture="environment" onChange={addPhoto} />
          </label>
        </div>
        <p class="hint">Photos and place names stay on this phone. They are never sent to the storyteller.</p>
      </article>

      {session.path?.length > 1 && (
        <section class="card">
          <p class="eyebrow">Your walk</p>
          <WalkMap path={session.path} height={180} />
        </section>
      )}

      <p class="center-text hint">{next ? `Unlocked: Chapter ${next.number} · ${next.title}` : `You finished ${story.title}!`}</p>
      <footer class="actions">
        <button class="btn primary big" onClick={onHome}>
          Done
        </button>
      </footer>

      {showLevel && (
        <div class="levelup" role="dialog" aria-label="Level up">
          <Confetti fire />
          <Sprig state="celebrating" size={170} />
          <p class="eyebrow">Level up</p>
          <span class="big">Level {game.level}</span>
          <span class="rank">{game.rank}</span>
          <button class="btn primary big" onClick={() => setShowLevel(false)}>
            Yes!
          </button>
        </div>
      )}
    </main>
  );
}
