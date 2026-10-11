// Builds the YouTube thumbnail (1280x720 PNG) from the demo recording and Sprig.
//
//   node demo/thumbnail.mjs   ->   demo/out/outward-thumbnail.png
//
// Needs demo/out/clips/story.mp4 from demo/record.mjs.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'demo/out');
const screen = path.join(OUT, 'thumb-screen.png');
// The finished continuation: model text plus "Written on this phone in 2.3 s".
execFileSync('ffmpeg', ['-y', '-v', 'error', '-sseof', '-1.5', '-i', path.join(OUT, 'clips/story.mp4'), '-frames:v', '1', screen]);

// Sprig's styles and SVG come straight from the video cards, so it matches the app.
const cards = readFileSync(path.join(root, 'demo/cards.html'), 'utf8').split('\n');
const sprigCss = cards.slice(69, 196).join('\n');
const sprigSvg = cards.slice(198, 276).join('\n');
const fonts = pathToFileURL(path.join(root, 'app/src/assets/fonts')).href;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Baloo 2'; src: url('${fonts}/baloo-2.woff2') format('woff2'); font-weight: 400 800; }
@font-face { font-family: 'Atkinson'; src: url('${fonts}/atkinson-hyperlegible-next.woff2') format('woff2'); font-weight: 200 800; }
:root { --forest: #1f6b4a; --leaf: #49b86e; --sunrise: #ff7a2f; --amber: #ffc23d; --sky: #38a3e8; --ink: #17251f; --bg: #fff8ec; --line: #e6dcc6; --muted: #5b6b62; }
* { box-sizing: border-box; }
html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: var(--bg); color: var(--ink); font-family: 'Atkinson', sans-serif; }
.glow { position: absolute; border-radius: 50%; }
.glow.a { width: 900px; height: 900px; right: -300px; top: -260px; background: radial-gradient(circle, color-mix(in srgb, var(--amber) 60%, transparent), transparent 65%); }
.glow.b { width: 700px; height: 700px; left: -320px; bottom: -380px; background: radial-gradient(circle, color-mix(in srgb, var(--sky) 26%, transparent), transparent 65%); }
.trail { position: absolute; left: 0; bottom: 0; width: 1280px; height: 200px; }
.copy { position: absolute; left: 56px; top: 54px; width: 720px; }
.pill { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 26px; padding: 10px 22px; border-radius: 999px; background: var(--forest); color: #fff; }
h1 { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 118px; line-height: .86; margin: 26px 0 0; letter-spacing: -.01em; }
h1 em { font-style: normal; color: var(--sunrise); }
.brand { position: absolute; left: 60px; bottom: 44px; font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 54px; color: var(--forest); }
.brand span { font-family: 'Atkinson', sans-serif; font-weight: 700; font-size: 24px; color: var(--muted); margin-left: 12px; }
.sprig-wrap { position: absolute; left: 440px; top: 316px; width: 230px; }
.phone { position: absolute; right: 70px; top: 40px; width: 318px; height: 660px; border-radius: 46px; background: var(--ink); padding: 14px; transform: rotate(4deg); box-shadow: 0 26px 50px rgba(23,37,31,.25); }
.phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 34px; display: block; }
.sticker { position: absolute; right: 200px; bottom: 96px; transform: rotate(-5deg); background: var(--sunrise); color: #1b1206; font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 34px; line-height: 1; padding: 16px 24px; border-radius: 22px; border: 5px solid #fff; box-shadow: 0 14px 30px rgba(23,37,31,.22); }
.sticker small { display: block; font-family: 'Atkinson', sans-serif; font-weight: 700; font-size: 20px; margin-top: 6px; }
${sprigCss}
.sprig *, .sprig { animation: none !important; }
</style></head><body>
<div class="glow a"></div><div class="glow b"></div>
<svg class="trail" viewBox="0 0 1280 200" aria-hidden="true"><path d="M-20 170 C220 90 380 190 600 130 S960 40 1300 110" fill="none" stroke="var(--line)" stroke-width="18" stroke-linecap="round" stroke-dasharray="3 34"/></svg>
<div class="copy">
  <span class="pill">✦ AI that runs on your phone, offline</span>
  <h1>Walk outside to <em>unlock</em> the story</h1>
</div>
<div class="sprig-wrap">${sprigSvg.replace('data-state="idle"', 'data-state="celebrating"')}</div>
<div class="brand">Outward<span>Touch Grass · open-source AI</span></div>
<div class="phone"><img src="${pathToFileURL(screen).href}"></div>
<div class="sticker">Written on this phone<small>in 2.3 s · no internet</small></div>
</body></html>`;
const page = path.join(OUT, 'thumbnail.html');
writeFileSync(page, html);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--allow-file-access-from-files'] });
const tab = await browser.newPage();
await tab.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' });
await tab.evaluate(() => document.fonts.ready);
await tab.screenshot({ path: path.join(OUT, 'outward-thumbnail.png') });
await browser.close();
console.log('demo/out/outward-thumbnail.png');
