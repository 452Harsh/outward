// The game layer: XP, levels, ranks, badges and streaks. Everything is derived
// from the sessions already stored, so past walks count and nothing new is saved.
import { haversine } from '../sensors/geo.js';

const MIN = 60_000;
const DAY = 86_400_000;

export const RANKS = [
  [1, 'Wanderer'],
  [5, 'Pathfinder'],
  [10, 'Trailblazer'],
  [15, 'Wayfinder'],
  [20, 'Legend'],
];

/** XP needed to reach level L in total: 0, 100, 300, 600, 1000, … */
export const levelFloor = (level) => 50 * (level - 1) * level;

export function levelInfo(xp) {
  let level = 1;
  while (levelFloor(level + 1) <= xp) level += 1;
  const floor = levelFloor(level);
  const next = levelFloor(level + 1);
  const rank = [...RANKS].reverse().find(([l]) => level >= l)[1];
  return { xp, level, rank, floor, next, progress: (xp - floor) / (next - floor) };
}

export const BADGES = [
  { id: 'first-steps', name: 'First Steps', icon: 'steps', desc: 'Finish your first mission' },
  { id: 'early-bird', name: 'Early Bird', icon: 'sun', desc: 'Finish a mission before 8:00' },
  { id: 'golden-hour', name: 'Golden Hour', icon: 'sunset', desc: 'Finish in the hour before sunset' },
  { id: 'rain-walker', name: 'Rain Walker', icon: 'rain', desc: 'A find about rain, puddles or drizzle' },
  { id: 'found-water', name: 'Found Water', icon: 'drop', desc: 'A find with water, seen from the path' },
  { id: 'ten-km', name: '10 km Explorer', icon: 'map', desc: 'Walk 10 km in total' },
  { id: 'seven-fires', name: 'Seven Fires', icon: 'fire', desc: 'Go out 7 days in a row' },
  { id: 'phone-free', name: 'Phone-Free Hero', icon: 'phone', desc: '95% phone-free on a 20+ minute walk' },
  { id: 'story-keeper', name: 'Story Keeper', icon: 'book', desc: 'Finish a whole story' },
];

const RAIN = /\b(?:rain\w*|puddles?|drizzl\w*|wet)\b/i;
const WATER = /\b(?:water\w*|streams?|rivers?|fountains?|taps?|ponds?|lakes?|canals?|creeks?|brooks?|sea|waves?|drains?|puddles?)\b/i;

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Where a walk ended (last GPS point), or null. */
const endPoint = (s) => {
  const p = s.path?.at(-1);
  return p ? { lat: p[0], lon: p[1] } : null;
};

/** Sunset for a date and place (suncalc-style formula, works offline). */
export function sunset(date, lat, lon) {
  const rad = Math.PI / 180;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const J0 = 0.0009;
  const d = date.valueOf() / DAY - 0.5 + J1970 - J2000;
  const lw = rad * -lon;
  const phi = rad * lat;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
  const cosW = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null; // polar day or night
  const w = Math.acos(cosW);
  const a = J0 + (w + lw) / (2 * Math.PI) + n;
  const jset = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return new Date((jset + 0.5 - J1970) * DAY);
}

/**
 * XP for one finished chapter.
 * @param {object} s session
 * @param {{newPlace?: boolean, storyDone?: boolean}} ctx
 */
export function sessionXP(s, ctx = {}) {
  if (s.practice) return { total: 0, parts: [{ label: 'Practice mode', xp: 0 }] };
  const minutes = Math.min(60, Math.round((s.endedAt - s.startedAt) / MIN));
  const parts = [
    { label: `${minutes} min outside`, xp: minutes * 2 },
    { label: `${Math.round(s.meters ?? 0)} m walked`, xp: Math.min(60, Math.floor((s.meters ?? 0) / 50)) * 3 },
    { label: 'Mission complete', xp: 50 },
  ];
  if (ctx.newPlace) parts.push({ label: 'New place', xp: 30 });
  const total = s.endedAt - s.startedAt;
  if (minutes >= 20 && s.screenMs != null && s.screenMs / total <= 0.1) parts.push({ label: 'Phone-free walk', xp: 25 });
  if (ctx.storyDone) parts.push({ label: 'Story finished', xp: 200 });
  return { total: parts.reduce((n, p) => n + p.xp, 0), parts: parts.filter((p) => p.xp > 0) };
}

/** Longest run of consecutive days, and the current one (today or yesterday). */
export function streaks(sessions, now = Date.now()) {
  const days = new Set(sessions.filter((s) => !s.practice).map((s) => dayKey(s.endedAt)));
  let current = 0;
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    current += 1;
    d.setDate(d.getDate() - 1);
  }
  let best = 0;
  for (const k of days) {
    const [y, m, dd] = k.split('-').map(Number);
    const start = new Date(y, m - 1, dd);
    const prev = new Date(start);
    prev.setDate(prev.getDate() - 1);
    if (days.has(dayKey(prev))) continue; // not the start of a run
    let len = 0;
    while (days.has(dayKey(start))) {
      len += 1;
      start.setDate(start.getDate() + 1);
    }
    best = Math.max(best, len);
  }
  return { current, best };
}

/**
 * Whole game state from the session history.
 * @param {object[]} sessions stored sessions (any order)
 * @param {Record<string, string>} lastChapterOf storyId -> id of its final chapter
 */
export function gameState(sessions, lastChapterOf = {}, now = Date.now()) {
  const list = [...sessions].sort((a, b) => a.endedAt - b.endedAt);
  const places = [];
  const earned = new Map();
  const perSession = new Map();
  let xp = 0;
  let meters = 0;
  const earn = (id, s) => {
    if (!earned.has(id)) earned.set(id, s.endedAt);
  };

  for (const s of list) {
    if (s.practice) {
      perSession.set(s.id, { xp: 0, parts: sessionXP(s).parts, badges: [] });
      continue;
    }
    const before = new Set(earned.keys());
    const end = endPoint(s);
    const newPlace = Boolean(end) && places.every((p) => haversine(p, end) >= 300);
    if (end) places.push(end);
    const storyDone = lastChapterOf[s.storyId] === s.chapterId;
    const gained = sessionXP(s, { newPlace, storyDone });
    xp += gained.total;
    meters += s.meters ?? 0;

    const total = s.endedAt - s.startedAt;
    earn('first-steps', s);
    if (new Date(s.endedAt).getHours() < 8) earn('early-bird', s);
    if (end) {
      const set = sunset(new Date(s.endedAt), end.lat, end.lon);
      if (set && s.endedAt <= set.valueOf() && s.endedAt >= set.valueOf() - 60 * MIN) earn('golden-hour', s);
    }
    if (RAIN.test(s.discovery ?? '')) earn('rain-walker', s);
    if (WATER.test(s.discovery ?? '')) earn('found-water', s);
    if (meters >= 10_000) earn('ten-km', s);
    if (streaks(list.filter((x) => x.endedAt <= s.endedAt), s.endedAt).current >= 7) earn('seven-fires', s);
    if (total >= 20 * MIN && s.screenMs != null && s.screenMs / total <= 0.05) earn('phone-free', s);
    if (storyDone) earn('story-keeper', s);

    perSession.set(s.id, { xp: gained.total, parts: gained.parts, badges: [...earned.keys()].filter((b) => !before.has(b)) });
  }

  const counted = list.filter((s) => !s.practice);
  const today = counted.filter((s) => dayKey(s.endedAt) === dayKey(now));
  const last = counted.at(-1);
  return {
    ...levelInfo(xp),
    meters,
    perSession,
    badges: BADGES.map((b) => ({ ...b, earnedAt: earned.get(b.id) ?? null })),
    streak: streaks(counted, now),
    daysSinceLast: last ? Math.floor((now - last.endedAt) / DAY) : null,
    today: {
      outsideMin: Math.round(today.reduce((n, s) => n + (s.endedAt - s.startedAt), 0) / MIN),
      screenMin: Math.round(today.reduce((n, s) => n + (s.screenMs ?? 0), 0) / MIN),
    },
  };
}
