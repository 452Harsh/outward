// Size of a full default install, by part. Run after `npm run build`.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { getModel } from '@outward/content/models';

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
const isRuntime = (f) => path.basename(f.p).startsWith('wllama');
const model = getModel();

// Parts that ship in later phases are listed with their planned size, marked as such.
const rows = [
  ['App (shell, story, icons)', sum(files.filter((f) => !isRuntime(f))), 'measured'],
  ['LLM runtime (llama.cpp / wllama)', sum(files.filter(isRuntime)), 'measured'],
  [`Model (${model.id}, ${model.version})`, model.bytes, 'exact'],
  ['Whisper tiny (int8 encoder + decoder + tokenizer)', 43_300_000, 'planned, phase 3'],
  ['Speech runtime (ONNX Runtime Web)', 21_000_000, 'estimate, phase 3'],
  ['Narration audio (64 kbps mono, ~11 min)', 5_300_000, 'estimate, phase 3'],
];

const mb = (n) => (n / 1e6).toFixed(1).padStart(7) + ' MB';
const shipped = rows.filter((r) => !r[2].includes('phase')).reduce((n, r) => n + r[1], 0);
const total = rows.reduce((n, r) => n + r[1], 0);
console.log('\nOutward default install size\n');
for (const [name, size, kind] of rows) console.log(`${mb(size)}  ${name}  [${kind}]`);
console.log('-'.repeat(40));
console.log(`${mb(shipped)}  shipped today`);
console.log(`${mb(total)}  full install incl. planned parts (target < 350 MB)\n`);
