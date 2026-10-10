import { generate, getInstalled } from '../ai/llm.js';
import { buildMessages, acceptContinuation } from './prompt.js';
import { templateContinuation } from './story.js';

const TIMEOUT_MS = 30000;

/**
 * Writes the part of the chapter that weaves in the user's discovery.
 * Tries the on-device model first; falls back to the pre-written template if
 * no model is installed, it fails, times out, or the output fails the checks,
 * so the story never stalls.
 * @returns {Promise<{text: string, source: 'model'|'template', reason?: string, stats?: object}>}
 */
export async function continueStory({ chapter, discovery }) {
  const fallback = (reason, stats) => ({ text: templateContinuation(chapter, discovery), source: 'template', reason, stats });

  if (!(await getInstalled().catch(() => null))) return fallback('no_model');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const out = await generate(buildMessages(chapter, discovery), { signal: controller.signal });
    const { text, tokensPerSec, tokens, ms, gpu } = out;
    const verdict = acceptContinuation(text, discovery, chapter);
    const stats = { tokensPerSec, tokens, ms, gpu };
    if (!verdict.ok) return { ...fallback(verdict.reason, stats), rejected: verdict.text };
    return { text: verdict.text, source: 'model', stats };
  } catch (err) {
    return fallback(controller.signal.aborted ? 'timeout' : `error:${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}
