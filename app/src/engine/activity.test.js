import { describe, expect, it } from 'vitest';
import { missionGate, newScreenClock, onVisibility, projectPath, screenMs, streakDays, totals } from './activity.js';
import { getStory } from './story.js';

const ch1 = getStory().chapters[0];
const MIN = 60_000;

describe('screen time', () => {
  it('counts only visible time', () => {
    let c = newScreenClock(0);
    c = onVisibility(c, false, 2 * MIN); // pocketed after 2 min
    c = onVisibility(c, false, 3 * MIN); // duplicate hidden event is ignored
    c = onVisibility(c, true, 20 * MIN); // back out after 18 min
    expect(screenMs(c, 21 * MIN)).toBe(3 * MIN);
  });
});

describe('missionGate', () => {
  const walk = (meters, points = 5) => ({ meters, points });

  it('opens when the walk reaches the distance for the time budget', () => {
    expect(missionGate({ chapter: ch1, timeBudget: 30, walk: walk(700), missionStartedAt: 0, now: MIN })).toMatchObject({ ready: true, by: 'distance' });
    expect(missionGate({ chapter: ch1, timeBudget: 30, walk: walk(400), missionStartedAt: 0, now: 60 * MIN })).toMatchObject({ ready: false, toGo: 300 });
  });

  it('falls back to time only when GPS never got a usable fix', () => {
    const noGps = { chapter: ch1, timeBudget: 10, walk: walk(0, 0), missionStartedAt: 0 };
    expect(missionGate({ ...noGps, now: 2 * MIN })).toMatchObject({ ready: false, waitMin: 3 });
    expect(missionGate({ ...noGps, now: 5 * MIN })).toMatchObject({ ready: true, by: 'time' });
  });

  it('practice mode always opens', () => {
    expect(missionGate({ chapter: ch1, timeBudget: 60, walk: walk(0), missionStartedAt: 0, now: 0, practice: true }).by).toBe('practice');
  });
});

describe('streaks and totals', () => {
  const day = (n, hour = 10) => new Date(2026, 9, n, hour).getTime();
  const s = (n, extra = {}) => ({ startedAt: day(n) - 30 * MIN, endedAt: day(n), meters: 800, screenMs: 3 * MIN, ...extra });

  it('counts consecutive days up to today', () => {
    expect(streakDays([s(8), s(9), s(10)], day(10, 18))).toBe(3);
  });
  it('keeps yesterday’s streak alive until today ends', () => {
    expect(streakDays([s(8), s(9)], day(10, 8))).toBe(2);
  });
  it('breaks on a missed day and ignores practice sessions', () => {
    expect(streakDays([s(7), s(9), s(10, { practice: true })], day(10, 18))).toBe(1);
  });
  it('totals outside vs screen time', () => {
    expect(totals([s(9), s(10)])).toEqual({ chapters: 2, meters: 1600, outsideMin: 60, screenMin: 6, screenFreePct: 90 });
  });
});

describe('projectPath', () => {
  it('fits the walk inside the canvas with padding', () => {
    const { points, mPerPx } = projectPath([[12.97, 77.59, 0], [12.971, 77.59, 0], [12.971, 77.591, 1]], 300, 200, 10);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(290);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(190);
    }
    expect(points[0].y).toBeGreaterThan(points[1].y); // north is up
    expect(points[2].resumed).toBe(true);
    expect(mPerPx).toBeGreaterThan(0);
  });
});
