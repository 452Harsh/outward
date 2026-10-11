// Voice-over for the demo video (ElevenLabs). Cached by text hash: re-running spends nothing.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
process.loadEnvFile(path.join(root, '.env'));
const board = JSON.parse(readFileSync(path.join(root, 'demo/storyboard.json'), 'utf8'));
const out = path.join(root, 'demo/out/vo');
mkdirSync(out, { recursive: true });
const key = process.env.ELEVENLABS_API_KEY;
const voice = board.voice.presenter;

for (const s of board.segments) {
  const h = createHash('sha256').update(JSON.stringify([voice, board.voice.model, s.vo])).digest('hex').slice(0, 10);
  const file = path.join(out, `${s.id}-${h}.mp3`);
  if (!existsSync(file)) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: s.vo, model_id: board.voice.model, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } }),
    });
    if (!res.ok) {
      console.error(`${s.id}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
  s.voFile = file;
  s.voSec = Math.round(dur * 100) / 100;
  console.log(`${s.id.padEnd(9)} ${s.voSec.toFixed(1)} s`);
}
writeFileSync(path.join(out, 'vo.json'), JSON.stringify(board.segments.map(({ id, voFile, voSec }) => ({ id, voFile, voSec })), null, 2));
