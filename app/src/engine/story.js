import story from '@outward/content/stories/quiet-atlas/story.json';

export const STEPS = ['intro', 'mission', 'describe', 'continuation', 'cliffhanger'];
export const TIME_BUDGETS = [10, 30, 60];
const MAX_DISCOVERY_CHARS = 140;

export function getStory() {
  return story;
}

export function nextStep(step) {
  const i = STEPS.indexOf(step);
  if (i === -1) throw new Error(`Unknown step: ${step}`);
  return STEPS[i + 1] ?? 'done';
}

export function newProgress(storyId) {
  return { storyId, completed: [], discoveries: {} };
}

/** The first chapter not yet completed, or null when the story is finished. */
export function currentChapter(s, progress) {
  return s.chapters.find((c) => !progress.completed.includes(c.id)) ?? null;
}

export function completeChapter(progress, chapterId, discovery) {
  if (progress.completed.includes(chapterId)) return progress;
  return {
    ...progress,
    completed: [...progress.completed, chapterId],
    discoveries: { ...progress.discoveries, [chapterId]: discovery },
  };
}

/** Tidy the user's description so it reads well inside quotes. */
export function cleanDiscovery(text) {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length > MAX_DISCOVERY_CHARS) {
    t = t.slice(0, MAX_DISCOVERY_CHARS);
    t = t.slice(0, t.lastIndexOf(' ') > 0 ? t.lastIndexOf(' ') : t.length);
  }
  t = t.replace(/[\s.,;:!?"']+$/, '').replace(/^["']+/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function templateContinuation(chapter, discovery) {
  return chapter.continuationTemplate.replace('{discovery}', cleanDiscovery(discovery));
}

/** The "Find …" sentence of a mission, for short teasers; falls back to the first sentence. */
export function missionHeadline(prompt) {
  const sentences = String(prompt).split(/(?<=[.!?])\s+/);
  const pick = sentences.find((s) => /^find\b/i.test(s)) ?? sentences.find((s) => /\bfind\b/i.test(s)) ?? sentences[0];
  // "Find X: a, b, c." -> "Find X" (examples are shown on the mission card).
  return pick.includes(':') ? pick.split(':')[0].trim() : pick;
}
