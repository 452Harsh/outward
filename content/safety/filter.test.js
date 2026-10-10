import { describe, expect, it } from 'vitest';
import { checkText, countWords, limits, ruleIds } from './filter.js';
import story from '../stories/quiet-atlas/story.json' with { type: 'json' };
import note from './note.json' with { type: 'json' };
import shared from './cases.json' with { type: 'json' };

const flagged = (text) => checkText(text).violations.map((v) => v.rule);

describe('safety filter: unsafe text is flagged', () => {
  const cases = shared.flagged.map((c) => [c.rule, c.text]);
  it.each(cases)('%s: %s', (rule, text) => {
    expect(flagged(text)).toContain(rule);
  });

  it('handles curly apostrophes and casing', () => {
    expect(flagged('CLIMB THE WALL. It’s fine.')).toContain('heights');
  });
});

describe('safety filter: safe text passes', () => {
  const cases = shared.safe;
  it.each(cases)('%s', (text) => {
    expect(checkText(text).violations).toEqual([]);
  });
});

describe('word limits', () => {
  it('counts words', () => {
    expect(countWords('  one   two\nthree ')).toBe(3);
    expect(countWords('')).toBe(0);
  });
  it('flags text over the limit', () => {
    const long = Array.from({ length: limits.continuation + 1 }, () => 'word').join(' ');
    const r = checkText(long, { maxWords: limits.continuation });
    expect(r.tooLong).toBe(true);
    expect(r.ok).toBe(false);
  });
});

describe('shipped content is safe', () => {
  it('covers every rule category in the tests', () => {
    expect(ruleIds.length).toBeGreaterThanOrEqual(8);
  });

  it.each(story.chapters.map((c) => [c.id, c]))('%s passes the filter', (_id, ch) => {
    const texts = [
      ch.intro,
      ch.mission.prompt,
      ch.mission.safetyNote,
      ch.cliffhanger,
      ch.continuationTemplate.replace('{discovery}', 'a small stream'),
    ];
    for (const t of texts) expect(checkText(t).violations, t).toEqual([]);
    expect(checkText(ch.mission.prompt, { maxWords: limits.mission }).ok).toBe(true);
    expect(countWords(ch.continuationTemplate)).toBeLessThanOrEqual(limits.continuation);
  });

  it('safety note passes the filter', () => {
    for (const p of note.points) expect(checkText(p).violations, p).toEqual([]);
  });
});
