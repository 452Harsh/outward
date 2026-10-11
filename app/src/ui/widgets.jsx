import { useEffect, useRef, useState } from 'preact/hooks';
import Icon from './icons.jsx';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Number that counts up from `from` to `to`. */
export function CountUp({ from = 0, to, ms = 900, format = (n) => n }) {
  const [v, setV] = useState(reduced() ? to : from);
  useEffect(() => {
    if (reduced()) return setV(to);
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  return <>{format(v)}</>;
}

/** XP bar; animates from `fromProgress` to `progress` with a bounce. */
export function XPBar({ level, rank, xp, next, floor, progress, fromProgress, compact = false }) {
  const [p, setP] = useState(fromProgress ?? progress);
  useEffect(() => {
    const t = setTimeout(() => setP(progress), 120);
    return () => clearTimeout(t);
  }, [progress]);
  return (
    <div class={`xp ${compact ? 'compact' : ''}`} aria-label={`Level ${level}, ${rank}, ${xp - floor} of ${next - floor} XP to the next level`}>
      <div class="xp-top">
        <span>{rank}</span>
        <span class="num">
          {xp - floor}/{next - floor}
        </span>
      </div>
      <div class="xp-bar">
        <span style={{ width: `${Math.max(3, Math.min(100, p * 100))}%` }} />
      </div>
    </div>
  );
}

/** Campfire that grows with the streak; embers at 0. */
export function Flame({ days, size = 40, label = true }) {
  const ember = !days;
  const s = Math.min(1, 0.45 + (days ?? 0) / 20);
  return (
    <div class="flame" role="img" aria-label={ember ? 'No streak yet: your fire is waiting' : `${days}-day streak`}>
      <svg width={size} height={size * 1.1} viewBox="0 0 60 66" aria-hidden="true">
        <ellipse cx="30" cy="60" rx="22" ry="4" fill="var(--line)" />
        <path d="M14 56 L46 50 M16 50 L46 57" stroke="#5a3e2b" stroke-width="5" stroke-linecap="round" />
        {ember ? (
          <>
            <circle cx="24" cy="50" r="3" fill="var(--sunrise)" opacity=".7" />
            <circle cx="34" cy="49" r="2.5" fill="var(--amber)" opacity=".8" />
          </>
        ) : (
          <g class="fl" style={{ transform: `scale(${s})`, transformOrigin: '30px 52px' }}>
            <path d="M30 6 C40 20 48 28 46 40 C44 50 37 54 30 54 C22 54 15 49 14 40 C13 30 22 24 24 14 C27 20 28 24 30 26 C31 18 31 12 30 6Z" fill="var(--sunrise)" stroke="#17251f" stroke-width="2.5" stroke-linejoin="round" />
            <path d="M30 28 C36 35 39 40 37 46 C35 51 25 51 23 46 C21 40 27 37 30 28Z" fill="var(--amber)" />
          </g>
        )}
      </svg>
      {label && (
        <>
          <span class="count">{days ?? 0}</span>
          <span class="lab">{ember ? 'embers' : days === 1 ? 'day' : 'days'}</span>
        </>
      )}
    </div>
  );
}

/** Speech bubble; with `words` + `index` it shows captions word by word. */
export function Bubble({ children, words, index = -1, live = 'polite', tail = 'down' }) {
  return (
    <div class={`bubble tail-${tail}`} aria-live={live}>
      {words ? (
        <>
          <span class="said">{words.slice(0, index + 1).join(' ')}</span>{' '}
          <span class="todo">{words.slice(index + 1).join(' ')}</span>
        </>
      ) : (
        children
      )}
    </div>
  );
}

/** One-shot confetti burst inside the nearest positioned parent. */
export function Confetti({ fire }) {
  const host = useRef(null);
  useEffect(() => {
    if (!fire || !host.current || reduced()) return;
    const colors = ['var(--sunrise)', 'var(--amber)', 'var(--sky)', 'var(--leaf)', 'var(--forest)'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('i');
      const a = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 170;
      p.style.cssText = `background:${colors[i % 5]};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 70}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 0.15}s`;
      host.current.appendChild(p);
      setTimeout(() => p.remove(), 2000);
    }
  }, [fire]);
  return <div class="confetti" ref={host} aria-hidden="true" />;
}

export function TabBar({ on, onNavigate }) {
  const tabs = [
    ['home', 'Home'],
    ['quest', 'Quest'],
    ['journal', 'Journal'],
    ['settings', 'Me'],
  ];
  return (
    <nav class="tabbar" aria-label="Sections">
      {tabs.map(([k, label]) => (
        <button key={k} class={k === on ? 'on' : ''} aria-current={k === on ? 'page' : undefined} onClick={() => onNavigate(k)}>
          <Icon name={k === 'settings' ? 'me' : k} size={26} />
          {label}
        </button>
      ))}
    </nav>
  );
}
