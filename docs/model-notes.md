# Storyteller model notes

Running log of measured results. Baselines go here before fine-tuning, so phases 5–6 can show the improvement.

## Stock Gemma 3 270M (QAT Q4_0, 241.4 MB): 2026-10-10

Setup: wllama 3.8.1, headless Chrome on the dev Mac (Apple GPU through WebGPU). **Not the test phone.** Phone numbers come from Settings → Diagnostics.

**Speed (Mac):** load 1.0–1.6 s from OPFS; prompt ~795 tok/s; writing ~43 tok/s on both GPU and CPU (4 threads). A continuation takes 1.4–2.9 s.

**Usable output:** 12 generations per prompt (5 chapters, 6 discoveries × 2 runs), scored with `acceptContinuation`:

| Prompt | Used as-is | Main reasons rejected |
|---|---|---|
| Few-shot (1 example), shipped | **5/12 (42%)** | copies the example (4), echoes the prompt (2), ignores the discovery (1) |
| Zero-shot | 4/12 (33%) | echoes the prompt (6), too long (1), ignores the discovery (1) |

Rejected outputs fall back to the pre-written continuation, so the story never stalls. Accepted outputs are fluent but generic, and sometimes call the Archivist "he".

**Target for the distilled student:** 80% or more used as-is, with no copying or echoing, and the Archivist's voice consistent with the story.
