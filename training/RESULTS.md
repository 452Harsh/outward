# Results

## Phase 5: Teacher fine-tune (Tinker, Qwen3.5-4B LoRA)

**Final eval:** 50 held-out prompts × 3 samples = 150 generations each, temperature 0.7. The same task prompt (`content/prompts/task.json`) and the same automatic rubric (`02_eval/rubric.py`, v2) are used for both models. The model was chosen on a separate dev set, never on this eval set.

| Metric | Base Qwen3.5-4B | Fine-tuned teacher (v3) |
|---|---|---|
| Rubric score (0–5) | 4.66 | **4.79** |
| (a) Uses the discovery | 100% | 100% |
| (b) 60–120 words | 100% | 99% |
| (c) Safe and outdoors (risky finds must be steered away from) | 76% | **85%** |
| (d) Coherent (second person, in-story, no echo or repeats) | 93% | **99%** |
| (e) Passes the safety filter | 97% | 96% |
| **Steers away on risky finds** (12 risky prompts × 3) | **6%** | **39%** |
| Average words | 93 | 82 |
| Safety-filter hits | 4 | 6 |

**About the safety-filter hits:** in both models, every hit is the model repeating the user's own words ("traffic flowing *on the highway*", "*feeding stray dogs* biscuits"), plus one false match in the base model ("scale of the roof"). Neither model gave an unsafe instruction. The fine-tuned teacher quotes the user's find more faithfully, which triggers the keyword filter more often. The app still treats these as fails and plays the pre-written continuation instead.

**Dev set** (model selection; 85 prompts, 80 of them risky, none in training):

| Model | Rubric | Steers away on risky finds |
|---|---|---|
| Base Qwen3.5-4B | 4.07 | 12% |
| Teacher v2 (408 seeds) | 4.25 | 28% |
| Teacher v3 (648 seeds, risk types balanced) | 4.27 | 30% |

**Honest takeaways**
- The fine-tune clearly fixes voice and format. It's coherent 99% of the time and always speaks to "you".
- It roughly triples steering away from risky finds (12% to 30% on dev, 6% to 39% on eval), but **it still doesn't steer most of the time**. A small LoRA on a 4B model learns this weakly.
- Distillation therefore filters teacher samples with the same rubric (best of N), so the student is trained only on outputs that steer. An optional RL round with the rubric as reward (phase 8) targets exactly this gap.

**Training details**
- LoRA rank 32, learning rate 5e-4 with linear decay, batch 16, 2 passes over the data.
- Checkpoint picked by the lowest validation loss (v3: pass 1, validation loss 1.24).
- v1, trained for 3 passes, overfit (validation loss 1.16 → 1.31) and was dropped.

**Seed data**
- 35 hand-written gold examples.
- Base Qwen expanded these into 2,776 candidate stories (from 1,092 generated discoveries), each scored by the rubric.
- 648 seeds kept: 5/5 only, risky finds capped at 30 per risk type across 8 risk types.
- Review sheet: `01_seed/seeds.review.csv`.

**Checkpoints (Tinker)**
- Teacher v3: `tinker://7f2f2de3-05d8-5a1c-80f9-fd4d181371e2:train:0/sampler_weights/teacher-v3-e1`

## Tinker cost

Every paid call is logged in `costs.jsonl` from token counts at Tinker's published Qwen3.5-4B prices.

| Step | Cost |
|---|---|
| Base evals (smoke, 50, dev, final ×3) | $0.05 |
| Seed generation (discoveries + 2,776 candidate stories) | $0.65 |
| Teacher training (smoke, v1, v2, v3) | $0.77 |
| Fine-tuned evals (v2, v3, dev ×2, final ×3) | $0.06 |
| **Phase 5 total** | **$1.53** |
