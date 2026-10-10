import { describe, expect, it } from 'vitest';
import {
  STEPS,
  cleanDiscovery,
  completeChapter,
  currentChapter,
  getStory,
  newProgress,
  nextStep,
  templateContinuation,
} from './story.js';

const story = getStory();

describe('story content', () => {
  it('has 5 chapters with the fields the app needs', () => {
    expect(story.chapters).toHaveLength(5);
    for (const [i, c] of story.chapters.entries()) {
      expect(c.number).toBe(i + 1);
      for (const key of ['id', 'title', 'intro', 'cliffhanger', 'continuationTemplate', 'storyContext']) {
        expect(c[key], `${c.id}.${key}`).toBeTruthy();
      }
      expect(c.mission.prompt).toBeTruthy();
      expect(c.mission.safetyNote).toBeTruthy();
      expect(c.continuationTemplate).toContain('{discovery}');
      expect(Object.keys(c.unlock.minMeters)).toEqual(['10', '30', '60']);
    }
  });

  it('has unique chapter ids', () => {
    const ids = story.chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('chapter flow', () => {
  it('walks through every step then finishes', () => {
    let step = STEPS[0];
    const seen = [step];
    while ((step = nextStep(step)) !== 'done') seen.push(step);
    expect(seen).toEqual(STEPS);
  });

  it('rejects unknown steps', () => {
    expect(() => nextStep('nope')).toThrow();
  });
});

describe('progress', () => {
  it('advances chapter by chapter and ends with null', () => {
    let p = newProgress(story.id);
    for (const ch of story.chapters) {
      expect(currentChapter(story, p).id).toBe(ch.id);
      p = completeChapter(p, ch.id, 'a stream');
    }
    expect(currentChapter(story, p)).toBeNull();
    expect(p.discoveries.ch5).toBe('a stream');
  });

  it('does not double-complete a chapter', () => {
    const p = completeChapter(newProgress(story.id), 'ch1', 'x');
    expect(completeChapter(p, 'ch1', 'y')).toBe(p);
  });
});

describe('discoveries', () => {
  it('tidies whitespace, punctuation and case', () => {
    expect(cleanDiscovery('  a little   stream behind the library.  ')).toBe('A little stream behind the library');
    expect(cleanDiscovery('"rain in the gutter!"')).toBe('Rain in the gutter');
  });

  it('caps long descriptions on a word boundary', () => {
    const out = cleanDiscovery('word '.repeat(60));
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith('word')).toBe(true);
  });

  it('is woven into the template', () => {
    const text = templateContinuation(story.chapters[0], 'the fountain in the square');
    expect(text).toContain('"The fountain in the square."');
    expect(text).not.toContain('{discovery}');
  });
});
