# YouTube upload: Outward demo

**File:** `demo/out/outward-demo.mp4` (2:06, 1920×1080)
**Thumbnail:** `demo/out/outward-thumbnail.png` (1280×720, rebuild with `node demo/thumbnail.mjs`)
**Subtitles:** `demo/out/outward-demo.srt` (Subtitles → Upload file → With timing, English)

## Title

```
Outward: A Story Game That Only Moves When You Walk Outside (On-Device AI, Works Offline)
```

Shorter alternative (fits search results better):

```
I Built a Story Game You Can Only Play Outside | Offline AI on Your Phone
```

## Description

```
Outward is an adventure story that only moves forward when you go outside. Pick a 10-minute mission, put your phone in your pocket, walk, and tell the story what you found. A tiny open-weight AI model running on your phone writes your discovery into the next chapter in about 2 seconds, with no internet.

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass.

🔗 Try it: https://outward-6fhh.onrender.com
💻 Code: https://github.com/452Harsh/outward
📝 Write-up: YOUR_DEV_POST_URL

How it works
• Qwen3.5-4B fine-tuned on Tinker as the "teacher" storyteller: the player's find actually changed the plot 39% of the time, vs 6% for the base model
• Distilled into Gemma 3 270M (241 MB): it scores 4.75/5 vs 4.79 for its 4B teacher, and runs on the phone with llama.cpp (wllama, WebGPU/WASM)
• Whisper tiny.en for voice input, also on the phone
• ElevenLabs narration (cached for offline use)
• Shared safety rules for every mission and every generated line
• Hosted on Render; fully offline after one install
• Total Tinker training cost: $2.56

Chapters
0:00 What is Outward
0:18 Meet Sprig + ElevenLabs narration
0:36 The mission and the walk
0:56 Offline: the phone writes the story
1:10 Outside time vs screen time, XP and badges
1:21 Quest map and journal
1:33 Open models and results
2:00 Go find your story

#TouchGrass #OpenSourceAI #Hacktoberfest
```

## Tags

```
outward, touch grass, hacktoberfest, dev challenge, open source ai, on-device ai, offline ai, local llm, gemma 3, gemma 270m, qwen, tinker, fine-tuning, knowledge distillation, llama.cpp, wllama, webgpu, whisper, transformers.js, elevenlabs, render, pwa, walking game, screen time, ai storytelling
```

## Settings

- Audience: not made for kids. (The app is for everyone, but "made for kids" disables comments and other features.)
- Category: Science & Technology
- Visibility: **Unlisted** is enough for the DEV embed; choose Public if you want views.
- Language and caption language: English
