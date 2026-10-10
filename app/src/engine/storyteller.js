import { templateContinuation } from './story.js';

/**
 * Writes the part of the chapter that weaves in the user's discovery.
 * Phase 1 uses the pre-written template. Phase 2 tries the on-device model
 * first and falls back to the template if it is unavailable or the output
 * fails the safety filter, so the story never stalls.
 */
export async function continueStory({ chapter, discovery }) {
  return { text: templateContinuation(chapter, discovery), source: 'template' };
}
