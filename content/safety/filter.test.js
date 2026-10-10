import { describe, expect, it } from 'vitest';
import { checkText, countWords, limits, ruleIds } from './filter.js';
import story from '../stories/quiet-atlas/story.json' with { type: 'json' };
import note from './note.json' with { type: 'json' };

const flagged = (text) => checkText(text).violations.map((v) => v.rule);

describe('safety filter: unsafe text is flagged', () => {
  const cases = [
    ['trespass', 'Slip past the gate and explore the abandoned factory.'],
    ['trespass', 'Climb over the fence into the garden beyond.'],
    ['trespass', 'You could trespass a little to get a better view.'],
    ['roads_traffic', 'Run across the road to reach the far side.'],
    ['roads_traffic', 'Walk along the railway until you see the bridge.'],
    ['water_entry', 'Wade into the river until the water reaches your knees.'],
    ['water_entry', 'Step onto the frozen pond and walk on the ice.'],
    ['water_entry', 'Why not go for a swim?'],
    ['heights', 'Climb the old oak tree to see the whole park.'],
    ['heights', 'Lean over the railing to look down.'],
    ['heights', 'Stand at the edge of the cliff.'],
    ['touch_eat_wild', 'Taste the wild berries along the path.'],
    ['touch_eat_wild', 'Pick up the little frog and hold it.'],
    ['touch_eat_wild', 'Feed the ducks by the pond.'],
    ['touch_eat_wild', 'Pick some flowers for the atlas.'],
    ['strangers', 'Ask a stranger where the old well is.'],
    ['strangers', 'Get into the car with the kind man.'],
    ['strangers', 'Follow the woman in the red coat.'],
    ['night_alone', 'Come back alone at night when the stars are out.'],
    ['night_alone', 'Wait until dark, then head out again.'],
    ['damage_fire', 'Light a fire to keep warm.'],
    ['damage_fire', 'Break off a branch as a souvenir.'],
    ['heights', "Don't forget to climb the wall for a better view."],
    ['water_entry', "Why don't you wade into the stream?"],
    ['touch_eat_wild', "Don't be afraid to touch the snake."],
  ];
  it.each(cases)('%s: %s', (rule, text) => {
    expect(flagged(text)).toContain(rule);
  });

  it('handles curly apostrophes and casing', () => {
    expect(flagged('CLIMB THE WALL. It’s fine.')).toContain('heights');
  });
});

describe('safety filter: safe text passes', () => {
  const cases = [
    'Watch the river from the bench. Never step into the water.',
    "Look closely, but don't climb the wall.",
    'Ducks swim slowly across the pond while you listen.',
    'Keep away from the road and stay on the park path.',
    'You notice a fox in the distance and stay still. Do not touch or feed the fox.',
    'The atlas glows. Rooftops gleam in the evening light.',
    'Follow the footprints across the page.',
    'A sign says No Trespassing, so you admire the garden from the path.',
  ];
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
