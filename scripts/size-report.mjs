// Size of a full default install, by part. Run after `npm run build`.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getModel, getSpeechModel } from '@outward/content/models';

const dist = path.resolve(import.meta.dirname, '../app/dist');
const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    statSync(p).isDirectory() ? walk(p) : files.push({ p, size: statSync(p).size });
  }
};
walk(dist);

const sum = (list) => list.reduce((n, f) => n + f.size, 0);
// What a phone actually downloads: the service worker skips the unused ONNX WebGPU builds.
const shipped = files.filter((f) => !/\.(asyncify|jsep|jspi)/.test(f.p));
const name = (f) => path.basename(f.p);
const isLlmRuntime = (f) => name(f).startsWith('wllama');
const isSpeechRuntime = (f) => name(f).startsWith('ort-wasm') || name(f).startsWith('stt.worker');
const isAudio = (f) => f.p.includes(`${path.sep}audio${path.sep}`);
const model = getModel();
const speech = getSpeechModel();
const audioBytes = sum(shipped.filter(isAudio));

// Parts that ship in later phases are listed with their planned size, marked as such.
const rows = [
  ['App (shell, story, icons)', sum(shipped.filter((f) => !isLlmRuntime(f) && !isSpeechRuntime(f) && !isAudio(f))), 'measured'],
  ['LLM runtime (llama.cpp / wllama)', sum(shipped.filter(isLlmRuntime)), 'measured'],
  [`Model (${model.id}, ${model.version})`, model.bytes, 'exact'],
  ['Speech runtime (ONNX Runtime Web, CPU build + worker)', sum(shipped.filter(isSpeechRuntime)), 'measured'],
  [`Whisper (${speech.id}, int8)`, speech.bytes, 'exact'],
  audioBytes
    ? ['Narration audio (ElevenLabs, 64 kbps mono)', audioBytes, 'measured']
    : ['Narration audio (64 kbps, ~4.8k chars ≈ 5.5 min)', 2_700_000, 'estimate, not generated yet'],
];

const mb = (n) => (n / 1e6).toFixed(1).padStart(7) + ' MB';
const today = rows.filter((r) => !r[2].includes('not generated')).reduce((n, r) => n + r[1], 0);
const total = rows.reduce((n, r) => n + r[1], 0);
console.log('\nOutward default install size\n');
for (const [name, size, kind] of rows) console.log(`${mb(size)}  ${name}  [${kind}]`);
console.log('-'.repeat(40));
console.log(`${mb(today)}  downloaded by a phone today`);
console.log(`${mb(total)}  full install incl. narration (target < 350 MB)\n`);
