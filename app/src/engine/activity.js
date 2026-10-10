// Outside-time rules: screen time, the walking gate on missions, streaks and
// totals. Pure functions, so they're easy to test and reason about.

// ---- Screen time (Page Visibility) ----------------------------------------
// "Screen time" is time Outward is visible. A visible page with the screen
// on is the closest thing a web app can measure to "looking at the phone".

export const newScreenClock = (now, visible = true) => ({ visibleMs: 0, visibleSince: visible ? now : null });

export function onVisibility(clock, visible, now) {
  if (visible) return clock.visibleSince == null ? { ...clock, visibleSince: now } : clock;
  if (clock.visibleSince == null) return clock;
  return { visibleMs: clock.visibleMs + (now - clock.visibleSince), visibleSince: null };
}

export function screenMs(clock, now) {
  return clock.visibleMs + (clock.visibleSince == null ? 0 : now - clock.visibleSince);
}

// ---- Walking gate -----------------------------------------------------------
// "I found it" opens once the walk is long enough for the chosen time budget.
// Without a usable GPS fix (e.g. a laptop), it opens after a minimum time.

export const TIME_FALLBACK_MIN = { 10: 5, 30: 12, 60: 25 };

/**
 * @returns {{ready: boolean, by?: 'distance'|'time'|'practice', need: number, meters: number, toGo: number, waitMin?: number, gps: boolean}}
 */
export function missionGate({ chapter, timeBudget, walk, missionStartedAt, now, practice = false }) {
  const need = chapter.unlock.minMeters[String(timeBudget)] ?? chapter.unlock.minMeters['10'];
  const meters = Math.round(walk?.meters ?? 0);
  const gps = (walk?.points ?? 0) > 0;
  const base = { need, meters, toGo: Math.max(0, need - meters), gps };
  if (practice) return { ...base, ready: true, by: 'practice' };
  if (meters >= need) return { ...base, ready: true, by: 'distance' };
  const fallbackMin = TIME_FALLBACK_MIN[timeBudget] ?? TIME_FALLBACK_MIN[10];
  const elapsedMin = (now - (missionStartedAt ?? now)) / 60000;
  if (!gps && elapsedMin >= fallbackMin) return { ...base, ready: true, by: 'time' };
  return { ...base, ready: false, waitMin: gps ? undefined : Math.ceil(fallbackMin - elapsedMin) };
}

// ---- Streaks and totals ------------------------------------------------------

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const counted = (sessions) => sessions.filter((s) => !s.practice);

/** Consecutive days (ending today, or yesterday if nothing yet today) with a finished chapter. */
export function streakDays(sessions, now = Date.now()) {
  const days = new Set(counted(sessions).map((s) => dayKey(s.endedAt)));
  const day = new Date(now);
  if (!days.has(dayKey(day))) day.setDate(day.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(day))) {
    n += 1;
    day.setDate(day.getDate() - 1);
  }
  return n;
}

export function totals(sessions) {
  const list = counted(sessions);
  const outsideMs = list.reduce((n, s) => n + (s.endedAt - s.startedAt), 0);
  const screen = list.reduce((n, s) => n + (s.screenMs ?? 0), 0);
  return {
    chapters: list.length,
    meters: list.reduce((n, s) => n + (s.meters ?? 0), 0),
    outsideMin: Math.round(outsideMs / 60000),
    screenMin: Math.round(screen / 60000),
    screenFreePct: outsideMs ? Math.round(100 * (1 - screen / outsideMs)) : null,
  };
}

// ---- Drawing the walk ---------------------------------------------------------

/**
 * Project [lat, lon, resumed] points into a w×h box (equirectangular, fine for
 * a walk-sized area), keeping the aspect ratio. Also returns metres per pixel
 * for a scale bar.
 */
export function projectPath(path, w, h, pad = 16) {
  if (!path?.length) return { points: [], mPerPx: 0 };
  const lat0 = path.reduce((n, p) => n + p[0], 0) / path.length;
  const mLat = 110540;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = path.map(([lat, lon, r]) => ({ x: lon * mLon, y: -lat * mLat, resumed: !!r }));
  const xs = xy.map((p) => p.x);
  const ys = xy.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanM = Math.max(maxX - minX, maxY - minY, 50);
  const scale = Math.min(w - 2 * pad, h - 2 * pad) / spanM;
  const ox = (w - (maxX - minX) * scale) / 2;
  const oy = (h - (maxY - minY) * scale) / 2;
  return {
    points: xy.map((p) => ({ x: ox + (p.x - minX) * scale, y: oy + (p.y - minY) * scale, resumed: p.resumed })),
    mPerPx: 1 / scale,
  };
}
