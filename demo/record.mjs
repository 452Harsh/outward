// Records the app for the demo video: one MP4 per segment, timed to the voice-over.
//
//   node demo/record.mjs <chrome-profile-dir>
//
// The profile must already have the storyteller + voice models downloaded and
// "The Second Atlas" pack installed (chapters 1–2 done), so the run is offline-capable.
// Needs the production server on :10123 (PORT=10123 npm start).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'demo/out/clips');
mkdirSync(OUT, { recursive: true });
const ORIGIN = 'http://localhost:10123';
const vo = Object.fromEntries(JSON.parse(readFileSync(path.join(root, 'demo/out/vo/vo.json'), 'utf8')).map((v) => [v.id, v.voSec]));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: process.argv[2],
  args: ['--no-first-run', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
  protocolTimeout: 900000,
});
await browser.defaultBrowserContext().overridePermissions(ORIGIN, ['geolocation']);
const page = await browser.newPage();
await page.setViewport({ width: 393, height: 873, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (t, sel = 'button') => (await page.waitForSelector(`${sel}::-p-text(${t})`, { timeout: 60000, visible: true })).click();
const marks = {};
let t0 = 0;
// Full-resolution capture (device pixels) straight from Chrome's screencast,
// then assembled into a constant 30 fps MP4 with ffmpeg.
const cdp = await page.createCDPSession();
let frames = null;
let clipId = null;
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  if (frames) frames.push({ data: Buffer.from(data, 'base64'), t: metadata.timestamp });
  try {
    await cdp.send('Page.screencastFrameAck', { sessionId });
  } catch {
    // session closed
  }
});
const start = async (id) => {
  clipId = id;
  frames = [];
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 786, maxHeight: 1746, everyNthFrame: 1 });
  t0 = Date.now();
};
const mark = (name) => (marks[name] = (Date.now() - t0) / 1000);
const stop = async () => {
  const endT = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  const list = frames;
  frames = null;
  const dir = path.join(OUT, `${clipId}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  // Frames arrive only when the screen changes; each lasts until the next one.
  const lines = ['ffconcat version 1.0'];
  list.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(path.join(dir, name), f.data);
    const next = i + 1 < list.length ? list[i + 1].t : Math.max(endT, f.t + 0.04);
    lines.push(`file ${name}`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file f${String(list.length - 1).padStart(5, '0')}.jpg`);
  writeFileSync(path.join(dir, 'list.ffconcat'), lines.join('\n'));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.ffconcat'), '-vf', 'fps=30,scale=786:1746:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', path.join(OUT, `${clipId}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
};
let north = 0;
const walkTo = async (m) => {
  north += m;
  await page.setGeolocation({ latitude: 12.9352 + north / 110540, longitude: 77.6245 + north / 220000, accuracy: 6 });
};

// Known starting state: Second Atlas, chapter 3 next, Day theme, real walking.
await walkTo(0);
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });
await page.evaluate(
  () =>
    new Promise((res) => {
      const q = indexedDB.open('outward');
      q.onsuccess = () => {
        const tx = q.result.transaction(['meta', 'progress', 'sessions'], 'readwrite');
        const meta = tx.objectStore('meta');
        meta.delete('activeChapter');
        meta.put({ timeBudget: 10, narration: true, theme: 'light', sfx: true, practice: false, storyId: 'second-atlas' }, 'prefs');
        tx.objectStore('progress').put({ storyId: 'second-atlas', completed: ['s2ch1', 's2ch2'], discoveries: { s2ch1: 'A puddle reflecting the lamp post', s2ch2: 'My long shadow across the old wall' } });
        // Earlier rehearsals of this chapter leave duplicate journal cards; keep one of each find.
        const seen = new Set();
        const cur = tx.objectStore('sessions').openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          const key = (c.value.discovery || '').toLowerCase();
          if (seen.has(key) || c.value.chapterId === 's2ch3') c.delete();
          else seen.add(key);
          c.continue();
        };
        tx.oncomplete = () => {
          q.result.close();
          res();
        };
      };
    }),
);
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.hud');
await sleep(1500);

// --- home: Sprig, then Start Adventure; the Archivist (ElevenLabs) starts the chapter.
await start('home');
await sleep(5500);
await click('Start Adventure');
mark('homeNarration');
await sleep(12000);
await stop();

// --- mission: card, time, pocket moment (real time) ...
await start('mission');
await click('Show me the mission');
await sleep(3500);
await (await page.waitForSelector('label::-p-text(10 min)', { visible: true })).click();
await sleep(1200);
await click("I'm ready");
await sleep(6500);
await stop();
// ... then the walk, recorded at 8x speed: 250 m at a brisk 3.4 m/s.
await start('walk');
for (let i = 0; i < 8; i++) {
  await sleep(10000);
  await walkTo(34);
}
await sleep(3000);
await stop();

// --- story: airplane mode, describe the find, Sprig thinks, Gemma writes on the phone.
await page.setOfflineMode(true);
await start('story');
await sleep(800);
await click('I found it!');
await sleep(1800);
await page.type('#discovery', 'a chalk heart drawn on the pavement', { delay: 55 });
await sleep(600);
await click('Tell the atlas');
mark('storyThinking');
await page.waitForSelector('.provenance', { timeout: 120000 });
mark('storyWritten');
await sleep(5200);
await stop();
const provenance = await page.$eval('.provenance', (e) => e.innerText);

// --- complete: cliffhanger, finish, celebration (+ level up), journal card.
await click('Continue');
await sleep(1500);
await start('complete');
await click('Finish chapter');
await page.waitForSelector('.trophy');
await sleep(4200);
const levelUp = Boolean(await page.$('.levelup'));
if (levelUp) {
  await sleep(2600);
  await click('Yes!');
}
await sleep(800);
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
await sleep(3000);
await stop();

// --- quest: back home, quest map, journal, badges.
await start('quest');
await click('Done');
await sleep(1600);
await click('Quest');
await sleep(2600);
await click('Journal');
await sleep(2200);
await click('Badges');
await sleep(2400);
await stop();

writeFileSync(path.join(root, 'demo/out/clips/marks.json'), JSON.stringify({ marks, provenance, levelUp, vo }, null, 2));
console.log(JSON.stringify({ marks, provenance, levelUp }, null, 2));
await browser.close();
