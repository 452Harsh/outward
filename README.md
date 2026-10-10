# Outward

**Your story happens outside.**

Outward is an installable web app (PWA) that turns a walk into an adventure. You are the main character. The story moves forward only when you go outside and complete real-world missions, like *"find something that flows."* You describe what you found, and a small open-weight model running **on your phone** weaves it into the story.

After one install, it works fully offline: no signal needed, and nothing about your location, voice or walks leaves the phone.

> **Status:** Phase 4 of 8. The offline PWA, the 5-chapter story, an on-device Gemma 3 270M storyteller and on-device voice input (Whisper) work in airplane mode, along with walking-gated missions, a drawn walk path and screen-time stats. The fine-tuning pipeline comes next (see [Roadmap](#roadmap)).

## On-device AI

| | |
|---|---|
| Runtime | [wllama](https://github.com/ngxson/wllama) (llama.cpp → WebAssembly). Uses WebGPU when available, multi-threaded CPU otherwise |
| Default model | Gemma 3 270M, QAT Q4_0 GGUF, **241.4 MB** |
| Optional upgrade | Gemma 3 1B, QAT Q4_0 GGUF, **720.4 MB**, always from Hugging Face, needs WebGPU (Settings → Storyteller) |
| Model source | Hugging Face during development. Demo build (`VITE_MODEL_SOURCE=render`): Render first, Hugging Face as fallback |
| Caching | OPFS, keyed by a versioned URL. A phone re-downloads only when `content/models.json` changes. One model per phone |
| Fallback | If there's no model, generation fails, takes over 30 s, or fails the safety/quality checks, a pre-written continuation is used |
| Voice in | Whisper tiny.en (int8, 43.5 MB) via Transformers.js on the CPU, in a worker. Recording and transcription never leave the phone |
| Voice out | Fixed narration: ElevenLabs clips (64 kbps mono) through one audio player with lock-screen controls. Model-written text: the device voice. Clips not generated yet fall back to the device voice |

Run `npm run size` after a build for the install size by part.

## Outside time

| | |
|---|---|
| Walking gate | "I found it" opens after the chapter's distance for the chosen time: 250 m (10 min), 700 m (30 min), 1,400 m (60 min) |
| GPS | Tracked while the screen is on. After a screen-off gap, one fresh fix adds the straight-line distance (drawn dashed). Fixes with accuracy over 50 m or speed over 4 m/s are ignored |
| No GPS | If no usable fix arrives (e.g. a laptop), time outside counts instead: 5 / 12 / 25 min |
| Practice mode | Settings toggle for indoor demos. No walk needed; not counted in stats or streaks |
| Screen time | Page Visibility API: time Outward is visible vs total chapter time, shown as "% phone-free" |
| Walk path | Canvas drawing from GPS points; no map tiles, nothing leaves the phone |
| Streak | Consecutive days with a finished (non-practice) chapter |

## Repo layout

| Path | What |
|---|---|
| `app/` | Vite + Preact PWA (service worker, IndexedDB, screens, story engine) |
| `server/` | Fastify server on Render: serves the PWA, model weights from the persistent disk, and (phase 7) the story factory API |
| `content/` | Story, missions, safety note, safety rules + filter, model system prompt |
| `training/` | Dataset, Tinker teacher fine-tune, distillation, Gemma student, eval, export (phase 5+) |
| `docs/` | Cost estimates, demo script, write-up |
| `licenses/` | Third-party license texts (Gemma Terms of Use) |

## Run locally

Requires Node 22+ (Node 24 recommended; see `.node-version`).

```bash
npm install
npm run dev            # Vite dev server at http://localhost:5173 (no offline caching in dev)
```

To test the real offline PWA (production build, Hugging Face as the model source):

```bash
npm run build
npm start              # http://localhost:10000
```

Open it once, finish Setup, then switch to airplane mode (or turn on DevTools → Network → Offline) and reload. It keeps working.

To test on a phone on the same Wi-Fi, use an HTTPS tunnel. Service workers and geolocation need HTTPS everywhere except `localhost`.

For the demo build that serves the 270M model from Render:

```bash
VITE_MODEL_SOURCE=render npm run build
```

### On the phone

**Settings → Diagnostics** shows WebGPU support, the GPU adapter, `deviceMemory`, and whether multi-threading is available. It also runs a GPU-vs-CPU speed benchmark.

**Settings → Screen-off field test** logs what keeps working with the phone locked in a pocket: GPS, timers, background audio, speech and generation. Use **Copy full log** to share the results.

### Narration (ElevenLabs)

```bash
node scripts/narration.mjs          # dry run: clips, characters, credits; spends nothing
node scripts/narration.mjs --yes    # generate missing/changed clips into app/public/audio
```

This needs `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env` (current voice: George, "Warm, Captivating Storyteller", `eleven_multilingual_v2`). Clip file names hash the voice, model and text, so only changed clips are regenerated. The key is used only by this script, never in the app.

### Keep keys out of Git

```bash
cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

This blocks commits of `.env`, and of any change that looks like an API key. Keys go only in `.env`, never in `.env.example`.

### Checks

```bash
npm run lint
npm test               # safety filter, story engine, server
npm run test:safety    # only the mission safety filter tests
npm run check          # lint + test + build (same as CI)
```

## Deploy to Render

1. Push this repo to GitHub.
2. In Render, go to **New → Blueprint** and select the repo. `render.yaml` creates a single **Starter web service** in Singapore with a **1 GB persistent disk** mounted at `/var/data`. On boot, the server downloads the 270M model from Hugging Face onto the disk; `/api/health` shows when it's ready.
3. Read [docs/render-costs.md](docs/render-costs.md) first. This creates paid resources (about $7.25/month fixed, plus bandwidth). Once `MODEL_BANDWIDTH_BUDGET_GB` (60) is served in a month, model downloads redirect to Hugging Face.
4. Once it's live, open the `onrender.com` URL on your phone and choose **Add to Home Screen**.

Model weights are never stored in Git. The server pulls them from Hugging Face onto the Render disk.

## Safety

Missions never involve trespassing, roads or traffic, entering water, climbing, touching or eating wild plants or animals, approaching strangers, or going out alone at night.

- `content/safety/rules.json` holds the shared rules. The app, the story factory and the Python training pipeline all use the same file.
- `content/safety/filter.js` is the output filter, with negation handling: *"never step into the water"* passes, while *"why not wade into the stream?"* is flagged.
- All shipped story text is checked by the filter in CI.
- Users see a safety note on first launch.

## Reproduce the training pipeline

*Coming in phases 5–6.* Scripts will live in `training/`: seed dataset → eval set and rubric → Tinker LoRA on Qwen3.5-4B (teacher) → distillation → Gemma 3 270M (and 1B) student → GGUF export.

## Roadmap

1. ✅ Offline PWA on Render with static story and missions
2. ✅ On-device Gemma 3 270M (wllama, WebGPU/CPU) writing continuations, plus a field-test lab
3. ✅ Voice in (Whisper, on-device) and out (ElevenLabs narration, 16 clips, 5.1 min, + device voice)
4. ✅ GPS walk path, walking-gated missions, screen-time tracking, streaks
5. Tinker teacher fine-tune + eval
6. Distillation → Gemma student → swap into the app
7. Story factory on Render + Sentry Agent Tracing
8. Write-up and demo

## License

Code: MIT ([LICENSE](LICENSE)). Model weights: Gemma Terms of Use. See [NOTICE](NOTICE) and [MODEL_LICENSE.md](MODEL_LICENSE.md).
