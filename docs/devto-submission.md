---
title: "Outward: an adventure story that only moves forward when you go outside"
published: false
tags: devchallenge, hf26challenge, opensource, ai
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

**Outward** is a story game you can't play from the sofa. You are the main character of an adventure, and the next chapter only unlocks when you go outside, finish a small real-world mission, and tell the story what you found.

> *"The Archivist needs something the city has forgotten. Walk for ten minutes and find a mark someone left on purpose."*

You pick 10, 30 or 60 minutes, put the phone in your pocket, and walk. When you've actually covered the distance (250 m, 700 m or 1.4 km, tracked by GPS), Outward wakes up and asks what you found: *"a chalk heart drawn on the pavement."* A small language model **running on your phone** writes that chalk heart into the next part of the story, ends on a cliffhanger, and the chapter is done. Your find goes into a field journal, and Sprig, a small leaf-sprout companion, celebrates with you.

It's for anyone whose screen time has quietly crept past their outside time, including me. Most "go outside" apps use guilt (streaks, step counts, red rings). Outward uses curiosity instead: you go outside because you want to know what happens next, and the story can't happen without something you saw with your own eyes.

Three things I cared about:

1. **The story is really about your walk.** Every chapter is written around *your* discovery, not picked from a list. The puddle, the cat on the wall and the chalk heart become plot.
2. **Phone in pocket, not in hand.** During a mission the screen tells you to put it away. There's no map to stare at and no feed. The app counts *screen-off* time as a good thing.
3. **It works with no signal.** After one install, the whole thing runs in airplane mode: the storyteller model, voice-to-text, narration and safety rules. Parks, trails and basements don't break it.

> **Two partners, two jobs:**
>
> 🧠 **Tinker trains the brain.** I fine-tuned Qwen3.5-4B on Tinker and distilled it into a 241 MB Gemma that writes almost as well as its 4B teacher (4.75 vs 4.79). Total cost: **$2.56**.
>
> 🚚 **Render delivers it.** One Render service ships the app, the model weights and new story seasons to every phone, with the browser headers that make on-device AI fast and a guardrail on bandwidth cost. After that, the phone needs no internet at all.

<!-- SCREENSHOT: Home screen with Sprig + "Start Adventure" -->
<!-- SCREENSHOT: Mission card ("Put your phone away") -->
<!-- SCREENSHOT: The continuation with the "Written on this phone" provenance line -->

## Demo

{% embed https://youtu.be/ah1n-Uxp8ik %}

🔗 **Live on Render:** https://outward-6fhh.onrender.com (install it as an app from the browser menu)

🩺 **Live server status:** https://outward-6fhh.onrender.com/api/health (deployed commit, model ready on the Render disk, bandwidth used this month)

What to try:

- **Open it once on Wi-Fi.** The setup screen "packs your bag": it downloads the 241 MB storyteller and the 44 MB voice model, then tells you it's safe to go offline.
- **Turn on airplane mode** and start Chapter 1. Everything still works.
- **No time to walk right now?** *Settings → Practice mode* skips the walking check so you can see the whole loop at your desk. (Real chapters do want the walk.)
- **Settings → Diagnostics** shows which model is installed, tokens per second on your phone, and the last chapters it wrote.

In the video, the chapter after "a chalk heart drawn on the pavement" is written live with the network switched off, in about 2–3 seconds.

## Code

{% github 452Harsh/outward %}

A monorepo: `/app` (the PWA), `/server` (Render), `/training` (Tinker fine-tune, distillation and evals), `/content` (stories, safety rules, prompts and the model registry). It's MIT licensed, with the Gemma weights under Gemma Terms.

## How I Built It

The core problem: **a good storyteller is a 4B model, but a phone in a park needs something about 15× smaller that never calls home.** So I used open-weight models end to end: I trained a teacher in the cloud, distilled it into a tiny student, and shipped the student to the phone.

```
                       ┌──────────── TRAINING (one-off, ~$2.56) ────────────┐
 648 hand-checked  ──► │ Qwen3.5-4B ──LoRA on Tinker──► Teacher v3          │
 seed chapters         │                                   │                │
                       │                     2,500 prompts × 3 samples      │
                       │                     rubric + safety filter         │
                       │                                   ▼                │
                       │        3,186 examples ──► Gemma 3 270M (Kaggle)    │
                       │                           full fine-tune ► GGUF Q4 │
                       └───────────────────────────────────┬────────────────┘
                                                           ▼
  Render (Starter, Singapore)                 Phone (offline after install)
  ┌──────────────────────────┐   one-time    ┌───────────────────────────────┐
  │ Fastify: PWA + /models   │──download────►│ Preact PWA + Service Worker   │
  │ 1 GB disk, HF fallback   │               │ wllama (llama.cpp → WASM)     │
  │ /api/packs (new seasons) │               │ Whisper tiny.en (ONNX, WASM)  │
  └──────────────────────────┘               │ Safety filter (JS)            │
                                             │ GPS walk gate · IndexedDB     │
                                             └───────────────────────────────┘
```

### Open-source AI

| Role | Model / tool | Where it runs |
|---|---|---|
| Teacher storyteller | **Qwen3.5-4B** + LoRA r32 | **Tinker** (training + sampling) |
| On-device storyteller | **Gemma 3 270M**, distilled, Q4_0 GGUF (241 MB) | The phone, via **wllama** (llama.cpp WASM, WebGPU or CPU) |
| Optional bigger model | Gemma 3 1B QAT Q4_0 (720 MB) | The phone, downloaded from Hugging Face |
| Voice → text | **Whisper tiny.en** int8 (44 MB) | The phone, via **Transformers.js** + ONNX Runtime WASM in a worker |
| Student training | Hugging Face **TRL** SFT | Kaggle notebook (free GPU) |
| Conversion | **llama.cpp** `convert_hf_to_gguf` + `llama-quantize` | My Mac |
| App, model and story delivery | Fastify + persistent disk | **Render** (Starter, Singapore) |

### Step 1: Fine-tune the teacher on Tinker

Base Qwen3.5-4B already writes decent prose. The problem is that it **ignores the player**: it mentions your discovery and then carries on with its own plot. In a story whose whole point is "you shaped this," that's the main failure.

I wrote 648 seed chapters, built a 5-point rubric (uses the discovery, coherent, steers the plot, safe, length), and trained a LoRA with per-epoch checkpoints. I picked the checkpoint by validation loss after my first run overfit. Results on 50 held-out prompts × 3 samples:

| | Base Qwen3.5-4B | Fine-tuned (v3) |
|---|---|---|
| Rubric score (/5) | 4.66 | **4.79** |
| Coherent | 93% | **99%** |
| **Discovery actually steers the plot** | 6% | **39%** |
| Length | 93 words | 82 words (closer to target) |

Steering went from 6% to 39%, about **6.5×** better on the property the game depends on. It also held up on a separate dev set (12% → 30%). To be honest about it: the safety checker flagged slightly more outputs (4 → 6), and every one of those came from the player's own words being quoted back, not from anything the model made up.

### Step 2: Distil it into something a phone can run

A 4B model doesn't belong in a browser tab on a phone. The teacher generated 2,500 prompts × 3 samples. Each sample was scored by the rubric and the safety filter, leaving **3,186** good examples. I then full-fine-tuned **Gemma 3 270M** on them in a Kaggle notebook and quantised it to Q4_0 GGUF.

| Same 50 eval prompts | Score (/5) | Unsafe flags | Steers plot |
|---|---|---|---|
| Stock Gemma 3 270M | 2.55 | 27 | — |
| Stock 270M + my best one-shot prompt | 3.66 | 6 | 17% |
| **Distilled Outward student (270M)** | **4.75** | **2** | **44%** |
| Teacher (4B, cloud) | 4.79 | 6 | 39% |

**A 270M model at 241 MB comes within 0.04 points of its 4B teacher.** It writes a chapter in **2–3 seconds** on-device (≈53 tokens/s on CPU) at zero cost per chapter. It also wrote a good chapter for a story season it never saw in training.

**Total Tinker spend for the whole project: $2.56.**

### Step 3: Keep it safe outdoors

A game that sends people outside has to be careful about *where*. Missions never ask for roads, water edges, strangers, private property, climbing or the dark. Safety rules live in one `rules.json` that both a **JavaScript filter (on the phone)** and a **Python filter (in training)** use. A shared test file of cases keeps them in sync, and CI fails if they disagree. The filter also checks everything the model writes: it must use the discovery, stay on length, not copy the example or echo the prompt, and not talk about being an AI. If an output fails, the player gets a hand-written fallback instead. The app shows which one you got ("Written on this phone" vs "Pre-written").

### Step 4: Render, the runtime that gets AI onto the phone

An on-device model still has to *reach* the device: 241 MB of weights, a WASM runtime that needs special browser headers, and new stories after launch. **Render is that delivery layer.** It's one Node service (Fastify) on the Starter plan in Singapore, the closest region to me in India, deployed from a single [`render.yaml`](https://github.com/452Harsh/outward/blob/main/render.yaml) Blueprint.

```
 git push ──► Render build (npm ci && npm run build) ──► health check /api/health
                                                              │
 content/models.json ──(pinned HF revision)──► boot sync ──► 1 GB disk /var/data/models
                                                              │
 phone ◄── PWA + COOP/COEP ◄── /models/<id>/<version>/…gguf ◄─┤  (over budget → 302 to Hugging Face)
       ◄── /api/packs + /packs/<id>/audio/*.mp3 (new seasons)◄┘
```

What Render does, and why each part matters:

1. **It makes fast on-device inference possible.** Every response carries `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`. That *cross-origin isolation* unlocks `SharedArrayBuffer`, which llama.cpp's WASM build needs to run on several CPU threads. Without these two headers, the phone's storyteller falls back to a single thread. A plain static host where you can't set headers wouldn't have worked.
2. **The persistent disk is the model store.** On boot, the server reads `content/models.json`, downloads the exact pinned Hugging Face revision of the student model to the 1 GB disk (as a `.part` file, size-checked, then renamed), and deletes old versions so the disk never fills. **Shipping a better model is just a registry entry and a `git push`:** Render rebuilds, the disk syncs, and phones see a new versioned URL.
3. **Caching is designed for an offline app.** Model files and hashed assets are served `immutable` for a year, so a phone never downloads 241 MB twice. `index.html` and the service worker are `no-cache`, so app updates still reach installed phones.
4. **Costs have a guardrail.** The server counts model bytes it sends each month. After `MODEL_BANDWIDTH_BUDGET_GB` (60 GB), `/models/*` answers with a 302 redirect to the identical file on Hugging Face. The app also tries Render first and falls back to Hugging Face by itself. Hosting stays at about **$7.25/month**, and 100 installs come to roughly **$11**. The worst case is capped instead of open-ended.
5. **New story seasons arrive without an app update.** `/api/packs` lists approved story packs, and their ElevenLabs narration is served from content-hashed URLs. The app picks them up and caches them for offline play. That's how Season 2 (*The Second Atlas*) shipped.
6. **No secrets on the server.** Render never runs a model and holds no API keys. Tinker and ElevenLabs are only used in the offline story factory on my Mac. If someone breaks into the server, there's nothing to steal and no bill to run up.

It's live, and you can check it yourself:

```
$ curl https://outward-6fhh.onrender.com/api/health
{"ok":true,"commit":"475692a","app":true,
 "models":[{"id":"outward-gemma3-270m","version":"distilled-v1-133f250","ready":true}],
 "bandwidth":{"month":"2026-10","gb":0,"budgetGB":60},"packs":["second-atlas"]}
```

I deliberately **didn't** run the model on Render. A cloud model would need a connection on every walk and would see every user's location. Here, Render does the job a server is good at: shipping, versioning, updating and guarding the cost. The phone does the thinking.

### Step 5: Voice, story seasons and CI

- **ElevenLabs** narrates the fixed story text (George, as *the Archivist*). The clips are rendered once and cached for offline use, about 2.4 MB in total. The model's live text is read by the phone's own voice, with karaoke-style captions and Sprig's mouth synced to the audio.
- **New seasons:** a "story factory" on my Mac takes a human-written plot outline, drafts prose with Qwen on Tinker, applies my edits, renders narration, and only publishes a pack after I approve it. Season 2 (*The Second Atlas*) cost **$0.007** in Tinker credits.
- **GitHub Actions** runs lint, the safety-parity tests, app and server tests, the build and the Python tests on every push.
- **Install size:** 311 MB total (model 241, Whisper 44, runtimes 24, narration 2.4, app 0.1).

## Why Does Open Innovation Matter?

Because the whole idea doesn't work with a closed API.

**"Go outside" and "needs a connection" don't go together.** The moments Outward is built for (a trail, a park, a basement café, a country with expensive roaming) are exactly where cloud APIs fail. Open weights mean the storyteller travels *with* you. After one download it belongs to you: no rate limit, no outage, no key in the client, and no bill that grows with every walk.

**Privacy isn't a setting here; it comes from where the model runs.** Outward knows where you walk and what you noticed. With a hosted model, every chapter would send your location and your words to someone else's server. Here, the walk, the voice recording and the story never leave the phone.

**Open weights let me change the model, not just the prompt.** The biggest jump in quality didn't come from prompt engineering (stock 270M with my best prompt reached 3.66). It came from fine-tuning a teacher on Tinker and distilling it into a 270M student (4.75). You can only do that when you can touch the weights. With a closed API I'd have been stuck asking a model 15× bigger, over the network, to please pay more attention to the chalk heart.

**Open weights are weights I'm allowed to host.** Because Gemma and my distilled student can be redistributed, the model sits on *my* Render disk, versioned next to the app that uses it and cached forever on the phone. A closed model can't be downloaded at all, let alone hosted on a $7 server and carried into a park.

**And it was cheap enough for one person in a week.** Qwen and Gemma weights, llama.cpp, wllama, Whisper, Transformers.js, ONNX Runtime and TRL are all open. The cloud cost of training both models was **$2.56**. Everything I trained is published too: the student weights are on Hugging Face, and the training scripts, evals, rubric and safety rules are in the repo, so someone else can build *their* outdoor story on top of it.

## My Agent Session

I built Outward with **Claude Code** as my pair programmer. It helped with everything from the Tinker training loop and the eval rubric to the wllama integration, the safety-filter parity tests and the demo-video tooling. I made the product, cost and account decisions; it helped with the implementation and the debugging. One example: it found that the stock 270M "passed" my first rubric by copying the example story word for word, which is why the `copies_example` and `echoes_prompt` checks exist.

<!-- Embed your DevRelay session here, e.g. {% agent_session YOUR_SESSION_ID %} (check the exact tag on the challenge page), or link to it. Delete this section if you don't save one. -->

## Prize Categories

- **Best Use of Tinker:** Qwen3.5-4B LoRA fine-tune on Tinker. The plot-steering rate went from 6% to 39% over base, the teacher was distilled into a 270M on-device student that scores 4.75 vs the teacher's 4.79, and the whole project cost $2.56.
- **Best Use of Render:** Render is the runtime that delivers on-device AI, deployed from one `render.yaml` Blueprint. It hosts the AI app's front end with the cross-origin isolation headers that multithreaded llama.cpp WASM needs. It keeps the versioned model weights on a persistent disk that syncs from a pinned Hugging Face revision on boot. A monthly bandwidth budget redirects to Hugging Face once it's used up, and new story seasons ship through `/api/packs`. A live `/api/health` endpoint shows the deployed commit, model readiness and bandwidth use.

<!-- Qualcomm: only add this if the category's requirements (truncated on the challenge page) fit an app tested on a Snapdragon phone (Realme P4 Pro, Adreno GPU, WebGPU). -->
