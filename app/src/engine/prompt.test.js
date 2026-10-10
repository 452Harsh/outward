import { describe, expect, it } from 'vitest';
import { acceptContinuation, buildMessages, discoveryKeywords, tidyOutput } from './prompt.js';
import { getStory } from './story.js';

const ch1 = getStory().chapters[0];
const good =
  'You describe the rainwater rushing down the drain. The atlas ripples, and a bright blue line races ' +
  'across the page like a current finding its way home. The Archivist leans close. "Water never waits," ' +
  'they whisper. "Follow where it goes." At the edge of the page, something new begins to appear.';

describe('buildMessages', () => {
  it('includes the chapter context and the tidied discovery last', () => {
    const msgs = buildMessages(ch1, '  rainwater in the drain. ');
    const last = msgs.at(-1);
    expect(last.role).toBe('user');
    expect(last.content).toContain(ch1.storyContext);
    expect(last.content).toContain('"Rainwater in the drain"');
    expect(msgs[0].role).toBe('system');
  });
});

describe('tidyOutput', () => {
  it('removes markdown and cuts an unfinished sentence', () => {
    expect(tidyOutput('**You** see it. The page glows. And then the')).toBe('You see it. The page glows.');
  });
  it('keeps a closing quote', () => {
    expect(tidyOutput('She says, "Keep going." Then')).toBe('She says, "Keep going."');
  });
});

describe('discoveryKeywords', () => {
  it('drops short and filler words', () => {
    expect(discoveryKeywords('An old oak tree by the gate')).toEqual(['oak', 'tree', 'gate']);
  });
});

describe('acceptContinuation', () => {
  it('accepts a safe continuation that uses the discovery', () => {
    expect(acceptContinuation(good, 'rainwater rushing down the drain', ch1).ok).toBe(true);
  });
  it('rejects text that ignores the discovery', () => {
    expect(acceptContinuation(good, 'a red postbox').reason).toBe('ignores_discovery');
  });
  it('rejects text that is too short', () => {
    expect(acceptContinuation('The page glows.', 'drain').reason).toBe('too_short');
  });
  it('rejects unsafe text', () => {
    const unsafe = `${good} Now wade into the river to see where the drain leads.`;
    expect(acceptContinuation(unsafe, 'drain').reason).toBe('unsafe:water_entry');
  });
  it('rejects text that is too long', () => {
    expect(acceptContinuation(`${good} `.repeat(3), 'drain').reason).toBe('too_long');
  });
  // Real failure modes seen from stock Gemma 3 270M (scratch probe, 2026-10-10).
  it('rejects a near-copy of the few-shot example', () => {
    const copy =
      'You name it aloud: a small stream behind the library. The atlas shivers, and a thin silver line bubbles up ' +
      'from its centre, spilling into tiny streams that race toward the edges. The Archivist smiles. "Water that ' +
      'keeps returning. The atlas remembers how to move." Far off, something waits.';
    expect(acceptContinuation(copy, 'a small stream behind the library', ch1).reason).toBe('copies_example');
  });
  it('rejects text that echoes the prompt back', () => {
    const echo =
      'The atlas is blank. The Wayfinder must find something that flows so the first page can draw its first line. ' +
      'You found a tap dripping in the park, and the page quietly fills with a thin blue line that winds away.';
    expect(acceptContinuation(echo, 'a tap dripping in the park', ch1).reason).toBe('echoes_prompt');
  });
  it('rejects prompt-speak like "the user"', () => {
    expect(acceptContinuation(`${good} The footsteps follow the user.`, 'drain').reason).toBe('meta');
  });
  it('rejects repeated sentences', () => {
    const rep = `${good} The atlas remembers how to move. The atlas remembers how to move.`;
    expect(acceptContinuation(rep, 'drain').reason).toBe('repeats');
  });
  it('matches plural discoveries against singular mentions', () => {
    const text = good.replace('rainwater rushing down the drain', 'a single brick');
    expect(acceptContinuation(text, 'bricks').ok).toBe(true);
  });
});
