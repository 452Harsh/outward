// Prompt building and output checks for the on-device storyteller.
// Kept short on purpose: Gemma 3 270M follows short prompts with one example best.
import { checkText, countWords, normalize } from '@outward/content/safety';
import { cleanDiscovery } from './story.js';

export const MIN_WORDS = 25;
export const MAX_WORDS = 120;

const SYSTEM =
  'You narrate "The Quiet Atlas", a calm outdoor adventure. Speak to the listener as "you". ' +
  'The atlas fills in when the listener finds real things outside. ' +
  'Write 3 or 4 vivid sentences. Do not give the listener instructions.';

const EXAMPLE_USER = userTurn(
  'The atlas is blank. The Wayfinder must find something that flows.',
  'A drinking fountain in the park',
);
const EXAMPLE_ASSISTANT =
  'You name it aloud: a drinking fountain in the park. The blank page shivers, and a thin silver line ' +
  'bubbles up from its centre, spilling into tiny streams that race toward the edges. The Archivist ' +
  'smiles. "Water that keeps returning. The atlas remembers how to move." Far off, at the end of the ' +
  'newest stream, something small waits to be found.';

function userTurn(context, discovery) {
  return `Story so far: ${context}\nThe Wayfinder found: "${discovery}"\nWhat happens to the atlas?`;
}

export function buildMessages(chapter, discovery) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: EXAMPLE_USER },
    { role: 'assistant', content: EXAMPLE_ASSISTANT },
    { role: 'user', content: userTurn(chapter.storyContext, cleanDiscovery(discovery)) },
  ];
}

/** Strip markdown and chat artefacts, and cut an unfinished last sentence. */
export function tidyOutput(raw) {
  let t = normalize(raw)
    .replace(/<[^>]*>/g, '')
    .replace(/[*_#`]+/g, '')
    .replace(/^(?:narrator|assistant|story)\s*:\s*/i, '')
    .trim();
  const lastEnd = Math.max(t.lastIndexOf('.'), t.lastIndexOf('!'), t.lastIndexOf('?'), t.lastIndexOf('."'), t.lastIndexOf('!"'));
  if (lastEnd > 0 && lastEnd < t.length - 1) {
    const closesQuote = t[lastEnd + 1] === '"';
    t = t.slice(0, lastEnd + (closesQuote ? 2 : 1));
  }
  return t.trim();
}

// Shared word 5-grams between two texts. Stock Gemma 3 270M often copies the
// example or echoes the prompt back; both should fall back to the template.
const GRAM = 5;
function grams(text) {
  const w = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const out = new Set();
  for (let i = 0; i + GRAM <= w.length; i++) out.add(w.slice(i, i + GRAM).join(' '));
  return out;
}
export function sharedGrams(a, b) {
  const gb = grams(b);
  let n = 0;
  for (const g of grams(a)) if (gb.has(g)) n += 1;
  return n;
}
const MAX_SHARED = 2;

function hasRepeatedSentence(text) {
  const seen = new Set();
  for (const s of text.toLowerCase().split(/[.!?]+/).map((x) => x.replace(/[^a-z ]/g, '').trim())) {
    if (s.split(' ').length < 4) continue;
    if (seen.has(s)) return true;
    seen.add(s);
  }
  return false;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'in', 'on', 'by', 'at', 'with', 'some', 'near', 'from', 'that', 'this', 'there', 'little', 'small', 'big', 'old']);

/** Content words of the discovery, used to check the model actually used it. */
export function discoveryKeywords(discovery) {
  return cleanDiscovery(discovery)
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/**
 * Decide whether a model continuation is good enough to use.
 * @param {object} [chapter] when given, text that echoes the prompt is rejected
 * @returns {{ ok: boolean, reason?: string, text: string }}
 */
export function acceptContinuation(raw, discovery, chapter) {
  const text = tidyOutput(raw);
  const words = countWords(text);
  if (words < MIN_WORDS) return { ok: false, reason: 'too_short', text };
  if (words > MAX_WORDS) return { ok: false, reason: 'too_long', text };
  const safety = checkText(text);
  if (!safety.ok) return { ok: false, reason: `unsafe:${safety.violations[0].rule}`, text };
  const lower = text.toLowerCase();
  const keys = discoveryKeywords(discovery);
  if (keys.length && !keys.some((k) => lower.includes(k.replace(/s$/, '')))) {
    return { ok: false, reason: 'ignores_discovery', text };
  }
  if (/\b(?:as an ai|language model|i cannot|i can't help|the user|the listener)\b/i.test(text)) return { ok: false, reason: 'meta', text };
  if (sharedGrams(text, EXAMPLE_ASSISTANT) > MAX_SHARED) return { ok: false, reason: 'copies_example', text };
  const prompt = `${SYSTEM} ${chapter?.storyContext ?? ''} The Wayfinder found What happens to the atlas`;
  if (sharedGrams(text, prompt) > MAX_SHARED) return { ok: false, reason: 'echoes_prompt', text };
  if (hasRepeatedSentence(text)) return { ok: false, reason: 'repeats', text };
  return { ok: true, text };
}
