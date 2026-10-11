// Small inline icon set (no icon font, nothing to download).
const P = {
  steps: (
    <g fill="#17251f">
      <ellipse cx="11" cy="21" rx="4" ry="6" transform="rotate(-12 11 21)" />
      <circle cx="8" cy="13" r="1.6" /><circle cx="11" cy="12" r="1.7" /><circle cx="14" cy="13" r="1.6" />
      <ellipse cx="21.5" cy="15" rx="4" ry="6" transform="rotate(12 21.5 15)" />
      <circle cx="18.5" cy="7" r="1.6" /><circle cx="21.5" cy="6" r="1.7" /><circle cx="24.5" cy="7" r="1.6" />
    </g>
  ),
  sun: (
    <>
      <circle cx="16" cy="18" r="6" fill="#ffc23d" stroke="#17251f" stroke-width="2" />
      <path d="M16 6v3M6 18h3M26 18h-3M9 11l2 2M23 11l-2 2" stroke="#17251f" stroke-width="2" stroke-linecap="round" />
    </>
  ),
  sunset: (
    <>
      <path d="M8 21a8 8 0 0 1 16 0z" fill="#ff7a2f" stroke="#17251f" stroke-width="2" />
      <path d="M4 25h24M16 6v4M7 12l2 2M25 12l-2 2" stroke="#17251f" stroke-width="2" stroke-linecap="round" />
    </>
  ),
  drop: <path d="M16 6c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15z" fill="#38a3e8" stroke="#17251f" stroke-width="2" />,
  fire: <path d="M16 5c5 6 8 9 8 15a8 8 0 0 1-16 0c0-4 3-6 4-10 2 2 3 4 4 5 1-4 0-6 0-10z" fill="#ff7a2f" stroke="#17251f" stroke-width="2" />,
  rain: (
    <>
      <path d="M8 16a6 6 0 0 1 11-3 5 5 0 0 1 5 7H9a4 4 0 0 1-1-4z" fill="#fff" stroke="#17251f" stroke-width="2" />
      <path d="M11 24l-1 3M17 24l-1 3M23 24l-1 3" stroke="#38a3e8" stroke-width="2" stroke-linecap="round" />
    </>
  ),
  map: (
    <>
      <path d="M6 9l7-3 6 3 7-3v17l-7 3-6-3-7 3z" fill="#fff1d6" stroke="#17251f" stroke-width="2" stroke-linejoin="round" />
      <path d="M10 18c3-4 6 0 9-4" stroke="#ff7a2f" stroke-width="2" fill="none" />
    </>
  ),
  book: <path d="M6 8h9v18H6zM17 8h9v18h-9z" fill="#fff" stroke="#17251f" stroke-width="2" />,
  phone: (
    <>
      <rect x="10" y="5" width="12" height="22" rx="3" fill="#fff" stroke="#17251f" stroke-width="2" />
      <path d="M8 26L24 6" stroke="#ff7a2f" stroke-width="3" stroke-linecap="round" />
    </>
  ),
  tree: (
    <>
      <path d="M16 4c6 0 9 5 8 10 3 2 2 8-3 8H11c-5 0-6-6-3-8-1-5 2-10 8-10z" fill="#49b86e" stroke="#17251f" stroke-width="2" />
      <path d="M16 18v10" stroke="#5a3e2b" stroke-width="3" stroke-linecap="round" />
    </>
  ),
  grid: <path d="M7 7h8v8H7zM17 7h8v8h-8zM7 17h8v8H7zM17 17h8v8h-8z" fill="#ffc23d" stroke="#17251f" stroke-width="2" />,
  ear: (
    <>
      <path d="M11 13a6 6 0 0 1 12 0c0 4-4 5-4 9a3 3 0 0 1-6 0" fill="none" stroke="#17251f" stroke-width="2.5" stroke-linecap="round" />
      <path d="M25 9c2 2 3 4 3 7M27 6c3 3 4 6 4 10" stroke="#ff7a2f" stroke-width="2" fill="none" stroke-linecap="round" />
    </>
  ),
  heart: <path d="M16 27S5 20 5 12a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 8-11 15-11 15z" fill="#ff7a2f" stroke="#17251f" stroke-width="2" />,
  star: <path d="M16 4l3.5 7.5 8 1-6 5.5 1.6 8L16 22l-7.1 4 1.6-8-6-5.5 8-1z" fill="#ffc23d" stroke="#17251f" stroke-width="2" stroke-linejoin="round" />,
  lock: <path d="M10 15v-4a6 6 0 0 1 12 0v4M8 15h16v12H8z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />,
  shield: <path d="M16 3l10 4v8c0 7-4.5 11-10 14C10.5 26 6 22 6 15V7z" fill="currentColor" />,
  home: <path d="M5 15l11-9 11 9v11h-7v-7h-8v7H5z" fill="currentColor" />,
  quest: <path d="M4 8l8-3 8 3 8-3v19l-8 3-8-3-8 3z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />,
  journal: <path d="M7 4h16a2 2 0 0 1 2 2v22H9a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />,
  me: (
    <>
      <circle cx="16" cy="11" r="5" fill="currentColor" />
      <path d="M6 28c1-6 6-9 10-9s9 3 10 9z" fill="currentColor" />
    </>
  ),
};

/** Badge disc colours, shared by the journal shelf and the complete screen. */
export const BADGE_BG = {
  steps: 'var(--leaf)', sun: 'var(--amber)', sunset: 'var(--sunrise)', rain: 'var(--sky)', drop: 'var(--sky)',
  map: 'var(--amber)', fire: 'var(--sunrise)', phone: 'var(--leaf)', book: 'var(--amber)',
};

export default function Icon({ name, size = 28, label }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
      {P[name] ?? P.star}
    </svg>
  );
}

/** Pick an icon for a find, for journal cards and quest-map nodes. */
export function iconForFind(text = '', chapterId = '') {
  const t = text.toLowerCase();
  if (/rain|puddle|drizzl/.test(t)) return 'rain';
  if (/water|stream|river|fountain|tap|pond|lake|canal|drain|sea/.test(t)) return 'drop';
  if (/tree|banyan|peepal|oak|wood|leaf|leaves|moss|plant|flower/.test(t)) return 'tree';
  if (/brick|tile|stripe|pattern|row|railing|grid|jali/.test(t)) return 'grid';
  if (/bird|song|bell|sound|call|wind|hum|laugh|music|koel|crow/.test(t)) return 'ear';
  if (/bench|mural|sign|kind|left for|library|feeder|planted/.test(t)) return 'heart';
  if (/sun|light|shine|glow|window/.test(t)) return 'sun';
  return { ch1: 'drop', ch2: 'tree', ch3: 'grid', ch4: 'ear', ch5: 'heart' }[chapterId] ?? 'star';
}
