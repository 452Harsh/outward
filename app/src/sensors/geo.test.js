import { describe, expect, it } from 'vitest';
import { addFix, emptyWalk, haversine } from './geo.js';

// ~111 m per 0.001 degree of latitude.
const at = (dLat, t, acc = 5) => ({ lat: 12.97 + dLat, lon: 77.59, acc, t });

describe('haversine', () => {
  it('measures ~111 m per 0.001° latitude', () => {
    expect(haversine(at(0, 0), at(0.001, 0))).toBeCloseTo(111.2, 0);
  });
});

describe('addFix', () => {
  it('sets the first point without distance', () => {
    const w = addFix(emptyWalk(), at(0, 0));
    expect(w.meters).toBe(0);
    expect(w.points).toBe(1);
  });

  it('accumulates walking distance', () => {
    let w = addFix(emptyWalk(), at(0, 0));
    w = addFix(w, at(0.0005, 60_000));
    w = addFix(w, at(0.001, 120_000));
    expect(w.meters).toBeCloseTo(111.2, 0);
  });

  it('ignores inaccurate fixes and jitter', () => {
    let w = addFix(emptyWalk(), at(0, 0));
    w = addFix(w, at(0.01, 1000, 120));
    expect(w.rejected).toBe(1);
    w = addFix(w, at(0.00002, 2000));
    expect(w.meters).toBe(0);
  });

  it('rejects impossible speeds but moves the anchor', () => {
    let w = addFix(emptyWalk(), at(0, 0));
    w = addFix(w, at(0.01, 10_000)); // 1.1 km in 10 s
    expect(w.meters).toBe(0);
    expect(w.last.lat).toBeCloseTo(12.98);
  });

  it('counts a resume catch-up as a straight segment over the gap', () => {
    let w = addFix(emptyWalk(), at(0, 0));
    w = addFix(w, at(0.005, 10 * 60_000), { resumed: true }); // 556 m in 10 min
    expect(w.meters).toBeCloseTo(556, -1);
    expect(w.resumedMeters).toBeCloseTo(556, -1);
  });
});

describe('walk path', () => {
  it('records accepted points and marks resume segments', () => {
    let w = addFix(emptyWalk(), at(0, 0));
    w = addFix(w, at(0.0005, 60_000));
    w = addFix(w, at(0.00051, 61_000)); // 1 m of jitter: not recorded
    w = addFix(w, at(0.005, 10 * 60_000), { resumed: true });
    expect(w.path).toHaveLength(3);
    expect(w.path.map((p) => p[2])).toEqual([0, 0, 1]);
  });

  it('thins the path but keeps both ends when it gets long', async () => {
    const { MAX_PATH_POINTS } = await import('./geo.js');
    let w = addFix(emptyWalk(), at(0, 0));
    for (let i = 1; i <= MAX_PATH_POINTS + 5; i++) w = addFix(w, at(i * 0.0001, i * 10_000));
    expect(w.path.length).toBeLessThanOrEqual(MAX_PATH_POINTS);
    expect(w.path[0][0]).toBeCloseTo(12.97, 4);
    expect(w.path.at(-1)[0]).toBeCloseTo(12.97 + (MAX_PATH_POINTS + 5) * 0.0001, 4);
  });
});
