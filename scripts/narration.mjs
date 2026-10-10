// Generate fixed narration with ElevenLabs, 64 kbps mono MP3.
//
//   node scripts/narration.mjs            dry run: characters, credits, what would be generated
//   node scripts/narration.mjs --yes      generate missing/changed clips (spends ElevenLabs credits)
//
// Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env (never committed).
// File names include a hash of voice + model + settings + text, so only clips
// whose text or voice changed are regenerated.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildClips, creditsPerChar } from '../content/audio/clips.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const OUT_DIR = path.join(root, 'app/public/audio');
const MANIFEST = path.join(root, 'content/audio/manifest.json');
const FORMAT = 'mp3_44100_64';
const SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true };

try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // No .env: fine for a dry run.
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'unset';
const modelId = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
const generate = process.argv.includes('--yes');

const clips = buildClips(read('content/stories/quiet-atlas/story.json'), read('content/safety/note.json'));
const fileFor = (c) => {
  const h = createHash('sha256').update(JSON.stringify([voiceId, modelId, FORMAT, SETTINGS, c.text])).digest('hex');
  return `${c.id}-${h.slice(0, 10)}.mp3`;
};

const todo = clips.filter((c) => !existsSync(path.join(OUT_DIR, fileFor(c))));
const chars = (list) => list.reduce((n, c) => n + c.text.length, 0);
const rate = creditsPerChar(modelId);

console.log(`Voice ${voiceId}, model ${modelId}, ${FORMAT}`);
console.log(`${clips.length} clips, ${chars(clips)} characters in total`);
console.log(`To generate: ${todo.length} clips, ${chars(todo)} characters ≈ ${Math.ceil(chars(todo) * rate)} credits`);

if (!generate) {
  console.log('\nDry run. Re-run with --yes to generate.');
  process.exit(0);
}
if (!apiKey || voiceId === 'unset') {
  console.error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env first.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const c of todo) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${FORMAT}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: c.text, model_id: modelId, voice_settings: SETTINGS }),
  });
  if (!res.ok) {
    // The response body never contains the key, but keep it short anyway.
    console.error(`${c.id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  writeFileSync(path.join(OUT_DIR, fileFor(c)), Buffer.from(await res.arrayBuffer()));
  console.log(`  ✓ ${c.id} (${c.text.length} chars)`);
}

// Manifest of current clips; delete files from older text/voice versions.
const manifest = { voiceId, modelId, format: FORMAT, clips: {} };
for (const c of clips) {
  const file = fileFor(c);
  manifest.clips[c.id] = { file, chars: c.text.length, bytes: statSync(path.join(OUT_DIR, file)).size };
}
const keep = new Set(Object.values(manifest.clips).map((c) => c.file));
for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.mp3') && !keep.has(f)) rmSync(path.join(OUT_DIR, f));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
const total = Object.values(manifest.clips).reduce((n, c) => n + c.bytes, 0);
console.log(`Done. ${Object.keys(manifest.clips).length} clips, ${(total / 1e6).toFixed(1)} MB → app/public/audio`);
