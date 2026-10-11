import { describe, expect, it } from 'vitest';
import { gameState, levelInfo, sessionXP, streaks, sunset } from './game.js';

const MIN = 60_000;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
// A 30-minute walk ending at day d, hour h; 800 m; 2 min on screen; ends in Bengaluru.
const walk = (d, h, extra = {}) => ({
  id: `${d}-${h}`,
  storyId: 'quiet-atlas',
  chapterId: 'ch1',
  startedAt: at(d, h) - 30 * MIN,
  endedAt: at(d, h),
  meters: 800,
  screenMs: 2 * MIN,
  discovery: 'a red postbox',
  path: [[12.9716, 77.5946, 0]],
  ...extra,
});

describe('levels', () => {
  it('uses 50·L·(L-1) thresholds and named ranks', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, rank: 'Wanderer', next: 100 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(1000)).toMatchObject({ level: 5, rank: 'Pathfinder' });
    expect(levelInfo(levelInfo(0).next * 0 + 50 * 20 * 19)).toMatchObject({ level: 20, rank: 'Legend' });
  });
});

describe('sessionXP', () => {
  it('scores a typical 30-minute chapter around 150 XP', () => {
    const xp = sessionXP(walk(10, 10), { newPlace: true });
    // 30 min, 800 m, mission, new place, and 2 of 30 min on screen (phone-free bonus)
    expect(xp.total).toBe(60 + 48 + 50 + 30 + 25);
  });
  it('gives nothing for practice mode', () => {
    expect(sessionXP(walk(10, 10, { practice: true })).total).toBe(0);
  });
  it('adds the phone-free bonus only for 20+ minutes at 90%+', () => {
    expect(sessionXP(walk(10, 10, { screenMs: 0 })).parts.map((p) => p.label)).toContain('Phone-free walk');
    expect(sessionXP(walk(10, 10, { screenMs: 10 * MIN })).parts.map((p) => p.label)).not.toContain('Phone-free walk');
  });
});

describe('streaks', () => {
  it('tracks the current and the best run', () => {
    const s = [walk(1, 10), walk(2, 10), walk(3, 10), walk(8, 10), walk(9, 10)];
    expect(streaks(s, at(9, 20))).toEqual({ current: 2, best: 3 });
    expect(streaks(s, at(10, 9)).current).toBe(2); // yesterday still counts
    expect(streaks(s, at(11, 9)).current).toBe(0);
  });
});

describe('sunset', () => {
  it('is about 18:00 IST in Bengaluru in mid October', () => {
    const t = sunset(new Date(Date.UTC(2026, 9, 10, 6)), 12.9716, 77.5946);
    const utcMin = t.getUTCHours() * 60 + t.getUTCMinutes();
    expect(Math.abs(utcMin - (12 * 60 + 32))).toBeLessThan(10); // ~18:02 IST
  });
});

describe('gameState', () => {
  it('derives XP, badges, places and today from history', () => {
    const s = [
      walk(9, 7, { discovery: 'rain dripping off a bus shelter' }), // early bird + rain walker
      walk(10, 10, { discovery: 'a fountain in the park', chapterId: 'ch5', screenMs: 0 }), // water, story done, phone-free
    ];
    const g = gameState(s, { 'quiet-atlas': 'ch5' }, at(10, 12));
    const earned = g.badges.filter((b) => b.earnedAt).map((b) => b.id);
    expect(earned).toEqual(expect.arrayContaining(['first-steps', 'early-bird', 'rain-walker', 'found-water', 'story-keeper', 'phone-free']));
    expect(earned).not.toContain('ten-km');
    expect(g.perSession.get('10-10').badges).toEqual(expect.arrayContaining(['found-water', 'story-keeper']));
    expect(g.perSession.get('10-10').parts.map((p) => p.label)).not.toContain('New place'); // same spot as day 9
    expect(g.today).toEqual({ outsideMin: 30, screenMin: 0 });
    expect(g.daysSinceLast).toBe(0);
    expect(g.xp).toBe(213 + 383); // second walk: no new place, +200 story finished
    expect(g.level).toBe(3);
  });
});
