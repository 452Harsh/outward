# Render cost estimate

Prices checked 2026-10-10 against render.com/docs. Budget: **$50 Render credit**. Workspace: **Hobby**. Region: Singapore.

## Line by line (plan as of phase 2)

| Item | Price | Monthly |
|---|---|---|
| Web service, Starter (no sleeping; serves PWA, models, story factory) | $7/month | $7.00 |
| Persistent disk, 1 GB (270M model + audio) | $0.25/GB/month | $0.25 |
| Hobby workspace fee | $0 | $0.00 |
| Bandwidth: first 5 GB | included | $0.00 |
| Bandwidth beyond 5 GB | $0.15/GB | see below |

## Why the first estimate was ~$17, not $8–10

The gap was **all model-download bandwidth**, not hosting. The PWA itself is about 60 KB.

A free static site would not have helped. Static-site bandwidth counts against the same 5 GB workspace allowance.

The earlier plan served the 602 MB Gemma 3 1B from Render to every install: 100 installs × 0.65 GB ≈ 65 GB, which means 60 GB billed, or **$9.00**.

## With the new model plan

- **During development**, weights load from Hugging Face, so Render bandwidth is about 0.
- **The 1B upgrade** always downloads from Hugging Face, so Render bandwidth is 0.
- **The demo build** serves the default install from Render: Gemma 3 270M plus Whisper tiny plus audio, about **0.32 GB per install**.

| Scenario (hackathon month) | Render bandwidth | Bandwidth cost | Total (5 GB disk) | Total (1 GB disk) |
|---|---|---|---|---|
| Development only | ~0 GB | $0.00 | $8.25 | $7.25 |
| Demo + ~100 installs from Render | ~32 GB | $4.05 | **$12.30** | **$11.30** |
| Shared publicly, 300 installs | ~96 GB | $13.65 | $21.90 | $20.90 |
| Ceiling at $50 | ~283 GB | | ~880 installs | |

## Optional cuts that don't hurt the demo

1. ✅ **Disk 5 GB → 1 GB (saves $1/month)** is applied in `render.yaml`. The server keeps only the current model version on it.
2. **Serve Whisper from Hugging Face even in the demo build (saves ~$0.6 per 100 installs).** Only the Gemma student comes from Render, which is the part that matters for the Render story.
3. **Bandwidth guardrail (phase 2):** after `MODEL_BANDWIDTH_BUDGET_GB` (default 60) is served in a month, `/models/*` redirects to the Hugging Face mirror. This caps the bandwidth cost at about $8.25.

Tinker, ElevenLabs and Sentry are billed separately and tracked in `training/COSTS.md`.
