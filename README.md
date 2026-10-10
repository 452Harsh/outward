# Outward

**Your story happens outside.**

Outward is an installable web app (PWA) that turns a walk into an adventure. You are the main character. The story moves forward only when you go outside and complete real-world missions, like *"find something that flows."* You describe what you found, and a small open-weight model running **on your phone** weaves it into the story.

After one install, it works fully offline: no signal needed, and nothing about your location, voice or walks leaves the phone.

> **Status:** Phase 1 of 8. The offline PWA with the full 5-chapter story, safety system and Render deployment works. The on-device model, voice, GPS and the training pipeline come next (see [Roadmap](#roadmap)).

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

To test the real offline PWA:

```bash
npm run build
npm start              # http://localhost:10000
```

Open it once, finish Setup, then switch to airplane mode (or turn on DevTools → Network → Offline) and reload. It keeps working.

To test on a phone on the same Wi-Fi, use an HTTPS tunnel. Service workers and geolocation need HTTPS everywhere except `localhost`.

### Checks

```bash
npm run lint
npm test               # safety filter, story engine, server
npm run test:safety    # only the mission safety filter tests
npm run check          # lint + test + build (same as CI)
```

## Deploy to Render

1. Push this repo to GitHub.
2. In Render, go to **New → Blueprint** and select the repo. `render.yaml` creates a single **Starter web service** with a **5 GB persistent disk** mounted at `/var/data`.
3. Read [docs/render-costs.md](docs/render-costs.md) first. This creates paid resources (about $8.25/month fixed, plus bandwidth).
4. Once it's live, open the `onrender.com` URL on your phone and choose **Add to Home Screen**.

Model weights are never stored in Git. They are uploaded to the Render disk (phase 2) and mirrored on Hugging Face as a fallback.

## Safety

Missions never involve trespassing, roads or traffic, entering water, climbing, touching or eating wild plants or animals, approaching strangers, or going out alone at night.

- `content/safety/rules.json` holds the shared rules. The app, the story factory and the Python training pipeline all use the same file.
- `content/safety/filter.js` is the output filter, with negation handling: *"never step into the water"* passes, while *"why not wade into the stream?"* is flagged.
- All shipped story text is checked by the filter in CI.
- Users see a safety note on first launch.

## Reproduce the training pipeline

*Coming in phases 5–6.* Scripts will live in `training/`: seed dataset → eval set and rubric → Tinker LoRA on Qwen3.5-4B (teacher) → distillation → Gemma 3 1B student → WebLLM export.

## Roadmap

1. ✅ Offline PWA on Render with static story and missions
2. On-device Gemma 3 1B (WebLLM/WebGPU) writing continuations
3. Voice in (Whisper, on-device) and out (ElevenLabs narration + speechSynthesis)
4. GPS walk path, chapter unlocks, screen-time tracking, streaks
5. Tinker teacher fine-tune + eval
6. Distillation → Gemma student → swap into the app
7. Story factory on Render + Sentry Agent Tracing
8. Write-up and demo

## License

Code: MIT ([LICENSE](LICENSE)). Model weights: Gemma Terms of Use. See [NOTICE](NOTICE) and [MODEL_LICENSE.md](MODEL_LICENSE.md).
