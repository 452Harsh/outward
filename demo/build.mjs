// Builds the hackathon demo video (1920x1080, H.264 + AAC) from:
//   demo/out/vo/*.mp3        presenter voice-over (demo/vo.mjs, ElevenLabs)
//   demo/out/clips/*.mp4     app recordings (demo/record.mjs)
//   demo/cards.html          title / results / outro cards and segment backgrounds
//   content/packs/.../audio  the app's own ElevenLabs narration (George), mixed in
//
//   node demo/build.mjs   ->   demo/out/outward-demo.mp4 + outward-demo.srt
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'demo/out');
const PARTS = path.join(OUT, 'parts');
mkdirSync(PARTS, { recursive: true });
const board = JSON.parse(readFileSync(path.join(root, 'demo/storyboard.json'), 'utf8'));
const vo = Object.fromEntries(JSON.parse(readFileSync(path.join(OUT, 'vo/vo.json'), 'utf8')).map((v) => [v.id, v]));
const marks = JSON.parse(readFileSync(path.join(OUT, 'clips/marks.json'), 'utf8')).marks;
const cardsUrl = pathToFileURL(path.join(root, 'demo/cards.html')).href;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const VO_DELAY = 0.3;
const SCREEN = { x: 1224, y: 60, w: 432, h: 960 };

// The app's own narration clip for the Home segment (George, the Archivist).
const packAudio = path.join(root, 'content/packs/second-atlas/audio');
const georgeIntro = path.join(packAudio, readdirSync(packAudio).find((f) => f.startsWith('s2ch3-intro-')));

// Video plan: app segments in order; the walk is part of the mission beat.
const appSegs = board.segments.filter((s) => s.kind === 'app');
const plan = [];
for (const s of board.segments) {
  if (s.kind === 'card') plan.push({ ...s, type: 'card' });
  else if (s.kind === 'walk') {
    // The walk belongs to the mission beat: same step number, sped up, voiced over a wind bed.
    plan.push({ ...s, type: 'app', clip: 'walk', n: appSegs.findIndex((x) => x.id === 'mission') + 1, of: appSegs.length, wind: true });
  } else plan.push({ ...s, type: 'app', clip: s.id, n: appSegs.indexOf(s) + 1, of: appSegs.length });
}

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

// Phone frame drawn over the clip: rounded screen corners and a notch.
await page.setContent(`<html><body style="margin:0;background:transparent"><svg width="1920" height="1080">
  <path fill-rule="evenodd" fill="#17251f" d="M${SCREEN.x - 22 + 64} ${SCREEN.y - 22} h${476 - 128} a64 64 0 0 1 64 64 v${1004 - 128} a64 64 0 0 1 -64 64 h-${476 - 128} a64 64 0 0 1 -64 -64 v-${1004 - 128} a64 64 0 0 1 64 -64 Z
    M${SCREEN.x + 44} ${SCREEN.y} h${SCREEN.w - 88} a44 44 0 0 1 44 44 v${SCREEN.h - 88} a44 44 0 0 1 -44 44 h-${SCREEN.w - 88} a44 44 0 0 1 -44 -44 v-${SCREEN.h - 88} a44 44 0 0 1 44 -44 Z"/>
  <rect x="${SCREEN.x + SCREEN.w / 2 - 60}" y="${SCREEN.y + 12}" width="120" height="28" rx="14" fill="#17251f"/>
</svg></body></html>`);
const framePng = path.join(PARTS, 'phone-frame.png');
await page.screenshot({ path: framePng, omitBackground: true });

async function recordCard(card, seconds, file) {
  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ data: Buffer.from(data, 'base64'), t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await page.goto(`${cardsUrl}?card=${card}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080 });
  const start = Date.now() / 1000;
  await new Promise((r) => setTimeout(r, seconds * 1000 + 300));
  await cdp.send('Page.stopScreencast');
  const end = Date.now() / 1000;
  const dir = path.join(PARTS, `${card}-frames`);
  mkdirSync(dir, { recursive: true });
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(path.join(dir, name), f.data);
    lines.push(`file ${name}`, `duration ${Math.max(0.001, (i + 1 < frames.length ? frames[i + 1].t : end) - f.t).toFixed(4)}`);
  });
  lines.push(`file f${String(frames.length - 1).padStart(5, '0')}.jpg`);
  writeFileSync(path.join(dir, 'list.ffconcat'), lines.join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.ffconcat'), '-t', String(seconds), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '17', file]);
  await cdp.detach();
  void start;
}

const parts = [];
const srt = [];
let clock = 0;
for (const seg of plan) {
  const out = path.join(PARTS, `${String(parts.length).padStart(2, '0')}-${seg.id}.mp4`);
  const v = vo[seg.id];
  let seconds;
  if (seg.type === 'card') {
    seconds = Math.max(seg.id === 'outro' ? 5 : 0, v.voSec + (seg.id === 'intro' ? 1.4 : 1.6));
    const cardVideo = path.join(PARTS, `${seg.id}-card.mp4`);
    await recordCard(seg.id, seconds, cardVideo);
    ff(['-i', cardVideo, '-i', v.voFile, '-filter_complex', `[1:a]adelay=${VO_DELAY * 1000}|${VO_DELAY * 1000},apad,afade=t=out:st=${seconds - 0.4}:d=0.4[a]`, '-map', '0:v', '-map', '[a]', '-t', String(seconds), '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', out]);
  } else {
    await page.goto(`${cardsUrl}?card=bg&seg=${encodeURIComponent(JSON.stringify(seg))}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const bg = path.join(PARTS, `${seg.id}-bg.png`);
    await page.screenshot({ path: bg });
    const clip = path.join(OUT, 'clips', `${seg.clip}.mp4`);
    const clipSec = dur(clip) / (seg.speed ?? 1);
    // Each beat ends shortly after its voice-over; Home runs on while George narrates.
    const tail = seg.appAudio ? 7.5 : 1.6;
    seconds = seg.wind ? Math.min(clipSec, Math.max(9, v.voSec + 0.9)) : Math.min(Math.max(clipSec, v.voSec + 0.9), v.voSec + tail);
    const speed = seg.speed ? `setpts=PTS/${seg.speed},` : '';
    const video = `[1:v]${speed}scale=${SCREEN.w}:${SCREEN.h}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=30[c];[0:v][c]overlay=${SCREEN.x}:${SCREEN.y}[b];[b][2:v]overlay=0:0,format=yuv420p[v]`;
    const inputs = ['-loop', '1', '-i', bg, '-i', clip, '-loop', '1', '-i', framePng];
    let audio;
    if (seg.wind) {
      // Presenter voice over a soft outdoor wind bed under the sped-up walk.
      inputs.push('-i', v.voFile, '-f', 'lavfi', '-i', `anoisesrc=color=brown:amplitude=0.6:sample_rate=48000:duration=${seconds}`);
      audio = `[3:a]adelay=${VO_DELAY * 1000}|${VO_DELAY * 1000},apad,aformat=channel_layouts=stereo[vo];[4:a]lowpass=f=500,volume=0.12,afade=t=in:d=0.6,afade=t=out:st=${seconds - 0.8}:d=0.8,aformat=channel_layouts=stereo[w];[vo][w]amix=inputs=2:duration=longest:normalize=0[a]`;
    } else {
      inputs.push('-i', v.voFile);
      audio = `[3:a]adelay=${VO_DELAY * 1000}|${VO_DELAY * 1000},apad,aformat=channel_layouts=stereo[vo]`;
      if (seg.appAudio) {
        // The Archivist's own narration starts when the app starts it; ducked under the presenter.
        const at = (marks.homeNarration ?? 5.5) + 0.35;
        const voEnd = VO_DELAY + v.voSec + 0.15;
        inputs.push('-i', georgeIntro);
        audio += `;[4:a]adelay=${Math.round(at * 1000)}|${Math.round(at * 1000)},volume='if(lt(t,${voEnd}),0.2,1.0)':eval=frame,apad,aformat=channel_layouts=stereo[app];[vo][app]amix=inputs=2:duration=longest:normalize=0,afade=t=out:st=${seconds - 1}:d=1[a]`;
      } else {
        audio += `;[vo]afade=t=out:st=${seconds - 0.4}:d=0.4[a]`;
      }
    }
    ff([...inputs, '-filter_complex', `${video};${audio}`, '-map', '[v]', '-map', '[a]', '-t', String(seconds), '-r', '30', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k', out]);
  }
  // Subtitles: split the voice-over into sentences over its spoken time.
  if (v) {
    const sentences = v ? board.segments.find((s) => s.id === seg.id).vo.match(/[^.!?:]+[.!?:]+(\s|$)/g) ?? [] : [];
    const total = sentences.reduce((n, s) => n + s.length, 0);
    let t = clock + VO_DELAY;
    for (const s of sentences) {
      const d = (s.length / total) * v.voSec;
      srt.push({ from: t, to: t + d, text: s.trim() });
      t += d;
    }
  }
  console.log(`${seg.id.padEnd(9)} ${seconds.toFixed(1)} s`);
  parts.push(out);
  clock += seconds;
}
await browser.close();

writeFileSync(path.join(PARTS, 'parts.txt'), parts.map((p) => `file '${p}'`).join('\n'));
const final = path.join(OUT, 'outward-demo.mp4');
const joined = path.join(PARTS, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', path.join(PARTS, 'parts.txt'), '-c', 'copy', joined]);
// Loudness to -16 LUFS (typical for YouTube/Devpost players); video is copied untouched.
ff(['-i', joined, '-c:v', 'copy', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final]);
const ts = (x) => {
  const ms = Math.round(x * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};
writeFileSync(path.join(OUT, 'outward-demo.srt'), srt.map((c, i) => `${i + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${c.text}\n`).join('\n'));
console.log(`\n${final}  ${dur(final).toFixed(1)} s`);
