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
