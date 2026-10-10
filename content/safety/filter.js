// Mission/story safety filter shared by the app and the story factory.
// The Python training pipeline reads the same rules.json, so keep logic here simple.
import rules from './rules.json' with { type: 'json' };

const compiled = rules.rules.map((rule) => ({
  id: rule.id,
  label: rule.label,
  regexes: rule.patterns.map((p) => new RegExp(p, 'gi')),
}));

const negationRe = new RegExp(
  `(?:^|\\s)(?:${rules.negations.map(escapeRe).join('|')})(?=\\s|$|[,:])`,
  'i',
);

const exceptionRe = new RegExp(`(?:${rules.negationExceptions.map(escapeRe).join('|')})`, 'gi');

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalize(text) {
  return String(text ?? '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(text) {
  const t = normalize(text);
  return t ? t.split(' ').length : 0;
}

// True when a negation ("don't", "never", ...) appears shortly before `index`
// within the same clause, e.g. "Never step into the river". Phrases that only
// look negative ("why not", "don't forget to") are stripped first.
function isNegated(text, index) {
  const clause = text.slice(0, index).split(/[.!?;:\n]/).pop();
  const words = clause.trim().split(' ').slice(-rules.negationWindow).join(' ');
  return negationRe.test(` ${words.replace(exceptionRe, ' ')} `);
}

/**
 * @param {string} text
 * @param {{ maxWords?: number }} [opts]
 * @returns {{ ok: boolean, words: number, tooLong: boolean, violations: {rule: string, label: string, match: string}[] }}
 */
export function checkText(text, { maxWords } = {}) {
  const t = normalize(text);
  const violations = [];
  for (const rule of compiled) {
    for (const re of rule.regexes) {
      for (const m of t.matchAll(re)) {
        if (!isNegated(t, m.index)) violations.push({ rule: rule.id, label: rule.label, match: m[0] });
      }
    }
  }
  const words = countWords(t);
  const tooLong = maxWords != null && words > maxWords;
  return { ok: violations.length === 0 && !tooLong, words, tooLong, violations };
}

export const limits = rules.maxWords;
export const ruleIds = compiled.map((r) => r.id);
