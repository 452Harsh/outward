import { describe, expect, it } from 'vitest';
import { summarize } from './fieldtest.js';

const ev = (t, type, extra = {}) => ({ t: t * 1000, type, hidden: false, ...extra });

describe('summarize', () => {
  it('returns null for an empty log', () => {
    expect(summarize([])).toBeNull();
  });

  it('reports what kept working while hidden', () => {
    const log = [
      ev(0, 'start'),
      ev(10, 'heartbeat', { gapMs: 10000 }),
      ev(12, 'gps_fix', { meters: 0 }),
      ev(20, 'visibility', { state: 'hidden', hidden: true, audio: { playing: true, played: 20 } }),
      ev(30, 'heartbeat', { gapMs: 20000, hidden: true }),
      ev(140, 'heartbeat', { gapMs: 110000, hidden: true }),
      ev(140, 'tts_request', { hidden: true }),
      ev(200, 'visibility', { state: 'visible', audio: { playing: true, played: 198 } }),
      ev(201, 'gps_fix', { resumed: true, meters: 240 }),
      ev(210, 'stop'),
    ];
    const s = summarize(log);
    expect(s.minutes).toBe(3.5);
    expect(s.hiddenMinutes).toBe(3);
    expect(s.heartbeats).toEqual({ visible: 1, hidden: 2, maxGapSec: 110 });
    expect(s.gps).toMatchObject({ fixesVisible: 2, fixesHidden: 0, resumeFixes: 1, meters: 240 });
    expect(s.audio.hiddenPeriods).toEqual([{ wallSec: 180, audioSec: 178 }]);
    expect(s.tts).toMatchObject({ requestedHidden: 1, spokenHidden: 0 });
  });
});
